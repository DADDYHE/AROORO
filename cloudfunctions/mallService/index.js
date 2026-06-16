"use strict";
/**
 * mallService/index.ts - 商城服务主入口（TypeScript 源文件 - Sprint 40 迁移）
 *
 * 业务功能：
 *   - 商品管理（CRUD + 批量操作 + 上下架/精选）
 *   - 商品浏览（列表 / 详情 / 分类统计 / 购物车状态）
 *   - 下单流程（普通下单 + 团购下单，含风控前置）
 *   - 订单管理（我的订单 / 详情 / 取消 / 确认收货 / 删除）
 *
 * 共 16 个 action：
 *   1. getProductList - 商品列表
 *   2. getProductDetail - 商品详情
 *   3. getCategoryStats - 分类统计
 *   4. listCategories - 分类列表
 *   5. checkCartItems - 购物车状态检查
 *   6. createProduct - 创建商品
 *   7. updateProduct - 更新商品
 *   8. deleteProduct - 下架商品
 *   9. batchUpdateProducts - 批量操作商品
 *  10. createOrder - 商城下单
 *  11. createGroupBuyOrder - 团购下单
 *  12. getMyOrders - 我的商城订单
 *  13. getGroupBuyOrders - 我的团购订单
 *  14. getOrderDetail - 订单详情
 *  15. cancelOrder - 取消订单
 *  16. confirmReceive - 确认收货
 *  17. deleteOrder - 删除订单
 *
 * 迁移目标：
 *   - 强类型化所有 db 操作、handler 签名、返回结构
 *   - 复用 AuthLike / CloudEvent / CloudContext 公共类型
 *   - 与 adminService / partnerService / userService / activityService 保持类型一致
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.mallService.json
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = exports.handlers = exports.getWxShippingStatus = exports.deleteOrder = exports.confirmReceive = exports.getOrderDetail = exports.cancelOrder = exports.getGroupBuyOrders = exports.getMyOrders = exports.createOrder = exports.createGroupBuyOrder = exports.batchUpdateProducts = exports.deleteProduct = exports.updateProduct = exports.createProduct = exports.getProductDetail = exports.checkCartItems = exports.listCategories = exports.getCategoryStats = exports.getProductList = void 0;
// =====================================================================
// 内部模块初始化（require CommonJS 模块）
// =====================================================================
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { initCloud, handleSuccess, handleError, generateId, ERROR_CODES, paginate } = require('./common/utils');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createLogger } = require('./common/logger');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { writeOperationLog } = require('./common/operation-log');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { verifyAuth } = require('./common/auth-middleware');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { filterFields, FIELD_WHITELISTS } = require('./common/validator');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { err, isBusinessError } = require('./common/errors');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { detectMallOrderRisk, mapActionToErrorCode } = require('./common/risk-control');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createCommissionRecord: createCommissionRecordShared } = require('./common/commission-utils');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { withRateLimit } = require('./common/risk-rate-limit');
// Sprint 50: 限流统一 bootstrap
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { bootstrapRateLimit } = require('./common/rate-limit-bootstrap');
const { cloud, db } = initCloud();
const logger = createLogger('mallService');
const _ = db.command;
// Sprint 50: 注入全局限流存储（rate_limits + rate_limit_configs 一次注入）
try {
    bootstrapRateLimit(db, { logger });
}
catch (e) {
    logger.warn('bootstrapRateLimit failed, fallback to memory:', e && e.message);
}
// =====================================================================
// 辅助函数：商城下单风控前置
// =====================================================================
async function performMallOrderRiskCheck(ctx) {
    const { openid, productId, amountFen } = ctx;
    let pendingReview = false;
    let riskDecision = 'RISK_PASS';
    let riskReasons = [];
    try {
        const risk = await withRateLimit({ userId: openid, type: 'mall_order', targetId: productId }, () => detectMallOrderRisk({
            db,
            userId: openid,
            amountFen,
            targetId: productId,
        }));
        riskDecision = mapActionToErrorCode(risk.action);
        riskReasons = risk.reasons;
        if (risk.action === 'reject') {
            logger.warn('mallOrder.risk_reject', { userId: openid, productId, amountFen, reasons: risk.reasons });
            throw err('RISK_REJECT', '下单被风控拦截', {
                reasons: risk.reasons,
                level: risk.level,
                productId,
            });
        }
        if (risk.action === 'review') {
            pendingReview = true;
            logger.info('mallOrder.risk_pending', { userId: openid, productId, amountFen, reasons: risk.reasons });
        }
        else {
            const debug = logger.debug;
            if (debug) {
                debug('mallOrder.risk_pass', { userId: openid, productId });
            }
        }
    }
    catch (e) {
        if (isBusinessError(e) && (e.code === 'RATE_LIMITED' || e.code === 'RISK_REJECT')) {
            throw e;
        }
        logger.warn('mallOrder.risk_control_error', { userId: openid, productId, msg: e && e.message });
        riskDecision = 'RISK_PASS';
    }
    return { pendingReview, reasons: riskReasons, decision: riskDecision };
}
// =====================================================================
// 辅助函数：佣金记录（使用共享模块）
// =====================================================================
const createCommissionRecord = createCommissionRecordShared;
// =====================================================================
// 辅助函数：批量获取临时文件 URL
// =====================================================================
async function batchGetTempFileURL(fileIds) {
    const BATCH_SIZE = 50;
    const urlMap = {};
    for (let i = 0; i < fileIds.length; i += BATCH_SIZE) {
        const batch = fileIds.slice(i, i + BATCH_SIZE);
        const res = await cloud.getTempFileURL({ fileList: batch });
        for (const f of (res.fileList || [])) {
            if (f.tempFileURL && f.fileID) {
                urlMap[f.fileID] = f.tempFileURL;
            }
        }
    }
    return urlMap;
}
// =====================================================================
// 商品列表字段投影
// =====================================================================
const PRODUCT_LIST_FIELDS = {
    _id: true, name: true, coverUrl: true, coverImage: true, price: true, originalPrice: true,
    category: true, categoryId: true, stock: true, totalStock: true, soldCount: true,
    status: true, isFeatured: true, createdAt: true,
    skuType: true, specGroups: true, skus: true, minPrice: true, maxPrice: true,
    images: true, tags: true, subTitle: true,
};
// =====================================================================
// Handler 1: getProductList
// =====================================================================
async function getProductList(event, _context, _auth) {
    const { page = 1, pageSize = 10, category, categoryId, status = 'on_sale', isFeatured } = event;
    const where = { status };
    if (categoryId) {
        where.categoryId = categoryId;
    }
    else if (category) {
        where.category = category;
    }
    if (isFeatured !== undefined) {
        where.isFeatured = isFeatured;
    }
    const result = await paginate(db, 'products', {
        page, pageSize, where, projection: PRODUCT_LIST_FIELDS,
    });
    const cloudUrls = [];
    for (const item of result.list) {
        item.coverUrl = item.coverUrl || item.coverImage || '';
        if (item.coverUrl && item.coverUrl.startsWith('cloud://')) {
            cloudUrls.push(item.coverUrl);
        }
    }
    if (cloudUrls.length > 0) {
        try {
            const urlMap = await batchGetTempFileURL(cloudUrls);
            for (const item of result.list) {
                if (item.coverUrl && urlMap[item.coverUrl]) {
                    item.coverUrl = urlMap[item.coverUrl];
                }
            }
        }
        catch (e) {
            logger.error('getProductList.getTempFileURL', e);
        }
    }
    return handleSuccess(result, '获取成功');
}
exports.getProductList = getProductList;
// =====================================================================
// Handler 2: getCategoryStats
// =====================================================================
async function getCategoryStats(_event, _context, _auth) {
    try {
        const res = await db.collection('products')
            .where({ status: 'on_sale' })
            .field({ category: true, categoryId: true })
            .limit(1000)
            .get();
        const stats = {};
        for (const item of (res.data || [])) {
            if (item.category) {
                stats[item.category] = (stats[item.category] || 0) + 1;
            }
            if (item.categoryId) {
                stats[item.categoryId] = (stats[item.categoryId] || 0) + 1;
            }
        }
        return handleSuccess(stats, '获取成功');
    }
    catch (error) {
        logger.error('getCategoryStats', error);
        return handleSuccess({}, '获取成功');
    }
}
exports.getCategoryStats = getCategoryStats;
// =====================================================================
// Handler 3: listCategories
// =====================================================================
async function listCategories(_event, _context, _auth) {
    try {
        const res = await db.collection('categories')
            .orderBy('sortOrder', 'asc')
            .limit(100)
            .get();
        return handleSuccess(res.data, '获取成功');
    }
    catch (error) {
        logger.error('listCategories', error);
        return handleError(error, '获取分类列表失败', ERROR_CODES.DATA);
    }
}
exports.listCategories = listCategories;
// =====================================================================
// Handler 4: checkCartItems
// =====================================================================
async function checkCartItems(event, _context, _auth) {
    const { productIds } = event;
    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
        return handleSuccess({}, '获取成功');
    }
    try {
        const res = await db.collection('products')
            .where({ _id: _.in(productIds) })
            .field({ _id: true, status: true, coverUrl: true, coverImage: true, name: true, price: true })
            .limit(100)
            .get();
        const cloudFileIds = [];
        for (const item of (res.data || [])) {
            const url = item.coverUrl || item.coverImage || '';
            if (url.startsWith('cloud://')) {
                cloudFileIds.push(url);
            }
        }
        const urlMap = {};
        if (cloudFileIds.length > 0) {
            try {
                const urlRes = await cloud.getTempFileURL({ fileList: cloudFileIds });
                for (const f of (urlRes.fileList || [])) {
                    if (f.tempFileURL && f.fileID) {
                        urlMap[f.fileID] = f.tempFileURL;
                    }
                }
            }
            catch (e) {
                logger.error('checkCartItems.getTempFileURL', e);
            }
        }
        const statusMap = {};
        for (const item of (res.data || [])) {
            const rawUrl = item.coverUrl || item.coverImage || '';
            const entry = {
                status: item.status || '',
                coverUrl: urlMap[rawUrl] || rawUrl,
                name: item.name || '',
                price: item.price || 0,
            };
            if (item._id) {
                statusMap[item._id] = entry;
            }
        }
        return handleSuccess(statusMap, '获取成功');
    }
    catch (error) {
        logger.error('checkCartItems', error);
        return handleSuccess({}, '获取成功');
    }
}
exports.checkCartItems = checkCartItems;
// =====================================================================
// Handler 5: getProductDetail
// =====================================================================
async function getProductDetail(event, _context, _auth) {
    const { productId } = event;
    if (!productId) {
        throw err('INVALID_PARAMS', '缺少商品ID');
    }
    try {
        const res = await db.collection('products').doc(productId).get();
        const product = res.data;
        if (!product) {
            throw err('NOT_FOUND', '商品不存在');
        }
        product.coverUrl = product.coverUrl || product.coverImage || '';
        const cloudFields = ['coverUrl', 'coverImage'];
        const cloudArrayFields = ['images', 'detailImages'];
        const cloudUrls = [];
        for (const field of cloudFields) {
            const val = product[field];
            if (typeof val === 'string' && val.startsWith('cloud://')) {
                cloudUrls.push(val);
            }
        }
        for (const field of cloudArrayFields) {
            const val = product[field];
            if (Array.isArray(val)) {
                for (const url of val) {
                    if (typeof url === 'string' && url.startsWith('cloud://')) {
                        cloudUrls.push(url);
                    }
                }
            }
        }
        if (cloudUrls.length > 0) {
            try {
                const urlMap = await batchGetTempFileURL(cloudUrls);
                for (const field of cloudFields) {
                    const val = product[field];
                    if (typeof val === 'string' && urlMap[val]) {
                        product[field] = urlMap[val];
                    }
                }
                for (const field of cloudArrayFields) {
                    const val = product[field];
                    if (Array.isArray(val)) {
                        const mapped = val.map((url) => typeof url === 'string' && urlMap[url] ? urlMap[url] : url);
                        product[field] = mapped;
                    }
                }
            }
            catch (e) {
                logger.error('getProductDetail.getTempFileURL', e);
            }
        }
        return handleSuccess(product, '获取成功');
    }
    catch (error) {
        return handleError(error, '商品不存在', ERROR_CODES.NOT_FOUND);
    }
}
exports.getProductDetail = getProductDetail;
// =====================================================================
// Handler 6: createProduct
// =====================================================================
async function createProduct(event, _context, auth) {
    const { openid } = auth;
    if (!openid) {
        throw err('AUTH_REQUIRED', '未登录');
    }
    const { name, description, price, originalPrice, coverUrl, images, category, stock, specs } = event;
    if (!name) {
        throw err('INVALID_PARAMS', '缺少商品名称');
    }
    if (price === undefined || price === null) {
        throw err('INVALID_PARAMS', '缺少商品价格');
    }
    const product = {
        name,
        description: description || '',
        price: Number(price),
        originalPrice: Number(originalPrice) || undefined,
        coverUrl: coverUrl || '',
        images: images || [],
        category: category || 'general',
        stock: Number(stock) || 0,
        soldCount: 0,
        specs: specs || [],
        status: 'draft',
        isFeatured: false,
        createdBy: openid,
        createdAt: db.serverDate(),
        updatedAt: db.serverDate(),
    };
    product._id = generateId('product', openid);
    const res = await db.collection('products').add({ data: product });
    return handleSuccess({ id: res._id }, '创建成功');
}
exports.createProduct = createProduct;
// =====================================================================
// Handler 7: updateProduct
// =====================================================================
async function updateProduct(event, _context, auth) {
    const { productId } = event;
    const { openid } = auth;
    if (!productId) {
        throw err('INVALID_PARAMS', '缺少商品ID');
    }
    if (!openid) {
        throw err('AUTH_REQUIRED', '未登录');
    }
    const updateData = { updatedAt: db.serverDate(), ...filterFields(FIELD_WHITELISTS.product, event) };
    const existRes = await db.collection('products').doc(productId).get();
    const existData = existRes.data;
    if (!existData) {
        throw err('NOT_FOUND', '商品不存在');
    }
    if (existData.createdBy !== openid) {
        throw err('PERMISSION_DENIED', '无权修改此商品');
    }
    await db.collection('products').doc(productId).update({ data: updateData });
    return handleSuccess(null, '更新成功');
}
exports.updateProduct = updateProduct;
// =====================================================================
// Handler 8: deleteProduct
// =====================================================================
async function deleteProduct(event, _context, auth) {
    const { productId } = event;
    const { openid } = auth;
    if (!productId) {
        throw err('INVALID_PARAMS', '缺少商品ID');
    }
    if (!openid) {
        throw err('AUTH_REQUIRED', '未登录');
    }
    const existRes = await db.collection('products').doc(productId).get();
    const existData = existRes.data;
    if (!existData) {
        throw err('NOT_FOUND', '商品不存在');
    }
    if (existData.createdBy !== openid) {
        throw err('PERMISSION_DENIED', '无权下架此商品');
    }
    await db.collection('products').doc(productId).update({
        data: { status: 'off_sale', updatedAt: db.serverDate() },
    });
    return handleSuccess(null, '下架成功');
}
exports.deleteProduct = deleteProduct;
// =====================================================================
// Handler 9: batchUpdateProducts
// =====================================================================
async function batchUpdateProducts(event, _context, auth) {
    const { productIds, operation } = event;
    const { openid } = auth;
    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
        throw err('INVALID_PARAMS', '缺少商品ID列表');
    }
    if (!openid) {
        throw err('AUTH_REQUIRED', '未登录');
    }
    const VALID_OPERATIONS = ['on_shelf', 'off_shelf', 'delete', 'set_featured', 'unset_featured'];
    if (!VALID_OPERATIONS.includes(operation || '')) {
        throw err('INVALID_PARAMS', '无效的操作类型');
    }
    const STATUS_MAP = { on_shelf: 'on_sale', off_shelf: 'off_sale' };
    const results = { success: 0, failed: 0 };
    for (const productId of productIds) {
        try {
            if (operation === 'delete') {
                await db.collection('products').doc(productId).remove();
            }
            else if (operation === 'set_featured') {
                await db.collection('products').doc(productId).update({
                    data: { isFeatured: true, updatedAt: db.serverDate() },
                });
            }
            else if (operation === 'unset_featured') {
                await db.collection('products').doc(productId).update({
                    data: { isFeatured: false, updatedAt: db.serverDate() },
                });
            }
            else if (operation) {
                await db.collection('products').doc(productId).update({
                    data: { status: STATUS_MAP[operation], updatedAt: db.serverDate() },
                });
            }
            results.success++;
        }
        catch (e) {
            logger.error('batchUpdateProducts', { productId, error: e });
            results.failed++;
        }
    }
    return handleSuccess(results, `操作完成: 成功${results.success}个, 失败${results.failed}个`);
}
exports.batchUpdateProducts = batchUpdateProducts;
// =====================================================================
// Handler 10: createGroupBuyOrder（团购下单）
// =====================================================================
async function createGroupBuyOrder(event, _context, auth) {
    const { openid } = auth;
    if (!openid) {
        throw err('AUTH_REQUIRED', '未登录');
    }
    const { productId, quantity = 1, receiverName, receiverPhone, receiverAddress } = event;
    if (!productId) {
        throw err('INVALID_PARAMS', '缺少商品ID');
    }
    if (!receiverName) {
        throw err('INVALID_PARAMS', '请填写收货人姓名');
    }
    if (!receiverPhone) {
        throw err('INVALID_PARAMS', '请填写联系电话');
    }
    if (!receiverAddress) {
        throw err('INVALID_PARAMS', '请填写收货地址');
    }
    // Sprint 22: 团购下单前先做商品/库存预读 + 大额风控
    const productRes = await db.collection('products').doc(productId).get();
    const previewProduct = productRes.data;
    if (!previewProduct || previewProduct.status !== 'on_sale') {
        throw err('BUSINESS_ERROR', '商品已下架或不可购买');
    }
    const previewUnitPrice = Number(previewProduct.price) || 0;
    const previewTotalAmount = Math.round(previewUnitPrice * Number(quantity) * 100);
    const groupRisk = await performMallOrderRiskCheck({
        openid,
        productId,
        amountFen: previewTotalAmount,
    });
    const transaction = await db.startTransaction();
    try {
        const product = previewProduct;
        if (!product || product.status !== 'on_sale') {
            await transaction.rollback();
            throw err('BUSINESS_ERROR', '商品已下架或不可购买');
        }
        const availableStock = product.totalStock || product.stock || 0;
        if (availableStock < Number(quantity)) {
            await transaction.rollback();
            throw err('STOCK_INSUFFICIENT', `库存不足，仅剩${availableStock}件`);
        }
        const unitPrice = product.price || 0;
        const totalAmount = unitPrice * Number(quantity);
        const orderNo = `G${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
        const order = {
            orderNo,
            productId,
            productName: product.name || '',
            productImage: product.coverUrl || (product.images && product.images[0]) || '',
            unitPrice,
            quantity: Number(quantity),
            totalAmount,
            receiverName,
            receiverPhone,
            receiverAddress,
            ownerId: openid,
            ownerName: auth.nickName || '',
            sellerId: product.createdBy || '',
            status: 'pending_payment',
            type: 'group_buy',
            pendingReview: groupRisk.pendingReview,
            riskDecision: groupRisk.decision,
            riskReasons: groupRisk.reasons,
            createdAt: db.serverDate(),
            updatedAt: db.serverDate(),
        };
        order._id = generateId('order', openid);
        const addRes = await transaction.collection('orders').add({ data: order });
        await transaction.collection('products').doc(productId).update({
            data: {
                totalStock: _.inc(-Number(quantity)),
                stock: _.inc(-Number(quantity)),
                soldCount: _.inc(Number(quantity)),
                joinCount: _.inc(Number(quantity)),
                updatedAt: db.serverDate(),
            },
        });
        await transaction.commit();
        return handleSuccess({ orderId: addRes._id, ...order }, '下单成功');
    }
    catch (error) {
        await transaction.rollback();
        return handleError(error, '下单失败', ERROR_CODES.DATA);
    }
}
exports.createGroupBuyOrder = createGroupBuyOrder;
// =====================================================================
// Handler 11: createOrder（商城下单）
// =====================================================================
async function createOrder(event, _context, auth) {
    const { openid } = auth;
    if (!openid) {
        throw err('AUTH_REQUIRED', '未登录');
    }
    const { productId, skuId, quantity = 1, receiverName, receiverPhone, receiverAddress, totalAmount: clientTotalAmount, originalAmount, couponId, couponDiscount } = event;
    if (!productId) {
        throw err('INVALID_PARAMS', '缺少商品ID');
    }
    if (!receiverAddress) {
        throw err('INVALID_PARAMS', '缺少收货地址');
    }
    // Sprint 22: 商城下单前先做商品预读 + 大额风控
    const productRes = await db.collection('products').doc(productId).get();
    const previewProduct = productRes.data;
    if (!previewProduct || previewProduct.status !== 'on_sale') {
        throw err('BUSINESS_ERROR', '商品不可购买');
    }
    let previewUnitPrice = Number(previewProduct.price) || 0;
    if (previewProduct.skuType === 'multi' && skuId) {
        const sku = (previewProduct.skus || []).find((s) => s.skuId === skuId);
        if (!sku) {
            throw err('BUSINESS_ERROR', 'SKU不存在');
        }
        previewUnitPrice = Number(sku.price) || 0;
    }
    const previewTotalAmount = Math.round(previewUnitPrice * Number(quantity) * 100);
    const orderRisk = await performMallOrderRiskCheck({
        openid,
        productId,
        amountFen: previewTotalAmount,
    });
    const transaction = await db.startTransaction();
    try {
        const product = previewProduct;
        if (!product || product.status !== 'on_sale') {
            await transaction.rollback();
            throw err('BUSINESS_ERROR', '商品不可购买');
        }
        let unitPrice = product.price || 0;
        let skuText = '';
        let stockKey = 'stock';
        if (product.skuType === 'multi' && skuId) {
            const skuIndex = product.skus ? product.skus.findIndex((s) => s.skuId === skuId) : -1;
            if (skuIndex < 0) {
                await transaction.rollback();
                throw err('BUSINESS_ERROR', 'SKU不存在');
            }
            const sku = product.skus && product.skus[skuIndex];
            if (!sku || (sku.stock !== undefined && sku.stock < Number(quantity))) {
                await transaction.rollback();
                throw err('BUSINESS_ERROR', '库存不足');
            }
            unitPrice = sku.price || 0;
            skuText = sku.specText || '';
            stockKey = `skus.${skuIndex}.stock`;
        }
        else {
            const availableStock = product.totalStock || product.stock || 0;
            if (availableStock < Number(quantity)) {
                await transaction.rollback();
                throw err('BUSINESS_ERROR', '库存不足');
            }
        }
        const orderNo = `M${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
        // Sprint 27: 优先使用客户端传的总价（已扣券），否则按原价
        const baseAmount = unitPrice * Number(quantity);
        const originalAmt = Number(originalAmount) || baseAmount;
        // 客户端 finalAmount 优先；若无则按原价（不含券场景）
        const finalAmt = (clientTotalAmount !== undefined && clientTotalAmount !== null && !Number.isNaN(Number(clientTotalAmount)))
            ? Number(clientTotalAmount)
            : baseAmount;
        // 仅在使用优惠券时，校验优惠后金额下限
        if (couponId && finalAmt > 0 && finalAmt < 0.1) {
            throw err('INVALID_PARAMS', '优惠后订单金额必须 ≥ 0.1 元');
        }
        const order = {
            orderNo,
            productId,
            productName: product.name || '',
            productImage: product.coverImage || product.coverUrl || (product.images && product.images[0]) || '',
            skuId: skuId || '',
            skuText,
            unitPrice,
            quantity: Number(quantity),
            originalAmount: originalAmt,
            totalAmount: finalAmt,
            couponId: couponId || '',
            couponDiscount: Number(couponDiscount) || 0,
            receiverName: receiverName || '',
            receiverPhone: receiverPhone || '',
            receiverAddress,
            ownerId: openid,
            ownerName: auth.nickName || '',
            status: 'pending_payment',
            type: 'mall',
            pendingReview: orderRisk.pendingReview,
            riskDecision: orderRisk.decision,
            riskReasons: orderRisk.reasons,
            createdAt: db.serverDate(),
            updatedAt: db.serverDate(),
        };
        order._id = generateId('order', openid);
        const orderAddRes = await transaction.collection('orders').add({ data: order });
        const updateData = {
            totalStock: _.inc(-Number(quantity)),
            soldCount: _.inc(Number(quantity)),
            updatedAt: db.serverDate(),
        };
        if (product.skuType === 'multi' && skuId) {
            updateData[stockKey] = _.inc(-Number(quantity));
            const skuIndex = product.skus ? product.skus.findIndex((s) => s.skuId === skuId) : -1;
            if (skuIndex >= 0) {
                updateData[`skus.${skuIndex}.soldCount`] = _.inc(Number(quantity));
            }
        }
        else {
            updateData.stock = _.inc(-Number(quantity));
        }
        await transaction.collection('products').doc(productId).update({ data: updateData });
        await transaction.commit();
        return handleSuccess({ orderId: orderAddRes._id, orderNo }, '下单成功');
    }
    catch (error) {
        await transaction.rollback();
        return handleError(error, '下单失败', ERROR_CODES.DATA);
    }
}
exports.createOrder = createOrder;
// =====================================================================
// Handler 12: getMyOrders
// =====================================================================
async function getMyOrders(event, _context, auth) {
    const { openid } = auth;
    if (!openid) {
        throw err('AUTH_REQUIRED', '未登录');
    }
    const { status, page = 1, pageSize = 20 } = event;
    const where = { ownerId: openid, type: 'mall', status: _.neq('deleted') };
    if (status && status !== 'all') {
        where.status = status;
    }
    try {
        const result = await paginate(db, 'orders', {
            page,
            pageSize,
            where,
            orderBy: { field: 'createdAt', direction: 'desc' },
        });
        return handleSuccess(result);
    }
    catch (error) {
        logger.error('getMyOrders', error);
        return handleError(error, '获取商城订单失败', ERROR_CODES.DATA);
    }
}
exports.getMyOrders = getMyOrders;
// =====================================================================
// Handler 13: getGroupBuyOrders
// =====================================================================
async function getGroupBuyOrders(event, _context, auth) {
    const { openid } = auth;
    if (!openid) {
        throw err('AUTH_REQUIRED', '未登录');
    }
    const { status, page = 1, pageSize = 20 } = event;
    const where = { ownerId: openid, type: 'group_buy', status: _.neq('deleted') };
    if (status && status !== 'all') {
        where.status = status;
    }
    try {
        const result = await paginate(db, 'orders', {
            page,
            pageSize,
            where,
            orderBy: { field: 'createdAt', direction: 'desc' },
        });
        return handleSuccess(result);
    }
    catch (error) {
        logger.error('getGroupBuyOrders', error);
        return handleError(error, '获取团购订单失败', ERROR_CODES.DATA);
    }
}
exports.getGroupBuyOrders = getGroupBuyOrders;
// =====================================================================
// Handler 14: cancelOrder
// =====================================================================
async function cancelOrder(event, _context, auth) {
    const { openid } = auth;
    if (!openid) {
        throw err('AUTH_REQUIRED', '未登录');
    }
    const { orderId } = event;
    if (!orderId) {
        throw err('INVALID_PARAMS', '缺少订单ID');
    }
    try {
        const orderRes = await db.collection('orders').doc(orderId).get();
        const orderData = orderRes.data;
        if (!orderData || orderData.ownerId !== openid) {
            throw err('PERMISSION_DENIED', '无权限操作此订单');
        }
        const cancellableStatuses = ['pending_payment', 'pending_shipment'];
        if (!cancellableStatuses.includes(orderData.status || '')) {
            throw err('BUSINESS_ERROR', '当前订单状态不可取消');
        }
        await db.collection('orders').doc(orderId).update({
            data: { status: 'cancelled', cancelReason: '买家主动取消', cancelledAt: db.serverDate(), updatedAt: db.serverDate() },
        });
        const qty = orderData.quantity || 1;
        const stockUpdateData = {
            totalStock: _.inc(qty),
            soldCount: _.inc(-qty),
            stock: _.inc(qty),
            updatedAt: db.serverDate(),
        };
        if (orderData.skuId && orderData.productId) {
            const productRes = await db.collection('products').doc(orderData.productId).get();
            const productData = productRes.data;
            if (productData && productData.skus) {
                const skuIndex = productData.skus.findIndex((s) => s.skuId === orderData.skuId);
                if (skuIndex >= 0) {
                    stockUpdateData[`skus.${skuIndex}.stock`] = _.inc(qty);
                    stockUpdateData[`skus.${skuIndex}.soldCount`] = _.inc(-qty);
                }
            }
        }
        if (orderData.productId) {
            await db.collection('products').doc(orderData.productId).update({
                data: stockUpdateData,
            });
        }
        // 取消订单时退回优惠券
        await refundCouponForOrder(orderId, openid).catch((e) => {
            logger.error('refundCouponForOrder', e);
        });
        return handleSuccess(null, '取消成功');
    }
    catch (error) {
        logger.error('cancelOrder', error);
        return handleError(error, '取消订单失败', ERROR_CODES.DATA);
    }
}
exports.cancelOrder = cancelOrder;
/**
 * 取消订单时退回优惠券
 *
 * 覆盖两种场景：
 *   1) 券已使用（coupon_usage 有记录、status='used'）→ 标记为 refunded
 *   2) 券仅被锁定（coupon_usage 无记录、status='locked'）→ 直接解锁
 *
 * 释放后根据 endTime 决定新状态：过期 → expired，未过期 → unused
 */
async function refundCouponForOrder(orderId, openid) {
    const now = Date.now();

    // 1) 已使用券
    const usageRes = await db.collection('coupon_usage').where({ orderId }).limit(10).get();
    if (usageRes.data && usageRes.data.length > 0) {
        for (const usage of usageRes.data) {
            if (usage.status === 'refunded') {continue;}
            const couponId = usage.userCouponId;
            if (!couponId) {continue;}
            const cRes = await db.collection('user_coupons').doc(couponId).get();
            if (!cRes.data) {continue;}
            const c = cRes.data;
            if (c.ownerId !== openid) {continue;}
            if (c.status !== 'used') {continue;}
            const isExpired = c.endTime ? new Date(c.endTime).getTime() < now : false;
            const newStatus = isExpired ? 'expired' : 'unused';
            await db.collection('user_coupons').doc(couponId).update({
                data: { status: newStatus, updatedAt: db.serverDate() },
            });
            await db.collection('coupon_usage').doc(usage._id).update({
                data: { status: 'refunded', refundedAt: db.serverDate(), updatedAt: db.serverDate() },
            });
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
        }
    }

    // 2) 仅被锁定的券（取消时还未支付成功）
    const lockedRes = await db.collection('user_coupons')
        .where({ lockedOrderId: orderId, status: 'locked' })
        .limit(10)
        .get();
    if (lockedRes.data && lockedRes.data.length > 0) {
        for (const c of lockedRes.data) {
            if (c.ownerId !== openid) {continue;}
            const isExpired = c.endTime ? new Date(c.endTime).getTime() < now : false;
            const newStatus = isExpired ? 'expired' : 'unused';
            await db.collection('user_coupons').doc(c._id).update({
                data: {
                    status: newStatus,
                    lockedOrderId: '',
                    updatedAt: db.serverDate(),
                },
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
        }
    }
}
// =====================================================================
// Handler 15: getOrderDetail
// =====================================================================
async function getOrderDetail(event, _context, auth) {
    const { openid } = auth;
    if (!openid) {
        throw err('AUTH_REQUIRED', '未登录');
    }
    const { orderId } = event;
    if (!orderId) {
        throw err('INVALID_PARAMS', '缺少订单ID');
    }
    try {
        const orderRes = await db.collection('orders').doc(orderId).get();
        const orderData = orderRes.data;
        if (!orderData || orderData.ownerId !== openid) {
            throw err('PERMISSION_DENIED', '无权限查看此订单');
        }
        return handleSuccess(orderData, '获取成功');
    }
    catch (error) {
        logger.error('getOrderDetail', error);
        return handleError(error, '获取订单详情失败', ERROR_CODES.DATA);
    }
}
exports.getOrderDetail = getOrderDetail;
// =====================================================================
// Handler 16: confirmReceive
// =====================================================================
async function confirmReceive(event, _context, auth) {
    const { openid } = auth;
    if (!openid) {
        throw err('AUTH_REQUIRED', '未登录');
    }
    const { orderId } = event;
    if (!orderId) {
        throw err('INVALID_PARAMS', '缺少订单ID');
    }
    try {
        const orderRes = await db.collection('orders').doc(orderId).get();
        let orderData = orderRes.data;
        if (!orderData || orderData.ownerId !== openid) {
            throw err('PERMISSION_DENIED', '无权限操作此订单');
        }
        // ★ Plan A Bonus：确认收货前先对账一次——避免 wx 已确认收货（order_state=3）但本地还是 shipped
        // 用户在小程序能进入这个流程意味着已经从 wx 端完成收货，强制同步一次。
        if (orderData.status === 'shipped' || orderData.status === 'paid' || orderData.status === 'confirmed') {
            try {
                // @ts-ignore -- wxOrderSync.js 是 .js 写法
                const { reconcileOrderWithWx } = await Promise.resolve().then(() => __importStar(require('./common/wxOrderSync')));
                const sync = await reconcileOrderWithWx({ db, logger, order: orderData });
                if (sync.changed) {
                    orderData = { ...orderData, status: sync.after };
                }
            }
            catch (e) {
                logger.warn('confirmReceive.preReconcileFailed', e);
            }
        }
        if (orderData.status !== 'shipped') {
            throw err('BUSINESS_ERROR', '当前订单状态不可确认收货');
        }
        await db.collection('orders').doc(orderId).update({
            data: { status: 'completed', updatedAt: db.serverDate() },
        });
        return handleSuccess(null, '确认收货成功');
    }
    catch (error) {
        logger.error('confirmReceive', error);
        return handleError(error, '确认收货失败', ERROR_CODES.DATA);
    }
}
exports.confirmReceive = confirmReceive;
// =====================================================================
// Handler 17: deleteOrder
// =====================================================================
async function deleteOrder(event, _context, auth) {
    const { openid } = auth;
    if (!openid) {
        throw err('AUTH_REQUIRED', '未登录');
    }
    const { orderId } = event;
    if (!orderId) {
        throw err('INVALID_PARAMS', '缺少订单ID');
    }
    try {
        const orderRes = await db.collection('orders').doc(orderId).get();
        const orderData = orderRes.data;
        if (!orderData || orderData.ownerId !== openid) {
            throw err('PERMISSION_DENIED', '无权限操作此订单');
        }
        const deletableStatuses = ['completed', 'cancelled'];
        if (!deletableStatuses.includes(orderData.status || '')) {
            throw err('BUSINESS_ERROR', '当前订单状态不可删除');
        }
        await db.collection('orders').doc(orderId).update({
            data: { status: 'deleted', updatedAt: db.serverDate() },
        });
        return handleSuccess(null, '删除成功');
    }
    catch (error) {
        logger.error('deleteOrder', error);
        return handleError(error, '删除订单失败', ERROR_CODES.DATA);
    }
}
exports.deleteOrder = deleteOrder;
// =====================================================================
// Handler 18: getWxShippingStatus
// =====================================================================
//
// 桥接 wx 平台"发货信息管理"——商家在 https://mp.weixin.qq.com/wxamp/order
// 后台发货时，订单在我们后端 orders 集合中 status 仍可能是 paid/confirmed，
// 但实际已发货。本接口按 orderIds 批量调 wx getOrder 接口，返回
// order_state 与 shipping 字段，供前端判断 wx 平台发货状态。
//
// 返回结构：
//   { code, data: { items: [{ orderId, ok, order_state, shipping, error }] } }
async function getWxShippingStatus(event, _context, auth) {
    const { openid } = auth;
    if (!openid) {
        throw err('AUTH_REQUIRED', '未登录');
    }
    const { orderIds, orderType } = event;
    if (!Array.isArray(orderIds) || orderIds.length === 0) {
        throw err('INVALID_PARAMS', '缺少 orderIds');
    }
    if (orderIds.length > 50) {
        throw err('INVALID_PARAMS', '单次最多查询 50 个订单');
    }
    // @ts-ignore -- 编译产物 mallService/common/wxAccessToken.js 没有 .d.ts
    const { getWxOrderStatus } = await Promise.resolve().then(() => __importStar(require('./common/wxAccessToken')));
    // @ts-ignore -- 同上，wxOrderSync.js 是 .js 写法（被 orderReconcileService 复用）
    const { reconcileOrderWithWx } = await Promise.resolve().then(() => __importStar(require('./common/wxOrderSync')));
    // 订单统一存在 orders 集合，通过 type 字段区分 mall / group_buy
    // （曾经误写为 'group_buy_orders'，但该集合不存在，订单都在 orders 里）
    const collection = 'orders';
    const baseWhere = { _id: db.command.in(orderIds), ownerId: openid };
    if (orderType === 'group_buy' || orderType === 'mall') {
        baseWhere.type = orderType;
    }
    try {
        // 批量查订单的 transaction_id（wx 支付订单号）
        const _ = db;
        const orderRes = await db.collection(collection)
            .where(baseWhere)
            .field({ _id: true, transactionId: true, wxTransactionId: true, paidAt: true, status: true, type: true, paymentStatus: true })
            .get();
        const orderMap = new Map();
        for (const o of orderRes.data || []) {
            orderMap.set(o._id, o);
        }
        const items = await Promise.all(orderIds.map(async (orderId) => {
            const o = orderMap.get(orderId);
            if (!o) {
                return { orderId, ok: false, error: '订单不存在或无权限' };
            }
            const transactionId = o.wxTransactionId || o.transactionId || '';
            if (!transactionId) {
                return { orderId, ok: false, error: '该订单缺少 transactionId，无法查询 wx 发货状态' };
            }
            // ★ Plan A：对账式拉取——调 wx getOrder + 按需回写 orders
            const sync = await reconcileOrderWithWx({
                db,
                logger,
                order: { ...o, _id: o._id },
            });
            if (!sync.ok) {
                return { orderId, ok: false, error: sync.error || 'reconcile_failed', wxState: sync.wxState };
            }
            return {
                orderId,
                ok: true,
                order_state: sync.wxState,
                shipping: o.wxShipping || null, // 回写后本次返回的还是原对象引用；用 sync.after 携带最新 status
                transaction_id: transactionId,
                before: sync.before || null,
                after: sync.after || null,
                changed: sync.changed,
            };
        }));
        return handleSuccess({ items });
    }
    catch (error) {
        logger.error('getWxShippingStatus', error);
        return handleError(error, '查询 wx 发货状态失败', ERROR_CODES.SERVER);
    }
}
exports.getWxShippingStatus = getWxShippingStatus;
// =====================================================================
// 入口聚合：handlers 路由表
// =====================================================================
exports.handlers = {
    getProductList,
    getProductDetail,
    getCategoryStats,
    listCategories,
    checkCartItems,
    createProduct,
    updateProduct,
    deleteProduct,
    batchUpdateProducts,
    createOrder,
    createGroupBuyOrder,
    getMyOrders,
    getGroupBuyOrders,
    getOrderDetail,
    cancelOrder,
    confirmReceive,
    deleteOrder,
    getWxShippingStatus,
};
// =====================================================================
// Main 入口（云函数调用）
// =====================================================================
async function main(event, context) {
    const { action } = event;
    if (!action || !exports.handlers[action]) {
        throw err('INVALID_PARAMS', '无效的操作类型');
    }
    const WRITE_ACTIONS = [
        'createProduct', 'updateProduct', 'deleteProduct', 'batchUpdateProducts',
        'createOrder', 'createGroupBuyOrder', 'cancelOrder', 'confirmReceive',
        'deleteOrder', 'getGroupBuyOrders',
    ];
    const requireLogin = WRITE_ACTIONS.includes(action);
    try {
        const auth = await verifyAuth(event, { requireLogin });
        logger.info(action, { openid: auth.openid });
        return await exports.handlers[action](event, context, auth);
    }
    catch (error) {
        logger.error(action, error);
        const code = error.code || ERROR_CODES.BUSINESS;
        return handleError(error, error.message, code);
    }
}
exports.main = main;
// =====================================================================
// Runtime shim: CommonJS 兼容
// =====================================================================
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _mod = module;
_mod.exports = {
    main,
    getProductList,
    getProductDetail,
    getCategoryStats,
    listCategories,
    checkCartItems,
    createProduct,
    updateProduct,
    deleteProduct,
    batchUpdateProducts,
    createOrder,
    createGroupBuyOrder,
    getMyOrders,
    getGroupBuyOrders,
    getOrderDetail,
    cancelOrder,
    confirmReceive,
    deleteOrder,
    handlers: exports.handlers,
};
_mod.exports.default = _mod.exports;
exports.default = {
    main,
    getProductList,
    getProductDetail,
    getCategoryStats,
    listCategories,
    checkCartItems,
    createProduct,
    updateProduct,
    deleteProduct,
    batchUpdateProducts,
    createOrder,
    createGroupBuyOrder,
    getMyOrders,
    getGroupBuyOrders,
    getOrderDetail,
    cancelOrder,
    confirmReceive,
    deleteOrder,
    handlers: exports.handlers,
};
