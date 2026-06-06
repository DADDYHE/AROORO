const { handleSuccess, handleError, ERROR_CODES, convertCloudUrls, revertCloudUrls } = require('./common/utils')
const { createLogger } = require('./common/logger')
const { verifyAuth } = require('./common/auth-middleware')
const { err, toResponse, isBusinessError } = require('./common/errors')

const authHandlers = require('./services/auth')
const applicationHandlers = require('./services/application')
const hostingHandlers = require('./services/hosting')
const adminHandlers = require('./services/adminManagement')
const userHandlers = require('./services/user')
const activityHandlers = require('./services/activity')
const mallHandlers = require('./services/mall')
const feedingHandlers = require('./services/feeding')
const bannerHandlers = require('./services/banner')
const couponHandlers = require('./services/coupon')
const tuanHandlers = require('./services/tuan')
const commissionConfigHandlers = require('./services/commissionConfig')
const walletHandlers = require('./services/wallet')
const statsHandlers = require('./services/stats')
const i18nOverrideHandlers = require('./services/i18nOverride')
const uploadHandlers = require('./services/upload')

const handlers = {
  ...authHandlers,
  ...applicationHandlers,
  ...hostingHandlers,
  ...adminHandlers,
  ...userHandlers,
  ...activityHandlers,
  ...mallHandlers,
  ...feedingHandlers,
  ...bannerHandlers,
  ...couponHandlers,
  ...tuanHandlers,
  ...commissionConfigHandlers,
  ...walletHandlers,
  ...statsHandlers,
  ...i18nOverrideHandlers,
  ...uploadHandlers,
}

const ACTION_PERMISSIONS = {
  // 权限等级：
  //   null            → 仅需登录
  //   'partner'       → 合作伙伴身份（admins.status=active 且 isPartner=true / roles 含 partner）
  //   'admin'         → 管理员或合作伙伴
  //   'super_admin'   → 仅 super_admin

  // 公共接口 — 仅需登录
  checkAuth: null,
  login: null,
  webLogin: null,
  createScanLogin: null,
  pollScanLogin: null,
  confirmScanLogin: null,
  logout: null,
  getAvailableRoles: null,
  getConfig: null,
  updateProfile: null,
  resolveCloudUrls: null,
  submitApplication: null,
  getApplicationStatus: null,
  getMyPermissions: null,

  // ===== 超级管理员专属（web 管理端强管理能力） =====
  // 审批 / 平台级管理
  approveApplication: 'super_admin',
  rejectApplication: 'super_admin',
  getApplicationList: 'super_admin',
  // 管理员
  getAdminList: 'super_admin',
  getAdminDetail: 'super_admin',
  updateAdminStatus: 'super_admin',
  // 用户
  getUserList: 'super_admin',
  getUserDetail: 'super_admin',
  updateUserStatus: 'super_admin',
  // 仪表盘 / 财务
  getDashboardStats: 'super_admin',
  getEnhancedDashboardStats: 'super_admin',
  getFinanceOverview: 'super_admin',
  // 提现审批
  getWithdrawalList: 'super_admin',
  approveWithdrawal: 'super_admin',
  rejectWithdrawal: 'super_admin',
  // 佣金配置（平台级）
  getPartnerCommissionRates: 'super_admin',
  updatePartnerCommissionRates: 'super_admin',
  getCommissionConfig: 'super_admin',
  updateCommissionConfig: 'super_admin',
  // 危险操作
  initIndexes: 'super_admin',
  getOperationLogList: 'super_admin',
  exportOrders: 'super_admin',

  // ===== 合作伙伴业务自营（小程序端 partner 可调） =====
  // 寄养家庭业务
  getBoardingOrders: 'partner',
  getBoardingOrderDetail: 'partner',
  handleBoardingOrder: 'partner',
  getHostProfile: 'partner',
  updateHostProfile: 'partner',
  createHostProfile: 'partner',
  getPendingHostReviews: 'partner',
  reviewHost: 'partner',
  getActiveHosts: 'partner',
  getDisabledHosts: 'partner',
  toggleHostAccepting: 'partner',
  toggleHostStatus: 'partner',

  // 引流 / 邀请（partner 自己的数据）
  getReferralStats: 'partner',
  getReferralList: 'partner',
  getInvitedUsersByAdmin: 'partner',
  getReferralOrders: 'partner',
  getReferralOrderStats: 'partner',
  getMyCommissionRates: 'partner',
  getMyInvitedUsers: 'partner',

  // 活动业务
  getActivityList: 'partner',
  getActivityDetail: 'partner',
  createActivity: 'partner',
  updateActivity: 'partner',
  getActivityRegistrations: 'partner',
  exportActivityRegistrations: 'partner',
  getActivityOrders: 'partner',

  // 商品业务
  getProductList: 'partner',
  getProductDetail: 'partner',
  createProduct: 'partner',
  updateProduct: 'partner',
  deleteProduct: 'partner',
  batchUpdateProducts: 'partner',
  cloneProduct: 'partner',
  getMallOrders: 'partner',
  getMallOrderDetail: 'partner',
  handleMallOrder: 'partner',
  shipMallOrder: 'partner',
  completeMallOrder: 'partner',
  getProductStats: 'partner',
  getCategoryStats: 'partner',
  listCategories: 'partner',
  createCategory: 'partner',
  updateCategory: 'partner',
  deleteCategory: 'partner',

  // 上门喂养业务
  getFeederList: 'partner',
  getFeederDetail: 'partner',
  getCurrentFeeder: 'partner',
  createFeederProfile: 'partner',
  updateFeederProfile: 'partner',
  getFeedingOrders: 'partner',
  getFeederOrders: 'partner',
  handleFeedingOrder: 'partner',
  getFeedingOrderDetail: 'partner',

  // Banner / 营销
  getBannerList: 'partner',
  getBannerDetail: 'partner',
  createBanner: 'partner',
  updateBanner: 'partner',
  updateBannerStatus: 'partner',
  updateBannerSortOrder: 'partner',
  deleteBanner: 'partner',

  // 优惠券
  createCouponTemplate: 'partner',
  updateCouponTemplate: 'partner',
  deleteCouponTemplate: 'partner',
  toggleCouponTemplateStatus: 'partner',
  cloneCouponTemplate: 'partner',
  getTemplateList: 'partner',
  getTemplateDetail: 'partner',
  createCouponGrant: 'partner',
  getGrantList: 'partner',
  getGrantDetail: 'partner',
  getUserCouponList: 'partner',
  grantCouponToUser: 'partner',
  revokeUserCoupon: 'partner',
  batchRevokeUserCoupons: 'partner',
  getCouponStatistics: 'partner',
  getScopeStatistics: 'partner',

  // 团长业务
  createTuanDeal: 'partner',
  updateTuanDeal: 'partner',
  deleteTuanDeal: 'partner',
  publishTuanDeal: 'partner',
  endTuanDeal: 'partner',
  getTuanDealList: 'partner',
  getTuanDealDetail: 'partner',
  getTuanDealOrders: 'partner',
  getTuanLeaderList: 'partner',
  getTuanLeaderCommissions: 'partner',
  getTuanCommissionStats: 'partner',
  settleTuanCommissions: 'partner',

  // partner 自己的钱包 / 收入 / 提现申请
  getMyIncomeOverview: 'partner',
  getMyIncomeDetails: 'partner',
  getMyWallet: 'partner',
  getMyWithdrawals: 'partner',
  requestWithdrawal: 'partner',

  // partner 自己的统计
  getOrderStats: 'partner',
  getOrderTrend: 'partner',
  getOrderTypeStats: 'partner',

  // i18n 覆盖（运营文案，partner 可管理）
  listI18nOverrides: 'partner',
  getI18nOverride: 'partner',
  upsertI18nOverride: 'partner',
  batchUpsertI18nOverrides: 'partner',
  deleteI18nOverride: 'partner',
  toggleI18nOverrideStatus: 'partner',
  // fetchActiveOverrides 不需要 partner 权限 - 客户端匿名调用
  fetchActiveOverrides: null,

  // upload
  uploadFile: 'partner',
}

const logger = createLogger('adminService')

const NO_AUTH_REQUIRED = new Set(['webLogin', 'createScanLogin', 'pollScanLogin', 'fetchActiveOverrides'])

function parseHttpEvent(event, context) {
  // CloudBase HTTP 触发：event 包含 body/headers/requestContext
  const isHttpCall = context?.HTTP_CONTEXT || event?.requestContext || event?.headers
  if (!isHttpCall) {return null}
  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body
    if (!body || !body.action) {return { _isHttpCall: true, _parseError: new Error('缺少 action 字段') }}
    const httpContext = context?.HTTP_CONTEXT || { headers: event.headers || {} }
    return {
      action: body.action,
      data: body.data || {},
      _httpContext: httpContext,
      _isHttpCall: true,
    }
  } catch (e) {
    return { _isHttpCall: true, _parseError: e }
  }
}

function parseHttpAuth(httpContext) {
  const authHeader = httpContext?.headers?.authorization || httpContext?.headers?.Authorization || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) {return null}
  try {
    const { verifyToken } = require('./common/token-utils')
    return verifyToken(token)
  } catch (e) {
    return null
  }
}

function checkHttpPermission(decoded, action) {
  const permission = ACTION_PERMISSIONS[action]
  if (permission === null || permission === undefined) {return true}
  // JWT 中通过 isPartner / isSuperAdmin 标识区分等级
  if (permission === 'super_admin') {
    return decoded.isSuperAdmin === true
  }
  if (permission === 'admin') {
    return decoded.isSuperAdmin === true || decoded.isPartner === true
  }
  // permission === 'partner'
  return decoded.isPartner === true
}

exports.main = async (event, context) => {
  const httpInfo = parseHttpEvent(event, context)

  if (httpInfo && httpInfo._isHttpCall) {
    // CORS 预检请求
    if (event.httpMethod === 'OPTIONS' || event.requestContext?.httpMethod === 'OPTIONS') {
      return {
        statusCode: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
        },
        body: '',
      }
    }
    if (httpInfo._parseError) {
      return { statusCode: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ code: 400, message: '请求格式错误' }) }
    }
    if (!httpInfo.action || !handlers[httpInfo.action]) {
      return { statusCode: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ code: 400, message: `未知操作: ${httpInfo.action}` }) }
    }

    if (httpInfo.action !== 'webLogin' && !NO_AUTH_REQUIRED.has(httpInfo.action)) {
      const httpAuth = parseHttpAuth(httpInfo._httpContext)
      if (!httpAuth) {
        return { statusCode: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ code: 401, message: '未登录或Token已过期' }) }
      }
      // Web 端只有超级管理员登录，token 有效即有全部权限
      try {
        const mergedEvent = { ...httpInfo.data, action: httpInfo.action }
        const auth = { openid: httpAuth.openid, partnerId: httpAuth.adminId, isPartner: true, _isHttpAuth: true }
        logger.info(httpInfo.action, { openid: httpAuth.openid, source: 'http' })
        const result = await handlers[httpInfo.action](mergedEvent, context, auth)
        return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(result) }
      } catch (error) {
        logger.error(httpInfo.action, error)
        const code = error.code || 500
        return { statusCode: code >= 400 && code < 600 ? code : 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ code, message: error.message }) }
      }
    }

    try {
      const mergedEvent = { ...httpInfo.data, action: httpInfo.action }
      const auth = { _isHttpAuth: true }
      logger.info('webLogin', { source: 'http' })
      const result = await handlers[httpInfo.action](mergedEvent, context, auth)
      return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(result) }
    } catch (error) {
      logger.error('webLogin', error)
      const code = error.code || 500
      return { statusCode: code >= 400 && code < 600 ? code : 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ code, message: error.message }) }
    }
  }

  const { action } = event
  if (!action || !handlers[action]) {
    throw err('INVALID_PARAMS', '无效的操作类型')
  }

  if (action === 'webLogin') {
    try {
      const mergedEvent = { ...event, ...event.data }
      logger.info('webLogin', { source: 'miniprogram' })
      const auth = { _isHttpAuth: false }
      return await handlers[action](mergedEvent, context, auth)
    } catch (error) {
      logger.error('webLogin', error)
      if (isBusinessError(error)) {
        return toResponse(error)
      }
      const code = error.code || ERROR_CODES.BUSINESS
      return handleError(error, error.message, code)
    }
  }

  if (NO_AUTH_REQUIRED.has(action)) {
    try {
      const mergedEvent = { ...event, ...event.data }
      logger.info(action, { source: 'no-auth' })
      const auth = { _isHttpAuth: false }
      return await handlers[action](mergedEvent, context, auth)
    } catch (error) {
      logger.error(action, error)
      if (isBusinessError(error)) {
        return toResponse(error)
      }
      const code = error.code || ERROR_CODES.BUSINESS
      return handleError(error, error.message, code)
    }
  }

  if (event.accessToken) {
    try {
      const { verifyToken, generateToken } = require('./common/token-utils')
      const decoded = verifyToken(event.accessToken)
      // Web 端只有超级管理员登录，token 有效即有全部权限
      // 维护模式检查
      const permission = ACTION_PERMISSIONS[action]
      if (process.env.ADMIN_MAINTENANCE_MODE === '1' && permission) {
        throw err('SERVICE_UNAVAILABLE', '管理后台维护中，请稍后再试')
      }
      const mergedEvent = revertCloudUrls({ ...event, ...event.data })
      const auth = { openid: decoded.openid, partnerId: decoded.adminId, isPartner: true, _isHttpAuth: true }
      logger.info(action, { openid: decoded.openid, source: 'jwt' })
      const result = await handlers[action](mergedEvent, context, auth)
      const converted = await convertCloudUrls(result)
      const now = Math.floor(Date.now() / 1000)
      if (decoded.exp && decoded.exp - now < 3600) {
        const newToken = generateToken({ openid: decoded.openid, adminId: decoded.adminId, isPartner: decoded.isPartner, isSuperAdmin: decoded.isSuperAdmin })
        converted._renewedToken = newToken
      }
      return converted
    } catch (jwtErr) {
      logger.error(action, jwtErr)
      if (jwtErr.name === 'JsonWebTokenError' || jwtErr.name === 'TokenExpiredError') {
        return handleError(jwtErr, 'Token无效或已过期', ERROR_CODES.AUTH)
      }
      return handleError(jwtErr, jwtErr.message, jwtErr.code || ERROR_CODES.BUSINESS)
    }
  }

  try {
    const permission = ACTION_PERMISSIONS[action]
    const mergedEvent = revertCloudUrls({ ...event, ...event.data })
    logger.info('dispatch', { action, permission, event: JSON.stringify(mergedEvent) })
    const auth = await verifyAuth(mergedEvent, { requireLogin: true, permission })
    logger.info(action, { openid: auth.openid, isPartner: auth.isPartner })
    return await convertCloudUrls(await handlers[action](mergedEvent, context, auth))
  } catch (error) {
    logger.error(action, error)
    if (isBusinessError(error)) {
      return toResponse(error)
    }
    const code = error.code || ERROR_CODES.BUSINESS
    return handleError(error, error.message, code)
  }
}
