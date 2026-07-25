/**
 * i18nOverride/index.ts - i18n 覆盖云函数（TypeScript 源文件 - Sprint 46 迁移）
 *
 * 业务功能：
 *   - fetchActive - 客户端匿名拉取 active 文案覆盖
 *   - 与 utils/i18n.js 的 applyCustomOverrides / loadFromCdn 衔接
 *
 * 迁移目标：
 *   - 强类型化 action handler 签名（fetchActive）
 *   - 抽离 SUPPORTED_LOCALES 联合类型与 COLLECTION 常量
 *   - I18nOverrides 类型化（key → locale → value）
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.i18nOverride.json
 *
 * 数据库索引建议（运维需在 i18n_overrides 集合上创建）：
 *   1. { key: 1, locale: 1 }                  - 唯一索引，保证 upsert 幂等
 *   2. { status: 1, locale: 1, updatedAt: -1 } - 覆盖 fetchActive 与 listI18nOverrides 查询
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

/** 覆盖文档状态：active 对外可见，disabled 仅后台保留 */
export type OverrideStatus = 'active' | 'disabled'

/** i18n 覆盖文档 */
export interface I18nOverrideDoc {
  _id?: string
  key: string
  locale: SupportedLocale
  value: string
  status?: OverrideStatus
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
  /** 已废弃别名，等价于 keyCount；保留是为了向后兼容 */
  count: number
  /** 去重后的 key 数量 */
  keyCount: number
  /** 实际覆盖条目数（每个 key+locale 计 1） */
  entryCount: number
  locale: string
}

// =====================================================================
// 内部模块初始化（带 wx-server-sdk 降级）
// =====================================================================

// 合并 common 模块导入，减少冷启动 require 次数
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createLogger } = require('../common/logger')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { handleSuccess, handleError, ERROR_CODES } = require('../common/utils')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { err, isBusinessError, toResponse } = require('../common/errors')

/**
 * CloudbaseSdk 子集类型（按当前文件实际使用范围声明）
 * 完整类型可参考 @cloudbase/node-sdk，这里仅声明本模块依赖的方法。
 */
interface CloudbaseSdk {
  init: (opts: { env: string }) => void
  DYNAMIC_CURRENT_ENV: string
  database: () => CloudbaseDatabase
}

interface CloudbaseDatabase {
  collection: (name: string) => CloudbaseCollection
  serverDate: () => unknown
}

interface CloudbaseCollection {
  where: (q: Record<string, unknown>) => CloudbaseQuery
  doc: (id: string) => { update: (opts: { data: Record<string, unknown> }) => Promise<unknown> }
  add: (opts: { data: Record<string, unknown> }) => Promise<{ _id: string }>
  get: () => Promise<{ data: I18nOverrideDoc[] }>
  limit: (n: number) => CloudbaseQuery
}

interface CloudbaseQuery {
  limit: (n: number) => CloudbaseQuery
  get: () => Promise<{ data: I18nOverrideDoc[] }>
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
// 辅助函数
// =====================================================================

/** 判断异常是否为"集合未初始化"类错误（可安全降级为空覆盖） */
function isCollectionMissingError(e: unknown): boolean {
  if (!e || typeof e !== 'object') { return false }
  const errObj = e as { errCode?: number; message?: string }
  const msg = (errObj.message || '').toLowerCase()
  // -502001：cloud sdk 集合不存在 / 文档已存在
  // 兼容文案：collection not exist / collection does not exist
  return (
    errObj.errCode === -502001 ||
    errObj.errCode === -501019 ||
    /collection.*(not.*exist|does.*not.*exist)/i.test(msg)
  )
}

// =====================================================================
// Action：fetchActive
// =====================================================================

/**
 * 客户端匿名拉取 active 文案覆盖。
 *
 * 入参：{ action: 'fetchActive', locale?: 'zh-CN' | 'en-US' | 'ja-JP' }
 *   - locale 不传：返回所有 locale
 *   - locale 非法：抛 INVALID_PARAMS（避免客户端 bug 被静默掩盖）
 * 返回：{ code, message, data: { overrides, count, keyCount, entryCount, locale } }
 */
export async function fetchActive(event: CloudEvent = {}): Promise<unknown> {
  if (!cloudbase) {
    throw err('INTERNAL_ERROR', 'cloudbase sdk unavailable')
  }
  const { locale } = event

  // M2：locale 类型守卫，避免非法值静默降级
  if (locale !== undefined) {
    if (typeof locale !== 'string') {
      throw err('INVALID_PARAMS', 'locale 必须为字符串', { type: typeof locale })
    }
    if (!SUPPORTED_LOCALES.includes(locale as SupportedLocale)) {
      throw err('INVALID_PARAMS', '不支持的 locale', {
        locale,
        supported: SUPPORTED_LOCALES as unknown as string[],
      })
    }
  }

  const db = cloudbase.database()

  const filter: Record<string, unknown> = { status: 'active' }
  if (typeof locale === 'string') {
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
    // H2：仅对"集合未初始化"降级返回空覆盖，其他异常向上抛由 main 统一处理
    if (isCollectionMissingError(e)) {
      logger.warn('fetchActive.collection_missing', { message: (e as Error)?.message })
      return handleSuccess(
        {
          overrides: {},
          count: 0,
          keyCount: 0,
          entryCount: 0,
          locale: (typeof locale === 'string' ? locale : 'all'),
        } as FetchActiveResult,
        '获取成功（空覆盖）'
      )
    }
    // 真实错误：记录完整上下文后抛出
    logger.errorWithContext('fetchActive.db_error', e, { filter })
    throw e
  }

  const overrides: I18nOverrides = {}
  let entryCount = 0
  for (const doc of data) {
    if (!doc || !doc.key || !doc.locale) { continue }
    if (!overrides[doc.key]) { overrides[doc.key] = {} }
    overrides[doc.key][doc.locale] = doc.value
    entryCount++
  }

  const keyCount = Object.keys(overrides).length
  return handleSuccess(
    {
      overrides,
      count: keyCount, // L1：保留 count 向后兼容，新增 keyCount / entryCount
      keyCount,
      entryCount,
      locale: (typeof locale === 'string' ? locale : 'all'),
    } as FetchActiveResult,
    '获取成功'
  )
}

// =====================================================================
// Handlers 聚合 + Main 入口
// =====================================================================

const handlers: Record<string, (event: CloudEvent) => Promise<unknown>> = {
  fetchActive,
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
