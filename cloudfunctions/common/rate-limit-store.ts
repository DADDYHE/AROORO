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

import { err } from './errors'

// ===== 类型定义 =====

export interface GlobalRateLimitRecord {
  /** 复合主键：scope 前缀:userId|type[|targetId] */
  _id: string
  scope: 'global' | 'target'
  userId: string
  type: string
  targetId?: string
  count: number
  windowStart: number
  windowMs: number
  expireAt: number
  updatedAt: number
}

export interface GlobalRateLimitInput {
  userId: string
  type: string
  targetId?: string
  windowMs: number
  limit: number
  now?: number
}

export interface GlobalRateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
  count: number
  /** 存储 key，便于排查 */
  key: string
  /** 哪一层限流（global/target），便于上层决定 */
  scope: 'global' | 'target'
}

/** db 句柄 + db.command 引用 */
export interface GlobalRateLimitStore {
  /** db.collection(name) 返回的集合句柄 */
  collection: any
  /** db.command，提供 inc / lt 等原子操作 */
  command: any
  /** 集合名（默认 'rate_limits'） */
  collectionName?: string
}

// ===== 工具函数 =====

/**
 * 生成复合 _id
 * 格式：scope前缀:userId|type[|targetId]
 *   g:userId|type           → 全局维度
 *   t:userId|type|targetId  → 目标维度
 */
export function buildKey(input: GlobalRateLimitInput, scope: 'global' | 'target'): string {
  if (scope === 'global') {
    return `g:${input.userId}|${input.type}`
  }
  return `t:${input.userId}|${input.type}|${input.targetId || ''}`
}

function nowMs(input?: GlobalRateLimitInput): number {
  return input?.now ?? Date.now()
}

// ===== 核心：原子消费配额 =====

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
export async function consumeGlobalRateLimit(
  input: GlobalRateLimitInput,
  store: GlobalRateLimitStore
): Promise<GlobalRateLimitResult> {
  if (!store || !store.collection || !store.command) {
    throw err('INTERNAL_ERROR', '全局限流存储未配置')
  }
  const coll = store.collection
  const _ = store.command
  const now = nowMs(input)
  const globalKey = buildKey(input, 'global')

  // 1. 读取 global key
  const globalRec = await _readRecord(coll, globalKey)
  const globalCutoff = globalRec ? globalRec.windowStart + globalRec.windowMs : 0
  const globalInWindow = globalRec && now < globalCutoff
  const globalNextCount = (globalInWindow ? globalRec.count : 0) + 1

  // 2. 提前拦截：global 超限
  if (globalInWindow && globalRec.count >= input.limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: globalCutoff,
      count: globalRec.count,
      key: globalKey,
      scope: 'global',
    }
  }

  // 3. 读取 target key（如有）
  let targetRec: GlobalRateLimitRecord | null = null
  let targetKey: string | null = null
  if (input.targetId) {
    targetKey = buildKey(input, 'target')
    targetRec = await _readRecord(coll, targetKey)
    const targetCutoff = targetRec ? targetRec.windowStart + targetRec.windowMs : 0
    const targetInWindow = !!targetRec && now < targetCutoff
    if (targetInWindow && targetRec && targetRec.count >= input.limit) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: targetCutoff,
        count: targetRec.count,
        key: targetKey!,
        scope: 'target',
      }
    }
  }

  // 4. 写入 global
  let globalAfter: GlobalRateLimitRecord
  try {
    if (globalInWindow) {
      await coll.doc(globalKey).update({
        data: { count: _.inc(1), updatedAt: now },
      })
      const after = await _readRecord(coll, globalKey)
      globalAfter = after || globalRec!
    } else {
      globalAfter = await _writeNewRecord(coll, {
        _id: globalKey,
        scope: 'global',
        userId: input.userId,
        type: input.type,
        targetId: undefined,
        count: 1,
        windowStart: now,
        windowMs: input.windowMs,
        expireAt: now + input.windowMs,
        updatedAt: now,
      })
    }
  } catch (e: any) {
    throw err('INTERNAL_ERROR', `全局限流写入失败：${(e && e.message) || 'unknown'}`)
  }

  // 5. 写入 target（如有）
  if (input.targetId && targetKey) {
    const targetCutoff = targetRec ? targetRec.windowStart + targetRec.windowMs : 0
    const targetInWindow = !!targetRec && now < targetCutoff
    try {
      if (targetInWindow) {
        await coll.doc(targetKey).update({
          data: { count: _.inc(1), updatedAt: now },
        })
      } else {
        await _writeNewRecord(coll, {
          _id: targetKey,
          scope: 'target',
          userId: input.userId,
          type: input.type,
          targetId: input.targetId,
          count: 1,
          windowStart: now,
          windowMs: input.windowMs,
          expireAt: now + input.windowMs,
          updatedAt: now,
        })
      }
    } catch (e: any) {
      // target 写入失败不回滚 global（已记录即扣减），但要告知调用方
      throw err('INTERNAL_ERROR', `目标限流写入失败：${(e && e.message) || 'unknown'}`)
    }
  }

  // 6. 决策：哪个 key 剩余最少？
  const finalCount = globalAfter.count
  const finalResetAt = globalAfter.windowStart + globalAfter.windowMs
  return {
    allowed: finalCount <= input.limit,
    remaining: Math.max(0, input.limit - finalCount),
    resetAt: finalResetAt,
    count: finalCount,
    key: globalKey,
    scope: 'global',
  }
}

// ===== 工具：peek（不消费）=====

/**
 * 只查询当前 count，不写入
 */
export async function peekGlobalRateLimit(
  input: GlobalRateLimitInput,
  store: GlobalRateLimitStore
): Promise<GlobalRateLimitResult | null> {
  if (!store || !store.collection) {return null}
  const coll = store.collection
  const key = buildKey(input, 'global')
  const rec = await _readRecord(coll, key)
  if (!rec) {return null}
  const now = nowMs(input)
  const cutoff = rec.windowStart + rec.windowMs
  if (now >= cutoff) {return null}  // 窗口已过
  return {
    allowed: rec.count < input.limit,
    remaining: Math.max(0, input.limit - rec.count),
    resetAt: cutoff,
    count: rec.count,
    key,
    scope: 'global',
  }
}

// ===== 内部 helper =====

async function _readRecord(coll: any, key: string): Promise<GlobalRateLimitRecord | null> {
  try {
    const res = await coll.doc(key).get()
    if (!res || !res.data) {return null}
    const data = Array.isArray(res.data) ? res.data[0] : res.data
    return (data && data._id) ? (data as GlobalRateLimitRecord) : null
  } catch (e) {
    return null
  }
}

async function _writeNewRecord(coll: any, record: GlobalRateLimitRecord): Promise<GlobalRateLimitRecord> {
  try {
    await coll.add({ data: record })
  } catch (addErr) {
    // 并发场景：记录已存在 → 强制 set
    await coll.doc(record._id).set({ data: record })
  }
  return record
}

// ===== 工具：清理过期记录 =====

/**
 * 清理 expireAt < now 的记录
 * - 由定时任务调用（建议每 5-10 分钟一次）
 * - 也可由 CI 审计脚本调用
 *
 * @returns 删除的记录数
 */
export async function cleanupExpiredRateLimits(
  store: GlobalRateLimitStore,
  batchSize = 100
): Promise<number> {
  if (!store || !store.collection || !store.command) {return 0}
  const coll = store.collection
  const _ = store.command
  const now = Date.now()
  let total = 0
  try {
    const expired = await coll.where({ expireAt: _.lt(now) })
      .limit(batchSize)
      .get()
    const list = (expired && expired.data) || []
    for (const r of list) {
      try {
        await coll.doc(r._id).remove()
        total++
      } catch (e) {
        // ignore single delete failure
      }
    }
  } catch (e) {
    // ignore
  }
  return total
}

// ===== 工具：统计 =====

export interface GlobalRateLimitStats {
  totalRecords: number
  globalKeys: number
  targetKeys: number
  oldestExpireAt: number | null
}

export async function getGlobalRateLimitStats(
  store: GlobalRateLimitStore
): Promise<GlobalRateLimitStats> {
  if (!store || !store.collection) {
    return { totalRecords: 0, globalKeys: 0, targetKeys: 0, oldestExpireAt: null }
  }
  const coll = store.collection
  try {
    const res = await coll.limit(1000).get()
    const list = (res && res.data) || []
    let globalKeys = 0
    let targetKeys = 0
    let oldestExpireAt: number | null = null
    for (const r of list) {
      if (r.scope === 'global') {globalKeys++} else if (r.scope === 'target') {targetKeys++}
      if (oldestExpireAt === null || r.expireAt < oldestExpireAt) {oldestExpireAt = r.expireAt}
    }
    return {
      totalRecords: list.length,
      globalKeys,
      targetKeys,
      oldestExpireAt,
    }
  } catch (e) {
    return { totalRecords: 0, globalKeys: 0, targetKeys: 0, oldestExpireAt: null }
  }
}

// ===== 默认导出 =====

export default {
  consumeGlobalRateLimit,
  peekGlobalRateLimit,
  cleanupExpiredRateLimits,
  getGlobalRateLimitStats,
  buildKey,
}
