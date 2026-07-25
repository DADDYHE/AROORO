/**
 * common/types.ts - 统一公共类型定义
 *
 * 目标：
 *   - 定义所有云函数共享的基础类型
 *   - 避免在每个服务中重复定义
 *   - 提供类型扩展机制，各服务可添加特有字段
 *
 * 使用方式：
 *   import { AuthLike, CloudEvent, CloudContext } from '../common/types'
 */

import type { OrderStatus, PaymentStatus, WithdrawalStatus } from './order-status'
export type { OrderStatus, PaymentStatus, WithdrawalStatus }

// =====================================================================
// 基础类型
// =====================================================================

/**
 * 鉴权信息（所有云函数共享）
 */
export interface AuthLike {
  openid?: string
  adminId?: string
  partnerId?: string
  isPartner?: boolean
  isSuperAdmin?: boolean
  roles?: string[]
  permissions?: string[]
  _isHttpAuth?: boolean
  [k: string]: unknown
}

/**
 * 云函数事件（所有云函数共享）
 */
export interface CloudEvent {
  action?: string
  data?: Record<string, unknown>
  body?: string | Record<string, unknown>
  headers?: Record<string, string | undefined>
  httpMethod?: string
  requestContext?: {
    httpMethod?: string
    [k: string]: unknown
  }
  accessToken?: string
  openid?: string
  [k: string]: unknown
}

/**
 * 云函数上下文（所有云函数共享）
 */
export interface CloudContext {
  HTTP_CONTEXT?: {
    headers: Record<string, string | undefined>
  }
  [k: string]: unknown
}

// =====================================================================
// 常用业务类型
// =====================================================================

/**
 * 分页请求参数
 */
export interface PaginationParams {
  page?: number
  pageSize?: number
}

/**
 * 分页响应结果
 */
export interface PaginatedResult<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
}

/**
 * 通用 API 响应
 */
export interface ApiResponse<T = unknown> {
  code: number
  message: string
  data?: T
  error?: {
    type: string
    details?: Record<string, unknown> | null
  }
}

/**
 * 错误码类型
 */
export type ErrorCode = 
  | 'INVALID_PARAMS'
  | 'MISSING_REQUIRED'
  | 'AUTH_REQUIRED'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_INVALID'
  | 'PERMISSION_DENIED'
  | 'NOT_FOUND'
  | 'BUSINESS_ERROR'
  | 'DATA_ERROR'
  | 'INTERNAL_ERROR'
  | 'UNKNOWN_ACTION'

/**
 * 优惠券状态
 */
export type CouponStatus = 'unused' | 'locked' | 'used' | 'expired' | 'refunded'

/**
 * 优惠券类型
 */
export type CouponType = 'fixed_amount' | 'discount' | 'full_reduction'

/**
 * 优惠券来源
 */
export type CouponSource = 'claim' | 'popup' | 'manual' | 'system'

/**
 * 收藏目标类型
 */
export type FavoriteTargetType = 'host' | 'deal' | 'product' | 'activity' | 'partner' | 'tuan'

/**
 * 支持的语言
 */
export type SupportedLocale = 'zh-CN' | 'en-US' | 'ja-JP'

// =====================================================================
// 工具类型
// =====================================================================

/**
 * 可选字段标记
 */
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>

/**
 * 深度可选
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
}

/**
 * 提取函数参数类型
 */
export type FunctionParams<T extends (...args: unknown[]) => unknown> = T extends (...args: infer P) => unknown ? P : never

/**
 * 提取 Promise 结果类型
 */
export type PromiseResult<T> = T extends Promise<infer R> ? R : T

// =====================================================================
// CloudBase 数据库类型
// =====================================================================

/** 查询结果 */
export interface CloudBaseQueryResult<T = Record<string, unknown>> {
  data: T[]
}

/** 单文档查询结果 */
export interface CloudBaseDocResult<T = Record<string, unknown>> {
  data: T | null
}

/** 计数结果 */
export interface CloudBaseCountResult {
  total: number
}

/** 新增结果 */
export interface CloudBaseAddResult {
  _id: string
}

/** 更新结果（doc().update() 返回 { updated }；where().update() 返回 { stats: { updated, created } }） */
export interface CloudBaseUpdateResult {
  updated?: number | string
  upsertId?: string
  stats?: {
    updated: number
    created?: number
  }
}

/** 删除结果 */
export interface CloudBaseRemoveResult {
  removed: number
}

/** 数据库命令（inc / eq / lt / gt / in / nin / and / or 等） */
export interface CloudBaseCommand {
  inc: (n: number) => unknown
  eq: (val: unknown) => unknown
  neq: (val: unknown) => unknown
  lt: (val: unknown) => unknown
  lte: (val: unknown) => unknown
  gt: (val: unknown) => unknown
  gte: (val: unknown) => unknown
  in: (val: unknown[]) => unknown
  nin: (val: unknown[]) => unknown
  and: (...args: unknown[]) => unknown
  or: (...args: unknown[]) => unknown
  [k: string]: unknown
}

/** 聚合结果 */
export interface CloudBaseAggregateResult<T = Record<string, unknown>> {
  list: T[]
}

/** 聚合链（group / match / sort / project / limit / skip / lookup / unwind / end） */
export interface CloudBaseAggregate<T = Record<string, unknown>> {
  group(stage: Record<string, unknown>): CloudBaseAggregate<T>
  match(stage: Record<string, unknown>): CloudBaseAggregate<T>
  sort(stage: Record<string, unknown>): CloudBaseAggregate<T>
  project(stage: Record<string, unknown>): CloudBaseAggregate<T>
  lookup(stage: Record<string, unknown>): CloudBaseAggregate<T>
  unwind(stage: unknown): CloudBaseAggregate<T>
  addFields(stage: Record<string, unknown>): CloudBaseAggregate<T>
  limit(n: number): CloudBaseAggregate<T>
  skip(n: number): CloudBaseAggregate<T>
  end(): Promise<CloudBaseAggregateResult<T>>
}

/** 集合链式查询（where / field / orderBy / skip / limit / get / count / add / doc / update / aggregate） */
export interface CloudBaseCollection<T = Record<string, unknown>> {
  where(condition: Record<string, unknown>): CloudBaseCollection<T>
  field(projection: Record<string, boolean>): CloudBaseCollection<T>
  orderBy(field: string, direction: 'asc' | 'desc'): CloudBaseCollection<T>
  skip(n: number): CloudBaseCollection<T>
  limit(n: number): CloudBaseCollection<T>
  get(): Promise<CloudBaseQueryResult<T>>
  count(): Promise<CloudBaseCountResult>
  add(options: { data: Record<string, unknown> }): Promise<CloudBaseAddResult>
  update(options: { data: Record<string, unknown> }): Promise<CloudBaseUpdateResult>
  doc(id: string): CloudBaseDoc<T>
  aggregate(): CloudBaseAggregate<T>
}

/** 文档操作（get / field / update / remove / set） */
export interface CloudBaseDoc<T = Record<string, unknown>> {
  get(): Promise<CloudBaseDocResult<T>>
  field(projection: Record<string, boolean>): CloudBaseDoc<T>
  update(options: { data: Record<string, unknown> }): Promise<CloudBaseUpdateResult>
  remove(): Promise<CloudBaseRemoveResult>
  set(options: { data: Record<string, unknown> }): Promise<CloudBaseUpdateResult>
}

/** 事务内的集合（仅支持 doc(id).update / doc(id).get / doc(id).remove） */
export interface CloudBaseTransactionCollection<T = Record<string, unknown>> {
  doc(id: string): {
    get(): Promise<CloudBaseDocResult<T>>
    update(options: { data: Record<string, unknown> }): Promise<CloudBaseUpdateResult>
    remove(): Promise<CloudBaseRemoveResult>
    set(options: { data: Record<string, unknown> }): Promise<CloudBaseUpdateResult>
  }
}

/** 事务（commit / rollback / collection） */
export interface CloudBaseTransaction {
  collection<T = Record<string, unknown>>(name: string): CloudBaseTransactionCollection<T>
  commit(): Promise<void>
  rollback(): Promise<void>
}

/** CloudBase 辅助方法 */
export interface CloudBaseDbHelpers {
  serverDate(): Date
  RegExp(options: { regexp: string; options?: string }): unknown
}

/** CloudBase 数据库实例 */
export interface CloudBaseDB extends CloudBaseDbHelpers {
  collection<T = Record<string, unknown>>(name: string): CloudBaseCollection<T>
  command: CloudBaseCommand
  startTransaction(): Promise<CloudBaseTransaction>
}

/** 链式查询别名（等价于 CloudBaseCollection，语义上强调"查询构造器"） */
export type CloudBaseQuery<T = Record<string, unknown>> = CloudBaseCollection<T>

// =====================================================================
// 业务文档类型（各服务共享的宽松文档结构，均带索引签名以兼容运行时冗余字段）
// =====================================================================

/** 文档基础字段 */
export interface BaseEntityDoc {
  _id?: string
  id?: string
  createAt?: Date | string
  createdAt?: Date | string
  updateAt?: Date | string
  updatedAt?: Date | string
  [key: string]: unknown
}

/** 订单类型 */
export type OrderType = 'order' | 'boarding' | 'feeding' | 'activity' | 'mall' | 'tuan' | 'hosting'

/** 订单文档（宽松结构） */
export interface OrderDoc extends BaseEntityDoc {
  orderNo?: string
  orderType?: OrderType
  status?: OrderStatus | string
  paymentStatus?: PaymentStatus | string
  ownerId?: string
  organizerId?: string
  hostId?: string | null
  petIds?: string[]
  amount?: number
  totalAmount?: number
  totalPrice?: number
}

/** 用户文档（宽松结构） */
export interface UserDoc extends BaseEntityDoc {
  openid?: string
  nickName?: string
  nickname?: string
  avatarUrl?: string
  avatar?: string
  phone?: string
}

/** 寄养家庭档案文档（宽松结构） */
export interface HostProfileDoc extends BaseEntityDoc {
  openid?: string
  hostName?: string
  phone?: string
  pricePerDay?: number
}

/** 评价文档（宽松结构） */
export interface EvaluationDoc extends BaseEntityDoc {
  orderId?: string
  hostId?: string
  ownerId?: string
  rating?: number
  content?: string
}

// =====================================================================
// 日志类型
// =====================================================================

/** 基础 Logger 接口 */
export interface Logger {
  info: (action: string, ctx?: Record<string, unknown>) => void
  debug: (action: string, ctx?: Record<string, unknown>) => void
  warn: (action: string, ctx?: Record<string, unknown>) => void
  error: (action: string, error: Error | unknown) => void
  child: (subTag: string) => Logger
}

// =====================================================================
// 业务错误类型
// =====================================================================

/** 错误严重级别（与 utils.ts 的 ErrorCodeCategory 对齐） */
export type ErrorSeverity = 'VALIDATION' | 'AUTH' | 'PERMISSION' | 'NOT_FOUND' | 'DATA' | 'SERVER' | 'BUSINESS'

/** 业务错误码（与 errors.ts 的 BusinessErrors 注册表对齐） */
export type BusinessErrorCode =
  | 'INVALID_PARAMS' | 'MISSING_REQUIRED'
  | 'AUTH_REQUIRED' | 'TOKEN_EXPIRED' | 'TOKEN_INVALID' | 'WX_LOGIN_FAILED'
  | 'PERMISSION_DENIED' | 'PARTNER_REQUIRED' | 'ADMIN_REQUIRED' | 'SUPER_ADMIN_REQUIRED'
  | 'NOT_FOUND' | 'ORDER_NOT_FOUND' | 'USER_NOT_FOUND' | 'HOST_NOT_FOUND' | 'PET_NOT_FOUND'
  | 'PRODUCT_NOT_FOUND' | 'COUPON_NOT_FOUND' | 'ACTIVITY_NOT_FOUND' | 'BANNER_NOT_FOUND'
  | 'DUPLICATE_KEY' | 'DB_ERROR' | 'DATA_ERROR'
  | 'ORDER_CREATE_FAILED' | 'ORDER_STATUS_INVALID' | 'ORDER_STATUS_CHANGED' | 'ORDER_ALREADY_PAID'
  | 'ORDER_ALREADY_REFUNDED' | 'ORDER_TIMEOUT' | 'REFUND_FAILED'
  | 'PAYMENT_CREATE_FAILED' | 'PAYMENT_NOTIFY_INVALID' | 'PAYMENT_AMOUNT_MISMATCH' | 'WECHAT_API_ERROR'
  | 'ENCRYPT_FAILED' | 'DECRYPT_FAILED' | 'INVALID_PAYLOAD'
  | 'INTERNAL_ERROR' | 'SERVICE_UNAVAILABLE' | 'RATE_LIMITED' | 'IDEMPOTENT_REPLAY' | 'UNKNOWN_ACTION'
  | 'STATE_INVALID' | 'CATEGORY_HAS_PRODUCTS' | 'COUPON_LIMIT_REACHED' | 'COUPON_STATUS_INVALID'
  | 'COUPON_LOCK_FAILED' | 'COUPON_USE_FAILED'
  | 'STOCK_INSUFFICIENT' | 'ACTIVITY_HAS_REGISTRATIONS' | 'BUSINESS_ERROR'
  | 'RISK_REJECT' | 'RISK_PENDING' | 'RISK_PASS'

/** 错误规格（注册表条目） */
export interface BusinessErrorSpec {
  code: BusinessErrorCode
  message: string
  httpStatus: number
  severity: ErrorSeverity
}

/** BusinessError 实例接口（鸭子类型判定依据） */
export interface BusinessErrorInstance {
  name: 'BusinessError'
  code: BusinessErrorCode
  details: Record<string, unknown> | null
  httpStatus: number
  severity: ErrorSeverity
  message: string
  toResponse(): {
    code: number
    message: string
    data: null
    error: { type: BusinessErrorCode; details: Record<string, unknown> | null }
  }
}

// =====================================================================
// 状态机类型
// =====================================================================

/** 状态机核心接口（createStateMachine 返回值的子集） */
export interface StateMachine<S extends string = string> {
  canTransition: (from: S, to: S) => boolean
  assertTransition: (from: S, to: S) => void
  getAllowedTransitions: (from: S) => S[]
}

/** 状态机节点（兼容性重导出） */
export type StateMachineNode<S extends string = string> = {
  state: S
  transitions: S[]
  metadata?: Record<string, unknown>
}

// =====================================================================
// 缓存类型
// =====================================================================

/** 缓存条目（内部存储结构） */
export interface CacheEntry<V = unknown> {
  value: V
  timestamp: number
  ttl: number
}

/** LRU + TTL 缓存实例（createCache 工厂返回值） */
export interface LruTtlCache<V = unknown> {
  get: (key: string) => V | undefined
  set: (key: string, value: V, ttlMs?: number) => void
  delete: (key: string) => boolean
  clear: () => void
  size: () => number
}
