/**
 * 字段归一化适配层（TypeScript 源文件 - Sprint 17 迁移）
 *
 * 目标：解决字段同义/别名问题（详见 docs/FIELD_DEDUPLICATION_REPORT.md）
 *   - `id` / `_id`
 *   - `createAt` / `createdAt`
 *   - `days` / `nights` / `duration`
 *   - `petIds` / `pets` / `petsInfo` / `petInfos`
 *   - `nickname` / `nickName`
 *   - `totalPrice` / `totalAmount` / `amount`
 *
 * 使用方式：
 *   1. 读路径：DB 取出数据 → normalizeXxx(doc) → 返回给前端
 *   2. 写路径：前端入参 → denormalizeXxx(input) → DB 写入
 *
 * 生命周期：v1.x 兼容期，v2.0 移除。
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.common.json
 */

import { err } from './errors'

// ===== 类型定义 =====

export type EntityName =
  | 'order'
  | 'user'
  | 'host'
  | 'pet'
  | 'product'
  | 'coupon'
  | 'userCoupon'
  | 'activity'
  | 'tuan'

export interface BaseDoc {
  _id?: string
  id?: string
  createAt?: Date | string
  createdAt?: Date | string
  updateAt?: Date | string
  updatedAt?: Date | string
  [key: string]: unknown
}

export interface OrderDoc extends BaseDoc {
  duration?: number
  days?: number
  nights?: number
  petIds?: string[]
  petIDs?: string[]
  petInfos?: unknown[]
  petsInfo?: unknown[]
  pets?: unknown[]
  hostId?: string | null
  hostInfo?: { _id?: string; id?: string } | null
  amount?: number
  totalAmount?: number
  totalPrice?: number
  money?: number
}

export interface UserDoc extends BaseDoc {
  nickName?: string
  nickname?: string
  avatarUrl?: string
  avatar?: string
  headImg?: string
}

export interface HostDoc extends BaseDoc {
  pricePerDay?: number
  price?: number
  dayPrice?: number
}

export interface PetDoc extends BaseDoc {
  gender?: string
  sex?: string
}

export interface ProductDoc extends BaseDoc {
  coverUrl?: string
  coverImage?: string
  cover?: string
}

export type Normalizer<T = BaseDoc> = (doc: T | null | undefined) => T | null | undefined
export type ListNormalizer<T = BaseDoc> = (list: T[] | null | undefined) => T[]

// ===== 集合 → 实体映射 =====

export const COLLECTION_TO_ENTITY: Readonly<Record<string, EntityName>> = Object.freeze({
  orders: 'order',
  users: 'user',
  hosts: 'host',
  hostProfiles: 'host',
  pets: 'pet',
  products: 'product',
  coupons: 'coupon',
  userCoupons: 'userCoupon',
  activities: 'activity',
  tuanActivities: 'tuan',
  tuanCommissions: 'tuan',
})

// ===== 通用归一化 =====

/**
 * 通用归一化函数：扁平化 `_id` 改 `id`、兼容 `createdAt` / `createAt`
 */
export function normalizeBase<T extends BaseDoc>(doc: T | null | undefined): T | null | undefined {
  if (!doc || typeof doc !== 'object') {
    return doc
  }
  const out = { ...doc } as T
  if (out._id && !out.id) {
    out.id = out._id
  }
  if (out.createAt && !out.createdAt) {
    out.createdAt = out.createAt
  }
  if (out.updateAt && !out.updatedAt) {
    out.updatedAt = out.updateAt
  }
  return out
}

// ===== 订单归一化 =====

/**
 * 订单归一化
 */
export function normalizeOrder<T extends OrderDoc>(order: T | null | undefined): T | null | undefined {
  if (!order) {
    return order
  }
  const o = normalizeBase(order) as T

  // duration: 兼容 days / nights
  if (o.duration === undefined) {
    o.duration = (o.days ?? o.nights ?? 1) as number
  }

  // petIds / petInfos: 兼容多种变体
  if (!Array.isArray(o.petIds)) {
    o.petIds = o.petIds || o.petIDs || []
  }
  if (!Array.isArray(o.petInfos)) {
    o.petInfos = o.petInfos || o.petsInfo || o.pets || []
  }

  // hostId: 优先从显式字段取，再从 hostInfo 兜底
  if (!o.hostId) {
    o.hostId = o.hostId || o.hostInfo?._id || o.hostInfo?.id || null
  }

  // amount: 兼容 totalAmount / totalPrice / money
  if (o.amount === undefined) {
    o.amount = (o.totalAmount ?? o.totalPrice ?? o.money ?? 0) as number
  }

  return o
}

/**
 * 订单反归一化（前端入参 → DB 写入）
 */
export function denormalizeOrder<T extends OrderDoc>(order: T | null | undefined): T | null | undefined {
  if (!order) {
    return order
  }
  const o = { ...order } as T & Record<string, unknown>
  // 显式字段优先：旧字段已不再写入
  delete o.petIDs
  delete o.pets
  delete o.petsInfo
  delete o.days
  delete o.nights
  delete o.totalAmount
  delete o.totalPrice
  delete o.money
  delete o.createAt
  delete o.updateAt
  return o
}

// ===== 用户归一化 =====

/**
 * 用户归一化
 */
export function normalizeUser<T extends UserDoc>(user: T | null | undefined): T | null | undefined {
  if (!user) {
    return user
  }
  const u = normalizeBase(user) as T
  // nickName 优先，兼容 nickname
  if (!u.nickName && u.nickname) {
    u.nickName = u.nickname
  }
  // avatarUrl 优先，兼容 avatar / headImg
  if (!u.avatarUrl) {
    u.avatarUrl = u.avatar || u.headImg || ''
  }
  return u
}

// ===== 寄养家庭归一化 =====

/**
 * 寄养家庭归一化
 */
export function normalizeHost<T extends HostDoc>(host: T | null | undefined): T | null | undefined {
  if (!host) {
    return host
  }
  const h = normalizeBase(host) as T
  // pricePerDay 统一
  if (h.pricePerDay === undefined) {
    h.pricePerDay = (h.price ?? h.dayPrice ?? 0) as number
  }
  return h
}

// ===== 宠物归一化 =====

/**
 * 宠物归一化
 */
export function normalizePet<T extends PetDoc>(pet: T | null | undefined): T | null | undefined {
  if (!pet) {
    return pet
  }
  const p = normalizeBase(pet) as T
  // gender 统一（项目内 'male'/'female'/'unknown'）
  if (!p.gender && p.sex) {
    p.gender = p.sex
  }
  return p
}

// ===== 商品归一化 =====

/**
 * 商品归一化
 */
export function normalizeProduct<T extends ProductDoc>(product: T | null | undefined): T | null | undefined {
  if (!product) {
    return product
  }
  const p = normalizeBase(product) as T
  // 商品主图统一 coverUrl
  if (!p.coverUrl) {
    p.coverUrl = p.coverImage || p.cover || ''
  }
  return p
}

// ===== 批量归一化 =====

/**
 * 批量归一化（用于 list 接口）
 */
export function normalizeList<T extends BaseDoc>(
  list: T[] | null | undefined,
  normalizer: Normalizer<T> = normalizeBase
): T[] {
  if (!Array.isArray(list)) {
    return []
  }
  return list.map(normalizer).filter((d): d is T => d != null) as T[]
}

// ===== 通用入口 =====

/**
 * 通用入口：按集合名选择归一化器
 */
export function normalizeByCollection<T extends BaseDoc = BaseDoc>(
  collectionName: string,
  doc: T | T[] | null | undefined
): T | T[] | null | undefined {
  const entity = COLLECTION_TO_ENTITY[collectionName]
  let normalizer: Normalizer<T> = normalizeBase as Normalizer<T>
  switch (entity) {
  case 'order': normalizer = normalizeOrder as Normalizer<T>; break
  case 'user': normalizer = normalizeUser as Normalizer<T>; break
  case 'host': normalizer = normalizeHost as Normalizer<T>; break
  case 'pet': normalizer = normalizePet as Normalizer<T>; break
  case 'product': normalizer = normalizeProduct as Normalizer<T>; break
  default: break
  }
  if (Array.isArray(doc)) {
    return normalizeList(doc, normalizer)
  }
  return normalizer(doc)
}

// ===== 错误码辅助（用于常见 DB / Payload 错误的统一转换） =====

/**
 * 将 wx-server-sdk / db 抛出的错误归一化为 BusinessError
 */
export function normalizeDbError(e: Error | { code?: string; message?: string; errMsg?: string } | null | undefined): Error {
  if (e && typeof (e as { code?: string }).code === 'string' && /^[A-Z][A-Z0-9_]+$/.test((e as { code: string }).code)) {
    // 已是注册的错误码，直接透传
    return e as Error
  }
  const msg = (e && ((e as { message?: string }).message || (e as { errMsg?: string }).errMsg)) || '数据库操作失败'
  if (msg.includes('duplicate') || msg.includes('DuplicateKey')) {
    return err('DUPLICATE_KEY', '记录已存在')
  }
  return err('DB_ERROR', msg)
}

/**
 * 校验非空 payload（用于 webhook 入口）
 */
export function ensurePayload<T extends Record<string, unknown>>(
  payload: T | null | undefined,
  required: string[] = []
): T {
  if (!payload || typeof payload !== 'object') {
    throw err('INVALID_PAYLOAD', '请求体不是合法 JSON 对象')
  }
  for (const k of required) {
    if (payload[k] === undefined || payload[k] === null || payload[k] === '') {
      throw err('INVALID_PAYLOAD', `缺少字段：${k}`)
    }
  }
  return payload
}

// 默认导出（保持 CommonJS 兼容）
export default {
  COLLECTION_TO_ENTITY,
  normalizeBase,
  normalizeOrder,
  denormalizeOrder,
  normalizeUser,
  normalizeHost,
  normalizePet,
  normalizeProduct,
  normalizeList,
  normalizeByCollection,
  normalizeDbError,
  ensurePayload,
}
