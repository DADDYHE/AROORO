/* eslint-disable */
"use strict";
/**
 * orderService/orders.ts - 订单服务（TypeScript 源文件 - Sprint 28 迁移）
 *
 * 业务功能（14 个 handler + 7 个内部 helper）：
 *   1. getOrders                  订单列表（owner / host 双视角）
 *   2. enrichOrders               订单冗余信息补全（pets / host）
 *   3. createOrder                创建订单（含风控限流 + 价格计算）
 *   4. updateOrderStatus          状态机推进（pending → paid → confirmed → ...）
 *   5. getActivityOrders          活动订单列表
 *   6. getActivityOrderDetail     活动订单详情
 *   7. cancelOrder                取消订单（= updateOrderStatus('cancelled')）
 *   8. getOrderDetail             订单详情（含冗余信息）
 *   9. calculatePrice             价格计算（公开）
 *  10. checkDateAvailability      日期可用性（公开）
 *  11. getBoardingOrders          合作伙伴视角的寄养订单
 *  12. getBoardingOrderDetail     合作伙伴订单详情
 *  13. handleBoardingOrder        合作伙伴操作（状态机 + 佣金）
 *  14. submitEvaluation           评价提交（含风控）
 *     getHostEvaluations          寄养家庭评价列表（公开）
 *
 * 关键设计：
 *   - 鉴权：所有 handler 都需 auth（除 calculatePrice / checkDateAvailability / getHostEvaluations 公开）
 *   - 错误：使用 err() 工厂（参数校验），withErrorHandling 包装（统一响应）
 *   - 业务错误：isBusinessError 类型守卫（替代裸字符串 e.code === 'X'）
 *   - 限流：withRateLimit（order / evaluation 类型）
 *   - 风控：detectReviewSpam + mapActionToErrorCode
 *   - 状态机：allowedTransitions 表 + boarding-state-machine（合作伙伴）
 *
 * 迁移目标：
 *   - 强类型化 14 个 handler 的 event / context / auth
 *   - 强类型化订单 / 用户 / 寄养家庭 / 宠物 / 评价文档（复用 common/types）
 *   - 编译产物（orders.js）继续被 index.js require
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.orderService.json
 *   （运行时仍消费 .js 编译产物）
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHostEvaluations = exports.submitEvaluation = exports.handleBoardingOrder = exports.getBoardingOrderDetail = exports.getBoardingOrders = exports.checkDateAvailability = exports.calculatePrice = exports.getOrderDetail = exports.cancelOrder = exports.getActivityOrderDetail = exports.getActivityOrders = exports.updateOrderStatus = exports.createOrder = exports.enrichOrders = exports.getOrders = void 0;
// Sprint 28 迁移说明：
//   - 仍消费 .js 编译产物（tsc 输出到 cloudfunctions/orderService/orders.js）
//   - 对 .js 文件（utils / errors / risk-control / risk-rate-limit / normalize / boarding-state-machine）使用 require() 而非 import
//   - 强类型作用于 common/* 与本文件内部接口
//   - handler 在 module.exports 时统一用 withErrorHandling 包装
const utils_1 = require("../common/utils");
const logger_1 = require("../common/logger");
// service 内部 .js 模块走 CommonJS require
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { err, isBusinessError, withErrorHandling } = require('./common/errors');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { detectReviewSpam, mapActionToErrorCode } = require('./common/risk-control');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { withRateLimit } = require('../common/risk-rate-limit');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { normalizeDbError } = require('../common/normalize');
/** 订单状态机允许的转换 */
const ALLOWED_TRANSITIONS = {
    pending: ['paid', 'confirmed', 'cancelled'],
    paid: ['confirmed', 'cancelled'],
    confirmed: ['in_progress', 'ongoing', 'cancelled', 'completed'],
    in_progress: ['completed', 'cancelled'],
    ongoing: ['completed'],
    completed: [],
    cancelled: [],
};
/** 状态中文映射（订单状态通知） */
const STATUS_TEXT_MAP = {
    pending: '待确认',
    confirmed: '已确认',
    ongoing: '寄养中',
    in_progress: '寄养中',
    completed: '已结束',
    cancelled: '已取消',
};
/** 寄养家庭档案敏感字段（不写入订单文档） */
const SENSITIVE_HOST_FIELDS = [
    'idCard', 'idCardFront', 'idCardBack', 'healthCertificate', 'emergencyContactPhone',
];
// =====================================================================
// 模块初始化
// =====================================================================
const { db } = (0, utils_1.initCloud)();
const _ = db.command;
const logger = (0, logger_1.createLogger)('orderService');
// =====================================================================
// 内部辅助
// =====================================================================
/** 计算日期范围（today / week / month / last_month / default） */
function getDateRange(range) {
    const now = new Date();
    let startDate = null;
    let endDate = null;
    switch (range) {
        case 'today':
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
            break;
        case 'week': {
            const dayOfWeek = now.getDay();
            const weekStart = new Date(now);
            weekStart.setDate(now.getDate() - dayOfWeek);
            weekStart.setHours(0, 0, 0, 0);
            startDate = weekStart;
            endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
            break;
        }
        case 'month':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
            break;
        case 'last_month': {
            const lastMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
            const lastMonthYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
            startDate = new Date(lastMonthYear, lastMonth, 1);
            endDate = new Date(lastMonthYear, lastMonth + 1, 0, 23, 59, 59);
            break;
        }
        default:
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    }
    return { startDate, endDate };
}
/** 内部：检查日期是否可用（精确版） */
async function checkDateAvailabilityInternal(hostId, startDate, endDate) {
    try {
        const existingOrders = await db.collection('orders')
            .where({
            hostId,
            status: db.command.in(['confirmed', 'ongoing']),
        })
            .field({ startDate: true, endDate: true })
            .limit(100)
            .get();
        return existingOrders.data.length === 0;
    }
    catch (error) {
        logger.error('_checkDateAvailability', { msg: error?.message });
        return false;
    }
}
/** 内部：发送订单状态变更通知（双端：owner + organizer） */
async function sendOrderNotification(orderId, status) {
    try {
        const order = await db.collection('orders').doc(orderId).get();
        if (!order.data) {
            return;
        }
        const notification = {
            type: 'order_status_change',
            orderId,
            status,
            statusText: STATUS_TEXT_MAP[status] || status,
            ownerId: '',
            isRead: false,
            createdAt: db.serverDate(),
        };
        await db.collection('notifications').add({
            data: { ...notification, ownerId: order.data.ownerId, isRead: false },
        });
        await db.collection('notifications').add({
            data: { ...notification, ownerId: order.data.organizerId, isRead: false },
        });
    }
    catch (error) {
        logger.error('_sendOrderNotification', { msg: error?.message });
    }
}
/** 内部：检查合作伙伴权限（admins 集合） */
async function checkPartnerPermission(openid, permission) {
    const adminRes = await db.collection('admins')
        .where({ _id: openid, status: 'active' })
        .limit(1)
        .get();
    if (!adminRes.data || adminRes.data.length === 0) {
        throw err('PARTNER_REQUIRED', '无合作伙伴权限');
    }
    const admin = adminRes.data[0];
    const roles = admin.roles || [];
    if (roles.includes('super_admin')) {
        return admin;
    }
    const perms = admin.permissions || [];
    if (!perms.includes(permission)) {
        throw err('PERMISSION_DENIED', `权限不足：需要 ${permission} 权限`);
    }
    return admin;
}
/** 内部：创建佣金记录（best-effort） */
async function createCommissionRecordInternal(orderType, order) {
    try {
        const o = order;
        if (!o.ownerId) {
            return;
        }
        let user = null;
        try {
            const userRes = await db.collection('users').doc(o.ownerId).field({ _id: true, inviterId: true }).get();
            user = userRes.data;
        }
        catch (e) {
            return;
        }
        if (!user || !user.inviterId) {
            return;
        }
        let config = {};
        try {
            const configRes = await db.collection('system_config').doc('commission_rates').get();
            config = (configRes.data || {});
        }
        catch (e) {
            return;
        }
        const rate = config[orderType] !== undefined ? Number(config[orderType]) : 0;
        if (!rate || rate <= 0) {
            return;
        }
        const orderAmount = Number(o.totalAmount || o.totalPrice || o.basicPrice || 0);
        if (orderAmount <= 0) {
            return;
        }
        const commissionAmount = Math.round(orderAmount * rate / 100 * 100) / 100;
        let inviter = null;
        try {
            const inviterRes = await db.collection('users').doc(user.inviterId).field({ _id: true, nickName: true }).get();
            inviter = inviterRes.data;
        }
        catch (e) {
            return;
        }
        if (!inviter) {
            return;
        }
        const existRes = await db.collection('tuan_commissions').where({
            orderNo: o.orderNo || o._id,
            inviterId: user.inviterId,
        }).count();
        if (existRes.total > 0) {
            return;
        }
        await db.collection('tuan_commissions').add({
            data: {
                _id: (0, utils_1.generateId)('commission', o.ownerId),
                inviterId: user.inviterId,
                inviterNickName: inviter.nickName || '',
                ownerId: user._id,
                orderType,
                orderId: o._id,
                orderNo: o.orderNo || o._id,
                orderAmount,
                commissionRate: rate,
                commissionAmount,
                status: 'pending',
                createdAt: db.serverDate(),
                updatedAt: db.serverDate(),
            },
        });
    }
    catch (e) {
        logger.error('_createCommissionRecord', { msg: e?.message });
    }
}
/** 内部：重算 host.rating / host.ratingCount */
async function recalcHostRating(hostId) {
    if (!hostId) {
        return;
    }
    const statsRes = await db.collection('evaluations')
        .where({ hostId })
        .field({ rating: true })
        .limit(1000)
        .get();
    const list = (statsRes.data || []);
    const count = list.length;
    if (count === 0) {
        await db.collection('hostProfiles').doc(hostId).update({
            data: { rating: 0, ratingCount: 0, lastEvaluatedAt: db.serverDate() },
        });
        return;
    }
    const sum = list.reduce((acc, e) => acc + (Number(e.rating) || 0), 0);
    const avg = Math.round((sum / count) * 10) / 10;
    await db.collection('hostProfiles').doc(hostId).update({
        data: {
            rating: avg,
            ratingCount: count,
            lastEvaluatedAt: db.serverDate(),
        },
    });
}
// =====================================================================
// Handler 实现
// =====================================================================
/**
 * 1. getOrders - 订单列表（owner / host 双视角）
 */
async function getOrders(event, _context, auth) {
    const openid = auth?.openid;
    if (!openid) {
        throw err('AUTH_REQUIRED', '未登录');
    }
    const { role, status, page = 1, pageSize = 10, dateRange } = event;
    const query = {};
    if (role === 'owner') {
        query.ownerId = openid;
    }
    else if (role === 'host') {
        query.organizerId = openid;
    }
    else {
        throw err('INVALID_PARAMS', '无效的角色类型');
    }
    if (status && status !== 'all') {
        if (status === 'in_progress') {
            query.status = db.command.in(['in_progress', 'confirmed', 'ongoing']);
        }
        else {
            query.status = status;
        }
    }
    if (dateRange) {
        const { startDate, endDate } = getDateRange(dateRange);
        if (startDate && endDate) {
            const gteOp = db.command.gte(startDate.getTime());
            const lteOp = db.command.lte(endDate.getTime());
            query.createdAt = gteOp.and(lteOp);
        }
    }
    const result = await db.collection('orders').where(query)
        .field({
        _id: true, ownerId: true, hostId: true, organizerId: true,
        petIds: true, startDate: true, endDate: true, duration: true, totalPrice: true,
        status: true, note: true, createdAt: true, updatedAt: true,
        petsInfo: true, hostInfo: true, ownerInfo: true, paymentStatus: true, paidAt: true,
        orderType: true, activityId: true, activityTitle: true, activityCoverUrl: true,
        activityStartTime: true, activityEndTime: true, activityLocation: true,
        phone: true, notes: true, pricePerDay: true, petCount: true, basicPrice: true,
        originalAmount: true, couponId: true, couponDiscount: true,
    })
        .orderBy('createdAt', 'desc')
        .skip((Number(page) - 1) * Number(pageSize))
        .limit(Number(pageSize))
        .get();
    const countResult = await db.collection('orders').where(query).count();
    const enrichedOrders = await enrichOrders((result.data || []));
    return (0, utils_1.handleSuccess)({
        list: enrichedOrders,
        total: countResult.total,
        page: Number(page),
        pageSize: Number(pageSize),
        totalPages: Math.ceil(countResult.total / Number(pageSize)),
    }, '获取成功');
}
exports.getOrders = getOrders;
/**
 * 2. enrichOrders - 订单冗余信息补全（pets / host）
 */
async function enrichOrders(orders) {
    if (!orders || orders.length === 0) {
        return orders;
    }
    const result = orders.map((raw) => {
        const enriched = { ...raw };
        if (enriched.petsInfo && enriched.petsInfo.length > 0) {
            enriched.pets = enriched.petsInfo;
        }
        if (enriched.hostInfo) {
            enriched.hostName = enriched.hostName || enriched.hostInfo.hostName || '';
            enriched.hostAvatar = enriched.hostAvatar || enriched.hostInfo.avatarUrl || '';
        }
        return enriched;
    });
    const ordersNeedEnrich = result.filter(order => !order.pets || !order.pets.length || !order.hostName);
    if (ordersNeedEnrich.length > 0) {
        const petIds = [...new Set(ordersNeedEnrich.flatMap(o => o.petIds || []))];
        const hostIds = [...new Set(ordersNeedEnrich.map(o => o.hostId).filter(Boolean))];
        const petMap = {};
        const hostMap = {};
        if (petIds.length > 0) {
            const petRes = await db.collection('pets').where({ _id: db.command.in(petIds) }).get();
            (petRes.data || []).forEach(p => { petMap[p._id] = p; });
        }
        if (hostIds.length > 0) {
            const hostRes = await db.collection('hostProfiles').where({ _id: db.command.in(hostIds) }).get();
            (hostRes.data || []).forEach(h => { hostMap[h._id] = h; });
        }
        result.forEach(order => {
            if (!order.pets || !order.pets.length) {
                order.pets = (order.petIds || []).map(id => petMap[id]).filter(Boolean);
            }
            if (!order.hostName && hostMap[order.hostId || '']) {
                const host = hostMap[order.hostId || ''];
                order.hostName = host.hostName || host.name || '';
                order.hostAvatar = host.avatarUrl || '';
            }
        });
    }
    return result;
}
exports.enrichOrders = enrichOrders;
/**
 * 3. createOrder - 创建订单
 */
async function createOrder(event, _context, auth) {
    const openid = auth?.openid;
    if (!openid) {
        throw err('AUTH_REQUIRED', '未登录');
    }
    const { hostId, petIds, startDate, endDate, note, couponId, couponDiscount, originalAmount } = event;
    if (!hostId || !petIds || !startDate || !endDate) {
        throw err('INVALID_PARAMS', '缺少必要参数');
    }
    const ownerId = openid;
    let ownerInfo = {};
    try {
        const owner = await db.collection('users').doc(openid).get();
        ownerInfo = { ...owner.data };
    }
    catch (e) {
        logger.warn('createOrder.users.fetch', { openid, code: e.errCode, msg: e.message });
    }
    const host = await db.collection('hostProfiles').doc(hostId).get();
    if (!host.data) {
        throw err('NOT_FOUND', '寄养家庭不存在');
    }
    const hostInfo = { ...host.data };
    SENSITIVE_HOST_FIELDS.forEach(f => { delete hostInfo[f]; });
    const petList = [];
    if (petIds && petIds.length > 0) {
        const petsRes = await db.collection('pets')
            .where({ _id: db.command.in(petIds) })
            .get();
        petList.push(...(petsRes.data || []));
        if (petList.length !== petIds.length) {
            throw err('PET_NOT_FOUND', '宠物档案不存在或已删除');
        }
    }
    const isAvailable = await checkDateAvailabilityInternal(hostId, startDate, endDate);
    if (!isAvailable) {
        throw err('BUSINESS_ERROR', '所选日期已被预订');
    }
    const pricePerDay = host.data.pricePerDay || 0;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    if (days < 1) {
        throw err('INVALID_PARAMS', '结束日期必须晚于开始日期');
    }
    const petCount = Array.isArray(petIds) ? petIds.length : 1;
    const calculatedPrice = pricePerDay * days * petCount;
    const order = {
        ownerId,
        hostId,
        organizerId: hostInfo.openid || hostId,
        petIds,
        startDate,
        endDate,
        duration: days,
        pricePerDay,
        petCount,
        basicPrice: calculatedPrice,
        originalAmount: originalAmount || calculatedPrice,
        totalPrice: calculatedPrice,
        couponId: couponId || '',
        couponDiscount: Number(couponDiscount) || 0,
        note: note || '',
        status: 'pending',
        paymentStatus: 'unpaid',
        createdAt: db.serverDate(),
        updatedAt: db.serverDate(),
        ownerInfo,
        hostInfo,
        petsInfo: petList,
        ownerName: ownerInfo.nickName || '',
        ownerPhone: ownerInfo.phone || '',
        hostName: hostInfo.hostName || '',
    };
    order._id = (0, utils_1.generateId)('order', openid);
    let result;
    try {
        result = await withRateLimit({ userId: openid, type: 'order', targetId: hostId }, () => db.collection('orders').add({ data: order }));
    }
    catch (e) {
        logger.error('createOrder', { msg: e?.message });
        if (isBusinessError(e) && e.code === 'RATE_LIMITED') {
            throw e;
        }
        if (isBusinessError(e) && e.code === 'DUPLICATE_KEY') {
            throw e;
        }
        const normalized = normalizeDbError(e);
        if (!normalized || normalized === e) {
            throw err('ORDER_CREATE_FAILED', '订单创建失败，请重试');
        }
        throw normalized;
    }
    return (0, utils_1.handleSuccess)({ orderId: result._id, ...order }, '创建成功');
}
exports.createOrder = createOrder;
/**
 * 4. updateOrderStatus - 状态机推进
 */
async function updateOrderStatus(event, _context, auth) {
    const openid = auth?.openid;
    if (!openid) {
        throw err('AUTH_REQUIRED', '未登录');
    }
    const { orderId, status } = event;
    if (!orderId || !status) {
        throw err('INVALID_PARAMS', '缺少必要参数');
    }
    const order = await db.collection('orders').doc(orderId).get();
    if (!order.data) {
        throw err('NOT_FOUND', '订单不存在');
    }
    const od = order.data;
    const isHost = od.organizerId === openid;
    const isOwner = od.ownerId === openid;
    if (!isHost && !isOwner) {
        throw err('PERMISSION_DENIED', '无权操作该订单');
    }
    if (status === 'cancelled' && od.refundStatus === 'completed') {
        throw err('ORDER_ALREADY_REFUNDED', '订单已退款，不能再次取消');
    }
    if (od.status === 'pending' && od.timeoutAt && Date.now() > od.timeoutAt) {
        throw err('ORDER_TIMEOUT', '订单已超时未支付');
    }
    const allowed = ALLOWED_TRANSITIONS[od.status];
    if (!allowed || !allowed.includes(status)) {
        throw err('BUSINESS_ERROR', '状态变更无效');
    }
    await db.collection('orders').doc(orderId).update({
        data: { status, updatedAt: db.serverDate() },
    });
    sendOrderNotification(orderId, status).catch(() => { });
    return (0, utils_1.handleSuccess)({ orderId, status }, '更新成功');
}
exports.updateOrderStatus = updateOrderStatus;
/**
 * 5. getActivityOrders - 活动订单列表
 */
async function getActivityOrders(event, _context, auth) {
    const openid = auth?.openid;
    if (!openid) {
        throw err('AUTH_REQUIRED', '未登录');
    }
    const { status, page = 1, pageSize = 20 } = event;
    const query = {
        ownerId: openid,
        orderType: 'activity',
    };
    if (status && status !== 'all') {
        query.status = status;
    }
    const result = await db.collection('orders').where(query)
        .orderBy('createdAt', 'desc')
        .skip((Number(page) - 1) * Number(pageSize))
        .limit(Number(pageSize))
        .get();
    const countResult = await db.collection('orders').where(query).count();
    return (0, utils_1.handleSuccess)({
        list: result.data || [],
        total: countResult.total,
        page: Number(page),
        pageSize: Number(pageSize),
        totalPages: Math.ceil(countResult.total / Number(pageSize)),
    }, '获取成功');
}
exports.getActivityOrders = getActivityOrders;
/**
 * 6. getActivityOrderDetail - 活动订单详情
 */
async function getActivityOrderDetail(event, _context, auth) {
    const openid = auth?.openid;
    if (!openid) {
        throw err('AUTH_REQUIRED', '未登录');
    }
    const { orderId } = event;
    if (!orderId) {
        throw err('INVALID_PARAMS', '缺少订单ID');
    }
    const order = await db.collection('orders').doc(orderId).get();
    if (!order.data) {
        throw err('NOT_FOUND', '订单不存在');
    }
    const od = order.data;
    if (od.orderType !== 'activity') {
        throw err('INVALID_PARAMS', '不是活动订单');
    }
    if (od.ownerId !== openid && od.organizerId !== openid) {
        throw err('PERMISSION_DENIED', '只能查看自己的订单');
    }
    return (0, utils_1.handleSuccess)(od, '获取成功');
}
exports.getActivityOrderDetail = getActivityOrderDetail;
/**
 * 7. cancelOrder - 取消订单（= updateOrderStatus('cancelled')）
 */
async function cancelOrder(event, _context, auth) {
    ;
    event.status = 'cancelled';
    return updateOrderStatus(event, _context, auth);
}
exports.cancelOrder = cancelOrder;
/**
 * 8. getOrderDetail - 订单详情
 */
async function getOrderDetail(event, _context, auth) {
    const openid = auth?.openid;
    if (!openid) {
        throw err('AUTH_REQUIRED', '未登录');
    }
    const { orderId, outTradeNo } = event;
    if (!orderId && !outTradeNo) {
        throw err('INVALID_PARAMS', '缺少订单ID或交易单号');
    }
    let order = null;
    if (orderId) {
        order = await db.collection('orders').doc(orderId).get();
    }
    else {
        const res = await db.collection('orders').where({ outTradeNo }).limit(1).get();
        if (res.data && res.data.length > 0) {
            order = { data: res.data[0] };
        }
    }
    if (!order || !order.data) {
        throw err('NOT_FOUND', '订单不存在');
    }
    const od = order.data;
    const isHost = od.organizerId === openid;
    const isOwner = od.ownerId === openid;
    if (!isHost && !isOwner) {
        throw err('PERMISSION_DENIED', '只能查看自己的订单');
    }
    const [enriched] = await enrichOrders([order.data]);
    return (0, utils_1.handleSuccess)(enriched, '获取成功');
}
exports.getOrderDetail = getOrderDetail;
/**
 * 9. calculatePrice - 价格计算（公开）
 */
async function calculatePrice(event) {
    const { hostId, startDate, endDate, petIds } = event;
    if (!hostId || !startDate || !endDate) {
        throw err('INVALID_PARAMS', '缺少必要参数');
    }
    const host = await db.collection('hostProfiles').doc(hostId).get();
    if (!host.data) {
        throw err('NOT_FOUND', '寄养家庭不存在');
    }
    const pricePerDay = host.data.pricePerDay || 0;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const petCount = Array.isArray(petIds) ? petIds.length : 1;
    const totalPrice = pricePerDay * days * petCount;
    return (0, utils_1.handleSuccess)({ pricePerDay, days, totalPrice }, '计算成功');
}
exports.calculatePrice = calculatePrice;
/**
 * 10. checkDateAvailability - 日期可用性（公开）
 */
async function checkDateAvailability(event) {
    const { hostId, startDate, endDate } = event;
    if (!startDate || !endDate) {
        return (0, utils_1.handleSuccess)({ available: false }, '缺少日期参数');
    }
    try {
        const existingOrders = await db.collection('orders')
            .where({
            hostId: hostId || '',
            status: db.command.in(['confirmed', 'ongoing']),
        })
            .field({ startDate: true, endDate: true })
            .limit(100)
            .get();
        const requestStart = new Date(startDate).getTime();
        const requestEnd = new Date(endDate).getTime();
        const hasOverlap = (existingOrders.data || []).some(o => {
            const orderStart = new Date(o.startDate).getTime();
            const orderEnd = new Date(o.endDate).getTime();
            return orderStart < requestEnd && orderEnd > requestStart;
        });
        return (0, utils_1.handleSuccess)({ available: !hasOverlap }, '查询成功');
    }
    catch (error) {
        return (0, utils_1.handleSuccess)({ available: false }, '查询失败');
    }
}
exports.checkDateAvailability = checkDateAvailability;
/**
 * 11. getBoardingOrders - 合作伙伴视角的寄养订单
 */
async function getBoardingOrders(event, _context, auth) {
    const openid = auth?.openid;
    if (!openid) {
        throw err('AUTH_REQUIRED', '未登录');
    }
    const admin = await checkPartnerPermission(openid, 'hosting');
    const { status, page = 1, pageSize = 20 } = event;
    const where = {};
    if (status) {
        where.status = status;
    }
    where.type = db.command.nin(['mall', 'group_buy']);
    where.orderType = db.command.nin(['activity']);
    const roles = admin.roles || [];
    const perms = admin.permissions || [];
    if (!roles.includes('super_admin') && !perms.includes('hosting')) {
        const hostProfileRes = await db.collection('hostProfiles')
            .where({ openid }).limit(1).get();
        if (hostProfileRes.data && hostProfileRes.data.length > 0) {
            where.hostId = hostProfileRes.data[0]._id;
        }
    }
    const result = await (0, utils_1.paginate)(db, 'orders', { page, pageSize, where });
    const enrichedList = (result.list || []).map((raw) => {
        const enriched = { ...raw };
        if (enriched.ownerInfo) {
            enriched.ownerName = enriched.ownerName || enriched.ownerInfo.nickName || '';
            enriched.ownerPhone = enriched.ownerPhone || enriched.ownerInfo.phone || '';
        }
        if (enriched.hostInfo) {
            enriched.hostName = enriched.hostName || enriched.hostInfo.hostName || '';
            enriched.hostPhone = enriched.hostPhone || enriched.hostInfo.phone || '';
        }
        enriched.orderNo = enriched.orderNo || enriched._id || '';
        enriched.buyerNickName = enriched.ownerName || enriched.ownerInfo?.nickName || '';
        enriched.productName = enriched.hostName ? `寄养 - ${enriched.hostName}` : '寄养服务';
        enriched.totalAmount = enriched.totalAmount || enriched.totalPrice || enriched.basicPrice || 0;
        return enriched;
    });
    return (0, utils_1.handleSuccess)({ ...result, list: enrichedList });
}
exports.getBoardingOrders = getBoardingOrders;
/**
 * 12. getBoardingOrderDetail - 合作伙伴订单详情
 */
async function getBoardingOrderDetail(event, _context, auth) {
    const openid = auth?.openid;
    if (!openid) {
        throw err('AUTH_REQUIRED', '未登录');
    }
    await checkPartnerPermission(openid, 'hosting');
    const { orderId } = event;
    if (!orderId) {
        throw err('INVALID_PARAMS', '缺少订单ID');
    }
    const res = await db.collection('orders').doc(orderId).get();
    if (!res.data) {
        throw err('NOT_FOUND', '订单不存在');
    }
    const order = { ...res.data };
    if (order.ownerInfo) {
        order.ownerName = order.ownerName || order.ownerInfo.nickName || '';
        order.ownerPhone = order.ownerPhone || order.ownerInfo.phone || '';
    }
    if (order.hostInfo) {
        order.hostName = order.hostName || order.hostInfo.hostName || '';
        order.hostPhone = order.hostPhone || order.hostInfo.phone || '';
    }
    if (order.petsInfo && order.petsInfo.length > 0) {
        order.pets = order.petsInfo;
    }
    if (!order.pets && order.petIds && order.petIds.length > 0) {
        try {
            const petRes = await db.collection('pets').where({ _id: db.command.in(order.petIds) }).get();
            const petMap = {};
            (petRes.data || []).forEach(p => { petMap[p._id] = p; });
            order.pets = order.petIds.map(id => petMap[id]).filter(Boolean);
        }
        catch (e) {
            order.pets = [];
        }
    }
    if (!order.ownerName && !order.ownerPhone && order.ownerId) {
        try {
            const userRes = await db.collection('users').doc(order.ownerId)
                .field({ _id: true, nickName: true, phone: true })
                .get();
            if (userRes.data) {
                const u = userRes.data;
                order.ownerName = order.ownerName || u.nickName || '';
                order.ownerPhone = order.ownerPhone || u.phone || '';
            }
        }
        catch (e) {
            logger.warn('getBoardingOrderDetail.users.fetch', { orderId, code: e.errCode, msg: e.message });
        }
    }
    if (!order.hostName && !order.hostPhone && order.hostId) {
        try {
            const hostRes = await db.collection('hostProfiles').doc(order.hostId).get();
            if (hostRes.data) {
                const h = hostRes.data;
                order.hostName = order.hostName || h.hostName || h.name || '';
                order.hostPhone = order.hostPhone || h.phone || '';
            }
        }
        catch (e) {
            logger.warn('getBoardingOrderDetail.hostProfiles.fetch', { orderId, code: e.errCode, msg: e.message });
        }
    }
    order.days = order.duration;
    order.notes = order.note;
    order.price = order.totalPrice;
    return (0, utils_1.handleSuccess)(order);
}
exports.getBoardingOrderDetail = getBoardingOrderDetail;
/**
 * 13. handleBoardingOrder - 合作伙伴操作（状态机 + 佣金）
 */
async function handleBoardingOrder(event, _context, auth) {
    const openid = auth?.openid;
    if (!openid) {
        throw err('AUTH_REQUIRED', '未登录');
    }
    await checkPartnerPermission(openid, 'hosting');
    const { orderId, operation } = event;
    if (!orderId) {
        throw err('INVALID_PARAMS', '缺少订单ID');
    }
    if (!operation) {
        throw err('INVALID_PARAMS', '缺少操作类型');
    }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getTargetStatusByOperation, canPerformOperation } = require('./common/boarding-state-machine');
    const newStatus = getTargetStatusByOperation(operation);
    if (!newStatus) {
        throw err('INVALID_PARAMS', '无效操作');
    }
    const orderRes = await db.collection('orders').doc(orderId).get();
    if (!orderRes.data) {
        throw err('NOT_FOUND', '订单不存在');
    }
    if (!canPerformOperation(orderRes.data.status, operation)) {
        throw err('STATE_INVALID', `无法从 ${orderRes.data.status} 变更为 ${newStatus}`);
    }
    await db.collection('orders').doc(orderId).update({
        data: { status: newStatus, updatedAt: db.serverDate() },
    });
    if (newStatus === 'completed') {
        await createCommissionRecordInternal('hosting', orderRes.data);
    }
    sendOrderNotification(orderId, newStatus).catch(() => { });
    return (0, utils_1.handleSuccess)({ orderId, status: newStatus }, '操作成功');
}
exports.handleBoardingOrder = handleBoardingOrder;
/**
 * 14. submitEvaluation - 评价提交（含风控）
 */
async function submitEvaluation(event, _context, auth) {
    const openid = auth?.openid;
    if (!openid) {
        throw err('AUTH_REQUIRED', '未登录');
    }
    const { orderId, rating, comment, tags = [] } = event;
    if (!orderId) {
        throw err('INVALID_PARAMS', '缺少订单ID');
    }
    const ratingNum = Number(rating);
    if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
        throw err('INVALID_PARAMS', '评分必须为 1-5 的整数');
    }
    const orderRes = await db.collection('orders').doc(orderId).get();
    if (!orderRes.data) {
        throw err('ORDER_NOT_FOUND', '订单不存在');
    }
    const order = orderRes.data;
    if (order.ownerId !== openid) {
        throw err('PERMISSION_DENIED', '只能评价自己的订单');
    }
    if (order.status !== 'completed') {
        throw err('BUSINESS_ERROR', '仅已完成订单可评价');
    }
    const safeComment = String(comment || '').slice(0, 500);
    let pendingReview = false;
    let riskDecision = 'RISK_PASS';
    let riskReasons = [];
    try {
        const risk = await withRateLimit({ userId: openid, type: 'evaluation', targetId: order.hostId }, () => detectReviewSpam({
            db,
            userId: openid,
            hostId: order.hostId,
            orderId,
            rating: ratingNum,
            comment: safeComment,
        }));
        riskDecision = mapActionToErrorCode(risk.action);
        riskReasons = risk.reasons;
        if (risk.action === 'reject') {
            logger.warn('submitEvaluation.risk_reject', { orderId, userId: openid, reasons: risk.reasons });
            throw err('RISK_REJECT', '评价被风控拦截', {
                reasons: risk.reasons,
                level: risk.level,
                orderId,
            });
        }
        if (risk.action === 'review') {
            pendingReview = true;
            logger.info('submitEvaluation.risk_pending', { orderId, userId: openid, reasons: risk.reasons });
        }
        else {
            logger.debug?.('submitEvaluation.risk_pass', { orderId, userId: openid });
        }
    }
    catch (e) {
        if (isBusinessError(e) && e.code === 'RATE_LIMITED') {
            logger.warn('submitEvaluation.rate_limited', { orderId, userId: openid, msg: e.message });
            throw e;
        }
        if (isBusinessError(e) && e.code === 'RISK_REJECT') {
            throw e;
        }
        logger.warn('submitEvaluation.risk_control_error', { orderId, msg: e?.message });
        riskDecision = 'RISK_PASS';
    }
    const existRes = await db.collection('evaluations')
        .where({ orderId }).limit(1).get();
    if (existRes.data && existRes.data.length > 0) {
        return (0, utils_1.handleSuccess)({ ...existRes.data[0], duplicate: true }, '已评价过该订单');
    }
    const evaluation = {
        _id: (0, utils_1.generateId)('eval', openid),
        orderId,
        hostId: order.hostId,
        organizerId: order.organizerId || '',
        ownerId: openid,
        rating: ratingNum,
        comment: safeComment,
        tags: Array.isArray(tags) ? tags.slice(0, 10) : [],
        pendingReview,
        createdAt: db.serverDate(),
        updatedAt: db.serverDate(),
    };
    try {
        await db.collection('evaluations').add({ data: evaluation });
    }
    catch (e) {
        if (isBusinessError(e) && e.code === 'DUPLICATE_KEY') {
            return (0, utils_1.handleSuccess)({ orderId, duplicate: true }, '已评价过该订单');
        }
        throw e;
    }
    recalcHostRating(order.hostId).catch(e => {
        logger.warn('_recalcHostRating', { hostId: order.hostId, msg: e.message });
    });
    return (0, utils_1.handleSuccess)({
        ...evaluation,
        riskDecision,
        riskReasons: pendingReview ? riskReasons : [],
    }, pendingReview ? '评价已记录，等待运营抽检' : '评价成功');
}
exports.submitEvaluation = submitEvaluation;
/**
 * getHostEvaluations - 寄养家庭评价列表（公开）
 */
async function getHostEvaluations(event) {
    const { hostId, page = 1, pageSize = 10 } = event;
    if (!hostId) {
        throw err('INVALID_PARAMS', '缺少 hostId');
    }
    const safePage = Math.max(1, Number(page) || 1);
    const safePageSize = Math.min(Math.max(1, Number(pageSize) || 10), 50);
    const where = { hostId };
    const res = await db.collection('evaluations').where(where)
        .orderBy('createdAt', 'desc')
        .skip((safePage - 1) * safePageSize)
        .limit(safePageSize)
        .get();
    const countRes = await db.collection('evaluations').where(where).count();
    return (0, utils_1.handleSuccess)({
        list: res.data || [],
        total: countRes.total,
        page: safePage,
        pageSize: safePageSize,
        totalPages: Math.ceil(countRes.total / safePageSize),
    }, '获取成功');
}
exports.getHostEvaluations = getHostEvaluations;
// =====================================================================
// 默认导出（保持 CommonJS 兼容：module.exports = { handler: withErrorHandling(...) }）
// =====================================================================
const _handlers = {
    getOrders: withErrorHandling(getOrders),
    enrichOrders,
    createOrder: withErrorHandling(createOrder),
    updateOrderStatus: withErrorHandling(updateOrderStatus),
    getActivityOrders: withErrorHandling(getActivityOrders),
    getActivityOrderDetail: withErrorHandling(getActivityOrderDetail),
    cancelOrder: withErrorHandling(cancelOrder),
    getOrderDetail: withErrorHandling(getOrderDetail),
    calculatePrice: withErrorHandling(calculatePrice),
    checkDateAvailability: withErrorHandling(checkDateAvailability),
    getBoardingOrders: withErrorHandling(getBoardingOrders),
    getBoardingOrderDetail: withErrorHandling(getBoardingOrderDetail),
    handleBoardingOrder: withErrorHandling(handleBoardingOrder),
    submitEvaluation: withErrorHandling(submitEvaluation),
    getHostEvaluations: withErrorHandling(getHostEvaluations),
};
// Runtime shim: 把 module.exports 指向包装后的 handlers
// (兼容原 CommonJS 模式 `module.exports = { ... }`，
//  避免消费方需用 .default 才能取到包装后的 handler)
// TypeScript 默认会把 `export default` 编译为 `exports.default = { ... }`，
// 但 orders.js 的消费方（index.js + 单元测试）直接 `require('./orders')` 后
// 期望 orders.getOrders === withErrorHandling(getOrders)。因此需要这个 shim。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _mod = module;
_mod.exports = _handlers;
_handlers.default = _handlers;
exports.default = _handlers;
