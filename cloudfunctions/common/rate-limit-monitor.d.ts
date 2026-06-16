/**
 * rate-limit-monitor.ts - 限流监控（TypeScript 源文件 - Sprint 50 新增）
 *
 * 目标：
 *   - 解决 Sprint 17-21 限流系统缺乏可观测性的问题
 *   - 提供 4 类监控指标：
 *     1. 限流命中数（按 type 分组）：{ payment: 12, refund: 5, ... }
 *     2. 限流消费数（按 type 分组）：{ payment: 230, refund: 87, ... }
 *     3. 降级次数（global store 失败 → 内存）：{ total: 3 }
 *     4. 配置来源（db / business_default / fallback）：{ db: 1, business_default: 5, fallback: 0 }
 *   - 提供 webhook 告警接口
 *
 * 用法：
 *   import { recordRateLimitHit, recordRateLimitConsume, getMetrics, getMetricsSnapshot } from './rate-limit-monitor'
 *   import { setAlertWebhook } from './rate-limit-monitor'
 *
 *   // 限流命中时
 *   recordRateLimitHit({ type: 'payment', scope: 'global' })
 *
 *   // 配置告警 webhook
 *   setAlertWebhook(async (event) => {
 *     // 发送钉钉 / 企微 / Slack
 *   })
 *
 *   // 每 60s 拉取一次指标
 *   setInterval(() => {
 *     const m = getMetrics()
 *     console.log(m)
 *   }, 60000)
 *
 * 设计取舍：
 *   - 内存指标 + 周期上报（避免每次请求都远程调用）
 *   - 告警阈值可配置（默认 100 次/分钟触发）
 *   - _resetMetrics() 仅测试用
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.common.json
 */
export type RateLimitScope = 'global' | 'target';
/** 限流命中事件 */
export interface RateLimitHitEvent {
    type: string;
    scope: RateLimitScope;
    reason?: string;
    timestamp?: number;
}
/** 限流消费事件 */
export interface RateLimitConsumeEvent {
    type: string;
    scope: RateLimitScope;
    allowed: boolean;
    timestamp?: number;
}
/** 降级事件 */
export interface RateLimitFallbackEvent {
    source: 'global' | 'memory' | 'config_db';
    reason: string;
    timestamp?: number;
}
/** 配置来源事件 */
export interface RateLimitConfigSourceEvent {
    type: string;
    source: 'db' | 'business_default' | 'fallback';
    timestamp?: number;
}
/** 告警事件 */
export interface RateLimitAlertEvent {
    level: 'info' | 'warn' | 'critical';
    title: string;
    message: string;
    metadata: Record<string, unknown>;
    timestamp: number;
}
/** 告警 webhook 函数 */
export type AlertWebhook = (event: RateLimitAlertEvent) => void | Promise<void>;
/** 指标快照 */
export interface RateLimitMetricsSnapshot {
    /** 限流命中数（按 type → scope → count） */
    hits: Record<string, Record<RateLimitScope, number>>;
    /** 总命中数 */
    totalHits: number;
    /** 限流消费数（按 type → scope → count） */
    consumes: Record<string, Record<RateLimitScope, number>>;
    /** 总消费数 */
    totalConsumes: number;
    /** 降级次数（按 source） */
    fallbacks: Record<string, number>;
    /** 总降级次数 */
    totalFallbacks: number;
    /** 配置来源次数（按 type → source → count） */
    configSources: Record<string, Record<string, number>>;
    /** 命中率（hits / consumes） */
    hitRate: number;
    /** 时间窗口开始 */
    windowStart: number;
    /** 时间窗口结束 */
    windowEnd: number;
}
export declare const DEFAULT_ALERT_THRESHOLDS: Readonly<{
    /** 单类型每分钟命中告警阈值 */
    hitsPerMinute: 100;
    /** 降级次数告警阈值 */
    fallbacksPerMinute: 10;
}>;
/**
 * 设置告警 webhook
 */
export declare function setAlertWebhook(webhook: AlertWebhook | null): void;
export declare function getAlertWebhook(): AlertWebhook | null;
/**
 * 设置告警阈值
 */
export declare function setAlertThresholds(thresholds: Partial<typeof DEFAULT_ALERT_THRESHOLDS>): void;
export declare function getAlertThresholds(): typeof DEFAULT_ALERT_THRESHOLDS;
/**
 * 获取告警历史（最近 N 条）
 */
export declare function getAlertHistory(): readonly RateLimitAlertEvent[];
/**
 * 记录限流命中（被拦截）
 */
export declare function recordRateLimitHit(event: RateLimitHitEvent): void;
/**
 * 记录限流消费（无论允许还是拒绝都记录）
 */
export declare function recordRateLimitConsume(event: RateLimitConsumeEvent): void;
/**
 * 记录降级（global store 失败 → 内存）
 */
export declare function recordRateLimitFallback(event: RateLimitFallbackEvent): void;
/**
 * 记录配置来源（用于统计配置覆盖度）
 */
export declare function recordRateLimitConfigSource(event: RateLimitConfigSourceEvent): void;
/**
 * 获取指标快照
 */
export declare function getMetricsSnapshot(reset?: boolean): RateLimitMetricsSnapshot;
/**
 * 获取实时指标（不带 reset）
 */
export declare function getMetrics(): RateLimitMetricsSnapshot;
/**
 * 重置指标（仅测试用）
 */
export declare function _resetMetrics(): void;
/**
 * 包装 withRateLimit，自动记录指标
 *
 * 用法（推荐替代直接调用 withRateLimit）：
 *   const result = await withRateLimitMonitored(
 *     { userId, type: 'payment' },
 *     () => doSomething()
 *   )
 */
export declare function withRateLimitMonitored<T>(mod: typeof import('./risk-rate-limit'), input: {
    userId: string;
    type: string;
    targetId?: string;
    now?: number;
}, fn: () => Promise<T>, config?: Parameters<typeof mod.withRateLimit>[2]): Promise<T>;
declare const _default: {
    recordRateLimitHit: typeof recordRateLimitHit;
    recordRateLimitConsume: typeof recordRateLimitConsume;
    recordRateLimitFallback: typeof recordRateLimitFallback;
    recordRateLimitConfigSource: typeof recordRateLimitConfigSource;
    getMetrics: typeof getMetrics;
    getMetricsSnapshot: typeof getMetricsSnapshot;
    _resetMetrics: typeof _resetMetrics;
    setAlertWebhook: typeof setAlertWebhook;
    getAlertWebhook: typeof getAlertWebhook;
    setAlertThresholds: typeof setAlertThresholds;
    getAlertThresholds: typeof getAlertThresholds;
    getAlertHistory: typeof getAlertHistory;
    withRateLimitMonitored: typeof withRateLimitMonitored;
    DEFAULT_ALERT_THRESHOLDS: Readonly<{
        /** 单类型每分钟命中告警阈值 */
        hitsPerMinute: 100;
        /** 降级次数告警阈值 */
        fallbacksPerMinute: 10;
    }>;
};
export default _default;
