const { handleError, ERROR_CODES } = require('./common/utils')
const { createLogger } = require('./common/logger')
const { verifyAuth } = require('./common/auth-middleware')
const { err, toResponse, isBusinessError } = require('./common/errors')
const { initGlobalRateLimitFromDb } = require('../common/risk-rate-limit')

const logger = createLogger('orderService')

// Sprint 21: 注入全局限流存储（基于 db 集合 rate_limits）
//  - 跨云函数实例共享计数
//  - 若 db 不可用则降级到内存（initGlobalRateLimitFromDb 内部 try/catch）
try {
  const { initCloud } = require('./common/utils')
  const { db } = initCloud()
  initGlobalRateLimitFromDb(db, { collectionName: 'rate_limits' })
} catch (e) {
  logger.warn('initGlobalRateLimitFromDb failed, fallback to memory:', e && e.message)
}

const orderHandlers = require('./orders')
const paymentHandlers = require('./payment')
const statsHandlers = require('./stats')

const handlers = {
  getOrders: orderHandlers.getOrders,
  createOrder: orderHandlers.createOrder,
  updateOrderStatus: orderHandlers.updateOrderStatus,
  cancelOrder: orderHandlers.cancelOrder,
  getOrderDetail: orderHandlers.getOrderDetail,
  getActivityOrders: orderHandlers.getActivityOrders,
  getActivityOrderDetail: orderHandlers.getActivityOrderDetail,
  calculatePrice: orderHandlers.calculatePrice,
  checkDateAvailability: orderHandlers.checkDateAvailability,
  wechatPay: paymentHandlers.wechatPay,
  wechatPayNotify: paymentHandlers.wechatPayNotify,
  getStats: statsHandlers.getStats,
  getIncomeStats: statsHandlers.getIncomeStats,
  getBoardingOrders: orderHandlers.getBoardingOrders,
  getBoardingOrderDetail: orderHandlers.getBoardingOrderDetail,
  handleBoardingOrder: orderHandlers.handleBoardingOrder,
  submitEvaluation: orderHandlers.submitEvaluation,
  getHostEvaluations: orderHandlers.getHostEvaluations,
}

exports.main = async (event, context) => {
  const { action } = event
  if (!action) {
    throw err('UNKNOWN_ACTION', '缺少 action 参数')
  }
  if (!handlers[action]) {
    throw err('UNKNOWN_ACTION', `未知的操作：${action}`)
  }

  try {
    const requireLogin = action !== 'wechatPayNotify'
    const auth = await verifyAuth(event, { requireLogin })
    logger.info(action, { openid: auth.openid })
    return await handlers[action](event, context, auth)
  } catch (error) {
    logger.error(action, error)
    if (isBusinessError(error)) {
      return toResponse(error)
    }
    const code = error.code || ERROR_CODES.BUSINESS
    return handleError(error, error.message || '操作失败', code)
  }
}
