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

import { err } from './errors'
import {
  consumeGlobalRateLimit,
  peekGlobalRateLimit,
  type GlobalRateLimitStore,
  type GlobalRateLimitResult,
} from './rate-limit-store'

// ===== 类型定义 =====

export interface RateLimitConfig {
  /** 每用户每分钟全局上限 */
  perUserPerMinute: number
  /** 每用户对同一目标每分钟上限 */
  perUserPerTargetPerMinute: number
  /** 滑动窗口大小（毫秒） */
  windowMs: number
}

export interface RateLimitCheckInput {
  userId: string
  targetId?: string
  /** 'evaluation' | 'refund' | 任意业务类型 */
  type: 'evaluation' | 'refund' | 'order' | 'mall_order' | 'activity_apply' | string
  now?: number
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
  reason?: string
}

export interface RateLimitStore {
  /** [userId|type] → 时间戳数组（滑动窗口） */
  global: Map<string, number[]>
  /** [userId|type|targetId] → 时间戳数组 */
  target: Map<string, number[]>
  /** 上次清理时间 */
  lastCleanup: number
}

// ===== 默认配置 =====

export const DEFAULT_RISK_RATE_LIMIT_CONFIG: RateLimitConfig = Object.freeze({
  perUserPerMinute: 10,              // 每用户每分钟 10 次全局检测
  perUserPerTargetPerMinute: 5,      // 每用户对同一目标 5 次
  windowMs: 60 * 1000,               // 1 分钟
})

// ===== 内存存储 =====

const _store: RateLimitStore = {
  global: new Map(),
  target: new Map(),
  lastCleanup: 0,
}

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000  // 5 分钟清理一次

// ===== 全局存储（可选）=====

/**
 * 全局限流存储句柄（可选）
 *
 * 用法（在云函数入口注入）：
 *   const { db } = require('./common/cloudbase')
 *   const { setGlobalRateLimitStore } = require('./common/risk-rate-limit')
 *   setGlobalRateLimitStore({
 *     collection: db.collection('rate_limits'),
 *     command: db.command,
 *   })
 */
let _globalStore: GlobalRateLimitStore | null = null

export function setGlobalRateLimitStore(store: GlobalRateLimitStore | null): void {
  _globalStore = store
}

export function getGlobalRateLimitStore(): GlobalRateLimitStore | null {
  return _globalStore
}

/**
 * 滑动窗口清理
 */
function cleanup(store: RateLimitStore, windowMs: number, now: number): void {
  if (now - store.lastCleanup < CLEANUP_INTERVAL_MS) {
    return
  }
  const cutoff = now - windowMs
  for (const [key, arr] of store.global) {
    const filtered = arr.filter(t => t > cutoff)
    if (filtered.length === 0) {
      store.global.delete(key)
    } else {
      store.global.set(key, filtered)
    }
  }
  for (const [key, arr] of store.target) {
    const filtered = arr.filter(t => t > cutoff)
    if (filtered.length === 0) {
      store.target.delete(key)
    } else {
      store.target.set(key, filtered)
    }
  }
  store.lastCleanup = now
}

// ===== 内存版限流（fallback）=====

/**
 * 检查是否允许（不消费配额）
 */
export function peekRateLimit(
  input: RateLimitCheckInput,
  config: RateLimitConfig = DEFAULT_RISK_RATE_LIMIT_CONFIG,
  store: RateLimitStore = _store
): RateLimitResult {
  const now = input.now ?? Date.now()
  cleanup(store, config.windowMs, now)
  const cutoff = now - config.windowMs

  const globalKey = `${input.userId}|${input.type}`
  const globalArr = (store.global.get(globalKey) || []).filter(t => t > cutoff)

  let allowed = globalArr.length < config.perUserPerMinute
  let remaining = config.perUserPerMinute - globalArr.length
  let reason: string | undefined

  if (!allowed) {
    reason = `RATE_LIMIT_GLOBAL:${input.userId}:${config.perUserPerMinute}/${config.windowMs / 1000}s`
  } else if (input.targetId) {
    const targetKey = `${input.userId}|${input.type}|${input.targetId}`
    const targetArr = (store.target.get(targetKey) || []).filter(t => t > cutoff)
    if (targetArr.length >= config.perUserPerTargetPerMinute) {
      allowed = false
      remaining = 0
      reason = `RATE_LIMIT_TARGET:${input.targetId}:${config.perUserPerTargetPerMinute}/${config.windowMs / 1000}s`
    } else {
      remaining = Math.min(remaining, config.perUserPerTargetPerMinute - targetArr.length)
    }
  }

  return {
    allowed,
    remaining: Math.max(0, remaining),
    resetAt: globalArr.length > 0 ? globalArr[0] + config.windowMs : now + config.windowMs,
    reason,
  }
}

/**
 * 消费配额：允许则记录，不允许抛错
 *
 * 抛错类型：
 *   - RATE_LIMITED（已注册的业务错误码）
 *
 * @throws BusinessError
 */
export function consumeRateLimit(
  input: RateLimitCheckInput,
  config: RateLimitConfig = DEFAULT_RISK_RATE_LIMIT_CONFIG,
  store: RateLimitStore = _store
): RateLimitResult {
  const result = peekRateLimit(input, config, store)
  if (!result.allowed) {
    throw err('RATE_LIMITED', result.reason || '检测请求过于频繁', {
      remaining: result.remaining,
      resetAt: result.resetAt,
    })
  }
  // 消费配额
  const now = input.now ?? Date.now()
  const globalKey = `${input.userId}|${input.type}`
  const globalArr = store.global.get(globalKey) || []
  globalArr.push(now)
  store.global.set(globalKey, globalArr)

  if (input.targetId) {
    const targetKey = `${input.userId}|${input.type}|${input.targetId}`
    const targetArr = store.target.get(targetKey) || []
    targetArr.push(now)
    store.target.set(targetKey, targetArr)
  }

  return result
}

// ===== 全局版限流（推荐）=====

/**
 * 通过全局 db 限流（带内存兜底）
 *
 * 流程：
 *   1. 优先调用 rate-limit-store 的 consumeGlobalRateLimit（原子计数）
 *   2. 若全局 store 未配置 / db 失败 → 降级到内存 consumeRateLimit
 *
 * @throws BusinessError RATE_LIMITED / INTERNAL_ERROR
 */
export async function consumeGlobalRateLimitWithFallback(
  input: RateLimitCheckInput,
  config: RateLimitConfig = DEFAULT_RISK_RATE_LIMIT_CONFIG
): Promise<RateLimitResult> {
  if (_globalStore) {
    try {
      const globalResult = await consumeGlobalRateLimit(
        {
          userId: input.userId,
          type: input.type,
          targetId: input.targetId,
          windowMs: config.windowMs,
          limit: config.perUserPerMinute,
          now: input.now,
        },
        _globalStore
      )
      if (!globalResult.allowed) {
        const reason = `RATE_LIMIT_${globalResult.scope.toUpperCase()}:${input.userId}:${config.perUserPerMinute}/${config.windowMs / 1000}s`
        throw err('RATE_LIMITED', reason, {
          remaining: 0,
          resetAt: globalResult.resetAt,
        })
      }
      return {
        allowed: true,
        remaining: globalResult.remaining,
        resetAt: globalResult.resetAt,
      }
    } catch (e: any) {
      // 已经是业务错误则透传
      if (e && e.code === 'RATE_LIMITED') {throw e}
      // 其他错误（db 不可用等）降级到内存
      // eslint-disable-next-line no-console
      console.warn('[risk-rate-limit] global store failed, fallback to memory:', e && e.message)
    }
  }
  // 降级到内存
  return consumeRateLimit(input, config)
}

/**
 * 全局版 peek（只查不消费）
 */
export async function peekGlobalRateLimitWithFallback(
  input: RateLimitCheckInput,
  config: RateLimitConfig = DEFAULT_RISK_RATE_LIMIT_CONFIG
): Promise<RateLimitResult | null> {
  if (_globalStore) {
    const r = await peekGlobalRateLimit(
      {
        userId: input.userId,
        type: input.type,
        targetId: input.targetId,
        windowMs: config.windowMs,
        limit: config.perUserPerMinute,
        now: input.now,
      },
      _globalStore
    )
    if (r) {
      return {
        allowed: r.allowed,
        remaining: r.remaining,
        resetAt: r.resetAt,
      }
    }
  }
  // 降级到内存
  return peekRateLimit(input, config)
}

// ===== 包裹函数 =====

/**
 * 在限流保护下执行风控检测
 *
 * 用法：
 *   const risk = await withRateLimit({ userId, type: 'evaluation' }, () =>
 *     detectReviewSpam(ctx)
 *   )
 *
 * @throws BusinessError RATE_LIMITED
 */
export async function withRateLimit<T>(
  input: RateLimitCheckInput,
  fn: () => Promise<T>,
  config?: RateLimitConfig,
  store?: RateLimitStore
): Promise<T> {
  // Sprint 21: 优先全局 store（带降级）
  if (_globalStore) {
    await consumeGlobalRateLimitWithFallback(input, config)
    return await fn()
  }
  // 内存版（向后兼容）
  consumeRateLimit(input, config, store)
  return await fn()
}

// ===== 工具 =====

/**
 * 重置 store（仅测试用）
 */
export function _resetStore(store: RateLimitStore = _store): void {
  store.global.clear()
  store.target.clear()
  store.lastCleanup = 0
}

/**
 * 获取 store 统计（监控 / 调试）
 */
export function getStoreStats(store: RateLimitStore = _store): {
  globalKeys: number
  targetKeys: number
  lastCleanup: number
} {
  return {
    globalKeys: store.global.size,
    targetKeys: store.target.size,
    lastCleanup: store.lastCleanup,
  }
}

// ===== 工具：从 db 实例快速注入 =====

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
export function initGlobalRateLimitFromDb(
  db: any,
  options: { collectionName?: string; command?: any } = {}
): boolean {
  if (!db) {return false}
  try {
    const coll = db.collection(options.collectionName || 'rate_limits')
    const command = options.command || (db.command)
    setGlobalRateLimitStore({ collection: coll, command, collectionName: options.collectionName })
    return true
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[risk-rate-limit] init from db failed:', e && (e as any).message)
    return false
  }
}

// 默认导出（保持 CommonJS 兼容）
export default {
  DEFAULT_RISK_RATE_LIMIT_CONFIG,
  peekRateLimit,
  consumeRateLimit,
  withRateLimit,
  consumeGlobalRateLimitWithFallback,
  peekGlobalRateLimitWithFallback,
  setGlobalRateLimitStore,
  getGlobalRateLimitStore,
  initGlobalRateLimitFromDb,
  _resetStore,
  getStoreStats,
}
