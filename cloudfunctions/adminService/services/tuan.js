const { err } = require('../common/errors')
const { parseBJTime } = require('./_bjtime')
const { handleSuccess, handleError, ERROR_CODES, paginate, initCloud } = require('../common/utils')
const { createLogger } = require('../common/logger')
const { recordAlert } = require('../common/alert')
const { ORDER_TYPES, ORDER_TYPE_NAMES } = require('../constants')
const { enrichBuyerFields, enrichTuanOrderNos } = require('./_enrichBuyers')
const { TUAN_STATUS_MAP, LOGISTICS_ORDER_TRANSITIONS, validateTransition } = require('./stateMachine')
// 遗留修复：后台发货补微信物流推送（与 tuanService.shipTuanOrder 对齐）
const { uploadShippingInfo, traceWaybill, followWaybill } = require('../common/wxLogistics')
// 复用统一佣金写入器的口径工具，避免读侧与写侧再次漂移：
//   - pickRate：费率键别名（boarding ↔ hosting ↔ order）。线上
//     system_config.commission_rates 用的是 hosting 键，而 ORDER_TYPES 用
//     boarding，直接 config['boarding'] 取不到 → 团长结算页寄养费率恒显示 0
//   - normalizeOrderType：历史佣金文档 orderType 可能是 'hosting'/'group_buy'，
//     需规范化后再与 ORDER_TYPES（boarding/tuan）比较，否则老数据统计漏计
const { pickRate, normalizeOrderType, RATE_KEY_ALIASES } = require('../common/commission-utils')

const { db, cloud } = initCloud()
const _ = db.command
const logger = createLogger('adminService:tuan')

/** 佣金文档的订单类型是否归属于目标规范类型（兼容 hosting/group_buy 等历史别名） */
function commMatchesType(comm, type) {
  return normalizeOrderType(comm && comm.orderType) === type
}

/** 反查某规范类型对应的全部原始 orderType（含历史别名），用于 DB 查询过滤 */
function orderTypeAliases(orderType) {
  const canonical = normalizeOrderType(orderType)
  return RATE_KEY_ALIASES[canonical] || [canonical]
}

function hasTeamPermission(permissions) { return ['activity', 'tuan', 'hosting'].some(p => (permissions || []).includes(p)) }

const DEAL_FIELDS = {
  _id: true, title: true, coverUrl: true, description: true, images: true,
  products: true, startTime: true, endTime: true, status: true,
  totalOrders: true, totalAmount: true, createdBy: true, createdAt: true, updatedAt: true,
}

async function createTuanDeal(event, context, auth) {
  const { title, coverUrl, description, images, products, startTime, endTime } = event
  if (!title) {throw err('INVALID_PARAMS', '团购标题必填')}
  if (!products || products.length === 0) {throw err('INVALID_PARAMS', '至少添加一个团购商品')}
  const now = Date.now()
  const resolvedProducts = await Promise.all((products || []).map(async p => {
    const productId = p.productId || ''
    let name = p.name || ''
    let image = p.image || p.coverUrl || ''
    let skuType = p.skuType || 'single'
    let specGroups = p.specGroups || []
    let skus = p.skus || []

    if (Number(p.tuanPrice) < 0) {throw err('INVALID_PARAMS', '团购价格不能为负')}

    if (productId) {
      try {
        const prodRes = await db.collection('products').doc(productId).get()
        if (prodRes.data) {
          name = name || prodRes.data.name || prodRes.data.title || ''
          image = image || prodRes.data.images?.[0] || prodRes.data.coverUrl || ''
          skuType = prodRes.data.skuType || 'single'
          specGroups = prodRes.data.specGroups || []
          skus = (prodRes.data.skus || []).map(sku => ({
            skuId: sku.skuId,
            specIds: sku.specIds || {},
            specText: sku.specText || '',
            price: Number(sku.price) || 0,
            originalPrice: Number(sku.originalPrice) || Number(sku.price) || 0,
            stock: Number(sku.stock) || 0,
            tuanPrice: 0,
            tuanStock: 0,
            skuCode: sku.skuCode || '',
            image: sku.image || '',
            enabled: sku.enabled !== false,
            sold: 0,
          }))
        }
      } catch (e) { /* 商品库中找不到则使用传入值 */ }
    }

    if (skuType === 'multi' && skus.length > 0) {
      const inputSkuMap = {}
      if (p.skus && p.skus.length > 0) {
        for (const inputSku of p.skus) {
          if (inputSku.skuId) {inputSkuMap[inputSku.skuId] = inputSku}
        }
      }
      for (const sku of skus) {
        const inputSku = inputSkuMap[sku.skuId]
        if (inputSku) {
          if (inputSku.tuanPrice != null && Number(inputSku.tuanPrice) < 0) {throw err('INVALID_PARAMS', '团购价格不能为负')}
          if (inputSku.tuanStock != null && Number(inputSku.tuanStock) < 0) {throw err('INVALID_PARAMS', '团购库存不能为负')}
          sku.tuanPrice = Number(inputSku.tuanPrice) || 0
          sku.tuanStock = inputSku.tuanStock != null && Number(inputSku.tuanStock) > 0
            ? Number(inputSku.tuanStock) : sku.stock
        } else {
          sku.tuanPrice = Number(p.tuanPrice) || 0
          sku.tuanStock = sku.stock || 0
        }
      }
    }

      return {
        productId,
        name,
        image,
        skuType,
        specGroups,
        skus,
        originalPrice: Number(p.originalPrice) || 0,
        tuanPrice: skuType === 'multi' ? 0 : (Number(p.tuanPrice) || 0),
        stock: skuType === 'multi' ? skus.reduce((sum, s) => sum + (Number(s.tuanStock) || Number(s.stock) || 0), 0) : (Number(p.tuanStock) || Number(p.stock) || 0),
        sold: 0,
      }
  }))
  const data = {
    title, coverUrl: coverUrl || '', description: description || '', images: images || [],
    products: resolvedProducts,
    startTime: startTime ? new Date(startTime) : null,
    endTime: endTime ? new Date(endTime) : new Date('2099-12-31T23:59:59'),
    status: 'draft', totalOrders: 0, totalAmount: 0,
    createdBy: auth.openid, createdAt: new Date(now), updatedAt: new Date(now),
  }
  const res = await db.collection('tuan_deals').add({ data })
  return handleSuccess({ _id: res._id, ...data })
}

async function updateTuanDeal(event, context, auth) {
  const { id, title, coverUrl, description, images, products, startTime, endTime } = event
  if (!id) {throw err('INVALID_PARAMS', '缺少团购ID')}
  const existing = await db.collection('tuan_deals').doc(id).get()
  if (!existing.data) {throw err('NOT_FOUND', '团购不存在')}
  if (!auth.isSuperAdmin && !(auth.roles || []).includes('super_admin') && existing.data.createdBy !== auth.openid) {
    throw err('PERMISSION_DENIED', '无权操作他人资源')
  }
  const update = { updatedAt: new Date() }
  if (title !== undefined) {update.title = title}
  if (coverUrl !== undefined) {update.coverUrl = coverUrl}
  if (description !== undefined) {update.description = description}
  if (images !== undefined) {update.images = images}
  if (products !== undefined) {
    update.products = await Promise.all(products.map(async p => {
      const productId = p.productId || ''
      let name = p.name || ''
      let image = p.image || p.coverUrl || ''
      let skuType = p.skuType || 'single'
      let specGroups = p.specGroups || []
      let skus = p.skus || []

      if (productId) {
        try {
          const prodRes = await db.collection('products').doc(productId).get()
          if (prodRes.data) {
            name = name || prodRes.data.name || prodRes.data.title || ''
            image = image || prodRes.data.images?.[0] || prodRes.data.coverUrl || ''
            skuType = prodRes.data.skuType || 'single'
            specGroups = prodRes.data.specGroups || []
            skus = (prodRes.data.skus || []).map(sku => ({
              skuId: sku.skuId,
              specIds: sku.specIds || {},
              specText: sku.specText || '',
              price: Number(sku.price) || 0,
              originalPrice: Number(sku.originalPrice) || Number(sku.price) || 0,
              stock: Number(sku.stock) || 0,
              tuanPrice: 0,
              tuanStock: 0,
              skuCode: sku.skuCode || '',
              image: sku.image || '',
              enabled: sku.enabled !== false,
              sold: 0,
            }))
          }
        } catch (e) { /* 商品库中找不到则使用传入值 */ }
      }

      if (skuType === 'multi' && skus.length > 0) {
        const inputSkuMap = {}
        if (p.skus && p.skus.length > 0) {
          for (const inputSku of p.skus) {
            if (inputSku.skuId) {inputSkuMap[inputSku.skuId] = inputSku}
          }
        }
        for (const sku of skus) {
          const inputSku = inputSkuMap[sku.skuId]
          if (inputSku) {
            if (inputSku.tuanPrice != null && Number(inputSku.tuanPrice) < 0) {throw err('INVALID_PARAMS', '团购价格不能为负')}
            if (inputSku.tuanStock != null && Number(inputSku.tuanStock) < 0) {throw err('INVALID_PARAMS', '团购库存不能为负')}
            sku.tuanPrice = Number(inputSku.tuanPrice) || 0
            sku.tuanStock = inputSku.tuanStock != null && Number(inputSku.tuanStock) > 0
              ? Number(inputSku.tuanStock) : sku.stock
          } else {
            sku.tuanPrice = Number(p.tuanPrice) || 0
            sku.tuanStock = sku.stock || 0
          }
        }
      }

      return {
        productId,
        name,
        image,
        skuType,
        specGroups,
        skus,
        originalPrice: Number(p.originalPrice) || 0,
        tuanPrice: skuType === 'multi' ? 0 : (Number(p.tuanPrice) || 0),
        stock: skuType === 'multi' ? skus.reduce((sum, s) => sum + (Number(s.tuanStock) || Number(s.stock) || 0), 0) : (Number(p.tuanStock) || Number(p.stock) || 0),
        sold: p.sold || 0,
      }
    }))
  }
  if (startTime !== undefined) {update.startTime = startTime ? parseBJTime(startTime) : null}
  if (endTime !== undefined) {update.endTime = endTime ? parseBJTime(endTime) : new Date('2099-12-31T23:59:59')}
  await db.collection('tuan_deals').doc(id).update({ data: update })
  return handleSuccess(null, '更新成功')
}

async function deleteTuanDeal(event, context, auth) {
  const { id } = event
  if (!id) {throw err('INVALID_PARAMS', '缺少团购ID')}
  const existing = await db.collection('tuan_deals').doc(id).get()
  if (!existing.data) {throw err('NOT_FOUND', '团购不存在')}
  if (!auth.isSuperAdmin && !(auth.roles || []).includes('super_admin') && existing.data.createdBy !== auth.openid) {
    throw err('PERMISSION_DENIED', '无权操作他人资源')
  }
  await db.collection('tuan_deals').doc(id).remove()
  return handleSuccess(null, '删除成功')
}

async function publishTuanDeal(event, context, auth) {
  const { id } = event
  if (!id) {throw err('INVALID_PARAMS', '缺少团购ID')}
  const existing = await db.collection('tuan_deals').doc(id).get()
  if (!existing.data) {throw err('NOT_FOUND', '团购不存在')}
  if (!auth.isSuperAdmin && !(auth.roles || []).includes('super_admin') && existing.data.createdBy !== auth.openid) {
    throw err('PERMISSION_DENIED', '无权操作他人资源')
  }
  // P3: 防止把已过期的团购重新发布（否则只能等 cron 回收）
  const endTime = existing.data.endTime ? parseBJTime(existing.data.endTime) : null
  if (endTime && endTime.getTime() < Date.now()) {
    throw err('INVALID_PARAMS', '团购已过结束时间，无法发布（请先调整结束时间）')
  }
  const updateData = { status: 'published', updatedAt: new Date() }
  if (!existing.data.startTime) {updateData.startTime = new Date()}
  if (!existing.data.endTime) {updateData.endTime = new Date('2099-12-31T23:59:59')}
  await db.collection('tuan_deals').doc(id).update({ data: updateData })
  return handleSuccess(null, '发布成功')
}

async function endTuanDeal(event, context, auth) {
  const { id } = event
  if (!id) {throw err('INVALID_PARAMS', '缺少团购ID')}
  const existing = await db.collection('tuan_deals').doc(id).get()
  if (!existing.data) {throw err('NOT_FOUND', '团购不存在')}
  if (!auth.isSuperAdmin && !(auth.roles || []).includes('super_admin') && existing.data.createdBy !== auth.openid) {
    throw err('PERMISSION_DENIED', '无权操作他人资源')
  }
  await db.collection('tuan_deals').doc(id).update({ data: { status: 'ended', updatedAt: new Date() } })
  return handleSuccess(null, '已结束')
}

async function getTuanDealList(event, context, auth) {
  const { page = 1, pageSize = 10, status } = event
  const where = {}
  if (status) {where.status = status}
  const result = await paginate(db, 'tuan_deals', { page, pageSize, where, projection: DEAL_FIELDS, orderBy: { field: 'createdAt', direction: 'desc' } })
  return handleSuccess(result)
}

async function getTuanDealDetail(event, context, auth) {
  const { id } = event
  if (!id) {throw err('INVALID_PARAMS', '缺少团购ID')}
  const res = await db.collection('tuan_deals').doc(id).field(DEAL_FIELDS).get()
  if (!res.data) {throw err('NOT_FOUND', '团购不存在')}
  return handleSuccess(res.data)
}

async function getTuanDealOrders(event, context, auth) {
  const { dealId, status, paymentStatus, page = 1, pageSize = 20, startDate, endDate } = event
  // ★ 修复：原来查 `tuan_orders` 集合——那是个无 transactionId 的孤立集合，
  //  wx 发货信息同步的 shipped / completed 状态都写不到它上面，所以 web 端永远卡在 paid。
  // 真实团购订单已经统一在 `orders` 集合（type='group_buy'），跟商城订单共用一个集合，
  // 通过 orders 查就能拿到 wx 同步后的最新 status。
  // 这里和 mall.js / activity.js / feeding.js / hosting.js 保持一致：_.neq('deleted') 过滤。
  const where = { type: 'group_buy', status: _.neq('deleted') }
  if (dealId) {where.dealId = dealId}
  if (status && status !== 'all') {where.status = status}
  if (paymentStatus) {where.paymentStatus = paymentStatus}
  if (startDate || endDate) {
    let timeCond = null
    if (startDate) {
      const startVal = /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? `${startDate}T00:00:00.000` : startDate
      timeCond = _.gte(new Date(startVal))
    }
    if (endDate) {
      const endVal = /^\d{4}-\d{2}-\d{2}$/.test(endDate) ? `${endDate}T23:59:59.999` : endDate
      const end = new Date(endVal)
      timeCond = timeCond ? timeCond.and(_.lte(end)) : _.lte(end)
    }
    if (timeCond) {where.createdAt = timeCond}
  }
  const result = await paginate(db, 'orders', { page, pageSize, where, orderBy: { field: 'createdAt', direction: 'desc' } })

  const list = result.list || []
  const dealIds = [...new Set(list.map(o => o.dealId).filter(Boolean))]
  const dealMap = {}
  if (dealIds.length > 0) {
    const dealsRes = await db.collection('tuan_deals').where({ _id: _.in(dealIds) }).field({ _id: true, title: true }).get()
    dealsRes.data.forEach(d => { dealMap[d._id] = d })
  }

  // 直接是 orders 文档，orderNo / paymentStatus / outTradeNo / transactionId / status 都在
  // 本身就有，不需要 enrichTuanOrderNos 反查。只需要补 productName + buyerNickName。
  const partialEnriched = list.map(o => ({
    ...o,
    productName: o.productName || dealMap[o.dealId]?.title || '',
  }))
  const enrichedList = await enrichBuyerFields(db, partialEnriched)

  return handleSuccess({ ...result, list: enrichedList })
}

async function getTuanLeaderList(event, context, auth) {
  try {
    const { page = 1, pageSize = 50 } = event
    const usersRes = await db.collection('users')
      .where({ role: _.in(['super_admin', 'host_admin', 'activity_admin']) })
      .field({ _id: true, nickName: true, avatarUrl: true, role: true })
      .get()
    const leaders = usersRes.data || []
    if (leaders.length === 0) {return handleSuccess({ list: [], total: 0 })}

    const leaderIds = leaders.map(l => l._id)

    let commData = []
    try {
      const commissions = await db.collection('commissions')
        .where({ inviterId: _.in(leaderIds) })
        .get()
      commData = commissions.data || []
    } catch (e) {
      logger.warn('tuan.commissions', e)
    }

    let invitedData = []
    try {
      const invitedRes = await db.collection('users')
        .where({ inviterId: _.in(leaderIds) })
        .field({ _id: true, inviterId: true })
        .limit(1000)
        .get()
      invitedData = invitedRes.data || []
    } catch (e) {
      logger.warn('tuan.invited', e)
    }

    const invitedByLeader = {}
    invitedData.forEach(u => {
      if (!invitedByLeader[u.inviterId]) {invitedByLeader[u.inviterId] = { count: 0, openids: [] }}
      invitedByLeader[u.inviterId].count += 1
      invitedByLeader[u.inviterId].openids.push(u._id)
    })

    let config = {}
    try {
      const configRes = await db.collection('system_config').doc('commission_rates').get()
      config = configRes.data || {}
    } catch (e) {
      logger.warn('tuan.config', e)
    }

    const list = leaders.map(l => {
      const myComms = commData.filter(c => c.inviterId === l._id)
      const invited = invitedByLeader[l._id] || { count: 0, openids: [] }
      const pendingComms = myComms.filter(c => c.status === 'pending')
      const settledComms = myComms.filter(c => c.status === 'settled')
      const totalCommission = myComms.reduce((s, c) => s + (c.commissionAmount || 0), 0)
      const pendingAmount = pendingComms.reduce((s, c) => s + (c.commissionAmount || 0), 0)
      const settledAmount = settledComms.reduce((s, c) => s + (c.commissionAmount || 0), 0)

      const orderTypeStats = {}
      ORDER_TYPES.forEach(type => {
        const typeComms = myComms.filter(c => commMatchesType(c, type))
        const typePending = typeComms.filter(c => c.status === 'pending')
        const typeSettled = typeComms.filter(c => c.status === 'settled')
        orderTypeStats[type] = {
          rate: pickRate(config, type),
          orderCount: typeComms.length,
          totalCount: typeComms.length,
          pendingCount: typePending.length,
          settledCount: typeSettled.length,
          totalAmount: Math.round(typeComms.reduce((s, c) => s + (c.commissionAmount || 0), 0) * 100) / 100,
          pendingAmount: Math.round(typePending.reduce((s, c) => s + (c.commissionAmount || 0), 0) * 100) / 100,
          settledAmount: Math.round(typeSettled.reduce((s, c) => s + (c.commissionAmount || 0), 0) * 100) / 100,
        }
      })

      return {
        _id: l._id, nickName: l.nickName || '未知', avatarUrl: l.avatarUrl || '',
        role: l.role, invitedCount: invited.count,
        orderCount: myComms.length, totalCommission: Math.round(totalCommission * 100) / 100,
        pendingAmount: Math.round(pendingAmount * 100) / 100,
        settledAmount: Math.round(settledAmount * 100) / 100,
        orderTypeStats,
      }
    })
    list.sort((a, b) => b.totalCommission - a.totalCommission)
    const offset = (page - 1) * pageSize
    return handleSuccess({ list: list.slice(offset, offset + pageSize), total: list.length })
  } catch (error) {
    logger.error('getTuanLeaderList', error)
    return handleError(error, '获取团长列表失败', ERROR_CODES.INTERNAL)
  }
}

async function getTuanLeaderCommissions(event, context, auth) {
  const { leaderId, page = 1, pageSize = 20, status, orderType } = event
  const where = {}
  if (leaderId) {where.inviterId = leaderId}
  if (status) {where.status = status}
  if (orderType) {
    // 兼容历史别名：按 boarding 过滤时也要命中历史 hosting/order 文档，
    // 按 tuan 过滤时也要命中历史 group_buy 文档
    const aliases = orderTypeAliases(orderType)
    where.orderType = aliases.length > 1 ? _.in(aliases) : orderType
  }
  try {
    const result = await paginate(db, 'commissions', { page, pageSize, where, orderBy: { field: 'createdAt', direction: 'desc' } })
    return handleSuccess(result)
  } catch (e) {
    return handleSuccess({ list: [], total: 0, page, pageSize })
  }
}

async function getTuanCommissionStats(event, context, auth) {
  let commData = []
  try {
    const commissions = await db.collection('commissions').limit(1000).get()
    commData = commissions.data || []
  } catch (e) {
    // commissions集合不存在时返回空
  }

  let configData = {}
  try {
    const config = await db.collection('system_config').doc('commission_rates').get()
    configData = config.data || {}
  } catch (e) {
    // commission_rates文档不存在时使用空配置
  }

  const pending = commData.filter(c => c.status === 'pending')
  const settled = commData.filter(c => c.status === 'settled')

  const orderTypeStats = {}
  ORDER_TYPES.forEach(type => {
    const typeComms = commData.filter(c => commMatchesType(c, type))
    const typePending = typeComms.filter(c => c.status === 'pending')
    const typeSettled = typeComms.filter(c => c.status === 'settled')
    orderTypeStats[type] = {
      rate: pickRate(configData, type),
      totalCount: typeComms.length,
      pendingCount: typePending.length,
      settledCount: typeSettled.length,
      totalAmount: Math.round(typeComms.reduce((s, c) => s + (c.commissionAmount || 0), 0) * 100) / 100,
      pendingAmount: Math.round(typePending.reduce((s, c) => s + (c.commissionAmount || 0), 0) * 100) / 100,
      settledAmount: Math.round(typeSettled.reduce((s, c) => s + (c.commissionAmount || 0), 0) * 100) / 100,
    }
  })

  return handleSuccess({
    totalCommissions: commData.length,
    totalAmount: Math.round(commData.reduce((s, c) => s + (c.commissionAmount || 0), 0) * 100) / 100,
    pendingCount: pending.length,
    pendingAmount: Math.round(pending.reduce((s, c) => s + (c.commissionAmount || 0), 0) * 100) / 100,
    settledCount: settled.length,
    settledAmount: Math.round(settled.reduce((s, c) => s + (c.commissionAmount || 0), 0) * 100) / 100,
    orderTypeStats,
  })
}

/**
 * 佣金结算（迁移自 settleTuanCommissions：不限于团购，按佣金记录 id 批量结算任意类型，
 *   pending → settled + 入账 commission 钱包；条件更新防并发重复入账）
 */
async function settleCommissions(event, context, auth) {
  const { ids } = event
  if (!ids || ids.length === 0) {throw err('INVALID_PARAMS', '请选择待结算记录')}
  const now = new Date()
  // ★ 顺序更新替代 Promise.all：避免部分失败导致部分结算状态。
  // CloudBase 事务有 10s 超时限制，批量结算可能涉及大量记录，不适合单事务。
  // P0-1: 结算成功后调用 ensureWalletBalance 将佣金入账钱包（原子增 balance/totalIncome）
  const { ensureWalletBalance } = require('../common/wallet-utils')
  let successCount = 0
  let failedCount = 0
  const failedIds = []
  for (const id of ids) {
    try {
      // 先查询佣金记录，获取 inviterId 和 commissionAmount
      const commRes = await db.collection('commissions').doc(id).get()
      const comm = commRes.data
      if (!comm) { throw new Error('佣金记录不存在') }

      // P1-B: 条件更新防并发重复入账 — where(status=pending) 原子更新
      // 若已 settled（被并发请求抢先），update 命中 0 条，跳过钱包入账
      const updateRes = await db.collection('commissions')
        .where({ _id: id, status: 'pending' })
        .update({ data: { status: 'settled', settledAt: now, settledBy: auth.openid } })

      const updatedCount = (updateRes && updateRes.stats && updateRes.stats.updated) || 0
      if (updatedCount === 0) {
        // 已被并发结算或记录不存在，跳过钱包入账
        logger.info('settleTuanCommissions.skip_already_settled', { id, currentStatus: comm.status })
        successCount += 1
        continue
      }

      // P0-1: 仅对首次结算（pending → settled）的记录入账钱包
      // 钱包入账失败不阻塞结算（佣金已结算），通过告警补偿
      if (comm.inviterId && Number(comm.commissionAmount) > 0) {
        try {
          await ensureWalletBalance(comm.inviterId, Number(comm.commissionAmount), 'commission')
        } catch (walletErr) {
          logger.error('settleTuanCommissions.wallet.failed', {
            id, inviterId: comm.inviterId, amount: comm.commissionAmount,
            error: walletErr && walletErr.message ? walletErr.message : String(walletErr),
          })
          await recordAlert('critical', 'tuan.commission.wallet.failed', '团购佣金入账钱包失败', {
            commissionId: id, inviterId: comm.inviterId, amount: comm.commissionAmount,
          })
        }
      }
      successCount += 1
    } catch (e) {
      failedCount += 1
      failedIds.push(id)
      logger.error('settleTuanCommissions.item.failed', { id, error: e && e.message ? e.message : String(e) })
    }
  }
  if (failedCount > 0) {
    await recordAlert('critical', 'tuan.commission.settle.partial', '团购佣金批量结算部分失败', {
      total: ids.length, successCount, failedCount, failedIds, operator: auth.openid,
    })
  }
  return handleSuccess({ successCount, failedCount, settledCount: successCount })
}

/**
 * 历史遗留佣金补标：仅把 pending 记录置为 settled，**不入账钱包**。
 * 适用场景：佣金写入器统一/历史路径造成的“钱已入钱包但佣金状态仍 pending”的存量记录
 * （正常结算会重复入账，必须先人工核实钱包已含该笔金额再补标）。
 */
async function settleCommissionLegacy(event, context, auth) {
  const { commissionId } = event
  if (!commissionId) {throw err('INVALID_PARAMS', '缺少佣金记录ID')}
  const now = new Date()
  try {
    const commRes = await db.collection('commissions').doc(commissionId).get()
    const comm = commRes.data
    if (!comm) {throw err('NOT_FOUND', '佣金记录不存在')}
    if (comm.status !== 'pending') {
      throw err('BUSINESS_ERROR', '仅待结算记录可补标')
    }
    const amountNum = Number(comm.commissionAmount) || 0
    // 条件更新防并发：仅 pending → settled
    const up = await db.collection('commissions')
      .where({ _id: commissionId, status: 'pending' })
      .update({
        data: {
          status: 'settled',
          settledAt: now,
          settledBy: auth.openid,
          legacyReconciled: true,
          updatedAt: db.serverDate(),
        },
      })
    const updated = (up && up.stats && up.stats.updated) || 0
    if (updated === 0) {
      throw err('BUSINESS_ERROR', '该记录状态已变更，请刷新后重试')
    }
    const { writeOperationLog } = require('../common/operation-log')
    writeOperationLog({
      module: 'commission',
      action: 'settle_legacy_no_credit',
      targetId: commissionId,
      operatorId: auth.openid,
      afterData: { amount: amountNum, inviterId: comm.inviterId, note: '历史记录补标，未重复入账' },
    })
    await recordAlert('warning', 'commission.legacy_settled_no_credit',
      '历史佣金记录补标为已结算（未重复入账），请人工核对钱包金额',
      { commissionId, inviterId: comm.inviterId, amount: amountNum })
    return handleSuccess({ settled: true, amount: amountNum, note: '已补标为已结算，未重复入账' })
  } catch (error) {
    logger.error('settleCommissionLegacy', error)
    return handleError(error, error.message || '补标失败', ERROR_CODES.DATA)
  }
}

/**
 * 佣金记录查询（后台结算页使用）：按 orderType / status / 邀请人过滤，分页
 */
async function getCommissionList(event, context, auth) {
  const { orderType, status, inviterId, page = 1, pageSize = 20 } = event
  const safePage = Math.max(1, Math.floor(Number(page) || 1))
  const safePageSize = Math.min(100, Math.max(1, Math.floor(Number(pageSize) || 20)))
  const where = {}
  if (orderType) {where.orderType = orderType}
  if (status) {where.status = status}
  if (inviterId) {where.inviterId = inviterId}

  const result = await paginate(db, 'commissions', {
    page: safePage, pageSize: safePageSize, where,
    orderBy: { field: 'createdAt', direction: 'desc' },
  })
  // 补邀请人/下单用户昵称，便于后台结算页识别
  const list = result.list || []
  if (list.length > 0) {
    const openids = [...new Set(list.flatMap(c => [c.inviterId, c.ownerId]).filter(Boolean))]
    const userMap = {}
    try {
      for (let i = 0; i < openids.length; i += 100) {
        const userRes = await db.collection('users')
          .where({ _id: _.in(openids.slice(i, i + 100)) })
          .field({ _id: true, nickName: true })
          .get()
        ;((userRes && userRes.data) || []).forEach(u => { userMap[u._id] = u.nickName || '' })
      }
    } catch (e) {
      logger.warn('getCommissionList.users.fetch', { msg: e?.message || String(e) })
    }
    list.forEach(c => {
      c.inviterNickName = c.inviterId ? (userMap[c.inviterId] || '') : ''
      c.ownerNickName = c.ownerId ? (userMap[c.ownerId] || '') : ''
    })
    result.list = list
  }
  return handleSuccess(result)
}

async function getTuanDealOrderDetail(event, context, auth) {
  const { orderId } = event
  if (!orderId) { throw err('INVALID_PARAMS', '缺少订单ID') }
  const res = await db.collection('orders').doc(orderId).get()
  if (!res.data || res.data.type !== 'group_buy') { throw err('NOT_FOUND', '订单不存在') }
  return handleSuccess(res.data)
}

/**
 * P1-2: 后台团购订单操作（发货/完成/取消）。
 * 镜像 handleMallOrder 模式，针对 type='group_buy'：
 *   - ship: paid → shipped（写快递单号 + 同步 tuan_orders）
 *   - complete: shipped → completed（同步 tuan_orders）
 *   - cancel: pending_payment → cancelled（未支付直写 + 库存回补 + 累计回退）
 *             paid → refunded（已支付走退款 + 库存回补 + 累计回退）
 */
async function handleTuanOrder(event, context, auth) {
  const { orderId, operation, expressCompany, expressNo } = event
  if (!orderId) {throw err('INVALID_PARAMS', '缺少订单ID')}
  if (!operation) {throw err('INVALID_PARAMS', '缺少操作类型')}

  const newStatus = TUAN_STATUS_MAP[operation]
  if (!newStatus) {throw err('INVALID_PARAMS', '无效操作')}

  // 发货必须有快递单号
  if (operation === 'ship' && !expressNo) {throw err('INVALID_PARAMS', '请填写快递单号')}

  const orderRes = await db.collection('orders').doc(orderId).get()
  if (!orderRes.data) {throw err('NOT_FOUND', '订单不存在')}
  if (orderRes.data.type !== 'group_buy') {throw err('BUSINESS_ERROR', '非团购订单')}
  const order = orderRes.data

  // cancel 路径跳过顶部统一校验：paid 取消走 refunded、pending_payment 取消走 cancelled，
  // 目标状态由分支内按 order.status 分别校验（统一表里 paid 不再直写 cancelled）
  if (operation !== 'cancel') {
    try {
      validateTransition(LOGISTICS_ORDER_TRANSITIONS, order.status, newStatus)
    } catch (e) {
      return handleError(e, e.message, ERROR_CODES.BUSINESS)
    }
  }

  // 取消-已支付：paid → refunded（paymentService.createRefund 内部会把 orders/tuan_orders 置 refunded）
  if (operation === 'cancel' && order.status === 'paid') {
    try {
      validateTransition(LOGISTICS_ORDER_TRANSITIONS, 'paid', 'refunded')
    } catch (e) {
      return handleError(e, e.message, ERROR_CODES.BUSINESS)
    }
    const paymentStatus = String(order.paymentStatus || '').toLowerCase()
    if (paymentStatus !== 'paid') {
      throw err('ORDER_STATUS_INVALID', `订单支付状态异常：${paymentStatus || '(空)'}`)
    }
    const totalAmountFen = Math.round(Number(order.totalAmount || order.totalPrice || 0) * 100)
    if (totalAmountFen > 0) {
      try {
        const callRes = await cloud.callFunction({
          name: 'paymentService',
          data: {
            action: 'createRefund',
            outTradeNo: order.orderNo || orderId,
            refundAmount: totalAmountFen,
            totalAmount: totalAmountFen,
          },
        })
        const result = (callRes.result || {}) || {}
        if (result.code && result.code !== 0) {
          throw new Error(`退款失败：${result.message || '支付服务返回错误'}`)
        }
      } catch (refundErr) {
        logger.error('handleTuanOrder.refund.failed', { orderId, msg: refundErr && refundErr.message })
        await recordAlert('critical', 'tuan.admin.cancel.refund.failed', '后台取消团购订单退款失败', {
          orderId, orderNo: order.orderNo, amount: order.totalAmount,
          error: refundErr && refundErr.message,
        })
        return handleError(refundErr, `退款失败：${(refundErr && refundErr.message) || '请重试'}`, ERROR_CODES.BUSINESS)
      }
    }
    // P1-2/P1-3: 退款成功后订单状态由 paymentService 置 refunded；
    //   与小程序端 cancelTuanOrder 对齐——回补 tuan_deals 库存 + 回退 deal 累计单数/金额
    try {
      await restoreTuanDealStockAdmin(order)
    } catch (stockErr) {
      logger.error('handleTuanOrder.paidCancel.restoreStock.failed', { orderId, msg: stockErr && stockErr.message })
      await recordAlert('warning', 'tuan.admin.cancelPaid.restoreStock.failed', '后台取消已支付团购订单库存回退失败', {
        orderId, dealId: order.dealId, productId: order.productId, error: stockErr && stockErr.message,
      })
    }
    await rollbackTuanDealTotalsAdmin(order.dealId, Number(order.totalAmount) || 0)
    return handleSuccess(null, '退款申请已提交，订单将标记为已退款')
  }

  // 取消-未支付：pending_payment → cancelled
  // 副作用从通用更新后整体搬入分支：tuan_orders 同步 + 库存回补 + 累计回退，避免漏回退
  if (operation === 'cancel' && order.status === 'pending_payment') {
    try {
      validateTransition(LOGISTICS_ORDER_TRANSITIONS, 'pending_payment', 'cancelled')
    } catch (e) {
      return handleError(e, e.message, ERROR_CODES.BUSINESS)
    }
    await db.collection('orders').doc(orderId).update({
      data: { status: 'cancelled', updatedAt: db.serverDate() },
    })
    if (order.tuanOrderId) {
      try {
        await db.collection('tuan_orders').doc(order.tuanOrderId).update({
          data: { status: 'cancelled', updatedAt: db.serverDate() },
        })
      } catch (syncErr) {
        logger.warn('handleTuanOrder.cancel.syncTuanOrder.failed', { orderId, tuanOrderId: order.tuanOrderId, msg: syncErr && syncErr.message })
        await recordAlert('warning', 'tuan.admin.handle.syncTuanOrder.failed', '后台团购取消后 tuan_orders 同步失败', {
          orderId, tuanOrderId: order.tuanOrderId, targetStatus: 'cancelled',
          error: syncErr && syncErr.message,
        })
      }
    }
    try {
      await restoreTuanDealStockAdmin(order)
    } catch (stockErr) {
      logger.error('handleTuanOrder.restoreStock.failed', { orderId, msg: stockErr && stockErr.message })
      await recordAlert('warning', 'tuan.admin.cancel.restoreStock.failed', '后台取消团购订单库存回退失败', {
        orderId, dealId: order.dealId, productId: order.productId, error: stockErr && stockErr.message,
      })
    }
    await rollbackTuanDealTotalsAdmin(order.dealId, Number(order.totalAmount) || 0)
    return handleSuccess(null, '订单已取消')
  }

  // cancel 路径仅允许 paid（→refunded）和 pending_payment（→cancelled），其他状态禁止取消
  // 防止 shipped/completed/历史 pending_shipment 等订单穿透到通用更新分支直接置 cancelled
  if (operation === 'cancel') {
    throw err('ORDER_STATUS_INVALID', `当前订单状态（${order.status}）不可取消`)
  }

  // 发货：写快递单号 + 状态
  if (operation === 'ship') {
    await db.collection('orders').doc(orderId).update({
      data: {
        status: 'shipped',
        expressCompany: expressCompany || '',
        expressNo,
        shippedAt: db.serverDate(),
        updatedAt: db.serverDate(),
      },
    })
  } else {
    await db.collection('orders').doc(orderId).update({
      data: { status: newStatus, updatedAt: db.serverDate() },
    })
  }

  // 同步 tuan_orders（best-effort：失败告警，不阻断主流程）
  if (order.tuanOrderId) {
    try {
      const syncData = { status: newStatus, updatedAt: db.serverDate() }
      if (operation === 'ship') {
        syncData.expressCompany = expressCompany || ''
        syncData.expressNo = expressNo
        syncData.shippedAt = db.serverDate()
      }
      await db.collection('tuan_orders').doc(order.tuanOrderId).update({ data: syncData })
    } catch (syncErr) {
      logger.warn('handleTuanOrder.syncTuanOrder.failed', { orderId, tuanOrderId: order.tuanOrderId, msg: syncErr && syncErr.message })
      await recordAlert('warning', 'tuan.admin.handle.syncTuanOrder.failed', '后台团购操作后 tuan_orders 同步失败', {
        orderId, tuanOrderId: order.tuanOrderId, targetStatus: newStatus,
        error: syncErr && syncErr.message,
      })
    }
  }

  // 遗留修复：发货时同步推送微信物流（发货信息管理 + 物流查询组件 + 物流服务通知），
  // 与 tuanService.shipTuanOrder 完全对齐；best-effort，失败只记日志不阻断发货
  if (operation === 'ship') {
    const transactionId = order.wxTransactionId || order.transactionId || ''
    if (transactionId) {
      try {
        const wxRes = await uploadShippingInfo({
          transactionId,
          merchantTradeNo: orderId,
          shippingItem: {
            expressCompany,
            expressNo,
            itemDesc: `${order.productName || '团购商品'} ×${order.quantity || 1}`,
          },
        })
        if (!wxRes.ok) {
          logger.warn('handleTuanOrder.uploadShippingInfo.fail', { orderId, transactionId, expressNo, error: wxRes.error })
        }
      } catch (e) {
        logger.warn('handleTuanOrder.uploadShippingInfo.exception', { orderId, msg: (e && e.message) || String(e) })
      }

      const openid = order.ownerId || ''
      const receiverPhone = order.receiverPhone || ''
      const productImage = order.productImage || ''
      const productName = order.productName || '团购商品'
      if (openid && receiverPhone) {
        // 物流查询组件 trace_waybill → waybillToken 存订单（前端 logistics-card 拉起原生物流页）
        try {
          const traceRes = await traceWaybill({
            openid,
            receiverPhone,
            waybillId: expressNo,
            transId: transactionId,
            orderDetailPath: `subpackages/profile/mall-order-detail/index?id=${orderId}`,
            goodsInfo: [{ goodsName: productName, goodsImgUrl: productImage }],
            deliveryId: expressCompany,
          })
          if (traceRes.ok && traceRes.waybillToken) {
            await db.collection('orders').doc(orderId).update({
              data: { waybillToken: traceRes.waybillToken, updatedAt: db.serverDate() },
            })
            if (order.tuanOrderId) {
              try {
                await db.collection('tuan_orders').doc(order.tuanOrderId).update({
                  data: { waybillToken: traceRes.waybillToken, updatedAt: db.serverDate() },
                })
              } catch (e) {
                logger.warn('handleTuanOrder.syncWaybillTokenToTuanOrder.failed', {
                  orderId, tuanOrderId: order.tuanOrderId, msg: (e && e.message) || String(e),
                })
              }
            }
          } else {
            logger.warn('handleTuanOrder.traceWaybill.fail', { orderId, transactionId, expressNo, error: traceRes.error })
          }
        } catch (e) {
          logger.warn('handleTuanOrder.traceWaybill.exception', { orderId, msg: (e && e.message) || String(e) })
        }

        // 物流消息能力 follow_waybill → 关键节点推送服务通知
        try {
          const followRes = await followWaybill({
            openid,
            receiverPhone,
            waybillId: expressNo,
            transId: transactionId,
            orderDetailPath: `subpackages/profile/mall-order-detail/index?id=${orderId}`,
            goodsInfo: [{ goodsName: productName, goodsImgUrl: productImage }],
            deliveryId: expressCompany,
          })
          if (followRes.ok && followRes.waybillToken) {
            await db.collection('orders').doc(orderId).update({
              data: { followWaybillToken: followRes.waybillToken, updatedAt: db.serverDate() },
            })
            if (order.tuanOrderId) {
              try {
                await db.collection('tuan_orders').doc(order.tuanOrderId).update({
                  data: { followWaybillToken: followRes.waybillToken, updatedAt: db.serverDate() },
                })
              } catch (e) {
                logger.warn('handleTuanOrder.syncFollowWaybillTokenToTuanOrder.failed', {
                  orderId, tuanOrderId: order.tuanOrderId, msg: (e && e.message) || String(e),
                })
              }
            }
          } else {
            logger.warn('handleTuanOrder.followWaybill.fail', { orderId, transactionId, expressNo, error: followRes.error })
          }
        } catch (e) {
          logger.warn('handleTuanOrder.followWaybill.exception', { orderId, msg: (e && e.message) || String(e) })
        }
      } else {
        logger.warn('handleTuanOrder.traceWaybill.skip', {
          orderId, hasOpenid: Boolean(openid), hasReceiverPhone: Boolean(receiverPhone),
        })
      }
    }
  }

  return handleSuccess(null, '操作成功')
}

/** P0-2: 按 tuan_deals.products 快照回退库存（与下单扣减对称） */
async function restoreTuanDealStockAdmin(order) {
  const { dealId, productId, skuId, quantity } = order
  if (!dealId || !productId) { return }
  const qty = Number(quantity) || 1
  const dealRes = await db.collection('tuan_deals').doc(dealId).get()
  const deal = dealRes.data
  if (!deal || !Array.isArray(deal.products)) { return }

  const productIndex = deal.products.findIndex(p => p.productId === productId)
  if (productIndex < 0) { return }
  const product = deal.products[productIndex]
  const updateData = { updatedAt: db.serverDate() }

  if (skuId && product.skuType === 'multi' && Array.isArray(product.skus)) {
    const skuIndex = product.skus.findIndex(s => s.skuId === skuId)
    if (skuIndex >= 0) {
      // 与下单扣减字段对称：优先回补团购配额 tuanStock，历史无 tuanStock 的 SKU 回补 stock
      const sku = product.skus[skuIndex]
      const stockField = (sku.tuanStock !== undefined && sku.tuanStock !== null) ? 'tuanStock' : 'stock'
      updateData[`products.${productIndex}.skus.${skuIndex}.${stockField}`] = _.inc(qty)
      updateData[`products.${productIndex}.skus.${skuIndex}.sold`] = _.inc(-qty)
      await db.collection('tuan_deals').doc(dealId).update({ data: updateData })
      return
    }
  }
  updateData[`products.${productIndex}.stock`] = _.inc(qty)
  updateData[`products.${productIndex}.sold`] = _.inc(-qty)
  await db.collection('tuan_deals').doc(dealId).update({ data: updateData })
}

/** P1-3: 取消订单时回退 deal 累计单数/金额（与下单 inc 对称，防止列表统计虚高） */
async function rollbackTuanDealTotalsAdmin(dealId, amount) {
  if (!dealId) {return}
  try {
    const dealRes = await db.collection('tuan_deals').doc(dealId).get()
    const deal = dealRes.data
    if (!deal) {return}
    const nextOrders = Math.max(0, (Number(deal.totalOrders) || 0) - 1)
    const nextAmount = Math.max(0, (Number(deal.totalAmount) || 0) - (Number(amount) || 0))
    await db.collection('tuan_deals').doc(dealId).update({
      data: { totalOrders: nextOrders, totalAmount: nextAmount, updatedAt: db.serverDate() },
    })
  } catch (e) {
    logger.warn('rollbackTuanDealTotalsAdmin', { dealId, amount, msg: e && e.message })
  }
}

module.exports = {
  createTuanDeal, updateTuanDeal, deleteTuanDeal, publishTuanDeal, endTuanDeal,
  getTuanDealList, getTuanDealDetail, getTuanDealOrders, getTuanDealOrderDetail,
  getTuanLeaderList, getTuanLeaderCommissions, getTuanCommissionStats, settleCommissions, settleCommissionLegacy, getCommissionList,
  handleTuanOrder,
}
