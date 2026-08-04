/**
 * wallet.ts - 合作伙伴钱包与收入服务（TypeScript 源文件 - Sprint 36 迁移）
 *
 * 业务功能：
 *   - 获取收入概览（getMyIncomeOverview）
 *   - 获取收入明细（getMyIncomeDetails）
 *   - 获取钱包信息（getMyWallet）
 *   - 获取提现记录（getMyWithdrawals）
 *   - 申请提现（requestWithdrawal）
 *
 * 迁移目标：
 *   - 强类型化所有 db 操作、handler 签名、返回结构
 *   - 复用统计算法（月度 / 当日 / 总和）
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.partnerService.json
 *
 * 数据库索引建议（运维需在对应集合上创建）：
 *   wallets: { openid: 1, type: 1 }                              - 复合唯一索引（硬约束）
 *   withdrawals: { openid: 1, walletType: 1, status: 1, createdAt: -1 } - 覆盖 getMyWithdrawals + 每日次数查询（M9: 含 status）
 *   commissions: { inviterId: 1, status: 1, createdAt: -1 } - 覆盖 getMyIncomeOverview/Details
 *   commissions: { inviterId: 1, orderType: 1, status: 1 } - 覆盖 byOrderType 双维度 aggregate（M5）
 *   orders: { organizerId: 1, status: 1, type: 1 }               - 覆盖 boarding 寄养收入查询
 *   feedingOrders: { ownerId: 1, status: 1 }                     - 覆盖 feeding 服务收入查询
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
    page?: number;
    pageSize?: number;
    amount?: number | string;
    [k: string]: unknown;
}
export interface CloudContext {
    [k: string]: unknown;
}
export type WalletHandler = (event: CloudEvent, context: CloudContext, auth: AuthLike) => Promise<unknown>;
export interface WalletRecord {
    _id: string;
    openid: string;
    type?: string;
    balance: number;
    totalIncome: number;
    totalWithdrawn: number;
    frozenAmount: number;
    status: 'active' | 'frozen';
    createdAt: Date;
    updatedAt: Date;
}
export interface CommissionItem {
    total: number;
    pending: number;
    settled: number;
    monthly: number;
    today: number;
}
export interface CommissionByOrderType {
    total: number;
    pending: number;
    settled: number;
    monthly: number;
    today: number;
}
export interface CommissionOverview extends CommissionItem {
    byOrderType: Record<string, CommissionByOrderType>;
}
export interface OrderAggregate {
    total: number;
    monthly: number;
    today: number;
}
export interface ServiceIncomeByType {
    total: number;
    monthly: number;
    today: number;
}
export interface ServiceIncomeOverview {
    total: number;
    monthly: number;
    today: number;
    byType: Record<string, ServiceIncomeByType>;
}
export interface WalletSummary {
    balance: number;
    totalIncome: number;
    totalWithdrawn: number;
    frozenAmount: number;
}
export interface IncomeOverview {
    commission: CommissionOverview;
    boarding: OrderAggregate;
    feeding: OrderAggregate;
    serviceIncome: ServiceIncomeOverview;
    wallet: WalletSummary & {
        commission: WalletSummary;
        serviceIncome: WalletSummary;
    };
}
export interface IncomeDetailItem {
    id: string;
    type: 'commission' | 'hosting' | 'boarding' | 'feeding' | 'tuan' | 'mall' | 'activity';
    typeName: string;
    amount: number;
    orderNo: string;
    description: string;
    status: string;
    createdAt: Date;
}
export interface IncomeDetailsResult {
    list: IncomeDetailItem[];
    total: number;
    totalAmount: number;
}
export declare function getMyIncomeOverview(event: CloudEvent, context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function getMyIncomeDetails(event: CloudEvent, context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function getMyWallet(event: CloudEvent, context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function getMyWithdrawals(event: CloudEvent, context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function requestWithdrawal(event: CloudEvent, context: CloudContext, auth: AuthLike): Promise<unknown>;
declare const _default: {
    getMyIncomeOverview: typeof getMyIncomeOverview;
    getMyIncomeDetails: typeof getMyIncomeDetails;
    getMyWallet: typeof getMyWallet;
    getMyWithdrawals: typeof getMyWithdrawals;
    requestWithdrawal: typeof requestWithdrawal;
};
export default _default;
