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

// =====================================================================
// 公共类型
// =====================================================================

export interface CloudEvent {
  action?: string
  data?: Record<string, unknown>
  body?: string | Record<string, unknown>
  Time?: string
  Timestamp?: number
  TriggerName?: string
  Message?: string
  [k: string]: unknown
}

export interface CloudContext {
  [k: string]: unknown
}

// =====================================================================
// 业务类型
// =====================================================================

/** 限流清理结果 */
export interface CleanupResult {
  cleaned: number
}

/** 限流统计 */
export interface RateLimitStats {
  [k: string]: unknown
}

// =====================================================================
// 内部模块初始化
// =====================================================================

// eslint-disable-next-line @typescript-eslint/no-var-requires
const cloudbase = require('wx-server-sdk') as {
  init: (opts: { env: string }) => void
  DYNAMIC_CURRENT_ENV: string
  database: () => {
    collection: (name: string) => unknown
    command: {
      lt: (d: Date) => unknown
      lte: (d: Date) => unknown
      gt: (d: Date) => unknown
      gte: (d: Date) => unknown
      in: (arr: unknown[]) => unknown
      inc: (n: number) => unknown
    }
    serverDate: () => Date
  }
}

cloudbase.init({ env: cloudbase.DYNAMIC_CURRENT_ENV })
const db = cloudbase.database()
const _ = db.command

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { handleSuccess, handleError } = require('../common/utils')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { err } = require('../common/errors')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { initGlobalRateLimitFromDb } = require('../common/risk-rate-limit')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { bootstrapRateLimit } = require('../common/rate-limit-bootstrap')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { cleanupExpiredRateLimits, getGlobalRateLimitStats } = require('../common/rate-limit-store')

// 注入全局限流 store（Sprint 50：统一 bootstrap）
bootstrapRateLimit(db, {})

// =====================================================================
// 常量
// =====================================================================

export const COLLECTION = 'rate_limits'
export const CLEANUP_BATCH_SIZE = 200
export const ACTION_CLEANUP = 'cleanup'
export const ACTION_STATS = 'stats'

// =====================================================================
// Action 1：cleanup
// =====================================================================

export async function cleanupAction(): Promise<CleanupResult> {
  let total = 0
  let batch = 0
  do {
    batch = await cleanupExpiredRateLimits(
      { collection: db.collection(COLLECTION), command: _ } as never,
      CLEANUP_BATCH_SIZE
    )
    total += batch
  } while (batch > 0)
  return { cleaned: total }
}

// =====================================================================
// Action 2：stats
// =====================================================================

export async function statsAction(): Promise<RateLimitStats> {
  return await getGlobalRateLimitStats({
    collection: db.collection(COLLECTION),
    command: _,
  } as never) as RateLimitStats
}

// =====================================================================
// Handlers 聚合 + Main 入口
// =====================================================================

const handlers: Record<string, () => Promise<unknown>> = {
  cleanup: cleanupAction,
  stats: statsAction,
}

export async function main(event: CloudEvent): Promise<unknown> {
  try {
    const action = (event && event.action) || ACTION_CLEANUP

    if (action === ACTION_CLEANUP) {
      const result = await cleanupAction()
      return handleSuccess(result, 'cleanup done')
    }

    if (action === ACTION_STATS) {
      const stats = await statsAction()
      return handleSuccess(stats, 'ok')
    }

    throw err('UNKNOWN_ACTION', `unknown action: ${action}`)
  } catch (e) {
    if (e && (e as { code?: unknown }).code) { return e as unknown }
    return handleError(e, (e as Error)?.message || 'unknown error')
  }
}

// =====================================================================
// Runtime shim（CommonJS 兼容）
// =====================================================================

const _mod = module as { exports: Record<string, unknown> }
_mod.exports = {
  main,
  cleanupAction,
  statsAction,
  COLLECTION,
  CLEANUP_BATCH_SIZE,
  ACTION_CLEANUP,
  ACTION_STATS,
}
_mod.exports.default = _mod.exports

export default {
  main,
  cleanupAction,
  statsAction,
  COLLECTION,
  CLEANUP_BATCH_SIZE,
  ACTION_CLEANUP,
  ACTION_STATS,
}
