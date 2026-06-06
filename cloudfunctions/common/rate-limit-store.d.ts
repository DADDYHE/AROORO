/**
 * 全局限流存储后端（TypeScript 源文件 - Sprint 21 新增）
 *
 * 目标：
 *   - 替代 risk-rate-limit.ts 的内存 store，实现云函数跨实例共享
 *   - 基于 cloudbase db 集合，原子自增计数（db.command.inc）
 *   - 窗口开始时间对齐：同 key 在 windowMs 内的请求共享同一个 windowStart
 *   - 异常降级：db 失败时抛错，调用方可回退到 in-memory
 *
 * 存储结构（rate_limits 集合）：
 *   {
 *     _id:           string    // 复合 key: `g:${userId}|${type}` 或 `t:${userId}|${type}|${targetId}`
 *     scope:         'global' | 'target'
 *     userId:        string
 *     type:          string
 *     targetId:      string?
 *     count:         number    // 当前窗口累计次数
 *     windowStart:   number    // 窗口开始时间戳（ms）
 *     windowMs:      number    // 窗口长度（ms）
 *     expireAt:      number    // windowStart + windowMs，用于定时清理
 *     updatedAt:     number
 *   }
 *
 * 设计取舍：
 *   - 用复合 _id 保证同 key 串行更新（不依赖分布式锁）
 *   - windowStart 在窗口首次请求时设定；窗口内后续请求累加 count
 *   - 跨窗口需主动滚动：用 atomic update + 比较 windowStart
 *   - 集合索引：expireAt（云开发 TTL 字段，可被自动清理）
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.common.json
 */
export interface GlobalRateLimitRecord {
    /** 复合主键：scope 前缀:userId|type[|targetId] */
    _id: string;
    scope: 'global' | 'target';
    userId: string;
    type: string;
    targetId?: string;
    count: number;
    windowStart: number;
    windowMs: number;
    expireAt: number;
    updatedAt: number;
}
export interface GlobalRateLimitInput {
    userId: string;
    type: string;
    targetId?: string;
    windowMs: number;
    limit: number;
    now?: number;
}
export interface GlobalRateLimitResult {
    allowed: boolean;
    remaining: number;
    resetAt: number;
    count: number;
    /** 存储 key，便于排查 */
    key: string;
    /** 哪一层限流（global/target），便于上层决定 */
    scope: 'global' | 'target';
}
/** db 句柄 + db.command 引用 */
export interface GlobalRateLimitStore {
    /** db.collection(name) 返回的集合句柄 */
    collection: any;
    /** db.command，提供 inc / lt 等原子操作 */
    command: any;
    /** 集合名（默认 'rate_limits'） */
    collectionName?: string;
}
/**
 * 生成复合 _id
 * 格式：scope前缀:userId|type[|targetId]
 *   g:userId|type           → 全局维度
 *   t:userId|type|targetId  → 目标维度
 */
export declare function buildKey(input: GlobalRateLimitInput, scope: 'global' | 'target'): string;
/**
 * 原子地消费一次配额（同时更新 global + target 两个 key）
 *
 * 决策规则：
 *   - 任何一个 key 超限 → 拒绝（不消费）→ 但由于先读后写可能存在竞态
 *   - 实现：先 peek 再 consume；如超限则不写
 *
 * 注：原子性基于 doc(_id) 的 update 串行化（同 key 自动排队）
 *
 * @throws BusinessError INTERNAL_ERROR 当 db 不可用时
 */
export declare function consumeGlobalRateLimit(input: GlobalRateLimitInput, store: GlobalRateLimitStore): Promise<GlobalRateLimitResult>;
/**
 * 只查询当前 count，不写入
 */
export declare function peekGlobalRateLimit(input: GlobalRateLimitInput, store: GlobalRateLimitStore): Promise<GlobalRateLimitResult | null>;
/**
 * 清理 expireAt < now 的记录
 * - 由定时任务调用（建议每 5-10 分钟一次）
 * - 也可由 CI 审计脚本调用
 *
 * @returns 删除的记录数
 */
export declare function cleanupExpiredRateLimits(store: GlobalRateLimitStore, batchSize?: number): Promise<number>;
export interface GlobalRateLimitStats {
    totalRecords: number;
    globalKeys: number;
    targetKeys: number;
    oldestExpireAt: number | null;
}
export declare function getGlobalRateLimitStats(store: GlobalRateLimitStore): Promise<GlobalRateLimitStats>;
declare const _default: {
    consumeGlobalRateLimit: typeof consumeGlobalRateLimit;
    peekGlobalRateLimit: typeof peekGlobalRateLimit;
    cleanupExpiredRateLimits: typeof cleanupExpiredRateLimits;
    getGlobalRateLimitStats: typeof getGlobalRateLimitStats;
    buildKey: typeof buildKey;
};
export default _default;
