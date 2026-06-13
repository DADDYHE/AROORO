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
      const e = error as Error
      console.error(prefix, {
        message: e && e.message,
        name: e && e.name,
        stack: e && e.stack,
      })
    }
  },

  errorWithContext: (service: string, action: string, error: Error | unknown, context: Record<string, unknown> = {}): void => {
    if (CURRENT_LOG_LEVEL <= LOG_LEVELS.ERROR) {
      const prefix = formatLogPrefix(service, action, 'ERROR')
      const e = error as Error
      console.error(prefix, {
        message: e && e.message,
        name: e && e.name,
        stack: e && e.stack,
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

export { LOG_LEVELS }
