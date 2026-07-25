/**
 * couponExpiryCheck/index.ts - 优惠券过期检查（TypeScript 源文件 - Sprint 46 迁移）
 *
 * 业务功能（cron 触发）：
 *   - 阶段 1: 扫描 user_coupons 中 status='unused' 且 endTime<now 的记录
 *             循环分批标记 status='expired'（每批 100 条，最多 20 轮 = 2000 条/次）
 *   - 阶段 2: 扫描 status='locked' 且 endTime<now-7天 的卡死券
 *             标记为 expired，清理 orderId 等关联字段，发 warn 告警让运营核查
 *   - cron 失败时主动告警，避免长期静默故障
 *
 * 迁移目标：
 *   - 强类型化 main 函数签名与 UserCouponDoc 接口
 *   - 与 orderTimeoutService / tuanExpiryCheck 模式一致
 *
 * 历史修复：
 *   - H1: 修复 where().update() 单次 100 条静默截断问题（循环分批）
 *   - M1: 扫描 locked 卡死券（endTime < now - 7天），清理关联字段并告警
 *   - M3: 接入 recordAlert，cron 失败主动告警
 *   - L2: 进程内并发保护（_isRunning 标志）
 *   - L3/L4: 日志打印 ISO 时间戳，区分 updated=0 场景
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.couponExpiryCheck.json
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
/** 优惠券状态 */
export type CouponStatus = 'unused' | 'locked' | 'used' | 'expired';
/** 优惠券文档（投影用） */
export interface UserCouponDoc {
    _id: string;
    status?: CouponStatus;
    endTime?: string | Date;
    [k: string]: unknown;
}
/** 处理结果 */
export interface ExpiryCheckResult {
    updatedCount: number;
    /** M1: 卡死 locked 券处理数量 */
    stuckLockedCount?: number;
    /** L2: 是否因并发跳过 */
    skipped?: boolean;
}
export declare const COLLECTION = "user_coupons";
export declare const TARGET_STATUS: CouponStatus;
export declare const NEW_STATUS: CouponStatus;
export declare const BATCH_LIMIT = 100;
export declare const MAX_ROUNDS = 20;
export declare const STUCK_LOCKED_STATUS: CouponStatus;
export declare const STUCK_LOCKED_DAYS = 7;
export declare const STUCK_LOCKED_LIMIT = 100;
/**
 * 优惠券过期检查主入口（cron 触发）。
 *
 * 流程：
 *   1. 扫描 user_coupons 中 status='unused' 且 endTime<now 的记录
 *      → 循环分批更新为 status='expired'（每批最多 100 条，CloudBase 单次 update 上限）
 *   2. M1: 扫描 status='locked' 且 endTime<now-7天 的卡死券
 *      → 标记为 expired，清理 orderId 等关联字段，发 warn 告警让运营核查
 *   3. 返回 updatedCount（累计所有批次）
 *
 * H1: 修复 where().update() 单次 100 条静默截断问题
 *   - 旧实现：单次 update，超过 100 条的部分被丢弃且无错误
 *   - 新实现：循环 update 直到 updated < BATCH_SIZE 或达到 MAX_ROUNDS 上限
 *   - 幂等性：update 操作天然幂等，重复执行只更新状态相同的记录
 *
 * L3: 在日志中打印 ISO 时间戳，便于跨时区排查
 * L4: 区分 updated=0（无过期券）和 updated>0（处理完成）的日志
 */
export declare function main(event: CloudEvent, _context: CloudContext): Promise<unknown>;
declare const _default: {
    main: typeof main;
    COLLECTION: string;
    TARGET_STATUS: "unused";
    NEW_STATUS: "expired";
    BATCH_LIMIT: number;
    MAX_ROUNDS: number;
    STUCK_LOCKED_STATUS: "locked";
    STUCK_LOCKED_DAYS: number;
    STUCK_LOCKED_LIMIT: number;
};
export default _default;
