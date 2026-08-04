/**
 * partnerService/index.ts - 合作伙伴服务主入口（TypeScript 源文件 - Sprint 35 迁移）
 *
 * 业务功能：
 *   - 合作伙伴小程序端统一入口：申请 / 状态 / 权限 / 收入 / 钱包 / 提现 / 邀请
 *   - 4 个服务子模块：application / wallet / referral / income
 *   - 共 14 个 action：
 *     * 申请（3 个）：submitApplication / getApplicationStatus / getMyPermissions
 *     * 收入 / 钱包（5 个）：getMyIncomeOverview / getMyIncomeDetails / getMyWallet / getMyWithdrawals / requestWithdrawal
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
export interface AuthLike {
    openid?: string;
    adminId?: string;
    partnerId?: string;
    isPartner?: boolean;
    isSuperAdmin?: boolean;
    roles?: string[];
    permissions?: string[];
    _isHttpAuth?: boolean;
    nickName?: string;
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
export interface AdminRecord {
    _id: string;
    status?: string;
    roles?: string[];
    permissions?: string[];
    isPartner?: boolean;
    nickName?: string;
    [k: string]: unknown;
}
export type PartnerActionHandler = (event: CloudEvent, context: CloudContext, auth: AuthLike) => Promise<unknown>;
export type PartnerPermission = string | string[] | null;
export interface PartnerHandlers {
    submitApplication: PartnerActionHandler;
    getApplicationStatus: PartnerActionHandler;
    getMyPermissions: PartnerActionHandler;
    getMyIncomeOverview: PartnerActionHandler;
    getMyIncomeDetails: PartnerActionHandler;
    getMyWallet: PartnerActionHandler;
    getMyWithdrawals: PartnerActionHandler;
    requestWithdrawal: PartnerActionHandler;
    getServiceIncomeOverview: PartnerActionHandler;
    getServiceIncomeDetails: PartnerActionHandler;
    getReferralStats: PartnerActionHandler;
    getMyInvitedUsers: PartnerActionHandler;
    getReferralOrders: PartnerActionHandler;
    getReferralOrderStats: PartnerActionHandler;
}
export declare const handlers: PartnerHandlers;
export declare const main: (event: CloudEvent, context: CloudContext) => Promise<unknown>;
declare const _default: {
    main: (event: CloudEvent, context: CloudContext) => Promise<unknown>;
    handlers: PartnerHandlers;
    ACTION_PERMISSIONS: Record<keyof PartnerHandlers, PartnerPermission>;
};
export default _default;
