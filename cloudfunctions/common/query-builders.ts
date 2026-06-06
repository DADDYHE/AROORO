/**
 * 常用 CloudBase 数据库查询构造器（TypeScript 源文件 - Sprint 17 迁移）
 *
 * 解决：
 *   - 各云函数中重复实现 hostProfileQuery / userByOpenId / activityByDate 等查询
 *   - where / orderBy / skip / limit 链式调用拼写错误难发现
 *
 * 用法：
 *   const qb = require('./common/query-builders')
 *
 *   const chain = qb.hostProfile({ status: 'active', city: '上海' })
 *     .orderBy('pricePerDay', 'asc')
 *     .limit(20)
 *   const { data } = await chain.get()
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.common.json
 */

import type { CloudBaseDB, CloudBaseQuery } from './types'
import type { RangeQueryDescriptor } from './date-range'

// ===== 常量 =====

export const COLLECTION = Object.freeze({
  USERS: 'users',
  HOSTS: 'hostProfiles',
  PETS: 'pets',
  ORDERS: 'orders',
  PRODUCTS: 'products',
  COUPONS: 'coupons',
  USER_COUPONS: 'userCoupons',
  ACTIVITIES: 'activities',
  ACTIVITY_REGS: 'activityRegistrations',
  TUAN: 'tuanActivities',
  TUAN_PARTS: 'tuanParticipants',
  FAVORITES: 'favorites',
})

export type CollectionName = (typeof COLLECTION)[keyof typeof COLLECTION]

// ===== 类型 =====

export interface HostProfileFilters {
  status?: string
  city?: string
  hostId?: string
  userId?: string
  services?: string[]
  [key: string]: unknown
}

export interface OrderFilters {
  userId?: string
  hostId?: string
  status?: string
  payStatus?: string
  createdAfter?: Date | string
  [key: string]: unknown
}

export interface ProductFilters {
  category?: string
  keyword?: string
  [key: string]: unknown
}

// ===== 核心 builder =====

/**
 * 创建带预设查询的 builder
 */
export function builder(
  db: CloudBaseDB,
  collection: string,
  presetWhere: Record<string, unknown> = {}
): CloudBaseQuery {
  if (!db) {
    throw new Error('query-builders: db 必填')
  }
  if (!collection) {
    throw new Error('query-builders: collection 必填')
  }
  const chain = db.collection(collection) as unknown as CloudBaseQuery
  if (Object.keys(presetWhere).length > 0) {
    chain.where(presetWhere as any)
  }
  return chain
}

// ===== 用户相关 =====

/**
 * 用户 by _openid
 */
export function userByOpenId(db: CloudBaseDB, openid: string): CloudBaseQuery {
  return builder(db, COLLECTION.USERS, { _openid: openid })
}

/**
 * 用户 by userId（自定义）
 */
export function userById(db: CloudBaseDB, userId: string): CloudBaseQuery {
  return builder(db, COLLECTION.USERS, { userId })
}

// ===== 寄养家庭 =====

/**
 * 寄养家庭查询
 */
export function hostProfile(
  db: CloudBaseDB,
  filters: HostProfileFilters = {}
): CloudBaseQuery {
  const where: Record<string, unknown> = {}
  if (filters.status) {where.status = filters.status}
  if (filters.city) {where.city = filters.city}
  if (filters.hostId) {where.hostId = filters.hostId}
  if (filters.userId) {where.userId = filters.userId}
  return builder(db, COLLECTION.HOSTS, where)
}

// ===== 订单 =====

/**
 * 订单 by 状态
 */
export function ordersByStatus(
  db: CloudBaseDB,
  filters: OrderFilters = {}
): CloudBaseQuery {
  const where: Record<string, unknown> = {}
  if (filters.userId) {where.userId = filters.userId}
  if (filters.hostId) {where.hostId = filters.hostId}
  if (filters.status) {where.status = filters.status}
  if (filters.payStatus) {where.payStatus = filters.payStatus}
  return builder(db, COLLECTION.ORDERS, where)
}

// ===== 商品 =====

/**
 * 商品查询（默认 status=active）
 */
export function activeProducts(
  db: CloudBaseDB,
  filters: ProductFilters = {}
): CloudBaseQuery {
  const where: Record<string, unknown> = { status: 'active' }
  if (filters.category) {where.category = filters.category}
  if (filters.keyword) {
    // 简化：项目内更可能用 contains（这里用 RegExp 兼容 db.regexp）
    where.name = new RegExp(filters.keyword, 'i')
  }
  return builder(db, COLLECTION.PRODUCTS, where)
}

// ===== 优惠券 =====

/**
 * 用户优惠券（未使用 + 未过期）
 */
export function userCouponsAvailable(
  db: CloudBaseDB,
  userId: string,
  now: Date = new Date()
): CloudBaseQuery {
  return builder(db, COLLECTION.USER_COUPONS, {
    userId,
    status: 'unused',
    expiresAt: db.command.gte(now),
  })
}

// ===== 活动 / 团购 =====

/**
 * 活动报名 by 活动 + 用户
 */
export function activityRegistration(
  db: CloudBaseDB,
  activityId: string,
  userId: string
): CloudBaseQuery {
  return builder(db, COLLECTION.ACTIVITY_REGS, { activityId, userId })
}

/**
 * 团购参与者 by 团 ID
 */
export function tuanParticipants(
  db: CloudBaseDB,
  tuanId: string
): CloudBaseQuery {
  return builder(db, COLLECTION.TUAN_PARTS, { tuanId })
}

// ===== 收藏 =====

/**
 * 收藏 by user + 目标
 */
export function favorite(
  db: CloudBaseDB,
  userId: string,
  targetId: string
): CloudBaseQuery {
  return builder(db, COLLECTION.FAVORITES, { userId, targetId })
}

// ===== 时间范围（与 date-range 配合） =====

/**
 * 时间范围查询（与 date-range.js 配合）
 *
 * @param db CloudBase db 实例
 * @param collection 集合名
 * @param field 时间字段名（如 'createdAt' / 'paidAt'）
 * @param rangeQuery 来自 date-range#buildRangeQuery 的输出
 * @param extraWhere 附加 where
 */
export function inDateRange(
  db: CloudBaseDB,
  collection: string,
  field: string,
  rangeQuery: RangeQueryDescriptor | null,
  extraWhere: Record<string, unknown> = {}
): CloudBaseQuery {
  if (!rangeQuery) {
    return Object.keys(extraWhere).length > 0
      ? builder(db, collection, extraWhere)
      : (db.collection(collection) as unknown as CloudBaseQuery)
  }
  const where: Record<string, unknown> = { ...extraWhere }
  // CloudBase db.command.gte / lt
  where[field] = db.command.and(
    db.command.gte(rangeQuery._gte),
    db.command.lt(rangeQuery._lt)
  )
  return builder(db, collection, where)
}

// 默认导出（保持 CommonJS 兼容）
export default {
  COLLECTION,
  builder,
  userByOpenId,
  userById,
  hostProfile,
  ordersByStatus,
  activeProducts,
  userCouponsAvailable,
  activityRegistration,
  tuanParticipants,
  favorite,
  inDateRange,
}
