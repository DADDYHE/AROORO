/**
 * partnerService/index.ts - 合作伙伴服务主入口（TypeScript 源文件 - Sprint 35 迁移）
 *
 * 业务功能：
 *   - 合作伙伴小程序端统一入口：申请 / 状态 / 权限 / 收入 / 钱包 / 提现 / 邀请
 *   - 3 个服务子模块：application / wallet / referral
 *   - 共 12 个 action：
 *     * 申请（3 个）：submitApplication / getApplicationStatus / getMyPermissions
 *     * 收入 / 钱包（5 个）：getMyIncomeOverview / getMyIncomeDetails / getMyWallet / getMyWithdrawals / requestWithdrawal
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

const logger = createLogger('partnerService')

// eslint-disable-next-line @typescript-eslint/no-var-requires
const applicationHandlers: Record<string, PartnerActionHandler> = require('./services/application')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const walletHandlers: Record<string, PartnerActionHandler> = require('./services/wallet')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const referralHandlers: Record<string, PartnerActionHandler> = require('./services/referral')

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

  // 收入 / 钱包
  getMyIncomeOverview: PartnerActionHandler
  getMyIncomeDetails: PartnerActionHandler
  getMyWallet: PartnerActionHandler
  getMyWithdrawals: PartnerActionHandler
  requestWithdrawal: PartnerActionHandler

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

  // 收入 / 钱包
  getMyIncomeOverview: walletHandlers.getMyIncomeOverview,
  getMyIncomeDetails: walletHandlers.getMyIncomeDetails,
  getMyWallet: walletHandlers.getMyWallet,
  getMyWithdrawals: walletHandlers.getMyWithdrawals,
  requestWithdrawal: walletHandlers.requestWithdrawal,

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

  // 收入/钱包/提现：需要合作伙伴身份
  getMyIncomeOverview: 'partner',
  getMyIncomeDetails: 'partner',
  getMyWallet: 'partner',
  getMyWithdrawals: 'partner',
  requestWithdrawal: 'partner',

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

  const permission = ACTION_PERMISSIONS[action as keyof PartnerHandlers]

  try {
    const auth = await verifyAuth(event, { requireLogin: true })
    logger.info(action, { openid: auth.openid })

    if (permission !== null) {
      const admin = await checkPartnerPermission(auth.openid || '', permission)
      auth.adminId = admin._id
      auth.roles = admin.roles || []
      auth.permissions = (admin.roles || []).includes('super_admin')
        ? ['all']
        : (admin.permissions || [])
      auth.isPartner = admin.isPartner || false
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
