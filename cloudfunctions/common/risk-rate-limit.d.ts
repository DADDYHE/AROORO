/**
 * 风控检测限流（TypeScript 源文件 - Sprint 17 新增，Sprint 21 升级为双 store）
 *
 * 目标：
 *   - 防止恶意调用 detectReviewSpam / detectRefundAbuse / 下单 / 申请 拖垮 db
 *   - 单一用户 + 单一目标 + 短时间内的多次检测请求应被拦截
 *   - 在业务层（submitEvaluation / createRefund / createOrder / ...）入口前置拦截
 *
 * 限流维度：
 *   - 全局：每用户每分钟最多 N 次检测
 *   - 目标级：每用户对同一 hostId / orderId 每分钟最多 N 次
 *
 * 双 store 模式（Sprint 21）：
 *   1. 内存 store（fallback / 性能优化）
 *   2. 全局 store（db 集合 rate_limits，跨云函数实例共享）
 *   - 默认走全局 store；若 store 未注入则降级到内存 store
 *   - 内存 store 仅作为开发/测试环境兜底
 *
 * 滑窗语义：
 *   - 用 LRU-TTL 缓存实现（与 cache.ts 配合）
 *   - 窗口内 N 次后抛 RATE_LIMITED
 *
 * 设计取舍：
 *   - 内存 map 存储滑动窗口（云函数实例维度）
 *   - 云函数并发场景下，跨实例限流借助 db 计数（rate-limit-store.ts）
 *   - 限流本身有 best-effort 语义：被绕过不应导致业务异常
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.common.json
 */
import { type GlobalRateLimitStore } from './rate-limit-store';
import { getRateLimitConfig, getRateLimitConfigSync } from './rate-limit-config';
export interface RateLimitConfig {
    /** 每用户每分钟全局上限 */
    perUserPerMinute: number;
    /** 每用户对同一目标每分钟上限 */
    perUserPerTargetPerMinute: number;
    /** 滑动窗口大小（毫秒） */
    windowMs: number;
}
export interface RateLimitCheckInput {
    userId: string;
    targetId?: string;
    /** 'evaluation' | 'refund' | 任意业务类型 */
    type: 'evaluation' | 'refund' | 'order' | 'mall_order' | 'activity_apply' | string;
    now?: number;
}
export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetAt: number;
    reason?: string;
}
export interface RateLimitStore {
    /** [userId|type] → 时间戳数组（滑动窗口） */
    global: Map<string, number[]>;
    /** [userId|type|targetId] → 时间戳数组 */
    target: Map<string, number[]>;
    /** 上次清理时间 */
    lastCleanup: number;
}
export declare const DEFAULT_RISK_RATE_LIMIT_CONFIG: RateLimitConfig;
export declare function setGlobalRateLimitStore(store: GlobalRateLimitStore | null): void;
export declare function getGlobalRateLimitStore(): GlobalRateLimitStore | null;
/**
 * 检查是否允许（不消费配额）
 */
export declare function peekRateLimit(input: RateLimitCheckInput, config?: RateLimitConfig, store?: RateLimitStore): RateLimitResult;
/**
 * 消费配额：允许则记录，不允许抛错
 *
 * 抛错类型：
 *   - RATE_LIMITED（已注册的业务错误码）
 *
 * @throws BusinessError
 */
export declare function consumeRateLimit(input: RateLimitCheckInput, config?: RateLimitConfig, store?: RateLimitStore): RateLimitResult;
/**
 * 通过全局 db 限流（带内存兜底）
 *
 * 流程：
 *   1. 优先调用 rate-limit-store 的 consumeGlobalRateLimit（原子计数）
 *   2. 若全局 store 未配置 / db 失败 → 降级到内存 consumeRateLimit
 *   3. 若 db 配置 enabled=false（紧急关停）→ 跳过限流直接放行
 *
 * @throws BusinessError RATE_LIMITED / INTERNAL_ERROR
 */
export declare function consumeGlobalRateLimitWithFallback(input: RateLimitCheckInput, config?: RateLimitConfig): Promise<RateLimitResult>;
/**
 * 全局版 peek（只查不消费）
 */
export declare function peekGlobalRateLimitWithFallback(input: RateLimitCheckInput, config?: RateLimitConfig): Promise<RateLimitResult | null>;
/**
 * 在限流保护下执行风控检测
 *
 * 用法：
 *   const risk = await withRateLimit({ userId, type: 'evaluation' }, () =>
 *     detectReviewSpam(ctx)
 *   )
 *
 * 配置优先级：
 *   1. 显式传入的 config
 *   2. db 集合 rate_limit_configs（按 type 查找，热更新）
 *   3. 内置 BUSINESS_TYPE_DEFAULT_CONFIG
 *   4. 兜底 DEFAULT_RISK_RATE_LIMIT_CONFIG
 *
 * @throws BusinessError RATE_LIMITED
 */
export declare function withRateLimit<T>(input: RateLimitCheckInput, fn: () => Promise<T>, config?: RateLimitConfig, store?: RateLimitStore): Promise<T>;
/**
 * 重置 store（仅测试用）
 */
export declare function _resetStore(store?: RateLimitStore): void;
/**
 * 获取 store 统计（监控 / 调试）
 */
export declare function getStoreStats(store?: RateLimitStore): {
    globalKeys: number;
    targetKeys: number;
    lastCleanup: number;
};
/**
 * 从 cloudbase db 实例快速注入全局限流存储
 *
 * 用法：
 *   const cloudbase = require('wx-server-sdk')
 *   cloudbase.init({ env: cloudbase.DYNAMIC_CURRENT_ENV })
 *   const db = cloudbase.database()
 *   initGlobalRateLimitFromDb(db, { collectionName: 'rate_limits' })
 *
 * 若 db 未传或方法不可用，则保持 null（降级到内存模式）
 */
export declare function initGlobalRateLimitFromDb(db: any, options?: {
    collectionName?: string;
    command?: any;
}): boolean;
declare const _default: {
    DEFAULT_RISK_RATE_LIMIT_CONFIG: RateLimitConfig;
    peekRateLimit: typeof peekRateLimit;
    consumeRateLimit: typeof consumeRateLimit;
    withRateLimit: typeof withRateLimit;
    consumeGlobalRateLimitWithFallback: typeof consumeGlobalRateLimitWithFallback;
    peekGlobalRateLimitWithFallback: typeof peekGlobalRateLimitWithFallback;
    setGlobalRateLimitStore: typeof setGlobalRateLimitStore;
    getGlobalRateLimitStore: typeof getGlobalRateLimitStore;
    initGlobalRateLimitFromDb: typeof initGlobalRateLimitFromDb;
    _resetStore: typeof _resetStore;
    getStoreStats: typeof getStoreStats;
    getRateLimitConfig: typeof getRateLimitConfig;
    getRateLimitConfigSync: typeof getRateLimitConfigSync;
};
export default _default;
