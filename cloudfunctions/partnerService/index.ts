/**
 * partnerService/index.ts - 合作伙伴服务主入口（TypeScript 源文件 - Sprint 35 迁移）
 *
 * 业务功能：
 *   - 合作伙伴小程序端统一入口：申请 / 状态 / 权限 / 收入 / 钱包 / 提现 / 邀请
 *   - 4 个服务子模块：application / wallet / referral / income
 *   - 共 14 个 action：
 *     * 申请（3 个）：submitApplication / getApplicationStatus / getMyPermissions
 *     * 收入 / 钱包（9 个）：getMyIncomeOverview / getMyIncomeDetails / getMyWallet / getMyWithdrawals / getMyPayeeAccounts / updatePayeeAccounts / cancelWithdrawal / confirmWithdrawal / requestWithdrawal
 *     * 服务收入（2 个）：getServiceIncomeOverview / getServiceIncomeDetails
 *     * 邀请（4 个）：getReferralStats / getMyInvitedUsers / getReferralOrders / getReferralOrderStats
 *
 * 迁移目标：
 *   - 强类型化 event / auth / handler 签名
 *   - 与 adminService / userService 保持一致的类型系统
 *   - 保留 partnerService 特有的 checkPartnerPermission 鉴权流程
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.partnerService.json
 */

// =====================================================================
// 公共类型（与 adminService/index.ts / userService/index.ts 保持一致）
// =====================================================================

export interface AuthLike {
  openid?: string
  adminId?: string
  partnerId?: string
  isPartner?: boolean
  isSuperAdmin?: boolean
  roles?: string[]
  permissions?: string[]
  _isHttpAuth?: boolean
  // M6: 显式声明 nickName 字段（硬约束 #40：提现记录需含 nickName）
  //   原：仅靠 [k: string]: unknown 索引签名隐式支持，类型不安全
  nickName?: string
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

export interface AdminRecord {
  _id: string
  status?: string
  roles?: string[]
  permissions?: string[]
  isPartner?: boolean
  // M7: 显式声明 nickName 字段（与 application.ts AdminRecord 保持一致）
  //   原：未声明 nickName，导致 (admin.nickName as string) 需强制 cast
  nickName?: string
  [k: string]: unknown
}

// =====================================================================
// 内部模块初始化（require CommonJS 模块）
// =====================================================================

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { initCloud, handleError, ERROR_CODES } = require('./common/utils')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createLogger } = require('./common/logger')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { verifyAuth } = require('./common/auth-middleware')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { err, toResponse, isBusinessError } = require('./common/errors')
// M10: 资金类 action 限流（参考 mallService 风控模式）
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { withRateLimit } = require('./common/risk-rate-limit')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { bootstrapRateLimit } = require('./common/rate-limit-bootstrap')

const logger = createLogger('partnerService')

// M10: 启动时注入限流存储（strict 模式，Redis 失败时拒绝资金接口调用）
let _bootstrapFailed = false
try {
  const { db } = initCloud()
  bootstrapRateLimit(db, { logger, strict: true })
} catch (e) {
  // P2 修复：strict 模式下 bootstrap 失败必须阻断资金接口（原仅 warn 放行，
  //   导致限流失效时 requestWithdrawal 仍可调用）
  _bootstrapFailed = true
  logger.error('bootstrapRateLimit strict failed', { msg: (e as Error).message })
}

// M10: 资金类 action 集合——需通过限流中间件
const RATE_LIMITED_ACTIONS = new Set(['requestWithdrawal'])

// eslint-disable-next-line @typescript-eslint/no-var-requires
const applicationHandlers: Record<string, PartnerActionHandler> = require('./services/application')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const walletHandlers: Record<string, PartnerActionHandler> = require('./services/wallet')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const referralHandlers: Record<string, PartnerActionHandler> = require('./services/referral')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const incomeHandlers: Record<string, PartnerActionHandler> = require('./services/income')

// =====================================================================
// 类型定义
// =====================================================================

export type PartnerActionHandler = (
  event: CloudEvent,
  context: CloudContext,
  auth: AuthLike
) => Promise<unknown>

export type PartnerPermission = string | string[] | null

export interface PartnerHandlers {
  // 申请
  submitApplication: PartnerActionHandler
  getApplicationStatus: PartnerActionHandler
  getMyPermissions: PartnerActionHandler
  getMyCommissionRates: PartnerActionHandler

  // 收入 / 钱包
  getMyIncomeOverview: PartnerActionHandler
  getMyIncomeDetails: PartnerActionHandler
  getMyWallet: PartnerActionHandler
  getMyWithdrawals: PartnerActionHandler
  getMyPayeeAccounts: PartnerActionHandler
  updatePayeeAccounts: PartnerActionHandler
  cancelWithdrawal: PartnerActionHandler
  confirmWithdrawal: PartnerActionHandler
  requestWithdrawal: PartnerActionHandler

  // 服务收入（service_incomes 概览 / 明细）
  getServiceIncomeOverview: PartnerActionHandler
  getServiceIncomeDetails: PartnerActionHandler

  // 邀请
  getReferralStats: PartnerActionHandler
  getMyInvitedUsers: PartnerActionHandler
  getReferralOrders: PartnerActionHandler
  getReferralOrderStats: PartnerActionHandler
}

// =====================================================================
// handlers 聚合
// =====================================================================

export const handlers: PartnerHandlers = {
  // 申请
  submitApplication: applicationHandlers.submitApplication,
  getApplicationStatus: applicationHandlers.getApplicationStatus,
  getMyPermissions: applicationHandlers.getMyPermissions,
  getMyCommissionRates: applicationHandlers.getMyCommissionRates,

  // 收入 / 钱包
  getMyIncomeOverview: walletHandlers.getMyIncomeOverview,
  getMyIncomeDetails: walletHandlers.getMyIncomeDetails,
  getMyWallet: walletHandlers.getMyWallet,
  getMyWithdrawals: walletHandlers.getMyWithdrawals,
  getMyPayeeAccounts: walletHandlers.getMyPayeeAccounts,
  updatePayeeAccounts: walletHandlers.updatePayeeAccounts,
  cancelWithdrawal: walletHandlers.cancelWithdrawal,
  confirmWithdrawal: walletHandlers.confirmWithdrawal,
  requestWithdrawal: walletHandlers.requestWithdrawal,

  // 服务收入（service_incomes 概览 / 明细）
  getServiceIncomeOverview: incomeHandlers.getServiceIncomeOverview,
  getServiceIncomeDetails: incomeHandlers.getServiceIncomeDetails,

  // 邀请
  getReferralStats: referralHandlers.getReferralStats,
  getMyInvitedUsers: referralHandlers.getMyInvitedUsers,
  getReferralOrders: referralHandlers.getReferralOrders,
  getReferralOrderStats: referralHandlers.getReferralOrderStats,
}

// =====================================================================
// ACTION_PERMISSIONS 权限表
// =====================================================================

const ACTION_PERMISSIONS: Record<keyof PartnerHandlers, PartnerPermission> = {
  // 申请类：仅需登录
  submitApplication: null,
  getApplicationStatus: null,
  getMyPermissions: null,
  getMyCommissionRates: 'partner',

  // 收入/钱包/提现：需要合作伙伴身份
  getMyIncomeOverview: 'partner',
  getMyIncomeDetails: 'partner',
  getMyWallet: 'partner',
  getMyWithdrawals: 'partner',
  getMyPayeeAccounts: 'partner',
  updatePayeeAccounts: 'partner',
  cancelWithdrawal: 'partner',
  confirmWithdrawal: 'partner',
  requestWithdrawal: 'partner',

  // 服务收入：需要合作伙伴身份
  getServiceIncomeOverview: 'partner',
  getServiceIncomeDetails: 'partner',

  // 推广/邀请：需要合作伙伴身份
  getReferralStats: 'partner',
  getMyInvitedUsers: 'partner',
  getReferralOrders: 'partner',
  getReferralOrderStats: 'partner',
}

// =====================================================================
// 合作伙伴权限校验
// =====================================================================

async function checkPartnerPermission(
  openid: string,
  permission: PartnerPermission
): Promise<AdminRecord> {
  const { db } = initCloud()
  let admin: AdminRecord | null = null
  try {
    const adminRes = await db.collection('admins').doc(openid).get()
    admin = (adminRes && (adminRes as { data?: AdminRecord }).data) || null
  } catch (e) {
    // M7: 静默吞错改为告警，便于排查权限查询异常
    //   原：catch (e) { admin = null } 无任何日志
    logger.warn('checkPartnerPermission.admins.fetch', {
      openid, msg: (e as Error).message,
    })
    admin = null
  }

  if (!admin || admin.status !== 'active') {
    throw err('PARTNER_REQUIRED', '无合作伙伴权限')
  }

  const roles = admin.roles || []
  if (roles.includes('super_admin')) {return admin}

  if (permission) {
    // permission === 'partner' 时，isPartner=true 即可；其他 permission 检查 permissions 数组
    if (permission === 'partner') {
      if (!admin.isPartner && !roles.includes('partner')) {
        throw err('PARTNER_REQUIRED', '无合作伙伴权限')
      }
    } else {
      const perms = admin.permissions || []
      const required = Array.isArray(permission) ? permission : [permission]
      if (!required.some(p => perms.includes(p))) {
        throw err('PERMISSION_DENIED', `权限不足：需要 ${required.join(' 或 ')} 权限`)
      }
    }
  }

  return admin
}

// =====================================================================
// 主入口
// =====================================================================

export const main = async (event: CloudEvent, context: CloudContext): Promise<unknown> => {
  const { action } = event
  if (!action || !handlers[action as keyof PartnerHandlers]) {
    throw err('INVALID_PARAMS', '无效的操作类型')
  }

  // P2 修复：限流 bootstrap 失败时拒绝资金类 action（提现申请），
  //   避免限流失效后资金接口裸奔
  if (_bootstrapFailed && action === 'requestWithdrawal') {
    logger.error('main.blocked_by_bootstrap_failure', { action })
    return toResponse(err('SERVICE_UNAVAILABLE', '提现服务暂不可用，请稍后重试'))
  }

  const permission = ACTION_PERMISSIONS[action as keyof PartnerHandlers]

  try {
    const auth = await verifyAuth(event, { requireLogin: true })
    // M11: 主入口容错——verifyAuth 在 requireLogin 下应保证 openid 存在
    //   但部分 HTTP 触发场景可能仅校验 token 未取到 openid，提前拦截避免后续 db.doc(undefined)
    if (!auth.openid) {
      throw err('AUTH_REQUIRED', '登录态无效，缺少 openid')
    }
    logger.info(action, { openid: auth.openid })

    if (permission !== null) {
      const admin = await checkPartnerPermission(auth.openid, permission)
      auth.adminId = admin._id
      auth.roles = admin.roles || []
      auth.permissions = (admin.roles || []).includes('super_admin')
        ? ['all']
        : (admin.permissions || [])
      auth.isPartner = admin.isPartner || false
      // H1: 提现记录需要 nickName 字段（project_memory 硬约束）
      // admin 集合可能没有 nickName，fallback 到 users 集合查询由 wallet.ts 内部处理
      auth.nickName = admin.nickName || auth.nickName || ''
    }

    // M10: 资金类 action 通过限流中间件，防止单用户高频调用提现接口
    if (RATE_LIMITED_ACTIONS.has(action)) {
      return await withRateLimit(
        { userId: auth.openid || '', type: 'withdrawal', targetId: 'wallet' },
        () => handlers[action as keyof PartnerHandlers](event, context, auth)
      )
    }

    return await handlers[action as keyof PartnerHandlers](event, context, auth)
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

// partnerService 必须被 CloudBase 云函数 runtime 加载（exports.main）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _mod = module as { exports: Record<string, unknown> }
_mod.exports = { main }
_mod.exports.main = main
_mod.exports.default = _mod.exports

export default { main, handlers, ACTION_PERMISSIONS }
