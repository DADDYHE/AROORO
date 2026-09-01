"use strict";
/**
 * orderService/index.ts - 订单服务统一入口（TypeScript 源文件 - Sprint 47 迁移）
 *
 * 业务功能（聚合 orders + stats 两个 service）：
 *   - orders 子服务（15 个 handler）：
 *     getOrders / createOrder / updateOrderStatus / cancelOrder / getOrderDetail /
 *     getActivityOrders / getActivityOrderDetail / calculatePrice / checkDateAvailability /
 *     getBoardingOrders / getBoardingOrderDetail / handleBoardingOrder / submitEvaluation /
 *     getHostEvaluations / enrichOrders
 *   - stats 子服务（2 个 handler）：
 *     getStats / getIncomeStats
 *
 * 入口分发：
 *   - 所有 action 都需要登录（verifyAuth with requireLogin=true）
 *   - 按 event.action 分发到对应 handler
 *
 * 关键设计：
 *   - 鉴权：所有 handler 都需 auth（calculatePrice / checkDateAvailability / getHostEvaluations
 *     在 orders.ts 内部也走 auth，但通过 _isHttpAuth 兼容公开访问）
 *   - 错误：err() 工厂 + handleError / toResponse 统一响应
 *   - 业务错误：isBusinessError 类型守卫
 *   - 限流：Sprint 21 注入 initGlobalRateLimitFromDb
 *
 * 迁移目标：
 *   - 强类型化 17 个 handler + CloudEvent / CloudContext / AuthLike
 *   - 抽离 SUPPORTED_ACTIONS 常量 + handlers 聚合逻辑
 *   - 编译产物（index.js）继续被云函数 runtime require
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.orderService.json
 *   （运行时仍消费 .js 编译产物）
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = exports.handlers = exports.PUBLIC_ACTIONS = exports.SUPPORTED_ACTIONS = void 0;
// Sprint 47 迁移说明：
//   - 仍消费 .js 编译产物（tsc 输出到 cloudfunctions/orderService/index.js）
//   - 对 .js 文件（utils / errors / logger / auth-middleware / risk-rate-limit）使用 require() 而非 import
//   - 强类型作用于 common/* 与本文件内部接口
//   - 不直接依赖 orders.ts / stats.ts 的子模块（依赖 .js 编译产物，避免 tsconfig include 串扰）
const utils_1 = require("./common/utils");
const logger_1 = require("./common/logger");
const errors_1 = require("./common/errors");
// service 内部 .js 模块走 CommonJS require
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { verifyAuth } = require('./common/auth-middleware');
// Sprint 50: 限流统一 bootstrap（rate_limits + rate_limit_configs 一次注入）
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { bootstrapRateLimit } = require("./common/rate-limit-bootstrap");
// =====================================================================
// 常量
// =====================================================================
/** 支持的 action 集合（用于 fail-fast 校验） */
exports.SUPPORTED_ACTIONS = [
    // orders 子服务（15 个）
    'getOrders',
    'createOrder',
    'updateOrderStatus',
    'cancelOrder',
    'getOrderDetail',
    'getActivityOrders',
    'getActivityOrderDetail',
    'calculatePrice',
    'checkDateAvailability',
    'getBoardingOrders',
    'getBoardingOrderDetail',
    'handleBoardingOrder',
    'submitEvaluation',
    'getHostEvaluations',
    'enrichOrders',
    // stats 子服务（2 个）
    'getStats',
    'getIncomeStats',
];
/**
 * 公开访问的 action 白名单（无需登录）
 *
 * P1 修复（H9）：原 index.ts 对所有 action 强制 requireLogin=true，但 orders.ts 注释
 *   说 calculatePrice / checkDateAvailability / getHostEvaluations 是公开访问。
 *   现抽出白名单，命中时跳过 verifyAuth，传 auth=null 给 handler。
 *   - calculatePrice：未登录用户可试算价格
 *   - checkDateAvailability：未登录用户可查询日期可用性
 *   - getHostEvaluations：未登录用户可查看寄养家庭评价（用于公开页面）
 */
exports.PUBLIC_ACTIONS = new Set([
    'calculatePrice',
    'checkDateAvailability',
    'getHostEvaluations',
]);
// =====================================================================
// 模块初始化
// =====================================================================
const logger = (0, logger_1.createLogger)('orderService');
// L10 修复：日志脱敏，避免 PII（手机号 / openid / outTradeNo 等）进入日志系统
const SENSITIVE_LOG_KEYS = ['phone', 'mobile', 'openid', 'outtradeno', 'idcard', 'email', 'address', 'id_card'];
function maskOpenid(openid) {
    if (!openid)
        return '(unknown)';
    return openid.length > 4 ? `${openid.slice(0, 4)}***` : '***';
}
function maskSensitive(value, depth = 0) {
    if (depth > 4)
        return '***';
    if (Array.isArray(value))
        return value.map(v => maskSensitive(v, depth + 1));
    if (value && typeof value === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(value)) {
            if (SENSITIVE_LOG_KEYS.includes(k.toLowerCase())) {
                out[k] = typeof v === 'string' && v.length > 2 ? `${v.slice(0, 2)}***` : '***';
            }
            else {
                out[k] = maskSensitive(v, depth + 1);
            }
        }
        return out;
    }
    return value;
}
function toSafeLogPayload(error) {
    const e = error;
    const payload = { msg: e?.message || String(error) };
    if (e?.code !== undefined)
        payload.code = e.code;
    if (e?.details !== undefined)
        payload.details = maskSensitive(e.details);
    return payload;
}
// =====================================================================
// 子服务 handlers 聚合
// =====================================================================
// eslint-disable-next-line @typescript-eslint/no-var-requires
const orderHandlers = require('./orders');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const statsHandlers = require('./stats');
/** 聚合后的 handlers（与原 index.js 字段顺序保持一致） */
exports.handlers = {
    // orders 子服务
    getOrders: orderHandlers.getOrders,
    createOrder: orderHandlers.createOrder,
    updateOrderStatus: orderHandlers.updateOrderStatus,
    cancelOrder: orderHandlers.cancelOrder,
    getOrderDetail: orderHandlers.getOrderDetail,
    getActivityOrders: orderHandlers.getActivityOrders,
    getActivityOrderDetail: orderHandlers.getActivityOrderDetail,
    calculatePrice: orderHandlers.calculatePrice,
    checkDateAvailability: orderHandlers.checkDateAvailability,
    getBoardingOrders: orderHandlers.getBoardingOrders,
    getBoardingOrderDetail: orderHandlers.getBoardingOrderDetail,
    handleBoardingOrder: orderHandlers.handleBoardingOrder,
    submitEvaluation: orderHandlers.submitEvaluation,
    getHostEvaluations: orderHandlers.getHostEvaluations,
    enrichOrders: orderHandlers.enrichOrders,
    // stats 子服务
    getStats: statsHandlers.getStats,
    getIncomeStats: statsHandlers.getIncomeStats,
};
// =====================================================================
// Sprint 50: 限流统一 bootstrap（rate_limits + rate_limit_configs 一次注入）
//   - 跨云函数实例共享计数 + 业务类型差异化配置
//   - 若 db 不可用则降级到内存（bootstrapRateLimit 内部 try/catch）
// P2 修复（M12）：加 5 分钟内存缓存，避免每次冷启动都查 db（rate_limits + rate_limit_configs）
//   - 单实例内复用：5 分钟内只查一次 db
//   - 跨实例不共享：每个新实例冷启动时若缓存过期才重新查
// =====================================================================
const RATE_LIMIT_BOOTSTRAP_TTL_MS = 5 * 60 * 1000; // 5 分钟
const RATE_LIMIT_BOOTSTRAP_KEY = '__rateLimitBootstrapAt';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _globalCache = globalThis;
const lastBootstrapAt = _globalCache[RATE_LIMIT_BOOTSTRAP_KEY] || 0;
const cacheValid = lastBootstrapAt && (Date.now() - lastBootstrapAt < RATE_LIMIT_BOOTSTRAP_TTL_MS);
if (!cacheValid) {
    try {
        const { db } = (0, utils_1.initCloud)();
        bootstrapRateLimit(db, { logger });
        _globalCache[RATE_LIMIT_BOOTSTRAP_KEY] = Date.now();
    }
    catch (e) {
        logger.warn('bootstrapRateLimit failed, fallback to memory:', { msg: e?.message });
    }
}
// =====================================================================
// Main 入口
// =====================================================================
/**
 * 订单服务统一入口
 *
 * 流程：
 *   1. 校验 event.action 非空且在 SUPPORTED_ACTIONS 中
 *   2. 调 verifyAuth 注入 auth（公开 action 跳过；其他 action 需登录）
 *   3. 按 action 分发到对应 handler
 *   4. 错误统一走 handleError / toResponse 序列化
 *
 * @throws BusinessError UNKNOWN_ACTION（缺少或未知 action）
 */
async function main(event, context) {
    const { action } = event;
    if (!action) {
        throw (0, errors_1.err)('UNKNOWN_ACTION', '缺少 action 参数');
    }
    // L1 修复：SUPPORTED_ACTIONS 作为权威白名单做真正的 fail-fast 校验
    if (!exports.SUPPORTED_ACTIONS.includes(action)) {
        throw (0, errors_1.err)('UNKNOWN_ACTION', `未知的操作：${action}`);
    }
    const handler = exports.handlers[action];
    try {
        // P1 修复（H9）：公开 action 跳过 verifyAuth，传 auth=null 给 handler
        //   - calculatePrice / checkDateAvailability / getHostEvaluations
        //   - 其他 action 仍要求登录
        if (exports.PUBLIC_ACTIONS.has(action)) {
            logger.info(action, { openid: '(public)' });
            return await handler(event, context, null);
        }
        const requireLogin = true;
        const auth = await verifyAuth(event, { requireLogin });
        logger.info(action, { openid: maskOpenid(auth.openid) });
        return await handler(event, context, auth);
    }
    catch (error) {
        // L10 修复：错误日志脱敏，避免 PII 进入日志系统
        logger.error(action, toSafeLogPayload(error));
        if ((0, errors_1.isBusinessError)(error)) {
            return (0, errors_1.toResponse)(error);
        }
        const code = Number(error.code) || utils_1.ERROR_CODES.BUSINESS;
        return (0, utils_1.handleError)(error, error.message || '操作失败', code);
    }
}
exports.main = main;
// =====================================================================
// Runtime shim（CommonJS 兼容）
// =====================================================================
const _mod = module;
_mod.exports = {
    main,
    // 常量
    SUPPORTED_ACTIONS: exports.SUPPORTED_ACTIONS,
    PUBLIC_ACTIONS: exports.PUBLIC_ACTIONS,
    // 聚合 handlers（用于单元测试）
    handlers: exports.handlers,
};
_mod.exports.default = _mod.exports;
exports.default = {
    main,
    SUPPORTED_ACTIONS: exports.SUPPORTED_ACTIONS,
    PUBLIC_ACTIONS: exports.PUBLIC_ACTIONS,
    handlers: exports.handlers,
};
