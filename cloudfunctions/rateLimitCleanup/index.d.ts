/**
 * rateLimitCleanup/index.ts - 限流清理（TypeScript 源文件 - Sprint 46 迁移）
 *
 * 业务功能（cron 触发 + HTTP 调用）：
 *   - cleanup - 分批清理 rate_limits 集合中过期记录
 *   - stats - 拉取限流统计
 *
 * 迁移目标：
 *   - 强类型化 main 函数与 2 个 action handler
 *   - RateLimitStats 接口化
 *
 * 审查修复（Sprint 51）：
 *   - H1: 并发保护 _isRunning（防止 cron 与 HTTP 调用同时执行）
 *   - H2: 循环上限 MAX_CLEANUP_ROUNDS（防止无限循环导致云函数超时）
 *   - H3: bootstrapRateLimit 错误处理 + recordAlert 告警
 *   - M1: 集成 createLogger 记录操作日志
 *   - M2: 集成 recordAlert 关键错误持久化告警
 *   - M3: 使用 isBusinessError + toResponse 标准化错误响应
 *   - L1: 精确类型定义（CloudCollection/CloudQuery/CloudCommand），消除 as never
 *   - L2: 为所有导出常量补充 JSDoc
 *   - L3: event 参数校验（非 null 对象），非法 event 降级为 cleanup
 *   - L7: 提取 ALERT_ACTION 常量，消除告警 action 魔法字符串
 *   - 修复: bootstrap 失败告警去重（每实例仅告警一次，避免 cron 每 10min 重复告警）
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.rateLimitCleanup.json
 */
export interface CloudEvent {
    action?: string;
    data?: Record<string, unknown>;
    body?: string | Record<string, unknown>;
    Time?: string;
    Timestamp?: number;
    TriggerName?: string;
    Message?: string;
    [k: string]: unknown;
}
export interface CloudContext {
    [k: string]: unknown;
}
/** 限流清理结果 */
export interface CleanupResult {
    cleaned: number;
    skipped?: boolean;
}
/** 限流统计 */
export interface RateLimitStats {
    totalRecords: number;
    globalKeys: number;
    targetKeys: number;
    oldestExpireAt: number | null;
    timestamp: number;
}
/** rate_limits 集合名（限流计数存储） */
export declare const COLLECTION = "rate_limits";
/** 单批清理的记录数上限（CloudBase where+remove 单次上限约 1000，200 留安全余量） */
export declare const CLEANUP_BATCH_SIZE = 200;
/** 清理 action 标识 */
export declare const ACTION_CLEANUP = "cleanup";
/** 统计 action 标识 */
export declare const ACTION_STATS = "stats";
/**
 * 清理 rate_limits 集合中 expireAt < now 的记录
 *
 * 优化点：
 *   - 循环上限：MAX_CLEANUP_ROUNDS 防止无限循环导致云函数超时
 *   - 批量删除：cleanupExpiredRateLimits 内部使用 where + in + remove 批量删除
 *   - 告警：达到最大轮次仍有数据时触发 recordAlert
 *
 * @returns 清理的记录数
 */
export declare function cleanupAction(): Promise<CleanupResult>;
/**
 * 拉取 rate_limits 集合的统计数据
 *
 * 使用 count() 和 where().count() 获取准确统计（无 1000 条上限）
 */
export declare function statsAction(): Promise<RateLimitStats>;
/**
 * 云函数主入口（cron 触发 + HTTP 调用）
 *
 * 流程：
 *   1. H3: 检查 bootstrap 状态，失败时触发告警
 *   2. H1: 并发保护 _isRunning 防止 cleanup 重复执行
 *   3. 分发到 cleanupAction / statsAction
 *   4. M3: 错误处理 BusinessError 走 toResponse，未知错误走 recordAlert + handleError
 *
 * @param event 云函数事件（cron 触发或 HTTP 调用）
 */
export declare function main(event: CloudEvent): Promise<unknown>;
declare const _default: {
    main: typeof main;
    cleanupAction: typeof cleanupAction;
    statsAction: typeof statsAction;
    COLLECTION: string;
    CLEANUP_BATCH_SIZE: number;
    ACTION_CLEANUP: string;
    ACTION_STATS: string;
};
export default _default;
