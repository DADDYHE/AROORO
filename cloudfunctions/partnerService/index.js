const { initCloud, handleSuccess, handleError, ERROR_CODES } = require('./common/utils')
const { createLogger } = require('./common/logger')
const { verifyAuth } = require('./common/auth-middleware')
const { err, toResponse, isBusinessError } = require('./common/errors')

const applicationHandlers = require('./services/application')
const walletHandlers = require('./services/wallet')
const referralHandlers = require('./services/referral')

const handlers = {
  ...applicationHandlers,
  ...walletHandlers,
  ...referralHandlers,
}

const ACTION_PERMISSIONS = {
  submitApplication: null,
  getApplicationStatus: null,
  getMyPermissions: null,

  getMyIncomeOverview: null,
  getMyIncomeDetails: null,
  getMyWallet: null,
  getMyWithdrawals: null,
  requestWithdrawal: null,

  getReferralStats: null,
  getMyInvitedUsers: null,
  getReferralOrders: null,
  getReferralOrderStats: null,
}

const logger = createLogger('partnerService')

async function checkPartnerPermission(openid, permission) {
  const { db } = initCloud()
  let admin = null
  try {
    const adminRes = await db.collection('admins').doc(openid).get()
    admin = adminRes.data
  } catch (e) {}

  if (!admin || admin.status !== 'active') {
    throw err('PARTNER_REQUIRED', '无合作伙伴权限')
  }

  const roles = admin.roles || []
  if (roles.includes('super_admin')) {return admin}

  if (permission) {
    const perms = admin.permissions || []
    const required = Array.isArray(permission) ? permission : [permission]
    if (!required.some(p => perms.includes(p))) {
      throw err('PERMISSION_DENIED', `权限不足：需要 ${required.join(' 或 ')} 权限`)
    }
  }

  return admin
}

exports.main = async (event, context) => {
  const { action } = event
  if (!action || !handlers[action]) {
    throw err('INVALID_PARAMS', '无效的操作类型')
  }

  const permission = ACTION_PERMISSIONS[action]

  try {
    const auth = await verifyAuth(event, { requireLogin: true })
    logger.info(action, { openid: auth.openid })

    if (permission) {
      const admin = await checkPartnerPermission(auth.openid, permission)
      auth.adminId = admin._id
      auth.roles = admin.roles || []
      auth.permissions = (admin.roles || []).includes('super_admin') ? ['all'] : (admin.permissions || [])
      auth.isPartner = admin.isPartner || false
    }

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
