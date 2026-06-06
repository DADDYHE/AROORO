const { initCloud, handleSuccess, handleError, generateId, ERROR_CODES } = require('./common/utils')
const { createLogger } = require('./common/logger')
const { verifyAuth } = require('./common/auth-middleware')
const { getCache, setCache, deleteCache } = require('./common/cache')
const { filterFields, FIELD_WHITELISTS } = require('./common/validator')
const { err, toResponse, isBusinessError } = require('./common/errors')

const { cloud, db } = initCloud()
const logger = createLogger('userService')

const authHandlers = require('./auth')
const notificationHandlers = require('./notifications')
const referralHandlers = require('./referral')
const addressHandlers = require('./addresses')

const handlers = {
  login: authHandlers.login,
  getIdentity: authHandlers.getIdentity,
  syncIdentity: authHandlers.syncIdentity,
  check: authHandlers.checkUserInfo,
  update: authHandlers.updateUserInfo,
  phone: authHandlers.getPhoneNumber,
  all: authHandlers.getAllUserInfo,
  getConfig: authHandlers.getConfig,
  getNotificationList: notificationHandlers.getNotificationList,
  markNotificationRead: notificationHandlers.markNotificationRead,
  markAllNotificationsRead: notificationHandlers.markAllNotificationsRead,
  getNotificationDetail: notificationHandlers.getNotificationDetail,
  getReferralStats: referralHandlers.getReferralStats,
  getInvitedUsers: referralHandlers.getInvitedUsers,
  checkAdminStatus: authHandlers.checkAdminStatus,
  addressList: addressHandlers.list,
  addressAdd: addressHandlers.add,
  addressUpdate: addressHandlers.update,
  addressRemove: addressHandlers.remove,
  addressSetDefault: addressHandlers.setDefault,
}

exports.main = async (event, context) => {
  const { action } = event
  if (!action || !handlers[action]) {
    throw err('INVALID_PARAMS', '无效的操作类型')
  }

  try {
    const requireLogin = !['login', 'check'].includes(action)
    const auth = await verifyAuth(event, { requireLogin })
    logger.info(action, { openid: auth.openid })
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
