/**
 * favoriteService/index.ts - 收藏服务（TypeScript 源文件 - Sprint 46 迁移）
 *
 * 业务功能：
 *   - add - 添加收藏（防重）
 *   - remove - 取消收藏
 *   - list - 拉取收藏列表（分页）
 *
 * 迁移目标：
 *   - 强类型化 3 个 action handler 签名
 *   - 复用 AuthLike / CloudEvent / CloudContext 公共类型
 *   - 抽离 FavoriteTargetType 联合类型与 COLLECTION 常量
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.favoriteService.json
 */

// =====================================================================
// 公共类型
// =====================================================================

export interface AuthLike {
  openid?: string
  nickName?: string
  adminId?: string
  partnerId?: string
  isPartner?: boolean
  isSuperAdmin?: boolean
  roles?: string[]
  permissions?: string[]
  _isHttpAuth?: boolean
  [k: string]: unknown
}

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

/** 收藏目标类型 */
export type FavoriteTargetType = 'host' | 'deal' | 'product' | 'activity' | 'partner' | 'tuan'

/** 收藏文档 */
export interface FavoriteDoc {
  _id?: string
  ownerId: string
  targetType: FavoriteTargetType
  targetId: string
  createdAt?: Date
  [k: string]: unknown
}

/** 分页结果 */
export interface FavoriteListResult {
  list: FavoriteDoc[]
  total: number
  page: number
  pageSize: number
}

// =====================================================================
// 内部模块初始化
// =====================================================================

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { initCloud, handleSuccess, handleError, ERROR_CODES } = require('./common/utils')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createLogger } = require('./common/logger')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { verifyAuth } = require('./common/auth-middleware')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { err } = require('./common/errors')

const { db } = initCloud()
const logger = createLogger('favoriteService')

// =====================================================================
// 常量
// =====================================================================

export const COLLECTION = 'favorites'
export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 100

// =====================================================================
// Action 1：添加收藏
// =====================================================================

const VALID_TARGET_TYPES = ['host', 'deal', 'product', 'activity', 'partner', 'tuan']

export async function addFavorite(event: CloudEvent, openid: string, dbInstance: typeof db): Promise<unknown> {
  const { targetType, targetId } = event
  if (!targetType || !targetId) {
    throw err('INVALID_PARAMS', '缺少收藏目标信息')
  }
  
  // 校验 targetType 是否在允许的枚举值中
  if (!VALID_TARGET_TYPES.includes(targetType as string)) {
    throw err('INVALID_PARAMS', '收藏目标类型无效')
  }

  // 检查是否已收藏（用于返回友好提示）
  const existing = await dbInstance.collection(COLLECTION)
    .where({ ownerId: openid, targetType, targetId })
    .limit(1)
    .get()

  if (existing.data && existing.data.length > 0) {
    return handleSuccess(null, '已经收藏过了')
  }

  try {
    // 尝试添加收藏（原子操作，防止并发竞态导致重复）
    await dbInstance.collection(COLLECTION).add({
      data: {
        ownerId: openid,
        targetType,
        targetId,
        createdAt: dbInstance.serverDate(),
      },
    })
  } catch (e: unknown) {
    // 如果是重复键错误（并发竞态），返回成功而非错误
    const error = e as { code?: string; message?: string }
    if (error.code === 'DATABASE_REQUEST_LIMIT_EXCEEDED' || 
        (error.message && error.message.includes('duplicate'))) {
      return handleSuccess(null, '已经收藏过了')
    }
    throw e
  }

  return handleSuccess(null, '收藏成功')
}

// =====================================================================
// Action 2：取消收藏
// =====================================================================

export async function removeFavorite(event: CloudEvent, openid: string, dbInstance: typeof db): Promise<unknown> {
  const { targetType, targetId } = event
  if (!targetType || !targetId) {
    throw err('INVALID_PARAMS', '缺少收藏目标信息')
  }

  await dbInstance.collection(COLLECTION)
    .where({ ownerId: openid, targetType, targetId })
    .remove()

  return handleSuccess(null, '取消收藏成功')
}

// =====================================================================
// Action 3：拉取收藏列表
// =====================================================================

export async function getFavorites(event: CloudEvent, openid: string, dbInstance: typeof db): Promise<unknown> {
  const { targetType, page = 1, pageSize = DEFAULT_PAGE_SIZE } = event
  
  // 校验 page 和 pageSize 为正整数
  const safePage = Math.max(1, Math.floor(Number(page) || 1))
  const safePageSize = Math.min(Math.max(1, Math.floor(Number(pageSize) || DEFAULT_PAGE_SIZE)), MAX_PAGE_SIZE)
  
  const where: Record<string, unknown> = { ownerId: openid }
  if (targetType) { where.targetType = targetType }

  const countRes = await dbInstance.collection(COLLECTION).where(where).count()
  const listRes = await dbInstance.collection(COLLECTION)
    .where(where)
    .orderBy('createdAt', 'desc')
    .skip((safePage - 1) * safePageSize)
    .limit(safePageSize)
    .get()

  return handleSuccess({
    list: listRes.data,
    total: countRes.total,
    page: page as number,
    pageSize: pageSize as number,
  })
}

// =====================================================================
// Handlers 聚合 + Main 入口
// =====================================================================

const handlers: Record<string, (event: CloudEvent, openid: string, dbInstance: typeof db) => Promise<unknown>> = {
  add: addFavorite,
  remove: removeFavorite,
  list: getFavorites,
}

export async function main(event: CloudEvent, _context: CloudContext): Promise<unknown> {
  const { action } = event

  try {
    const auth = await verifyAuth(event, { requireLogin: true })
    logger.info(action, { openid: auth.openid })

    if (!action || !handlers[action]) {
      throw err('INVALID_PARAMS', `未知的 action: ${action}`)
    }

    return await handlers[action](event, auth.openid as string, db)
  } catch (error) {
    logger.error(action, error)
    const code = (error as { code?: string }).code || ERROR_CODES.BUSINESS
    return handleError(error, (error as Error).message, code)
  }
}

// =====================================================================
// Runtime shim（CommonJS 兼容）
// =====================================================================

const _mod = module as { exports: Record<string, unknown> }
_mod.exports = {
  main,
  addFavorite,
  removeFavorite,
  getFavorites,
  COLLECTION,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
}
_mod.exports.default = _mod.exports

export default {
  main,
  addFavorite,
  removeFavorite,
  getFavorites,
  COLLECTION,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
}
