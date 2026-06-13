/**
 * 支付完成 → 自动核销优惠券
 *
 * 触发点：
 *   - notify.js:applyPaidStatus（微信支付回调，最权威）
 *   - pay.js:confirmPayment 末尾（前端主动确认，作为兜底）
 *
 * 设计：
 *   - 幂等：仅处理 status='locked' 的券；'locked → used' 转换天然幂等
 *   - 防御：校验 ownerId / lockedOrderId 匹配
 *   - best-effort：核销失败不影响主流程（订单已经 paid）
 *   - 审计：每次核销写 coupon_usage + operation_logs
 *
 * 与 couponService.useCoupon 的关系：
 *   - 本模块替代前端的 useCoupon 调用，作为后端单一信源
 *   - 原 useCoupon 函数保留（兼容管理后台或旧调用方）
 */
const logger_1 = require('../common/logger');
// service 内部 .js 模块走 CommonJS require
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { initCloud } = require('../common/utils');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { generateId } = require('../common/utils');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { writeOperationLog } = require('../common/operation-log');
// =====================================================================
// 模块初始化
// =====================================================================
const { db } = initCloud();
const logger = (0, logger_1.createLogger)('paymentService:couponSettlement');
// =====================================================================
// 工具函数
// =====================================================================
/**
 * 从订单推断业务类型（business 字段）
 * 优先用 orderType 字段；缺失时回退到 collection 推断
 */
function inferBusinessType(order) {
    const raw = (order.orderType || order.businessType || '').toString().toLowerCase();
    if (raw === 'feeding' || raw === 'mall' || raw === 'tuan' || raw === 'activity') {
        return raw;
    }
    // 兼容：旧数据没有 orderType 字段时，按金额字段特征粗判
    if (order.activityId) { return 'activity'; }
    if (order.dealId) { return 'tuan'; }
    if (order.familiarity !== undefined || order.petDetails) { return 'feeding'; }
    return 'mall';
}
/**
 * 读取订单的金额字段（兼容 totalPrice / totalAmount / basicPrice）
 */
function resolveOrderAmount(order) {
    return Number(order.totalPrice)
        || Number(order.totalAmount)
        || Number(order.basicPrice)
        || 0;
}
function resolveOriginalAmount(order) {
    return Number(order.originalAmount) || 0;
}
function resolveDiscountAmount(order) {
    return Number(order.couponDiscount) || 0;
}
function resolveOwnerId(order) {
    return (order.openid || order.ownerId || '').toString();
}
// =====================================================================
// 主入口
// =====================================================================
/**
 * 订单支付成功后核销关联优惠券
 *
 * @param order 已支付的业务订单对象（需含 couponId / openid / orderType / outTradeNo）
 * @returns { consumed: boolean, reason?: string }
 */
async function consumeOrderCoupons(order) {
    const result = { consumed: false, reason: '' };
    if (!order || !order._id) {
        result.reason = '订单为空';
        return result;
    }
    const couponId = (order.couponId || '').toString();
    if (!couponId) {
        result.reason = '订单未使用优惠券';
        return result;
    }
    const ownerId = resolveOwnerId(order);
    // 读取券信息
    let coupon;
    try {
        const couponRes = await db.collection('user_coupons').doc(couponId).get();
        coupon = couponRes && couponRes.data ? couponRes.data : null;
    }
    catch (e) {
        logger.error('consumeOrderCoupons: 读取券失败', { couponId, orderId: order._id, msg: e?.message });
        result.reason = `读取券失败: ${e?.message}`;
        return result;
    }
    if (!coupon) {
        logger.warn('consumeOrderCoupons: 券不存在', { couponId, orderId: order._id });
        result.reason = '券不存在';
        return result;
    }
    // 安全校验 1：券属于该用户
    if (ownerId && coupon.ownerId && coupon.ownerId !== ownerId) {
        logger.error('consumeOrderCoupons: 券 owner 不匹配', {
            couponId, couponOwner: coupon.ownerId, orderOwner: ownerId, orderId: order._id,
        });
        result.reason = '券 owner 不匹配';
        return result;
    }
    // 安全校验 2：lockedOrderId 应该指向当前订单（防御误用/重复绑定）
    // 注意：历史上前端曾用 clientOrderId（feed_ 前缀）作为 lockedOrderId，与订单 _id 不一致。
    // 此处仅做 warn 记录，不阻塞核销——'locked' 状态本身已是足够的幂等保护。
    if (coupon.lockedOrderId && coupon.lockedOrderId !== order._id) {
        logger.warn('consumeOrderCoupons: lockedOrderId 与订单 _id 不一致（不阻塞核销）', {
            couponId, lockedOrderId: coupon.lockedOrderId, orderId: order._id,
        });
    }
    // 幂等：仅处理 locked 状态
    if (coupon.status !== 'locked') {
        logger.info('consumeOrderCoupons: 券非 locked 态，跳过', {
            couponId, status: coupon.status, orderId: order._id,
        });
        result.reason = `券状态: ${coupon.status}`;
        return result;
    }
    const business = inferBusinessType(order);
    const finalAmount = resolveOrderAmount(order);
    const originalAmount = resolveOriginalAmount(order) || finalAmount;
    const discountAmount = resolveDiscountAmount(order)
        || Math.max(0, originalAmount - finalAmount);
    const now = db.serverDate();
    // 1) 写入 used 状态
    try {
        await db.collection('user_coupons').doc(couponId).update({
            data: {
                status: 'used',
                usedAt: now,
                usedOrderId: order._id,
                usedBusiness: business,
                updatedAt: now,
            },
        });
    }
    catch (e) {
        logger.error('consumeOrderCoupons: 标记 used 失败', { couponId, msg: e?.message });
        result.reason = `标记 used 失败: ${e?.message}`;
        return result;
    }
    // 2) 写 coupon_usage 记录
    try {
        const usageRecord = {
            _id: generateId('coupon_usage', ownerId || coupon.ownerId || ''),
            userCouponId: couponId,
            templateId: coupon.templateId,
            ownerId: coupon.ownerId,
            orderId: order._id,
            outTradeNo: order.outTradeNo || '',
            businessType: business,
            originalAmount,
            discountAmount,
            finalAmount,
            usedAt: now,
            source: 'auto_on_paid', // 标记：支付回调/确认支付自动核销
            createdAt: now,
        };
        await db.collection('coupon_usage').add({ data: usageRecord });
    }
    catch (e) {
        // 写 coupon_usage 失败不影响主流程（券状态已变更，可事后补单）
        logger.error('consumeOrderCoupons: 写 coupon_usage 失败', {
            couponId, orderId: order._id, msg: e?.message,
        });
    }
    // 3) 审计日志（best-effort，失败不影响主流程）
    await writeOperationLog({
        module: 'user_coupon',
        action: 'use_auto_on_paid',
        targetId: couponId,
        targetName: coupon.templateName || '',
        operatorId: 'system',
        operatorName: 'payment-service',
        beforeData: { status: 'locked', lockedOrderId: order._id },
        afterData: { status: 'used', orderId: order._id, business, discountAmount },
    });
    result.consumed = true;
    result.reason = 'ok';
    logger.info('consumeOrderCoupons: 核销成功', {
        couponId, orderId: order._id, business, discountAmount, finalAmount,
    });
    return result;
}
module.exports = {
    consumeOrderCoupons,
};
