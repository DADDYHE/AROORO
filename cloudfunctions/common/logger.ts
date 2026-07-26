/**
 * 统一日志模块（TypeScript 源文件 - Sprint 12 迁移）
 *
 * 设计目标：
 *   1. 类型化日志方法签名（避免 ctx 类型飘移）
 *   2. 保留运行时 CommonJS 兼容（编译产物 logger.js 可被 Node.js 直接 require）
 *   3. 性能优先：仅在 enabled 级别下做序列化与时间戳
 *
 * 编译方式：
 *   npm run build:common
 *   （tsc -p tsconfig.common.json + 顶部注入 /* eslint-disable *\/）
 *
 * 迁移要点：
 *   - 保留所有原 export 名称（logger / createLogger / setLogLevel / getLogLevel / LOG_LEVELS）
 *   - createLogger 工厂返回的 logger 方法签名与原 JS 保持完全一致
 *   - 仅新增类型注解，不改变运行时行为
 */

import type { Logger } from './types'

/* eslint-disable no-console */

// 日志级别定义
const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
} as const

export type LogLevelValue = typeof LOG_LEVELS[keyof typeof LOG_LEVELS]

// 当前日志级别（可通过环境变量配置）
// 添加 NaN 检查，防止配置错误时所有日志静默
let CURRENT_LOG_LEVEL: number = process.env.LOG_LEVEL !== undefined
  ? (Number(process.env.LOG_LEVEL) || LOG_LEVELS.INFO)
  : LOG_LEVELS.INFO

/**
 * 格式化日志消息
 * @param service 服务名称
 * @param action 操作名称
 * @param level 日志级别
 */
function formatLogPrefix(service: string, action: string, level: string): string {
  const timestamp = new Date().toISOString()
  return `[${timestamp}] [${level}] [${service}] [${action}]`
}

/**
 * 序列化 error / 结构化对象为日志可读对象
 *
 * Sprint 52 新增：兼容非 Error 对象
 *   - Error 实例：输出 { message, name, stack }
 *   - 普通对象：保留原对象字段（如 { type, msg } / { errMsg, errCode }）
 *   - 字符串/数字：包装为 { message }
 *   - null/undefined：返回 { message: null }
 */
function _serializeLogPayload(error: Error | unknown): Record<string, unknown> {
  if (error == null) {
    return { message: String(error) }
  }
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack,
    }
  }
  // 普通对象：保留原字段（包括 errMsg/errCode 等 CloudBase SDK 非标准字段）
  if (typeof error === 'object') {
    return error as Record<string, unknown>
  }
  // 字符串/数字/布尔
  return { message: String(error) }
}

/**
 * 顶层 logger（不绑定 service，业务可直接使用）
 */
export const logger = {
  info: (service: string, action: string, data: Record<string, unknown> = {}): void => {
    if (CURRENT_LOG_LEVEL <= LOG_LEVELS.INFO) {
      const prefix = formatLogPrefix(service, action, 'INFO')
      console.log(prefix, data)
    }
  },

  debug: (service: string, action: string, data: Record<string, unknown> = {}): void => {
    if (CURRENT_LOG_LEVEL <= LOG_LEVELS.DEBUG) {
      const prefix = formatLogPrefix(service, action, 'DEBUG')
      console.log(prefix, data)
    }
  },

  warn: (service: string, action: string, data: Record<string, unknown> = {}): void => {
    if (CURRENT_LOG_LEVEL <= LOG_LEVELS.WARN) {
      const prefix = formatLogPrefix(service, action, 'WARN')
      console.warn(prefix, data)
    }
  },

  error: (service: string, action: string, error: Error | unknown): void => {
    if (CURRENT_LOG_LEVEL <= LOG_LEVELS.ERROR) {
      const prefix = formatLogPrefix(service, action, 'ERROR')
      // Sprint 52 修复：兼容非 Error 对象（字符串/数字/CloudBase SDK 错误）
      //   - 旧实现只输出 message/name/stack，对 {errMsg} / 字符串 / null 全输出 undefined
      //   - 新实现区分 Error 实例和结构化对象，避免日志信息丢失
      console.error(prefix, _serializeLogPayload(error))
    }
  },

  errorWithContext: (service: string, action: string, error: Error | unknown, context: Record<string, unknown> = {}): void => {
    if (CURRENT_LOG_LEVEL <= LOG_LEVELS.ERROR) {
      const prefix = formatLogPrefix(service, action, 'ERROR')
      console.error(prefix, {
        ..._serializeLogPayload(error),
        context,
      })
    }
  },

  performance: (service: string, action: string, duration: number, metadata: Record<string, unknown> = {}): void => {
    if (CURRENT_LOG_LEVEL <= LOG_LEVELS.DEBUG) {
      const prefix = formatLogPrefix(service, action, 'PERF')
      console.log(prefix, {
        duration: `${duration}ms`,
        ...metadata,
      })
    }
  },

  database: (service: string, action: string, collection: string, operation: string, result: Record<string, unknown> = {}): void => {
    if (CURRENT_LOG_LEVEL <= LOG_LEVELS.DEBUG) {
      const prefix = formatLogPrefix(service, action, 'DB')
      console.log(prefix, {
        collection,
        operation,
        result,
      })
    }
  },
}

/**
 * 服务专用 logger 的扩展接口（保留向后兼容的 errorWithContext / performance / database）
 */
export interface ServiceLogger extends Logger {
  errorWithContext: (action: string, error: Error | unknown, context?: Record<string, unknown>) => void
  performance: (action: string, duration: number, metadata?: Record<string, unknown>) => void
  database: (action: string, collection: string, operation: string, result?: Record<string, unknown>) => void
  /**
   * 关键路径性能采样：按 PERF_SAMPLING_RATE 概率记录耗时，不受 LOG_LEVEL 限制。
   * 详见模块级 perfSample()。
   */
  perf: (action: string, duration: number, metadata?: Record<string, unknown>) => void
}

/**
 * 创建服务专用的日志记录器
 *
 * @example
 *   const logger = createLogger('orderService')
 *   logger.info('createOrder', { orderId })
 *   logger.error('createOrder', err)
 */
export function createLogger(serviceName: string): ServiceLogger {
  return {
    debug: (action, ctx) => logger.debug(serviceName, action, (ctx as Record<string, unknown>) || {}),
    info: (action, ctx) => logger.info(serviceName, action, (ctx as Record<string, unknown>) || {}),
    warn: (action, ctx) => logger.warn(serviceName, action, (ctx as Record<string, unknown>) || {}),
    error: (action, ctx) => logger.error(serviceName, action, ctx as Error | unknown),
    errorWithContext: (action, error, context) => logger.errorWithContext(serviceName, action, error, context || {}),
    performance: (action, duration, metadata) => logger.performance(serviceName, action, duration, metadata || {}),
    database: (action, collection, operation, result) => logger.database(serviceName, action, collection, operation, result || {}),
    // 关键路径性能采样（按 PERF_SAMPLING_RATE 概率，绕过 LOG_LEVEL）
    perf: (action, duration, metadata) => perfSample(serviceName, action, duration, metadata || {}),
    // TS 接口要求实现 child，JS 时代可保持简单版本
    child: (subTag) => createLogger(`${serviceName}:${subTag}`),
  }
}

/**
 * 设置日志级别
 * @param level - 日志级别数字（0=DEBUG, 1=INFO, 2=WARN, 3=ERROR）
 */
export function setLogLevel(level: LogLevelValue | number): void {
  CURRENT_LOG_LEVEL = level
}

/**
 * 获取当前日志级别
 */
export function getLogLevel(): number {
  return CURRENT_LOG_LEVEL
}

// =====================================================================
// 关键路径性能采样开关（F25）
// =====================================================================
// 读取环境变量 PERF_SAMPLING_RATE（0~1 的概率，默认 0 即关闭）。
// 开启后，关键路径调用 perf() 会按概率记录耗时，且不受 LOG_LEVEL 限制，
// 便于在不开启 DEBUG 的情况下对线上性能做轻量采样（不引入新依赖）。
const PERF_SAMPLING_RATE: number = (() => {
  const raw = process.env.PERF_SAMPLING_RATE
  if (raw === undefined || raw === '') return 0
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0 || n > 1) return 0
  return n
})()

/**
 * 性能采样：按 PERF_SAMPLING_RATE 概率记录关键路径耗时。
 * 采样命中时直接 console.log，绕过 LOG_LEVEL，确保线上可观测。
 *
 * @example
 *   const start = Date.now()
 *   // ... 关键路径 ...
 *   logger.perf('orderService', 'createOrder', Date.now() - start, { orderId })
 */
export function perfSample(
  service: string,
  action: string,
  duration: number,
  metadata: Record<string, unknown> = {}
): void {
  if (PERF_SAMPLING_RATE <= 0) return
  if (Math.random() < PERF_SAMPLING_RATE) {
    const prefix = formatLogPrefix(service, action, 'PERF-SAMPLE')
    console.log(prefix, {
      durationMs: duration,
      samplingRate: PERF_SAMPLING_RATE,
      ...metadata,
    })
  }
}

// =====================================================================
// 进程级终极兜底：未捕获异常 / 未处理的 Promise rejection（F25）
// =====================================================================
// 设计要点：
//   - 捕获后写结构化 FATAL 日志，绝不重新抛出、绝不主动退出进程，
//     避免云函数运行时因未处理异常被强制回收。
//   - 不依赖 DB / recordAlert（DB 不可用时无终极通道），直接 console.error
//     作为最终通道，保证即使告警库不可用也能在运行日志中看到。
//   - 由 module-level 标志守卫，确保整个进程只注册一次（避免重复监听）。
//   - 测试环境（jest / NODE_ENV=test）不安装，避免污染测试进程的异常处理。
let _globalHandlersInstalled = false

export function installGlobalExceptionHandlers(): void {
  if (_globalHandlersInstalled) return
  if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined) {
    return
  }
  _globalHandlersInstalled = true

  const writeFatal = (kind: string, err: Error | unknown): void => {
    const payload = _serializeLogPayload(err)
    const line = `[${new Date().toISOString()}] [FATAL] [${kind}] ${JSON.stringify(payload)}`
    // 终极通道：直接 console.error，不依赖 DB / recordAlert
    console.error(line)
  }

  process.on('uncaughtException', (err: Error) => writeFatal('uncaughtException', err))
  process.on('unhandledRejection', (reason: unknown) => writeFatal('unhandledRejection', reason))
}

// 统一入口：所有云函数入口均 require 本模块，模块加载时安装一次兜底监听
installGlobalExceptionHandlers()

export { LOG_LEVELS }
