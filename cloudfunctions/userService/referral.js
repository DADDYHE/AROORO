"use strict";
/**
 * referral.ts - 用户邀请服务（TypeScript 源文件 - Sprint 37 迁移）
 *
 * 业务功能：
 *   - 获取邀请统计（getReferralStats）
 *   - 获取邀请用户列表（getInvitedUsers）
 *
 * 迁移目标：
 *   - 强类型化所有 db 操作、handler 签名、返回结构
 *   - 复用 OrderLike / OwnerSummary 类型
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.userService.json
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getInvitedUsers = exports.getReferralStats = void 0;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { err } = require('./common/errors');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { initCloud, handleSuccess, handleError, ERROR_CODES } = require('./common/utils');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createLogger } = require('./common/logger');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { db } = initCloud();
const _ = db.command;
const logger = createLogger('userService:referral');
// =====================================================================
// 辅助函数
// =====================================================================
function sumOrderTotal(orders) {
    let total = 0;
    orders.forEach((o) => {
        total += Number(o.totalPrice) || Number(o.price) || 0;
    });
    return total;
}
// =====================================================================
// Handler 实现
// =====================================================================
async function getReferralStats(event, context, auth) {
    const { openid } = auth;
    if (!openid) {
        throw err('AUTH_REQUIRED', '未登录');
    }
    try {
        let user = null;
        try {
            const userRes = await db.collection('users').doc(openid).get();
            user = userRes.data;
        }
        catch (e) {
            logger.warn('getReferralStats.users.fetch', {
                openid,
                code: e.errCode,
                msg: e.message,
            });
        }
        if (!user) {
            throw err('NOT_FOUND', '用户不存在');
        }
        // inviterId 现在存的是 openid，直接用 openid 查询
        const invitedUsersRes = await db.collection('users')
            .where({ inviterId: openid })
            .field({ _id: true, nickName: true, avatarUrl: true, createdAt: true })
            .get();
        const invitedUsers = (invitedUsersRes.data || []);
        const totalInvited = invitedUsers.length;
        const invitedOpenids = invitedUsers.map((u) => u._id).filter((id) => Boolean(id));
        let consumingCount = 0;
        let totalSpent = 0;
        if (invitedOpenids.length > 0) {
            const spenderOpenids = new Set();
            // 查询非 mall 类型的已完成订单（mall 类型单独查询，避免重复计算）
            const ordersRes = await db.collection('orders')
                .where({ ownerId: _.in(invitedOpenids), status: 'completed', type: _.ne('mall') })
                .limit(1000)
                .get();
            (ordersRes.data || []).forEach((o) => {
                if (o.ownerId) {
                    spenderOpenids.add(o.ownerId);
                }
            });
            totalSpent += sumOrderTotal((ordersRes.data || []));
            const mallRes = await db.collection('orders')
                .where({ ownerId: _.in(invitedOpenids), type: 'mall', status: 'completed' })
                .limit(1000)
                .get();
            (mallRes.data || []).forEach((o) => {
                if (o.ownerId) {
                    spenderOpenids.add(o.ownerId);
                }
            });
            totalSpent += sumOrderTotal((mallRes.data || []));
            try {
                const feedRes = await db.collection('feedingOrders')
                    .where({ ownerId: _.in(invitedOpenids), status: 'completed' })
                    .limit(1000)
                    .get();
                (feedRes.data || []).forEach((o) => {
                    if (o.ownerId) {
                        spenderOpenids.add(o.ownerId);
                    }
                });
                totalSpent += sumOrderTotal((feedRes.data || []));
            }
            catch (e) {
                logger.warn('getReferralStats.feedingOrders', {
                    openid,
                    code: e.errCode,
                    msg: e.message,
                });
            }
            try {
                const tuanRes = await db.collection('tuan_orders')
                    .where({ ownerId: _.in(invitedOpenids), status: 'completed' })
                    .limit(1000)
                    .get();
                (tuanRes.data || []).forEach((o) => {
                    if (o.ownerId) {
                        spenderOpenids.add(o.ownerId);
                    }
                });
                totalSpent += sumOrderTotal((tuanRes.data || []));
            }
            catch (e) {
                logger.warn('getReferralStats.tuan_orders', {
                    openid,
                    code: e.errCode,
                    msg: e.message,
                });
            }
            try {
                const actRes = await db.collection('activity_registrations')
                    .where({ ownerId: _.in(invitedOpenids), status: 'completed' })
                    .limit(1000)
                    .get();
                (actRes.data || []).forEach((o) => {
                    if (o.ownerId) {
                        spenderOpenids.add(o.ownerId);
                    }
                });
                totalSpent += sumOrderTotal((actRes.data || []));
            }
            catch (e) {
                logger.warn('getReferralStats.activity_registrations', {
                    openid,
                    code: e.errCode,
                    msg: e.message,
                });
            }
            consumingCount = spenderOpenids.size;
        }
        const result = {
            totalInvited,
            consumingCount,
            totalSpent: totalSpent.toFixed(2),
        };
        return handleSuccess(result);
    }
    catch (error) {
        logger.error('getReferralStats', error);
        return handleError(error, '获取带货统计失败', ERROR_CODES.DATA);
    }
}
exports.getReferralStats = getReferralStats;
async function getInvitedUsers(event, context, auth) {
    const { openid } = auth;
    const { page = 1, pageSize = 20 } = event;
    if (!openid) {
        throw err('AUTH_REQUIRED', '未登录');
    }
    try {
        let user = null;
        try {
            const userRes = await db.collection('users').doc(openid).get();
            user = userRes.data;
        }
        catch (e) {
            logger.warn('getInvitedUsers.users.fetch', {
                openid,
                code: e.errCode,
                msg: e.message,
            });
        }
        if (!user) {
            throw err('NOT_FOUND', '用户不存在');
        }
        const skip = (page - 1) * pageSize;
        // inviterId 现在存的是 openid，直接用 openid 查询
        const [listRes, countRes] = await Promise.all([
            db.collection('users')
                .where({ inviterId: openid })
                .field({ _id: true, nickName: true, avatarUrl: true, createdAt: true })
                .orderBy('createdAt', 'desc')
                .skip(skip)
                .limit(pageSize)
                .get(),
            db.collection('users').where({ inviterId: openid }).count(),
        ]);
        const invitedUsers = (listRes.data || []);
        const invitedOpenids = invitedUsers.map((u) => u._id).filter((id) => Boolean(id));
        const orderMap = {};
        if (invitedOpenids.length > 0) {
            const collectInto = (orders) => {
                orders.forEach((o) => {
                    const key = o.ownerId;
                    if (!key) {
                        return;
                    }
                    if (!orderMap[key]) {
                        orderMap[key] = { orderCount: 0, totalSpent: 0 };
                    }
                    orderMap[key].orderCount += 1;
                    orderMap[key].totalSpent += Number(o.totalPrice) || Number(o.price) || 0;
                });
            };
            // 查询非 mall 类型的已完成订单（mall 类型单独查询，避免重复计算）
            const ordersRes = await db.collection('orders')
                .where({ ownerId: _.in(invitedOpenids), status: 'completed', type: _.ne('mall') })
                .limit(1000)
                .get();
            collectInto((ordersRes.data || []));
            const mallRes = await db.collection('orders')
                .where({ ownerId: _.in(invitedOpenids), type: 'mall', status: 'completed' })
                .limit(1000)
                .get();
            collectInto((mallRes.data || []));
            try {
                const feedRes = await db.collection('feedingOrders')
                    .where({ ownerId: _.in(invitedOpenids), status: 'completed' })
                    .limit(1000)
                    .get();
                collectInto((feedRes.data || []));
            }
            catch (e) {
                logger.warn('getInvitedUsers.feedingOrders', {
                    openid,
                    code: e.errCode,
                    msg: e.message,
                });
            }
            try {
                const tuanRes = await db.collection('tuan_orders')
                    .where({ ownerId: _.in(invitedOpenids), status: 'completed' })
                    .limit(1000)
                    .get();
                collectInto((tuanRes.data || []));
            }
            catch (e) {
                logger.warn('getInvitedUsers.tuan_orders', {
                    openid,
                    code: e.errCode,
                    msg: e.message,
                });
            }
            try {
                const actRes = await db.collection('activity_registrations')
                    .where({ ownerId: _.in(invitedOpenids), status: 'completed' })
                    .limit(1000)
                    .get();
                collectInto((actRes.data || []));
            }
            catch (e) {
                logger.warn('getInvitedUsers.activity_registrations', {
                    openid,
                    code: e.errCode,
                    msg: e.message,
                });
            }
        }
        const list = invitedUsers.map((u) => {
            const stats = orderMap[u._id] || { orderCount: 0, totalSpent: 0 };
            return {
                _id: u._id,
                nickName: u.nickName || '未知用户',
                avatarUrl: u.avatarUrl || '',
                createdAt: u.createdAt,
                orderCount: stats.orderCount,
                totalSpent: stats.totalSpent.toFixed(2),
            };
        });
        const result = { list, total: countRes.total };
        return handleSuccess(result);
    }
    catch (error) {
        logger.error('getInvitedUsers', error);
        return handleError(error, '获取邀请用户失败', ERROR_CODES.DATA);
    }
}
exports.getInvitedUsers = getInvitedUsers;
// =====================================================================
// Runtime shim: CommonJS 兼容
// =====================================================================
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _mod = module;
_mod.exports = {
    getReferralStats,
    getInvitedUsers,
};
_mod.exports.default = _mod.exports;
exports.default = {
    getReferralStats,
    getInvitedUsers,
};
