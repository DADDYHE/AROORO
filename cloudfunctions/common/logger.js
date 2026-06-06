"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.LOG_LEVELS = exports.getLogLevel = exports.setLogLevel = exports.createLogger = exports.logger = void 0;
/* eslint-disable no-console */
// 日志级别定义
const LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
};
exports.LOG_LEVELS = LOG_LEVELS;
// 当前日志级别（可通过环境变量配置）
let CURRENT_LOG_LEVEL = process.env.LOG_LEVEL !== undefined
    ? Number(process.env.LOG_LEVEL)
    : LOG_LEVELS.INFO;
/**
 * 格式化日志消息
 * @param service 服务名称
 * @param action 操作名称
 * @param level 日志级别
 */
function formatLogPrefix(service, action, level) {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level}] [${service}] [${action}]`;
}
/**
 * 顶层 logger（不绑定 service，业务可直接使用）
 */
exports.logger = {
    info: (service, action, data = {}) => {
        if (CURRENT_LOG_LEVEL <= LOG_LEVELS.INFO) {
            const prefix = formatLogPrefix(service, action, 'INFO');
            console.log(prefix, data);
        }
    },
    debug: (service, action, data = {}) => {
        if (CURRENT_LOG_LEVEL <= LOG_LEVELS.DEBUG) {
            const prefix = formatLogPrefix(service, action, 'DEBUG');
            console.log(prefix, data);
        }
    },
    warn: (service, action, data = {}) => {
        if (CURRENT_LOG_LEVEL <= LOG_LEVELS.WARN) {
            const prefix = formatLogPrefix(service, action, 'WARN');
            console.warn(prefix, data);
        }
    },
    error: (service, action, error) => {
        if (CURRENT_LOG_LEVEL <= LOG_LEVELS.ERROR) {
            const prefix = formatLogPrefix(service, action, 'ERROR');
            const e = error;
            console.error(prefix, {
                message: e && e.message,
                name: e && e.name,
                stack: e && e.stack,
            });
        }
    },
    errorWithContext: (service, action, error, context = {}) => {
        if (CURRENT_LOG_LEVEL <= LOG_LEVELS.ERROR) {
            const prefix = formatLogPrefix(service, action, 'ERROR');
            const e = error;
            console.error(prefix, {
                message: e && e.message,
                name: e && e.name,
                stack: e && e.stack,
                context,
            });
        }
    },
    performance: (service, action, duration, metadata = {}) => {
        if (CURRENT_LOG_LEVEL <= LOG_LEVELS.DEBUG) {
            const prefix = formatLogPrefix(service, action, 'PERF');
            console.log(prefix, {
                duration: `${duration}ms`,
                ...metadata,
            });
        }
    },
    database: (service, action, collection, operation, result = {}) => {
        if (CURRENT_LOG_LEVEL <= LOG_LEVELS.DEBUG) {
            const prefix = formatLogPrefix(service, action, 'DB');
            console.log(prefix, {
                collection,
                operation,
                result,
            });
        }
    },
};
/**
 * 创建服务专用的日志记录器
 *
 * @example
 *   const logger = createLogger('orderService')
 *   logger.info('createOrder', { orderId })
 *   logger.error('createOrder', err)
 */
function createLogger(serviceName) {
    return {
        debug: (action, ctx) => exports.logger.debug(serviceName, action, ctx || {}),
        info: (action, ctx) => exports.logger.info(serviceName, action, ctx || {}),
        warn: (action, ctx) => exports.logger.warn(serviceName, action, ctx || {}),
        error: (action, ctx) => exports.logger.error(serviceName, action, ctx),
        errorWithContext: (action, error, context) => exports.logger.errorWithContext(serviceName, action, error, context || {}),
        performance: (action, duration, metadata) => exports.logger.performance(serviceName, action, duration, metadata || {}),
        database: (action, collection, operation, result) => exports.logger.database(serviceName, action, collection, operation, result || {}),
        // TS 接口要求实现 child，JS 时代可保持简单版本
        child: (subTag) => createLogger(`${serviceName}:${subTag}`),
    };
}
exports.createLogger = createLogger;
/**
 * 设置日志级别
 * @param level - 日志级别数字（0=DEBUG, 1=INFO, 2=WARN, 3=ERROR）
 */
function setLogLevel(level) {
    CURRENT_LOG_LEVEL = level;
}
exports.setLogLevel = setLogLevel;
/**
 * 获取当前日志级别
 */
function getLogLevel() {
    return CURRENT_LOG_LEVEL;
}
exports.getLogLevel = getLogLevel;
