/**
 * adminService HTTP/JWT 鉴权路径 P1 修复测试
 *
 * 背景：
 *   P1 把 ACTION_PERMISSIONS 拆分为 'super_admin' / 'partner' 等级，
 *   但修复中存在两个安全漏洞：
 *     1. checkHttpPermission 函数定义了但从未在 HTTP / JWT 路径调用
 *     2. token-utils.generateToken 不写 isSuperAdmin / isPartner 字段
 *   叠加后果：任何登录用户都能调 super_admin 专属 action。
 *
 * 本测试验证两个修复点：
 *   - partner token 调 super_admin action → 403
 *   - super_admin token 调 super_admin action → 通过
 *   - super_admin token 调 partner action → 通过（向下兼容）
 *   - 无 token 调受保护 action → 401
 */
process.env.JWT_SECRET = 'test-jwt-secret-for-p1-permission-test'

// 模拟 jsonwebtoken（与 common-token-utils.test.js 一致）
jest.mock('jsonwebtoken', () => ({
  sign: (payload, _secret, _options) => {
    const p = Buffer.from(JSON.stringify({
      ...payload,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 8 * 3600,
    })).toString('base64')
    return `${p}.mock-secret.mock-sig`
  },
  verify: (token, _secret) => {
    if (!token || !token.includes('.')) {throw new Error('invalid token')}
    const [p] = token.split('.')
    return JSON.parse(Buffer.from(p, 'base64').toString('utf8'))
  },
}), { virtual: true })

// 模拟 wx-server-sdk（enrichAuthFromAdmin 经 getEnrichAdminDb 使用 wx-server-sdk）
// 模拟 admins 集合：根据 doc(_id) 返回不同 admin 文档，验证 enrich 路径
const ADMIN_DOCS = {
  super_admin: {
    _id: 'super_admin',
    openid: '',
    username: 'admin',
    roles: ['super_admin'],
    permissions: ['all'],
    isPartner: true,
    status: 'active',
  },
  // 模拟 B（院方代理）：没有 roles 字段
  o1oA43TDfU5xo8OokEYBMdooRQbo: {
    _id: 'o1oA43TDfU5xo8OokEYBMdooRQbo',
    openid: 'o1oA43TDfU5xo8OokEYBMdooRQbo',
    username: 'admin',
    isPartner: true,
    status: 'active',
  },
  // H1 修复后：权限判定以 DB 实时状态为准，测试 token 的 adminId 必须有对应 active 记录
  s1: {
    _id: 's1',
    openid: 'oSuper',
    username: 'super1',
    roles: ['super_admin'],
    permissions: ['all'],
    isPartner: true,
    status: 'active',
  },
  p1: {
    _id: 'p1',
    openid: 'oPartner',
    username: 'partner1',
    roles: ['partner'],
    isPartner: true,
    status: 'active',
  },
}
jest.mock('wx-server-sdk', () => ({
  init: () => {},
  DYNAMIC_CURRENT_ENV: 'mock-env',
  // app.database() 返回 db 实例，db.collection() 才返回 collection 链
  database: () => ({
    collection: () => ({
      where: () => ({ limit: () => ({ get: async () => ({ data: [] }) }) }),
      doc: id => ({
        get: async () => ({ data: ADMIN_DOCS[id] || null }),
      }),
    }),
  }),
}), { virtual: true })

// 模拟 cloudbase 模块（adminService 通过 initCloud 初始化）
jest.mock('../cloudfunctions/common/utils', () => {
  const actual = jest.requireActual('../cloudfunctions/common/utils')
  return {
    ...actual,
    initCloud: () => ({
      cloud: { getWXContext: () => ({ OPENID: 'mock-openid', APPID: 'mock-appid' }) },
      db: {
        collection: () => ({
          doc: () => ({ get: async () => ({ data: null }) }),
        }),
      },
    }),
    handleSuccess: (data, msg) => ({ success: true, data, message: msg || '' }),
    handleError: (err, msg, code) => ({ success: false, message: msg || err.message, code }),
    convertCloudUrls: async data => data,
    revertCloudUrls: data => data,
    ERROR_CODES: { AUTH: 401, BUSINESS: 500, NOT_FOUND: 404 },
  }
})

// 模拟所有 service handlers（重点：被调用的 action 计数）
// 用普通对象 + 包含 ACTION_PERMISSIONS 中所有 action 的方法
const handlerCalls = []
const ACTION_KEYS = [
  'checkAuth', 'login', 'webLogin', 'createScanLogin', 'pollScanLogin', 'confirmScanLogin',
  'logout', 'getAvailableRoles', 'getConfig', 'updateProfile', 'resolveCloudUrls',
  'submitApplication', 'getApplicationStatus', 'getMyPermissions',
  'approveApplication', 'rejectApplication', 'getApplicationList',
  'getAdminList', 'getAdminDetail', 'updateAdminStatus',
  'getUserList', 'getUserDetail', 'updateUserStatus',
  'getDashboardStats', 'getEnhancedDashboardStats', 'getFinanceOverview',
  'getWithdrawalList', 'approveWithdrawal', 'rejectWithdrawal',
  'getPartnerCommissionRates', 'updatePartnerCommissionRates',
  'getCommissionConfig', 'updateCommissionConfig',
  'initIndexes', 'getOperationLogList', 'exportOrders',
  'getBoardingOrders', 'getBoardingOrderDetail', 'handleBoardingOrder',
  'getHostProfile', 'updateHostProfile', 'createHostProfile',
  'getPendingHostReviews', 'reviewHost', 'getActiveHosts', 'getDisabledHosts',
  'toggleHostAccepting', 'toggleHostStatus',
  'getReferralStats', 'getReferralList', 'getInvitedUsersByAdmin',
  'getReferralOrders', 'getReferralOrderStats', 'getMyCommissionRates', 'getMyInvitedUsers',
  'getActivityList', 'getActivityDetail', 'createActivity', 'updateActivity',
  'getActivityRegistrations', 'exportActivityRegistrations', 'getActivityOrders',
  'getProductList', 'getProductDetail', 'createProduct', 'updateProduct', 'deleteProduct',
  'batchUpdateProducts', 'cloneProduct', 'getMallOrders', 'getMallOrderDetail',
  'handleMallOrder', 'shipMallOrder', 'completeMallOrder',
  'getProductStats', 'getCategoryStats', 'listCategories', 'createCategory',
  'updateCategory', 'deleteCategory',
  'getFeedingOrders',
  'getFeedingOrderDetail',
  'getBannerList', 'getBannerDetail', 'createBanner', 'updateBanner',
  'updateBannerStatus', 'updateBannerSortOrder', 'deleteBanner',
  'createCouponTemplate', 'updateCouponTemplate', 'deleteCouponTemplate',
  'toggleCouponTemplateStatus', 'cloneCouponTemplate',
  'getTemplateList', 'getTemplateDetail', 'createCouponGrant',
  'getGrantList', 'getGrantDetail', 'getUserCouponList',
  'grantCouponToUser', 'revokeUserCoupon', 'batchRevokeUserCoupons',
  'getCouponStatistics', 'getScopeStatistics',
  'createTuanDeal', 'updateTuanDeal', 'deleteTuanDeal', 'publishTuanDeal', 'endTuanDeal',
  'getTuanDealList', 'getTuanDealDetail', 'getTuanDealOrders',
  'getTuanLeaderList', 'getTuanLeaderCommissions', 'getTuanCommissionStats', 'settleTuanCommissions',
  'getMyIncomeOverview', 'getMyIncomeDetails', 'getMyWallet', 'getMyWithdrawals', 'requestWithdrawal',
  'getOrderStats', 'getOrderTrend', 'getOrderTypeStats',
  'listI18nOverrides', 'getI18nOverride', 'upsertI18nOverride', 'batchUpsertI18nOverrides',
  'deleteI18nOverride', 'toggleI18nOverrideStatus', 'fetchActiveOverrides',
  'uploadFile',
]
const mockHandlers = {}
for (const action of ACTION_KEYS) {
  mockHandlers[action] = async (event, _ctx, auth) => {
    handlerCalls.push({
      action,
      openid: auth?.openid,
      isPartner: auth?.isPartner,
      isSuperAdmin: auth?.isSuperAdmin,
      auth_roles: auth?.roles,
      auth_permissions: auth?.permissions,
      auth_adminId: auth?.adminId,
    })
    return { success: true, data: { action, mocked: true } }
  }
}

jest.mock('../cloudfunctions/adminService/services/auth', () => mockHandlers)
jest.mock('../cloudfunctions/adminService/services/application', () => mockHandlers)
jest.mock('../cloudfunctions/adminService/services/hosting', () => mockHandlers)
jest.mock('../cloudfunctions/adminService/services/adminManagement', () => mockHandlers)
jest.mock('../cloudfunctions/adminService/services/user', () => mockHandlers)
jest.mock('../cloudfunctions/adminService/services/activity', () => mockHandlers)
jest.mock('../cloudfunctions/adminService/services/mall', () => mockHandlers)
jest.mock('../cloudfunctions/adminService/services/feeding', () => mockHandlers)
jest.mock('../cloudfunctions/adminService/services/banner', () => mockHandlers)
jest.mock('../cloudfunctions/adminService/services/coupon', () => mockHandlers)
jest.mock('../cloudfunctions/adminService/services/tuan', () => mockHandlers)
jest.mock('../cloudfunctions/adminService/services/commissionConfig', () => mockHandlers)
jest.mock('../cloudfunctions/adminService/services/wallet', () => mockHandlers)
jest.mock('../cloudfunctions/adminService/services/stats', () => mockHandlers)
jest.mock('../cloudfunctions/adminService/services/i18nOverride', () => mockHandlers)
jest.mock('../cloudfunctions/adminService/services/upload', () => mockHandlers)

const { generateToken } = require('../cloudfunctions/common/token-utils')
const adminService = require('../cloudfunctions/adminService/index')

function buildHttpEvent(action, token) {
  return {
    httpMethod: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '' },
    body: JSON.stringify({ action, data: {} }),
    requestContext: { httpMethod: 'POST' },
  }
}

describe('adminService P1 鉴权修复：HTTP 路径', () => {
  beforeEach(() => { handlerCalls.length = 0 })

  test('无 token 调受保护 action → 401', async () => {
    const res = await adminService.main(buildHttpEvent('getUserList', null), {})
    expect(res.statusCode).toBe(401)
    expect(handlerCalls).toHaveLength(0)
  })

  test('partner token 调 super_admin action → 403', async () => {
    const partnerToken = generateToken({ openid: 'oPartner', adminId: 'p1', isPartner: true, isSuperAdmin: false })
    const res = await adminService.main(buildHttpEvent('getUserList', partnerToken), {})
    expect(res.statusCode).toBe(403)
    expect(handlerCalls).toHaveLength(0)
  })

  test('super_admin token 调 super_admin action → 通过', async () => {
    const superToken = generateToken({ openid: 'oSuper', adminId: 's1', isSuperAdmin: true, isPartner: true })
    const res = await adminService.main(buildHttpEvent('getUserList', superToken), {})
    expect(res.statusCode).toBe(200)
    expect(handlerCalls).toHaveLength(1)
    expect(handlerCalls[0].action).toBe('getUserList')
  })

  test('super_admin token 调 partner action → 通过（向下兼容）', async () => {
    const superToken = generateToken({ openid: 'oSuper', adminId: 's1', isSuperAdmin: true, isPartner: true })
    const res = await adminService.main(buildHttpEvent('getBoardingOrders', superToken), {})
    expect(res.statusCode).toBe(200)
    expect(handlerCalls).toHaveLength(1)
    expect(handlerCalls[0].action).toBe('getBoardingOrders')
  })

  test('partner token 调 partner action → 通过', async () => {
    const partnerToken = generateToken({ openid: 'oPartner', adminId: 'p1', isPartner: true, isSuperAdmin: false })
    const res = await adminService.main(buildHttpEvent('getBoardingOrders', partnerToken), {})
    expect(res.statusCode).toBe(200)
    expect(handlerCalls).toHaveLength(1)
  })

  test('webLogin 不需要 token 且不被 checkHttpPermission 拦截', async () => {
    const res = await adminService.main(buildHttpEvent('webLogin', null), {})
    expect(res.statusCode).toBe(200)
    expect(handlerCalls).toHaveLength(1)
    expect(handlerCalls[0].action).toBe('webLogin')
  })
})

describe('adminService P1 鉴权修复：JWT 路径（event.accessToken）', () => {
  beforeEach(() => { handlerCalls.length = 0 })

  test('partner token 调 super_admin action → 抛 PERMISSION_DENIED', async () => {
    const partnerToken = generateToken({ openid: 'oPartner', adminId: 'p1', isPartner: true, isSuperAdmin: false })
    const res = await adminService.main({ action: 'getUserList', accessToken: partnerToken }, {})
    // JWT 路径走 handleError 路径，返回结构化错误
    // 兼容多种返回形态：{success, message} / {code, message} / 直接是对象
    const isError = res && (
      res.success === false ||
      (res.code && res.code !== 200) ||
      (res.message && /权限不足|permission/i.test(res.message))
    )
    expect(isError).toBeTruthy()
    expect(handlerCalls).toHaveLength(0)
  })

  test('super_admin token 调 super_admin action → 通过', async () => {
    const superToken = generateToken({ openid: 'oSuper', adminId: 's1', isSuperAdmin: true, isPartner: true })
    const res = await adminService.main({ action: 'getUserList', accessToken: superToken }, {})
    expect(res.success).toBe(true)
    expect(handlerCalls).toHaveLength(1)
  })

  test('super_admin token 调 partner action → 通过（向下兼容）', async () => {
    const superToken = generateToken({ openid: 'oSuper', adminId: 's1', isSuperAdmin: true, isPartner: true })
    const res = await adminService.main({ action: 'getBoardingOrders', accessToken: superToken }, {})
    expect(res.success).toBe(true)
    expect(handlerCalls).toHaveLength(1)
  })

  test('无 token 调受保护 action → 抛 AUTH_REQUIRED', async () => {
    const res = await adminService.main({ action: 'getUserList' }, {})
    // 小程序云函数调用路径（无 HTTP context，无 accessToken）走 verifyAuth
    // mock 环境下 verifyAuth 找不到 admin 文档会抛 PARTNER_REQUIRED
    const isError = res && (
      res.success === false ||
      (res.code && res.code !== 200) ||
      ['AUTH_REQUIRED', 'PARTNER_REQUIRED', 'PERMISSION_DENIED'].includes(res.code || res.errCode)
    )
    expect(isError).toBeTruthy()
    expect(handlerCalls).toHaveLength(0)
  })
})

describe('adminService P1 鉴权修复：enrich auth.roles / auth.permissions', () => {
  // 模拟 service handler 内部对 super_admin 兜底的检查（如 hosting.js:140 / coupon.js:69）
  // 这些 handler 在生产代码里用 `auth.roles?.includes('super_admin')` 决定是否放行
  beforeEach(() => { handlerCalls.length = 0 })

  test('JWT 路径：A 调 handleBoardingOrder → handler 收到 auth.roles 包含 super_admin', async () => {
    const superToken = generateToken({ openid: '', adminId: 'super_admin', isSuperAdmin: true, isPartner: true })
    const res = await adminService.main({ action: 'handleBoardingOrder', accessToken: superToken, data: { orderId: 'o1', operation: 'confirm' } }, {})
    expect(res.success).toBe(true)
    const lastCall = handlerCalls[handlerCalls.length - 1]
    expect(lastCall.auth_roles).toEqual(['super_admin'])
  })

  test('HTTP 路径：adminId 不存在的 token → enrich 失败必须拒绝（H1 修复：DB 为权威）', async () => {
    const orphanToken = generateToken({ openid: '', adminId: 'deleted_admin', isSuperAdmin: true, isPartner: true })
    const res = await adminService.main(buildHttpEvent('getProductList', orphanToken), {})
    // H1 修复：admins 记录不存在/被删除 → enrich 失败 → 即使 token 声明 isPartner=true 也拒绝
    expect(res.statusCode).toBe(403)
    expect(handlerCalls).toHaveLength(0)
  })

  test('HTTP 路径：账号已停用（status!=active）→ 即使 token 有效也拒绝（H1 修复）', async () => {
    ADMIN_DOCS.disabled_admin = {
      _id: 'disabled_admin', openid: 'oDisabled', roles: ['super_admin'], isPartner: true, status: 'disabled',
    }
    const token = generateToken({ openid: 'oDisabled', adminId: 'disabled_admin', isSuperAdmin: true, isPartner: true })
    const res = await adminService.main(buildHttpEvent('getUserList', token), {})
    expect(res.statusCode).toBe(403)
    expect(handlerCalls).toHaveLength(0)
    delete ADMIN_DOCS.disabled_admin
  })
})
