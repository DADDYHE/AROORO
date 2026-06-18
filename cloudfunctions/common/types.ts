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
    details?: Record<string, unknown>
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
