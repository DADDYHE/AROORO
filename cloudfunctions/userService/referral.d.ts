/**
 * referral.ts - 用户邀请服务（TypeScript 源文件 - Sprint 37 迁移）
 *
 * 业务功能：
 *   - 获取邀请统计（getReferralStats）
 *   - 获取邀请用户列表（getInvitedUsers）
 *
 * 迁移目标：
 *   - 强类型化所有 db 操作、handler 签名、返回结构
 *   - 复用 OrderLike / OwnerSummary 类型
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.userService.json
 */
export interface AuthLike {
    openid?: string;
    [k: string]: unknown;
}
export interface CloudEvent {
    action?: string;
    data?: Record<string, unknown>;
    page?: number;
    pageSize?: number;
    [k: string]: unknown;
}
export interface CloudContext {
    [k: string]: unknown;
}
export type ReferralHandler = (event: CloudEvent, context: CloudContext, auth: AuthLike) => Promise<unknown>;
export interface UserRecord {
    _id: string;
    openid: string;
    nickName?: string;
    avatarUrl?: string;
    inviterId?: string;
    createdAt?: Date;
    [k: string]: unknown;
}
export interface InvitedUserView {
    _id: string;
    nickName: string;
    avatarUrl: string;
    createdAt: Date;
    orderCount: number;
    totalSpent: string;
}
export interface ReferralStatsResult {
    totalInvited: number;
    consumingCount: number;
    totalSpent: string;
}
export interface InvitedUsersResult {
    list: InvitedUserView[];
    total: number;
}
export declare function getReferralStats(event: CloudEvent, context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function getInvitedUsers(event: CloudEvent, context: CloudContext, auth: AuthLike): Promise<unknown>;
declare const _default: {
    getReferralStats: typeof getReferralStats;
    getInvitedUsers: typeof getInvitedUsers;
};
export default _default;
