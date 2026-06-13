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
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LOG_LEVELS = exports.getLogLevel = exports.setLogLevel = exports.createLogger = exports.logger = void 0;
/* eslint-disable no-console */
// 日志级别定义
var LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
};
exports.LOG_LEVELS = LOG_LEVELS;
// 当前日志级别（可通过环境变量配置）
var CURRENT_LOG_LEVEL = process.env.LOG_LEVEL !== undefined
    ? Number(process.env.LOG_LEVEL)
    : LOG_LEVELS.INFO;
/**
 * 格式化日志消息
 * @param service 服务名称
 * @param action 操作名称
 * @param level 日志级别
 */
function formatLogPrefix(service, action, level) {
    var timestamp = new Date().toISOString();
    return "[".concat(timestamp, "] [").concat(level, "] [").concat(service, "] [").concat(action, "]");
}
/**
 * 顶层 logger（不绑定 service，业务可直接使用）
 */
exports.logger = {
    info: function (service, action, data) {
        if (data === void 0) { data = {}; }
        if (CURRENT_LOG_LEVEL <= LOG_LEVELS.INFO) {
            var prefix = formatLogPrefix(service, action, 'INFO');
            console.log(prefix, data);
        }
    },
    debug: function (service, action, data) {
        if (data === void 0) { data = {}; }
        if (CURRENT_LOG_LEVEL <= LOG_LEVELS.DEBUG) {
            var prefix = formatLogPrefix(service, action, 'DEBUG');
            console.log(prefix, data);
        }
    },
    warn: function (service, action, data) {
        if (data === void 0) { data = {}; }
        if (CURRENT_LOG_LEVEL <= LOG_LEVELS.WARN) {
            var prefix = formatLogPrefix(service, action, 'WARN');
            console.warn(prefix, data);
        }
    },
    error: function (service, action, error) {
        if (CURRENT_LOG_LEVEL <= LOG_LEVELS.ERROR) {
            var prefix = formatLogPrefix(service, action, 'ERROR');
            var e = error;
            console.error(prefix, {
                message: e && e.message,
                name: e && e.name,
                stack: e && e.stack,
            });
        }
    },
    errorWithContext: function (service, action, error, context) {
        if (context === void 0) { context = {}; }
        if (CURRENT_LOG_LEVEL <= LOG_LEVELS.ERROR) {
            var prefix = formatLogPrefix(service, action, 'ERROR');
            var e = error;
            console.error(prefix, {
                message: e && e.message,
                name: e && e.name,
                stack: e && e.stack,
                context: context,
            });
        }
    },
    performance: function (service, action, duration, metadata) {
        if (metadata === void 0) { metadata = {}; }
        if (CURRENT_LOG_LEVEL <= LOG_LEVELS.DEBUG) {
            var prefix = formatLogPrefix(service, action, 'PERF');
            console.log(prefix, __assign({ duration: "".concat(duration, "ms") }, metadata));
        }
    },
    database: function (service, action, collection, operation, result) {
        if (result === void 0) { result = {}; }
        if (CURRENT_LOG_LEVEL <= LOG_LEVELS.DEBUG) {
            var prefix = formatLogPrefix(service, action, 'DB');
            console.log(prefix, {
                collection: collection,
                operation: operation,
                result: result,
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
        debug: function (action, ctx) { return exports.logger.debug(serviceName, action, ctx || {}); },
        info: function (action, ctx) { return exports.logger.info(serviceName, action, ctx || {}); },
        warn: function (action, ctx) { return exports.logger.warn(serviceName, action, ctx || {}); },
        error: function (action, ctx) { return exports.logger.error(serviceName, action, ctx); },
        errorWithContext: function (action, error, context) { return exports.logger.errorWithContext(serviceName, action, error, context || {}); },
        performance: function (action, duration, metadata) { return exports.logger.performance(serviceName, action, duration, metadata || {}); },
        database: function (action, collection, operation, result) { return exports.logger.database(serviceName, action, collection, operation, result || {}); },
        // TS 接口要求实现 child，JS 时代可保持简单版本
        child: function (subTag) { return createLogger("".concat(serviceName, ":").concat(subTag)); },
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
