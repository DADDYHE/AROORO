/**
 * referral.ts - 合作伙伴邀请统计服务（TypeScript 源文件 - Sprint 36 迁移）
 *
 * 业务功能：
 *   - 获取带货统计（getReferralStats）
 *   - 获取邀请用户列表（getMyInvitedUsers）
 *   - 获取带货订单（getReferralOrders）
 *   - 获取带货订单统计（getReferralOrderStats）
 *
 * 迁移目标：
 *   - 强类型化所有 db 操作、handler 签名、返回结构
 *   - 统一统计函数（countAndSum）复用代码
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.partnerService.json
 *
 * 数据库索引建议（运维需在对应集合上创建）：
 *   users: { inviterId: 1 }                                  - 覆盖 getReferralStats/getMyInvitedUsers 邀请人查询
 *   commissions: { inviterId: 1, status: 1, createdAt: -1 } - 覆盖 getReferralOrders/Stats
 *   orders: { ownerId: 1, status: 1, type: 1 }               - 覆盖 getReferralStats 邀请用户消费查询
 *   feedingOrders: { ownerId: 1, status: 1 }                 - 覆盖 feeding 消费查询
 *   tuan_orders: { ownerId: 1, status: 1 }                   - 覆盖 tuan 消费查询
 *   activity_registrations: { ownerId: 1, status: 1 }        - 覆盖 activity 消费查询
 */
export interface AuthLike {
    openid?: string;
    adminId?: string;
    partnerId?: string;
    isPartner?: boolean;
    roles?: string[];
    permissions?: string[];
    nickName?: string;
    [k: string]: unknown;
}
export interface CloudEvent {
    action?: string;
    data?: Record<string, unknown>;
    type?: string;
    status?: string;
    page?: number;
    pageSize?: number;
    [k: string]: unknown;
}
export interface CloudContext {
    [k: string]: unknown;
}
export type ReferralHandler = (event: CloudEvent, context: CloudContext, auth: AuthLike) => Promise<unknown>;
export interface InvitedUser {
    _id: string;
    nickName: string;
    avatarUrl: string;
    createdAt: Date;
    orderCount?: number;
    totalSpent?: number;
}
export interface CommissionItem {
    _id: string;
    orderNo: string;
    orderType: string;
    commissionAmount: number;
    orderAmount: number;
    status: string;
    createdAt: Date;
}
export interface ReferralStats {
    totalInvited: number;
    consumingCount: number;
    totalSpent: string;
}
export interface ReferralOrderStats {
    totalOrders: number;
    totalCommission: number;
    pendingCommission: number;
    settledCommission: number;
}
export declare function getReferralStats(event: CloudEvent, context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function getMyInvitedUsers(event: CloudEvent, context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function getReferralOrders(event: CloudEvent, context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function getReferralOrderStats(event: CloudEvent, context: CloudContext, auth: AuthLike): Promise<unknown>;
declare const _default: {
    getReferralStats: typeof getReferralStats;
    getMyInvitedUsers: typeof getMyInvitedUsers;
    getReferralOrders: typeof getReferralOrders;
    getReferralOrderStats: typeof getReferralOrderStats;
};
export default _default;
