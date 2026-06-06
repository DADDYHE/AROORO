const { initCloud, handleSuccess, handleError, generateId, ERROR_CODES, paginate } = require('./common/utils')
const { createLogger } = require('./common/logger')
const { verifyAuth } = require('./common/auth-middleware')
const { err } = require('./common/errors')

const { db } = initCloud()
const logger = createLogger('couponService')
const _ = db.command

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

async function getMyCoupons(event, context, auth) {
  const { status, page = 1, pageSize = 20 } = event
  const where = { ownerId: auth.openid }

  if (status) {
    where.status = status
  }

  const result = await paginate(db, 'user_coupons', {
    page, pageSize, where,
    orderBy: { field: 'createdAt', direction: 'desc' },
  })
  return handleSuccess(result)
}

async function getAvailableCoupons(event, context, auth) {
  const { business, items, amount } = event
  if (!business) {throw err('INVALID_PARAMS', '缺少业务类型')}

  const now = new Date()

  const couponWhere = {
    ownerId: auth.openid,
    status: 'unused',
    startTime: _.lte(now),
    endTime: _.gte(now),
    applicableScopes: _.or([
      _.eq([]),
      _.size(0),
      _.in([business]),
    ]),
  }

  const coupons = await db.collection('user_coupons').where(couponWhere).get()

  const available = []
  for (const coupon of coupons.data) {
    if (items && items.length > 0 && coupon.applicableItemIds && coupon.applicableItemIds.length > 0) {
      const hasMatch = items.some(item => coupon.applicableItemIds.includes(item))
      if (!hasMatch) {continue}
    }

    const result = calculateCouponDiscount(coupon, amount || 0)
    if (result.eligible) {
      available.push({
        _id: coupon._id,
        templateId: coupon.templateId,
        templateName: coupon.templateName,
        couponCode: coupon.couponCode,
        type: coupon.type,
        rules: coupon.rules,
        discountAmount: result.discountAmount,
        endTime: coupon.endTime,
      })
    }
  }

  available.sort((a, b) => b.discountAmount - a.discountAmount)
  return handleSuccess(available)
}

async function getClaimableTemplates(event, context, auth) {
  const { business, page = 1, pageSize = 20 } = event

  const where = {
    status: 'active',
    claimable: true,
    remaining: _.gt(0),
  }
  if (business) {
    where.applicableScopes = _.in([business])
  }

  const result = await paginate(db, 'coupon_templates', {
    page, pageSize, where,
    orderBy: { field: 'createdAt', direction: 'desc' },
  })

  // 补充每个模板当前用户已领取数量
  if (result.list && result.list.length > 0) {
    const templateIds = result.list.map(t => t._id)
    const claimedRes = await db.collection('user_coupons')
      .where({ templateId: _.in(templateIds), ownerId: auth.openid, status: _.in(['unused', 'locked']) })
      .get()
    const claimedMap = {}
    for (const c of claimedRes.data) {
      claimedMap[c.templateId] = (claimedMap[c.templateId] || 0) + 1
    }
    for (const t of result.list) {
      t.claimedCount = claimedMap[t._id] || 0
      t.canClaim = t.claimedCount < (t.perUserLimit || 1)
    }
  }

  return handleSuccess(result)
}

async function claimCoupon(event, context, auth) {
  const { templateId } = event
  if (!templateId) {throw err('INVALID_PARAMS', '缺少模板ID')}

  const templateRes = await db.collection('coupon_templates').where({ _id: templateId }).limit(1).get()
  if (templateRes.data.length === 0) {throw err('NOT_FOUND', '模板不存在')}

  const template = templateRes.data[0]
  if (template.status !== 'active') {throw err('BUSINESS_ERROR', '模板未启用')}
  if (template.remaining <= 0) {throw err('BUSINESS_ERROR', '优惠券已领完')}

  // claimable 仅限制领券中心主动领取，弹窗/手动发放不受此限制
  const source = event.source || 'claim'
  if (source === 'claim' && !template.claimable) {throw err('BUSINESS_ERROR', '该优惠券不支持领取')}

  const existingCount = await db.collection('user_coupons')
    .where({ templateId, ownerId: auth.openid, status: _.in(['unused', 'locked']) })
    .count()
  if (existingCount.total >= template.perUserLimit) {
    throw err('COUPON_LIMIT_REACHED', `每人限领${template.perUserLimit}张`)
  }

  const now = new Date()
  const startTime = template.validFrom ? new Date(template.validFrom) : now
  let endTime
  if (template.validDays) {
    endTime = new Date(now.getTime() + template.validDays * 24 * 60 * 60 * 1000)
  } else if (template.validTo) {
    endTime = new Date(template.validTo)
  } else {
    endTime = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
  }

  if (endTime <= now) {throw err('BUSINESS_ERROR', '该优惠券已过期')}

  const coupon = {
    templateId,
    templateName: template.name,
    ownerId: auth.openid,
    couponCode: generateCouponCode(),
    type: template.type,
    rules: template.rules,
    applicableScopes: template.applicableScopes,
    applicableItemIds: template.applicableItemIds,
    status: 'unused',
    source,
    receivedAt: db.serverDate(),
    startTime,
    endTime,
    createdAt: db.serverDate(),
    updatedAt: db.serverDate(),
  }

  coupon._id = generateId('coupon', auth.openid)
  await db.collection('user_coupons').add({ data: coupon })
  await db.collection('coupon_templates').doc(templateId).update({
    data: { remaining: _.inc(-1), updatedAt: db.serverDate() },
  })

  await db.collection('operation_logs').add({
    data: {
      module: 'user_coupon',
      action: 'claim',
      targetId: coupon._id,
      targetName: template.name,
      operatorId: auth.openid,
      operatorName: auth.nickName || auth.openid,
      afterData: coupon,
      createdAt: db.serverDate(),
    },
  })

  return handleSuccess(coupon, '领取成功')
}

async function lockCoupon(event, context, auth) {
  const { couponId, orderId, orderType, business } = event
  if (!couponId) {throw err('INVALID_PARAMS', '缺少优惠券ID')}
  if (!orderId) {throw err('INVALID_PARAMS', '缺少订单ID')}

  const couponRes = await db.collection('user_coupons').where({ _id: couponId }).limit(1).get()
  if (couponRes.data.length === 0) {throw err('NOT_FOUND', '优惠券不存在')}

  const coupon = couponRes.data[0]
  if (coupon.ownerId !== auth.openid) {throw err('PERMISSION_DENIED', '无权操作此优惠券')}
  if (coupon.status !== 'unused') {throw err('COUPON_STATUS_INVALID', `当前状态: ${coupon.status}`)}

  const now = new Date()
  if (coupon.startTime && now < new Date(coupon.startTime)) {throw err('BUSINESS_ERROR', '优惠券尚未生效')}
  if (coupon.endTime && now > new Date(coupon.endTime)) {throw err('BUSINESS_ERROR', '优惠券已过期')}

  await db.collection('user_coupons').doc(couponId).update({
    data: {
      status: 'locked',
      updatedAt: db.serverDate(),
    },
  })

  await db.collection('operation_logs').add({
    data: {
      module: 'user_coupon',
      action: 'lock',
      targetId: couponId,
      targetName: coupon.templateName,
      operatorId: auth.openid,
      operatorName: auth.nickName || auth.openid,
      beforeData: { status: 'unused' },
      afterData: { status: 'locked', orderId, business: business || orderType },
      createdAt: db.serverDate(),
    },
  })

  return handleSuccess(null, '优惠券已锁定')
}

async function useCoupon(event, context, auth) {
  const { couponId, orderId, business, originalAmount, discountAmount, finalAmount } = event
  if (!couponId) {throw err('INVALID_PARAMS', '缺少优惠券ID')}

  const couponRes = await db.collection('user_coupons').where({ _id: couponId }).limit(1).get()
  if (couponRes.data.length === 0) {throw err('NOT_FOUND', '优惠券不存在')}

  const coupon = couponRes.data[0]
  if (coupon.ownerId !== auth.openid) {throw err('PERMISSION_DENIED', '无权操作此优惠券')}
  if (coupon.status !== 'locked') {throw err('COUPON_STATUS_INVALID', `当前状态: ${coupon.status}`)}

  await db.collection('user_coupons').doc(couponId).update({
    data: {
      status: 'used',
      usedAt: db.serverDate(),
      usedOrderId: orderId || '',
      usedBusiness: business || '',
      updatedAt: db.serverDate(),
    },
  })

  const usageRecord = {
    userCouponId: couponId,
    templateId: coupon.templateId,
    ownerId: auth.openid,
    orderId: orderId || '',
    businessType: business || '',
    originalAmount: originalAmount || 0,
    discountAmount: discountAmount || 0,
    finalAmount: finalAmount || 0,
    usedAt: db.serverDate(),
    createdAt: db.serverDate(),
  }
  usageRecord._id = generateId('coupon', auth.openid)
  await db.collection('coupon_usage').add({ data: usageRecord })

  await db.collection('operation_logs').add({
    data: {
      module: 'user_coupon',
      action: 'use',
      targetId: couponId,
      targetName: coupon.templateName,
      operatorId: auth.openid,
      operatorName: auth.nickName || auth.openid,
      beforeData: { status: 'locked' },
      afterData: { status: 'used', orderId: orderId || '', discountAmount: discountAmount || 0 },
      createdAt: db.serverDate(),
    },
  })

  return handleSuccess(null, '优惠券已核销')
}

async function unlockCoupon(event, context, auth) {
  const { couponId } = event
  if (!couponId) {throw err('INVALID_PARAMS', '缺少优惠券ID')}

  const couponRes = await db.collection('user_coupons').where({ _id: couponId }).limit(1).get()
  if (couponRes.data.length === 0) {throw err('NOT_FOUND', '优惠券不存在')}

  const coupon = couponRes.data[0]
  if (coupon.ownerId !== auth.openid) {throw err('PERMISSION_DENIED', '无权操作此优惠券')}
  if (coupon.status !== 'locked') {throw err('COUPON_STATUS_INVALID', `当前状态: ${coupon.status}`)}

  const now = new Date()
  const isExpired = coupon.endTime && new Date(coupon.endTime) < now
  const newStatus = isExpired ? 'expired' : 'unused'

  await db.collection('user_coupons').doc(couponId).update({
    data: {
      status: newStatus,
      updatedAt: db.serverDate(),
    },
  })

  await db.collection('operation_logs').add({
    data: {
      module: 'user_coupon',
      action: 'unlock',
      targetId: couponId,
      targetName: coupon.templateName,
      operatorId: auth.openid,
      operatorName: auth.nickName || auth.openid,
      beforeData: { status: 'locked' },
      afterData: { status: newStatus },
      createdAt: db.serverDate(),
    },
  })

  return handleSuccess(null, isExpired ? '优惠券已过期' : '优惠券已退回')
}

async function getPopupCoupon(event, context, auth) {
  const { page } = event
  if (!page) {throw err('INVALID_PARAMS', '缺少页面标识')}

  const templates = await db.collection('coupon_templates')
    .where({ status: 'active', popupEnabled: true, popupPage: page, remaining: _.gt(0) })
    .orderBy('createdAt', 'desc')
    .limit(5)
    .get()

  if (!templates.data || templates.data.length === 0) {
    return handleSuccess(null)
  }

  // 检查用户是否已领取过
  const templateIds = templates.data.map(t => t._id)
  const claimedRes = await db.collection('user_coupons')
    .where({ templateId: _.in(templateIds), ownerId: auth.openid, status: _.in(['unused', 'locked']) })
    .get()

  const claimedSet = new Set(claimedRes.data.map(c => c.templateId))
  const available = templates.data.find(t => !claimedSet.has(t._id))

  if (!available) {
    return handleSuccess(null)
  }

  return handleSuccess({
    templateId: available._id,
    name: available.name,
    type: available.type,
    rules: available.rules,
    applicableScopes: available.applicableScopes,
    remaining: available.remaining,
    validDays: available.validDays,
    perUserLimit: available.perUserLimit,
    canClaim: true,
  })
}

const handlers = {
  getMyCoupons,
  getAvailableCoupons,
  getClaimableTemplates,
  getPopupCoupon,
  claimCoupon,
  lockCoupon,
  useCoupon,
  unlockCoupon,
}

async function _main(event, context) {
  const { action } = event
  if (!action || !handlers[action]) {
    throw err('INVALID_PARAMS', '无效的操作类型')
  }

  try {
    const auth = await verifyAuth(event, context)
    if (auth.error) {return auth}

    logger.info(`[${action}]`, { ownerId: auth.openid })
    return await handlers[action](event, context, auth)
  } catch (error) {
    logger.error(`[${action}]`, error)
    // 透传 BusinessError 错误码
    if (error && error.code && error.severity) {
      const numericCode = ERROR_CODES[error.severity] || ERROR_CODES.BUSINESS
      return handleError(error, error.message || '操作失败', numericCode)
    }
    return handleError(error, error.message || '服务器错误', ERROR_CODES.SERVER)
  }
}

exports.main = _main
module.exports.main = _main
module.exports.calculateCouponDiscount = calculateCouponDiscount
module.exports.generateCouponCode = generateCouponCode
