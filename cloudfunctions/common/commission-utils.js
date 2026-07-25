"use strict";
/**
 * common/commission-utils.ts - 共享佣金记录工具
 *
 * 业务功能：
 *   - createCommissionRecord：订单支付成功后创建佣金记录（best-effort）
 *     1) 读取 system_config.commission_rates[orderType]
 *     2) 查询订单买家（users._id = openid）
 *     3) 查找邀请人（inviterId）
 *     4) 计算佣金金额 = 订单金额 × 佣金率 / 100
 *     5) 幂等检查（已存在则跳过）
 *     6) 写入 commissions 集合
 *
 * 使用方式：
 *   - 各云函数通过 require('../../common/commission-utils').createCommissionRecord 调用
 *   - 所有异常都被吞掉（best-effort），仅记录日志
 *   - 无需鉴权 / 无需返回结构
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.cancelCommissionRecord = exports.createCommissionRecord = void 0;
const utils_1 = require("./utils");
const logger_1 = require("./logger");
// =====================================================================
// 模块初始化
// =====================================================================
const { db } = (0, utils_1.initCloud)();
const logger = (0, logger_1.createLogger)('commission-utils');
// =====================================================================
// 内部辅助
// =====================================================================
/**
 * 读取系统佣金率配置
 */
async function loadCommissionConfig(dbInstance) {
    try {
        const configRes = await dbInstance.collection('system_config').doc('commission_rates').get();
        return (configRes.data || {});
    }
    catch (e) {
        logger.warn('loadCommissionConfig: 读取 system_config 失败', { msg: e?.message });
        return {};
    }
}
/**
 * 查询买家档案（users._id = openid）
 */
async function loadBuyer(dbInstance, ownerId) {
    try {
        const buyerRes = await dbInstance.collection('users').doc(ownerId).get();
        return (buyerRes.data || null);
    }
    catch (e) {
        logger.warn('loadBuyer: 查询买家失败', { ownerId, msg: e?.message });
        return null;
    }
}
/**
 * 查询邀请人档案
 */
async function loadInviter(dbInstance, inviterId) {
    try {
        const inviterLookup = await dbInstance.collection('users').doc(inviterId).get();
        return (inviterLookup.data || null);
    }
    catch (e) {
        logger.warn('loadInviter: 查询邀请人失败', { inviterId, msg: e?.message });
        return null;
    }
}
/**
 * 计算订单金额（兼容 totalPrice / totalAmount / basicPrice 三种字段）
 */
function resolveOrderAmount(order) {
    return Number(order.totalPrice) || Number(order.totalAmount) || Number(order.basicPrice) || 0;
}
/**
 * 检查是否已存在佣金记录（幂等保护）
 */
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
 * 生成唯一 ID
 */
function generateId(prefix, seed) {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}_${timestamp}_${random}_${seed.substring(0, 8)}`;
}
// =====================================================================
// 主入口
// =====================================================================
/**
 * 创建佣金记录（best-effort）
 *
 * 调用时机：
 *   - 支付成功后（paymentService / mallService / activityService / feedingService）
 *
 * 流程：
 *   1. 读取 system_config.commission_rates[orderType]
 *   2. 若 rate <= 0 → 跳过（无佣金）
 *   3. 若 order.ownerId 缺失 → 跳过
 *   4. 查询买家（users._id = ownerId）
 *   5. 若买家 inviterId 缺失 → 跳过
 *   6. 查询邀请人档案
 *   7. 计算佣金金额（orderAmount × rate / 100，保留 2 位小数）
 *   8. 幂等检查（orderId + inviterId 已存在 → 跳过）
 *   9. 写入 commissions
 *
 * 错误处理：
 *   - 任何异常都被吞掉，仅记录日志
 *   - 不影响主业务（支付成功）的响应
 *
 * @param orderType 订单类型
 * @param order 订单文档
 * @returns 始终返回 void；失败仅记日志
 */
async function createCommissionRecord(orderType, order) {
    try {
        if (!order.ownerId) {
            return;
        }
        // 1. 查询买家
        const buyerData = await loadBuyer(db, order.ownerId);
        if (!buyerData) {
            return;
        }
        // 2. 查询邀请人
        const inviterId = buyerData.inviterId;
        if (!inviterId) {
            return;
        }
        // P0-8: 自购订单不触发佣金（防止 inviterId === ownerId 时给自己发佣金）
        if (inviterId === order.ownerId) {
            logger.info('commission_skipped_self_purchase', { orderId: order._id, ownerId: order.ownerId });
            return;
        }
        const inviterData = await loadInviter(db, inviterId);
        if (!inviterData) {
            return;
        }
        // 3. 读取佣金率：优先合作伙伴自定义配置，fallback 到系统默认
        let rate = 0;
        try {
            const adminRes = await db.collection('admins').doc(inviterId).get();
            const admin = adminRes.data;
            const rates = admin?.commissionRates || {};
            if (rates[orderType] !== undefined) {
                rate = Number(rates[orderType]);
            }
        }
        catch (e) {
            logger.warn('loadAdminCommissionRates', { inviterId, msg: e?.message });
        }
        if (rate <= 0) {
            const config = await loadCommissionConfig(db);
            rate = Number(config[orderType]) || 0;
        }
        if (rate <= 0) {
            return;
        }
        // 4. 计算订单金额 + 佣金金额
        const orderAmount = resolveOrderAmount(order);
        if (orderAmount <= 0) {
            return;
        }
        // P0-3: 使用整数分计算佣金，避免浮点精度误差
        const orderAmountFen = Math.round(orderAmount * 100);
        const commissionAmountFen = Math.round(orderAmountFen * rate / 100);
        const commissionAmount = commissionAmountFen / 100;
        if (commissionAmount <= 0) {
            return;
        }
        // 5. 幂等检查
        if (await hasExistingCommission(db, order._id, inviterId)) {
            return;
        }
        // 6. 写入佣金记录
        const payload = {
            _id: generateId('commission', order.ownerId),
            inviterId,
            inviterNickName: inviterData.nickName || '',
            ownerId: buyerData._id,
            orderType: orderType,
            orderId: order._id,
            orderNo: order.outTradeNo || order.orderNo || '',
            orderAmount,
            commissionRate: rate,
            commissionAmount,
            status: 'pending',
            createdAt: db.serverDate(),
            updatedAt: db.serverDate(),
        };
        await db.collection('commissions').add({ data: payload });
        logger.info('commission_created', { orderType, orderId: order._id, amount: orderAmount, rate, commission: commissionAmount });
    }
    catch (error) {
        const msg = error instanceof Error ? error.message : '未知错误';
        logger.error('createCommissionRecord', { msg, orderType, orderId: order?._id });
    }
}
exports.createCommissionRecord = createCommissionRecord;
/**
 * 取消佣金记录（best-effort）
 *
 * 调用时机：
 *   - 订单取消/退款时
 *
 * 流程：
 *   1. 查找 commissions 中 orderId 对应的所有记录
 *   2. 将 status 从 'pending' 更新为 'cancelled'
 *
 * 错误处理：
 *   - 任何异常都被吞掉，仅记录日志
 *   - 不影响主业务（订单取消）的响应
 *
 * @param orderId 订单ID
 * @returns 始终返回 void；失败仅记日志
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
    }
}
exports.cancelCommissionRecord = cancelCommissionRecord;
exports.default = createCommissionRecord;
