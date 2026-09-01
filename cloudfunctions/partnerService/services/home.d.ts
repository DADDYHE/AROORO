/**
 * home.ts - 合伙人中心首屏聚合接口（BFF，2026-09-01 性能优化）
 *
 * 背景：
 *   合伙人中心首页原本需要 3 次云函数调用（getMyPermissions / getApplicationStatus /
 *   getMyIncomeOverview），每次调用都要付一次网络 RTT + 一次可能的冷启动。
 *   本接口在同一次云调用内聚合三份数据：3 次冷启 + 3 次 RTT → 1 次冷启 + 1 次 RTT。
 *
 * 设计：
 *   - 阶段一：并行取权限 + 申请状态
 *   - 阶段二：仅当是合伙人时再取收入概览（内部串行不影响外部 RTT，省掉无谓查询）
 *   - 任一子模块失败不影响整体（降级为该项默认值），首屏宁可少数据不可白屏
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.partnerService.json
 */
export interface BffAuth {
    openid?: string;
    [k: string]: unknown;
}
export interface BffEvent {
    action?: string;
    [k: string]: unknown;
}
export interface BffContext {
    [k: string]: unknown;
}
export interface PartnerHomeSummary {
    isPartner: boolean;
    hasPendingApplication: boolean;
    incomeSummary: {
        total: string;
        monthly: string;
        walletBalance: string;
    } | null;
}
export declare function getPartnerHome(event: BffEvent, context: BffContext, auth: BffAuth): Promise<unknown>;
