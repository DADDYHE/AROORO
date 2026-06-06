/**
 * auth-middleware.ts - 鉴权与权限中间件
 *
 * 权限模型：
 *   - permission=null  → 仅需登录
 *   - permission='partner' → 需要合作伙伴身份（admins 集合 status=active 且 isPartner=true）
 *
 * 合作伙伴可访问所有管理功能，无细粒度权限区分。
 */
/** verifyAuth 配置选项 */
export interface VerifyAuthOptions {
    /** 是否要求 openid 存在，默认 true */
    requireLogin?: boolean;
    /**
     * 权限要求：
     *   - null/undefined → 仅需登录
     *   - 'partner' → 需要合作伙伴身份
     */
    permission?: string | null;
}
/** verifyAuth 返回值（普通用户） */
export interface BasicAuthResult {
    openid: string;
}
/** verifyAuth 返回值（合作伙伴） */
export interface PartnerAuthResult {
    openid: string;
    partnerId: string;
    isPartner: true;
}
/** verifyAuth 返回值联合类型 */
export type AuthResult = BasicAuthResult | PartnerAuthResult;
/**
 * 鉴权与权限校验
 *
 * @throws {BusinessError} AUTH_REQUIRED：未登录
 * @throws {BusinessError} PARTNER_REQUIRED：非合作伙伴
 */
export declare function verifyAuth(event: unknown, options?: VerifyAuthOptions): Promise<AuthResult>;
