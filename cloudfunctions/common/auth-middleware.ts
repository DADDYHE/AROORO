/**
 * auth-middleware.ts - 鉴权与权限中间件
 *
 * 权限模型：
 *   - permission=null  → 仅需登录
 *   - permission='partner' → 需要合作伙伴身份（admins 集合 status=active 且 isPartner=true）
 *
 * 合作伙伴可访问所有管理功能，无细粒度权限区分。
 */

import { initCloud } from './utils'
import { err } from './errors'
import { isSuperAdmin, isPartner } from './permissions'

// =====================================================================
// 类型定义
// =====================================================================

/** verifyAuth 配置选项 */
export interface VerifyAuthOptions {
  /** 是否要求 openid 存在，默认 true */
  requireLogin?: boolean
  /**
   * 权限要求：
   *   - null/undefined → 仅需登录
   *   - 'partner' → 需要合作伙伴身份（admins 集合 status=active 且 isPartner=true / roles 含 partner）
   *   - 'admin' → 管理员或合作伙伴（admins.status=active 且 isSuperAdmin 或 isPartner）
   *   - 'super_admin' → 仅 super_admin
   */
  permission?: 'partner' | 'admin' | 'super_admin' | null
}

/** verifyAuth 返回值（普通用户） */
export interface BasicAuthResult {
  openid: string
}

/** verifyAuth 返回值（合作伙伴） */
export interface PartnerAuthResult {
  openid: string
  partnerId: string
  isPartner: true
}

/** verifyAuth 返回值（管理员/超级管理员） */
export interface AdminAuthResult {
  openid: string
  adminId: string
  isAdmin: true
  isSuperAdmin: boolean
}

/** verifyAuth 返回值联合类型 */
export type AuthResult = BasicAuthResult | PartnerAuthResult | AdminAuthResult

/** 管理员文档（admins collection） */
interface AdminDoc {
  _id: string
  openid: string
  status: 'active' | 'disabled' | 'pending'
  isPartner?: boolean
  roles?: string[]
  permissions?: string[]
  [key: string]: unknown
}

/** WX 上下文（cloud.getWXContext()） */
interface WXContext {
  OPENID?: string
  APPID?: string
  UNIONID?: string
}

// =====================================================================
// 主入口
// =====================================================================

/**
 * 鉴权与权限校验
 *
 * @throws {BusinessError} AUTH_REQUIRED：未登录
 * @throws {BusinessError} PARTNER_REQUIRED：非合作伙伴
 */
export async function verifyAuth(
  event: unknown,
  options: VerifyAuthOptions = {}
): Promise<AuthResult> {
  const {
    requireLogin = true,
    permission,
  } = options

  const { cloud, db } = initCloud()
  const wxContext = ((cloud as unknown as { getWXContext?: () => WXContext }).getWXContext
    ? (cloud as unknown as { getWXContext: () => WXContext }).getWXContext()
    : ({} as WXContext))
  const openid: string = wxContext.OPENID || ''

  if (requireLogin && !openid) {
    throw err('AUTH_REQUIRED', '未登录')
  }

  // 无需特殊身份，仅登录即可
  if (!permission) {
    return { openid }
  }

  // ----- 需要特殊身份 -----
  if (!openid) {
    throw err('AUTH_REQUIRED', '未登录')
  }

  // isSuperAdmin 和 isPartner 已在文件顶部通过 import 导入

  let doc: AdminDoc | null = null
  try {
    const res = await db.collection('admins').doc(openid).get()
    doc = ((res && (res as { data: AdminDoc | null }).data) || null) as AdminDoc | null
  } catch (e) {
    doc = null
  }

  if (!doc || doc.status !== 'active') {
    throw err('PARTNER_REQUIRED', '无有效管理账号')
  }

  if (permission === 'super_admin') {
    if (!isSuperAdmin(doc)) {
      throw err('PERMISSION_DENIED', '需要超级管理员权限')
    }
    return { openid, adminId: doc._id, isSuperAdmin: true }
  }

  if (permission === 'admin') {
    if (!isSuperAdmin(doc) && !isPartner(doc)) {
      throw err('PERMISSION_DENIED', '需要管理员或合作伙伴权限')
    }
    return { openid, adminId: doc._id, isAdmin: true, isSuperAdmin: isSuperAdmin(doc) }
  }

  // permission === 'partner'
  if (!isPartner(doc)) {
    throw err('PARTNER_REQUIRED', '无合作伙伴权限')
  }

  return {
    openid,
    partnerId: doc._id,
    isPartner: true,
  }
}
