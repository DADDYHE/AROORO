/* eslint-disable */
"use strict";
/**
 * adminService/commission.ts - 佣金记录创建（best-effort，TypeScript 源文件 - Sprint 33 迁移）
 *
 * 业务功能：
 *   - createCommissionRecord：订单支付成功后异步创建佣金记录
 *     1) 读取 system_config.commission_rates[orderType]
 *     2) 查询订单买家（users._id = openid）
 *     3) 查找邀请人（inviterId）
 *     4) 计算佣金金额 = 订单金额 × 佣金率 / 100
 *     5) 幂等检查（已存在则跳过）
 *     6) 写入 tuan_commissions 集合
 *
 * 与 paymentService/services/commission.ts 行为一致；
 * adminService 内部保留以供 mall / tuan / hosting 等业务直接调用。
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.adminService.json
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCommissionRecord = void 0;
const utils_1 = require("../common/utils");
const logger_1 = require("../common/logger");
// service 内部 .js 模块走 CommonJS require
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { generateId } = require('../common/utils');
/* ============================================================
 * 模块初始化
 * ============================================================ */
const { db } = (0, utils_1.initCloud)();
const logger = (0, logger_1.createLogger)('adminService:commission');
/* ============================================================
 * 内部辅助
 * ============================================================ */
async function loadCommissionConfig(dbInstance) {
    try {
        const res = await dbInstance.collection('system_config').doc('commission_rates').get();
        return (res.data || {});
    }
    catch (e) {
        logger.warn('loadCommissionConfig', { msg: e?.message });
        return {};
    }
}
async function loadBuyer(dbInstance, ownerId) {
    try {
        const res = await dbInstance.collection('users').doc(ownerId).get();
        return (res.data || null);
    }
    catch (e) {
        logger.warn('loadBuyer', { ownerId, msg: e?.message });
        return null;
    }
}
async function loadInviter(dbInstance, inviterId) {
    try {
        const res = await dbInstance.collection('users').doc(inviterId).get();
        return (res.data || null);
    }
    catch (e) {
        logger.warn('loadInviter', { inviterId, msg: e?.message });
        return null;
    }
}
function resolveOrderAmount(order) {
    return Number(order.totalPrice) || Number(order.totalAmount) || Number(order.basicPrice) || 0;
}
async function hasExistingCommission(dbInstance, orderId, inviterId) {
    try {
        const res = await dbInstance.collection('tuan_commissions')
            .where({ orderId, inviterId })
            .count();
        return res.total > 0;
    }
    catch (e) {
        logger.warn('hasExistingCommission', { orderId, inviterId, msg: e?.message });
        return false;
    }
}
/* ============================================================
 * 主入口
 * ============================================================ */
async function createCommissionRecord(orderType, order) {
    try {
        const config = await loadCommissionConfig(db);
        const rate = Number(config[orderType]) || 0;
        if (rate <= 0) {
            return;
        }
        if (!order.ownerId) {
            return;
        }
        const buyer = await loadBuyer(db, order.ownerId);
        if (!buyer) {
            return;
        }
        const inviterId = buyer.inviterId;
        if (!inviterId) {
            return;
        }
        const inviter = await loadInviter(db, inviterId);
        if (!inviter) {
            return;
        }
        const orderAmount = resolveOrderAmount(order);
        if (orderAmount <= 0) {
            return;
        }
        const commissionAmount = Math.round((orderAmount * rate / 100) * 100) / 100;
        if (commissionAmount <= 0) {
            return;
        }
        if (await hasExistingCommission(db, order._id, inviterId)) {
            return;
        }
        const payload = {
            _id: generateId('commission', order.ownerId),
            inviterId,
            inviterNickName: inviter.nickName || '',
            ownerId: buyer._id,
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
        await db.collection('tuan_commissions').add({ data: payload });
        logger.info('createCommissionRecord', {
            orderType, orderId: order.outTradeNo || order.orderNo || order._id, amount: orderAmount, rate, commissionAmount,
        });
    }
    catch (e) {
        logger.error('createCommissionRecord', { msg: e?.message, orderType, orderId: order?._id });
    }
}
exports.createCommissionRecord = createCommissionRecord;
/* ============================================================
 * 默认导出（保持 CommonJS 兼容）
 * ============================================================ */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _mod = module;
_mod.exports = { createCommissionRecord };
createCommissionRecord.default = createCommissionRecord;
exports.default = createCommissionRecord;
