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
 * 代码审查修复（2026-07-25，docs/favoriteService-code-review.md）：
 *   - H1: 防重改用确定性 _id（md5(openid|targetType|targetId)），并发插入天然冲突，消除 TOCTOU 竞态
 *   - H2: 重复键兜底只匹配真正的 duplicate 错误；限流等基础设施错误必须抛出
 *   - H3: main catch 对非业务错误脱敏，不向客户端回传原始 error.message
 *   - M1/L5: targetId 强制 string + trim + 长度校验（1-128）
 *   - M2: list 响应回显清洗后的 safePage/safePageSize
 *   - M3: add/remove 写操作接入内存滑动窗口限流（openid 维度）
 *   - M6: count 与 get 并行执行
 *   - M5: add 前按 targetType 校验目标集合中是否存在，防止空壳收藏
 *   - L1: openid 日志掩码
 *   - L3: add 返回 data.created 区分"新收藏"与"已收藏"
 *   - 兼容: 前端历史参数 hostProfileId → targetType='host' + targetId
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
const { initCloud, handleSuccess, ERROR_CODES } = require('./common/utils')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createLogger } = require('./common/logger')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { verifyAuth } = require('./common/auth-middleware')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { err, isBusinessError } = require('./common/errors')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { consumeRateLimit } = require('./common/risk-rate-limit')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createHash } = require('crypto')

const { db } = initCloud()
const logger = createLogger('favoriteService')

// =====================================================================
// 常量
// =====================================================================

export const COLLECTION = 'favorites'
export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 100

/** targetId 最大长度（防止超长脏数据入库） */
const MAX_TARGET_ID_LENGTH = 128

/** 写操作限流配置：每用户每分钟 30 次，同一目标每分钟 10 次（M3） */
const WRITE_RATE_LIMIT_CONFIG = Object.freeze({
  perUserPerMinute: 30,
  perUserPerTargetPerMinute: 10,
  windowMs: 60 * 1000,
})

const VALID_TARGET_TYPES = ['host', 'deal', 'product', 'activity', 'partner', 'tuan']

/** targetType → 目标集合映射（M5：收藏前校验目标存在，防止空壳收藏） */
const TARGET_COLLECTIONS: Record<string, string> = {
  host: 'hostProfiles',
  deal: 'tuan_deals',
  product: 'products',
  activity: 'activities',
  partner: 'admins',
  tuan: 'tuan_deals',
}

// =====================================================================
// 工具函数
// =====================================================================

/** openid 日志掩码（L1）：仅保留前 6 位 */
function maskOpenid(openid: string): string {
  return typeof openid === 'string' && openid.length > 6
    ? `${openid.slice(0, 6)}***`
    : '***'
}

/**
 * 确定性收藏主键（H1）：同一 (ownerId, targetType, targetId) 恒等映射到同一 _id，
 * 并发重复插入会在数据库层直接冲突，无需依赖 check-then-add。
 */
function buildFavoriteId(openid: string, targetType: string, targetId: string): string {
  return 'fav_' + createHash('md5')
    .update(`${openid}|${targetType}|${targetId}`)
    .digest('hex')
}

/** 是否为数据库重复键/主键冲突错误（H2：只认真正的 duplicate，不吞限流等故障） */
function isDuplicateKeyError(e: unknown): boolean {
  const error = e as { code?: unknown; message?: unknown }
  const code = String(error.code ?? '')
  const message = String(error.message ?? '')
  if (code === 'DUPLICATE_KEY') { return true }
  return /duplicate|already exist|E11000|已存在/i.test(message)
}

/**
 * 校验并归一化收藏目标入参（M1/L5）
 * - 兼容前端历史参数：hostProfileId → targetType='host' + targetId
 * - targetType 必须在枚举内；targetId 必须为非空字符串，trim 后 1-128 字符
 */
function normalizeTarget(event: CloudEvent): { targetType: string; targetId: string } {
  let { targetType, targetId } = event as { targetType?: unknown; targetId?: unknown }

  // 兼容旧客户端：只传 hostProfileId 视为收藏寄养家庭
  if (!targetId && typeof event.hostProfileId === 'string' && event.hostProfileId) {
    targetType = targetType || 'host'
    targetId = event.hostProfileId
  }

  if (!targetType || !targetId) {
    throw err('INVALID_PARAMS', '缺少收藏目标信息')
  }
  if (typeof targetType !== 'string' || !VALID_TARGET_TYPES.includes(targetType)) {
    throw err('INVALID_PARAMS', '收藏目标类型无效')
  }
  if (typeof targetId !== 'string') {
    throw err('INVALID_PARAMS', '收藏目标 ID 无效')
  }
  const normalizedId = targetId.trim()
  if (normalizedId.length < 1 || normalizedId.length > MAX_TARGET_ID_LENGTH) {
    throw err('INVALID_PARAMS', '收藏目标 ID 无效')
  }
  return { targetType: targetType.trim(), targetId: normalizedId }
}

/**
 * 校验收藏目标在对应业务集合中存在（M5，防止空壳收藏）
 * - 按 TARGET_COLLECTIONS 映射点查目标集合；不存在则抛 NOT_FOUND
 * - 收藏为低频操作，多一次点查可接受
 */
async function assertTargetExists(dbInstance: typeof db, targetType: string, targetId: string): Promise<void> {
  const coll = TARGET_COLLECTIONS[targetType]
  if (!coll) { return } // 无映射的类型跳过（防御）
  let exists = false
  try {
    const res = await dbInstance.collection(coll).doc(targetId).get()
    exists = !!(res && res.data && (Array.isArray(res.data) ? res.data.length > 0 : true))
  } catch {
    exists = false
  }
  if (!exists) {
    throw err('NOT_FOUND', '收藏目标不存在')
  }
}

// =====================================================================
// Action 1：添加收藏
// =====================================================================

export async function addFavorite(event: CloudEvent, openid: string, dbInstance: typeof db): Promise<unknown> {
  const { targetType, targetId } = normalizeTarget(event)
  // M5：校验目标存在（防止收藏已删除/不存在的对象产生空壳条目）
  await assertTargetExists(dbInstance, targetType, targetId)
  const favoriteId = buildFavoriteId(openid, targetType, targetId)

  // 快路径：主键点查是否已收藏（用于返回友好提示；最终一致性由 _id 冲突兜底）
  const existing = await dbInstance.collection(COLLECTION)
    .where({ _id: favoriteId })
    .limit(1)
    .get()

  if (existing.data && existing.data.length > 0) {
    return handleSuccess({ created: false }, '已经收藏过了')
  }

  try {
    // H1：确定性 _id —— 并发竞态下第二个插入会主键冲突，数据库层保证不重复
    await dbInstance.collection(COLLECTION).add({
      data: {
        _id: favoriteId,
        ownerId: openid,
        targetType,
        targetId,
        createdAt: dbInstance.serverDate(),
      },
    })
  } catch (e: unknown) {
    // H2：仅重复键冲突（并发竞态）视为"已收藏"；其余错误（含 DB 限流）必须抛出
    if (isDuplicateKeyError(e)) {
      return handleSuccess({ created: false }, '已经收藏过了')
    }
    throw e
  }

  return handleSuccess({ created: true }, '收藏成功')
}

// =====================================================================
// Action 2：取消收藏
// =====================================================================

export async function removeFavorite(event: CloudEvent, openid: string, dbInstance: typeof db): Promise<unknown> {
  const { targetType, targetId } = normalizeTarget(event)

  // ownerId 条件确保只能删除自己的收藏（防越权）
  const res = await dbInstance.collection(COLLECTION)
    .where({ ownerId: openid, targetType, targetId })
    .remove()

  const removed = ((res && res.stats && res.stats.removed) || 0) as number
  return handleSuccess({ removed }, removed > 0 ? '取消收藏成功' : '未找到收藏记录')
}

// =====================================================================
// Action 3：拉取收藏列表
// =====================================================================

export async function getFavorites(event: CloudEvent, openid: string, dbInstance: typeof db): Promise<unknown> {
  const { targetType, page = 1, pageSize = DEFAULT_PAGE_SIZE } = event

  // P2-026: 显式传入 targetType 时校验枚举值（与 addFavorite 一致）
  if (targetType && !VALID_TARGET_TYPES.includes(targetType as string)) {
    throw err('INVALID_PARAMS', '收藏目标类型无效')
  }

  // 校验 page 和 pageSize 为正整数
  const safePage = Math.max(1, Math.floor(Number(page) || 1))
  const safePageSize = Math.min(Math.max(1, Math.floor(Number(pageSize) || DEFAULT_PAGE_SIZE)), MAX_PAGE_SIZE)

  const where: Record<string, unknown> = { ownerId: openid }
  if (targetType) { where.targetType = targetType }

  // M6：count 与 get 并行执行，减少一次串行 RTT
  const [countRes, listRes] = await Promise.all([
    dbInstance.collection(COLLECTION).where(where).count(),
    dbInstance.collection(COLLECTION)
      .where(where)
      .orderBy('createdAt', 'desc')
      .skip((safePage - 1) * safePageSize)
      .limit(safePageSize)
      .get(),
  ])

  // M2：回显清洗后的分页参数，保证元信息与实际数据一致
  return handleSuccess({
    list: listRes.data,
    total: countRes.total,
    page: safePage,
    pageSize: safePageSize,
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

/** 需要写限流的 action（M3） */
const WRITE_ACTIONS = new Set(['add', 'remove'])

export async function main(event: CloudEvent, _context: CloudContext): Promise<unknown> {
  const { action } = event

  try {
    const auth = await verifyAuth(event, { requireLogin: true })
    // L1：openid 掩码后写日志
    logger.info(action, { openid: maskOpenid(auth.openid as string) })

    if (!action || !handlers[action]) {
      throw err('INVALID_PARAMS', `未知的 action: ${action}`)
    }

    // M3：写操作按 openid + 目标维度限流（内存滑动窗口，超限抛 RATE_LIMITED）
    if (WRITE_ACTIONS.has(action)) {
      consumeRateLimit(
        {
          userId: auth.openid as string,
          type: 'favorite_write',
          targetId: typeof event.targetId === 'string' ? event.targetId : undefined,
        },
        WRITE_RATE_LIMIT_CONFIG,
      )
    }

    return await handlers[action](event, auth.openid as string, db)
  } catch (error) {
    logger.error(action, error)
    // H3：仅受信的业务错误透传 message；未知/DB 错误统一脱敏，不向客户端泄露内部细节
    if (isBusinessError(error)) {
      const e = error as { code?: string; message?: string }
      return {
        code: e.code || ERROR_CODES.BUSINESS,
        message: e.message || '操作失败',
        data: null,
        error: e.message || '',
      }
    }
    return {
      code: ERROR_CODES.SERVER,
      message: '服务繁忙，请稍后再试',
      data: null,
      error: '',
    }
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
