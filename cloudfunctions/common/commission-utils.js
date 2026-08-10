"use strict";
/**
 * common/commission-utils.ts - 全局唯一佣金写入器（Single Source of Truth）
 *
 * 业务功能：
 *   - createCommissionRecord：订单支付/完成后创建佣金记录（best-effort）
 *     1) 规范化 orderType（order/hosting → boarding，group_buy → tuan）
 *     2) 查询订单买家（users._id = openid）→ 邀请人（inviterId）
 *     3) 解析佣金率：admins[inviterId].commissionRates → system_config.commission_rates
 *        ⭐ 支持费率键别名（boarding ↔ hosting ↔ order），修复寄养佣金恒为 0 的 P0
 *     4) 按 orderType 路由金额字段（activity=finalAmount / feeding=totalAmount / 其余 totalPrice）
 *     5) 幂等：确定性 _id + 先查后写 + 唯一索引冲突优雅恢复
 *     6) 写入 commissions 集合，失败落 alerts
 *   - cancelCommissionRecord：订单取消/退款时把 pending 佣金置为 cancelled
 *
 * 统一说明（2026-08-02 写入器合并）：
 *   - 本模块是**唯一**佣金写入实现；
 *     paymentService/services/commission.ts 与 activityService 本地实现均委托到此
 *   - 各云函数通过 require('./common/commission-utils') 调用（common 自包含约定）
 *   - 所有异常都被吞掉（best-effort），仅记录日志 + 告警，不影响主业务
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.common.json
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.cancelCommissionRecord = exports.createCommissionRecord = exports.isDuplicateKeyError = exports.buildCommissionId = exports.resolveOrderAmount = exports.pickRate = exports.normalizeOrderType = exports.AMOUNT_FIELD_BY_TYPE = exports.RATE_KEY_ALIASES = exports.ORDER_TYPE_CANONICAL = void 0;
const utils_1 = require("./utils");
const logger_1 = require("./logger");
// =====================================================================
// 常量表（订单类型 / 费率键 / 金额字段）
// =====================================================================
/**
 * 订单类型规范化表
 *   历史上同一业务有多种写法：寄养=order/hosting/boarding，团购=tuan/group_buy
 *   统一收敛后写入 commissions.orderType，保证读侧（wallet/partner）口径一致
 */
exports.ORDER_TYPE_CANONICAL = {
    order: 'boarding',
    hosting: 'boarding',
    boarding: 'boarding',
    mall: 'mall',
    tuan: 'tuan',
    group_buy: 'tuan',
    activity: 'activity',
    feeding: 'feeding',
};
/**
 * ⭐ P0 修复：费率键别名表
 *   线上 system_config.commission_rates 与 admins.commissionRates 的寄养键名是 `hosting`，
 *   而写入器一直用 `rates['boarding']` 查询 → undefined → rate=0 → 永不建佣。
 *   这里按候选顺序依次查找，任一命中且 > 0 即采用。
 */
exports.RATE_KEY_ALIASES = {
    boarding: ['boarding', 'hosting', 'order'],
    mall: ['mall'],
    tuan: ['tuan', 'group_buy'],
    activity: ['activity'],
    feeding: ['feeding'],
};
/**
 * 金额字段路由表（按优先级取第一个 > 0 的字段）
 *   - 首选字段与 paymentService/pay.ts 的 ORDER_TYPE_AMOUNT_FIELD 对齐：
 *     activity=finalAmount（优惠后实付）、feeding=totalAmount、其余=totalPrice
 *   - P2-1: mall/tuan 加 paidAmount 为首选（支付成功回调写入的实付金额，
 *     用券订单 totalPrice/totalAmount 是原价，佣金应按实付计提）
 *   - 次选字段保留各业务历史写法（如 activity 镜像单可能只有 totalAmount），
 *     避免写入器统一后金额口径发生漂移
 */
exports.AMOUNT_FIELD_BY_TYPE = {
    boarding: ['totalPrice', 'totalAmount'],
    mall: ['paidAmount', 'totalPrice'],
    tuan: ['paidAmount', 'totalPrice', 'totalAmount'],
    activity: ['finalAmount', 'totalAmount', 'totalPrice'],
    feeding: ['totalAmount', 'totalPrice'],
};
/** 主字段缺失时的兼容回退链（历史订单字段不规范） */
const AMOUNT_FALLBACK_FIELDS = ['totalPrice', 'totalAmount', 'finalAmount', 'basicPrice'];
/** 项目硬约束：佣金计算的最低订单金额为 ¥1 */
const MIN_ORDER_AMOUNT = 1;
/** system_config 缓存 TTL（避免高并发回调反复读配置） */
const CONFIG_CACHE_TTL_MS = 5 * 60 * 1000;
// =====================================================================
// 模块初始化
// =====================================================================
const { db } = (0, utils_1.initCloud)();
const logger = (0, logger_1.createLogger)('commission-utils');
// =====================================================================
// 内部辅助
// =====================================================================
/** 规范化订单类型（未知类型原样返回，便于排查） */
function normalizeOrderType(orderType) {
    return exports.ORDER_TYPE_CANONICAL[String(orderType)] || String(orderType);
}
exports.normalizeOrderType = normalizeOrderType;
let _cachedConfig = null;
/** 读取系统佣金率配置（带 5 分钟缓存，失败回退旧缓存） */
async function loadCommissionConfig(dbInstance) {
    if (_cachedConfig && _cachedConfig.expiresAt > Date.now()) {
        return _cachedConfig.data;
    }
    try {
        const configRes = await dbInstance.collection('system_config').doc('commission_rates').get();
        const data = (configRes.data || {});
        _cachedConfig = { data, expiresAt: Date.now() + CONFIG_CACHE_TTL_MS };
        return data;
    }
    catch (e) {
        logger.warn('loadCommissionConfig: 读取 system_config 失败', { msg: e?.message });
        return _cachedConfig ? _cachedConfig.data : {};
    }
}
/** 查询用户档案（买家 / 邀请人共用，users._id = openid） */
async function loadUser(dbInstance, userId, scene) {
    try {
        const res = await dbInstance.collection('users').doc(userId).get();
        return (res.data || null);
    }
    catch (e) {
        logger.warn('loadUser: 查询用户失败', { scene, userId, msg: e?.message });
        return null;
    }
}
/**
 * 从费率来源中按别名候选顺序取费率
 * @param source admins.commissionRates 或 system_config.commission_rates
 * @param canonicalType 规范化后的订单类型
 * @param rawType 调用方传入的原始类型（优先命中）
 */
function pickRate(source, canonicalType, rawType) {
    if (!source) {
        return 0;
    }
    const candidates = [rawType, ...(exports.RATE_KEY_ALIASES[canonicalType] || [canonicalType])];
    for (const key of candidates) {
        if (!key) {
            continue;
        }
        const raw = source[key];
        if (raw === undefined || raw === null) {
            continue;
        }
        const value = Number(raw);
        if (Number.isFinite(value) && value > 0) {
            return value;
        }
    }
    return 0;
}
exports.pickRate = pickRate;
/** 按 orderType 路由金额字段（优先级列表），全部无效时走通用兼容回退链 */
function resolveOrderAmount(order, canonicalType) {
    const fields = [...(exports.AMOUNT_FIELD_BY_TYPE[canonicalType] || []), ...AMOUNT_FALLBACK_FIELDS];
    for (const field of fields) {
        const value = Number(order[field]);
        if (Number.isFinite(value) && value > 0) {
            return value;
        }
    }
    return 0;
}
exports.resolveOrderAmount = resolveOrderAmount;
/** 幂等预检（配合唯一索引 idx_orderId_inviterId 双保险） */
async function hasExistingCommission(dbInstance, orderId, inviterId) {
    try {
        const existRes = await dbInstance.collection('commissions')
            .where({ orderId, inviterId })
            .count();
        return existRes.total > 0;
    }
    catch (e) {
        logger.warn('hasExistingCommission: 幂等检查失败', { orderId, inviterId, msg: e?.message });
        return false;
    }
}
/**
 * 确定性 _id（同一订单 + 同一邀请人恒定），并发下由 _id 冲突兜底去重
 *   仅保留 [A-Za-z0-9_-]，避免非法 _id 字符；长度上限 120
 */
function buildCommissionId(orderId, inviterId) {
    const raw = `commission_${orderId}_${inviterId}`.replace(/[^A-Za-z0-9_-]/g, '');
    return raw.length > 120 ? raw.slice(0, 120) : raw;
}
exports.buildCommissionId = buildCommissionId;
/**
 * 检测唯一约束 / 主键冲突（CloudBase -502019、MongoDB 11000）
 *   并发双写时视为"已存在"，静默跳过而非记 error
 */
function isDuplicateKeyError(e) {
    const err = e;
    if (!err) {
        return false;
    }
    // CloudBase：-502019 唯一索引冲突 / -502001 文档 _id 已存在
    const codes = [Number(err.errCode), Number(err.code)];
    if (codes.includes(-502019) || codes.includes(-502001)) {
        return true;
    }
    // MongoDB 11000
    if (codes.includes(11000)) {
        return true;
    }
    const msg = err.message || '';
    return /duplicate key|E11000|already exist/i.test(msg);
}
exports.isDuplicateKeyError = isDuplicateKeyError;
/** 持久化告警（懒加载，避免 common 副本缺 alert 模块时崩溃） */
async function safeAlert(action, message, context) {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { recordAlert } = require('./alert');
        await recordAlert('warning', action, message, context);
    }
    catch (e) {
        logger.warn('safeAlert failed', { action, msg: e?.message });
    }
}
// =====================================================================
// 主入口
// =====================================================================
/**
 * 创建佣金记录（best-effort，全局唯一实现）
 *
 * 调用时机：
 *   - 寄养：orderService.handleBoardingOrder / adminService.hosting 完成
 *   - 商城：paymentService.confirmPayment|notify / adminService.completeMallOrder
 *   - 团购：paymentService.confirmPayment|notify
 *   - 活动：activityService 报名支付成功
 *   - 喂养：feedingService / paymentService.notify
 *   - 补偿：orderTimeoutService.dispatchRetry（failed_operations 重试）
 *
 * 跳过条件（均为静默 return，仅 debug 级日志）：
 *   ownerId 缺失 / 买家不存在 / 无邀请人 / 自购 / 邀请人不存在
 *   / 费率 <= 0 / 订单金额 < ¥1 / 佣金额 <= 0 / 已存在佣金记录
 *
 * @param orderType 订单类型（接受 order/hosting/boarding/group_buy 等别名）
 * @param order 订单文档
 */
async function createCommissionRecord(orderType, order) {
    const rawType = String(orderType || '');
    const canonicalType = normalizeOrderType(rawType);
    try {
        if (!order || !order._id || !order.ownerId) {
            return;
        }
        // 1. 买家 → 邀请人
        const buyerData = await loadUser(db, order.ownerId, 'buyer');
        if (!buyerData) {
            return;
        }
        const inviterId = buyerData.inviterId;
        if (!inviterId) {
            return;
        }
        // 自购订单不发佣（防止用自己的邀请码下单套佣）
        if (inviterId === order.ownerId) {
            logger.info('commission_skipped_self_purchase', { orderId: order._id, ownerId: order.ownerId });
            return;
        }
        const inviterData = await loadUser(db, inviterId, 'inviter');
        if (!inviterData) {
            return;
        }
        // 2. 费率：合作伙伴自定义优先，回退系统默认（均支持键别名）
        let rate = 0;
        let rateSource = 'none';
        try {
            const adminRes = await db.collection('admins').doc(inviterId).get();
            const admin = adminRes.data;
            rate = pickRate(admin?.commissionRates, canonicalType, rawType);
            if (rate > 0) {
                rateSource = 'admin';
            }
        }
        catch (e) {
            logger.warn('loadAdminCommissionRates', { inviterId, msg: e?.message });
        }
        if (rate <= 0) {
            const config = await loadCommissionConfig(db);
            rate = pickRate(config, canonicalType, rawType);
            if (rate > 0) {
                rateSource = 'system';
            }
        }
        if (rate <= 0) {
            logger.info('commission_skipped_zero_rate', { orderId: order._id, orderType: canonicalType, rawType });
            return;
        }
        // 3. 金额（按类型路由字段）+ 佣金额（整数分计算，杜绝浮点漂移）
        const orderAmount = resolveOrderAmount(order, canonicalType);
        if (orderAmount < MIN_ORDER_AMOUNT) {
            logger.info('commission_skipped_amount_too_small', {
                orderId: order._id, orderType: canonicalType, orderAmount,
            });
            return;
        }
        const orderAmountFen = Math.round(orderAmount * 100);
        const commissionAmountFen = Math.round(orderAmountFen * rate / 100);
        const commissionAmount = commissionAmountFen / 100;
        if (commissionAmount <= 0) {
            return;
        }
        // 4. 幂等预检
        if (await hasExistingCommission(db, order._id, inviterId)) {
            return;
        }
        // 4.1 商品/服务名称（best-effort）：各业务订单文档字段名不同，按候选顺序取第一个非空
        const PRODUCT_NAME_KEYS = ['productName', 'activityTitle', 'hostName', 'title', 'name', 'serviceName', 'goodsName'];
        let productName = '';
        for (const k of PRODUCT_NAME_KEYS) {
            const v = order[k];
            if (typeof v === 'string' && v.trim()) {
                productName = v.trim().slice(0, 80);
                break;
            }
        }
        // 5. 写入（确定性 _id + 唯一索引冲突恢复）
        const payload = {
            _id: buildCommissionId(order._id, inviterId),
            inviterId,
            inviterNickName: inviterData.nickName || '',
            ownerId: buyerData._id,
            orderType: canonicalType,
            orderId: order._id,
            orderNo: order.outTradeNo || order.orderNo || '',
            orderAmount,
            commissionRate: rate,
            commissionAmount,
            productName,
            status: 'pending',
            createdAt: db.serverDate(),
            updatedAt: db.serverDate(),
        };
        try {
            await db.collection('commissions').add({ data: payload });
        }
        catch (addError) {
            if (isDuplicateKeyError(addError)) {
                logger.info('commission_duplicate_recovered', { orderId: order._id, inviterId, orderType: canonicalType });
                return;
            }
            throw addError;
        }
        logger.info('commission_created', {
            orderType: canonicalType, rawType, orderId: order._id,
            amount: orderAmount, rate, rateSource, commission: commissionAmount,
        });
    }
    catch (error) {
        const msg = error instanceof Error ? error.message : '未知错误';
        logger.error('createCommissionRecord', { msg, orderType: canonicalType, rawType, orderId: order?._id });
        await safeAlert('commission.create.failed', `佣金记录创建失败：${msg}`, {
            orderType: canonicalType, rawType, orderId: order?._id, error: msg,
        });
    }
}
exports.createCommissionRecord = createCommissionRecord;
/**
 * 取消佣金记录（best-effort）
 *
 * 调用时机：订单取消 / 退款
 * 行为：将该订单下所有 pending 佣金置为 cancelled（已结算的 settled 不动）
 */
async function cancelCommissionRecord(orderId) {
    try {
        if (!orderId) {
            return;
        }
        const result = await db.collection('commissions')
            .where({ orderId, status: 'pending' })
            .update({
            data: {
                status: 'cancelled',
                cancelledAt: db.serverDate(),
                updatedAt: db.serverDate(),
            },
        });
        logger.info('commission_cancelled', { orderId, updated: result.updated });
    }
    catch (error) {
        const msg = error instanceof Error ? error.message : '未知错误';
        logger.error('cancelCommissionRecord', { msg, orderId });
        await safeAlert('commission.cancel.failed', `佣金记录取消失败：${msg}`, { orderId, error: msg });
    }
}
exports.cancelCommissionRecord = cancelCommissionRecord;
exports.default = createCommissionRecord;
