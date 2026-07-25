const { err } = require('../common/errors')
const { handleSuccess, handleError, ERROR_CODES, paginate, initCloud } = require('../common/utils')
const { createLogger } = require('../common/logger')
const { recordAlert } = require('../common/alert')
const { ORDER_TYPES, ORDER_TYPE_NAMES } = require('../constants')
const { enrichBuyerFields, enrichTuanOrderNos } = require('./_enrichBuyers')

const { db } = initCloud()
const _ = db.command
const logger = createLogger('adminService:tuan')

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
  if (!auth.isSuperAdmin && existing.data.createdBy !== auth.openid) {
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
  if (startTime !== undefined) {update.startTime = startTime ? new Date(startTime) : null}
  if (endTime !== undefined) {update.endTime = endTime ? new Date(endTime) : new Date('2099-12-31T23:59:59')}
  await db.collection('tuan_deals').doc(id).update({ data: update })
  return handleSuccess(null, '更新成功')
}

async function deleteTuanDeal(event, context, auth) {
  const { id } = event
  if (!id) {throw err('INVALID_PARAMS', '缺少团购ID')}
  const existing = await db.collection('tuan_deals').doc(id).get()
  if (!existing.data) {throw err('NOT_FOUND', '团购不存在')}
  if (!auth.isSuperAdmin && existing.data.createdBy !== auth.openid) {
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
  if (!auth.isSuperAdmin && existing.data.createdBy !== auth.openid) {
    throw err('PERMISSION_DENIED', '无权操作他人资源')
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
  if (!auth.isSuperAdmin && existing.data.createdBy !== auth.openid) {
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
  const { dealId, status, page = 1, pageSize = 20 } = event
  // ★ 修复：原来查 `tuan_orders` 集合——那是个无 transactionId 的孤立集合，
  //  wx 发货信息同步的 shipped / completed 状态都写不到它上面，所以 web 端永远卡在 paid。
  // 真实团购订单已经统一在 `orders` 集合（type='group_buy'），跟商城订单共用一个集合，
  // 通过 orders 查就能拿到 wx 同步后的最新 status。
  // 这里和 mall.js / activity.js / feeding.js / hosting.js 保持一致：_.neq('deleted') 过滤。
  const where = { type: 'group_buy', status: _.neq('deleted') }
  if (dealId) {where.dealId = dealId}
  if (status && status !== 'all') {where.status = status}
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
        const typeComms = myComms.filter(c => c.orderType === type)
        const typePending = typeComms.filter(c => c.status === 'pending')
        const typeSettled = typeComms.filter(c => c.status === 'settled')
        orderTypeStats[type] = {
          rate: config[type] !== undefined ? config[type] : 0,
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
  if (orderType) {where.orderType = orderType}
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
    const typeComms = commData.filter(c => c.orderType === type)
    const typePending = typeComms.filter(c => c.status === 'pending')
    const typeSettled = typeComms.filter(c => c.status === 'settled')
    orderTypeStats[type] = {
      rate: configData[type] !== undefined ? configData[type] : 0,
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

async function settleTuanCommissions(event, context, auth) {
  const { ids } = event
  if (!ids || ids.length === 0) {throw err('INVALID_PARAMS', '请选择待结算记录')}
  const now = new Date()
  // ★ 顺序更新替代 Promise.all：避免部分失败导致部分结算状态。
  // CloudBase 事务有 10s 超时限制，批量结算可能涉及大量记录，不适合单事务。
  // P0-1: 结算成功后调用 ensureWalletBalance 将佣金入账钱包（原子增 balance/totalIncome）
  const { ensureWalletBalance } = require('../../common/wallet-utils')
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

async function getTuanDealOrderDetail(event, context, auth) {
  const { orderId } = event
  if (!orderId) { throw err('INVALID_PARAMS', '缺少订单ID') }
  const res = await db.collection('orders').doc(orderId).get()
  if (!res.data || res.data.type !== 'group_buy') { throw err('NOT_FOUND', '订单不存在') }
  return handleSuccess(res.data)
}

module.exports = {
  createTuanDeal, updateTuanDeal, deleteTuanDeal, publishTuanDeal, endTuanDeal,
  getTuanDealList, getTuanDealDetail, getTuanDealOrders, getTuanDealOrderDetail,
  getTuanLeaderList, getTuanLeaderCommissions, getTuanCommissionStats, settleTuanCommissions,
}
