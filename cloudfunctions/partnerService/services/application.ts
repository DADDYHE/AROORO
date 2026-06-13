/**
 * application.ts - 合作伙伴申请服务（TypeScript 源文件 - Sprint 36 迁移）
 *
 * 业务功能：
 *   - 提交合作伙伴申请（submitApplication）
 *   - 查询申请状态（getApplicationStatus）
 *   - 查询合作伙伴权限（getMyPermissions）
 *
 * 迁移目标：
 *   - 修复原 application.js line 1 的路径错误（./common/errors → ../common/errors）
 *   - 强类型化所有 db 操作、handler 签名、返回结构
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.partnerService.json
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { err } = require('../common/errors')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { initCloud, handleSuccess, handleError, generateId, ERROR_CODES } = require('../common/utils')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createLogger } = require('../common/logger')

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { db } = initCloud()
const logger = createLogger('partnerService:application')

// =====================================================================
// 类型定义
// =====================================================================

export interface ApplicationRecord {
  _id: string
  openid: string
  nickName: string
  avatarUrl: string
  realName: string
  phone: string
  role: string
  permissions: string[]
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  createdAt: Date
  updatedAt: Date
}

export interface AdminRecord {
  _id: string
  nickName?: string
  avatarUrl?: string
  status?: string
  isPartner?: boolean
  roles?: string[]
  permissions?: string[]
}

export interface SubmitApplicationEvent {
  realName?: string
  phone?: string
  reason?: string
  permissions?: string[]
}

export interface AuthLike {
  openid?: string
  adminId?: string
  partnerId?: string
  isPartner?: boolean
  roles?: string[]
  permissions?: string[]
  [k: string]: unknown
}

export interface CloudEvent {
  action?: string
  data?: Record<string, unknown>
  [k: string]: unknown
}

export interface CloudContext {
  [k: string]: unknown
}

export type ApplicationHandler = (
  event: CloudEvent,
  context: CloudContext,
  auth: AuthLike
) => Promise<unknown>

// =====================================================================
// Handler 实现
// =====================================================================

export async function submitApplication(
  event: CloudEvent,
  context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  const { realName, phone, reason, permissions } = event as SubmitApplicationEvent

  if (!realName || !phone || !reason) {
    throw err('INVALID_PARAMS', '请填写完整信息')
  }

  const existingRes = await db.collection('admin_applications')
    .where({ openid, status: 'pending' }).limit(1).get()
  if (existingRes.data && existingRes.data.length > 0) {
    throw err('BUSINESS_ERROR', '您已有待审核申请')
  }

  let admin: Partial<AdminRecord> = {}
  try {
    const adminRes = await db.collection('admins').doc(openid).get()
    admin = adminRes.data || {}
  } catch (e) {
    admin = {}
  }

  const application: ApplicationRecord = {
    _id: generateId('application', openid),
    openid: openid || '',
    nickName: admin.nickName || '',
    avatarUrl: admin.avatarUrl || '',
    realName,
    phone,
    role: 'partner',
    permissions: Array.isArray(permissions) ? permissions : [],
    reason,
    status: 'pending',
    createdAt: db.serverDate(),
    updatedAt: db.serverDate(),
  }

  const res = await db.collection('admin_applications').add({ data: application })
  return handleSuccess({ id: res._id }, '提交成功')
}

export async function getApplicationStatus(
  event: CloudEvent,
  context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  const res = await db.collection('admin_applications')
    .where({ openid, status: 'pending' }).limit(1).get()
  const hasPending = res.data && res.data.length > 0
  return handleSuccess({
    hasPending,
    application: hasPending ? res.data[0] : null,
  })
}

export async function getMyPermissions(
  event: CloudEvent,
  context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  let admin: AdminRecord | null = null
  try {
    const adminRes = await db.collection('admins').doc(openid).get()
    admin = adminRes.data
  } catch (e) {
    admin = null
  }

  if (!admin || admin.status !== 'active') {
    return handleSuccess({ isPartner: false })
  }

  return handleSuccess({ isPartner: admin.isPartner || false })
}

// =====================================================================
// Runtime shim: CommonJS 兼容
// =====================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _mod = module as { exports: Record<string, unknown> }
_mod.exports = {
  submitApplication,
  getApplicationStatus,
  getMyPermissions,
}
_mod.exports.default = _mod.exports

export default {
  submitApplication,
  getApplicationStatus,
  getMyPermissions,
}

// 避免 unused 警告
void logger
void handleError
void ERROR_CODES
