/**
 * tuanExpiryCheck/index.ts - 团购过期检查（TypeScript 源文件 - Sprint 46 迁移）
 *
 * 业务功能（cron 触发）：
 *   - 扫描 tuan_deals 集合中 status in [published, active] 且 endTime<now 的记录
 *   - 标记 status='ended'
 *
 * 迁移目标：
 *   - 强类型化 main 函数签名与 TuanDealDoc 接口
 *   - 与 orderTimeoutService / couponExpiryCheck 模式一致
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.tuanExpiryCheck.json
 */

// =====================================================================
// 公共类型
// =====================================================================

export interface CloudEvent {
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

/** 团购状态 */
export type TuanStatus = 'draft' | 'published' | 'active' | 'ended' | 'cancelled'

/** 团购文档（投影用） */
export interface TuanDealDoc {
  _id: string
  status?: TuanStatus
  endTime?: string | Date
  [k: string]: unknown
}

/** 处理结果 */
export interface ExpiryCheckResult {
  updatedCount: number
}

// =====================================================================
// 内部模块初始化
// =====================================================================

// eslint-disable-next-line @typescript-eslint/no-var-requires
const cloud = require('wx-server-sdk') as {
  init: (opts: { env: string }) => void
  DYNAMIC_CURRENT_ENV: string
  database: () => {
    collection: (name: string) => {
      where: (q: Record<string, unknown>) => {
        update: (params: { data: Record<string, unknown> }) => Promise<{ stats: { updated: number } }>
      }
    }
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

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createLogger } = require('../common/logger')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { handleSuccess, handleError } = require('../common/utils')

const logger = createLogger('tuanExpiryCheck')

// =====================================================================
// 常量
// =====================================================================

export const COLLECTION = 'tuan_deals'
export const TARGET_STATUSES: readonly TuanStatus[] = ['published', 'active'] as const
export const NEW_STATUS: TuanStatus = 'ended'

// =====================================================================
// Main 入口
// =====================================================================

/**
 * 团购过期检查主入口（cron 触发）。
 *
 * 流程：
 *   1. 扫描 tuan_deals 中 status in [published, active] 且 endTime<now 的记录
 *   2. 批量更新为 status='ended'
 *   3. 返回 updatedCount
 */
export async function main(event: CloudEvent, _context: CloudContext): Promise<unknown> {
  logger.info('start', { trigger: event.TriggerName || 'manual' })

  const now = new Date()

  try {
    const res = await db.collection(COLLECTION)
      .where({
        status: _.in([...TARGET_STATUSES]),
        endTime: _.lt(now),
      })
      .update({
        data: {
          status: NEW_STATUS,
          updatedAt: db.serverDate(),
        },
      })

    logger.info('done', { updated: res.stats.updated })
    return handleSuccess(
      { updatedCount: res.stats.updated } as ExpiryCheckResult,
      '团购过期检查完成'
    )
  } catch (error) {
    logger.error('main', error)
    return handleError(error, '团购过期检查失败')
  }
}

// =====================================================================
// Runtime shim（CommonJS 兼容）
// =====================================================================

const _mod = module as { exports: Record<string, unknown> }
_mod.exports = {
  main,
  COLLECTION,
  TARGET_STATUSES,
  NEW_STATUS,
}
_mod.exports.default = _mod.exports

export default {
  main,
  COLLECTION,
  TARGET_STATUSES,
  NEW_STATUS,
}
