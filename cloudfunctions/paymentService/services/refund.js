"use strict";
/**
 * paymentService/refund.ts - 退款服务（TypeScript 源文件 - Sprint 24 迁移）
 *
 * 业务功能：
 *   - createRefund：发起微信支付退款（含风控前置扫描 + 限流 + 业务校验）
 *   - queryRefund：查询退款单进度
 *
 * 迁移目标：
 *   - 强类型化 event / auth / 返回值
 *   - 与 common/* 共享类型（CloudBaseDB）
 *   - 编译产物（refund.js）继续被 index.js require
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.paymentService.json
 *   （运行时仍消费 .js 编译产物）
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.queryRefund = exports.createRefund = void 0;
// Sprint 24 迁移说明：
//   - 仍消费 .js 编译产物（tsc 输出到 cloudfunctions/paymentService/services/refund.js）
//   - 对 .js 文件（wechatPayUtils / config）使用 require() 而非 import
//   - 强类型仅作用于 common/*（已有 .d.ts 产物）
const errors_1 = require("../../common/errors");
const utils_1 = require("../../common/utils");
const logger_1 = require("../../common/logger");
const risk_control_1 = require("../../common/risk-control");
const risk_rate_limit_1 = require("../../common/risk-rate-limit");
const commission_utils_1 = require("../../common/commission-utils");
// service 内部 .js 模块走 CommonJS require
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { WECHAT_PAY, ENDPOINTS } = require('../common/config');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { randomString, httpsRequest, generateAuthorization } = require('./wechatPayUtils');
// =====================================================================
// 模块初始化
// =====================================================================
const { db } = (0, utils_1.initCloud)();
const logger = (0, logger_1.createLogger)('paymentService:refund');
// =====================================================================
// 退款发起
// =====================================================================
/**
 * 发起退款
 *
 * 流程：
 *   1. 业务参数校验
 *   2. 订单归属校验（必须是订单 owner）
 *   3. 风控前置扫描（detectRefundAbuse，受限流保护）
 *   4. 调微信支付 API 发起退款
 *   5. 返回退款结果（含 riskDecision 供客户端/后台决策）
 *
 * @throws BusinessError INVALID_PARAMS / PERMISSION_DENIED / RISK_REJECT / RATE_LIMITED / REFUND_FAILED
 */
exports.createRefund = (0, errors_1.withErrorHandling)(async (event, _context, auth) => {
    const { outTradeNo, refundAmount, totalAmount, reason } = event;
    const openid = auth.openid || '';
    if (!outTradeNo || !refundAmount || !totalAmount) {
        throw (0, errors_1.err)('INVALID_PARAMS', '参数不完整');
    }
    // 安全校验：退款金额不得超过支付金额
    if (Math.round(refundAmount) > Math.round(totalAmount)) {
        throw (0, errors_1.err)('INVALID_PARAMS', '退款金额异常');
    }
    // 安全校验：查询订单，校验调用者是订单所有者 + 实际支付金额校验
    const orderDoc = await fetchOrderAndVerifyOwnership(db, outTradeNo, openid, Number(refundAmount));
    // Sprint 16: 风控前置扫描
    const { pendingReview, riskDecision, riskReasons } = await runRiskControl({
        db,
        openid,
        outTradeNo,
        orderDoc,
        refundAmount: Number(refundAmount),
        totalAmount: Number(totalAmount),
        reason: reason || '',
    });
    // 调微信支付 API
    const config = WECHAT_PAY;
    if (!config.mchId || !config.privateKey) {
        throw (0, errors_1.err)('BUSINESS_ERROR', '微信支付未配置');
    }
    const outRefundNo = `REFUND_${Date.now()}_${randomString(6).toUpperCase()}`;
    const requestBody = {
        out_trade_no: outTradeNo,
        out_refund_no: outRefundNo,
        reason: reason || '用户申请退款',
        amount: {
            refund: Math.round(refundAmount),
            total: Math.round(totalAmount),
            currency: 'CNY',
        },
    };
    const bodyStr = JSON.stringify(requestBody);
    const authorization = generateAuthorization('POST', '/v3/refund/domestic/refunds', bodyStr, config.mchId, config.serialNo, config.privateKey);
    const refundResult = (await httpsRequest(`${ENDPOINTS.WECHAT_PAY_API_BASE}${ENDPOINTS.WECHAT_PAY_REFUND}`, requestBody, authorization));
    if (refundResult && refundResult.status === 'FAIL') {
        throw (0, errors_1.err)('REFUND_FAILED', `微信退款失败：${refundResult.message || '未知原因'}`);
    }
    // 退款成功后取消佣金记录
    if (orderDoc._id) {
        try {
            await (0, commission_utils_1.cancelCommissionRecord)(orderDoc._id);
            logger.info('createRefund.cancelCommissionRecord.success', { orderId: orderDoc._id });
        }
        catch (e) {
            logger.warn('createRefund.cancelCommissionRecord.failed', {
                orderId: orderDoc._id,
                msg: e.message,
            });
        }
    }
    // 退款成功后更新订单状态
    if (orderDoc._id) {
        try {
            await db.collection('orders').doc(orderDoc._id).update({
                data: {
                    status: 'refunded',
                    paymentStatus: 'refunded',
                    refundAmount: Number(refundAmount) / 100,
                    refundedAt: db.serverDate(),
                    updatedAt: db.serverDate(),
                },
            });
            logger.info('createRefund.orderStatusUpdated', { orderId: orderDoc._id });
        }
        catch (e) {
            logger.warn('createRefund.updateOrderStatusFailed', {
                orderId: orderDoc._id,
                msg: e.message,
            });
        }
    }
    // 同步业务表状态
    if (orderDoc._id) {
        try {
            const orderType = orderDoc.orderType || outTradeNo.split('_')[0];
            if (orderType === 'tuan' && orderDoc.tuanOrderId) {
                await db.collection('tuan_orders').doc(orderDoc.tuanOrderId).update({
                    data: { status: 'refunded', paymentStatus: 'refunded', updatedAt: db.serverDate() },
                });
            }
            if (orderType === 'activity' && orderDoc.activityId && orderDoc.ownerId) {
                await db.collection('activity_registrations').where({
                    activityId: orderDoc.activityId,
                    ownerId: orderDoc.ownerId,
                }).update({
                    data: { status: 'refunded', updatedAt: db.serverDate() },
                });
            }
            if (orderType === 'feeding') {
                await db.collection('feedingOrders').doc(orderDoc._id).update({
                    data: { status: 'refunded', paymentStatus: 'refunded', updatedAt: db.serverDate() },
                });
            }
            logger.info('createRefund.syncBusinessOrder.success', { orderId: orderDoc._id, orderType });
        }
        catch (e) {
            logger.warn('createRefund.syncBusinessOrder.failed', {
                orderId: orderDoc._id,
                msg: e.message,
            });
        }
    }
    // 返回 raw data：withErrorHandling 透传，由 index.js 统一 toResponse
    return {
        refundId: refundResult.refund_id,
        outRefundNo,
        status: refundResult.status,
        channel: refundResult.channel,
        userReceivedAccount: refundResult.user_received_account,
        pendingReview,
        riskDecision,
        riskReasons: pendingReview ? riskReasons : [],
    };
});
// =====================================================================
// 退款查询
// =====================================================================
/**
 * 查询退款单进度
 *
 * @throws BusinessError INVALID_PARAMS / BUSINESS_ERROR
 */
exports.queryRefund = (0, errors_1.withErrorHandling)(async (event, _context, _auth) => {
    const { outRefundNo } = event;
    if (!outRefundNo) {
        throw (0, errors_1.err)('INVALID_PARAMS', '缺少退款单号');
    }
    const config = WECHAT_PAY;
    if (!config.mchId || !config.privateKey) {
        throw (0, errors_1.err)('BUSINESS_ERROR', '微信支付未配置');
    }
    const path = `/v3/refund/domestic/refunds/out-refund-no/${outRefundNo}`;
    const authorization = generateAuthorization('GET', path, '', config.mchId, config.serialNo, config.privateKey);
    const result = (await httpsRequest(`${ENDPOINTS.WECHAT_PAY_API_BASE}${path}`, null, authorization, 'GET'));
    return result;
});
// =====================================================================
// 内部辅助
// =====================================================================
async function fetchOrderAndVerifyOwnership(db, outTradeNo, openid, refundAmount) {
    let orderDoc = null;
    try {
        const orderRes = await db.collection('orders')
            .where({ outTradeNo }).limit(1).get();
        const list = (orderRes && orderRes.data) || [];
        if (list.length > 0) {
            orderDoc = list[0];
            if (orderDoc.ownerId && orderDoc.ownerId !== openid) {
                throw (0, errors_1.err)('PERMISSION_DENIED', '权限不足');
            }
            // 使用数据库中的实际支付金额校验：申请退款金额不能超过实际已支付金额
            const actualTotal = Number(orderDoc.paidAmount || orderDoc.totalPrice || 0);
            if (actualTotal > 0 && Math.round(refundAmount) > Math.round(actualTotal)) {
                throw (0, errors_1.err)('INVALID_PARAMS', '退款金额异常');
            }
        }
    }
    catch (e) {
        // 重新抛出 BusinessError（带 code 的错误）
        if (e && typeof e === 'object' && 'code' in e) {
            throw e;
        }
        // DB 异常时记录日志并抛出错误（不吞掉异常）
        logger.error('createRefund: 查询订单校验失败', { msg: e?.message });
        throw (0, errors_1.err)('DATA_ERROR', '订单查询失败，无法验证所有权');
    }
    // 订单不存在时抛出错误（不允许绕过所有权校验）
    if (!orderDoc) {
        throw (0, errors_1.err)('NOT_FOUND', '订单不存在');
    }
    return orderDoc;
}
async function runRiskControl(input) {
    const { db, openid, outTradeNo, orderDoc, refundAmount, totalAmount, reason } = input;
    let pendingReview = false;
    let riskDecision = 'RISK_PASS';
    let riskReasons = [];
    try {
        // Sprint 17: 风控检测入口限流（防滥用 detect API）
        const risk = await (0, risk_rate_limit_1.withRateLimit)({ userId: openid, type: 'refund', targetId: outTradeNo }, () => (0, risk_control_1.detectRefundAbuse)({
            db,
            userId: openid,
            orderId: orderDoc ? orderDoc._id : outTradeNo,
            refundAmount,
            totalAmount,
            reason,
        }));
        riskDecision = (0, risk_control_1.mapActionToErrorCode)(risk.action);
        riskReasons = risk.reasons;
        if (risk.action === 'reject') {
            logger.warn('createRefund.risk_reject', { outTradeNo, userId: openid, reasons: risk.reasons });
            throw (0, errors_1.err)('RISK_REJECT', '退款被风控拦截', {
                reasons: risk.reasons,
                level: risk.level,
                outTradeNo,
            });
        }
        if (risk.action === 'review') {
            pendingReview = true;
            logger.info('createRefund.risk_pending', { outTradeNo, userId: openid, reasons: risk.reasons });
        }
        else {
            logger.debug?.('createRefund.risk_pass', { outTradeNo, userId: openid });
        }
    }
    catch (e) {
        if ((0, errors_1.isBusinessError)(e) && e.code === 'RATE_LIMITED') {
            logger.warn('createRefund.rate_limited', { outTradeNo, userId: openid, msg: e.message });
            throw e;
        }
        if ((0, errors_1.isBusinessError)(e) && e.code === 'RISK_REJECT') {
            throw e;
        }
        // 风控系统异常时降级为放行（fail-open），记录详细日志便于监控和排查
        logger.warn('createRefund.risk_control_fail_open', {
            outTradeNo,
            userId: openid,
            refundAmount,
            errorType: typeof e,
            errorMessage: e?.message || String(e),
            errorStack: e?.stack,
            timestamp: new Date().toISOString(),
        });
        riskDecision = 'RISK_PASS'; // 异常降级为放行，避免误伤
    }
    return { pendingReview, riskDecision, riskReasons };
}
// =====================================================================
// 默认导出（保持 CommonJS 兼容）
// =====================================================================
exports.default = { createRefund: exports.createRefund, queryRefund: exports.queryRefund };
