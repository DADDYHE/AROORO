/**
 * 幂等键与去重工具（TypeScript 源文件 - Sprint 13 迁移）
 *
 * 解决：
 *   - 支付回调、订单创建、提现等关键链路缺乏幂等保护
 *   - 微信支付回调重试可能导致重复入账
 *
 * 用法：
 *   const { buildIdempotencyKey, isIdempotentHit } = require('./common/idempotency')
 *
 *   // 1. 客户端调用前生成 key
 *   const key = buildIdempotencyKey({
 *     userId: 'u1',
 *     action: 'createOrder',
 *     payload: { petId: 'p1', duration: 3 },
 *   })
 *   // → 'u1:createOrder:<sha256 of payload>'
 *
 *   // 2. 服务端去重
 *   if (await isIdempotentHit(db, 'idempotency_keys', key)) {
 *     return err('IDEMPOTENT_REPLAY')
 *   }
 *   await db.collection('idempotency_keys').add({ _id: key, createdAt: new Date() })
 *
 *   // 3. 微信支付回调验签后做幂等
 *   const notifKey = `wxpay:notify:${outTradeNo}:${transactionId}`
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.common.json
 */

import { sha256 } from './crypto'
import { err } from './errors'
import type { CloudBaseDB, CloudBaseQuery } from './types'

/**
 * 构造幂等键的输入参数
 */
export interface IdempotencyKeyInput {
  userId?: string
  action: string
  payload?: Record<string, unknown> | string
  scope?: string
}

/**
 * 微信支付回调输入
 */
export interface PaymentNotifyInput {
  outTradeNo?: string
  transactionId?: string
  event?: 'pay' | 'refund' | string
}

/**
 * 注册幂等键的结果
 */
export interface RegisterIdempotencyResult {
  ok: boolean
  duplicate: boolean
  replayed?: boolean
}

/**
 * 频次限制结果
 */
export interface RateLimitResult {
  allowed: boolean
  count: number
  resetAt: Date
}

/**
 * 构造幂等键
 *
 * 命名规范：`<scope>:<action>:<hash>` 或 `<scope>:<action>:<fingerprint>`
 */
export function buildIdempotencyKey({ userId, action, payload, scope }: IdempotencyKeyInput): string {
  if (!action || typeof action !== 'string') {
    throw err('INVALID_PARAMS', 'idempotency: action 必填且为字符串')
  }
  const useScope = scope || userId || 'anonymous'
  const payloadHash = typeof payload === 'string'
    ? payload.slice(0, 32)
    : sha256(payload || {}).slice(0, 32)
  return `${useScope}:${action}:${payloadHash}`
}

/**
 * 微信支付回调幂等键（专用）
 */
export function buildPaymentIdempotencyKey(notify: PaymentNotifyInput): string {
  const { outTradeNo, transactionId, event = 'pay' } = notify
  if (!outTradeNo && !transactionId) {
    throw new Error('idempotency: outTradeNo / transactionId 至少需一个')
  }
  return `wxpay:${event}:${outTradeNo || 'na'}:${transactionId || 'na'}`
}

/**
 * 从记录中检测幂等命中
 */
export async function isIdempotentHit(
  db: CloudBaseDB,
  collection: string,
  key: string
): Promise<boolean> {
  if (!db || !collection || !key) {return false}
  try {
    // 兼容真实 wx-server-sdk 与 mock：使用链式接口
    const chain = (db.collection(collection) as any)
      .where({ _id: key })
      .limit(1)
    const res: { data: unknown[] } = await chain.get()
    return Array.isArray(res.data) && res.data.length > 0
  } catch (e) {
    const errObj = e as { errCode?: string; code?: string }
    if (errObj && (errObj.errCode === 'DATABASE_COLLECTION_NOT_EXIST' || errObj.code === 'DATABASE_COLLECTION_NOT_EXIST')) {
      return false
    }
    throw e
  }
}

/**
 * 注册幂等键（带过期时间）
 *
 * 建议 TTL：支付/订单 24h，活动报名 1h，登录 5min
 */
export async function registerIdempotencyKey(
  db: CloudBaseDB,
  collection: string,
  key: string,
  meta: Record<string, unknown> = {},
  ttlMs: number = 24 * 60 * 60 * 1000
): Promise<RegisterIdempotencyResult> {
  const now = Date.now()
  const doc: Record<string, unknown> = {
    _id: key,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlMs).toISOString(),
    meta,
  }
  try {
    await (db.collection(collection) as any).add(doc)
    return { ok: true, duplicate: false }
  } catch (e) {
    const errObj = e as { errCode?: string; code?: string }
    if (errObj && (errObj.errCode === 'DUPLICATE_KEY' || errObj.code === 'DUPLICATE_KEY')) {
      return { ok: false, duplicate: true, replayed: true }
    }
    throw e
  }
}

/**
 * 封装"幂等命中 → 抛 IDEMPOTENT_REPLAY"的标准用法
 */
export async function assertIdempotent(
  db: CloudBaseDB,
  collection: string,
  key: string
): Promise<void> {
  const hit = await isIdempotentHit(db, collection, key)
  if (hit) {
    throw err('IDEMPOTENT_REPLAY', '重复请求已合并', { key })
  }
}

/**
 * 时间窗口内同 action 的频次限制
 */
export async function checkRateLimit(
  db: CloudBaseDB,
  collection: string,
  actionKey: string,
  maxCount: number,
  windowMs: number
): Promise<RateLimitResult> {
  if (!Number.isInteger(maxCount) || maxCount <= 0) {
    throw new Error('rate-limit: maxCount 必须为正整数')
  }
  if (!Number.isInteger(windowMs) || windowMs <= 0) {
    throw new Error('rate-limit: windowMs 必须为正整数')
  }
  const windowStart = new Date(Date.now() - windowMs).toISOString()
  const query: CloudBaseQuery = (db.collection(collection) as any)
    .where({ action: actionKey, createdAt: (db.command as any).gte(windowStart) })
  const res: { total: number } = await query.count()
  const count = res.total || 0
  return {
    allowed: count < maxCount,
    count,
    resetAt: new Date(Date.now() + windowMs),
  }
}

/**
 * 封装"频次超限 → 抛 RATE_LIMITED"的标准用法（与 assertIdempotent 对称）
 */
export async function assertRateLimit(
  db: CloudBaseDB,
  collection: string,
  actionKey: string,
  maxCount: number,
  windowMs: number
): Promise<void> {
  const result = await checkRateLimit(db, collection, actionKey, maxCount, windowMs)
  if (!result.allowed) {
    throw err('RATE_LIMITED', '操作过于频繁，请稍后再试', { action: actionKey, ...result })
  }
}
