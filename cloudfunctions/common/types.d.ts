/**
 * TypeScript 类型声明文件（Sprint 10 渐进式类型化）
 *
 * 目标：
 *   - 为 common 模块提供 IDE 类型补全与类型检查
 *   - 不强制要求运行时改造（仍是 JS 实现）
 *   - 后续 Sprint 可在 .d.ts 稳定后逐步迁移到 .ts 实现
 *
 * 用法（在新模块中）：
 *   /// <reference path="../../cloudfunctions/common/types.d.ts" />
 *
 *   import type { Logger, BusinessError, OrderDoc } from './types'
 */

/* ============================================================
 * 1. 通用：CloudBase 数据库
 * ============================================================ */

export interface CloudBaseDB {
  collection: (name: string) => CloudBaseCollection
  command: CloudBaseCommand
  serverDate: (opts?: { offset?: number }) => Date
}

export interface CloudBaseCollection {
  where: (query: QueryObject) => CloudBaseQuery
  doc: (id: string) => CloudBaseDoc
  add: (params: { data: Record<string, unknown> }) => Promise<{ _id: string }>
}

export interface CloudBaseQuery {
  where: (q: QueryObject) => CloudBaseQuery
  field: (f: ProjectionObject) => CloudBaseQuery
  orderBy: (field: string, direction: 'asc' | 'desc') => CloudBaseQuery
  skip: (n: number) => CloudBaseQuery
  limit: (n: number) => CloudBaseQuery
  get: () => Promise<{ data: any[] }>
  count: () => Promise<{ total: number }>
  // 批量更新：where().update({ data })
  update: (params: { data: Record<string, unknown> }) => Promise<{ updated: number }>
  // 聚合查询：where().aggregate()（Sprint 30 引入）
  aggregate: () => CloudBaseAggregate
}

/** 聚合操作符 - 简化版（Sprint 30） */
export interface AggregateOps {
  sum: (v: number | Record<string, unknown>) => unknown
}

export interface CloudBaseAggregate {
  group: (spec: Record<string, unknown>) => CloudBaseAggregate
  match: (spec: Record<string, unknown>) => CloudBaseAggregate
  project: (spec: Record<string, unknown>) => CloudBaseAggregate
  sort: (spec: Record<string, unknown>) => CloudBaseAggregate
  limit: (n: number) => CloudBaseAggregate
  skip: (n: number) => CloudBaseAggregate
  end: () => Promise<{ list: any[] }>
}

export interface CloudBaseDoc {
  get: () => Promise<{ data: any | null }>
  update: (params: { data: Record<string, unknown> }) => Promise<{ updated: number }>
  set: (params: { data: Record<string, unknown> }) => Promise<{ _id: string }>
  remove: () => Promise<{ deleted: number }>
  field: (f: ProjectionObject) => CloudBaseDoc
}

export interface CloudBaseCommand {
  eq: (v: any) => QueryOp
  neq: (v: any) => QueryOp
  in: (arr: any[]) => QueryOp
  nin: (arr: any[]) => QueryOp
  gt: (v: any) => QueryOp
  gte: (v: any) => QueryOp
  lt: (v: any) => QueryOp
  lte: (v: any) => QueryOp
  exists: (b: boolean) => QueryOp
  inc: (n: number) => UpdateOp
  push: (v: any) => UpdateOp
  and: (...args: QueryObject[]) => QueryOp
  or: (...args: QueryObject[]) => QueryOp
}

export type QueryOp = { _op: string; v: any; args?: any[] }
export type UpdateOp = { _op: 'inc' | 'push' | 'set'; v: any }

export type QueryObject = Record<string, any | QueryOp>
export type ProjectionObject = Record<string, boolean>

/* ============================================================
 * 2. 通用：错误体系
 * ============================================================ */

export type BusinessErrorCode =
  | 'INVALID_PARAMS' | 'MISSING_REQUIRED'
  | 'AUTH_REQUIRED' | 'TOKEN_EXPIRED' | 'TOKEN_INVALID' | 'WX_LOGIN_FAILED'
  | 'PERMISSION_DENIED' | 'PARTNER_REQUIRED' | 'ADMIN_REQUIRED' | 'SUPER_ADMIN_REQUIRED'
  | 'NOT_FOUND' | 'ORDER_NOT_FOUND' | 'USER_NOT_FOUND' | 'HOST_NOT_FOUND'
  | 'PET_NOT_FOUND' | 'PRODUCT_NOT_FOUND' | 'COUPON_NOT_FOUND' | 'ACTIVITY_NOT_FOUND'
  | 'BANNER_NOT_FOUND'
  | 'DUPLICATE_KEY' | 'DB_ERROR' | 'DATA_ERROR'
  | 'ORDER_CREATE_FAILED' | 'ORDER_STATUS_INVALID' | 'ORDER_ALREADY_PAID'
  | 'ORDER_ALREADY_REFUNDED' | 'ORDER_TIMEOUT' | 'REFUND_FAILED'
  | 'PAYMENT_CREATE_FAILED' | 'PAYMENT_NOTIFY_INVALID' | 'PAYMENT_AMOUNT_MISMATCH'
  | 'WECHAT_API_ERROR' | 'STOCK_INSUFFICIENT'
  | 'ENCRYPT_FAILED' | 'DECRYPT_FAILED' | 'INVALID_PAYLOAD'
  | 'INTERNAL_ERROR' | 'SERVICE_UNAVAILABLE' | 'RATE_LIMITED'
  | 'IDEMPOTENT_REPLAY' | 'UNKNOWN_ACTION'
  | 'STATE_INVALID' | 'CATEGORY_HAS_PRODUCTS'
  | 'COUPON_LIMIT_REACHED' | 'COUPON_STATUS_INVALID'
  | 'ACTIVITY_HAS_REGISTRATIONS' | 'BUSINESS_ERROR'
  // Sprint 14: 风控决策
  | 'RISK_REJECT' | 'RISK_PENDING' | 'RISK_PASS'

export type ErrorSeverity =
  | 'VALIDATION' | 'DATA' | 'AUTH' | 'NOT_FOUND' | 'PERMISSION' | 'BUSINESS' | 'SERVER'

export interface BusinessErrorSpec {
  code: BusinessErrorCode
  message: string
  httpStatus: number
  severity: ErrorSeverity
}

export interface BusinessErrorInstance extends Error {
  name: 'BusinessError'
  code: BusinessErrorCode
  details: Record<string, unknown> | null
  httpStatus: number
  severity: ErrorSeverity
  toResponse: () => {
    code: number
    message: string
    data: null
    error: { type: BusinessErrorCode; details: Record<string, unknown> | null }
  }
}

export interface ApiResponse<T = any> {
  code: number
  message: string
  data: T | null
  error?: { type: BusinessErrorCode; details?: Record<string, unknown> | null }
}

/* ============================================================
 * 3. 通用：日志
 * ============================================================ */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface Logger {
  debug: (action: string, ctx?: Record<string, unknown>) => void
  info: (action: string, ctx?: Record<string, unknown>) => void
  warn: (action: string, ctx?: Record<string, unknown> | Error) => void
  error: (action: string, ctx?: Record<string, unknown> | Error) => void
  child: (subTag: string) => Logger
}

/* ============================================================
 * 4. 通用：状态机
 * ============================================================ */

export interface StateMachineNode<S extends string = string> {
  state: S
  allowedTransitions: S[]
  onEnter?: (context: Record<string, unknown>) => void
}

export interface StateMachine<S extends string = string> {
  states: S[]
  canTransition: (from: S, to: S) => boolean
  assertTransition: (from: S, to: S) => void
  getAllowedTransitions: (from: S) => S[]
}

/* ============================================================
 * 5. 通用：权限
 * ============================================================ */

export type RoleName = 'super_admin' | 'admin' | 'partner' | 'host' | 'user'

export interface AdminDoc {
  _id: string
  openid: string
  status: 'active' | 'disabled' | 'pending'
  roles?: RoleName[]
  permissions?: string[]
  createdAt: Date
  updatedAt: Date
}

/* ============================================================
 * 6. 业务：订单 / 用户 / 寄养家庭 / 宠物 / 评价
 * ============================================================ */

export type OrderStatus =
  | 'pending' | 'paid' | 'confirmed' | 'ongoing' | 'in_progress'
  | 'completed' | 'cancelled'

export type PaymentStatus = 'unpaid' | 'paid' | 'refunded' | 'partial_refunded'

export type OrderType = 'hosting' | 'feeding' | 'activity' | 'group_buy' | 'mall'

export interface OrderDoc {
  _id: string
  ownerId: string
  hostId?: string
  organizerId?: string
  petIds: string[]
  startDate: string
  endDate: string
  duration: number
  pricePerDay: number
  petCount: number
  basicPrice: number
  originalAmount: number
  totalPrice: number
  couponId?: string
  couponDiscount: number
  note?: string
  status: OrderStatus
  paymentStatus: PaymentStatus
  outTradeNo?: string
  paidAt?: Date
  refundStatus?: 'pending' | 'completed' | 'failed'
  orderType?: OrderType
  activityId?: string
  createdAt: Date
  updatedAt: Date
}

export interface UserDoc {
  _id: string
  openid: string
  nickName: string
  phone?: string
  avatarUrl?: string
  inviterId?: string
  status: 'active' | 'disabled'
  createdAt: Date
  updatedAt: Date
}

export interface HostProfileDoc {
  _id: string
  openid: string
  hostName: string
  phone?: string
  avatarUrl?: string
  pricePerDay: number
  status: 'active' | 'pending_review' | 'rejected' | 'disabled'
  isAcceptingOrders: boolean
  rating: number
  ratingCount: number
  createdAt: Date
  updatedAt: Date
}

export interface PetDoc {
  _id: string
  ownerId: string
  name: string
  species: string
  breed?: string
  age?: number
  petsInfo: PetInfoItem[]  // 兼容旧字段 petInfo
  createdAt: Date
  updatedAt: Date
}

export interface PetInfoItem {
  name: string
  species?: string
  breed?: string
  age?: number
  weight?: number
  notes?: string
}

export interface EvaluationDoc {
  _id: string
  orderId: string
  hostId: string
  organizerId: string
  ownerId: string
  rating: 1 | 2 | 3 | 4 | 5
  comment: string
  tags: string[]
  createdAt: Date
  updatedAt: Date
}

/* ============================================================
 * 7. 业务：团购 / 佣金 / 通知
 * ============================================================ */

export type TuanDealStatus = 'draft' | 'published' | 'active' | 'expired' | 'closed'

export interface TuanDealDoc {
  _id: string
  title: string
  coverUrl: string
  description: string
  images: string[]
  products: TuanProduct[]
  startTime: Date
  endTime: Date
  status: TuanDealStatus
  totalOrders: number
  totalAmount: number
  createdAt: Date
  updatedAt: Date
}

export interface TuanProduct {
  productId: string
  name?: string
  image?: string
  skuType: 'single' | 'multi'
  tuanPrice: number
  price?: number
  stock: number
  sold?: number
  skus?: TuanSku[]
}

export interface TuanSku {
  skuId: string
  tuanPrice: number
  price?: number
  stock: number
  sold?: number
  enabled: boolean
}

export interface TuanOrderDoc {
  _id: string
  dealId: string
  productId: string
  skuId: string
  ownerId: string
  quantity: number
  tuanPrice: number
  totalAmount: number
  status: 'pending' | 'pending_payment' | 'paid' | 'completed' | 'cancelled'
  createdAt: Date
  updatedAt: Date
}

export interface CommissionDoc {
  _id: string
  inviterId: string
  inviterNickName: string
  ownerId: string
  orderType: OrderType
  orderId: string
  orderNo: string
  orderAmount: number
  commissionRate: number
  commissionAmount: number
  status: 'pending' | 'settled' | 'cancelled'
  createdAt: Date
  updatedAt: Date
}

export interface NotificationDoc {
  _id: string
  type: 'order_status_change' | 'evaluation_reminder' | 'system'
  orderId?: string
  status?: string
  statusText?: string
  ownerId: string
  isRead: boolean
  createdAt: Date
}

/* ============================================================
 * 8. 通用：日期 / 节假日
 * ============================================================ */

export interface DateRange {
  start: Date
  end: Date
  /** 半开区间判断：end 是否严格 > other.start */
  overlaps: (other: DateRange) => boolean
}

export interface HolidayDoc {
  _id: string
  date: string
  name: string
  isOffDay: boolean
  year: number
}

/* ============================================================
 * 9. 通用：缓存
 * ============================================================ */

export interface CacheEntry<V = unknown> {
  value: V
  expiresAt: number
  hits: number
}

export interface LruTtlCache<V = unknown> {
  get: (key: string) => V | undefined
  set: (key: string, value: V, ttlMs?: number) => void
  delete: (key: string) => boolean
  clear: () => void
  size: () => number
}

/* ============================================================
 * 10. 通用：加密 / 令牌
 * ============================================================ */

export interface EncryptedPayload {
  ciphertext: string
  iv: string
  tag: string
  alg: 'AES-256-GCM'
  v: 1
}

export interface TokenClaims {
  openid: string
  iat: number
  exp: number
  scope?: string[]
}
