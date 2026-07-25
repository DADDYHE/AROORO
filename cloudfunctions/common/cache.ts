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

import type { LruTtlCache, CacheEntry } from './types'

interface InternalEntry<V> {
  value: V
  timestamp: number
  ttl: number
}

const cache: Map<string, InternalEntry<unknown>> = new Map()
const DEFAULT_TTL = 5 * 60 * 1000 // 5 分钟
const MAX_SIZE = 1000

export function getCache<V = unknown>(key: string): V | null {
  const item = cache.get(key) as InternalEntry<V> | undefined
  if (!item) {return null}
  if (Date.now() - item.timestamp > item.ttl) {
    cache.delete(key)
    return null
  }
  // LRU：访问时刷新顺序（删除后重新插入，使其成为最新访问的）
  cache.delete(key)
  cache.set(key, item)
  return item.value
}

export function setCache<V = unknown>(key: string, value: V, ttlSeconds?: number): void {
  const ttl = ttlSeconds ? ttlSeconds * 1000 : DEFAULT_TTL
  if (cache.size >= MAX_SIZE && !cache.has(key)) {
    // LRU：Map 的迭代顺序是插入顺序，淘汰最早插入的
    const oldestKey = cache.keys().next().value
    if (oldestKey !== undefined) {cache.delete(oldestKey)}
  }
  cache.set(key, { value, timestamp: Date.now(), ttl })
}

export function deleteCache(key: string): boolean {
  return cache.delete(key)
}

export function clearCache(): void {
  cache.clear()
}

export function getCacheSize(): number {
  return cache.size
}

export function hasCache(key: string): boolean {
  const item = cache.get(key) as InternalEntry<unknown> | undefined
  if (!item) {return false}
  if (Date.now() - item.timestamp > item.ttl) {
    cache.delete(key)
    return false
  }
  return true
}

/**
 * 默认导出：工厂函数式 LRU+TTL 缓存
 * 用法：const c = createCache({ maxSize: 500, defaultTtlMs: 60000 })
 */
export interface CacheOptions {
  maxSize?: number
  defaultTtlMs?: number
}

export function createCache<V = unknown>(opts: CacheOptions = {}): LruTtlCache<V> {
  const local = new Map<string, InternalEntry<V>>()
  const max = opts.maxSize || 1000
  const defaultTtl = opts.defaultTtlMs || DEFAULT_TTL

  return {
    get: (key: string) => {
      const item = local.get(key)
      if (!item) {return undefined}
      if (Date.now() - item.timestamp > item.ttl) {
        local.delete(key)
        return undefined
      }
      return item.value
    },
    set: (key: string, value: V, ttlMs?: number) => {
      const ttl = ttlMs || defaultTtl
      if (local.size >= max && !local.has(key)) {
        const oldestKey = local.keys().next().value
        if (oldestKey !== undefined) {local.delete(oldestKey)}
      }
      local.set(key, { value, timestamp: Date.now(), ttl })
    },
    delete: (key: string) => local.delete(key),
    clear: () => local.clear(),
    size: () => local.size,
  }
}

// 复用 CacheEntry 类型，供其它模块使用
export type { CacheEntry }
