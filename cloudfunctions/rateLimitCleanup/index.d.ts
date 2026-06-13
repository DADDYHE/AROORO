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
}
/** 限流统计 */
export interface RateLimitStats {
    [k: string]: unknown;
}
export declare const COLLECTION = "rate_limits";
export declare const CLEANUP_BATCH_SIZE = 200;
export declare const ACTION_CLEANUP = "cleanup";
export declare const ACTION_STATS = "stats";
export declare function cleanupAction(): Promise<CleanupResult>;
export declare function statsAction(): Promise<RateLimitStats>;
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
