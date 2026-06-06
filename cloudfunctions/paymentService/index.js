const { handleSuccess, handleError, ERROR_CODES, initCloud } = require('./common/utils')
const { createLogger } = require('./common/logger')
const { verifyAuth } = require('./common/auth-middleware')
const { err, toResponse, isBusinessError } = require('./common/errors')
const { initGlobalRateLimitFromDb } = require('../common/risk-rate-limit')

// Sprint 21: 注入全局限流存储（基于 db 集合 rate_limits）
//  - 跨云函数实例共享计数
//  - 若 db 不可用则降级到内存（initGlobalRateLimitFromDb 内部 try/catch）
try {
  const { db } = initCloud()
  initGlobalRateLimitFromDb(db, { collectionName: 'rate_limits' })
} catch (e) {
  // eslint-disable-next-line no-console
  console.warn('[paymentService] initGlobalRateLimitFromDb failed, fallback to memory:', e && e.message)
}

const payHandlers = require('./services/pay')
const refundHandlers = require('./services/refund')
const notifyHandlers = require('./services/notify')

const handlers = {
  ...payHandlers,
  ...refundHandlers,
  ...notifyHandlers,
}

const NO_AUTH_ACTIONS = ['paymentNotify']

const logger = createLogger('paymentService')

function isHttpRequest(event) {
  return event.headers && event.body !== undefined && !event.action
}

exports.main = async (event, context) => {
  if (isHttpRequest(event)) {
    return await handlers.paymentNotify(event, context, null)
  }

  const { action } = event
  if (!action || !handlers[action]) {
    throw err('INVALID_PARAMS', '无效的操作类型')
  }

  try {
    const requireLogin = !NO_AUTH_ACTIONS.includes(action)
    const auth = await verifyAuth(event, { requireLogin })
    logger.info(action, { openid: auth?.openid })
    return await handlers[action](event, context, auth)
  } catch (error) {
    logger.error(action, error)
    if (isBusinessError(error)) {
      return toResponse(error)
    }
    const code = error.code || ERROR_CODES.BUSINESS
    return handleError(error, error.message, code)
  }
}
