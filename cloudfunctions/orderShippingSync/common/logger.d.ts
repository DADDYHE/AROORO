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
import type { Logger } from './types';
declare const LOG_LEVELS: {
    readonly DEBUG: 0;
    readonly INFO: 1;
    readonly WARN: 2;
    readonly ERROR: 3;
};
export type LogLevelValue = typeof LOG_LEVELS[keyof typeof LOG_LEVELS];
/**
 * 顶层 logger（不绑定 service，业务可直接使用）
 */
export declare const logger: {
    info: (service: string, action: string, data?: Record<string, unknown>) => void;
    debug: (service: string, action: string, data?: Record<string, unknown>) => void;
    warn: (service: string, action: string, data?: Record<string, unknown>) => void;
    error: (service: string, action: string, error: Error | unknown) => void;
    errorWithContext: (service: string, action: string, error: Error | unknown, context?: Record<string, unknown>) => void;
    performance: (service: string, action: string, duration: number, metadata?: Record<string, unknown>) => void;
    database: (service: string, action: string, collection: string, operation: string, result?: Record<string, unknown>) => void;
};
/**
 * 服务专用 logger 的扩展接口（保留向后兼容的 errorWithContext / performance / database）
 */
export interface ServiceLogger extends Logger {
    errorWithContext: (action: string, error: Error | unknown, context?: Record<string, unknown>) => void;
    performance: (action: string, duration: number, metadata?: Record<string, unknown>) => void;
    database: (action: string, collection: string, operation: string, result?: Record<string, unknown>) => void;
    /**
     * 关键路径性能采样：按 PERF_SAMPLING_RATE 概率记录耗时，不受 LOG_LEVEL 限制。
     * 详见模块级 perfSample()。
     */
    perf: (action: string, duration: number, metadata?: Record<string, unknown>) => void;
}
/**
 * 创建服务专用的日志记录器
 *
 * @example
 *   const logger = createLogger('orderService')
 *   logger.info('createOrder', { orderId })
 *   logger.error('createOrder', err)
 */
export declare function createLogger(serviceName: string): ServiceLogger;
/**
 * 设置日志级别
 * @param level - 日志级别数字（0=DEBUG, 1=INFO, 2=WARN, 3=ERROR）
 */
export declare function setLogLevel(level: LogLevelValue | number): void;
/**
 * 获取当前日志级别
 */
export declare function getLogLevel(): number;
/**
 * 性能采样：按 PERF_SAMPLING_RATE 概率记录关键路径耗时。
 * 采样命中时直接 console.log，绕过 LOG_LEVEL，确保线上可观测。
 *
 * @example
 *   const start = Date.now()
 *   // ... 关键路径 ...
 *   logger.perf('orderService', 'createOrder', Date.now() - start, { orderId })
 */
export declare function perfSample(service: string, action: string, duration: number, metadata?: Record<string, unknown>): void;
export declare function installGlobalExceptionHandlers(): void;
export { LOG_LEVELS };
