/**
 * rate-limit-config.ts - 限流配置中心（TypeScript 源文件 - Sprint 50 新增）
 *
 * 目标：
 *   - 解决 Sprint 17 单一 DEFAULT_RISK_RATE_LIMIT_CONFIG 局限
 *   - 支持按业务类型差异化（payment 更严，evaluation 更宽）
 *   - 配置可热更新（db 集合 rate_limit_configs 优先于默认值）
 *   - 配置带 TTL 缓存，避免每次请求都查 db
 *
 * 配置优先级（从高到低）：
 *   1. 调用方显式传入的 config
 *   2. db 集合 rate_limit_configs 中的 type 匹配记录
 *   3. 内置 BUSINESS_TYPE_DEFAULT_CONFIG
 *   4. 兜底 DEFAULT_RISK_RATE_LIMIT_CONFIG
 *
 * db 集合结构（rate_limit_configs）：
 *   {
 *     _id:           string           // 业务类型（order / payment / refund / evaluation / mall_order / activity_apply / ...）
 *     perUserPerMinute: number
 *     perUserPerTargetPerMinute: number
 *     windowMs:      number
 *     enabled:       boolean          // false 时跳过限流（紧急关停）
 *     description:   string
 *     updatedAt:     number
 *     updatedBy:     string
 *   }
 *
 * 用法：
 *   import { getRateLimitConfig, initRateLimitConfigStore, clearRateLimitConfigCache } from './rate-limit-config'
 *   initRateLimitConfigStore({ collection: db.collection('rate_limit_configs'), command: db.command })
 *
 *   // 自动按 type 查找：
 *   const cfg = await getRateLimitConfig('payment')
 *
 *   // 热更新：调用方清缓存或等待 TTL 过期
 *   clearRateLimitConfigCache()
 *
 * 设计取舍：
 *   - 缓存 TTL 30s（业务可配），避免每次请求查 db
 *   - enabled=false 表示紧急关停（无需修改代码即可放行）
 *   - 配置查表不存在的 type 走兜底值（向前兼容）
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.common.json
 */
import { type RateLimitConfig } from './risk-rate-limit';
/** 已知业务类型 */
export type KnownBusinessType = 'order' | 'payment' | 'refund' | 'evaluation' | 'mall_order' | 'activity_apply' | 'boarding_accept' | string;
/** db 中存储的扩展配置（含 enabled / 元数据）*/
export interface RateLimitConfigRecord {
    _id: string;
    perUserPerMinute: number;
    perUserPerTargetPerMinute: number;
    windowMs: number;
    enabled: boolean;
    description?: string;
    updatedAt?: number;
    updatedBy?: string;
}
/** db 句柄 + db.command 引用 */
export interface RateLimitConfigStore {
    collection: any;
    command: any;
    collectionName?: string;
}
/** 配置查找结果 */
export interface RateLimitConfigResult {
    config: RateLimitConfig;
    /** 配置来源（db / default / fallback） */
    source: 'db' | 'business_default' | 'fallback';
    /** 业务类型是否启用（db 记录 enabled=false 时） */
    enabled: boolean;
}
/**
 * 内置业务类型默认配置
 *  - payment / refund: 严（防滥用）
 *  - evaluation: 中（防刷量）
 *  - order: 中（防恶意下单）
 *  - mall_order / activity_apply: 中（防库存耗尽）
 *  - boarding_accept: 严（防商家账号被盗批量接单）
 */
export declare const BUSINESS_TYPE_DEFAULT_CONFIG: Record<string, RateLimitConfig>;
/**
 * 设置缓存 TTL
 */
export declare function setRateLimitConfigCacheTtl(ttlMs: number): void;
/**
 * 获取缓存 TTL
 */
export declare function getRateLimitConfigCacheTtl(): number;
/**
 * 清空配置缓存（强制下次查询走 db 或默认值）
 */
export declare function clearRateLimitConfigCache(type?: string): void;
/**
 * 读取缓存统计（监控/调试）
 */
export declare function getCacheStats(): {
    keys: number;
    ttlMs: number;
};
/**
 * 注入全局配置存储
 *
 * 用法（在云函数入口）：
 *   const db = cloudbase.database()
 *   initRateLimitConfigStore({ collection: db.collection('rate_limit_configs'), command: db.command })
 */
export declare function initRateLimitConfigStore(store: RateLimitConfigStore | null): void;
export declare function getRateLimitConfigStore(): RateLimitConfigStore | null;
/**
 * 异步：按业务类型查找配置（缓存优先 → db → 默认值）
 *
 * 流程：
 *   1. 缓存命中且未过期 → 直接返回
 *   2. 缓存未命中或已过期：
 *      a. db 中有记录 → 验证后写入缓存
 *      b. db 中无记录 → 走 BUSINESS_TYPE_DEFAULT_CONFIG / DEFAULT_RISK_RATE_LIMIT_CONFIG
 *   3. 返回结果 + source 标记
 *
 * @throws 当 db 中存储的 config 数值不合法时
 */
export declare function getRateLimitConfig(type: string): Promise<RateLimitConfigResult>;
/**
 * 同步版本：仅查缓存或默认值，不查 db
 *  - 用于启动期或 db 不可用时的兜底
 *  - 注意：会写入缓存，使后续同步调用也能命中
 */
export declare function getRateLimitConfigSync(type: string): RateLimitConfigResult;
/**
 * 列出所有已知业务类型
 */
export declare function listKnownBusinessTypes(): string[];
/**
 * 快速从 db 实例初始化
 *
 * 用法：
 *   const cloudbase = require('wx-server-sdk')
 *   cloudbase.init({ env: cloudbase.DYNAMIC_CURRENT_ENV })
 *   const db = cloudbase.database()
 *   initRateLimitConfigFromDb(db, { collectionName: 'rate_limit_configs' })
 */
export declare function initRateLimitConfigFromDb(db: any, options?: {
    collectionName?: string;
    command?: any;
}): boolean;
/**
 * 获取某个业务类型的快照（用于管理面板 / 调试）
 */
export declare function getConfigSnapshot(type: string): Promise<{
    type: string;
    effective: RateLimitConfig;
    source: 'db' | 'business_default' | 'fallback';
    enabled: boolean;
    dbRecord: RateLimitConfigRecord | null;
    cached: boolean;
}>;
declare const _default: {
    BUSINESS_TYPE_DEFAULT_CONFIG: Record<string, RateLimitConfig>;
    initRateLimitConfigStore: typeof initRateLimitConfigStore;
    getRateLimitConfigStore: typeof getRateLimitConfigStore;
    setRateLimitConfigCacheTtl: typeof setRateLimitConfigCacheTtl;
    getRateLimitConfigCacheTtl: typeof getRateLimitConfigCacheTtl;
    clearRateLimitConfigCache: typeof clearRateLimitConfigCache;
    getCacheStats: typeof getCacheStats;
    getRateLimitConfig: typeof getRateLimitConfig;
    getRateLimitConfigSync: typeof getRateLimitConfigSync;
    getConfigSnapshot: typeof getConfigSnapshot;
    listKnownBusinessTypes: typeof listKnownBusinessTypes;
    initRateLimitConfigFromDb: typeof initRateLimitConfigFromDb;
};
export default _default;
