/**
 * LRU + TTL 内存缓存模块（TypeScript 源文件 - Sprint 12 迁移）
 *
 * 编译方式：
 *   npm run build:common
 *
 * 迁移要点：
 *   - 保留 getCache / setCache / deleteCache / clearCache / getCacheSize / hasCache 全部 export
 *   - setCache 的 LRU 淘汰策略保留（Map 迭代顺序按插入顺序，set 已存在 key 时不更新顺序）
 *   - ttl 单位保持为秒（setCache 的 ttlSeconds 参数）；与原 JS 行为一致
 *
 * 关键类型：
 *   - CacheEntry<V>：内部存储结构，value / timestamp / ttl
 *   - LruTtlCache<V>：公共类型（定义在 types.ts 中）
 */
import type { LruTtlCache, CacheEntry } from './types';
export declare function getCache<V = unknown>(key: string): V | null;
export declare function setCache<V = unknown>(key: string, value: V, ttlSeconds?: number): void;
export declare function deleteCache(key: string): boolean;
export declare function clearCache(): void;
export declare function getCacheSize(): number;
export declare function hasCache(key: string): boolean;
/**
 * 默认导出：工厂函数式 LRU+TTL 缓存
 * 用法：const c = createCache({ maxSize: 500, defaultTtlMs: 60000 })
 */
export interface CacheOptions {
    maxSize?: number;
    defaultTtlMs?: number;
}
export declare function createCache<V = unknown>(opts?: CacheOptions): LruTtlCache<V>;
export type { CacheEntry };
