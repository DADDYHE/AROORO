"use strict";
/**
 * 风控检测限流（TypeScript 源文件 - Sprint 17 新增，Sprint 21 升级为双 store）
 *
 * 目标：
 *   - 防止恶意调用 detectReviewSpam / detectRefundAbuse / 下单 / 申请 拖垮 db
 *   - 单一用户 + 单一目标 + 短时间内的多次检测请求应被拦截
 *   - 在业务层（submitEvaluation / createRefund / createOrder / ...）入口前置拦截
 *
 * 限流维度：
 *   - 全局：每用户每分钟最多 N 次检测
 *   - 目标级：每用户对同一 hostId / orderId 每分钟最多 N 次
 *
 * 双 store 模式（Sprint 21）：
 *   1. 内存 store（fallback / 性能优化）
 *   2. 全局 store（db 集合 rate_limits，跨云函数实例共享）
 *   - 默认走全局 store；若 store 未注入则降级到内存 store
 *   - 内存 store 仅作为开发/测试环境兜底
 *
 * 滑窗语义：
 *   - 用 LRU-TTL 缓存实现（与 cache.ts 配合）
 *   - 窗口内 N 次后抛 RATE_LIMITED
 *
 * 设计取舍：
 *   - 内存 map 存储滑动窗口（云函数实例维度）
 *   - 云函数并发场景下，跨实例限流借助 db 计数（rate-limit-store.ts）
 *   - 限流本身有 best-effort 语义：被绕过不应导致业务异常
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.common.json
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.initGlobalRateLimitFromDb = exports.getStoreStats = exports._resetStore = exports.withRateLimit = exports.peekGlobalRateLimitWithFallback = exports.consumeGlobalRateLimitWithFallback = exports.consumeRateLimit = exports.peekRateLimit = exports.getGlobalRateLimitStore = exports.setGlobalRateLimitStore = exports.DEFAULT_RISK_RATE_LIMIT_CONFIG = void 0;
const errors_1 = require("./errors");
const rate_limit_store_1 = require("./rate-limit-store");
// ===== 默认配置 =====
exports.DEFAULT_RISK_RATE_LIMIT_CONFIG = Object.freeze({
    perUserPerMinute: 10, // 每用户每分钟 10 次全局检测
    perUserPerTargetPerMinute: 5, // 每用户对同一目标 5 次
    windowMs: 60 * 1000, // 1 分钟
});
// ===== 内存存储 =====
const _store = {
    global: new Map(),
    target: new Map(),
    lastCleanup: 0,
};
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 分钟清理一次
// ===== 全局存储（可选）=====
/**
 * 全局限流存储句柄（可选）
 *
 * 用法（在云函数入口注入）：
 *   const { db } = require('./common/cloudbase')
 *   const { setGlobalRateLimitStore } = require('./common/risk-rate-limit')
 *   setGlobalRateLimitStore({
 *     collection: db.collection('rate_limits'),
 *     command: db.command,
 *   })
 */
let _globalStore = null;
function setGlobalRateLimitStore(store) {
    _globalStore = store;
}
exports.setGlobalRateLimitStore = setGlobalRateLimitStore;
function getGlobalRateLimitStore() {
    return _globalStore;
}
exports.getGlobalRateLimitStore = getGlobalRateLimitStore;
/**
 * 滑动窗口清理
 */
function cleanup(store, windowMs, now) {
    if (now - store.lastCleanup < CLEANUP_INTERVAL_MS) {
        return;
    }
    const cutoff = now - windowMs;
    for (const [key, arr] of store.global) {
        const filtered = arr.filter(t => t > cutoff);
        if (filtered.length === 0) {
            store.global.delete(key);
        }
        else {
            store.global.set(key, filtered);
        }
    }
    for (const [key, arr] of store.target) {
        const filtered = arr.filter(t => t > cutoff);
        if (filtered.length === 0) {
            store.target.delete(key);
        }
        else {
            store.target.set(key, filtered);
        }
    }
    store.lastCleanup = now;
}
// ===== 内存版限流（fallback）=====
/**
 * 检查是否允许（不消费配额）
 */
function peekRateLimit(input, config = exports.DEFAULT_RISK_RATE_LIMIT_CONFIG, store = _store) {
    const now = input.now ?? Date.now();
    cleanup(store, config.windowMs, now);
    const cutoff = now - config.windowMs;
    const globalKey = `${input.userId}|${input.type}`;
    const globalArr = (store.global.get(globalKey) || []).filter(t => t > cutoff);
    let allowed = globalArr.length < config.perUserPerMinute;
    let remaining = config.perUserPerMinute - globalArr.length;
    let reason;
    if (!allowed) {
        reason = `RATE_LIMIT_GLOBAL:${input.userId}:${config.perUserPerMinute}/${config.windowMs / 1000}s`;
    }
    else if (input.targetId) {
        const targetKey = `${input.userId}|${input.type}|${input.targetId}`;
        const targetArr = (store.target.get(targetKey) || []).filter(t => t > cutoff);
        if (targetArr.length >= config.perUserPerTargetPerMinute) {
            allowed = false;
            remaining = 0;
            reason = `RATE_LIMIT_TARGET:${input.targetId}:${config.perUserPerTargetPerMinute}/${config.windowMs / 1000}s`;
        }
        else {
            remaining = Math.min(remaining, config.perUserPerTargetPerMinute - targetArr.length);
        }
    }
    return {
        allowed,
        remaining: Math.max(0, remaining),
        resetAt: globalArr.length > 0 ? globalArr[0] + config.windowMs : now + config.windowMs,
        reason,
    };
}
exports.peekRateLimit = peekRateLimit;
/**
 * 消费配额：允许则记录，不允许抛错
 *
 * 抛错类型：
 *   - RATE_LIMITED（已注册的业务错误码）
 *
 * @throws BusinessError
 */
function consumeRateLimit(input, config = exports.DEFAULT_RISK_RATE_LIMIT_CONFIG, store = _store) {
    const result = peekRateLimit(input, config, store);
    if (!result.allowed) {
        throw (0, errors_1.err)('RATE_LIMITED', result.reason || '检测请求过于频繁', {
            remaining: result.remaining,
            resetAt: result.resetAt,
        });
    }
    // 消费配额
    const now = input.now ?? Date.now();
    const globalKey = `${input.userId}|${input.type}`;
    const globalArr = store.global.get(globalKey) || [];
    globalArr.push(now);
    store.global.set(globalKey, globalArr);
    if (input.targetId) {
        const targetKey = `${input.userId}|${input.type}|${input.targetId}`;
        const targetArr = store.target.get(targetKey) || [];
        targetArr.push(now);
        store.target.set(targetKey, targetArr);
    }
    return result;
}
exports.consumeRateLimit = consumeRateLimit;
// ===== 全局版限流（推荐）=====
/**
 * 通过全局 db 限流（带内存兜底）
 *
 * 流程：
 *   1. 优先调用 rate-limit-store 的 consumeGlobalRateLimit（原子计数）
 *   2. 若全局 store 未配置 / db 失败 → 降级到内存 consumeRateLimit
 *
 * @throws BusinessError RATE_LIMITED / INTERNAL_ERROR
 */
async function consumeGlobalRateLimitWithFallback(input, config = exports.DEFAULT_RISK_RATE_LIMIT_CONFIG) {
    if (_globalStore) {
        try {
            const globalResult = await (0, rate_limit_store_1.consumeGlobalRateLimit)({
                userId: input.userId,
                type: input.type,
                targetId: input.targetId,
                windowMs: config.windowMs,
                limit: config.perUserPerMinute,
                now: input.now,
            }, _globalStore);
            if (!globalResult.allowed) {
                const reason = `RATE_LIMIT_${globalResult.scope.toUpperCase()}:${input.userId}:${config.perUserPerMinute}/${config.windowMs / 1000}s`;
                throw (0, errors_1.err)('RATE_LIMITED', reason, {
                    remaining: 0,
                    resetAt: globalResult.resetAt,
                });
            }
            return {
                allowed: true,
                remaining: globalResult.remaining,
                resetAt: globalResult.resetAt,
            };
        }
        catch (e) {
            // 已经是业务错误则透传
            if (e && e.code === 'RATE_LIMITED') {
                throw e;
            }
            // 其他错误（db 不可用等）降级到内存
            // eslint-disable-next-line no-console
            console.warn('[risk-rate-limit] global store failed, fallback to memory:', e && e.message);
        }
    }
    // 降级到内存
    return consumeRateLimit(input, config);
}
exports.consumeGlobalRateLimitWithFallback = consumeGlobalRateLimitWithFallback;
/**
 * 全局版 peek（只查不消费）
 */
async function peekGlobalRateLimitWithFallback(input, config = exports.DEFAULT_RISK_RATE_LIMIT_CONFIG) {
    if (_globalStore) {
        const r = await (0, rate_limit_store_1.peekGlobalRateLimit)({
            userId: input.userId,
            type: input.type,
            targetId: input.targetId,
            windowMs: config.windowMs,
            limit: config.perUserPerMinute,
            now: input.now,
        }, _globalStore);
        if (r) {
            return {
                allowed: r.allowed,
                remaining: r.remaining,
                resetAt: r.resetAt,
            };
        }
    }
    // 降级到内存
    return peekRateLimit(input, config);
}
exports.peekGlobalRateLimitWithFallback = peekGlobalRateLimitWithFallback;
// ===== 包裹函数 =====
/**
 * 在限流保护下执行风控检测
 *
 * 用法：
 *   const risk = await withRateLimit({ userId, type: 'evaluation' }, () =>
 *     detectReviewSpam(ctx)
 *   )
 *
 * @throws BusinessError RATE_LIMITED
 */
async function withRateLimit(input, fn, config, store) {
    // Sprint 21: 优先全局 store（带降级）
    if (_globalStore) {
        await consumeGlobalRateLimitWithFallback(input, config);
        return await fn();
    }
    // 内存版（向后兼容）
    consumeRateLimit(input, config, store);
    return await fn();
}
exports.withRateLimit = withRateLimit;
// ===== 工具 =====
/**
 * 重置 store（仅测试用）
 */
function _resetStore(store = _store) {
    store.global.clear();
    store.target.clear();
    store.lastCleanup = 0;
}
exports._resetStore = _resetStore;
/**
 * 获取 store 统计（监控 / 调试）
 */
function getStoreStats(store = _store) {
    return {
        globalKeys: store.global.size,
        targetKeys: store.target.size,
        lastCleanup: store.lastCleanup,
    };
}
exports.getStoreStats = getStoreStats;
// ===== 工具：从 db 实例快速注入 =====
/**
 * 从 cloudbase db 实例快速注入全局限流存储
 *
 * 用法：
 *   const cloudbase = require('wx-server-sdk')
 *   cloudbase.init({ env: cloudbase.DYNAMIC_CURRENT_ENV })
 *   const db = cloudbase.database()
 *   initGlobalRateLimitFromDb(db, { collectionName: 'rate_limits' })
 *
 * 若 db 未传或方法不可用，则保持 null（降级到内存模式）
 */
function initGlobalRateLimitFromDb(db, options = {}) {
    if (!db) {
        return false;
    }
    try {
        const coll = db.collection(options.collectionName || 'rate_limits');
        const command = options.command || (db.command);
        setGlobalRateLimitStore({ collection: coll, command, collectionName: options.collectionName });
        return true;
    }
    catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[risk-rate-limit] init from db failed:', e && e.message);
        return false;
    }
}
exports.initGlobalRateLimitFromDb = initGlobalRateLimitFromDb;
// 默认导出（保持 CommonJS 兼容）
exports.default = {
    DEFAULT_RISK_RATE_LIMIT_CONFIG: exports.DEFAULT_RISK_RATE_LIMIT_CONFIG,
    peekRateLimit,
    consumeRateLimit,
    withRateLimit,
    consumeGlobalRateLimitWithFallback,
    peekGlobalRateLimitWithFallback,
    setGlobalRateLimitStore,
    getGlobalRateLimitStore,
    initGlobalRateLimitFromDb,
    _resetStore,
    getStoreStats,
};
