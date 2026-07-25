"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.refundCouponForOrder = void 0;
const { initCloud } = require('./utils');
const { writeOperationLog } = require('./operation-log');
const { db } = initCloud();

async function refundCouponForOrder(orderId, openid) {
    const now = Date.now();
    const usageRes = await db.collection('coupon_usage').where({ orderId }).limit(10).get();
    if (usageRes.data && usageRes.data.length > 0) {
        await Promise.all(usageRes.data.map(async (usage) => {
            if (usage.status === 'refunded') { return; }
            const couponId = usage.userCouponId;
            if (!couponId) { return; }
            const cRes = await db.collection('user_coupons').doc(couponId).get();
            if (!cRes.data) { return; }
            const c = cRes.data;
            if (c.ownerId !== openid) { return; }
            if (c.status !== 'used') { return; }
            const isExpired = c.endTime ? new Date(c.endTime).getTime() < now : false;
            const newStatus = isExpired ? 'expired' : 'unused';
            await Promise.all([
                db.collection('user_coupons').doc(couponId).update({
                    data: { status: newStatus, updatedAt: db.serverDate() },
                }),
                db.collection('coupon_usage').doc(usage._id).update({
                    data: { status: 'refunded', refundedAt: db.serverDate(), updatedAt: db.serverDate() },
                }),
            ]);
            await writeOperationLog({
                module: 'user_coupon',
                action: 'refund_on_cancel',
                targetId: couponId,
                targetName: c.templateName || '',
                operatorId: openid,
                operatorName: openid,
                beforeData: { status: 'used', orderId },
                afterData: { status: newStatus, orderId },
            });
        }));
    }

    const lockedRes = await db.collection('user_coupons')
        .where({ lockedOrderId: orderId, status: 'locked' })
        .limit(10)
        .get();
    if (lockedRes.data && lockedRes.data.length > 0) {
        await Promise.all(lockedRes.data.map(async (c) => {
            if (c.ownerId !== openid) { return; }
            const isExpired = c.endTime ? new Date(c.endTime).getTime() < now : false;
            const newStatus = isExpired ? 'expired' : 'unused';
            await db.collection('user_coupons').doc(c._id).update({
                data: { status: newStatus, lockedOrderId: '', updatedAt: db.serverDate() },
            });
            await writeOperationLog({
                module: 'user_coupon',
                action: 'unlock_on_cancel',
                targetId: c._id,
                targetName: c.templateName || '',
                operatorId: openid,
                operatorName: openid,
                beforeData: { status: 'locked', orderId },
                afterData: { status: newStatus, orderId },
            });
        }));
    }
}

exports.refundCouponForOrder = refundCouponForOrder;
