"use strict";
/**
 * tuanService/index.ts - 团购服务（TypeScript 源文件 - Sprint 46 迁移）
 *
 * 业务功能：
 *   - getTuanDealList - 拉取团购列表（分页 + 状态过滤 + 计算 minPrice）
 *   - getTuanDealDetail - 拉取团购详情（含 SKU 维度 minPrice 计算）
 *   - createTuanOrder - 创建团购订单（含库存扣减 + 双订单写入）
 *
 * 迁移目标：
 *   - 强类型化 3 个 action handler 签名
 *   - 复用 AuthLike / CloudEvent / CloudContext 公共类型
 *   - 抽离 TUAN_DEAL_LIST_FIELDS 与 WRITE_ACTIONS 常量
 *   - computeMinPrice 工具函数强类型化
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.tuanService.json
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = exports.createTuanOrder = exports.getTuanDealDetail = exports.getTuanDealList = exports.computeMinPrice = exports.MAX_PAGE_SIZE = exports.DEFAULT_PAGE_SIZE = exports.WRITE_ACTIONS = exports.TUAN_DEAL_LIST_FIELDS = void 0;
// =====================================================================
// 内部模块初始化
// =====================================================================
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { err } = require('./common/errors');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { initCloud, handleSuccess, handleError, generateId, ERROR_CODES, paginate } = require('./common/utils');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createLogger } = require('./common/logger');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { verifyAuth } = require('./common/auth-middleware');
const { cloud, db } = initCloud();
const logger = createLogger('tuanService');
const _ = db.command;
// =====================================================================
// 常量
// =====================================================================
exports.TUAN_DEAL_LIST_FIELDS = {
    _id: true, title: true, coverUrl: true, description: true, images: true,
    products: true, startTime: true, endTime: true, status: true,
    totalOrders: true, totalAmount: true, createdAt: true,
};
exports.WRITE_ACTIONS = [
    'createTuanOrder',
    'shipTuanOrder',
    'confirmReceiveTuanOrder',
    'cancelTuanOrder',
];
exports.DEFAULT_PAGE_SIZE = 10;
exports.MAX_PAGE_SIZE = 100;
// =====================================================================
// 辅助函数：计算最低价
// =====================================================================
/**
 * 计算团购内商品的最低价（用于列表展示与详情展示）
 *   - 优先 SKU 维度
 *   - 回退商品 tuanPrice
 */
function computeMinPrice(products) {
    let min = Infinity;
    for (const p of products) {
        if (p.skuType === 'multi' && p.skus && p.skus.length > 0) {
            for (const sku of p.skus) {
                if (sku.enabled !== false) {
                    const price = Number(sku.tuanPrice) || Number(sku.price) || Infinity;
                    if (price < min) {
                        min = price;
                    }
                }
            }
        }
        else {
            const price = Number(p.tuanPrice) || 0;
            if (price > 0 && price < min) {
                min = price;
            }
        }
    }
    return min === Infinity ? 0 : min;
}
exports.computeMinPrice = computeMinPrice;
// =====================================================================
// Action 1：拉取团购列表
// =====================================================================
async function getTuanDealList(event) {
    const { page = 1, pageSize = exports.DEFAULT_PAGE_SIZE, status } = event;
    const where = {};
    if (status) {
        where.status = status;
    }
    else {
        where.status = _.in(['published', 'active']);
    }
    const now = new Date();
    where.startTime = _.lte(now);
    where.endTime = _.gte(now);
    const result = await paginate(db, 'tuan_deals', {
        page, pageSize, where, projection: exports.TUAN_DEAL_LIST_FIELDS,
        orderBy: { field: 'createdAt', direction: 'desc' },
    });
    if (result.list) {
        result.list = result.list.map((deal) => ({
            ...deal,
            minPrice: computeMinPrice(deal.products || []),
        }));
    }
    return handleSuccess(result, '获取成功');
}
exports.getTuanDealList = getTuanDealList;
// =====================================================================
// Action 2：拉取团购详情
// =====================================================================
async function getTuanDealDetail(event) {
    const { id, dealId } = event;
    const targetId = (id || dealId);
    if (!targetId) {
        throw err('INVALID_PARAMS', '缺少团购ID');
    }
    try {
        const res = await db.collection('tuan_deals').doc(targetId).field(exports.TUAN_DEAL_LIST_FIELDS).get();
        if (!res.data) {
            throw err('NOT_FOUND', '团购不存在');
        }
        const deal = res.data;
        deal.minPrice = computeMinPrice(deal.products || []);
        for (const p of (deal.products || [])) {
            if (p.skuType === 'multi' && p.skus && p.skus.length > 0) {
                p.minSkuPrice = Infinity;
                for (const sku of p.skus) {
                    if (sku.enabled !== false) {
                        const price = Number(sku.tuanPrice) || Number(sku.price) || Infinity;
                        if (price < p.minSkuPrice) {
                            p.minSkuPrice = price;
                        }
                    }
                }
                if (p.minSkuPrice === Infinity) {
                    p.minSkuPrice = p.tuanPrice || 0;
                }
            }
        }
        return handleSuccess(deal, '获取成功');
    }
    catch (error) {
        return handleError(error, '团购不存在', ERROR_CODES.NOT_FOUND);
    }
}
exports.getTuanDealDetail = getTuanDealDetail;
// =====================================================================
// Action 3：创建团购订单
// =====================================================================
async function createTuanOrder(event, _context, auth) {
    const { openid } = auth;
    if (!openid) {
        throw err('AUTH_REQUIRED', '未登录');
    }
    const { dealId, productId, skuId, quantity = 1, tuanPrice, totalAmount, originalAmount, couponId, couponDiscount, specText, receiverName, receiverPhone, receiverAddress, remark } = event;
    if (!dealId) {
        throw err('INVALID_PARAMS', '缺少dealId');
    }
    if (!productId) {
        throw err('INVALID_PARAMS', '缺少productId');
    }
    const dealRes = await db.collection('tuan_deals').doc(dealId).get();
    if (!dealRes.data) {
        throw err('NOT_FOUND', '团购不存在');
    }
    const deal = dealRes.data;
    if (deal.status !== 'published' && deal.status !== 'active') {
        throw err('BUSINESS_ERROR', '团购已结束');
    }
    if (deal.endTime && new Date(deal.endTime) < new Date()) {
        throw err('BUSINESS_ERROR', '团购已结束');
    }
    const dealProducts = deal.products || [];
    const dealProduct = dealProducts.find(p => p.productId === productId);
    if (!dealProduct) {
        throw err('INVALID_PARAMS', '商品不在团购中');
    }
    // 价格始终从数据库获取，忽略客户端传入的 tuanPrice（防止价格篡改）
    let finalPrice = Number(dealProduct.tuanPrice) || Number(dealProduct.price) || 0;
    let finalStock = Number(dealProduct.stock) || 0;
    if (skuId && dealProduct.skuType === 'multi' && dealProduct.skus) {
        const sku = dealProduct.skus.find(s => s.skuId === skuId);
        if (!sku) {
            throw err('INVALID_PARAMS', 'SKU不存在');
        }
        if (sku.enabled === false) {
            throw err('BUSINESS_ERROR', '该规格已下架');
        }
        finalPrice = Number(sku.tuanPrice) || Number(sku.price) || finalPrice;
        finalStock = Number(sku.stock) || 0;
        if (finalStock < quantity) {
            throw err('BUSINESS_ERROR', '库存不足');
        }
    }
    else {
        if (finalStock < quantity) {
            throw err('BUSINESS_ERROR', '库存不足');
        }
    }
    // 金额始终从数据库价格计算，忽略客户端传入的 totalAmount（防止金额篡改）
    const finalAmount = finalPrice * quantity;
    // 仅在使用优惠券时，校验优惠后金额下限（直接使用前端传入的已扣券金额）
    if (couponId && Number(totalAmount) > 0 && Number(totalAmount) < 0.1) {
        throw err('INVALID_PARAMS', '优惠后订单金额必须 ≥ 0.1 元');
    }
    const orderNo = `T${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
    const order = {
        dealId: dealId,
        productId: productId,
        skuId: skuId || '',
        specText: specText || '',
        ownerId: openid,
        quantity: quantity,
        tuanPrice: finalPrice,
        originalAmount: originalAmount || finalAmount,
        totalAmount: finalAmount,
        couponId: couponId || '',
        couponDiscount: Number(couponDiscount) || 0,
        status: 'pending_payment',
        paymentStatus: 'unpaid',
        createdAt: db.serverDate(),
        updatedAt: db.serverDate(),
    };
    order._id = generateId('tuan', openid);
    const orderRes = await db.collection('tuan_orders').add({ data: order });
    const unifiedOrder = {
        orderNo,
        dealId: dealId,
        productId: productId,
        productName: dealProduct.name || '',
        productImage: dealProduct.image || '',
        skuId: skuId || '',
        skuText: specText || '',
        unitPrice: finalPrice,
        quantity: Number(quantity),
        originalAmount: originalAmount || finalAmount,
        totalAmount: finalAmount,
        couponId: couponId || '',
        couponDiscount: Number(couponDiscount) || 0,
        receiverName: receiverName || '',
        receiverPhone: receiverPhone || '',
        receiverAddress: receiverAddress || '',
        remark: remark || '',
        ownerId: openid,
        status: 'pending_payment',
        type: 'group_buy',
        tuanOrderId: orderRes._id,
        createdAt: db.serverDate(),
        updatedAt: db.serverDate(),
    };
    unifiedOrder._id = generateId('order', openid);
    const unifiedOrderRes = await db.collection('orders').add({ data: unifiedOrder });
    const updateData = {
        totalOrders: _.inc(1),
        totalAmount: _.inc(finalAmount),
        updatedAt: new Date(),
    };
    const productIndex = dealProducts.indexOf(dealProduct);
    // 原子性库存扣减：重新查询最新库存并验证
    const freshDealRes = await db.collection('tuan_deals').doc(dealId).get();
    const freshDeal = freshDealRes.data;
    const freshProducts = freshDeal.products || [];
    const freshProduct = freshProducts.find(p => p.productId === productId);
    if (!freshProduct) {
        throw err('BUSINESS_ERROR', '商品不存在');
    }
    // 验证最新库存
    if (skuId && freshProduct.skuType === 'multi' && freshProduct.skus) {
        const freshSku = freshProduct.skus.find(s => s.skuId === skuId);
        if (!freshSku) {
            throw err('BUSINESS_ERROR', 'SKU不存在');
        }
        const freshSkuStock = Number(freshSku.stock) || 0;
        if (freshSkuStock < quantity) {
            throw err('BUSINESS_ERROR', '库存不足');
        }
    }
    else {
        const freshStock = Number(freshProduct.stock) || 0;
        if (freshStock < quantity) {
            throw err('BUSINESS_ERROR', '库存不足');
        }
    }
    // 执行库存扣减
    const freshProductIndex = freshProducts.indexOf(freshProduct);
    if (skuId && freshProduct.skuType === 'multi' && freshProduct.skus) {
        // Multi-SKU 商品：只扣减 SKU 级库存，不扣减商品级库存（避免双重扣减）
        const skuIndex = freshProduct.skus.findIndex(s => s.skuId === skuId);
        if (skuIndex >= 0) {
            updateData[`products.${freshProductIndex}.skus.${skuIndex}.stock`] = _.inc(-quantity);
            updateData[`products.${freshProductIndex}.skus.${skuIndex}.sold`] = _.inc(quantity);
        }
    }
    else {
        // 非 Multi-SKU 商品：扣减商品级库存
        updateData[`products.${freshProductIndex}.stock`] = _.inc(-quantity);
        updateData[`products.${freshProductIndex}.sold`] = _.inc(quantity);
    }
    await db.collection('tuan_deals').doc(dealId).update({ data: updateData });
    return handleSuccess({ _id: orderRes._id, unifiedOrderId: unifiedOrderRes._id, ...order }, '下单成功');
}
exports.createTuanOrder = createTuanOrder;
// =====================================================================
// Handler 4: shipTuanOrder（商家发货）
// =====================================================================
async function shipTuanOrder(event, _context, auth) {
    const { orderId } = event.data || {};
    if (!orderId) {
        throw err('INVALID_PARAMS', '缺少订单ID');
    }
    // 权限：仅管理员或商家可发货
    if (!auth.isSuperAdmin && !auth.adminId) {
        throw err('PERMISSION_DENIED', '无权操作');
    }
    const orderRes = await db.collection('orders').doc(orderId).get();
    const order = orderRes.data;
    if (!order) {
        throw err('NOT_FOUND', '订单不存在');
    }
    if (order.type !== 'group_buy') {
        throw err('BUSINESS_ERROR', '非团购订单');
    }
    if (order.status !== 'paid') {
        throw err('BUSINESS_ERROR', '当前状态不可发货');
    }
    await db.collection('orders').doc(orderId).update({
        data: { status: 'pending_shipment', updatedAt: db.serverDate() },
    });
    if (order.tuanOrderId) {
        try {
            await db.collection('tuan_orders').doc(order.tuanOrderId).update({
                data: { status: 'pending_shipment', updatedAt: db.serverDate() },
            });
        }
        catch (e) {
            logger.warn('shipTuanOrder.syncTuanOrderFailed', { orderId, tuanOrderId: order.tuanOrderId, msg: e.message });
        }
    }
    return handleSuccess(null, '发货成功');
}
// =====================================================================
// Handler 5: confirmReceiveTuanOrder（用户确认收货）
// =====================================================================
async function confirmReceiveTuanOrder(event, _context, auth) {
    const { orderId } = event.data || {};
    if (!orderId) {
        throw err('INVALID_PARAMS', '缺少订单ID');
    }
    const openid = auth.openid;
    if (!openid) {
        throw err('AUTH_REQUIRED', '未登录');
    }
    const orderRes = await db.collection('orders').doc(orderId).get();
    const order = orderRes.data;
    if (!order) {
        throw err('NOT_FOUND', '订单不存在');
    }
    if (order.ownerId !== openid) {
        throw err('PERMISSION_DENIED', '无权操作');
    }
    if (order.type !== 'group_buy') {
        throw err('BUSINESS_ERROR', '非团购订单');
    }
    if (!['pending_shipment', 'shipped'].includes(order.status)) {
        throw err('BUSINESS_ERROR', '当前状态不可确认收货');
    }
    await db.collection('orders').doc(orderId).update({
        data: { status: 'completed', updatedAt: db.serverDate() },
    });
    if (order.tuanOrderId) {
        try {
            await db.collection('tuan_orders').doc(order.tuanOrderId).update({
                data: { status: 'completed', updatedAt: db.serverDate() },
            });
        }
        catch (e) {
            logger.warn('confirmReceiveTuanOrder.syncTuanOrderFailed', { orderId, tuanOrderId: order.tuanOrderId, msg: e.message });
        }
    }
    return handleSuccess(null, '确认收货成功');
}
// =====================================================================
// Handler 6: cancelTuanOrder（取消订单并退款）
// =====================================================================
async function cancelTuanOrder(event, _context, auth) {
    const { orderId } = event.data || {};
    if (!orderId) {
        throw err('INVALID_PARAMS', '缺少订单ID');
    }
    const openid = auth.openid;
    if (!openid) {
        throw err('AUTH_REQUIRED', '未登录');
    }
    const orderRes = await db.collection('orders').doc(orderId).get();
    const order = orderRes.data;
    if (!order) {
        throw err('NOT_FOUND', '订单不存在');
    }
    if (order.type !== 'group_buy') {
        throw err('BUSINESS_ERROR', '非团购订单');
    }
    // 用户只能取消自己的订单；管理员可取消任意订单
    if (order.ownerId !== openid && !auth.isSuperAdmin && !auth.adminId) {
        throw err('PERMISSION_DENIED', '无权操作');
    }
    if (!['pending_payment', 'paid', 'pending_shipment'].includes(order.status)) {
        throw err('BUSINESS_ERROR', '当前状态不可取消');
    }
    // 取消佣金
    try {
        const { cancelCommissionRecord } = require('./common/commission-utils');
        await cancelCommissionRecord(orderId);
        logger.info('cancelTuanOrder.cancelCommissionRecord.success', { orderId });
    }
    catch (e) {
        logger.warn('cancelTuanOrder.cancelCommissionRecord.failed', { orderId, msg: e.message });
    }
    // 调用微信支付退款（已支付/待发货状态）
    if (['paid', 'pending_shipment'].includes(order.status)) {
        try {
            const totalAmount = Math.round(Number(order.totalAmount) * 100);
            if (totalAmount > 0) {
                await cloud.callFunction({
                    name: 'paymentService',
                    data: {
                        action: 'createRefund',
                        outTradeNo: order.orderNo || orderId,
                        refundAmount: totalAmount,
                        totalAmount: totalAmount,
                    },
                });
                logger.info('cancelTuanOrder.refundCreated', { orderId });
            }
        }
        catch (e) {
            logger.warn('cancelTuanOrder.refundFailed', { orderId, msg: e.message });
        }
    }
    // 未支付订单直接标记取消
    if (order.status === 'pending_payment') {
        await db.collection('orders').doc(orderId).update({
            data: { status: 'cancelled', updatedAt: db.serverDate() },
        });
        if (order.tuanOrderId) {
            try {
                await db.collection('tuan_orders').doc(order.tuanOrderId).update({
                    data: { status: 'cancelled', updatedAt: db.serverDate() },
                });
            }
            catch (e) {
                logger.warn('cancelTuanOrder.syncTuanOrderFailed', { orderId, tuanOrderId: order.tuanOrderId, msg: e.message });
            }
        }
    }
    return handleSuccess(null, '取消申请已提交');
}
// =====================================================================
// Handlers 聚合 + Main 入口
// =====================================================================
const handlers = {
    getTuanDealList: (event, _context, _auth) => getTuanDealList(event),
    getTuanDealDetail: (event, _context, _auth) => getTuanDealDetail(event),
    createTuanOrder,
    shipTuanOrder,
    confirmReceiveTuanOrder,
    cancelTuanOrder,
};
async function main(event, context) {
    const { action } = event;
    try {
        if (!action || !handlers[action]) {
            throw err('UNKNOWN_ACTION', action ? `未知的操作：${action}` : '缺少 action 参数');
        }
        const requireLogin = exports.WRITE_ACTIONS.includes(action);
        const auth = await verifyAuth(event, { requireLogin });
        logger.info(action, { openid: auth.openid });
        return await handlers[action](event, context, auth);
    }
    catch (error) {
        logger.error(action || '(no action)', error);
        const code = error.code || ERROR_CODES.BUSINESS;
        return handleError(error, error.message || '操作失败', code);
    }
}
exports.main = main;
// =====================================================================
// Runtime shim（CommonJS 兼容）
// =====================================================================
const _mod = module;
_mod.exports = {
    main,
    // Action handlers
    getTuanDealList,
    getTuanDealDetail,
    createTuanOrder,
    shipTuanOrder,
    confirmReceiveTuanOrder,
    cancelTuanOrder,
    // 常量
    TUAN_DEAL_LIST_FIELDS: exports.TUAN_DEAL_LIST_FIELDS,
    WRITE_ACTIONS: exports.WRITE_ACTIONS,
    DEFAULT_PAGE_SIZE: exports.DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE: exports.MAX_PAGE_SIZE,
    // 辅助函数
    computeMinPrice,
};
_mod.exports.default = _mod.exports;
exports.default = {
    main,
    getTuanDealList,
    getTuanDealDetail,
    createTuanOrder,
    shipTuanOrder,
    confirmReceiveTuanOrder,
    cancelTuanOrder,
    TUAN_DEAL_LIST_FIELDS: exports.TUAN_DEAL_LIST_FIELDS,
    WRITE_ACTIONS: exports.WRITE_ACTIONS,
    DEFAULT_PAGE_SIZE: exports.DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE: exports.MAX_PAGE_SIZE,
    computeMinPrice,
};
