/**
 * bundle.ts - 合伙人子页面首屏聚合接口（BFF，2026-09-01 性能优化 P1）
 *
 * 背景：
 *   income 页首屏需 5 次云调用（overview / wallet / rates / payee / details）、
 *   service-income 页 4 次、referral 页 3 次。每次调用付一次网络 RTT + 可能一次冷启动。
 *   本模块把每页聚合为 1 次云调用，服务端 Promise.all 并行执行各子查询：
 *   5 次冷启 + 5 次 RTT → 1 次冷启 + 1 次 RTT。
 *
 * 设计：
 *   - 复用各子模块 handler（编译产物 require，避免与 index.ts 循环依赖）
 *   - 任一子项失败降级为 null，不阻断整包（保持原页面 rates/payee 独立容错语义）
 *   - bundle 只覆盖首屏；tab 切换 / 分页 / 写操作后刷新仍走原接口
 *   - 注意：overview.wallet 是佣金+服务收入合并汇总（H2 口径），
 *     提现余额需独立调 getMyWallet（纯 commission 钱包），不可复用
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
    type?: string;
    page?: number;
    pageSize?: number;
    walletType?: string;
    [k: string]: unknown;
}
export interface BffContext {
    [k: string]: unknown;
}
export declare function getPartnerIncomeBundle(event: BffEvent, context: BffContext, auth: BffAuth): Promise<unknown>;
export declare function getServiceIncomeBundle(event: BffEvent, context: BffContext, auth: BffAuth): Promise<unknown>;
export declare function getReferralBundle(event: BffEvent, context: BffContext, auth: BffAuth): Promise<unknown>;
