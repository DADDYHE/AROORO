/**
 * utils.ts - 通用工具（TypeScript 源 - Sprint 15 迁移）
 *
 * 目标：
 *   - 把 utils.js 迁移到 .ts，让 errors.ts 等其他 .ts 文件可消费
 *   - 提供 CloudBase 初始化、ID 生成、错误处理、分页、批处理、Cloud URL 转换
 *
 * 设计原则：
 *   - 单例初始化（initCloud 内部用闭包缓存 cloud / db 实例）
 *   - 类型化导出（避免 utils.d.ts 的手动 shim）
 *   - 与 errors.ts 双向兼容（handleError 返回的 shape 可与 err() 配对）
 */

import { createHash, randomBytes } from 'crypto'
import type { CloudBaseDB } from './types'

// =====================================================================
// 类型定义
// =====================================================================

/** 错误码分类（数字） */
export type ErrorCodeCategory =
  | 'SUCCESS' | 'VALIDATION' | 'DATA' | 'AUTH' | 'NOT_FOUND'
  | 'PERMISSION' | 'BUSINESS' | 'SERVER' | 'UNKNOWN'

/** 错误码映射（类别 → 数字） */
export type ErrorCodeMap = Record<ErrorCodeCategory, number>

/** 错误信息映射（数字 → 中文） */
export type ErrorMessageMap = Record<number, string>

/** handleError 返回值 */
export interface ErrorResult {
  code: number
  message: string
  data: null
  error: string | { type: string; details?: unknown; originalMessage?: string }
}

/** handleSuccess 返回值 */
export interface SuccessResult<T = unknown> {
  code: number
  message: string
  data: T | null
}

/** paginate 选项 */
export interface PaginateOptions {
  page?: number
  pageSize?: number
  where?: Record<string, unknown>
  orderBy?: { field: string, direction: 'asc' | 'desc' }
  projection?: Record<string, boolean> | null
}

/** paginate 返回值 */
export interface PaginatedResult<T = unknown> {
  list: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  hasNext: boolean
}

/** batchProcess handler 返回 */
export type BatchHandlerResult<TIn, TOut> = TOut | { success: false, error: string }

/** ID 类型白名单 */
export type IdType =
  | 'pet' | 'order' | 'feeding' | 'tuan' | 'activity' | 'registration'
  | 'feeder' | 'product' | 'banner' | 'address' | 'application'
  | 'wallet' | 'commission' | 'coupon' | 'category' | 'favorite'

/** CloudBase SDK 实例（来自 wx-server-sdk） */
export interface CloudBaseInstance {
  database: () => CloudBaseDB
  getTempFileURL: (params: { fileList: string[] }) => Promise<{
    fileList: Array<{ fileID: string, tempFileURL?: string, status: number }>
  }>
  init: (opts: { env: string }) => void
  DYNAMIC_CURRENT_ENV: string
}

// =====================================================================
// 单例缓存
// =====================================================================

let cloudInstance: CloudBaseInstance | null = null
let dbInstance: CloudBaseDB | null = null

// =====================================================================
// 1. 初始化
// =====================================================================

/**
 * 懒加载 wx-server-sdk 并返回 { cloud, db }
 * - 第一次调用会 init + database()，后续直接复用
 * - 必须在云函数入口（已注入环境）后才可调用
 */
export function initCloud(): { cloud: CloudBaseInstance, db: CloudBaseDB } {
  if (!cloudInstance) {
    // 动态 require：避免在 jest 单元测试时强制加载 wx-server-sdk
    const cloud = require('wx-server-sdk') as CloudBaseInstance
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
    cloudInstance = cloud
    dbInstance = cloud.database()
  }
  return { cloud: cloudInstance, db: dbInstance! }
}

// =====================================================================
// 2. 错误码字典
// =====================================================================

/** 业务错误码（数字） */
export const ERROR_CODES: ErrorCodeMap = {
  SUCCESS: 0,
  VALIDATION: 1001,
  DATA: 1002,
  AUTH: 1003,
  NOT_FOUND: 1004,
  PERMISSION: 1005,
  BUSINESS: 1006,
  SERVER: 5001,
  UNKNOWN: 9999,
}

/** 错误码 → 中文文案 */
export const ERROR_MESSAGES: ErrorMessageMap = {
  [ERROR_CODES.SUCCESS]: '操作成功',
  [ERROR_CODES.VALIDATION]: '参数错误',
  [ERROR_CODES.DATA]: '数据操作失败',
  [ERROR_CODES.AUTH]: '未登录或登录已过期',
  [ERROR_CODES.NOT_FOUND]: '数据不存在',
  [ERROR_CODES.PERMISSION]: '无权限操作',
  [ERROR_CODES.BUSINESS]: '业务处理失败',
  [ERROR_CODES.SERVER]: '服务器内部错误',
  [ERROR_CODES.UNKNOWN]: '未知错误',
}

// =====================================================================
// 3. ID 生成
// =====================================================================

const TYPE_MAPPING: Record<IdType, string> = {
  pet: 'pet',
  order: 'ord',
  feeding: 'fd',
  tuan: 'tn',
  activity: 'act',
  registration: 'reg',
  feeder: 'fdr',
  product: 'prd',
  banner: 'bnr',
  address: 'addr',
  application: 'app',
  wallet: 'wlt',
  commission: 'cmm',
  coupon: 'cpn',
  category: 'cat',
  favorite: 'fav',
}

/**
 * 生成业务主键 ID
 * 规则：
 *   - type：映射为 2-3 字母前缀
 *   - timestamp：Date.now() 8 位 base36
 *   - identifier：openid 哈希前 8 位（或 4 字节随机）
 *   - random：4 字节随机
 *   - 总长不超过 32，去除非字母数字下划线
 */
export function generateId(type: IdType | string = '', openid: string = ''): string {
  const shortPrefix = (TYPE_MAPPING as Record<string, string>)[type] || type
  const timestamp = Date.now().toString(36).padStart(8, '0').slice(0, 8)

  let identifier = ''
  if (openid) {
    let hash = 0
    for (let i = 0; i < openid.length; i++) {
      const char = openid.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash
    }
    identifier = Math.abs(hash).toString(36).padStart(8, '0').slice(0, 8)
  } else {
    identifier = randomBytes(4).toString('hex').slice(0, 8)
  }

  const random = randomBytes(4).toString('hex').slice(0, 8)

  let id = shortPrefix
    ? `${shortPrefix}_${timestamp}${identifier}${random}`
    : `${timestamp}${identifier}${random}`
  if (id.length > 32) {id = id.substring(0, 32)}
  id = id.replace(/[^a-zA-Z0-9_]/g, '')
  return id
}

// =====================================================================
// 4. 错误/成功响应包装
// =====================================================================

/**
 * 统一错误响应包装
 * 兼容旧业务层 call(old style) 与 new style（BusinessError）
 */
export function handleError(
  error: Error,
  message: string | null = null,
  code: number | null = null
): ErrorResult {
  const errorCode = code ?? ERROR_CODES.BUSINESS
  const errorMessage = message || error.message || ERROR_MESSAGES[errorCode] || '操作失败'

  return {
    code: errorCode,
    message: errorMessage,
    data: null,
    error: error.message || '',
  }
}

/**
 * 统一成功响应
 */
export function handleSuccess<T = unknown>(
  data: T | null = null,
  message: string = '操作成功'
): SuccessResult<T> {
  return {
    code: ERROR_CODES.SUCCESS,
    message,
    data,
  }
}

// =====================================================================
// 5. 分页
// =====================================================================

const MAX_PAGE_SIZE = 100

/**
 * 通用分页查询
 * @param db CloudBaseDB 实例
 * @param collectionName 集合名
 * @param options 分页参数
 * @returns 包含 list/total/page/pageSize/totalPages/hasNext
 */
export async function paginate<T = Record<string, unknown>>(
  db: CloudBaseDB,
  collectionName: string,
  options: PaginateOptions = {}
): Promise<PaginatedResult<T>> {
  const {
    page = 1,
    pageSize = 10,
    where = {},
    orderBy = { field: 'createdAt', direction: 'desc' },
    projection = null,
  } = options

  const safePageSize = Math.min(Math.max(1, Number(pageSize) || 10), MAX_PAGE_SIZE)
  const offset = (page - 1) * safePageSize

  const countQuery = db.collection(collectionName).where(where)
  const countResult = await countQuery.count()
  const total = countResult.total

  let dataQuery: any = db.collection(collectionName).where(where)
  if (projection) {dataQuery = dataQuery.field(projection)}
  dataQuery = dataQuery.orderBy(orderBy.field, orderBy.direction)
  const dataResult = await dataQuery.skip(offset).limit(safePageSize).get()

  return {
    list: (dataResult.data || []) as T[],
    total,
    page,
    pageSize: safePageSize,
    totalPages: Math.ceil(total / safePageSize),
    hasNext: page * safePageSize < total,
  }
}

// =====================================================================
// 6. 批处理
// =====================================================================

/**
 * 简单批处理：分批并发执行 handler，捕获每条错误
 *   - 默认 batchSize = 10
 *   - 失败的项返回 { success: false, error }，成功的项返回 handler 返回值
 */
export async function batchProcess<TIn, TOut>(
  data: TIn[],
  handler: (item: TIn) => Promise<TOut>,
  batchSize: number = 10
): Promise<Array<BatchHandlerResult<TIn, TOut>>> {
  const results: Array<BatchHandlerResult<TIn, TOut>> = []
  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize)
    const batchResults = await Promise.all(
      batch.map(async (item): Promise<BatchHandlerResult<TIn, TOut>> => {
        try {
          return await handler(item)
        } catch (error) {
          return { success: false, error: (error as Error).message }
        }
      })
    )
    results.push(...batchResults)
  }
  return results
}

// =====================================================================
// 7. Cloud URL 转换
// =====================================================================

/**
 * 把对象/数组中所有 cloud://xxx 字段批量转换为 https:// 临时 URL
 * 递归遍历所有嵌套对象与数组
 * @param result 待处理对象
 * @returns 转换后的对象（深拷，新对象）
 */
export async function convertCloudUrls<T = unknown>(result: T): Promise<T> {
  if (!result || typeof result !== 'object') {return result}
  const { cloud } = initCloud()
  const cloudIds: string[] = []

  function collectCloudIds(obj: unknown): void {
    if (!obj || typeof obj !== 'object') {return}
    if (obj instanceof Date) {return}
    if (Array.isArray(obj)) { obj.forEach(collectCloudIds); return }
    for (const key of Object.keys(obj as Record<string, unknown>)) {
      const v = (obj as Record<string, unknown>)[key]
      if (typeof v === 'string' && v.startsWith('cloud://')) {
        cloudIds.push(v)
      } else if (typeof v === 'object' && v !== null) {
        collectCloudIds(v)
      }
    }
  }
  collectCloudIds(result)
  if (cloudIds.length === 0) {return result}

  const urlMap: Record<string, string> = {}
  try {
    const uniqueIds = [...new Set(cloudIds)]
    const BATCH_SIZE = 50
    for (let i = 0; i < uniqueIds.length; i += BATCH_SIZE) {
      const chunk = uniqueIds.slice(i, i + BATCH_SIZE)
      const urlRes = await cloud.getTempFileURL({ fileList: chunk })
      for (const f of (urlRes.fileList || [])) {
        if (f.status === 0 && f.tempFileURL) {urlMap[f.fileID] = f.tempFileURL}
      }
    }
  } catch (e) {
    return result
  }

  function replaceUrls(obj: unknown): unknown {
    if (!obj || typeof obj !== 'object') {return obj}
    if (obj instanceof Date) {return obj}
    if (Array.isArray(obj)) {return obj.map(replaceUrls)}
    const res: Record<string, unknown> = {}
    for (const key of Object.keys(obj as Record<string, unknown>)) {
      const v = (obj as Record<string, unknown>)[key]
      if (typeof v === 'string' && v.startsWith('cloud://') && urlMap[v]) {
        res[key] = urlMap[v]
      } else if (typeof v === 'object' && v !== null) {
        res[key] = replaceUrls(v)
      } else {
        res[key] = v
      }
    }
    return res
  }
  return replaceUrls(result) as T
}

/**
 * 占位实现：把 https 临时 URL 还原为 cloud:// 形式
 * 当前业务场景不需要（云函数只向客户端发送 https URL），保留 stub 以兼容旧调用方
 */
export function revertCloudUrls<T = unknown>(event: T): T {
  return event
}

/**
 * 转义正则表达式特殊字符，防止正则注入攻击
 *
 * 用途：在使用 db.RegExp 时，对用户输入进行转义
 *
 * @param str 需要转义的字符串
 * @returns 转义后的字符串
 *
 * @example
 * const keyword = 'test(user)'
 * const escaped = escapeRegExp(keyword)
 * // escaped = 'test\\(user\\)'
 * db.collection('data').where({
 *   name: db.RegExp({ regexp: escaped, options: 'i' })
 * })
 */
export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// 已用：避免 typescript 报 unused import
export type { CloudBaseDB }
// 注：上面"未使用"的导入仅用于类型导出
