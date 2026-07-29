/* eslint-disable */
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
const { initCloud, handleSuccess, handleError, ERROR_CODES, maskOpenid } = require('./common/utils');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createLogger } = require('./common/logger');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { db } = initCloud();
const _ = db.command;
const $ = db.command.aggregate;
const logger = createLogger('userService:referral');
// =====================================================================
// 辅助函数
// =====================================================================
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
                openid: maskOpenid(openid),
                code: e.errCode,
                msg: e.message,
            });
        }
        if (!user) {
            throw err('NOT_FOUND', '用户不存在');
        }
        // F10 修复：原 limit(500).get() 再取 .length / .map，头部 KOL（受邀>500）统计系统性低估。
        //   改为游标分页拉全量受邀 openid（避免大 limit 截断），totalInvited 用全量长度。
        const invitedOpenids = [];
        let invitedSkip = 0;
        const INVITE_BATCH = 500;
        while (true) {
            const res = await db.collection('users')
                .where({ inviterId: openid })
                .field({ _id: true })
                .skip(invitedSkip)
                .limit(INVITE_BATCH)
                .get();
            const batch = (res.data || []).map((u) => u._id).filter((id) => Boolean(id));
            invitedOpenids.push(...batch);
            if (batch.length < INVITE_BATCH) {
                break;
            }
            invitedSkip += INVITE_BATCH;
        }
        const totalInvited = invitedOpenids.length;
        let consumingCount = 0;
        let totalSpent = 0;
        if (invitedOpenids.length > 0) {
            const spenderOpenids = new Set();
            // L3 修复：原 5 个查询各 limit(1000) 累加，大流量 KOL 统计系统性偏低。
            //   改为服务端聚合（group + sum + addToSet），彻底消除截断。并行 Promise.all + 独立 .catch 容错（沿用 M5）。
            //   ⚠️ orders 集合真实字段是 orderType（非 type）；原 type/type:'mall' 过滤对所有文档恒匹配/恒不匹配，
            //      此处修正为 orderType，mall 桶统计才正确。tuan_orders 金额字段是 totalAmount（L4 修正，原取 totalPrice/price 恒为 0）。
            const [ordersAgg, mallAgg, feedAgg, tuanAgg, actAgg] = await Promise.all([
                db.collection('orders').aggregate()
                    .match({ ownerId: _.in(invitedOpenids), status: 'completed', orderType: _.ne('mall') })
                    .group({ _id: null, total: $.sum('$totalPrice'), owners: $.addToSet('$ownerId') })
                    .end()
                    .catch((e) => { logger.warn('getReferralStats.orders', { openid: maskOpenid(openid), code: e.errCode }); return { data: [] }; }),
                db.collection('orders').aggregate()
                    .match({ ownerId: _.in(invitedOpenids), status: 'completed', orderType: 'mall' })
                    .group({ _id: null, total: $.sum('$totalPrice'), owners: $.addToSet('$ownerId') })
                    .end()
                    .catch((e) => { logger.warn('getReferralStats.mall', { openid: maskOpenid(openid), code: e.errCode }); return { data: [] }; }),
                db.collection('feedingOrders').aggregate()
                    .match({ ownerId: _.in(invitedOpenids), status: 'completed' })
                    .group({ _id: null, total: $.sum('$totalPrice'), owners: $.addToSet('$ownerId') })
                    .end()
                    .catch((e) => { logger.warn('getReferralStats.feedingOrders', { openid: maskOpenid(openid), code: e.errCode }); return { data: [] }; }),
                // L4 修正：tuan_orders 金额字段是 totalAmount（元），原 sumOrderTotal 取 totalPrice/price 恒为 0，团购消费从未计入
                db.collection('tuan_orders').aggregate()
                    .match({ ownerId: _.in(invitedOpenids), status: 'completed' })
                    .group({ _id: null, total: $.sum('$totalAmount'), owners: $.addToSet('$ownerId') })
                    .end()
                    .catch((e) => { logger.warn('getReferralStats.tuan_orders', { openid: maskOpenid(openid), code: e.errCode }); return { data: [] }; }),
                db.collection('activity_registrations').aggregate()
                    .match({ ownerId: _.in(invitedOpenids), status: 'completed' })
                    .group({ _id: null, total: $.sum('$totalPrice'), owners: $.addToSet('$ownerId') })
                    .end()
                    .catch((e) => { logger.warn('getReferralStats.activity_registrations', { openid: maskOpenid(openid), code: e.errCode }); return { data: [] }; }),
            ]);
            const aggRows = [ordersAgg, mallAgg, feedAgg, tuanAgg, actAgg];
            for (const r of aggRows) {
                const row = (r.data || [])[0];
                if (row) {
                    totalSpent += Number(row.total) || 0;
                    (row.owners || []).forEach((o) => { if (o) {
                        spenderOpenids.add(o);
                    } });
                }
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
                openid: maskOpenid(openid),
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
            // L3 修复：原 collectInto 逐条 limit(1000) 累加，大流量 KOL 的受邀用户订单被截断。
            //   改为按 ownerId 的 per-user 聚合（group + sum + count），彻底消除截断。
            //   orderType / tuan.totalAmount 字段修正同 getReferralStats（L3/L4）。
            const mergeAgg = (r) => {
                ;
                (r.data || []).forEach((g) => {
                    const key = g._id;
                    if (!key) {
                        return;
                    }
                    if (!orderMap[key]) {
                        orderMap[key] = { orderCount: 0, totalSpent: 0 };
                    }
                    orderMap[key].orderCount += Number(g.count) || 0;
                    orderMap[key].totalSpent += Number(g.total) || 0;
                });
            };
            const [ordersAgg, mallAgg, feedAgg, tuanAgg, actAgg] = await Promise.all([
                db.collection('orders').aggregate()
                    .match({ ownerId: _.in(invitedOpenids), status: 'completed', orderType: _.ne('mall') })
                    .group({ _id: '$ownerId', count: $.sum(1), total: $.sum('$totalPrice') })
                    .end()
                    .catch((e) => { logger.warn('getInvitedUsers.orders', { openid: maskOpenid(openid), code: e.errCode }); return { data: [] }; }),
                db.collection('orders').aggregate()
                    .match({ ownerId: _.in(invitedOpenids), status: 'completed', orderType: 'mall' })
                    .group({ _id: '$ownerId', count: $.sum(1), total: $.sum('$totalPrice') })
                    .end()
                    .catch((e) => { logger.warn('getInvitedUsers.mall', { openid: maskOpenid(openid), code: e.errCode }); return { data: [] }; }),
                db.collection('feedingOrders').aggregate()
                    .match({ ownerId: _.in(invitedOpenids), status: 'completed' })
                    .group({ _id: '$ownerId', count: $.sum(1), total: $.sum('$totalPrice') })
                    .end()
                    .catch((e) => { logger.warn('getInvitedUsers.feedingOrders', { openid: maskOpenid(openid), code: e.errCode }); return { data: [] }; }),
                // L4 修正：tuan_orders 金额字段是 totalAmount（元）
                db.collection('tuan_orders').aggregate()
                    .match({ ownerId: _.in(invitedOpenids), status: 'completed' })
                    .group({ _id: '$ownerId', count: $.sum(1), total: $.sum('$totalAmount') })
                    .end()
                    .catch((e) => { logger.warn('getInvitedUsers.tuan_orders', { openid: maskOpenid(openid), code: e.errCode }); return { data: [] }; }),
                db.collection('activity_registrations').aggregate()
                    .match({ ownerId: _.in(invitedOpenids), status: 'completed' })
                    .group({ _id: '$ownerId', count: $.sum(1), total: $.sum('$totalPrice') })
                    .end()
                    .catch((e) => { logger.warn('getInvitedUsers.activity_registrations', { openid: maskOpenid(openid), code: e.errCode }); return { data: [] }; }),
            ]);
            mergeAgg(ordersAgg);
            mergeAgg(mallAgg);
            mergeAgg(feedAgg);
            mergeAgg(tuanAgg);
            mergeAgg(actAgg);
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
