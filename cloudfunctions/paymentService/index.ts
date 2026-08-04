/**
 * paymentService/index.ts - 支付服务统一入口（TypeScript 源文件 - Sprint 47 迁移）
 *
 * 业务功能（聚合 pay / refund / notify 三个 service）：
 *   - pay     子服务：createPayment / queryPayment / closePayment / confirmPayment
 *   - refund  子服务：createRefund / queryRefund
 *   - notify  子服务：paymentNotify（微信支付 V3 HTTP 回调）
 *
 * 入口分发：
 *   - HTTP 请求（微信支付回调）：event.headers + event.body + !event.action
 *     → 直接调用 paymentNotify，跳过鉴权
 *   - 普通 API 请求：按 event.action 分发到对应 handler
 *     → 调用 verifyAuth 鉴权（paymentNotify 之外都需要登录）
 *
 * 关键设计：
 *   - 鉴权：paymentNotify 不需要登录（在 NO_AUTH_ACTIONS 中声明）
 *   - 错误：err() 工厂 + toResponse 统一响应
 *   - 业务错误：isBusinessError 类型守卫替代裸字符串 e.code === 'X'
 *   - 限流：Sprint 21 注入 initGlobalRateLimitFromDb（基于 db.rate_limits 共享计数）
 *
 * 迁移目标：
 *   - 强类型化 6 个 handler + 1 个 notify 入口
 *   - 强类型化 CloudEvent / CloudContext / AuthLike（与已迁移的 12 个服务对齐）
 *   - 抽离 NO_AUTH_ACTIONS 常量 + CloudEvent 事件分支判定
 *   - 编译产物（index.js）继续被云函数 runtime require
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.paymentService.json
 *   （运行时仍消费 .js 编译产物）
 */

// Sprint 47 迁移说明：
//   - 仍消费 .js 编译产物（tsc 输出到 cloudfunctions/paymentService/index.js）
//   - 对 .js 文件（utils / errors / logger / auth-middleware / risk-rate-limit）使用 require() 而非 import
//   - 强类型作用于 common/* 与本文件内部接口
//   - 不直接依赖子服务的内部 .ts（依赖 .js 编译产物，避免 tsconfig include 串扰）

import { initCloud, handleError, ERROR_CODES } from './common/utils'
import { createLogger, type ServiceLogger } from './common/logger'
import { err, toResponse, isBusinessError } from './common/errors'

// service 内部 .js 模块走 CommonJS require
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { verifyAuth } = require('./common/auth-middleware')
// Sprint 50: 限流统一 bootstrap
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { bootstrapRateLimit } = require("./common/rate-limit-bootstrap")
// H1: 引入 recordAlert 用于 bootstrap 失败持久化告警
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { recordAlert } = require("./common/alert")

// =====================================================================
// 公共类型（与已迁移的 12 个服务保持一致）
// =====================================================================

/** 鉴权后注入的会话信息（来自 verifyAuth） */
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

/** 微信支付回调 HTTP 事件 */
export interface HttpEvent {
  headers?: Record<string, string | undefined>
  body?: string | Record<string, unknown> | null
  [k: string]: unknown
}

/** 普通 API 事件 */
export interface ApiEvent {
  action?: string
  data?: Record<string, unknown>
  body?: string | Record<string, unknown>
  Time?: string
  Timestamp?: number
  TriggerName?: string
  Message?: string
  [k: string]: unknown
}

/** 云函数统一事件（HTTP 或 API） */
export type CloudEvent = HttpEvent & ApiEvent

/** 云函数上下文 */
export interface CloudContext {
  [k: string]: unknown
}

/** handler 签名（与子服务 .js 编译产物对齐） */
export type Handler = (event: CloudEvent, context: CloudContext, auth: AuthLike | null) => Promise<unknown>

/** 子服务 handlers 表 */
export type HandlerMap = Record<string, Handler>

// =====================================================================
// 常量
// =====================================================================

/** 不需要登录的 actions（HTTP 回调或公开 endpoint） */
export const NO_AUTH_ACTIONS: readonly string[] = ['paymentNotify']

/** 支持的 action 集合（用于 fail-fast 校验） */
export const SUPPORTED_ACTIONS: readonly string[] = [
  // pay 子服务
  'createPayment',
  'queryPayment',
  'closePayment',
  'confirmPayment',
  // refund 子服务
  'createRefund',
  'queryRefund',
  // notify 子服务（HTTP 回调走 isHttpRequest 分支）
  'paymentNotify',
]

// =====================================================================
// 模块初始化
// =====================================================================

const logger: ServiceLogger = createLogger('paymentService')

// =====================================================================
// 工具函数
// =====================================================================

/** 判定 event 是否为 HTTP 触发（微信支付回调入口） */
export function isHttpRequest(event: CloudEvent): boolean {
  return Boolean(event.headers) && event.body !== undefined && !event.action
}

// =====================================================================
// 子服务 handlers 聚合
// =====================================================================

// eslint-disable-next-line @typescript-eslint/no-var-requires
const payHandlers: HandlerMap = require('./services/pay')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const refundHandlers: HandlerMap = require('./services/refund')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const notifyHandlers: HandlerMap = require('./services/notify')

/** 聚合后的 handlers（所有子服务暴露的 action） */
export const handlers: HandlerMap = {
  ...payHandlers,
  ...refundHandlers,
  ...notifyHandlers,
}

// =====================================================================
// Sprint 50: 限流统一 bootstrap（rate_limits + rate_limit_configs 一次注入）
//   - 跨云函数实例共享计数 + 业务类型差异化配置（payment/refund 走更严阈值）
//   - 若 db 不可用则降级到内存
//
// H1（paymentService 审查）: 启用 strict 模式——注入失败时抛错而非降级
//   - 项目硬约束：paymentService 必须开启 rate-limit-bootstrap strict: true
//   - 资金类云函数若限流失效，将导致资金接口裸奔（无防御）
//   - strict=true 时若 countStore/configStore 未注入成功，抛 BootstrapError
//   - main 入口 try/catch 识别 BootstrapError 后 recordAlert('critical')
// =====================================================================

let _bootstrapFailed = false
try {
  const { db } = initCloud() as { cloud: unknown, db: unknown }
  ;(bootstrapRateLimit as (db: unknown, opts?: object) => unknown)(db, {
    logger: createLogger('paymentService.rate-limit'),
    strict: true,
    service: 'paymentService',
  })
} catch (e) {
  _bootstrapFailed = true
  // P2-002: 使用统一 logger 替代 console.warn
  logger.error('bootstrapRateLimit strict failed', { msg: (e as Error)?.message })
  // H1+M18: 持久化告警，运维主动感知
  //   注意：recordAlert 是 async，但此处模块加载阶段无法 await
  //   用 .catch 吞错避免 unhandledRejection
  if (e instanceof Error && (e as { code?: string }).code === 'RATE_LIMIT_BOOTSTRAP_FAILED') {
    recordAlert(
      'critical',
      'paymentService.rate_limit.bootstrap.failed',
      `paymentService 限流 bootstrap 失败：${e.message}`,
      { service: 'paymentService', stack: e.stack }
    ).catch((alertErr: Error) => {
      logger.error('recordAlert failed for bootstrap failure', { msg: alertErr.message })
    })
  }
}

// =====================================================================
// Main 入口
// =====================================================================

/**
 * 支付服务统一入口
 *
 * 流程：
 *   1. 若 event 是 HTTP 请求（微信支付回调）→ 直接调 paymentNotify
 *   2. 否则按 event.action 分发到对应 handler
 *   3. 对需要登录的 action 调 verifyAuth 注入 auth
 *   4. 错误统一走 handleError / toResponse 序列化
 *
 * @throws BusinessError UNKNOWN_ACTION（未知 action）
 */
export async function main(event: CloudEvent, context: CloudContext): Promise<unknown> {
  // H1: strict 模式 bootstrap 失败时，资金接口直接拒绝服务
  //   避免限流失效后资金接口裸奔
  //   paymentNotify（微信回调）也拒绝，让微信重试，等运维修复
  if (_bootstrapFailed) {
    const msg = 'paymentService rate-limit bootstrap failed, service unavailable'
    logger.error('main.blocked_by_bootstrap_failure', { action: event.action })
    if (isHttpRequest(event)) {
      // 微信回调返回 5xx，微信会重试
      return {
        statusCode: 503,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'FAIL', message: 'service_unavailable' }),
      }
    }
    return toResponse(err('SERVICE_UNAVAILABLE', msg))
  }

  // HTTP 触发（微信支付回调）走特殊分支
  if (isHttpRequest(event)) {
    return await handlers.paymentNotify(event, context, null)
  }

  const { action } = event
  if (!action) {
    throw err('UNKNOWN_ACTION', '缺少 action 参数')
  }
  if (!handlers[action]) {
    throw err('UNKNOWN_ACTION', `未知的操作：${action}`)
  }

  try {
    const requireLogin = !NO_AUTH_ACTIONS.includes(action)
    const auth: AuthLike = await verifyAuth(event, { requireLogin })
    logger.info(action, { openid: auth.openid })
    return await handlers[action](event, context, auth)
  } catch (error) {
    logger.error(action, error as Error)
    if (isBusinessError(error)) {
      return toResponse(error)
    }
    const code = Number((error as { code?: number | string }).code) || ERROR_CODES.BUSINESS
    return handleError(error as Error, (error as Error).message || '操作失败', code)
  }
}

// =====================================================================
// Runtime shim（CommonJS 兼容）
// =====================================================================

const _mod = module as { exports: Record<string, unknown> }
_mod.exports = {
  main,
  // 常量
  NO_AUTH_ACTIONS,
  SUPPORTED_ACTIONS,
  // 工具函数
  isHttpRequest,
  // 聚合 handlers（用于单元测试）
  handlers,
}
_mod.exports.default = _mod.exports

export default {
  main,
  NO_AUTH_ACTIONS,
  SUPPORTED_ACTIONS,
  isHttpRequest,
  handlers,
}
