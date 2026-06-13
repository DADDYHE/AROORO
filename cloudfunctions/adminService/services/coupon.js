const { handleSuccess, handleError, generateId, ERROR_CODES, paginate, escapeRegExp } = require('../common/utils')
const { initCloud } = require('../common/utils')
const { createLogger } = require('../common/logger')
const { filterFields, FIELD_WHITELISTS } = require('../common/validator')
const { err } = require('../common/errors')
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

const ALL_BUSINESS_SCOPES = ['activity', 'mall', 'feeding', 'hosting', 'tuan']

function generateCouponCode() {
  const prefix = 'CP'
  const timestamp = Date.now().toString(36).toUpperCase()
  const random = Math.random().toString(36).substr(2, 6).toUpperCase()
  return `${prefix}${timestamp}${random}`
}

function calculateCouponDiscount(coupon, orderAmount) {
  const { type, rules } = coupon
  if (!rules) {return { eligible: false, message: '优惠券规则缺失' }}

  if (rules.threshold && orderAmount < rules.threshold) {
    return { eligible: false, message: `订单金额未达到满${rules.threshold}元使用门槛` }
  }

  let discountAmount = 0
  switch (type) {
  case 'fixed_amount':
  case 'full_reduction':
    discountAmount = rules.reduceAmount || 0
    break
  case 'discount':
    discountAmount = orderAmount * (1 - (rules.discountRate || 1))
    if (rules.maxReduceAmount && rules.maxReduceAmount > 0) {
      discountAmount = Math.min(discountAmount, rules.maxReduceAmount)
    }
    break
  default:
    return { eligible: false, message: '未知优惠券类型' }
  }

  discountAmount = Math.min(discountAmount, orderAmount)
  discountAmount = Math.round(discountAmount * 100) / 100

  return { eligible: true, discountAmount }
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

  // active/paused/ended 状态下：
  // - 允许调整 stock + perUserLimit（高频管理需求）
  // - 允许切换领取相关设置 claimable/popupEnabled/popupPage
  // - 其他字段（name/type/rules/...）忽略，避免影响已发放的券
  const alwaysAllowedInService = ['claimable', 'perUserLimit', 'popupEnabled', 'popupPage', 'stock']
  const systemFields = ['action', 'data', 'adminOpenid', 'timestamp', 'token', 'HTTP_CONTEXT']
  if (template.status !== 'draft') {
    const disallowedKeys = Object.keys(event).filter(
      k => k !== 'templateId' && !alwaysAllowedInService.includes(k) && !systemFields.includes(k)
    )
    if (disallowedKeys.length > 0) {
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
  }

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
    // 用普通查询统计已领取和已使用数量
    for (const t of list) {
      const [claimedRes, usedRes] = await Promise.all([
        db.collection('user_coupons').where({ templateId: t._id }).count(),
        db.collection('user_coupons').where({ templateId: t._id, status: 'used' }).count(),
      ])
      t.totalCount = t.stock || 0
      t.claimedCount = claimedRes.total || 0
      t.usedCount = usedRes.total || 0
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

  const grantQuantity = Math.min(userIds.length, template.remaining)
  const grant = {
    templateId,
    templateName: template.name,
    grantType: grantType || 'manual_batch',
    userIds,
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

  for (const targetOpenid of userIds) {
    if (successCount >= template.remaining) {
      errorLog.push({ targetOpenid, reason: '库存不足' })
      failedCount++
      continue
    }

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
        failedCount++
        continue
      }

      const startTime = template.validFrom ? new Date(template.validFrom) : now
      let endTime
      if (template.validDays) {
        endTime = new Date(now.getTime() + template.validDays * 24 * 60 * 60 * 1000)
      } else if (template.validTo) {
        endTime = new Date(template.validTo)
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
      successCount++
    } catch (e) {
      errorLog.push({ targetOpenid, reason: e.message || '发放异常' })
      failedCount++
    }
  }

  await db.collection('coupon_templates').doc(templateId).update({
    data: { remaining: _.inc(-successCount), updatedAt: db.serverDate() },
  })

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

async function getGrantList(event, context, auth) {
  const { templateId, keyword, page = 1, pageSize = 20 } = event
  const where = {}
  if (templateId) { where.templateId = templateId }
  if (keyword) { where.templateName = db.RegExp({ regexp: escapeRegExp(keyword), options: 'i' }) }

  const result = await paginate(db, 'user_coupons', {
    page, pageSize, where,
    orderBy: { field: 'receivedAt', direction: 'desc' },
  })

  return handleSuccess(result)
}

async function getGrantDetail(event, context, auth) {
  const { grantId } = event
  if (!grantId) {throw err('INVALID_PARAMS', '缺少发放ID')}
  const res = await db.collection('coupon_grants').doc(grantId).get()
  if (!res.data) {throw err('NOT_FOUND', '发放记录不存在')}
  return handleSuccess(res.data)
}

// ==================== 用户优惠券管理 ====================

async function getUserCouponList(event, context, auth) {
  const { ownerId, status, templateId, page = 1, pageSize = 20 } = event
  const where = {}
  if (ownerId) {where.ownerId = ownerId}
  if (status) {where.status = status}
  if (templateId) {where.templateId = templateId}

  const result = await paginate(db, 'user_coupons', {
    page, pageSize, where,
    orderBy: { field: 'createdAt', direction: 'desc' },
  })
  return handleSuccess(result)
}

async function grantCouponToUser(event, context, auth) {
  const { templateId, ownerId } = event
  if (!templateId || !ownerId) {throw err('INVALID_PARAMS', '缺少模板ID或用户ID')}

  return await createCouponGrant({
    templateId,
    grantType: 'manual_single',
    userIds: [ownerId],
    note: '手动单独发放',
  }, context, auth)
}

async function revokeUserCoupon(event, context, auth) {
  const { couponId } = event
  if (!couponId) {throw err('INVALID_PARAMS', '缺少优惠券ID')}

  const couponRes = await db.collection('user_coupons').where({ _id: couponId }).limit(1).get()
  if (!couponRes.data || couponRes.data.length === 0) {throw err('COUPON_NOT_FOUND', '优惠券不存在')}

  const coupon = couponRes.data[0]
  if (coupon.status !== 'unused') {
    throw err('BUSINESS_ERROR', '仅可撤销未使用的优惠券')
  }

  if (!_canManageScope(auth, coupon.applicableScopes)) {
    throw err('PERMISSION_DENIED', '无权管理此优惠券的业务范围')
  }

  await db.collection('user_coupons').doc(couponId).update({
    data: { status: 'revoked', updatedAt: db.serverDate() },
  })

  await writeOperationLog({
    module: 'user_coupon',
    action: 'revoke',
    targetId: couponId,
    targetName: coupon.templateName,
    operatorId: auth.openid,
    operatorName: auth.nickName || auth.openid,
    beforeData: { status: 'unused' },
    afterData: { status: 'revoked' },
    remark: '管理员撤销优惠券',
  })

  return handleSuccess(null, '撤销成功')
}

async function batchRevokeUserCoupons(event, context, auth) {
  const { couponIds } = event
  if (!couponIds || !couponIds.length) {throw err('INVALID_PARAMS', '缺少优惠券ID列表')}

  let successCount = 0
  let failedCount = 0

  for (const couponId of couponIds) {
    try {
      const couponRes = await db.collection('user_coupons').where({ _id: couponId }).limit(1).get()
      if (!couponRes.data || couponRes.data.length === 0 || couponRes.data[0].status !== 'unused') {
        failedCount++
        continue
      }
      if (!_canManageScope(auth, couponRes.data[0].applicableScopes)) {
        failedCount++
        continue
      }
      await db.collection('user_coupons').doc(couponId).update({
        data: { status: 'revoked', updatedAt: db.serverDate() },
      })
      successCount++
    } catch (e) {
      failedCount++
    }
  }

  return handleSuccess({ successCount, failedCount }, `成功撤销 ${successCount} 张，失败 ${failedCount} 张`)
}

// ==================== 统计 ====================

async function getScopeStatistics(event, context, auth) {
  const { scope } = event
  if (!scope) {throw err('INVALID_PARAMS', '缺少scope')}

  const templateWhere = {}
  if (scope !== 'general') {
    templateWhere.applicableScopes = _.in([scope])
  }

  const [totalTemplates, activeTemplates] = await Promise.all([
    db.collection('coupon_templates').where(templateWhere).count(),
    db.collection('coupon_templates').where({ ...templateWhere, status: 'active' }).count(),
  ])

  const couponWhere = scope !== 'general' ? { applicableScopes: _.in([scope]) } : {}

  const [issuedCount, usedCount, expiredCount, revokedCount] = await Promise.all([
    db.collection('user_coupons').where(couponWhere).count(),
    db.collection('user_coupons').where({ ...couponWhere, status: 'used' }).count(),
    db.collection('user_coupons').where({ ...couponWhere, status: 'expired' }).count(),
    db.collection('user_coupons').where({ ...couponWhere, status: 'revoked' }).count(),
  ])

  const usageWhere = scope !== 'general' ? { businessType: scope } : {}
  const usageRes = await db.collection('coupon_usage').where(usageWhere).get()
  const totalDiscountAmount = usageRes.data.reduce((sum, u) => sum + (u.discountAmount || 0), 0)

  const templates = await db.collection('coupon_templates')
    .where({ ...templateWhere, status: _.in(['active', 'paused', 'ended']) })
    .orderBy('createdAt', 'desc')
    .limit(5)
    .get()

  const topTemplates = await Promise.all(templates.data.map(async t => {
    const [tIssued, tUsed] = await Promise.all([
      db.collection('user_coupons').where({ templateId: t._id }).count(),
      db.collection('user_coupons').where({ templateId: t._id, status: 'used' }).count(),
    ])
    const tDiscountRes = await db.collection('coupon_usage').where({ templateId: t._id }).get()
    const tDiscount = tDiscountRes.data.reduce((sum, u) => sum + (u.discountAmount || 0), 0)
    return {
      _id: t._id,
      name: t.name,
      type: t.type,
      status: t.status,
      issued: tIssued.total,
      used: tUsed.total,
      usageRate: tIssued.total > 0 ? Math.round((tUsed.total / tIssued.total) * 10000) / 100 : 0,
      totalDiscount: Math.round(tDiscount * 100) / 100,
    }
  }))

  const issued = issuedCount.total
  const used = usedCount.total

  return handleSuccess({
    templates: { total: totalTemplates.total, active: activeTemplates.total },
    coupons: {
      issued, used,
      expired: expiredCount.total,
      revoked: revokedCount.total,
      usageRate: issued > 0 ? Math.round((used / issued) * 10000) / 100 : 0,
    },
    amount: { totalDiscount: Math.round(totalDiscountAmount * 100) / 100 },
    topTemplates,
  })
}

async function getOperationLogList(event, context, auth) {
  const { module, action, operatorId, page = 1, pageSize = 20 } = event
  const where = {}
  if (module) {where.module = module}
  if (action) {where.action = action}
  if (operatorId) {where.operatorId = operatorId}

  const result = await paginate(db, 'operation_logs', {
    page, pageSize, where,
    orderBy: { field: 'createdAt', direction: 'desc' },
  })
  return handleSuccess(result)
}

module.exports = {
  // 模板管理
  createCouponTemplate, updateCouponTemplate, deleteCouponTemplate,
  toggleCouponTemplateStatus, cloneCouponTemplate,
  getTemplateList, getTemplateDetail,
  // 发放管理
  createCouponGrant, getGrantList, getGrantDetail,
  // 用户优惠券
  getUserCouponList, grantCouponToUser, revokeUserCoupon, batchRevokeUserCoupons,
  // 统计
  getScopeStatistics, getOperationLogList,
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
  ]

  const results = []
  for (const idx of indexes) {
    try {
      await db.collection(idx.collection).createIndex({
        index: { keys: idx.keys },
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
