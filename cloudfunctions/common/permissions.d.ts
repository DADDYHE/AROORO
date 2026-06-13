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
export type RoleName = 'super_admin' | 'admin' | 'operator' | 'viewer' | 'partner' | 'owner';
export type Permission = string;
export interface IdentityDoc {
    _id?: string;
    openid?: string;
    roles?: RoleName[];
    role?: RoleName;
    permissions?: Permission[];
    isPartner?: boolean;
    status?: string;
    [key: string]: unknown;
}
export interface IdentityContext {
    roles: RoleName[];
    permissions: Permission[];
    isAdmin: boolean;
    isPartner: boolean;
    isSuperAdmin: boolean;
}
export interface RequireOrThrowOptions {
    requireRole?: RoleName;
    requirePermission?: Permission | Permission[];
}
/**
 * 平台角色枚举
 */
export declare const ROLES: Readonly<Record<string, RoleName>>;
/**
 * 角色等级（数值越大权限越高）
 * 用于「最低角色」断言
 */
export declare const ROLE_LEVEL: Readonly<Record<RoleName, number>>;
/**
 * 从 admin/partner/user 文档中提取「实际生效的角色数组」
 *
 * 兼容两种存储方式：
 *   - `roles: ['admin', 'partner']`（数组，新约定）
 *   - `role: 'admin'`（单值，旧约定）
 */
export declare function extractRoles(doc: IdentityDoc | null | undefined): RoleName[];
/**
 * 是否是平台管理员（含 super_admin / admin / operator / viewer）
 */
export declare function isAdmin(doc: IdentityDoc | null | undefined): boolean;
/**
 * 是否是超级管理员
 */
export declare function isSuperAdmin(doc: IdentityDoc | null | undefined): boolean;
/**
 * 是否是合作伙伴（含寄养家庭、上门喂养师、团长、活动主等业务伙伴）
 */
export declare function isPartner(doc: IdentityDoc | null | undefined): boolean;
/**
 * 是否拥有指定权限
 *
 * @param doc - 管理员文档
 * @param required - 所需权限（单个或数组，任一命中即可）
 */
export declare function hasPermission(doc: IdentityDoc | null | undefined, required: Permission | Permission[]): boolean;
/**
 * 角色等级断言：用户角色 ≥ 最低角色
 */
export declare function hasRoleAtLeast(doc: IdentityDoc | null | undefined, minRole: RoleName): boolean;
/**
 * 鉴权守卫：未通过则抛出 BusinessError
 *
 * @example
 *   requireOrThrow(doc, { requireRole: 'admin' })
 *   requireOrThrow(doc, { requirePermission: ['order:refund', 'order:list'] })
 */
export declare function requireOrThrow(doc: IdentityDoc | null | undefined, options?: RequireOrThrowOptions): void;
/**
 * 合并角色与权限（用于上下文注入）
 */
export declare function buildIdentityContext(doc: IdentityDoc | null | undefined): IdentityContext;
declare const _default: {
    ROLES: Readonly<Record<string, RoleName>>;
    ROLE_LEVEL: Readonly<Record<RoleName, number>>;
    extractRoles: typeof extractRoles;
    isAdmin: typeof isAdmin;
    isSuperAdmin: typeof isSuperAdmin;
    isPartner: typeof isPartner;
    hasPermission: typeof hasPermission;
    hasRoleAtLeast: typeof hasRoleAtLeast;
    requireOrThrow: typeof requireOrThrow;
    buildIdentityContext: typeof buildIdentityContext;
};
export default _default;
