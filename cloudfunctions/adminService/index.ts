/**
 * adminService/index.ts - 管理后台主入口（TypeScript 源文件 - Sprint 33 迁移）
 *
 * 业务功能：
 *   - 小程序云函数入口：处理 17 类业务模块的统一调度
 *   - HTTP/JWT 路径：web 端管理后台 + 小程序扫码登录
 *   - 普通路径：小程序端直接调用
 *
 * 关键设计：
 *   - ACTION_PERMISSIONS 集中映射每个 action 的权限等级
 *   - HTTP 路径用 checkHttpPermission 按等级校验
 *   - 调 handler 前 enrichAuthFromAdmin 补全 roles / permissions
 *   - 所有 service handler 模块通过 services/* 子目录加载
 *
 * 迁移目标：
 *   - 强类型化 event / context / auth / permission
 *   - WrappedHandler<T> 包装统一错误处理
 *   - 编译产物（index.js）继续被小程序云函数调用
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.adminService.json
 */

import type { CloudBaseDB } from '../common/types'

// =====================================================================
// 公共类型
// =====================================================================

export type PermissionLevel = 'partner' | 'admin' | 'super_admin' | null

export type ActionHandler<E = CloudEvent, C = CloudContext, A = AuthLike> =
  (event: E, context: C, auth: A) => Promise<unknown>

export type CloudFunctionHandler<E = CloudEvent, C = CloudContext, A = AuthLike> =
  ActionHandler<E, C, A>

export interface AuthLike {
  openid?: string
  adminId?: string
  partnerId?: string
  isPartner?: boolean
  isSuperAdmin?: boolean
  roles?: string[]
  permissions?: string[]
  _isHttpAuth?: boolean
  [k: string]: unknown
}

export interface CloudEvent {
  action?: string
  data?: Record<string, unknown>
  body?: string | Record<string, unknown>
  headers?: Record<string, string | undefined>
  httpMethod?: string
  requestContext?: {
    httpMethod?: string
    [k: string]: unknown
  }
  accessToken?: string
  openid?: string
  [k: string]: unknown
}

export interface CloudContext {
  HTTP_CONTEXT?: {
    headers: Record<string, string | undefined>
  }
  [k: string]: unknown
}

export interface HttpInfo {
  action: string
  data: Record<string, unknown>
  _httpContext: {
    headers: Record<string, string | undefined>
  }
  _isHttpCall: true
  _parseError?: Error
}

export interface JwtDecodedToken {
  openid?: string
  adminId?: string
  isPartner?: boolean
  isSuperAdmin?: boolean
  exp?: number
  iat?: number
  [k: string]: unknown
}

export interface EnrichmentResult {
  admin: {
    _id: string
    isPartner?: boolean
    roles?: string[]
    permissions?: string[]
    [k: string]: unknown
  }
  roles: string[]
  permissions: string[]
  isPartner: boolean
}

export interface CorsHeaders {
  'Access-Control-Allow-Origin': string
  'Access-Control-Allow-Methods'?: string
  'Access-Control-Allow-Headers'?: string
  'Access-Control-Max-Age'?: string
  'Content-Type'?: string
  [k: string]: string | undefined
}

export interface HttpResponse {
  statusCode: number
  headers: CorsHeaders
  body: string
}

// =====================================================================
// 内部模块初始化（require CommonJS 模块）
// =====================================================================

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { handleError, ERROR_CODES, convertCloudUrls, revertCloudUrls } = require('./common/utils')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createLogger } = require('./common/logger')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { verifyAuth } = require('./common/auth-middleware')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { err, toResponse, isBusinessError } = require('./common/errors')
// Sprint 50: 限流统一 bootstrap（admin 接口防御性限流）
//   adminService 中 refund / upload / application 等敏感接口使用 withRateLimit，
//   若未注入全局 store 则退化为实例内内存计数，多实例部署时限流被稀释。
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { bootstrapRateLimit } = require('./common/rate-limit-bootstrap')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { recordAlert } = require('./common/alert')

// eslint-disable-next-line @typescript-eslint/no-var-requires
const authHandlers: Record<string, ActionHandler> = require('./services/auth')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const applicationHandlers: Record<string, ActionHandler> = require('./services/application')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const hostingHandlers: Record<string, ActionHandler> = require('./services/hosting')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const adminHandlers: Record<string, ActionHandler> = require('./services/adminManagement')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const userHandlers: Record<string, ActionHandler> = require('./services/user')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const activityHandlers: Record<string, ActionHandler> = require('./services/activity')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mallHandlers: Record<string, ActionHandler> = require('./services/mall')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const feedingHandlers: Record<string, ActionHandler> = require('./services/feeding')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const bannerHandlers: Record<string, ActionHandler> = require('./services/banner')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const couponHandlers: Record<string, ActionHandler> = require('./services/coupon')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const tuanHandlers: Record<string, ActionHandler> = require('./services/tuan')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const commissionConfigHandlers: Record<string, ActionHandler> = require('./services/commissionConfig')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const walletHandlers: Record<string, ActionHandler> = require('./services/wallet')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const statsHandlers: Record<string, ActionHandler> = require('./services/stats')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const i18nOverrideHandlers: Record<string, ActionHandler> = require('./services/i18nOverride')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const uploadHandlers: Record<string, ActionHandler> = require('./services/upload')
// P1-2: 注册退款 handler（web-admin 调用 adminRefund/queryRefund）
// eslint-disable-next-line @typescript-eslint/no-var-requires
const refundHandlers: Record<string, ActionHandler> = require('./services/refund')

// =====================================================================
// handlers 汇总
// =====================================================================

export const handlers: Record<string, ActionHandler> = {
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
  ...refundHandlers,
  ...i18nOverrideHandlers,
  ...uploadHandlers,
}

// =====================================================================
// ACTION_PERMISSIONS 权限表
// =====================================================================

const ACTION_PERMISSIONS: Record<string, PermissionLevel> = {
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
  getUserPets: 'super_admin',
  updateUserStatus: 'super_admin',
  // 仪表盘 / 财务
  getDashboardStats: 'super_admin',
  getEnhancedDashboardStats: 'super_admin',
  getFinanceOverview: 'super_admin',
  // 提现审批
  getWithdrawalList: 'super_admin',
  approveWithdrawal: 'super_admin',
  rejectWithdrawal: 'super_admin',
  retryTransfer: 'super_admin',
  // P1-2: 管理员退款（web-admin 后台客诉处理）
  adminRefund: 'super_admin',
  queryRefund: 'super_admin',
  // 佣金配置（平台级）
  getPartnerCommissionRates: 'super_admin',
  updatePartnerCommissionRates: 'super_admin',
  getCommissionConfig: 'super_admin',
  updateCommissionConfig: 'super_admin',
  // 危险操作
  initIndexes: 'super_admin',
  initI18nOverrideIndexes: 'super_admin',
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
  deleteActivity: 'super_admin',
  getActivityRegistrations: 'partner',
  exportActivityRegistrations: 'partner',
  getActivityOrders: 'partner',
  getActivityOrderDetail: 'partner',

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
  getLogisticsTrack: 'partner',
  getProductStats: 'partner',
  getCategoryStats: 'partner',
  listCategories: 'partner',
  createCategory: 'partner',
  updateCategory: 'partner',
  deleteCategory: 'partner',

  // 上门喂养业务
  getFeedingOrders: 'partner',
  getFeedingOrderDetail: 'partner',
  handleFeedingOrder: 'partner',

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
  getCouponStatistics: 'partner',

  // 团长业务
  createTuanDeal: 'partner',
  updateTuanDeal: 'partner',
  deleteTuanDeal: 'partner',
  publishTuanDeal: 'partner',
  endTuanDeal: 'partner',
  getTuanDealList: 'partner',
  getTuanDealDetail: 'partner',
  getTuanDealOrders: 'partner',
  getTuanDealOrderDetail: 'partner',
  handleTuanOrder: 'partner',
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

// =====================================================================
// Sprint 50: 限流统一 bootstrap（全局计数 + 配置注入）
//   admin 端使用非 strict 模式（best-effort）：权限体系已提供强保护，
//   限流作为防御纵深。若 DB 不可用则降级到实例内内存计数，不阻断服务。
// =====================================================================
try {
  const { initCloud } = require('./common/utils')
  const { db } = initCloud() as { cloud: unknown, db: unknown }
  bootstrapRateLimit(db, {
    logger: createLogger('adminService.rate-limit'),
    strict: false,
    service: 'adminService',
  })
} catch (e) {
  logger.warn('bootstrapRateLimit failed, fallback to in-memory', { msg: (e as Error)?.message })
  recordAlert(
    'warning',
    'adminService.rate_limit.bootstrap.failed',
    `adminService 限流 bootstrap 失败，已降级为内存模式：${(e as Error)?.message}`,
    { service: 'adminService' }
  ).catch((alertErr: Error) => {
    logger.error('recordAlert failed for bootstrap failure', { msg: alertErr.message })
  })
}

// =====================================================================
// HTTP / JWT 路径工具
// =====================================================================

export type HttpInfoOrError = HttpInfo | HttpParseError

export interface HttpParseError {
  _isHttpCall: true
  _parseError: Error
}

export function parseHttpEvent(event: CloudEvent, context: CloudContext): HttpInfoOrError | null {
  // CloudBase HTTP 触发：event 包含 body/headers/requestContext
  const isHttpCall = !!(context?.HTTP_CONTEXT || event?.requestContext || event?.headers)
  if (!isHttpCall) {return null}
  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body
    if (!body || !body.action) {return { _isHttpCall: true as const, _parseError: new Error('缺少 action 字段') }}
    const httpContext = context?.HTTP_CONTEXT || { headers: event.headers || {} }
    return {
      action: body.action,
      data: body.data || {},
      _httpContext: httpContext,
      _isHttpCall: true as const,
    }
  } catch (e) {
    return { _isHttpCall: true as const, _parseError: e as Error }
  }
}

export function parseHttpAuth(httpContext: { headers: Record<string, string | undefined> }): JwtDecodedToken | null {
  // 认证契约：优先读取 X-User-Token（web 端用户 JWT），
  // 兼容旧约定从 Authorization 头读取（注意 Authorization 在生产环境可能被网关 API Key 占用）。
  const headers = httpContext?.headers || {}
  const authHeader = headers['x-user-token'] || headers['X-User-Token'] || headers.authorization || headers.Authorization || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) {return null}
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { verifyToken } = require('./common/token-utils')
    return verifyToken(token)
  } catch (e) {
    return null
  }
}

export function checkHttpPermission(decoded: JwtDecodedToken | null, action: string): boolean {
  const permission = ACTION_PERMISSIONS[action]
  if (permission === null || permission === undefined) {return true}
  if (!decoded) {return false}
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

/**
 * H1 安全修复：以 DB 实时状态（enrichAuthFromAdmin 结果）为权威判权依据。
 *
 * 背景：旧逻辑仅信任 JWT 内的 isSuperAdmin/isPartner 声明，账号被禁用/降权后
 * 旧 token 在有效期内仍可越权；叠加自动续期后 token 可永不过期。
 *
 * 规则：
 *   - permission 为 null/undefined（仅需登录）→ 放行（token 已验签）
 *   - 需要等级权限但 enrichment 为空（admins 记录不存在 / status!=='active'）→ 一律拒绝
 *   - super_admin → 实时 roles 含 super_admin
 *   - admin / partner → super_admin 向下兼容，或实时 isPartner
 */
export function checkEnrichedPermission(enrichment: EnrichmentResult | null, action: string): boolean {
  const permission = ACTION_PERMISSIONS[action]
  if (permission === null || permission === undefined) {return true}
  if (!enrichment) {return false}
  const isSuper = enrichment.roles.includes('super_admin')
  if (permission === 'super_admin') {return isSuper}
  // 'admin' 与 'partner' 等级：super_admin 向下兼容 + 实时 partner 身份
  return isSuper || enrichment.isPartner === true
}

let _enrichAdminDb: CloudBaseDB | null = null
export function getEnrichAdminDb(): CloudBaseDB {
  if (_enrichAdminDb === null) {
    // 使用 wx-server-sdk（云函数运行时自动具备管理员权限，绕过集合安全规则）
    // 注：@cloudbase/node-sdk 不带 env 时为匿名身份，无法查询 PRIVATE 集合（如 admins）
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const cloud = require('wx-server-sdk')
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
    _enrichAdminDb = cloud.database()
  }
  return _enrichAdminDb as CloudBaseDB
}

export async function enrichAuthFromAdmin(decoded: JwtDecodedToken | null): Promise<EnrichmentResult | null> {
  if (!decoded) {return null}
  // web 端登录：decoded.adminId = admins._id（例：'super_admin'），openid=''
  // 小程序扫码：decoded.openid 是真实 openid，adminId 不存在
  // 优先用 adminId（web 端），fallback 到 openid（小程序扫码）
  const id = decoded.adminId || decoded.openid
  if (!id) {return null}

  let admin: EnrichmentResult['admin'] | null = null
  try {
    const adminDb = getEnrichAdminDb()
    const res = await adminDb.collection('admins').doc(id).get()
    admin = (res && (res as { data?: unknown }).data) as EnrichmentResult['admin'] | null
  } catch (e) {
    return null
  }
  if (!admin || admin.status !== 'active') {return null}

  const roles = Array.isArray(admin.roles) ? admin.roles : []
  return {
    admin,
    roles,
    // super_admin 隐含所有权限（与 partnerService 一致）
    permissions: roles.includes('super_admin') ? ['all'] : (Array.isArray(admin.permissions) ? admin.permissions : []),
    isPartner: admin.isPartner === true || roles.includes('partner'),
  }
}

// =====================================================================
// 主入口
// =====================================================================

function isHttpInfo(info: HttpInfoOrError): info is HttpInfo {
  return !(info as HttpParseError)._parseError
}

export const main = async (event: CloudEvent, context: CloudContext): Promise<unknown> => {
  const httpInfo = parseHttpEvent(event, context)

  if (httpInfo && httpInfo._isHttpCall) {
    // CORS 预检请求
    if (event.httpMethod === 'OPTIONS' || event.requestContext?.httpMethod === 'OPTIONS') {
      return {
        statusCode: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-User-Token',
          'Access-Control-Max-Age': '86400',
        },
        body: '',
      }
    }
    if (httpInfo._parseError) {
      return { statusCode: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ code: 400, message: '请求格式错误' }) }
    }
    // 至此 httpInfo 一定是 HttpInfo（HttpParseError 已在上面 return）
    const validHttpInfo: HttpInfo = isHttpInfo(httpInfo) ? httpInfo : (httpInfo as HttpInfo)
    if (!validHttpInfo.action || !handlers[validHttpInfo.action]) {
      return { statusCode: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ code: 400, message: `未知操作: ${validHttpInfo.action}` }) }
    }

    if (validHttpInfo.action !== 'webLogin' && !NO_AUTH_REQUIRED.has(validHttpInfo.action)) {
      const httpAuth = parseHttpAuth(validHttpInfo._httpContext)
      if (!httpAuth) {
        return { statusCode: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ code: 401, message: '未登录或Token已过期' }) }
      }
      // P1 修复：adminService HTTP 路径必须按 ACTION_PERMISSIONS 等级校验
      // （token 声明作为快速前置过滤，省一次 DB 读；权威判定见下方 enrichment 校验）
      if (!checkHttpPermission(httpAuth, validHttpInfo.action)) {
        logger.warn('http.permission_denied', { action: validHttpInfo.action, openid: httpAuth.openid, isSuperAdmin: httpAuth.isSuperAdmin, isPartner: httpAuth.isPartner })
        return { statusCode: 403, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ code: 403, message: '权限不足' }) }
      }
      // P1 修复：补全 auth.roles / auth.permissions
      const enrichment = await enrichAuthFromAdmin(httpAuth)
      // H1 安全修复：等级权限以 DB 实时状态为准（禁用/降权立即生效），
      // token 声明不再是权威依据；enrich 失败（记录不存在或非 active）一律拒绝。
      if (!checkEnrichedPermission(enrichment, validHttpInfo.action)) {
        logger.warn('http.permission_denied.db', { action: validHttpInfo.action, openid: httpAuth.openid, adminId: httpAuth.adminId, enriched: !!enrichment })
        return { statusCode: 403, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ code: 403, message: '权限不足或账号已停用' }) }
      }
      const auth: AuthLike = {
        openid: httpAuth.openid,
        partnerId: httpAuth.adminId,
        isPartner: enrichment?.isPartner || httpAuth.isPartner || false,
        _isHttpAuth: true,
      }
      if (enrichment) {
        auth.adminId = enrichment.admin._id
        auth.roles = enrichment.roles
        auth.permissions = enrichment.permissions
        logger.info('http.enrich', { action: validHttpInfo.action, adminId: auth.adminId, roles: auth.roles, permissions: auth.permissions })
      } else {
        logger.warn('http.enrich.miss', { action: validHttpInfo.action, openid: httpAuth.openid, adminId: httpAuth.adminId })
      }
      try {
        const mergedEvent = { ...validHttpInfo.data, action: validHttpInfo.action }
        logger.info(validHttpInfo.action, { openid: httpAuth.openid, source: 'http' })
        const result = await handlers[validHttpInfo.action](mergedEvent, context, auth)
        return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(result) }
      } catch (error) {
        logger.error(validHttpInfo.action, error)
        const code = (error as { code?: number })?.code || 500
        return { statusCode: code >= 400 && code < 600 ? code : 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ code, message: (error as Error).message }) }
      }
    }

    try {
      const mergedEvent = { ...validHttpInfo.data, action: validHttpInfo.action }
      const auth: AuthLike = { _isHttpAuth: true }
      logger.info('webLogin', { source: 'http' })
      const result = await handlers[validHttpInfo.action](mergedEvent, context, auth)
      return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(result) }
    } catch (error) {
      logger.error('webLogin', error)
      const code = (error as { code?: number })?.code || 500
      return { statusCode: code >= 400 && code < 600 ? code : 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ code, message: (error as Error).message }) }
    }
  }

  const { action } = event
  if (!action || !handlers[action]) {
    throw err('INVALID_PARAMS', '无效的操作类型')
  }

  if (action === 'webLogin') {
    try {
      const mergedEvent = { ...event, ...(event.data || {}) }
      logger.info('webLogin', { source: 'miniprogram' })
      const auth: AuthLike = { _isHttpAuth: false }
      return await handlers[action](mergedEvent, context, auth)
    } catch (error) {
      logger.error('webLogin', error)
      if (isBusinessError(error)) {
        return toResponse(error)
      }
      const code = (error as { code?: number })?.code || ERROR_CODES.BUSINESS
      return handleError(error, (error as Error).message, code)
    }
  }

  if (NO_AUTH_REQUIRED.has(action)) {
    try {
      const mergedEvent = { ...event, ...(event.data || {}) }
      logger.info(action, { source: 'no-auth' })
      const auth: AuthLike = { _isHttpAuth: false }
      return await handlers[action](mergedEvent, context, auth)
    } catch (error) {
      logger.error(action, error)
      if (isBusinessError(error)) {
        return toResponse(error)
      }
      const code = (error as { code?: number })?.code || ERROR_CODES.BUSINESS
      return handleError(error, (error as Error).message, code)
    }
  }

  if (event.accessToken) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { verifyToken, generateToken } = require('./common/token-utils')
      const decoded = verifyToken(event.accessToken)
      // Web 端只有超级管理员登录，token 有效即有全部权限
      const permission = ACTION_PERMISSIONS[action]
      if (process.env.ADMIN_MAINTENANCE_MODE === '1' && permission) {
        throw err('SERVICE_UNAVAILABLE', '管理后台维护中，请稍后再试')
      }
      if (!checkHttpPermission(decoded, action)) {
        logger.warn('jwt.permission_denied', { action, openid: decoded.openid, isSuperAdmin: decoded.isSuperAdmin, isPartner: decoded.isPartner })
        throw err('PERMISSION_DENIED', '权限不足')
      }
      const jwtEnrichment = await enrichAuthFromAdmin(decoded)
      // H1 安全修复：等级权限以 DB 实时状态为准，enrich 失败一律拒绝（详见 checkEnrichedPermission）
      if (!checkEnrichedPermission(jwtEnrichment, action)) {
        logger.warn('jwt.permission_denied.db', { action, openid: decoded.openid, adminId: decoded.adminId, enriched: !!jwtEnrichment })
        throw err('PERMISSION_DENIED', '权限不足或账号已停用')
      }
      const mergedEvent = revertCloudUrls({ ...event, ...(event.data || {}) })
      const auth: AuthLike = { openid: decoded.openid, partnerId: decoded.adminId, isPartner: jwtEnrichment?.isPartner || decoded.isPartner || false, _isHttpAuth: true }
      if (jwtEnrichment) {
        auth.adminId = jwtEnrichment.admin._id
        auth.roles = jwtEnrichment.roles
        auth.permissions = jwtEnrichment.permissions
        logger.info('jwt.enrich', { action, adminId: auth.adminId, roles: auth.roles, permissions: auth.permissions })
      } else {
        logger.warn('jwt.enrich.miss', { action, openid: decoded.openid, adminId: decoded.adminId })
      }
      logger.info(action, { openid: decoded.openid, source: 'jwt' })
      const result = await handlers[action](mergedEvent, context, auth)
      const converted = await convertCloudUrls(result)
      const now = Math.floor(Date.now() / 1000)
      // H1 安全修复：续期声明必须从 DB 实时状态派生（而非复制旧 token 声明），
      // 且 enrich 失败（账号不存在/停用）时不续期 —— 否则被降权/禁用的账号可无限续命。
      if (decoded.exp && decoded.exp - now < 3600 && jwtEnrichment) {
        const newToken = generateToken({
          openid: decoded.openid,
          adminId: decoded.adminId,
          isPartner: jwtEnrichment.isPartner,
          isSuperAdmin: jwtEnrichment.roles.includes('super_admin'),
        })
        ;(converted as { _renewedToken?: string })._renewedToken = newToken
      }
      return converted
    } catch (jwtErr) {
      logger.error(action, jwtErr)
      const e = jwtErr as Error & { name?: string; code?: number }
      if (e.name === 'JsonWebTokenError' || e.name === 'TokenExpiredError') {
        return handleError(jwtErr, 'Token无效或已过期', ERROR_CODES.AUTH)
      }
      return handleError(jwtErr, e.message, e.code || ERROR_CODES.BUSINESS)
    }
  }

  try {
    const permission = ACTION_PERMISSIONS[action]
    const mergedEvent = revertCloudUrls({ ...event, ...(event.data || {}) })
    logger.info('dispatch', { action, permission, event: JSON.stringify(mergedEvent) })
    const auth = await verifyAuth(mergedEvent, { requireLogin: true, permission })
    logger.info(action, { openid: auth.openid, isPartner: auth.isPartner })
    return await convertCloudUrls(await handlers[action](mergedEvent, context, auth))
  } catch (error) {
    logger.error(action, error)
    if (isBusinessError(error)) {
      return toResponse(error)
    }
    const code = (error as { code?: number })?.code || ERROR_CODES.BUSINESS
    return handleError(error, (error as Error).message, code)
  }
}

// =====================================================================
// Runtime shim: CommonJS 兼容
// =====================================================================
// index.js 必须被 CloudBase 云函数 runtime 加载（exports.main）
// 直接通过 exports.main 暴露 main（不要重新赋值 module.exports，避免运行时框架
// 加载 userFunction 时对 main.toString() 返回 undefined 的兼容问题）
export { main as default }
