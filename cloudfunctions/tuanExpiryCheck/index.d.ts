/**
 * tuanExpiryCheck/index.ts - 团购过期检查（TypeScript 源文件 - Sprint 46 迁移）
 *
 * 业务功能（cron 触发，每天 02:30）：
 *   - 扫描 tuan_deals 集合中 status in [published, active] 且 endTime<now 的记录
 *   - H2: 下游联动清理（仅处理无资金流的 pending_payment 订单）：
 *       a. 取消 tuan_orders where dealId in [过期deals] && status='pending_payment'
 *       b. 同步 orders where type='group_buy' && dealId in [...] && status='pending_payment'
 *       c. 解锁 user_coupons where lockedOrderId in [被取消orders] && status='locked'
 *       d. 取消 commissions where orderId in [被取消orders] && status='pending'
 *   - 标记 tuan_deals.status='ended'
 *   - recordAlert 通知运营（含已支付订单数，需人工处理发货/退款）
 *
 * 安全设计：
 *   - 仅清理 pending_payment 状态订单（无资金流，可安全取消）
 *   - 不自动退款 paid/pending_shipment 订单（涉及资金流，仅告警由人工处理）
 *   - 所有 update 操作用 status 条件保护，确保幂等
 *
 * 审查修复（Sprint 51）：
 *   - H1: 循环分批 update（修复 where().update() 单次 100 条静默截断）
 *   - H2: 下游联动清理（取消 pending_payment 订单/佣金/解锁优惠券）
 *   - H3: 并发保护 _isRunning（防止 cron 重叠执行）
 *   - H4: 接入 recordAlert（失败 + 达上限 + 下游清理完成告警）
 *   - M1: event 参数校验（非 null 对象）
 *   - M2: ISO 时间戳日志（便于跨时区排查）
 *   - M3: 区分 updated=0 与 updated>0 场景日志
 *   - M4: TARGET_STATUSES 含 active 的注释说明（当前无写入路径，保留兼容）
 *   - L2: _context 参数 JSDoc 说明
 *   - L3: ExpiryCheckResult 扩展 skipped/cappedAtMaxRounds/downstream 字段
 *   - L4: TuanDealDoc 预留 title/products 字段
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.tuanExpiryCheck.json
 */
export interface CloudEvent {
    Time?: string;
    Timestamp?: number;
    TriggerName?: string;
    Message?: string;
    [k: string]: unknown;
}
export interface CloudContext {
    [k: string]: unknown;
}
/** 团购状态 */
export type TuanStatus = 'draft' | 'published' | 'active' | 'ended' | 'cancelled';
/** 团购文档（投影用，L4: 预留 title/products 字段供后续联动扩展） */
export interface TuanDealDoc {
    _id: string;
    status?: TuanStatus;
    endTime?: string | Date;
    title?: string;
    products?: Array<{
        productId: string;
        stock?: number;
        sold?: number;
        [k: string]: unknown;
    }>;
    [k: string]: unknown;
}
/** H2: 下游联动清理结果 */
export interface DownstreamCleanupResult {
    /** 取消的 tuan_orders 数（pending_payment 状态） */
    cancelledTuanOrders: number;
    /** 取消的 orders 数（type=group_buy && pending_payment 状态） */
    cancelledOrders: number;
    /** 解锁的 user_coupons 数 */
    unlockedCoupons: number;
    /** 取消的 commissions 数（pending 状态） */
    cancelledCommissions: number;
    /** 需人工处理的已支付订单数（paid/pending_shipment，仅告警不自动处理） */
    paidOrdersNeedManual: number;
}
/** 处理结果（L3: 扩展 skipped/cappedAtMaxRounds/downstream 字段） */
export interface ExpiryCheckResult {
    updatedCount: number;
    /** 是否因并发跳过 */
    skipped?: boolean;
    /** 是否达到 MAX_ROUNDS 上限 */
    cappedAtMaxRounds?: boolean;
    /** H2: 下游清理结果 */
    downstream?: DownstreamCleanupResult;
}
/** tuan_deals 集合名 */
export declare const COLLECTION = "tuan_deals";
/**
 * 需扫描的过期前状态
 * M4: 'active' 当前全代码库无写入路径（仅 published → ended），
 *   保留以兼容未来运营手动激活场景
 */
export declare const TARGET_STATUSES: readonly TuanStatus[];
/** 过期后目标状态 */
export declare const NEW_STATUS: TuanStatus;
/**
 * H1: CloudBase where().update() 单次最多影响 100 条记录
 *   - 超过部分会被静默丢弃（不报错），导致大批过期 deal 未被标记
 *   - 用循环分批 update 直到 updated < BATCH_LIMIT 表示已处理完
 *   - MAX_ROUNDS 上限防止异常情况下无限循环（20 轮 × 100 条 = 2000 条，覆盖单日过期量）
 */
export declare const BATCH_LIMIT = 100;
export declare const MAX_ROUNDS = 20;
/**
 * 团购过期检查主入口（cron 触发）。
 *
 * 流程：
 *   1. H3: 并发保护——前次未完成时跳过本次
 *   2. H1: 分页查询过期 deal _id 列表（游标分页，避免 1000 条上限）
 *   3. H2: 下游联动清理（取消 pending_payment 订单/佣金/解锁优惠券）
 *   4. H1: 批量更新 tuan_deals.status='ended'（分批 update）
 *   5. H4: recordAlert 通知运营（含下游清理结果 + 需人工处理的已支付订单数）
 *
 * @param event 云函数事件（cron 触发或 HTTP 调用）
 * @param _context CloudBase 上下文（本函数未使用，保留以符合云函数签名规范）
 */
export declare function main(event: CloudEvent, _context: CloudContext): Promise<unknown>;
declare const _default: {
    main: typeof main;
    COLLECTION: string;
    TARGET_STATUSES: readonly TuanStatus[];
    NEW_STATUS: "ended";
    BATCH_LIMIT: number;
    MAX_ROUNDS: number;
};
export default _default;
