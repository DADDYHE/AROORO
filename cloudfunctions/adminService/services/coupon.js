const { handleSuccess, handleError, generateId, ERROR_CODES, paginate, escapeRegExp } = require('../common/utils')
const { initCloud } = require('../common/utils')
const { createLogger } = require('../common/logger')
const { filterFields, FIELD_WHITELISTS } = require('../common/validator')
const { err } = require('../common/errors')
const { parseBJTime } = require('./_bjtime')
// 统一 best-effort 审计日志（详见 common/operation-log）
const { writeOperationLog: _commonWriteOperationLog } = require('../common/operation-log')

const { db } = initCloud()
const _ = db.command
const logger = createLogger('adminService:coupon')

const TEMPLATE_STATUS_TRANSITIONS = {
  draft: ['active'],
  active: ['paused', 'ended'],
  paused: ['active', 'ended'],
  ended: [],
}

const ALL_BUSINESS_SCOPES = ['activity', 'mall', 'feeding', 'boarding', 'tuan']

function generateCouponCode() {
  const prefix = 'CP'
  const timestamp = Date.now().toString(36).toUpperCase()
  const random = Math.random().toString(36).substr(2, 6).toUpperCase()
  return `${prefix}${timestamp}${random}`
}

function calculateCouponDiscount(coupon, orderAmount) {
  const { type, rules } = coupon
  if (!rules) {return { eligible: false, message: '优惠券规则缺失' }}

  // 统一转整数分计算，避免 `orderAmount * (1 - discountRate)` 浮点漂移，以及封顶比较的 epsilon 误差
  const orderAmountInFen = Math.round(orderAmount * 100)

  // R3: threshold 用分比较，与分计算口径一致（元比较可能与分计算结果错位）
  if (rules.threshold && orderAmountInFen < Math.round(rules.threshold * 100)) {
    return { eligible: false, message: `订单金额未达到满${rules.threshold}元使用门槛` }
  }

  let discountInFen = 0
  switch (type) {
  case 'fixed_amount':
  case 'full_reduction':
    discountInFen = Math.round((rules.reduceAmount || 0) * 100)
    break
  case 'discount': {
    const discountRate = Number(rules.discountRate) || 1
    discountInFen = Math.round(orderAmountInFen * (1 - discountRate))
    if (rules.maxReduceAmount && rules.maxReduceAmount > 0) {
      // 封顶也走分维度，避免浮点 epsilon 导致封顶被突破
      discountInFen = Math.min(discountInFen, Math.round(rules.maxReduceAmount * 100))
    }
    break
  }
  default:
    return { eligible: false, message: '未知优惠券类型' }
  }

  discountInFen = Math.min(discountInFen, orderAmountInFen)
  return { eligible: true, discountAmount: discountInFen / 100 }
}

// 统一 best-effort 审计日志：直接走 common/operation-log，本文件不再持有独立实现
const writeOperationLog = _commonWriteOperationLog

function _canManageScope(auth, scopes) {
  if (!scopes || scopes.length === 0) {return true}
  // 合作伙伴 / 超级管理员可管理所有业务范围
  if (auth.isPartner || auth.isSuperAdmin) {return true}
  // 细粒度权限：coupon 权限或 super_admin 角色
  if (auth.roles?.includes('super_admin') || auth.permissions?.includes('coupon')) {return true}
  return false
}

// ==================== 模板管理 ====================

/**
 * 计算库存调整后应保持的 remaining
 * @param {number} newStock 用户传入的新发放总量
 * @param {number} oldStock 当前 DB 里的 stock
 * @param {number} oldRemaining 当前 DB 里的 remaining
 * @returns {{newStock: number, distributedCount: number, newRemaining: number}}
 */
function computeStockSync(newStock, oldStock, oldRemaining) {
  const safeNewStock = Number.isFinite(newStock) ? Math.max(0, newStock) : 0
  const safeOldStock = Number.isFinite(oldStock) ? Math.max(0, oldStock) : 0
  const safeOldRemaining = Number.isFinite(oldRemaining) ? Math.max(0, oldRemaining) : 0
  const distributedCount = Math.max(0, safeOldStock - safeOldRemaining)
  const newRemaining = Math.max(0, safeNewStock - distributedCount)
  return { newStock: safeNewStock, distributedCount, newRemaining }
}
exports.computeStockSync = computeStockSync

async function createCouponTemplate(event, context, auth) {
  const {
    name, type, rules, applicableScopes, applicableItemIds,
    stock, perUserLimit, validFrom, validTo, validDays,
    description, useRules, coverImage, claimable,
    popupEnabled, popupPage,
  } = event

  if (!name) {throw err('INVALID_PARAMS', '缺少模板名称')}
  if (!type || !['full_reduction', 'discount', 'fixed_amount'].includes(type)) {
    throw err('INVALID_PARAMS', '无效的优惠券类型')
  }

  if (applicableScopes && applicableScopes.length > 0) {
    for (const s of applicableScopes) {
      if (!ALL_BUSINESS_SCOPES.includes(s)) {
        throw err('INVALID_PARAMS', `无效的业务板块: ${s}`)
      }
    }
  }

  const template = {
    name,
    type,
    rules: rules || { threshold: 0, reduceAmount: 0, discountRate: 1, maxReduceAmount: 0 },
    applicableScopes: applicableScopes || [],
    applicableItemIds: applicableItemIds || [],
    stock: Number(stock) || 0,
    remaining: Number(stock) || 0,
    perUserLimit: Number(perUserLimit) || 1,
    validFrom: validFrom || null,
    validTo: validTo || null,
    validDays: validDays ? Number(validDays) : null,
    status: event.status || 'draft',
    description: description || '',
    useRules: useRules || '',
    coverImage: coverImage || '',
    claimable: Boolean(claimable),
    popupEnabled: Boolean(popupEnabled),
    popupPage: popupPage || '',
    createdBy: auth.openid,
    createdAt: db.serverDate(),
    updatedAt: db.serverDate(),
  }

  template._id = generateId('coupon', auth.openid || auth.adminId)
  const res = await db.collection('coupon_templates').add({ data: template })

  const afterDataForLog = { ...template, createdAt: 'serverDate()', updatedAt: 'serverDate()' }
  await writeOperationLog({
    module: 'coupon_template',
    action: 'create',
    targetId: res._id,
    targetName: name,
    operatorId: auth.openid,
    operatorName: auth.nickName || auth.openid,
    afterData: afterDataForLog,
  })

  return handleSuccess({ id: res._id }, '创建成功')
}

async function updateCouponTemplate(event, context, auth) {
  const { templateId } = event
  if (!templateId) {throw err('INVALID_PARAMS', '缺少模板ID')}

  const existRes = await db.collection('coupon_templates').where({ _id: templateId }).limit(1).get()
  if (!existRes.data || existRes.data.length === 0) {throw err('NOT_FOUND', '模板不存在')}

  const template = existRes.data[0]

  if (!auth.isSuperAdmin && template.createdBy !== auth.openid) {
    throw err('PERMISSION_DENIED', '无权操作他人资源')
  }

  // active/paused/ended 状态下：
  // - 允许调整 stock + perUserLimit（高频管理需求）
  // - 允许切换领取相关设置 claimable/popupEnabled/popupPage
  // - 其他字段（name/type/rules/...）忽略，避免影响已发放的券
  const alwaysAllowedInService = ['claimable', 'perUserLimit', 'popupEnabled', 'popupPage', 'stock']
  if (template.status !== 'draft') {
    // 非草稿模板始终走"服务期字段"分支：只允许调整库存与领取相关设置，
    // 其他字段（name/type/rules/applicableScopes...）一律忽略（防影响已发放的券）。
    const updateData = { updatedAt: db.serverDate() }
    alwaysAllowedInService.forEach(k => {
      if (event[k] !== undefined) {updateData[k] = event[k]}
    })
    // 联动 stock 与 remaining（已发放数 = stock - remaining）
    if (event.stock !== undefined) {
      const sync = computeStockSync(Number(event.stock) || 0, template.stock, template.remaining)
      updateData.remaining = sync.newRemaining
      logger.info('updateTemplate.stockSync', {
        templateId,
        oldStock: template.stock,
        oldRemaining: template.remaining,
        newStock: sync.newStock,
        distributedCount: sync.distributedCount,
        newRemaining: sync.newRemaining,
      })
    }
    await db.collection('coupon_templates').doc(templateId).update({ data: updateData })
    return handleSuccess(null, '已更新库存与领取设置')
  }

  // 草稿状态：允许全量编辑（走字段白名单，防注入多余字段）
  const beforeData = { ...template }
  const updateData = { updatedAt: db.serverDate(), ...filterFields(FIELD_WHITELISTS.couponTemplate, event) }

  if (event.stock !== undefined) {
    const sync = computeStockSync(Number(event.stock) || 0, template.stock, template.remaining)
    updateData.stock = sync.newStock
    updateData.remaining = sync.newRemaining
  }

  await db.collection('coupon_templates').doc(templateId).update({ data: updateData })

  await writeOperationLog({
    module: 'coupon_template',
    action: 'update',
    targetId: templateId,
    targetName: template.name,
    operatorId: auth.openid,
    operatorName: auth.nickName || auth.openid,
    beforeData,
    afterData: updateData,
  })

  return handleSuccess(null, '更新成功')
}

async function deleteCouponTemplate(event, context, auth) {
  const { templateId } = event
  if (!templateId) {throw err('INVALID_PARAMS', '缺少模板ID')}

  const existRes = await db.collection('coupon_templates').where({ _id: templateId }).limit(1).get()
  if (!existRes.data || existRes.data.length === 0) {throw err('NOT_FOUND', '模板不存在')}
  if (existRes.data[0].status !== 'draft') {
    throw err('BUSINESS_ERROR', '仅草稿状态的模板可删除')
  }

  await db.collection('coupon_templates').doc(templateId).remove()

  await writeOperationLog({
    module: 'coupon_template',
    action: 'delete',
    targetId: templateId,
    targetName: existRes.data[0].name,
    operatorId: auth.openid,
    operatorName: auth.nickName || auth.openid,
    beforeData: existRes.data[0],
  })

  return handleSuccess(null, '删除成功')
}

async function toggleCouponTemplateStatus(event, context, auth) {
  const { templateId, operation } = event
  if (!templateId) {throw err('INVALID_PARAMS', '缺少模板ID')}
  if (!operation || !['start', 'pause', 'end'].includes(operation)) {
    throw err('INVALID_PARAMS', '支持的操作: start | pause | end')
  }

  const existRes = await db.collection('coupon_templates').where({ _id: templateId }).limit(1).get()
  if (!existRes.data || existRes.data.length === 0) {throw err('NOT_FOUND', '模板不存在')}

  const template = existRes.data[0]
  let newStatus
  switch (operation) {
  case 'start': newStatus = 'active'; break
  case 'pause': newStatus = 'paused'; break
  case 'end': newStatus = 'ended'; break
  }

  const allowed = TEMPLATE_STATUS_TRANSITIONS[template.status]
  if (!allowed || !allowed.includes(newStatus)) {
    throw err('STATE_INVALID', `无法从 ${template.status} 变更为 ${newStatus}`)
  }

  if (newStatus === 'active' && template.remaining <= 0) {
    throw err('BUSINESS_ERROR', '无法启用：库存已用完')
  }

  const actionMap = { start: 'start', pause: 'pause', end: 'end' }

  await db.collection('coupon_templates').doc(templateId).update({
    data: { status: newStatus, updatedAt: db.serverDate() },
  })

  await writeOperationLog({
    module: 'coupon_template',
    action: actionMap[operation],
    targetId: templateId,
    targetName: template.name,
    operatorId: auth.openid,
    operatorName: auth.nickName || auth.openid,
    beforeData: { status: template.status },
    afterData: { status: newStatus },
    remark: operation === 'start' ? '启用模板' : operation === 'pause' ? '暂停模板' : '终止模板',
  })

  return handleSuccess(null, '操作成功')
}

async function cloneCouponTemplate(event, context, auth) {
  const { templateId } = event
  if (!templateId) {throw err('INVALID_PARAMS', '缺少模板ID')}

  const source = await db.collection('coupon_templates').where({ _id: templateId }).limit(1).get()
  if (!source.data || source.data.length === 0) {throw err('NOT_FOUND', '模板不存在')}

  const cloned = { ...source.data[0] }
  delete cloned._id
  cloned.name = `${cloned.name || ''}（副本）`
  cloned.status = 'draft'
  cloned.remaining = cloned.stock
  cloned.createdBy = auth.openid
  cloned.createdAt = db.serverDate()
  cloned.updatedAt = db.serverDate()

  cloned._id = generateId('coupon', auth.openid || auth.adminId)
  const res = await db.collection('coupon_templates').add({ data: cloned })

  await writeOperationLog({
    module: 'coupon_template',
    action: 'create',
    targetId: res._id,
    targetName: cloned.name,
    operatorId: auth.openid,
    operatorName: auth.nickName || auth.openid,
    remark: `从模板 ${source.data[0].name} 复制`,
  })

  return handleSuccess({ id: res._id }, '复制成功')
}

async function getTemplateList(event, context, auth) {
  const { page = 1, pageSize = 20, status, scope, keyword } = event
  const where = {}

  if (status) {
    if (typeof status === 'string' && status.includes(',')) {
      where.status = _.in(status.split(','))
    } else {
      where.status = status
    }
  }

  if (keyword) {
    where.name = db.RegExp({ regexp: escapeRegExp(keyword), options: 'i' })
  }

  if (scope && (auth.roles?.includes('super_admin') || auth.permissions?.includes('coupon'))) {
    where.applicableScopes = _.or([_.in([scope]), _.exists(false), _.eq([])])
  }

  if (event.isGeneral && (auth.roles?.includes('super_admin') || auth.permissions?.includes('coupon'))) {
    where.applicableScopes = _.or([_.exists(false), _.eq([])])
  }

  const result = await paginate(db, 'coupon_templates', {
    page, pageSize, where,
    orderBy: { field: 'createdAt', direction: 'desc' },
  })

  const list = result.list || []
  if (list.length > 0) {
    // P3 修复：用 aggregate 按 templateId 分组统计，替代逐模板 N+1 次 count
    //   （原实现每页 20 个模板产生 40 次查询，且无截断风险）
    const ids = list.map(t => t._id).filter(Boolean)
    const $ = _.aggregate
    const countByTemplate = async (extraMatch = {}) => {
      const map = {}
      if (ids.length === 0) { return map }
      try {
        const aggRes = await db.collection('user_coupons')
          .aggregate()
          .match({ templateId: _.in(ids), ...extraMatch })
          .group({ _id: '$templateId', total: $.sum(1) })
          .end()
        for (const r of (aggRes.list || [])) {
          if (r._id) { map[r._id] = Number(r.total) || 0 }
        }
      } catch (e) {
        // aggregate 失败时降级为逐模板 count，保证列表可用
        logger.warn('getTemplateList.aggregate.fallback', { msg: e.message })
        for (const t of list) {
          const c = await db.collection('user_coupons').where({ templateId: t._id, ...extraMatch }).count()
          map[t._id] = c.total || 0
        }
      }
      return map
    }
    const [claimedMap, usedMap] = await Promise.all([countByTemplate(), countByTemplate({ status: 'used' })])
    for (const t of list) {
      t.totalCount = t.stock || 0
      t.claimedCount = claimedMap[t._id] || 0
      t.usedCount = usedMap[t._id] || 0
      logger.info('templateStats', { id: t._id, claimedCount: t.claimedCount, usedCount: t.usedCount })
    }
  }

  return handleSuccess(result)
}

async function getTemplateDetail(event, context, auth) {
  const { templateId } = event
  if (!templateId) {throw err('INVALID_PARAMS', '缺少模板ID')}

  const res = await db.collection('coupon_templates').where({ _id: templateId }).limit(1).get()
  if (!res.data || res.data.length === 0) {throw err('NOT_FOUND', '模板不存在')}

  const template = res.data[0]

  const [distributedCount, usedCount] = await Promise.all([
    db.collection('user_coupons').where({ templateId }).count(),
    db.collection('user_coupons').where({ templateId, status: 'used' }).count(),
  ])

  return handleSuccess({
    ...template,
    distributedCount: distributedCount.total,
    usedCount: usedCount.total,
    usageRate: distributedCount.total > 0
      ? Math.round((usedCount.total / distributedCount.total) * 10000) / 100
      : 0,
  })
}

// ==================== 发放管理 ====================

async function createCouponGrant(event, context, auth) {
  const { templateId, grantType, userIds, note } = event
  if (!templateId) {throw err('INVALID_PARAMS', '缺少模板ID')}
  if (!userIds || !userIds.length) {throw err('INVALID_PARAMS', '缺少目标用户')}

  const recentGrant = await db.collection('coupon_grants')
    .where({ executedBy: auth.openid })
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get()
  if (recentGrant.data && recentGrant.data.length > 0) {
    const lastGrantTime = new Date(recentGrant.data[0].createdAt).getTime()
    const now = Date.now()
    if (now - lastGrantTime < 60000) {
      throw err('BUSINESS_ERROR', '操作过于频繁')
    }
  }

  const templateRes = await db.collection('coupon_templates').where({ _id: templateId }).limit(1).get()
  if (!templateRes.data || templateRes.data.length === 0) {throw err('NOT_FOUND', '模板不存在')}

  const template = templateRes.data[0]
  if (template.status !== 'active') {throw err('BUSINESS_ERROR', '模板未启用，无法发放')}

  // 数据自愈：若 stock > 0 但 remaining 缺失/为 0/为负，自动同步为 stock
  // （保护因 updateCouponTemplate 旧版未联动 remaining 留下的脏数据）
  if (template.stock > 0 && (!Number.isFinite(template.remaining) || template.remaining <= 0)) {
    logger.warn('grantCoupon.autoHealRemaining', {
      templateId,
      stock: template.stock,
      oldRemaining: template.remaining,
    })
    await db.collection('coupon_templates').doc(templateId).update({
      data: { remaining: template.stock, updatedAt: db.serverDate() },
    })
    template.remaining = template.stock
  }

  if (template.remaining <= 0) {throw err('BUSINESS_ERROR', '优惠券库存已用完')}

  if (!_canManageScope(auth, template.applicableScopes)) {
    throw err('PERMISSION_DENIED', '无权管理此模板的业务范围')
  }

  // H8: 单次发放人数上限，防止大批量发放导致云函数超时（15s）/ DoS
  const MAX_GRANT_USERS = 200
  if (userIds.length > MAX_GRANT_USERS) {
    throw err('INVALID_PARAMS', `单次发放用户数不能超过 ${MAX_GRANT_USERS}，请分批发放`)
  }
  const validUserIds = [...new Set(userIds.filter((id) => typeof id === 'string' && id))]
  if (validUserIds.length === 0) { throw err('INVALID_PARAMS', '目标用户列表无效') }

  // H7: 预留式原子扣减库存 —— where(remaining >= n) 条件更新 + inc(-n)，并发发放不会超发。
  // 整批预留失败（库存不足 n）时读取最新库存降低预留量重试，最多 3 次。
  // 发放结束后将未用完的预留量归还（见函数尾部）。
  let reserved = 0
  let attemptRemaining = Number(template.remaining) || 0
  for (let attempt = 0; attempt < 3 && reserved === 0; attempt++) {
    const want = Math.min(validUserIds.length, attemptRemaining)
    if (want <= 0) { break }
    const reserveRes = await db.collection('coupon_templates')
      .where({ _id: templateId, status: 'active', remaining: _.gte(want) })
      .update({ data: { remaining: _.inc(-want), updatedAt: db.serverDate() } })
    if (((reserveRes && reserveRes.stats && reserveRes.stats.updated) || 0) > 0) {
      reserved = want
      break
    }
    // 预留失败：被并发发放抢占，读取最新库存后重试
    try {
      const freshRes = await db.collection('coupon_templates').doc(templateId).field({ remaining: true }).get()
      attemptRemaining = (freshRes.data && Number(freshRes.data.remaining)) || 0
    } catch (_) { attemptRemaining = 0 }
  }
  if (reserved === 0) { throw err('BUSINESS_ERROR', '优惠券库存不足，发放失败') }

  const grantQuantity = reserved
  const grant = {
    templateId,
    templateName: template.name,
    grantType: grantType || 'manual_batch',
    userIds: validUserIds,
    grantQuantity,
    status: 'processing',
    successCount: 0,
    failedCount: 0,
    errorLog: [],
    executedBy: auth.openid,
    note: note || '',
    createdAt: db.serverDate(),
  }

  grant._id = generateId('coupon', auth.openid || auth.adminId)
  const grantRes = await db.collection('coupon_grants').add({ data: grant })
  const grantId = grantRes._id

  let successCount = 0
  let failedCount = 0
  const errorLog = []
  const now = new Date()

  // 单个用户发放逻辑（返回 true=成功 / false=失败并已记录 errorLog）
  const grantToOneUser = async (targetOpenid) => {
    try {
      // perUserLimit 统计：只算"真正占用名额"的券
      //   - unused：用户持有的可用券，占名额
      //   - locked：临时占用（订单未支付），不计入，避免死锁导致无法补发
      //   - expired/used/revoked：已失效，不占名额
      const existingCount = await db.collection('user_coupons')
        .where({ templateId, ownerId: targetOpenid, status: 'unused' })
        .count()
      if (existingCount.total >= template.perUserLimit) {
        errorLog.push({ targetOpenid, reason: `已达领取上限(${template.perUserLimit}张)` })
        return false
      }

      const startTime = template.validFrom ? parseBJTime(template.validFrom) : now
      let endTime
      if (template.validDays) {
        endTime = new Date(now.getTime() + template.validDays * 24 * 60 * 60 * 1000)
      } else if (template.validTo) {
        endTime = parseBJTime(template.validTo)
      } else {
        endTime = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
      }

      const coupon = {
        templateId,
        templateName: template.name,
        ownerId: targetOpenid,
        couponCode: generateCouponCode(),
        type: template.type,
        rules: template.rules,
        applicableScopes: template.applicableScopes,
        applicableItemIds: template.applicableItemIds,
        status: 'unused',
        source: 'manual',
        sourceRef: grantId,
        receivedAt: db.serverDate(),
        startTime,
        endTime,
        createdAt: db.serverDate(),
        updatedAt: db.serverDate(),
      }

      coupon._id = generateId('coupon', targetOpenid)
      await db.collection('user_coupons').add({ data: coupon })
      return true
    } catch (e) {
      errorLog.push({ targetOpenid, reason: e.message || '发放异常' })
      return false
    }
  }

  // H8: 分批并发发放（每批 20），替代串行 await，避免大批量发放时云函数 15s 超时
  const BATCH_SIZE = 20
  let cursor = 0
  while (cursor < validUserIds.length && successCount < reserved) {
    // 每批最多发放剩余预留量，避免超过已预留库存
    const take = Math.min(BATCH_SIZE, reserved - successCount, validUserIds.length - cursor)
    const batch = validUserIds.slice(cursor, cursor + take)
    cursor += take
    const results = await Promise.all(batch.map((openid) => grantToOneUser(openid)))
    successCount += results.filter(Boolean).length
    failedCount += results.filter((r) => !r).length
  }
  // 预留量耗尽后剩余用户直接记为库存不足
  for (let i = cursor; i < validUserIds.length; i++) {
    errorLog.push({ targetOpenid: validUserIds[i], reason: '库存不足' })
    failedCount++
  }

  // H7: 归还未使用的预留库存（预留 reserved，实际成功 successCount）
  const unusedReserved = reserved - successCount
  if (unusedReserved > 0) {
    try {
      await db.collection('coupon_templates').doc(templateId).update({
        data: { remaining: _.inc(unusedReserved), updatedAt: db.serverDate() },
      })
    } catch (e) {
      logger.error('grantCoupon.releaseReserved.failed', {
        templateId, unusedReserved, msg: e?.message,
      })
    }
  }

  await db.collection('coupon_grants').doc(grantId).update({
    data: {
      status: 'completed',
      successCount,
      failedCount,
      errorLog,
      completedAt: db.serverDate(),
    },
  })

  await writeOperationLog({
    module: 'coupon_grant',
    action: 'distribute',
    targetId: grantId,
    targetName: template.name,
    operatorId: auth.openid,
    operatorName: auth.nickName || auth.openid,
    afterData: { grantQuantity, successCount, failedCount },
    remark: note || `发放 ${template.name}`,
  })

  return handleSuccess({ grantId, successCount, failedCount, errorLog }, '发放完成')
}

module.exports = {
  // 模板管理
  createCouponTemplate, updateCouponTemplate, deleteCouponTemplate,
  toggleCouponTemplateStatus, cloneCouponTemplate,
  getTemplateList, getTemplateDetail,
  // 发放管理
  createCouponGrant,
  // 工具函数导出（供 couponService 使用）
  generateCouponCode, calculateCouponDiscount,
  // 索引初始化
  initIndexes,
}

async function initIndexes() {
  const indexes = [
    {
      collection: 'coupon_templates',
      indexName: 'idx_status_createdAt',
      keys: [{ Name: 'status', Direction: '1' }, { Name: 'createdAt', Direction: '-1' }],
      unique: false,
    },
    {
      collection: 'coupon_templates',
      indexName: 'idx_applicableScopes_status',
      keys: [{ Name: 'applicableScopes', Direction: '1' }, { Name: 'status', Direction: '1' }],
      unique: false,
    },
    {
      collection: 'user_coupons',
      indexName: 'idx_ownerId_status',
      keys: [{ Name: 'ownerId', Direction: '1' }, { Name: 'status', Direction: '1' }],
      unique: false,
    },
    {
      collection: 'user_coupons',
      indexName: 'idx_templateId',
      keys: [{ Name: 'templateId', Direction: '1' }],
      unique: false,
    },
    {
      collection: 'user_coupons',
      indexName: 'idx_endTime_status',
      keys: [{ Name: 'endTime', Direction: '1' }, { Name: 'status', Direction: '1' }],
      unique: false,
    },
    {
      // M2: couponExpiryCheck 查询 {status, endTime: {$lt}} 的最优索引
      //   - 等值条件 status 在前，范围条件 endTime 在后（MongoDB 最左前缀原则）
      //   - 也服务于 getMyCoupons（{ownerId, status} 已有 idx_ownerId_status 覆盖）
      collection: 'user_coupons',
      indexName: 'idx_status_endTime',
      keys: [{ Name: 'status', Direction: '1' }, { Name: 'endTime', Direction: '1' }],
      unique: false,
    },
    {
      // P1-2: unlockOrderCoupons 主查询路径 where({ orderId, status: 'locked' })
      //   couponService.lockCoupon 写入 orderId（非 lockedOrderId），2026-08-02 修复后
      //   mallService/orderTimeoutService/orderService 的 unlockOrderCoupons 均按
      //   db.command.or([{orderId},{lockedOrderId}]) 查询，此索引覆盖 orderId 主路径
      //   （lockedOrderId 兼容路径命中旧 idx_lockedOrderId_status，由运维在存量环境保留）
      collection: 'user_coupons',
      indexName: 'idx_orderId_status',
      keys: [{ Name: 'orderId', Direction: '1' }, { Name: 'status', Direction: '1' }],
      unique: false,
    },
    {
      collection: 'coupon_grants',
      indexName: 'idx_executedBy_createdAt',
      keys: [{ Name: 'executedBy', Direction: '1' }, { Name: 'createdAt', Direction: '-1' }],
      unique: false,
    },
    {
      collection: 'coupon_grants',
      indexName: 'idx_templateId',
      keys: [{ Name: 'templateId', Direction: '1' }],
      unique: false,
    },
    // ===== 以下为非 coupon 业务索引，统一在此初始化（adminService 唯一索引入口）=====
    {
      // H2 防超卖:寄养订单 bookingKey 唯一约束,并发重复预订触发 DUPLICATE_KEY
      //   字段真名 bookingKey,寄养订单写 booking_<hostId>_<start>_<end>(见 orderService/orders.ts)
      //   H7 修复:非寄养订单(mall/group_buy/activity/tuan)写 nb_<orderId> 占位,避免 null 冲突
      //   唯一索引要求 orders 全文档 bookingKey 非空且唯一,缺失会导致 -502001 DuplicateKey
      collection: 'orders',
      indexName: 'idx_bookingKey_unique',
      keys: [{ Name: 'bookingKey', Direction: '1' }],
      unique: true,
    },
    {
      // 补偿队列扫描：orderTimeoutService 定时 where(status:'pending').orderBy('createdAt','asc')
      collection: 'failed_operations',
      indexName: 'idx_status_createdAt',
      keys: [{ Name: 'status', Direction: '1' }, { Name: 'createdAt', Direction: '1' }],
      unique: false,
    },
    {
      // M4 事务加速：addresses.setDefault 事务内 where({ openid, isDefault: true })
      collection: 'addresses',
      indexName: 'idx_openid_isDefault',
      keys: [{ Name: 'openid', Direction: '1' }, { Name: 'isDefault', Direction: '1' }],
      unique: false,
    },
    // ===== 钱包/佣金/提现/喂养订单索引（代码化；MCP 已确认 DB 已建，重建/迁移环境需此恢复）=====
    {
      // 钱包按 (openid, type) 查询（getOrCreateWallet / getMyWallet）；(openid, type) 为业务唯一键
      collection: 'wallets',
      indexName: 'idx_openid_type',
      keys: [{ Name: 'openid', Direction: '1' }, { Name: 'type', Direction: '1' }],
      unique: true,
    },
    {
      // 提现记录按 openid 查询 + createdAt 倒序列表
      collection: 'withdrawals',
      indexName: 'idx_openid_createdAt',
      keys: [{ Name: 'openid', Direction: '1' }, { Name: 'createdAt', Direction: '-1' }],
      unique: false,
    },
    {
      // 提现每日限额统计：where({ openid, walletType, createdAt: _.gte(today) })
      collection: 'withdrawals',
      indexName: 'idx_openid_walletType_createdAt',
      keys: [{ Name: 'openid', Direction: '1' }, { Name: 'walletType', Direction: '1' }, { Name: 'createdAt', Direction: '1' }],
      unique: false,
    },
    {
      // 佣金退款冲销：where({ orderId, status })（pending / settled）
      collection: 'commissions',
      indexName: 'idx_orderId_status',
      keys: [{ Name: 'orderId', Direction: '1' }, { Name: 'status', Direction: '1' }],
      unique: false,
    },
    {
      // 佣金列表按邀请人查询（wallet.js 钱包/收入统计）
      collection: 'commissions',
      indexName: 'idx_inviterId',
      keys: [{ Name: 'inviterId', Direction: '1' }],
      unique: false,
    },
    {
      // 佣金幂等键（hasExistingCommission 按 orderId+inviterId 去重），防止重复计佣
      collection: 'commissions',
      indexName: 'idx_orderId_inviterId',
      keys: [{ Name: 'orderId', Direction: '1' }, { Name: 'inviterId', Direction: '1' }],
      unique: true,
    },
    {
      // 喂养订单按喂养师 + 状态查询（钱包/收入统计）
      collection: 'feedingOrders',
      indexName: 'idx_feederId_status',
      keys: [{ Name: 'feederId', Direction: '1' }, { Name: 'status', Direction: '1' }],
      unique: false,
    },
    {
      // 喂养订单按主人 + 状态查询（订单列表 / 邀请统计）
      collection: 'feedingOrders',
      indexName: 'idx_ownerId_status',
      keys: [{ Name: 'ownerId', Direction: '1' }, { Name: 'status', Direction: '1' }],
      unique: false,
    },
    {
      // 喂养订单按主人 + createdAt 倒序（我的订单列表）
      collection: 'feedingOrders',
      indexName: 'idx_ownerId_createdAt',
      keys: [{ Name: 'ownerId', Direction: '1' }, { Name: 'createdAt', Direction: '-1' }],
      unique: false,
    },
  ]

  const results = []
  for (const idx of indexes) {
    try {
      await db.collection(idx.collection).createIndex({
        index: { keys: idx.keys, unique: idx.unique },
        name: idx.indexName,
      })
      results.push({ collection: idx.collection, indexName: idx.indexName, status: 'ok' })
    } catch (e) {
      if (e.message && e.message.includes('already')) {
        results.push({ collection: idx.collection, indexName: idx.indexName, status: 'exists' })
      } else {
        results.push({ collection: idx.collection, indexName: idx.indexName, status: 'error', message: e.message })
      }
    }
  }
  return { results }
}
