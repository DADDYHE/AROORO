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
 */
export interface AuthLike {
    openid?: string;
    adminId?: string;
    partnerId?: string;
    isPartner?: boolean;
    roles?: string[];
    permissions?: string[];
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
export interface OrderAggregate {
    total: number;
    monthly: number;
    today: number;
}
export interface WalletSummary {
    balance: number;
    totalIncome: number;
    totalWithdrawn: number;
    frozenAmount: number;
}
export interface IncomeOverview {
    commission: CommissionItem;
    hosting: OrderAggregate;
    feeding: OrderAggregate;
    wallet: WalletSummary;
}
export interface IncomeDetailItem {
    id: string;
    type: 'commission' | 'hosting' | 'feeding';
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
