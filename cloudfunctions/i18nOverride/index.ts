/**
 * i18nOverride/index.ts - i18n 覆盖云函数（TypeScript 源文件 - Sprint 46 迁移）
 *
 * 业务功能：
 *   - fetchActive - 客户端匿名拉取 active 文案覆盖
 *   - 与 utils/i18n.js 的 applyCustomOverrides / loadFromCdn 衔接
 *
 * 迁移目标：
 *   - 强类型化 2 个 action handler 签名（fetchActive + fetchActiveOverrides）
 *   - 抽离 SUPPORTED_LOCALES 联合类型与 COLLECTION 常量
 *   - I18nOverrides 类型化（key → locale → value）
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.i18nOverride.json
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

/** 支持的语言 */
export type SupportedLocale = 'zh-CN' | 'en-US' | 'ja-JP'

/** i18n 覆盖文档 */
export interface I18nOverrideDoc {
  _id?: string
  key: string
  locale: SupportedLocale
  value: string
  status?: 'active' | 'inactive' | 'deleted'
  [k: string]: unknown
}

/** 覆盖结构（按 key + locale 索引） */
export interface I18nOverrides {
  [key: string]: {
    [locale: string]: string
  }
}

/** fetchActive 返回 */
export interface FetchActiveResult {
  overrides: I18nOverrides
  count: number
  locale: string
}

// =====================================================================
// 内部模块初始化（带 wx-server-sdk 降级）
// =====================================================================

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createLogger } = require('../common/logger')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { handleSuccess, handleError, ERROR_CODES } = require('../common/utils')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { err, isBusinessError, toResponse } = require('../common/errors')

interface CloudbaseSdk {
  init: (opts: { env: string }) => void
  DYNAMIC_CURRENT_ENV: string
  database: () => {
    collection: (name: string) => {
      where: (q: Record<string, unknown>) => {
        limit: (n: number) => {
          get: () => Promise<{ data: I18nOverrideDoc[] }>
        }
      }
    }
  }
}

let cloudbase: CloudbaseSdk | null = null
try {
  cloudbase = require('wx-server-sdk') as CloudbaseSdk
  cloudbase.init({ env: cloudbase.DYNAMIC_CURRENT_ENV })
} catch (e) {
  // 单元测试环境没有 wx-server-sdk，给出降级
  cloudbase = null
}

const logger = createLogger('i18nOverride')

// =====================================================================
// 常量
// =====================================================================

export const COLLECTION = 'i18n_overrides'
export const SUPPORTED_LOCALES: readonly SupportedLocale[] = ['zh-CN', 'en-US', 'ja-JP'] as const
export const FETCH_LIMIT = 200

// =====================================================================
// Action：fetchActive
// =====================================================================

/**
 * 客户端匿名拉取 active 文案覆盖。
 *
 * 入参：{ action: 'fetchActive', locale?: 'en-US' }
 * 返回：{ code, message, data: { overrides, count, locale } }
 */
export async function fetchActive(event: CloudEvent = {}): Promise<unknown> {
  if (!cloudbase) {
    throw err('INTERNAL_ERROR', 'cloudbase sdk unavailable')
  }
  const { locale } = event
  const db = cloudbase.database()

  const filter: Record<string, unknown> = { status: 'active' }
  if (locale && SUPPORTED_LOCALES.includes(locale as SupportedLocale)) {
    filter.locale = locale
  }

  let data: I18nOverrideDoc[] = []
  try {
    const res = await db.collection(COLLECTION)
      .where(filter)
      .limit(FETCH_LIMIT)
      .get()
    data = res.data || []
  } catch (e) {
    // 集合不存在：返回空覆盖（兼容未初始化场景）
    logger.warn('fetchActive.collection_missing_or_error', (e as Error)?.message)
    return handleSuccess(
      { overrides: {}, count: 0, locale: (locale as string) || 'all' } as FetchActiveResult,
      '获取成功（空覆盖）'
    )
  }

  const overrides: I18nOverrides = {}
  for (const doc of data) {
    if (!doc || !doc.key || !doc.locale) { continue }
    if (!overrides[doc.key]) { overrides[doc.key] = {} }
    overrides[doc.key][doc.locale] = doc.value
  }

  return handleSuccess(
    {
      overrides,
      count: Object.keys(overrides).length,
      locale: (locale as string) || 'all',
    } as FetchActiveResult,
    '获取成功'
  )
}

// =====================================================================
// Handlers 聚合 + Main 入口
// =====================================================================

const handlers: Record<string, (event: CloudEvent) => Promise<unknown>> = {
  fetchActive,
  // 兼容别名（与 adminService 命名对齐）
  fetchActiveOverrides: fetchActive,
}

export async function main(event: CloudEvent): Promise<unknown> {
  try {
    const { action } = event || {}
    if (!action || !handlers[action]) {
      throw err('UNKNOWN_ACTION', `未知 action: ${action || '<empty>'}`)
    }
    const result = await handlers[action](event)
    if (result && typeof result === 'object' && 'code' in result) { return result }
    return handleSuccess(result, '操作成功')
  } catch (e) {
    logger.error('main', e)
    // 使用 isBusinessError 正确处理 BusinessError 实例
    if (isBusinessError(e)) {
      return toResponse(e)
    }
    return handleError(
      e,
      (e as Error)?.message ? (e as Error).message : 'unknown error',
      ERROR_CODES.SERVER
    )
  }
}

// =====================================================================
// Runtime shim（CommonJS 兼容）
// =====================================================================

const _mod = module as { exports: Record<string, unknown> }
_mod.exports = {
  main,
  fetchActive,
  COLLECTION,
  SUPPORTED_LOCALES,
  FETCH_LIMIT,
}
_mod.exports.default = _mod.exports

export default {
  main,
  fetchActive,
  COLLECTION,
  SUPPORTED_LOCALES,
  FETCH_LIMIT,
}
