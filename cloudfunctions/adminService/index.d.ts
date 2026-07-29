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
import type { CloudBaseDB } from '../common/types';
export type PermissionLevel = 'partner' | 'admin' | 'super_admin' | null;
export type ActionHandler<E = CloudEvent, C = CloudContext, A = AuthLike> = (event: E, context: C, auth: A) => Promise<unknown>;
export type CloudFunctionHandler<E = CloudEvent, C = CloudContext, A = AuthLike> = ActionHandler<E, C, A>;
export interface AuthLike {
    openid?: string;
    adminId?: string;
    partnerId?: string;
    isPartner?: boolean;
    isSuperAdmin?: boolean;
    roles?: string[];
    permissions?: string[];
    _isHttpAuth?: boolean;
    [k: string]: unknown;
}
export interface CloudEvent {
    action?: string;
    data?: Record<string, unknown>;
    body?: string | Record<string, unknown>;
    headers?: Record<string, string | undefined>;
    httpMethod?: string;
    requestContext?: {
        httpMethod?: string;
        [k: string]: unknown;
    };
    accessToken?: string;
    openid?: string;
    [k: string]: unknown;
}
export interface CloudContext {
    HTTP_CONTEXT?: {
        headers: Record<string, string | undefined>;
    };
    [k: string]: unknown;
}
export interface HttpInfo {
    action: string;
    data: Record<string, unknown>;
    _httpContext: {
        headers: Record<string, string | undefined>;
    };
    _isHttpCall: true;
    _parseError?: Error;
}
export interface JwtDecodedToken {
    openid?: string;
    adminId?: string;
    isPartner?: boolean;
    isSuperAdmin?: boolean;
    exp?: number;
    iat?: number;
    [k: string]: unknown;
}
export interface EnrichmentResult {
    admin: {
        _id: string;
        isPartner?: boolean;
        roles?: string[];
        permissions?: string[];
        [k: string]: unknown;
    };
    roles: string[];
    permissions: string[];
    isPartner: boolean;
}
export interface CorsHeaders {
    'Access-Control-Allow-Origin': string;
    'Access-Control-Allow-Methods'?: string;
    'Access-Control-Allow-Headers'?: string;
    'Access-Control-Max-Age'?: string;
    'Content-Type'?: string;
    [k: string]: string | undefined;
}
export interface HttpResponse {
    statusCode: number;
    headers: CorsHeaders;
    body: string;
}
export declare const handlers: Record<string, ActionHandler>;
export type HttpInfoOrError = HttpInfo | HttpParseError;
export interface HttpParseError {
    _isHttpCall: true;
    _parseError: Error;
}
export declare function parseHttpEvent(event: CloudEvent, context: CloudContext): HttpInfoOrError | null;
export declare function parseHttpAuth(httpContext: {
    headers: Record<string, string | undefined>;
}): JwtDecodedToken | null;
export declare function checkHttpPermission(decoded: JwtDecodedToken | null, action: string): boolean;
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
export declare function checkEnrichedPermission(enrichment: EnrichmentResult | null, action: string): boolean;
export declare function getEnrichAdminDb(): CloudBaseDB;
export declare function enrichAuthFromAdmin(decoded: JwtDecodedToken | null): Promise<EnrichmentResult | null>;
export declare const main: (event: CloudEvent, context: CloudContext) => Promise<unknown>;
export { main as default };
