const { err } = require('../common/errors')
const { handleSuccess, handleError, generateId, ERROR_CODES, paginate } = require('../common/utils')
const { initCloud } = require('../common/utils')
const { filterFields, FIELD_WHITELISTS } = require('../common/validator')
const { createLogger } = require('../common/logger')
const { recordAlert } = require('../common/alert')
const { FEEDING_ORDER_TRANSITIONS, FEEDING_STATUS_MAP, validateTransition } = require('./stateMachine')
const { createCommissionRecord } = require('./commission')
const { enrichBuyerFields } = require('./_enrichBuyers')

const { cloud, db } = initCloud()
const _ = db.command
const logger = createLogger('adminService:feeding')

async function getFeedingOrders(event, context, auth) {
  const { status, paymentStatus, page = 1, pageSize = 20, startDate, endDate } = event
  const where = {}
  // P2-3 修复：非超管（partner）仅可查看归属自己的喂养订单，避免枚举全量订单（含地址/电话等 PII）
  if (!auth.isSuperAdmin && !auth.roles?.includes('super_admin')) {
    const myId = auth.openid || auth.partnerId || ''
    where.ownerId = myId
  }
  if (status) {where.status = status}
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

  const result = await paginate(db, 'feedingOrders', { page, pageSize, where })

  const list = result.list || []
  const partialEnriched = list.map(order => {
    return {
      ...order,
      orderNo: order.orderNo || order._id || '',
      totalPrice: order.totalAmount || order.totalPrice || 0,
    }
  })

  // 缺失的 buyerNickName 走 users 表 join（按 ownerId）
  const enrichedList = await enrichBuyerFields(db, partialEnriched)

  return handleSuccess({ ...result, list: enrichedList })
}

async function getFeedingOrderDetail(event, context, auth) {
  const orderId = event.orderId || event.data?.orderId
  if (!orderId) {throw err('INVALID_PARAMS', '缺少订单ID')}

  try {
    const orderRes = await db.collection('feedingOrders').where({ _id: orderId }).limit(1).get()
    if (!orderRes.data || orderRes.data.length === 0) {throw err('NOT_FOUND', '订单不存在')}

    const order = orderRes.data[0]
    // P2-3 修复：非超管仅可查看归属自己的订单
    if (!auth.isSuperAdmin && !auth.roles?.includes('super_admin')) {
      const myId = auth.openid || auth.partnerId || ''
      if (order.ownerId !== myId) {
        throw err('PERMISSION_DENIED', '无权查看该订单')
      }
    }

    let userName = ''
    if (order.ownerId) {
      const userRes = await db.collection('users').where({ _id: order.ownerId }).field({ nickName: true }).limit(1).get()
      const user = userRes.data && userRes.data[0]
      if (user) {userName = user.nickName || ''}
    }

    return handleSuccess({
      ...order,
      userName: userName || order.userName || '',
      totalPrice: order.totalAmount || order.totalPrice || 0,
    }, '获取成功')
  } catch (error) {
    return handleError(error, '获取订单详情失败', ERROR_CODES.DATA)
  }
}

async function handleFeedingOrder(event, context, auth) {
  const { orderId, operation } = event
  if (!orderId) {throw err('INVALID_PARAMS', '缺少订单ID')}
  if (!operation) {throw err('INVALID_PARAMS', '缺少操作类型')}
  if (!auth.roles?.includes('super_admin') && !auth.permissions?.includes('feeding')) {
    throw err('PERMISSION_DENIED', '无操作权限')
  }

  const newStatus = FEEDING_STATUS_MAP[operation]
  if (!newStatus) {throw err('INVALID_PARAMS', '无效操作')}

  const orderRes = await db.collection('feedingOrders').doc(orderId).get()
  if (!orderRes.data) {throw err('NOT_FOUND', '订单不存在')}

  // 资源归属校验：super_admin 可操作所有订单；其他角色须为订单归属人
  if (!auth.isSuperAdmin && !auth.roles?.includes('super_admin')) {
    if (orderRes.data.ownerId && orderRes.data.ownerId !== auth.openid && orderRes.data.ownerId !== auth.partnerId) {
      throw err('PERMISSION_DENIED', '无权操作他人资源')
    }
  }

  // 取消操作需校验支付状态：已支付订单不可直接取消（应走退款流程），避免绕过资金流
  if (newStatus === 'cancelled') {
    const paymentStatus = String(orderRes.data.paymentStatus || '').toLowerCase()
    if (paymentStatus === 'paid') {
      throw err('ORDER_STATUS_INVALID', '已支付订单无法直接取消，请申请退款')
    }
    if (paymentStatus !== 'unpaid' && paymentStatus !== '') {
      throw err('ORDER_STATUS_INVALID', `订单支付状态异常：${paymentStatus || '(空)'}`) 
    }
    // 非取消状态变更需订单已支付
  } else if (paymentStatusUnpaid(orderRes.data)) {
    throw err('ORDER_STATUS_INVALID', '订单尚未支付，无法推进业务状态')
  }

  try {
    validateTransition(FEEDING_ORDER_TRANSITIONS, orderRes.data.status, newStatus)
  } catch (e) {
    return handleError(e, e.message, ERROR_CODES.BUSINESS)
  }

  await db.collection('feedingOrders').doc(orderId).update({
    data: { status: newStatus, updatedAt: db.serverDate() },
  })

  if (newStatus === 'completed') {
    try {
      await createCommissionRecord('feeding', orderRes.data)
    } catch (commissionErr) {
      logger.error('handleFeedingOrder.commission.failed', {
        orderId, msg: commissionErr && commissionErr.message,
      })
      try {
        await recordAlert('critical', 'feeding.admin.handle.completed.commission.failed',
          '后台完成喂养订单时佣金记录失败，需人工核对',
          { orderId, orderNo: orderRes.data.orderNo, totalAmount: orderRes.data.totalAmount,
            error: commissionErr && commissionErr.message })
      } catch (_) { /* best-effort */ }
    }
  }

  // 取消未支付订单时解锁优惠券（与 feedingService.updateFeedingOrderStatus 对称）
  if (newStatus === 'cancelled' && paymentStatusUnpaid(orderRes.data) && orderRes.data.couponId) {
    try {
      await cloud.callFunction({
        name: 'couponService',
        data: { action: 'unlockCoupon', couponId: orderRes.data.couponId },
      })
    } catch (unlockErr) {
      logger.warn('handleFeedingOrder.unlockCoupon.failed', {
        orderId, couponId: orderRes.data.couponId, msg: unlockErr && unlockErr.message,
      })
    }
  }

  return handleSuccess(null, '操作成功')
}

function paymentStatusUnpaid(order) {
  const ps = String(order.paymentStatus || '').toLowerCase()
  return ps === 'unpaid' || ps === ''
}

module.exports = { getFeedingOrders, getFeedingOrderDetail, handleFeedingOrder }
