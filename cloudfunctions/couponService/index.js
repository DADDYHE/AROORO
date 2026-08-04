"use strict";
/**
 * couponService/index.ts - 优惠券服务主入口（TypeScript 源文件 - Sprint 43 迁移）
 *
 * 业务功能：
 *   - 我的优惠券（按状态查询）
 *   - 可用优惠券（订单计算折扣）
 *   - 可领取模板（领券中心）
 *   - 弹窗优惠券（指定页面）
 *   - 优惠券生命周期：领取 → 锁定（订单）→ 核销（支付完成）/ 解锁（取消）
 *
 * 共 8 个 action：
 *   1. getMyCoupons - 我的优惠券
 *   2. getAvailableCoupons - 可用优惠券
 *   3. getClaimableTemplates - 可领取模板
 *   4. getPopupCoupon - 弹窗优惠券
 *   5. claimCoupon - 领取优惠券
 *   6. lockCoupon - 锁定优惠券（订单创建时）
 *   7. useCoupon - 核销优惠券（订单完成时）
 *   8. unlockCoupon - 解锁优惠券（订单取消时）
 *
 * 优惠券类型：
 *   - fixed_amount / full_reduction：固定金额（rules.reduceAmount）
 *   - discount：折扣率（rules.discountRate，可选 rules.maxReduceAmount 封顶）
 *
 * 状态流转：unused → locked → used
 *         或：unused → locked → expired（解锁时已过期）
 *
 * 迁移目标：
 *   - 强类型化所有 db 操作、handler 签名、返回结构
 *   - 复用 AuthLike / CloudEvent / CloudContext 公共类型
 *   - 优惠券规则 / 状态 / 类型强类型化
 *   - 与 adminService / partnerService / userService / activityService / mallService / feedingService / hostService 保持类型一致
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.couponService.json
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = exports.handlers = exports.getPopupCoupon = exports.unlockCoupon = exports.useCoupon = exports.lockCoupon = exports.claimCoupon = exports.getClaimableTemplates = exports.getAvailableCoupons = exports.getMyCoupons = exports.calculateCouponDiscount = exports.generateCouponCode = void 0;
// =====================================================================
// 内部模块初始化（require CommonJS 模块）
// =====================================================================
/* eslint-disable @typescript-eslint/no-var-requires */
const { initCloud, handleSuccess, generateId, paginate } = require('./common/utils');
const { createLogger } = require('./common/logger');
const { writeOperationLog } = require('./common/operation-log');
const { verifyAuth } = require('./common/auth-middleware');
const { err, toResponse } = require('./common/errors');
const { recordAlert } = require('./common/alert');
// P0-6: 接入限流系统
const { bootstrapRateLimit } = require('./common/rate-limit-bootstrap');
const { withRateLimit } = require('./common/risk-rate-limit');
/* eslint-enable @typescript-eslint/no-var-requires */
// P0-7: 使用 Node 内置 crypto 替代 Math.random
const crypto = require('crypto');
const { db } = initCloud();
const logger = createLogger('couponService');
const _ = db.command;
// P0-6: 启动期注入限流系统（best-effort，失败不阻断）
try {
    bootstrapRateLimit(db, { logger });
}
catch (e) {
    logger.warn('rateLimit.bootstrap.failed', e);
}
// P3-10: getPopupCoupon 内存缓存（弹窗数据相对静态，10 秒内复用）
//   - key: `${openid}:${pageKey}`，value: { data, expireAt }
//   - 云函数实例间不共享，仅用于单实例内的重复调用优化
//   - R2: TTL 从 30s 缩短至 10s，平衡性能与 remaining 实时性
//   - N1: 使用哨兵对象区分"未缓存"和"缓存了 null"
const POPUP_CACHE_TTL_MS = 10 * 1000;
const CACHE_MISS = Symbol('miss');
const popupCache = new Map();
function getPopupCache(key) {
    const entry = popupCache.get(key);
    if (!entry) {
        return CACHE_MISS;
    }
    if (Date.now() > entry.expireAt) {
        popupCache.delete(key);
        return CACHE_MISS;
    }
    return entry.data;
}
function setPopupCache(key, data) {
    // 防止内存泄漏：超过 1000 条时清空最旧条目
    if (popupCache.size > 1000) {
        popupCache.clear();
    }
    popupCache.set(key, { data, expireAt: Date.now() + POPUP_CACHE_TTL_MS });
}
// =====================================================================
// 辅助函数：生成优惠券码
// =====================================================================
function generateCouponCode() {
    const prefix = 'CP';
    const timestamp = Date.now().toString(36).toUpperCase();
    // P0-7: 使用 crypto.randomBytes 替代 Math.random，避免可预测性
    const random = crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
    return `${prefix}${timestamp}${random}`;
}
exports.generateCouponCode = generateCouponCode;
// =====================================================================
// P2-7/P2-8: 业务常量与参数校验
// =====================================================================
/** 优惠券状态枚举（与 CouponStatus 类型对应） */
const VALID_COUPON_STATUSES = ['unused', 'locked', 'used', 'expired'];
/**
 * 业务类型白名单（与项目 memory 中 VALID_BUSINESS_TYPES 约定一致）。
 * boarding 为寄养规范键（已彻底统一，hosting 历史别名于 2026-08-02 收敛去除）。
 */
const VALID_BUSINESS_TYPES = ['boarding', 'feeding', 'mall', 'activity', 'tuan'];
/** ID 最大长度（防超长字符串注入） */
const MAX_ID_LENGTH = 64;
/**
 * 校验 ID 格式：非空字符串、长度不超过 64、仅允许字母数字下划线
 * @returns 校验通过返回 true
 */
function isValidId(id) {
    return typeof id === 'string' &&
        id.length > 0 &&
        id.length <= MAX_ID_LENGTH &&
        /^[a-zA-Z0-9_]+$/.test(id);
}
/**
 * 校验 status 是否在白名单内
 */
function isValidCouponStatus(status) {
    return typeof status === 'string' &&
        VALID_COUPON_STATUSES.includes(status);
}
/**
 * 校验 business 是否在白名单内（空表示不限业务）
 */
function isValidBusinessType(business) {
    if (!business) {
        return true;
    }
    return typeof business === 'string' &&
        VALID_BUSINESS_TYPES.includes(business);
}
/**
 * P3-6: 加载并鉴权优惠券（lockCoupon/useCoupon/unlockCoupon 共用）
 *   - 查询优惠券（doc(id).get()）
 *   - 校验存在性
 *   - 校验归属（ownerId === openid）
 *   - 校验状态（可选，传入 expectedStatus 时校验）
 * @param couponId  优惠券 ID
 * @param openid    调用者 openid
 * @param expectedStatus  期望的状态（不传则不校验）
 */
async function loadAndAuthorizeCoupon(couponId, openid, expectedStatus) {
    let coupon;
    try {
        const couponRes = await db.collection('user_coupons').doc(couponId).get();
        if (!couponRes.data) {
            throw err('NOT_FOUND', '优惠券不存在');
        }
        coupon = couponRes.data;
    }
    catch (e) {
        const msg = e?.message || '';
        if (msg.includes('NOT_FOUND') || msg.includes('不存在')) {
            throw e;
        }
        throw err('NOT_FOUND', '优惠券不存在');
    }
    if (coupon.ownerId !== openid) {
        throw err('PERMISSION_DENIED', '无权操作此优惠券');
    }
    if (expectedStatus && coupon.status !== expectedStatus) {
        throw err('COUPON_STATUS_INVALID', `当前状态: ${coupon.status}`);
    }
    return coupon;
}
// =====================================================================
// 辅助函数：计算优惠券折扣
// =====================================================================
function calculateCouponDiscount(coupon, orderAmount) {
    const { type, rules } = coupon;
    if (!rules) {
        return { eligible: false, message: '优惠券规则缺失' };
    }
    // P3-2: 使用整数分计算避免浮点精度问题（项目 memory 要求资金计算用整数分）
    //   例如 orderAmount=19.99, discountRate=0.85 时浮点运算可能出现 0.01 元误差
    const orderAmountInFen = Math.round(orderAmount * 100);
    // R3: threshold 也统一为分比较，避免元比较与分计算不一致
    if (rules.threshold) {
        const thresholdInFen = Math.round(rules.threshold * 100);
        if (orderAmountInFen < thresholdInFen) {
            return { eligible: false, message: `订单金额未达到满${rules.threshold}元使用门槛` };
        }
    }
    let discountAmountInFen = 0;
    switch (type) {
        case 'fixed_amount':
        case 'full_reduction':
            discountAmountInFen = Math.round((rules.reduceAmount || 0) * 100);
            break;
        case 'discount':
            // 校验 discountRate 范围（0 < rate <= 1，例如 0.8 表示八折）
            const discountRate = Number(rules.discountRate) || 1;
            if (discountRate <= 0 || discountRate > 1) {
                return { eligible: false, message: '折扣率无效' };
            }
            discountAmountInFen = Math.round(orderAmountInFen * (1 - discountRate));
            if (rules.maxReduceAmount && rules.maxReduceAmount > 0) {
                const maxReduceInFen = Math.round(rules.maxReduceAmount * 100);
                discountAmountInFen = Math.min(discountAmountInFen, maxReduceInFen);
            }
            break;
        default:
            return { eligible: false, message: '未知优惠券类型' };
    }
    // 折扣不能超过订单金额
    discountAmountInFen = Math.min(discountAmountInFen, orderAmountInFen);
    // 转回元
    const discountAmount = discountAmountInFen / 100;
    return { eligible: true, discountAmount };
}
exports.calculateCouponDiscount = calculateCouponDiscount;
// =====================================================================
// Handler 1: getMyCoupons
// =====================================================================
async function getMyCoupons(event, _context, auth) {
    const { status, page = 1, pageSize = 20 } = event;
    if (!auth.openid) {
        throw err('AUTH_REQUIRED', '未登录');
    }
    // P2-7: status 枚举校验，避免无效值浪费 DB 查询
    if (status !== undefined && !isValidCouponStatus(status)) {
        throw err('INVALID_PARAMS', `无效的优惠券状态: ${status}`);
    }
    // P2-8: page/pageSize 类型校验
    const safePage = Math.max(1, Math.floor(Number(page) || 1));
    const safePageSize = Math.min(100, Math.max(1, Math.floor(Number(pageSize) || 20)));
    const where = { ownerId: auth.openid };
    if (status) {
        where.status = status;
    }
    const result = await paginate(db, 'user_coupons', {
        page: safePage, pageSize: safePageSize, where,
        orderBy: { field: 'createdAt', direction: 'desc' },
    });
    return handleSuccess(result);
}
exports.getMyCoupons = getMyCoupons;
// =====================================================================
// Handler 2: getAvailableCoupons
// =====================================================================
async function getAvailableCoupons(event, _context, auth) {
    const { business, items, amount } = event;
    if (!auth.openid) {
        throw err('AUTH_REQUIRED', '未登录');
    }
    // P2-7: business 白名单校验
    if (!business) {
        throw err('INVALID_PARAMS', '缺少业务类型');
    }
    if (!isValidBusinessType(business)) {
        throw err('INVALID_PARAMS', `无效的业务类型: ${business}`);
    }
    // P2-9: amount 必填且 > 0，否则满减券永远返回不可用
    if (typeof amount !== 'number' || amount <= 0) {
        throw err('INVALID_PARAMS', '缺少有效的订单金额');
    }
    // N4: items 类型校验，防止字符串/数字误传导致 TypeError
    if (items !== undefined && !Array.isArray(items)) {
        throw err('INVALID_PARAMS', 'items 必须是数组');
    }
    if (Array.isArray(items)) {
        for (const item of items) {
            if (typeof item !== 'string' || !item) {
                throw err('INVALID_PARAMS', 'items 元素必须为非空字符串');
            }
        }
    }
    const now = new Date();
    const couponWhere = {
        ownerId: auth.openid,
        status: 'unused',
        startTime: _.lte(now),
        endTime: _.gte(now),
        applicableScopes: _.or([
            _.eq([]),
            _.size(0),
            _.in([business]),
        ]),
    };
    // P2-2: 显式 limit(100) 防止囤券用户被静默截断
    // CloudBase get() 默认上限 100，超过部分会被丢弃且无错误提示
    const coupons = await db.collection('user_coupons').where(couponWhere).limit(100).get();
    const available = [];
    for (const coupon of (coupons.data || [])) {
        if (items && items.length > 0 && coupon.applicableItemIds && coupon.applicableItemIds.length > 0) {
            const hasMatch = items.some((item) => coupon.applicableItemIds?.includes(item));
            if (!hasMatch) {
                continue;
            }
        }
        const result = calculateCouponDiscount(coupon, amount);
        if (result.eligible && result.discountAmount !== undefined) {
            available.push({
                _id: coupon._id,
                templateId: coupon.templateId,
                templateName: coupon.templateName,
                couponCode: coupon.couponCode,
                type: coupon.type,
                rules: coupon.rules,
                discountAmount: result.discountAmount,
                endTime: coupon.endTime,
            });
        }
    }
    available.sort((a, b) => b.discountAmount - a.discountAmount);
    return handleSuccess(available);
}
exports.getAvailableCoupons = getAvailableCoupons;
// =====================================================================
// Handler 3: getClaimableTemplates
// =====================================================================
async function getClaimableTemplates(event, _context, auth) {
    const { business, page = 1, pageSize = 20 } = event;
    if (!auth.openid) {
        throw err('AUTH_REQUIRED', '未登录');
    }
    // P2-7: business 白名单校验（项目 memory 明确要求 VALID_BUSINESS_TYPES 校验）
    if (business && !isValidBusinessType(business)) {
        throw err('INVALID_PARAMS', `无效的业务类型: ${business}`);
    }
    // P2-8: page/pageSize 类型校验
    const safePage = Math.max(1, Math.floor(Number(page) || 1));
    const safePageSize = Math.min(100, Math.max(1, Math.floor(Number(pageSize) || 20)));
    const where = {
        status: 'active',
        claimable: true,
        remaining: _.gt(0),
    };
    if (business) {
        where.applicableScopes = _.in([business]);
    }
    const result = await paginate(db, 'coupon_templates', {
        page: safePage, pageSize: safePageSize, where,
        orderBy: { field: 'createdAt', direction: 'desc' },
    });
    // 补充每个模板当前用户已领取数量
    if (result.list && result.list.length > 0) {
        const templateIds = result.list.map((t) => t._id || '').filter(Boolean);
        const claimedRes = await db.collection('user_coupons')
            .where({ templateId: _.in(templateIds), ownerId: auth.openid, status: _.in(['unused', 'locked']) })
            .get();
        const claimedMap = {};
        for (const c of (claimedRes.data || [])) {
            if (c.templateId) {
                claimedMap[c.templateId] = (claimedMap[c.templateId] || 0) + 1;
            }
        }
        for (const t of result.list) {
            const id = t._id || '';
            t.claimedCount = claimedMap[id] || 0;
            t.canClaim = (t.claimedCount || 0) < (t.perUserLimit || 1);
        }
    }
    return handleSuccess(result);
}
exports.getClaimableTemplates = getClaimableTemplates;
// =====================================================================
// Handler 4: claimCoupon
// =====================================================================
async function claimCoupon(event, _context, auth) {
    const { templateId } = event;
    if (!auth.openid) {
        throw err('AUTH_REQUIRED', '未登录');
    }
    // P2-8: ID 格式校验
    if (!isValidId(templateId)) {
        throw err('INVALID_PARAMS', '模板ID格式错误');
    }
    // P2-1: 使用 doc(id).get() 替代 where({_id}).limit(1).get()
    let template;
    try {
        const templateRes = await db.collection('coupon_templates').doc(templateId).get();
        if (!templateRes.data) {
            throw err('NOT_FOUND', '模板不存在');
        }
        template = templateRes.data;
    }
    catch (e) {
        // doc().get() 在文档不存在时可能抛错或返回空，统一兜底
        const msg = e?.message || '';
        if (msg.includes('NOT_FOUND') || msg.includes('不存在')) {
            throw e;
        }
        throw err('NOT_FOUND', '模板不存在');
    }
    // P0-1: 业务校验全部前置，避免扣减后失败需要回滚
    if (template.status !== 'active') {
        throw err('BUSINESS_ERROR', '模板未启用');
    }
    // claimable 仅限制领券中心主动领取，弹窗/手动发放不受此限制
    const source = event.source || 'claim';
    if (source === 'claim' && !template.claimable) {
        throw err('BUSINESS_ERROR', '该优惠券不支持领取');
    }
    // 时间校验前置
    const now = new Date();
    const startTime = template.validFrom ? new Date(template.validFrom) : now;
    let endTime;
    if (template.validDays) {
        endTime = new Date(now.getTime() + template.validDays * 24 * 60 * 60 * 1000);
    }
    else if (template.validTo) {
        endTime = new Date(template.validTo);
    }
    else {
        endTime = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    }
    if (endTime <= now) {
        throw err('BUSINESS_ERROR', '该优惠券已过期');
    }
    // P0-2: perUserLimit 预检（防呆，并发场景最终一致性靠事务保证）
    const existingCount = await db.collection('user_coupons')
        .where({ templateId, ownerId: auth.openid, status: _.in(['unused', 'locked']) })
        .count();
    if (existingCount.total >= (template.perUserLimit || 1)) {
        throw err('COUPON_LIMIT_REACHED', `每人限领${template.perUserLimit || 1}张`);
    }
    // P0-1 + P0-5: 事务包裹「扣减库存 + 创建 user_coupon」，
    //               保证原子性，避免库存扣减成功但 user_coupon 写入失败时库存泄漏
    const coupon = {
        templateId,
        templateName: template.name,
        ownerId: auth.openid,
        couponCode: generateCouponCode(),
        type: template.type,
        rules: template.rules,
        applicableScopes: template.applicableScopes,
        applicableItemIds: template.applicableItemIds,
        status: 'unused',
        source,
        receivedAt: db.serverDate(),
        startTime,
        endTime,
        createdAt: db.serverDate(),
        updatedAt: db.serverDate(),
    };
    coupon._id = generateId('coupon', auth.openid);
    // 库存为 0 时直接拒绝（避免无意义的事务）
    if ((template.remaining || 0) <= 0) {
        throw err('BUSINESS_ERROR', '优惠券已领完');
    }
    let transaction = null;
    try {
        transaction = await db.startTransaction();
        // 1) 原子扣减库存（事务内）
        // R1: 失败时不在此 rollback，统一由 catch 块处理，避免重复 rollback
        const deductRes = await transaction.collection('coupon_templates').doc(templateId).update({
            data: { remaining: _.inc(-1), updatedAt: db.serverDate() },
        });
        if (deductRes.updated === 0) {
            throw err('BUSINESS_ERROR', '优惠券已领完');
        }
        // 2) 写入 user_coupon（事务内）
        await transaction.collection('user_coupons').add({ data: coupon });
        await transaction.commit();
    }
    catch (txError) {
        if (transaction) {
            try {
                await transaction.rollback();
            }
            catch (_) { /* ignore */ }
        }
        // BusinessError 直接透传
        const e = txError;
        if (e && e.code) {
            throw txError;
        }
        // 其他异常视为库存扣减冲突，告警并返回友好错误
        // P3-3: 使用 errorWithContext 明确语义
        logger.errorWithContext('claimCoupon', txError, { stage: 'transaction' });
        try {
            await recordAlert('critical', 'coupon.claim.transaction.failed', '优惠券领取事务失败', { templateId, ownerId: auth.openid, msg: txError?.message });
        }
        catch (_) { /* best-effort */ }
        throw err('BUSINESS_ERROR', '优惠券领取失败，请重试');
    }
    // 操作日志 best-effort，不影响主流程
    try {
        await writeOperationLog({
            module: 'user_coupon',
            action: 'claim',
            targetId: coupon._id,
            targetName: template.name,
            operatorId: auth.openid,
            operatorName: auth.nickName || auth.openid,
            afterData: coupon,
        });
    }
    catch (_) { /* best-effort */ }
    return handleSuccess(coupon, '领取成功');
}
exports.claimCoupon = claimCoupon;
// =====================================================================
// Handler 5: lockCoupon
// =====================================================================
async function lockCoupon(event, _context, auth) {
    const { couponId, orderId, orderType, business } = event;
    if (!auth.openid) {
        throw err('AUTH_REQUIRED', '未登录');
    }
    // P2-8: ID 格式校验，防超长字符串/特殊字符注入
    if (!isValidId(couponId)) {
        throw err('INVALID_PARAMS', '优惠券ID格式错误');
    }
    if (!isValidId(orderId)) {
        throw err('INVALID_PARAMS', '订单ID格式错误');
    }
    if (business && !isValidBusinessType(business)) {
        throw err('INVALID_PARAMS', `无效的业务类型: ${business}`);
    }
    // P3-6: 使用辅助函数加载并鉴权（lockCoupon 有特殊幂等逻辑，不传 expectedStatus）
    const coupon = await loadAndAuthorizeCoupon(couponId, auth.openid);
    // P0-4: 幂等性检查——已锁定时必须比较 orderId
    //   - 同一订单重复锁定 → 幂等返回成功
    //   - 不同订单锁定 → 拒绝，避免券被错误关联到其他订单
    if (coupon.status === 'locked') {
        if (coupon.orderId === orderId) {
            return handleSuccess(null, '优惠券已锁定');
        }
        throw err('COUPON_STATUS_INVALID', `优惠券已被其他订单锁定: ${coupon.orderId || '(未知)'}`);
    }
    if (coupon.status !== 'unused') {
        throw err('COUPON_STATUS_INVALID', `当前状态: ${coupon.status}`);
    }
    const now = new Date();
    if (coupon.startTime && now < new Date(coupon.startTime)) {
        throw err('BUSINESS_ERROR', '优惠券尚未生效');
    }
    if (coupon.endTime && now > new Date(coupon.endTime)) {
        throw err('BUSINESS_ERROR', '优惠券已过期');
    }
    await db.collection('user_coupons').doc(couponId).update({
        data: {
            status: 'locked',
            orderId: orderId || '',
            orderType: orderType || '',
            business: business || '',
            updatedAt: db.serverDate(),
        },
    });
    try {
        await writeOperationLog({
            module: 'user_coupon',
            action: 'lock',
            targetId: couponId,
            targetName: coupon.templateName,
            operatorId: auth.openid,
            operatorName: auth.nickName || auth.openid,
            beforeData: { status: 'unused' },
            afterData: { status: 'locked', orderId, business: business || orderType },
        });
    }
    catch (_) { /* best-effort */ }
    return handleSuccess(null, '优惠券已锁定');
}
exports.lockCoupon = lockCoupon;
// =====================================================================
// Handler 6: useCoupon
// =====================================================================
async function useCoupon(event, _context, auth) {
    const { couponId, orderId, business, originalAmount, discountAmount, finalAmount } = event;
    if (!auth.openid) {
        throw err('AUTH_REQUIRED', '未登录');
    }
    // P2-8: ID 格式校验
    // N3: orderId 改为必填（核销是资金相关操作，必须关联订单）
    if (!isValidId(couponId)) {
        throw err('INVALID_PARAMS', '优惠券ID格式错误');
    }
    if (!isValidId(orderId)) {
        throw err('INVALID_PARAMS', '订单ID格式错误');
    }
    if (business && !isValidBusinessType(business)) {
        throw err('INVALID_PARAMS', `无效的业务类型: ${business}`);
    }
    // P3-6: 使用辅助函数加载并鉴权（useCoupon 要求状态为 locked）
    const coupon = await loadAndAuthorizeCoupon(couponId, auth.openid, 'locked');
    // P0-3: 服务端重新计算 discountAmount，不信任客户端传入
    //   - 若调用方传入了 originalAmount，则按 coupon.rules 重算并校验
    //   - 若未传入 originalAmount（如内部回调），使用客户端传入的 discountAmount 兜底
    //   - 客户端传入的 discountAmount 与服务端计算不一致时，拒绝核销（防伪造）
    let verifiedDiscountAmount = 0;
    let verifiedOriginalAmount = 0;
    if (typeof originalAmount === 'number' && originalAmount > 0) {
        verifiedOriginalAmount = originalAmount;
        const calcResult = calculateCouponDiscount(coupon, originalAmount);
        if (!calcResult.eligible || calcResult.discountAmount === undefined) {
            throw err('BUSINESS_ERROR', `优惠券核销校验失败：${calcResult.message || '不满足使用条件'}`);
        }
        verifiedDiscountAmount = calcResult.discountAmount;
        // 客户端传入的 discountAmount 必须与服务端计算一致（允许 0.01 元浮点误差）
        if (typeof discountAmount === 'number' &&
            Math.abs(discountAmount - verifiedDiscountAmount) > 0.01) {
            logger.warn('useCoupon.amountMismatch', {
                couponId, orderId,
                clientDiscount: discountAmount,
                serverDiscount: verifiedDiscountAmount,
            });
            throw err('PAYMENT_AMOUNT_MISMATCH', `优惠券折扣金额校验失败：期望 ${verifiedDiscountAmount}，实际 ${discountAmount}`);
        }
    }
    else if (typeof discountAmount === 'number' && discountAmount >= 0) {
        // 兼容旧调用方：未传 originalAmount 时信任 discountAmount（仅限内部可信调用）
        verifiedDiscountAmount = discountAmount;
        verifiedOriginalAmount = typeof finalAmount === 'number'
            ? finalAmount + discountAmount
            : 0;
    }
    const usageRecord = {
        _id: generateId('coupon', auth.openid),
        userCouponId: couponId,
        templateId: coupon.templateId,
        ownerId: auth.openid,
        orderId: orderId || '',
        businessType: business || '',
        originalAmount: verifiedOriginalAmount,
        discountAmount: verifiedDiscountAmount,
        finalAmount: typeof finalAmount === 'number' ? finalAmount : (verifiedOriginalAmount - verifiedDiscountAmount),
        usedAt: db.serverDate(),
        createdAt: db.serverDate(),
    };
    let transaction = null;
    try {
        transaction = await db.startTransaction();
        // N2: 校验 update 是否真正生效，防止并发修改导致数据不一致
        //   场景：loadAndAuthorizeCoupon 查询后，优惠券被并发 unlock/use
        //   此时 update 返回 updated=0，必须回滚并拒绝
        //   R1: 失败时不在此 rollback，统一由 catch 块处理，避免重复 rollback
        const updateRes = await transaction.collection('user_coupons').doc(couponId).update({
            data: {
                status: 'used',
                usedAt: db.serverDate(),
                usedOrderId: orderId || '',
                usedBusiness: business || '',
                updatedAt: db.serverDate(),
            },
        });
        if (updateRes.updated === 0) {
            throw err('COUPON_STATUS_INVALID', '优惠券状态已变更，请重试');
        }
        await transaction.collection('coupon_usage').add({ data: usageRecord });
        await transaction.commit();
    }
    catch (txError) {
        if (transaction) {
            try {
                await transaction.rollback();
            }
            catch (_) { /* ignore */ }
        }
        const e = txError;
        if (e && e.code) {
            throw txError;
        }
        // P3-3: 使用 errorWithContext 明确语义
        logger.errorWithContext('useCoupon', txError, { stage: 'transaction' });
        try {
            await recordAlert('critical', 'coupon.use.transaction.failed', '优惠券核销事务失败', { couponId, orderId, ownerId: auth.openid, msg: txError?.message });
        }
        catch (_) { /* best-effort */ }
        throw err('BUSINESS_ERROR', '优惠券核销失败，请重试');
    }
    try {
        await writeOperationLog({
            module: 'user_coupon',
            action: 'use',
            targetId: couponId,
            targetName: coupon.templateName,
            operatorId: auth.openid,
            operatorName: auth.nickName || auth.openid,
            beforeData: { status: 'locked' },
            afterData: { status: 'used', orderId: orderId || '', discountAmount: verifiedDiscountAmount },
        });
    }
    catch (_) { /* best-effort */ }
    return handleSuccess(null, '优惠券已核销');
}
exports.useCoupon = useCoupon;
// =====================================================================
// Handler 7: unlockCoupon
// =====================================================================
async function unlockCoupon(event, _context, auth) {
    const { couponId } = event;
    if (!auth.openid) {
        throw err('AUTH_REQUIRED', '未登录');
    }
    // P2-8: ID 格式校验
    if (!isValidId(couponId)) {
        throw err('INVALID_PARAMS', '优惠券ID格式错误');
    }
    // P3-6: 使用辅助函数加载并鉴权（unlockCoupon 要求状态为 locked）
    const coupon = await loadAndAuthorizeCoupon(couponId, auth.openid, 'locked');
    const now = new Date();
    const isExpired = coupon.endTime ? new Date(coupon.endTime) < now : false;
    const newStatus = isExpired ? 'expired' : 'unused';
    // P0-8: 清理 lockCoupon 时写入的 orderId/orderType/business 字段
    //   避免下次 lock 前查询优惠券展示错误的关联订单，也保证 P0-4 的 orderId 比对逻辑可靠
    await db.collection('user_coupons').doc(couponId).update({
        data: {
            status: newStatus,
            orderId: '',
            orderType: '',
            business: '',
            updatedAt: db.serverDate(),
        },
    });
    try {
        await writeOperationLog({
            module: 'user_coupon',
            action: 'unlock',
            targetId: couponId,
            targetName: coupon.templateName,
            operatorId: auth.openid,
            operatorName: auth.nickName || auth.openid,
            beforeData: { status: 'locked' },
            afterData: { status: newStatus },
        });
    }
    catch (_) { /* best-effort */ }
    return handleSuccess(null, isExpired ? '优惠券已过期' : '优惠券已退回');
}
exports.unlockCoupon = unlockCoupon;
// =====================================================================
// Handler 8: getPopupCoupon
// =====================================================================
async function getPopupCoupon(event, _context, auth) {
    // P3-5: 重命名 page → pageKey 避免与 CloudEvent.page（分页页码 number）语义冲突
    //   兼容：优先使用 pageKey，若未传则回退到字符串型 page（向后兼容前端旧调用）
    const { pageKey, page } = event;
    const targetPage = pageKey || (typeof page === 'string' ? page : '');
    if (!auth.openid) {
        throw err('AUTH_REQUIRED', '未登录');
    }
    if (!targetPage) {
        throw err('INVALID_PARAMS', '缺少页面标识');
    }
    // P3-10: 命中缓存直接返回（弹窗数据 10 秒内复用，减少 DB 查询）
    const cacheKey = `${auth.openid}:${targetPage}`;
    const cached = getPopupCache(cacheKey);
    if (cached !== CACHE_MISS) {
        return handleSuccess(cached);
    }
    const templates = await db.collection('coupon_templates')
        .where({ status: 'active', popupEnabled: true, popupPage: targetPage, remaining: _.gt(0) })
        .orderBy('createdAt', 'desc')
        .limit(5)
        .get();
    if (!templates.data || templates.data.length === 0) {
        // P3-10: 空结果也缓存，避免短时间内重复查询空弹窗
        setPopupCache(cacheKey, null);
        return handleSuccess(null);
    }
    // P2-4: 修正 canClaim 计算——按 perUserLimit 对比，而非简单的"是否已领过"
    //   原 bug：用户领取过 1 张但 perUserLimit=2 时，弹窗不再显示该券
    //   修复：聚合每个模板的已领数，与 perUserLimit 比较决定是否可领
    const templateIds = templates.data.map((t) => t._id || '').filter(Boolean);
    const claimedRes = await db.collection('user_coupons')
        .where({ templateId: _.in(templateIds), ownerId: auth.openid, status: _.in(['unused', 'locked']) })
        .get();
    const claimedCountMap = {};
    for (const c of (claimedRes.data || [])) {
        if (c.templateId) {
            claimedCountMap[c.templateId] = (claimedCountMap[c.templateId] || 0) + 1;
        }
    }
    const available = templates.data.find((t) => {
        const claimedCount = claimedCountMap[t._id || ''] || 0;
        return claimedCount < (t.perUserLimit || 1);
    });
    if (!available) {
        // P3-10: 空结果也缓存，避免短时间内重复查询空弹窗
        setPopupCache(cacheKey, null);
        return handleSuccess(null);
    }
    const popup = {
        templateId: available._id,
        name: available.name,
        type: available.type,
        rules: available.rules,
        applicableScopes: available.applicableScopes,
        remaining: available.remaining,
        validDays: available.validDays,
        perUserLimit: available.perUserLimit,
        canClaim: true,
    };
    // P3-10: 写入缓存
    setPopupCache(cacheKey, popup);
    return handleSuccess(popup);
}
exports.getPopupCoupon = getPopupCoupon;
// =====================================================================
// Handlers 聚合
// =====================================================================
exports.handlers = {
    getMyCoupons,
    getAvailableCoupons,
    getClaimableTemplates,
    getPopupCoupon,
    claimCoupon,
    lockCoupon,
    useCoupon,
    unlockCoupon,
};
// P0-6: 敏感 action 限流配置（type 对应 rate_limit_configs 集合的 _id）
//   - claimCoupon: 防库存耗尽攻击
//   - getAvailableCoupons / getClaimableTemplates: 防刷量
//   - getPopupCoupon: 防弹窗刷量
const RATE_LIMITED_ACTIONS = {
    claimCoupon: 'coupon_claim',
    getAvailableCoupons: 'coupon_query',
    getClaimableTemplates: 'coupon_query',
    getPopupCoupon: 'coupon_query',
};
// =====================================================================
// Main 入口
// =====================================================================
async function main(event, context) {
    const { action } = event;
    if (!action || !exports.handlers[action]) {
        throw err('INVALID_PARAMS', '无效的操作类型');
    }
    try {
        // P2-5: verifyAuth 要么返回 auth 对象，要么 throw，绝不会返回 { error } 对象
        //   原代码 `if (auth.error) { return auth }` 是死代码，已移除
        const auth = await verifyAuth(event, context);
        logger.info(`[${action}]`, { ownerId: auth.openid });
        // P0-6: 敏感 action 走限流（best-effort，限流失败不阻断业务）
        const rateLimitType = RATE_LIMITED_ACTIONS[action];
        if (rateLimitType && auth.openid) {
            try {
                return await withRateLimit({ userId: auth.openid, type: rateLimitType }, () => exports.handlers[action](event, context, auth));
            }
            catch (rlError) {
                // RATE_LIMITED 是 BusinessError，直接透传给外层 catch 统一处理
                throw rlError;
            }
        }
        return await exports.handlers[action](event, context, auth);
    }
    catch (error) {
        // P3-3: 使用 errorWithContext 明确语义（action, error, context）
        logger.errorWithContext(action, error, { action });
        // P2-6: 统一使用 errors.toResponse，避免与 BusinessError.toResponse() 行为漂移
        return toResponse(error);
    }
}
exports.main = main;
// =====================================================================
// Runtime shim（CommonJS 兼容）
// =====================================================================
const _mod = module;
_mod.exports = {
    main,
    getMyCoupons,
    getAvailableCoupons,
    getClaimableTemplates,
    getPopupCoupon,
    claimCoupon,
    lockCoupon,
    useCoupon,
    unlockCoupon,
    calculateCouponDiscount,
    generateCouponCode,
    handlers: exports.handlers,
};
_mod.exports.default = _mod.exports;
exports.default = {
    main,
    getMyCoupons,
    getAvailableCoupons,
    getClaimableTemplates,
    getPopupCoupon,
    claimCoupon,
    lockCoupon,
    useCoupon,
    unlockCoupon,
    calculateCouponDiscount,
    generateCouponCode,
    handlers: exports.handlers,
};
