/**
 * 权限与角色判定工具（TypeScript 源文件 - Sprint 17 迁移）
 *
 * 替代散落各处的 `isPartner` / 角色数组判定逻辑
 * 统一从 admin / partner / user 文档中提取「实际有效角色」
 *
 * 角色约定（v1.0）：
 *   - 平台级：super_admin / admin / operator / viewer
 *   - 业务级：partner（合作伙伴，含寄养/上门喂养/团长/活动主）
 *   - 用户级：owner（普通用户）
 *
 * 权限约定：
 *   - admin.permissions 是字符串数组（action 命名空间，如 'order:list'）
 *   - super_admin 隐含所有权限
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.common.json
 */

import { err } from './errors'

// ===== 类型定义 =====

export type RoleName =
  | 'super_admin'
  | 'admin'
  | 'operator'
  | 'viewer'
  | 'partner'
  | 'owner'

export type Permission = string

export interface IdentityDoc {
  _id?: string
  openid?: string
  roles?: RoleName[]
  role?: RoleName
  permissions?: Permission[]
  isPartner?: boolean
  status?: string
  [key: string]: unknown
}

export interface IdentityContext {
  roles: RoleName[]
  permissions: Permission[]
  isAdmin: boolean
  isPartner: boolean
  isSuperAdmin: boolean
}

export interface RequireOrThrowOptions {
  requireRole?: RoleName
  requirePermission?: Permission | Permission[]
}

// ===== 常量 =====

/**
 * 平台角色枚举
 */
export const ROLES: Readonly<Record<string, RoleName>> = Object.freeze({
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  OPERATOR: 'operator',
  VIEWER: 'viewer',
  PARTNER: 'partner',
  OWNER: 'owner',
})

/**
 * 角色等级（数值越大权限越高）
 * 用于「最低角色」断言
 */
export const ROLE_LEVEL: Readonly<Record<RoleName, number>> = Object.freeze({
  [ROLES.VIEWER]: 10,
  [ROLES.OPERATOR]: 20,
  [ROLES.PARTNER]: 30,
  [ROLES.ADMIN]: 40,
  [ROLES.SUPER_ADMIN]: 50,
  [ROLES.OWNER]: 0,
} as Record<RoleName, number>)

// ===== 角色提取 =====

/**
 * 从 admin/partner/user 文档中提取「实际生效的角色数组」
 *
 * 兼容两种存储方式：
 *   - `roles: ['admin', 'partner']`（数组，新约定）
 *   - `role: 'admin'`（单值，旧约定）
 */
export function extractRoles(doc: IdentityDoc | null | undefined): RoleName[] {
  if (!doc || typeof doc !== 'object') {
    return []
  }
  if (Array.isArray(doc.roles)) {
    return [...new Set(doc.roles as RoleName[])] as RoleName[]
  }
  if (typeof doc.role === 'string') {
    return [doc.role as RoleName]
  }
  return []
}

// ===== 角色判定 =====

/**
 * 是否是平台管理员（含 super_admin / admin / operator / viewer）
 */
export function isAdmin(doc: IdentityDoc | null | undefined): boolean {
  const roles = extractRoles(doc)
  return roles.some(
    r =>
      r === ROLES.SUPER_ADMIN ||
      r === ROLES.ADMIN ||
      r === ROLES.OPERATOR ||
      r === ROLES.VIEWER
  )
}

/**
 * 是否是超级管理员
 */
export function isSuperAdmin(doc: IdentityDoc | null | undefined): boolean {
  return extractRoles(doc).includes(ROLES.SUPER_ADMIN)
}

/**
 * 是否是合作伙伴（含寄养家庭、团长、活动主等业务伙伴）
 */
export function isPartner(doc: IdentityDoc | null | undefined): boolean {
  if (!doc) {
    return false
  }
  const roles = extractRoles(doc)
  return roles.includes(ROLES.PARTNER) || doc.isPartner === true
}

// ===== 权限校验 =====

/**
 * 是否拥有指定权限
 *
 * @param doc - 管理员文档
 * @param required - 所需权限（单个或数组，任一命中即可）
 */
export function hasPermission(
  doc: IdentityDoc | null | undefined,
  required: Permission | Permission[]
): boolean {
  if (!doc) {
    return false
  }
  if (isSuperAdmin(doc)) {
    return true
  }
  const perms = Array.isArray(doc.permissions) ? doc.permissions : []
  const requiredList = Array.isArray(required) ? required : [required]
  return requiredList.some(p => perms.includes(p))
}

/**
 * 角色等级断言：用户角色 ≥ 最低角色
 */
export function hasRoleAtLeast(
  doc: IdentityDoc | null | undefined,
  minRole: RoleName
): boolean {
  if (!doc) {
    return false
  }
  const roles = extractRoles(doc)
  const minLevel = ROLE_LEVEL[minRole] ?? 0
  return roles.some(r => (ROLE_LEVEL[r] ?? 0) >= minLevel)
}

// ===== 鉴权守卫 =====

/**
 * 鉴权守卫：未通过则抛出 BusinessError
 *
 * @example
 *   requireOrThrow(doc, { requireRole: 'admin' })
 *   requireOrThrow(doc, { requirePermission: ['order:refund', 'order:list'] })
 */
export function requireOrThrow(
  doc: IdentityDoc | null | undefined,
  options: RequireOrThrowOptions = {}
): void {
  const { requireRole, requirePermission } = options

  if (requireRole) {
    if (!hasRoleAtLeast(doc, requireRole)) {
      throw err('PERMISSION_DENIED', `需要 ${requireRole} 角色`, {
        actual: extractRoles(doc),
      })
    }
  }

  if (requirePermission) {
    if (!hasPermission(doc, requirePermission)) {
      throw err(
        'PERMISSION_DENIED',
        `缺少权限：${
          Array.isArray(requirePermission)
            ? requirePermission.join('/')
            : requirePermission
        }`
      )
    }
  }
}

// ===== 上下文构造 =====

/**
 * 合并角色与权限（用于上下文注入）
 */
export function buildIdentityContext(
  doc: IdentityDoc | null | undefined
): IdentityContext {
  const roles = extractRoles(doc)
  return {
    roles,
    permissions: Array.isArray(doc?.permissions) ? doc.permissions : [],
    isAdmin: roles.some(
      r =>
        r === ROLES.SUPER_ADMIN ||
        r === ROLES.ADMIN ||
        r === ROLES.OPERATOR ||
        r === ROLES.VIEWER
    ),
    isSuperAdmin: roles.includes(ROLES.SUPER_ADMIN),
    isPartner: roles.includes(ROLES.PARTNER) || doc?.isPartner === true,
  }
}

// 默认导出（保持 CommonJS 兼容）
export default {
  ROLES,
  ROLE_LEVEL,
  extractRoles,
  isAdmin,
  isSuperAdmin,
  isPartner,
  hasPermission,
  hasRoleAtLeast,
  requireOrThrow,
  buildIdentityContext,
}
