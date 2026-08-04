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
 * 共 18 个 action：
 *   1. getProductList - 商品列表
 *   2. getProductDetail - 商品详情
 *   3. getCategoryStats - 分类统计
 *   4. listCategories - 分类列表
 *   5. checkCartItems - 购物车状态检查
 *  10. createOrder - 商城下单
 *  12. getMyOrders - 我的商城订单
 *  13. getGroupBuyOrders - 我的团购订单
 *  14. getOrderDetail - 订单详情
 *  15. cancelOrder - 取消订单
 *  16. confirmReceive - 确认收货
 *   17. deleteOrder - 删除订单
 *  18. getWxShippingStatus - 查询微信发货状态
 *
 * 注：物流轨迹查询已迁移到「微信物流查询插件」官方方案。
 *     发货时由 adminService.shipMallOrder / tuanService.shipTuanOrder 调
 *     wxLogistics.traceWaybill 拿 waybillToken 存到订单，
 *     前端 logistics-card 组件调 plugin.openWaybillTracking({waybillToken}) 拉起原生物流详情页。
 *
 * 迁移目标：
 *   - 强类型化所有 db 操作、handler 签名、返回结构
 *   - 复用 AuthLike / CloudEvent / CloudContext 公共类型
 *   - 与 adminService / partnerService / userService / activityService 保持类型一致
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.mallService.json
 *
 * 数据库索引建议（运维需在对应集合上创建）：
 *   products:
 *     - { status: 1, categoryId: 1 }               - 覆盖 getProductList / getCategoryStats
 *   orders:
 *     - { ownerId: 1, type: 1, status: 1, createdAt: -1 } - 覆盖 getMyOrders / getGroupBuyOrders
 *     - { orderNo: 1 }                              - 覆盖佣金记录查询
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = exports.handlers = exports.getWxShippingStatus = exports.deleteOrder = exports.confirmReceive = exports.getOrderDetail = exports.cancelOrder = exports.getGroupBuyOrders = exports.getMyOrders = exports.createMultiOrder = exports.createOrder = exports.getProductDetail = exports.checkCartItems = exports.listCategories = exports.getCategoryStats = exports.getProductList = void 0;
// =====================================================================
// 内部模块初始化（require CommonJS 模块）
// =====================================================================
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { initCloud, handleSuccess, handleError, generateId, ERROR_CODES, paginate, escapeRegExp } = require('./common/utils');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createLogger } = require('./common/logger');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { verifyAuth } = require('./common/auth-middleware');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { err, isBusinessError } = require('./common/errors');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { detectMallOrderRisk, mapActionToErrorCode } = require('./common/risk-control');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { withRateLimit } = require('./common/risk-rate-limit');
// Sprint 50: 限流统一 bootstrap
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { bootstrapRateLimit } = require('./common/rate-limit-bootstrap');
// H1: 佣金记录统一使用 common/commission-utils（含自购保护、system_config 配置、幂等）
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { cancelCommissionRecord: sharedCancelCommissionRecord } = require('./common/commission-utils');
// M6: 静态 require 替代动态 import，减少冷启动开销并保留类型推断
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { reconcileOrderWithWx } = require('./common/wxOrderSync');
// eslint-disable-next-line @typescript-eslint/no-var-requires
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
// 辅助函数：服务端优惠券校验（P0-1：与 tuanService 对齐，防下单金额伪造）
// =====================================================================
/**
 * 计算优惠券折扣（整数分计算，防浮点）——与 tuanService 同款实现
 */
function computeCouponDiscount(coupon, orderAmount) {
    const { type, rules } = coupon;
    if (!rules) {
        return { eligible: false, discount: 0, message: '优惠券规则缺失' };
    }
    const orderAmountInFen = Math.round(orderAmount * 100);
    if (orderAmountInFen < 0) {
        return { eligible: false, discount: 0, message: '订单金额异常' };
    }
    if (rules.threshold) {
        const thresholdInFen = Math.round(rules.threshold * 100);
        if (orderAmountInFen < thresholdInFen) {
            return { eligible: false, discount: 0, message: `订单金额未达到满${rules.threshold}元使用门槛` };
        }
    }
    let discountInFen = 0;
    switch (type) {
    case 'fixed_amount':
    case 'full_reduction':
        discountInFen = Math.round((rules.reduceAmount || 0) * 100);
        break;
    case 'discount': {
        const rate = Number(rules.discountRate) || 1;
        if (rate <= 0 || rate > 1) {
            return { eligible: false, discount: 0, message: '折扣率无效' };
        }
        discountInFen = Math.round(orderAmountInFen * (1 - rate));
        if (rules.maxReduceAmount && rules.maxReduceAmount > 0) {
            discountInFen = Math.min(discountInFen, Math.round(rules.maxReduceAmount * 100));
        }
        break;
    }
    default:
        return { eligible: false, discount: 0, message: '未知优惠券类型' };
    }
    discountInFen = Math.min(discountInFen, orderAmountInFen);
    return { eligible: true, discount: discountInFen / 100 };
}
/**
 * 服务端只读校验商城优惠券：
 *   - 归属 / 状态(unused|locked) / 有效期 / 适用范围（all|mall）
 *   - 折扣按 coupon.rules 服务端重算，不信任客户端 couponDiscount（防金额伪造）
 */
async function validateMallCoupon(openid, couponId, orderAmount) {
    if (typeof couponId !== 'string' || couponId.length < 1 || couponId.length > 128) {
        throw err('INVALID_PARAMS', '优惠券ID格式错误');
    }
    const couponRes = await db.collection('user_coupons').doc(couponId).get();
    const coupon = couponRes.data;
    if (!coupon) {
        throw err('COUPON_NOT_FOUND', '优惠券不存在');
    }
    if (coupon.ownerId !== openid) {
        throw err('PERMISSION_DENIED', '无权使用他人优惠券');
    }
    if (coupon.status !== 'unused' && coupon.status !== 'locked') {
        throw err('COUPON_STATUS_INVALID', `优惠券当前状态不可用：${coupon.status}`);
    }
    const now = new Date();
    if (coupon.startTime && now < new Date(coupon.startTime)) {
        throw err('BUSINESS_ERROR', '优惠券尚未生效');
    }
    if (coupon.endTime && now > new Date(coupon.endTime)) {
        throw err('BUSINESS_ERROR', '优惠券已过期');
    }
    const scopes = Array.isArray(coupon.applicableScopes) ? coupon.applicableScopes : [];
    if (scopes.length > 0 && !scopes.includes('all') && !scopes.includes('mall')) {
        throw err('BUSINESS_ERROR', '该优惠券不适用于商城订单');
    }
    const calc = computeCouponDiscount(coupon, orderAmount);
    if (!calc.eligible) {
        throw err('BUSINESS_ERROR', `优惠券不可用：${calc.message || '不满足使用条件'}`);
    }
    return {
        discount: calc.discount,
        couponSnapshot: {
            couponId,
            templateName: coupon.templateName || '',
            type: coupon.type || '',
            rules: coupon.rules || {},
        },
    };
}
// =====================================================================
// 辅助函数：批量获取临时文件 URL
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
    const { page = 1, pageSize = 10, category, categoryId, status = 'on_sale', isFeatured, keyword } = event;
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
    if (keyword) {
        const safeKeyword = escapeRegExp(String(keyword).slice(0, 50));
        where.$or = [
            { name: db.RegExp({ regexp: safeKeyword, options: 'i' }) },
            { subTitle: db.RegExp({ regexp: safeKeyword, options: 'i' }) },
            { category: db.RegExp({ regexp: safeKeyword, options: 'i' }) },
        ];
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
        // M8: 使用 aggregate group 在数据库侧分组统计，避免 limit(1000) 静默截断
        const $ = _.aggregate || { sum: (n) => ({ $sum: n }) };
        const aggRes = await db.collection('products')
            .aggregate()
            .match({ status: 'on_sale' })
            .group({
            _id: { category: '$category', categoryId: '$categoryId' },
            count: $.sum(1),
        })
            .end();
        const stats = {};
        for (const item of (aggRes.list || [])) {
            if (item._id && item._id.category) {
                stats[item._id.category] = (stats[item._id.category] || 0) + (item.count || 0);
            }
            if (item._id && item._id.categoryId) {
                stats[item._id.categoryId] = (stats[item._id.categoryId] || 0) + (item.count || 0);
            }
        }
        return handleSuccess(stats, '获取成功');
    }
    catch (error) {
        // M2: 区分集合未初始化与真实错误
        const errCode = error.errCode;
        const msg = (error.message || '').toLowerCase();
        const collectionMissing = errCode === -502001 ||
            errCode === -501019 ||
            /collection.*(not.*exist|does.*not.*exist)/i.test(msg);
        if (collectionMissing) {
            logger.warn('getCategoryStats.collection_missing', { msg: error.message });
            return handleSuccess({}, '获取成功');
        }
        logger.error('getCategoryStats', error);
        throw error;
    }
}
exports.getCategoryStats = getCategoryStats;
// =====================================================================
// Handler 3: listCategories
// =====================================================================
async function listCategories(_event, _context, _auth) {
    try {
        // M9: 分类理论上数量不多，但 limit(100) 仍可能在分类膨胀时静默截断
        //     采用分页拉取直到 isLastPage=true，确保返回完整分类列表
        const all = [];
        const PAGE_SIZE = 100;
        let page = 0;
        while (true) {
            const res = await db.collection('categories')
                .orderBy('sortOrder', 'asc')
                .skip(page * PAGE_SIZE)
                .limit(PAGE_SIZE)
                .get();
            const data = (res.data || []);
            all.push(...data);
            if (data.length < PAGE_SIZE) {
                break;
            }
            page++;
            // 安全上限：防止异常数据导致死循环（1000 个分类足够业务使用）
            if (page >= 10) {
                logger.warn('listCategories.truncated_at_safety_limit', { count: all.length });
                break;
            }
        }
        return handleSuccess(all, '获取成功');
    }
    catch (error) {
        // M2: 区分集合未初始化与真实错误
        const errCode = error.errCode;
        const msg = (error.message || '').toLowerCase();
        const collectionMissing = errCode === -502001 ||
            errCode === -501019 ||
            /collection.*(not.*exist|does.*not.*exist)/i.test(msg);
        if (collectionMissing) {
            logger.warn('listCategories.collection_missing', { msg: error.message });
            return handleSuccess([], '获取成功');
        }
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
    // M10: 校验 productIds 数量并限制单次查询上限，避免 limit(100) 静默截断
    //   - 购物车场景单次最多 50 个商品（与 getWxShippingStatus 一致的业务上限）
    //   - 超过则报错提示前端分批处理，防止静默丢失商品状态
    const MAX_CART_ITEMS = 50;
    if (productIds.length > MAX_CART_ITEMS) {
        throw err('INVALID_PARAMS', `单次最多查询 ${MAX_CART_ITEMS} 个商品状态`);
    }
    try {
        const res = await db.collection('products')
            .where({ _id: _.in(productIds) })
            .field({ _id: true, status: true, coverUrl: true, coverImage: true, name: true, price: true })
            .limit(MAX_CART_ITEMS)
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
        // M2: 区分集合未初始化与真实错误
        const errCode = error.errCode;
        const msg = (error.message || '').toLowerCase();
        const collectionMissing = errCode === -502001 ||
            errCode === -501019 ||
            /collection.*(not.*exist|does.*not.*exist)/i.test(msg);
        if (collectionMissing) {
            logger.warn('checkCartItems.collection_missing', { msg: error.message });
            return handleSuccess({}, '获取成功');
        }
        logger.error('checkCartItems', error);
        throw error;
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
        // M3: 区分 NOT_FOUND 与其他错误（数据库异常、权限等）
        if (isBusinessError(error) && error.code === 'NOT_FOUND') {
            return handleError(error, '商品不存在', ERROR_CODES.NOT_FOUND);
        }
        logger.error('getProductDetail', error);
        return handleError(error, '获取商品详情失败', ERROR_CODES.DATA);
    }
}
exports.getProductDetail = getProductDetail;
// =====================================================================
// 事务重试辅助：仅对「瞬时事务错误」重试，业务错误立即上抛，绝不遮蔽真因
// =====================================================================
function isTransientTransactionError(error) {
    // CloudBase SDK 抛出的事务错误对象是非标准结构：
    //   - message/name/stack 均为 undefined
    //   - JSON.stringify 输出 "{}"（属性可能是 getter 或原型链上的）
    //   - 实际错误信息在 result.code / result.message 中
    // 策略：穷举所有可能的属性访问路径
    const e = error;
    // 1. 直接属性访问（含 result 嵌套）
    const codes = [];
    const msgs = [];
    // 顶层 code/message
    if (typeof e?.code === 'string')
        codes.push(e.code);
    if (typeof e?.message === 'string')
        msgs.push(e.message);
    // result.code / result.message（CloudBase SDK 常见结构）
    if (typeof e?.result?.code === 'string')
        codes.push(e.result.code);
    if (typeof e?.result?.message === 'string')
        msgs.push(e.result.message);
    // error 字段（有时 SDK 用 error 而非 message）
    if (typeof e?.error === 'string')
        msgs.push(e.error);
    if (typeof e?.result?.error === 'string')
        msgs.push(e.result.error);
    // 2. Object.getOwnPropertyNames 遍历（含不可枚举属性）
    if (e && typeof e === 'object') {
        try {
            const names = Object.getOwnPropertyNames(e);
            for (const name of names) {
                const val = e[name];
                if (typeof val === 'string') {
                    codes.push(val);
                    msgs.push(val);
                }
                else if (val && typeof val === 'object') {
                    // 嵌套对象的属性也检查
                    try {
                        const subNames = Object.getOwnPropertyNames(val);
                        for (const subName of subNames) {
                            const subVal = val[subName];
                            if (typeof subVal === 'string') {
                                codes.push(subVal);
                                msgs.push(subVal);
                            }
                        }
                    }
                    catch { /* ignore */ }
                }
            }
        }
        catch { /* ignore */ }
    }
    // 3. 原型链上的属性（Error 实例的 message 可能在原型上）
    if (e && typeof e === 'object') {
        try {
            let proto = Object.getPrototypeOf(e);
            let depth = 0;
            while (proto && proto !== Object.prototype && depth < 3) {
                const protoNames = Object.getOwnPropertyNames(proto);
                for (const name of protoNames) {
                    try {
                        const val = e[name];
                        if (typeof val === 'string') {
                            codes.push(val);
                            msgs.push(val);
                        }
                    }
                    catch { /* getter 可能抛错 */ }
                }
                proto = Object.getPrototypeOf(proto);
                depth++;
            }
        }
        catch { /* ignore */ }
    }
    const allCodes = codes.join(' ');
    const allMsgs = msgs.join(' ');
    const combined = allCodes + ' ' + allMsgs;
    // 精确匹配 CloudBase SDK 事务错误码和消息
    if (/DATABASE_TRANSACTION_FAIL|TransactionNotExist|Transaction does not exist/i.test(combined))
        return true;
    // 宽泛匹配:事务过期/中止/写冲突
    if (/transaction.*(expired|abort)|write conflict/i.test(combined))
        return true;
    return false;
}
async function withRetryableTransaction(body, label, maxAttempts = 3) {
    let lastErr;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const transaction = await db.startTransaction();
        try {
            const res = await body(transaction);
            // CloudBase SDK transaction.commit() 不抛异常，而是返回 { code: 'DATABASE_TRANSACTION_FAIL', ... }
            // 必须主动检查 commit 响应，否则错误会作为正常结果返回给前端
            const commitRes = await transaction.commit();
            const commitCode = commitRes?.code || commitRes?.result?.code;
            if (commitCode && commitCode !== 0 && commitCode !== 'SUCCESS') {
                const commitMsg = commitRes?.message || commitRes?.result?.message || commitRes?.error || JSON.stringify(commitRes);
                const commitErr = new Error(commitMsg);
                commitErr.code = commitCode;
                commitErr.result = commitRes;
                throw commitErr;
            }
            return res;
        }
        catch (error) {
            await transaction.rollback().catch(() => { });
            // 详细调试日志:捕获错误对象的所有属性(含不可枚举)
            const e = error;
            const debugInfo = {
                attempt,
                type: typeof error,
                constructor: error?.constructor?.name,
                // 直接属性
                code: e?.code,
                message: e?.message,
                name: e?.name,
                stack: e?.stack,
                // 嵌套属性
                resultCode: e?.result?.code,
                resultMessage: e?.result?.message,
                resultError: e?.result?.error,
                errorField: e?.error,
                // 所有自有属性名
                ownKeys: e && typeof e === 'object' ? Object.getOwnPropertyNames(e) : [],
            };
            // 尝试序列化
            try {
                debugInfo.jsonStringify = JSON.stringify(error);
            }
            catch {
                debugInfo.jsonStringify = 'FAILED';
            }
            const transient = isTransientTransactionError(error);
            debugInfo.transient = transient;
            logger.error(`${label}.transaction.debug`, debugInfo);
            if (transient && attempt < maxAttempts) {
                lastErr = error;
                await new Promise((r) => setTimeout(r, 60 * attempt)); // 轻微退避，降低瞬时冲突概率
                continue;
            }
            throw error;
        }
    }
    throw lastErr;
}
// =====================================================================
// Handler 11: createOrder（商城下单）
// =====================================================================
async function createOrder(event, _context, auth) {
    const { openid } = auth;
    if (!openid) {
        throw err('AUTH_REQUIRED', '未登录');
    }
    const { productId, skuId, quantity = 1, receiverName, receiverPhone, receiverAddress, couponId, couponDiscount, originalAmount } = event;
    if (!productId) {
        throw err('INVALID_PARAMS', '缺少商品ID');
    }
    if (!receiverAddress) {
        throw err('INVALID_PARAMS', '缺少收货地址');
    }
    // P2-2: 数量服务端校验（防 0/负数/非数字下单）
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 1 || qty > 999) {
        throw err('INVALID_PARAMS', '购买数量无效');
    }
    // P0-1: 客户端 couponDiscount 仅作冗余校验（无券时必须为 0，有券时以服务端重算为准）
    const couponDiscountNum = Number(couponDiscount) || 0;
    if (couponDiscount != null && (Number(couponDiscount) < 0 || !Number.isFinite(Number(couponDiscount)))) {
        throw err('INVALID_PARAMS', '优惠券折扣金额必须为非负数');
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
    return withRetryableTransaction(async (transaction) => {
        // H4: 事务内重新读取商品并校验，避免 TOCTOU 超卖竞态
        const txProductRes = await transaction.collection('products').doc(productId).get();
        const product = txProductRes.data;
        if (!product || product.status !== 'on_sale') {
            throw err('BUSINESS_ERROR', '商品不可购买');
        }
        let unitPrice = product.price || 0;
        let skuText = '';
        let stockKey = 'stock';
        if (product.skuType === 'multi' && skuId) {
            const skuIndex = product.skus ? product.skus.findIndex((s) => s.skuId === skuId) : -1;
            if (skuIndex < 0) {
                throw err('BUSINESS_ERROR', 'SKU不存在');
            }
            const sku = product.skus && product.skus[skuIndex];
            if (!sku || sku.enabled === false) {
                throw err('BUSINESS_ERROR', sku && sku.enabled === false ? '该规格已下架' : 'SKU不存在');
            }
            if (!sku || Number(sku.stock) < Number(quantity)) {
                throw err('BUSINESS_ERROR', '库存不足');
            }
            unitPrice = sku.price || 0;
            skuText = sku.specText || '';
            stockKey = `skus.${skuIndex}.stock`;
        }
        else {
            const availableStock = product.totalStock || product.stock || 0;
            if (availableStock < Number(quantity)) {
                throw err('BUSINESS_ERROR', '库存不足');
            }
        }
        // P0-1: 服务端校验优惠券并计算折扣（不信任客户端 couponDiscount，防金额伪造）
        const grossAmount = Math.round(unitPrice * 100 * Number(quantity)) / 100;
        let validatedCouponDiscount = 0;
        if (couponId) {
            const lockResult = await validateMallCoupon(openid, couponId, grossAmount);
            validatedCouponDiscount = lockResult.discount;
        }
        else if (couponDiscountNum > 0) {
            throw err('INVALID_PARAMS', '未选择优惠券时不允许折扣');
        }
        const finalAmount = Math.max(0, Math.round(grossAmount * 100 - validatedCouponDiscount * 100) / 100);
        if (couponId && finalAmount < 0.1) {
            throw err('INVALID_PARAMS', '优惠后订单金额必须 ≥ 0.1 元');
        }
        const orderNo = `M${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        const order = {
            orderNo,
            productId,
            productName: product.name || '',
            productImage: product.coverImage || product.coverUrl || (product.images && product.images[0]) || '',
            skuId: skuId || '',
            skuText,
            unitPrice,
            quantity: Number(quantity),
            // P0-3: 使用整数分计算避免浮点精度
            totalAmount: grossAmount,
            // P0-1: 实付金额 = 服务端原价 - 服务端校验后的券折扣（客户端折扣不再参与计算）
            finalAmount,
            // P1-3: 冗余记录券信息（折扣以服务端重算为准）
            couponId: couponId || '',
            couponDiscount: validatedCouponDiscount,
            originalAmount: Number(originalAmount) || grossAmount,
            receiverName: receiverName || '',
            receiverPhone: receiverPhone || '',
            receiverAddress,
            ownerId: openid,
            ownerName: auth.nickName || '',
            status: 'pending_payment',
            type: 'mall',
            // H6: 与其他服务一致，待支付订单初始化 paymentStatus='unpaid'
            paymentStatus: 'unpaid',
            pendingReview: orderRisk.pendingReview,
            riskDecision: orderRisk.decision,
            riskReasons: orderRisk.reasons,
            createdAt: db.serverDate(),
            updatedAt: db.serverDate(),
        };
        order._id = generateId('order', openid);
        // H7: idx_bookingKey_unique 唯一索引要求 orders 全文档 bookingKey 唯一
        //   商城订单无寄养业务键,用 _id 占位保证唯一性,避免 null 冲突导致 -502001 DuplicateKey
        order.bookingKey = `nb_${order._id}`;
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
        // H8: commit 由 withRetryableTransaction 统一管理,body 内不能再调 transaction.commit()
        //   否则会触发 double commit,第二次 commit 报 TransactionNotExist
        return handleSuccess({ orderId: orderAddRes._id, orderNo }, '下单成功');
    }, 'createOrder');
}
exports.createOrder = createOrder;
// =====================================================================
// Handler 11.5: createMultiOrder - 多商品合并下单（购物车一次支付多件）
//   P1-C: 支持用户一次性支付购买多件产品（单订单多 items，避免"多单只支付一单"断裂）
// =====================================================================
async function createMultiOrder(event, _context, auth) {
    const { openid } = auth;
    if (!openid) {
        throw err('AUTH_REQUIRED', '未登录');
    }
    const { items, receiverName, receiverPhone, receiverAddress, couponId, couponDiscount, originalAmount } = event;
    if (!items || !Array.isArray(items) || items.length === 0) {
        throw err('INVALID_PARAMS', '缺少商品列表');
    }
    if (items.length > 20) {
        throw err('INVALID_PARAMS', '单笔订单商品数不能超过 20');
    }
    if (!receiverAddress) {
        throw err('INVALID_PARAMS', '缺少收货地址');
    }
    // P0-1: 客户端 couponDiscount 仅作冗余校验（无券时必须为 0，有券时以服务端重算为准）
    const couponDiscountNum = Number(couponDiscount) || 0;
    if (couponDiscount != null && (Number(couponDiscount) < 0 || !Number.isFinite(Number(couponDiscount)))) {
        throw err('INVALID_PARAMS', '优惠券折扣金额必须为非负数');
    }
    // 归一化 items 并去重（productId+skuId）
    const normItems = [];
    const seen = new Set();
    for (const it of items) {
        const pid = String(it?.productId || '');
        const sid = String(it?.skuId || '');
        // P2-2: 数量服务端校验（防 0/负数/非数字下单）
        const qtyNum = Number(it?.quantity);
        if (!Number.isInteger(qtyNum) || qtyNum < 1 || qtyNum > 999) {
            throw err('INVALID_PARAMS', '购买数量无效');
        }
        const qty = qtyNum;
        if (!pid) {
            throw err('INVALID_PARAMS', '商品ID缺失');
        }
        const key = `${pid}_${sid}`;
        if (seen.has(key)) {
            throw err('INVALID_PARAMS', '商品存在重复');
        }
        seen.add(key);
        normItems.push({ productId: pid, skuId: sid, quantity: qty });
    }
    // 预读 + 大额风控（金额预估）
    let previewTotalFen = 0;
    for (const it of normItems) {
        const pRes = await db.collection('products').doc(it.productId).get();
        const p = pRes.data;
        if (!p || p.status !== 'on_sale') {
            throw err('BUSINESS_ERROR', '商品不可购买');
        }
        let unit = Number(p.price) || 0;
        if (p.skuType === 'multi' && it.skuId) {
            const sku = (p.skus || []).find((s) => s.skuId === it.skuId);
            if (!sku) {
                throw err('BUSINESS_ERROR', 'SKU不存在');
            }
            unit = Number(sku.price) || 0;
        }
        previewTotalFen += Math.round(unit * it.quantity * 100);
    }
    const orderRisk = await performMallOrderRiskCheck({
        openid,
        productId: normItems[0].productId,
        amountFen: previewTotalFen,
    });
    return withRetryableTransaction(async (transaction) => {
        // 事务内逐项校验 + 扣库存（与 createOrder 单商品逻辑对称，防 TOCTOU 超卖）
        let totalAmount = 0;
        let totalQty = 0;
        const orderItems = [];
        let firstProduct = null;
        for (const it of normItems) {
            const txRes = await transaction.collection('products').doc(it.productId).get();
            const product = txRes.data;
            if (!product || product.status !== 'on_sale') {
                throw err('BUSINESS_ERROR', '商品不可购买');
            }
            if (!firstProduct) {
                firstProduct = product;
            }
            let unitPrice = product.price || 0;
            let skuText = '';
            let stockKey = 'stock';
            if (product.skuType === 'multi' && it.skuId) {
                const skuIndex = product.skus ? product.skus.findIndex((s) => s.skuId === it.skuId) : -1;
                if (skuIndex < 0) {
                    throw err('BUSINESS_ERROR', 'SKU不存在');
                }
                const sku = product.skus && product.skus[skuIndex];
                if (!sku || sku.enabled === false) {
                    throw err('BUSINESS_ERROR', sku && sku.enabled === false ? '该规格已下架' : 'SKU不存在');
                }
                if (!sku || Number(sku.stock) < it.quantity) {
                    throw err('BUSINESS_ERROR', '库存不足');
                }
                unitPrice = sku.price || 0;
                skuText = sku.specText || '';
                stockKey = `skus.${skuIndex}.stock`;
            }
            else {
                const availableStock = product.totalStock || product.stock || 0;
                if (availableStock < it.quantity) {
                    throw err('BUSINESS_ERROR', '库存不足');
                }
            }
            const itemAmount = Math.round(unitPrice * 100 * it.quantity) / 100;
            totalAmount += itemAmount;
            totalQty += it.quantity;
            orderItems.push({
                productId: it.productId,
                skuId: it.skuId || '',
                skuText,
                quantity: it.quantity,
                unitPrice,
                productName: product.name || '',
                productImage: product.coverImage || product.coverUrl || (product.images && product.images[0]) || '',
                amount: itemAmount,
            });
            const updateData = {
                totalStock: _.inc(-it.quantity),
                soldCount: _.inc(it.quantity),
                updatedAt: db.serverDate(),
            };
            if (product.skuType === 'multi' && it.skuId) {
                updateData[stockKey] = _.inc(-it.quantity);
                const skuIndex = product.skus ? product.skus.findIndex((s) => s.skuId === it.skuId) : -1;
                if (skuIndex >= 0) {
                    updateData[`skus.${skuIndex}.soldCount`] = _.inc(it.quantity);
                }
            }
            else {
                updateData.stock = _.inc(-it.quantity);
            }
            await transaction.collection('products').doc(it.productId).update({ data: updateData });
        }
        totalAmount = Math.round(totalAmount * 100) / 100;
        // P0-1: 服务端校验优惠券并计算折扣（不信任客户端 couponDiscount，防金额伪造）
        let validatedCouponDiscount = 0;
        if (couponId) {
            const lockResult = await validateMallCoupon(openid, couponId, totalAmount);
            validatedCouponDiscount = lockResult.discount;
        }
        else if (couponDiscountNum > 0) {
            throw err('INVALID_PARAMS', '未选择优惠券时不允许折扣');
        }
        const finalAmount = Math.max(0, Math.round(totalAmount * 100 - validatedCouponDiscount * 100) / 100);
        if (couponId && finalAmount < 0.1) {
            throw err('INVALID_PARAMS', '优惠后订单金额必须 ≥ 0.1 元');
        }
        const orderNo = `M${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        const order = {
            orderNo,
            productId: normItems[0].productId,
            productName: (firstProduct && firstProduct.name) || '',
            productImage: (firstProduct && (firstProduct.coverImage || firstProduct.coverUrl || (firstProduct.images && firstProduct.images[0]))) || '',
            skuId: normItems[0].skuId || '',
            quantity: totalQty,
            items: orderItems,
            totalAmount,
            finalAmount,
            couponId: couponId || '',
            couponDiscount: validatedCouponDiscount,
            originalAmount: Number(originalAmount) || totalAmount,
            receiverName: receiverName || '',
            receiverPhone: receiverPhone || '',
            receiverAddress,
            ownerId: openid,
            ownerName: auth.nickName || '',
            status: 'pending_payment',
            type: 'mall',
            paymentStatus: 'unpaid',
            pendingReview: orderRisk.pendingReview,
            riskDecision: orderRisk.decision,
            riskReasons: orderRisk.reasons,
            createdAt: db.serverDate(),
            updatedAt: db.serverDate(),
        };
        order._id = generateId('order', openid);
        order.bookingKey = `nb_${order._id}`;
        const orderAddRes = await transaction.collection('orders').add({ data: order });
        return handleSuccess({ orderId: orderAddRes._id, orderNo }, '下单成功');
    }, 'createMultiOrder');
}
exports.createMultiOrder = createMultiOrder;
// =====================================================================
// Handler 12: getMyOrders
// =====================================================================
async function getMyOrders(event, _context, auth) {
    const { openid } = auth;
    if (!openid) {
        throw err('AUTH_REQUIRED', '未登录');
    }
    const { status, page = 1, pageSize = 20 } = event;
    // H5: 修复 where.status 冲突——原逻辑 _.neq('deleted') 会被传入的 status 覆盖，导致泄露已删除订单
    const where = { ownerId: openid, type: 'mall' };
    if (status && status !== 'all' && status !== 'deleted') {
        where.status = status;
    }
    else {
        where.status = _.neq('deleted');
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
    // H5: 同 getMyOrders，防止已删除订单泄露
    const where = { ownerId: openid, type: 'group_buy' };
    if (status && status !== 'all' && status !== 'deleted') {
        where.status = status;
    }
    else {
        where.status = _.neq('deleted');
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
/**
 * P0-4 修复：取消订单时解锁 user_coupons 中 status='locked' 且 lockedOrderId=orderId 的记录。
 * 复制自 orderTimeoutService 同款实现（各云函数独立部署）。
 */
async function unlockOrderCoupons(orderId, couponId) {
    if (!orderId && !couponId) {
        return;
    }
    try {
        // P1-2/P0-B: 优先按订单内 couponId 直解——
        //   前端 lockCoupon 时传的是临时订单号（mall_xxx），与真实订单 _id 不匹配，
        //   原按 orderId 查 user_coupons 恒空导致券永不自动解锁；couponId 直解最可靠
        if (couponId) {
            await db.collection('user_coupons').where({ _id: couponId, status: 'locked' })
                .update({ data: { status: 'unused', updatedAt: db.serverDate() } });
            return;
        }
        // P1-2: couponService.lockCoupon 写入的关联字段是 orderId（非 lockedOrderId），
        //   原查询恒空导致券永不自动解锁；用 _.or 兼容历史 lockedOrderId 数据
        const lockedCoupons = await db.collection('user_coupons')
            .where(_.or([
            { orderId, status: 'locked' },
            { lockedOrderId: orderId, status: 'locked' },
        ]))
            .field({ _id: true, endTime: true })
            .limit(20)
            .get();
        const lockedList = (lockedCoupons.data || []);
        const now = new Date();
        const expiredIds = [];
        const unusedIds = [];
        for (const coupon of lockedList) {
            const isExpired = coupon.endTime ? new Date(coupon.endTime) < now : false;
            (isExpired ? expiredIds : unusedIds).push(coupon._id);
        }
        if (expiredIds.length > 0) {
            await db.collection('user_coupons').where({ _id: _.in(expiredIds), status: 'locked' })
                .update({ data: { status: 'expired', updatedAt: db.serverDate() } });
        }
        if (unusedIds.length > 0) {
            await db.collection('user_coupons').where({ _id: _.in(unusedIds), status: 'locked' })
                .update({ data: { status: 'unused', updatedAt: db.serverDate() } });
        }
    }
    catch (e) {
        logger.error('unlockOrderCoupons', e);
    }
}
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
        // H7: 校验 paymentStatus，防止取消已支付订单（与 feedingService M6 一致）
        //   - unpaid：允许取消（待支付订单超时/主动取消）
        //   - paid：拒绝取消（已支付订单须走退款流程，不可直接取消）
        //   - 其他/缺失：拒绝并告警，需人工核对
        const paymentStatus = String(orderData.paymentStatus || '').toLowerCase();
        if (paymentStatus && paymentStatus !== 'unpaid') {
            logger.warn('cancelOrder.invalid_payment_status', {
                orderId, status: orderData.status, paymentStatus,
            });
            if (paymentStatus === 'paid') {
                throw err('BUSINESS_ERROR', '订单已支付，无法直接取消，请走退款流程');
            }
            throw err('BUSINESS_ERROR', `订单支付状态异常：${paymentStatus || '(空)'}`);
        }
        // 预查商品 SKU 索引（事务外预读，事务内仅做 update）
        let skuIndex = -1;
        if (orderData.skuId && orderData.productId) {
            const productRes = await db.collection('products').doc(orderData.productId).get();
            const productData = productRes.data;
            if (productData && productData.skus) {
                skuIndex = productData.skus.findIndex((s) => s.skuId === orderData.skuId);
            }
        }
        // 事务：订单状态更新 + 库存回退原子化，避免库存泄漏
        const transaction = await db.startTransaction();
        try {
            await transaction.collection('orders').doc(orderId).update({
                data: { status: 'cancelled', cancelReason: '买家主动取消', cancelledAt: db.serverDate(), updatedAt: db.serverDate() },
            });
            if (orderData.productId) {
                // P1-C: 合并单（items）逐项回退；单商品回退顶层/SKU（与下单扣减逻辑对称）
                const items = orderData.items;
                if (items && items.length > 0) {
                    for (const it of items) {
                        if (!it.productId) {
                            continue;
                        }
                        const qty = it.quantity || 1;
                        const stockUpdateData = {
                            totalStock: _.inc(qty),
                            soldCount: _.inc(-qty),
                            updatedAt: db.serverDate(),
                        };
                        let itSkuIndex = -1;
                        if (it.skuId) {
                            const pRes = await db.collection('products').doc(it.productId).get();
                            const pd = pRes.data;
                            if (pd && pd.skus) {
                                itSkuIndex = pd.skus.findIndex((s) => s.skuId === it.skuId);
                            }
                        }
                        if (it.skuId && itSkuIndex >= 0) {
                            stockUpdateData[`skus.${itSkuIndex}.stock`] = _.inc(qty);
                            stockUpdateData[`skus.${itSkuIndex}.soldCount`] = _.inc(-qty);
                        }
                        else {
                            stockUpdateData.stock = _.inc(qty);
                        }
                        await transaction.collection('products').doc(it.productId).update({ data: stockUpdateData });
                    }
                }
                else {
                    // 单商品订单：回退原商品库存（P0-4(b): SKU 模式只回退 skus[i].stock 不回退顶层）
                    const qty = orderData.quantity || 1;
                    const stockUpdateData = {
                        totalStock: _.inc(qty),
                        soldCount: _.inc(-qty),
                        updatedAt: db.serverDate(),
                    };
                    if (orderData.skuId && skuIndex >= 0) {
                        stockUpdateData[`skus.${skuIndex}.stock`] = _.inc(qty);
                        stockUpdateData[`skus.${skuIndex}.soldCount`] = _.inc(-qty);
                    }
                    else {
                        stockUpdateData.stock = _.inc(qty);
                    }
                    await transaction.collection('products').doc(orderData.productId).update({
                        data: stockUpdateData,
                    });
                }
            }
            await transaction.commit();
        }
        catch (txError) {
            // 事务可能已被服务端 abort 终结，rollback 容错避免 TransactionNotExist 覆盖真实错误
            logger.error('cancelOrder.transaction', txError);
            await transaction.rollback().catch(() => { });
            throw txError;
        }
        // 取消佣金记录（best-effort，独立于事务，失败不影响取消结果）
        // 使用 common/commission-utils 共享实现（含幂等检查）
        try {
            await sharedCancelCommissionRecord(orderId);
        }
        catch (commissionErr) {
            logger.warn('cancelCommissionRecord', { msg: commissionErr?.message });
        }
        // P0-4 修复：主动取消未支付订单时解锁被锁定的优惠券（与 orderTimeoutService 超时路径一致）
        try {
            await unlockOrderCoupons(orderId, orderData.couponId);
        }
        catch (couponErr) {
            logger.warn('cancelOrder.unlockCoupons', { orderId, msg: couponErr?.message });
        }
        return handleSuccess(null, '取消成功');
    }
    catch (error) {
        logger.error('cancelOrder', error);
        return handleError(error, '取消订单失败', ERROR_CODES.DATA);
    }
}
exports.cancelOrder = cancelOrder;
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
                // M6: 改用顶部静态 require 的 reconcileOrderWithWx
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
    // M11: orderType 白名单校验，防止注入任意字符串查询其他业务订单
    //   - mallService 仅管理 'mall' 和 'group_buy' 两种订单类型
    //   - 传入其他值（如 'boarding'/'feeding'）应拒绝，避免越权查询
    const ALLOWED_ORDER_TYPES = ['mall', 'group_buy'];
    if (orderType !== undefined && !ALLOWED_ORDER_TYPES.includes(orderType)) {
        throw err('INVALID_PARAMS', `无效的 orderType，仅支持：${ALLOWED_ORDER_TYPES.join(', ')}`);
    }
    // M6: 改用顶部静态 require 的 getWxOrderStatus / reconcileOrderWithWx
    // 订单统一存在 orders 集合，通过 type 字段区分 mall / group_buy
    // （曾经误写为 'group_buy_orders'，但该集合不存在，订单都在 orders 里）
    const collection = 'orders';
    // L3: 严格化 baseWhere 类型，避免 any
    const baseWhere = { _id: db.command.in(orderIds), ownerId: openid };
    if (orderType === 'group_buy' || orderType === 'mall') {
        baseWhere.type = orderType;
    }
    try {
        // 批量查订单的 transaction_id（wx 支付订单号）
        // M5: 删除冗余的 `const _ = db`，避免遮蔽顶部的 db.command
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
    createOrder,
    createMultiOrder,
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
        'createOrder', 'createMultiOrder', 'cancelOrder', 'confirmReceive',
        'deleteOrder',
    ];
    const requireLogin = WRITE_ACTIONS.includes(action);
    try {
        const auth = await verifyAuth(event, { requireLogin });
        logger.info(action, { openid: auth.openid, isAdmin: !!auth.isAdmin });
        return await exports.handlers[action](event, context, auth);
    }
    catch (error) {
        // H8: CloudBase SDK 事务错误对象结构异常(message/name/stack 均为 undefined)
        //   isTransientTransactionError 可能无法识别，在 main handler 层做兜底重试
        const errStr = String(error);
        const isTransactionError = /TransactionNotExist|Transaction does not exist|DATABASE_TRANSACTION_FAIL/i.test(errStr);
        if (isTransactionError && WRITE_ACTIONS.includes(action)) {
            logger.warn(`${action}.retry`, { reason: 'transaction_error', error: errStr });
            try {
                const auth = await verifyAuth(event, { requireLogin });
                return await exports.handlers[action](event, context, auth);
            }
            catch (retryError) {
                logger.error(`${action}.retry.failed`, { error: String(retryError) });
                const code = retryError.code || ERROR_CODES.BUSINESS;
                return handleError(retryError, retryError.message, code);
            }
        }
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
    createOrder,
    createMultiOrder,
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
    createOrder,
    createMultiOrder,
    getMyOrders,
    getGroupBuyOrders,
    getOrderDetail,
    cancelOrder,
    confirmReceive,
    deleteOrder,
    handlers: exports.handlers,
};
