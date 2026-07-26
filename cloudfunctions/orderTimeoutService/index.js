"use strict";
/**
 * orderTimeoutService/index.ts - 订单超时自动取消服务（TypeScript 源文件 - Sprint 45 迁移）
 *
 * 业务功能：
 *   - 定时器触发：每 30 分钟一次（cron 7 段表达式，每段含义：秒 分 时 日 月 星期 年）
 *   - 扫描各业务线的过期未支付订单，自动取消
 *   - 释放优惠券锁定 / 商城库存 / 团名额 / 活动名额
 *   - 关闭微信支付未支付订单
 *
 * 覆盖 5 类订单：
 *   1. 寄养订单（orders collection，type=hosting 或无 type）
 *   2. 喂养订单（feedingOrders collection）
 *   3. 商城订单（orders collection，type=mall）
 *   4. 团购订单（orders collection，type=group_buy）
 *   5. 活动报名（activity_registrations collection）
 *
 * 共 10 个内部函数：
 *   1. main - 入口（cron 触发，含 _isRunning 并发保护）
 *   2. normalizePrivateKey - 微信支付私钥格式归一化
 *   3. generateAuthorization - 微信支付 V3 签名生成
 *   4. closeWechatOrder - 关闭微信支付订单（fetch async/await）
 *   5. restoreProductStock - 恢复商品库存（含 SKU 校验）
 *   6. unlockOrderCoupons - 解锁订单相关优惠券
 *   7. restoreTuanDealStock - 恢复团购名额
 *   8. restoreActivityQuota - 恢复活动名额
 *   9. cancelTuanOrder - 同步取消 tuan_orders（幂等保护）
 *  10. pushError - 错误收集（限制数组上限）
 *  11. fetchAllExpired - 分批拉取过期订单
 *
 * 迁移目标：
 *   - 强类型化所有 db 操作、handler 签名、返回结构
 *   - 复用 AuthLike / CloudEvent / CloudContext 公共类型
 *   - 5 类订单 / 11 个辅助函数 / 7 个超时时长常量全部强类型化
 *   - 与已迁移的 11 个服务保持类型一致
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.orderTimeoutService.json
 *
 * 数据库索引建议（运维需在对应集合上创建）：
 *   orders:
 *     - { status: 1, paymentStatus: 1, createdAt: 1 }                        - 覆盖 cancelBoardingOrders/Feeding/Mall/GroupBuy
 *     - { type: 1, status: 1, paymentStatus: 1, createdAt: 1 }               - 覆盖 cancelMallOrders/cancelGroupBuyOrders（H1 修复后按 type 过滤）
 *   feedingOrders:
 *     - { status: 1, paymentStatus: 1, createdAt: 1 }                        - 覆盖 cancelFeedingOrders
 *   activity_registrations:
 *     - { status: 1, paymentStatus: 1, createdAt: 1 }                        - 覆盖 cancelActivityOrders
 *   user_coupons:
 *     - { lockedOrderId: 1, status: 1 }                                      - 覆盖 unlockOrderCoupons
 *   tuan_orders:
 *     - { _id: 1, status: 1 }                                                - 覆盖 cancelTuanOrder
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = exports.fetchAllExpired = exports.restoreActivityQuota = exports.cancelTuanOrder = exports.restoreTuanDealStock = exports.unlockOrderCoupons = exports.restoreProductStock = exports.closeWechatOrder = exports.generateAuthorization = exports.normalizePrivateKey = exports.MAX_BATCHES = exports.BATCH_SIZE = exports.ACTIVITY_ORDER_TIMEOUT_MINUTES = exports.GROUP_BUY_TIMEOUT_MINUTES = exports.MALL_ORDER_TIMEOUT_MINUTES = exports.FEEDING_ORDER_TIMEOUT_MINUTES = exports.ORDER_TIMEOUT_MINUTES = void 0;
// L1: 删除不再使用的 HttpsRequestOptions / IncomingMessageLite 接口
//   （M4 改用 fetch 后已无需 https.request 类型定义）
// =====================================================================
// 内部模块初始化（require CommonJS 模块）
// =====================================================================
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createLogger } = require('./common/logger');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ENDPOINTS } = require('./common/config');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { handleSuccess, handleError, ERROR_CODES } = require('./common/utils');
// M2: 集成告警模块，关键失败时通过 recordAlert 通知运维
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { recordAlert } = require('./common/alert');
// L4: 静态 require 提升到顶部，替代 generateAuthorization 内的动态 require
// eslint-disable-next-line @typescript-eslint/no-var-requires
const crypto = require('crypto');
// 动态 require wx-server-sdk（cron 触发时使用 DYNAMIC_CURRENT_ENV）
// eslint-disable-next-line @typescript-eslint/no-var-requires
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const logger = createLogger('orderTimeoutService');
// 补偿队列消费者（H4 / M10 修复闭环）所需模块：直接复用 orderService 同款补偿工具，
// 保证与 handleBoardingOrder 写入逻辑完全一致（佣金/收入记录幂等）。
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createCommissionRecord, cancelCommissionRecord } = require('./common/commission-utils');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createServiceIncomeRecord, cancelServiceIncomeRecord } = require('./common/service-income-utils');
// =====================================================================
// 超时常量（7 个，全部 30 分钟）
// =====================================================================
/** 寄养订单超时（分钟） */
exports.ORDER_TIMEOUT_MINUTES = 30;
/** 喂养订单超时（分钟） */
exports.FEEDING_ORDER_TIMEOUT_MINUTES = 30;
/** 商城订单超时（分钟） */
exports.MALL_ORDER_TIMEOUT_MINUTES = 30;
/** 团购订单超时（分钟） */
exports.GROUP_BUY_TIMEOUT_MINUTES = 30;
/** 活动报名超时（分钟） */
exports.ACTIVITY_ORDER_TIMEOUT_MINUTES = 30;
/** 批量处理：每批拉取数量 */
exports.BATCH_SIZE = 100;
/** 批量处理：最大批次数（10 批 × 100 = 1000 单） */
exports.MAX_BATCHES = 10;
// =====================================================================
// 微信支付 v3 配置
// =====================================================================
const WECHAT_PAY_CONFIG = {
    appId: process.env.WECHAT_APPID || '',
    mchId: process.env.WECHAT_MCHID || '',
    serialNo: process.env.WECHAT_SERIAL_NO || '',
    privateKey: process.env.WECHAT_PRIVATE_KEY || '',
    apiV3Key: process.env.WECHAT_API_V3_KEY || '',
};
// L5: 启动时校验微信支付配置完整性，缺失时 warn 一次（不在每次 closeWechatOrder 调用时重复）
//   closeWechatOrder 内部仍会兜底校验，此处仅用于冷启动可观测性
if (!WECHAT_PAY_CONFIG.appId || !WECHAT_PAY_CONFIG.mchId || !WECHAT_PAY_CONFIG.serialNo || !WECHAT_PAY_CONFIG.privateKey) {
    // createLogger 在下方初始化，此处用 console.warn 兜底
    // eslint-disable-next-line no-console
    console.warn('[orderTimeoutService] missing wechat pay config:', {
        hasAppId: !!WECHAT_PAY_CONFIG.appId,
        hasMchId: !!WECHAT_PAY_CONFIG.mchId,
        hasSerialNo: !!WECHAT_PAY_CONFIG.serialNo,
        hasPrivateKey: !!WECHAT_PAY_CONFIG.privateKey,
    });
}
// =====================================================================
// 辅助函数 1：归一化微信支付私钥
// =====================================================================
/**
 * 归一化微信支付私钥。
 * 支持原始 PEM 或 base64 编码 PEM（自动 decode）。
 */
function normalizePrivateKey(key) {
    if (!key) {
        return '';
    }
    const trimmed = String(key).trim();
    if (trimmed.includes('-----BEGIN')) {
        return trimmed;
    }
    try {
        const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
        if (decoded.includes('-----BEGIN')) {
            return decoded;
        }
    }
    catch {
        // L3: base64 decode 失败说明不是 base64 编码，原样返回
    }
    return trimmed;
}
exports.normalizePrivateKey = normalizePrivateKey;
// =====================================================================
// 辅助函数 2：生成微信支付 v3 Authorization
// =====================================================================
/**
 * 生成微信支付 v3 API 的 Authorization header。
 * 遵循 WECHATPAY2-SHA256-RSA2048 签名规范。
 */
function generateAuthorization(method, path, body, mchId, serialNo, privateKey) {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonceStr = Math.random().toString(36).substring(2, 34);
    const message = `${[method, path, timestamp, nonceStr, body].join('\n')}\n`;
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(message);
    sign.end();
    const signature = sign.sign(privateKey, 'base64');
    return `WECHATPAY2-SHA256-RSA2048 mchid="${mchId}",nonce_str="${nonceStr}",timestamp="${timestamp}",serial_no="${serialNo}",signature="${signature}"`;
}
exports.generateAuthorization = generateAuthorization;
// =====================================================================
// 辅助函数 3：关闭微信支付订单
// =====================================================================
/**
 * 调用微信支付 v3 关闭订单接口。
 *
 * - POST /v3/pay/transactions/out-trade-no/{outTradeNo}/close
 * - 缺配置时跳过并返回 false
 * - 网络异常 / 非 2xx 响应也返回 false（不抛错，让外层继续处理其他订单）
 */
async function closeWechatOrder(outTradeNo) {
    const privateKey = normalizePrivateKey(WECHAT_PAY_CONFIG.privateKey);
    if (!privateKey || !WECHAT_PAY_CONFIG.mchId || !WECHAT_PAY_CONFIG.serialNo) {
        logger.warn('closeWechatOrder', { msg: '缺少微信支付配置，跳过关单' });
        return false;
    }
    const path = `/v3/pay/transactions/out-trade-no/${outTradeNo}/close`;
    const body = JSON.stringify({ mchid: WECHAT_PAY_CONFIG.mchId });
    const authorization = generateAuthorization('POST', path, body, WECHAT_PAY_CONFIG.mchId, WECHAT_PAY_CONFIG.serialNo, privateKey);
    // M4: 改用 fetch async/await 替代 callback 风格的 https.request
    //   - 与项目规范一致（async/await，禁用 callback 包装）
    //   - 错误处理更完整（旧实现未处理 res.on('error')）
    //   - 代码量减半，可读性提升
    try {
        const url = `${ENDPOINTS.WECHAT_PAY_API_BASE}${path}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': authorization,
            },
            body,
            // F18: 请求级超时。微信接口卡顿时 fetch 会无限挂起，占用整轮函数超时预算并阻塞同轮其余订单关闭。
            // 设 3000ms 超时后，超时由下方 catch 捕获并按单笔返回 false，不抛、不阻塞整轮。
            signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
            logger.info('closeWechatOrder.success', { outTradeNo });
            return true;
        }
        const data = await res.text().catch(() => '');
        logger.warn('closeWechatOrder.fail', { outTradeNo, statusCode: res.status, data });
        return false;
    }
    catch (e) {
        const isAbort = e.name === 'AbortError' || e.name === 'TimeoutError' ||
            (e.cause && (e.cause.name === 'AbortError' || e.cause.name === 'TimeoutError'));
        if (isAbort) {
            logger.warn('closeWechatOrder.timeout', { outTradeNo, msg: e.message });
        }
        else {
            logger.warn('closeWechatOrder.exception', { outTradeNo, msg: e.message });
        }
        return false;
    }
}
exports.closeWechatOrder = closeWechatOrder;
// =====================================================================
// 辅助函数 4：恢复商品库存
// =====================================================================
/**
 * 取消订单时恢复商品库存：
 *   - totalStock / soldCount
 *   - SKU 维度：skus[index].stock / soldCount（仅 SKU 模式）
 *   - 顶层 stock：仅无 SKU 模式才更新
 *
 * H5: SKU 模式下不更新顶层 stock——与 mallService 下单逻辑对称
 *   （下单时 SKU 模式只减 skus[index].stock 不减 stock，
 *    取消时若同时加 stock 和 skus[index].stock 会导致 stock 虚高）
 * M7: 补充 skus 字段类型校验，避免 null/非数组时 findIndex 抛错
 */
async function restoreProductStock(productId, skuId, quantity) {
    if (!productId) {
        return;
    }
    try {
        const productRes = await db.collection('products').doc(productId).get();
        if (!productRes.data) {
            return;
        }
        const qty = quantity || 1;
        const updateData = {
            totalStock: _.inc(qty),
            soldCount: _.inc(-qty),
            updatedAt: db.serverDate(),
        };
        // M7: 校验 skus 字段类型，非数组时降级为无 SKU 模式
        let effectiveSkuId = skuId;
        if (skuId && !Array.isArray(productRes.data.skus)) {
            logger.warn('restoreProductStock.invalid_skus', {
                productId,
                skusType: typeof productRes.data.skus,
            });
            effectiveSkuId = null;
        }
        if (effectiveSkuId && productRes.data.skus) {
            const skuIndex = productRes.data.skus.findIndex((s) => s.skuId === effectiveSkuId);
            if (skuIndex >= 0) {
                updateData[`skus.${skuIndex}.stock`] = _.inc(qty);
                updateData[`skus.${skuIndex}.soldCount`] = _.inc(-qty);
            }
            // H5: SKU 模式不更新顶层 stock（与 mallService 下单逻辑对称）
        }
        else {
            updateData.stock = _.inc(qty);
        }
        await db.collection('products').doc(productId).update({ data: updateData });
    }
    catch (stockErr) {
        logger.error('restoreProductStock', stockErr);
        throw stockErr;
    }
}
exports.restoreProductStock = restoreProductStock;
// =====================================================================
// 辅助函数 5：解锁订单相关优惠券
// =====================================================================
/**
 * 取消订单时解锁 user_coupons 集合中 status='locked' 且 lockedOrderId=orderId 的记录：
 *   - 已过期 → status='expired'
 *   - 未过期 → status='unused'
 */
async function unlockOrderCoupons(orderId) {
    if (!orderId) {
        return;
    }
    try {
        const lockedCoupons = await db.collection('user_coupons')
            .where({ lockedOrderId: orderId, status: 'locked' })
            .field({ _id: true, endTime: true })
            .limit(20)
            .get();
        const now = new Date();
        // P2-009: 按 isExpired 分组，批量 where().update() 替代循环逐条更新
        const expiredIds = [];
        const unusedIds = [];
        for (const coupon of (lockedCoupons.data || [])) {
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
exports.unlockOrderCoupons = unlockOrderCoupons;
// =====================================================================
// 辅助函数 6：恢复团购名额
// =====================================================================
/**
 * 取消团购订单时恢复 tuan_deals 集合的 totalStock / soldCount。
 */
async function restoreTuanDealStock(dealId, quantity) {
    if (!dealId) {
        return;
    }
    try {
        const qty = quantity || 1;
        await db.collection('tuan_deals').doc(dealId).update({
            data: {
                totalStock: _.inc(qty),
                soldCount: _.inc(-qty),
                updatedAt: db.serverDate(),
            },
        });
    }
    catch (e) {
        logger.error('restoreTuanDealStock', e);
    }
}
exports.restoreTuanDealStock = restoreTuanDealStock;
// =====================================================================
// 辅助函数 7：取消团订单（同步 tuan_orders 状态）
// =====================================================================
/**
 * 取消 orders 中 type=group_buy 记录时，同步把 tuan_orders 表对应记录也置为 cancelled。
 *
 * 背景：
 *   paymentService 在支付回调中会把 tuan_orders 状态从 pending → paid，
 *   但 orderTimeoutService 取消时只更新 orders，没联动 tuan_orders，
 *   导致管理后台 / 团长视图看到 "待确认" 的幽灵订单。
 *
 * H3: 删除 outTradeNo fallback——paymentService/services/pay.js 注释明确
 *     "tuan_orders 中没有 outTradeNo 字段"，fallback 路径永远查不到记录
 * H4: 不写 paymentStatus='cancelled'——'cancelled' 不是合法 PaymentStatus 枚举值，
 *     超时未支付的 tuan_orders 应保持 paymentStatus='unpaid'，仅更新 status
 * M8: 直接使用 where().update() 替代两步查询+更新，避免 TOCTOU 风险
 */
async function cancelTuanOrder(tuanOrderId) {
    if (!tuanOrderId) {
        logger.warn('cancelTuanOrder.skip_no_tuanOrderId');
        return;
    }
    try {
        // 幂等保护：仅当 status != cancelled 时才更新
        const updateRes = await db.collection('tuan_orders')
            .where({ _id: tuanOrderId, status: _.neq('cancelled') })
            .update({
            data: {
                status: 'cancelled',
                // H4: paymentStatus 保持原值 'unpaid'，不写非法的 'cancelled'
                cancelReason: '超时未支付，系统自动取消',
                cancelledAt: db.serverDate(),
                updatedAt: db.serverDate(),
            },
        });
        if (updateRes.updated === 0) {
            logger.info('cancelTuanOrder.already_cancelled_or_not_found', { tuanOrderId });
        }
    }
    catch (e) {
        logger.error('cancelTuanOrder', e);
    }
}
exports.cancelTuanOrder = cancelTuanOrder;
// =====================================================================
// 辅助函数 8：恢复活动名额
// =====================================================================
/**
 * 取消活动报名时回退 activities 集合的 currentParticipants。
 */
async function restoreActivityQuota(activityId, participantCount) {
    if (!activityId) {
        return;
    }
    try {
        const count = participantCount || 1;
        await db.collection('activities').doc(activityId).update({
            data: {
                currentParticipants: _.inc(-count),
                updatedAt: db.serverDate(),
            },
        });
    }
    catch (e) {
        logger.error('restoreActivityQuota', e);
    }
}
exports.restoreActivityQuota = restoreActivityQuota;
// =====================================================================
// 辅助函数 9：错误收集（M5：限制 errors 数组上限，避免 1000 单全失败时膨胀）
// =====================================================================
/** errors 数组最大长度，超出部分仅记日志 */
const MAX_ERRORS_KEPT = 50;
/**
 * 推送错误到 result.errors，超过上限时仅记日志不再追加。
 * 防止 1000 单全失败时返回体过大被云函数截断。
 */
function pushError(result, err) {
    if (result.errors.length < MAX_ERRORS_KEPT) {
        result.errors.push(err);
    }
    else {
        logger.warn('orderTimeout.errors_truncated', {
            totalErrors: MAX_ERRORS_KEPT + 1,
            sample: err,
        });
    }
}
// =====================================================================
// 辅助函数 10：分批拉取过期订单
// =====================================================================
/**
 * 通用分批拉取接口（最大 MAX_BATCHES * BATCH_SIZE = 1000 条）。
 */
async function fetchAllExpired(collection, where, fields) {
    // L2: 克隆 where 对象，防止未来在循环内修改时污染调用方传入的对象
    const queryWhere = { ...where };
    const allOrders = [];
    for (let batch = 0; batch < exports.MAX_BATCHES; batch++) {
        const res = await db.collection(collection)
            .where(queryWhere)
            .field(fields)
            .skip(batch * exports.BATCH_SIZE)
            .limit(exports.BATCH_SIZE)
            .get();
        const data = res.data || [];
        allOrders.push(...data);
        if (data.length < exports.BATCH_SIZE) {
            break;
        }
    }
    return allOrders;
}
exports.fetchAllExpired = fetchAllExpired;
// =====================================================================
// 业务函数 1：取消寄养订单
// =====================================================================
async function cancelBoardingOrders(result, boardingTimeout) {
    try {
        // H1: 补充 type 过滤——仅查寄养订单（type='hosting' 或历史无 type 字段）
        //   原查询缺 type 过滤，会误扫到 mall/group_buy 订单并标记 cancelled，
        //   但不触发 restoreProductStock，导致后续 cancelMallOrders/cancelGroupBuyOrders
        //   扫描时 status 已变 cancelled 而漏处理，库存/团名额永久丢失
        const expiredBoardingOrders = await fetchAllExpired('orders', {
            status: 'pending_payment',
            paymentStatus: 'unpaid',
            createdAt: _.lte(boardingTimeout),
            type: _.in(['hosting', null]),
        }, { _id: true, outTradeNo: true });
        for (const order of expiredBoardingOrders) {
            try {
                // H2: 使用 where().update() 加 status 条件实现幂等保护
                //   仅当 status 仍为 pending_payment 时才更新，避免 cron 重叠时重复取消
                //   updated=0 表示已被其他实例取消，跳过资源回退
                const cancelRes = await db.collection('orders')
                    .where({ _id: order._id, status: 'pending_payment' })
                    .update({
                    data: {
                        status: 'cancelled',
                        cancelReason: '超时未支付，系统自动取消',
                        cancelledAt: db.serverDate(),
                        updatedAt: db.serverDate(),
                    },
                });
                if (!cancelRes.updated || cancelRes.updated === 0) {
                    logger.info('cancelBoardingOrders.skip_already_cancelled', { orderId: order._id });
                    continue;
                }
                if (order.outTradeNo) {
                    const closed = await closeWechatOrder(order.outTradeNo);
                    if (closed) {
                        result.closedWechatOrders++;
                    }
                }
                await unlockOrderCoupons(order._id);
                result.cancelledBoardingOrders++;
            }
            catch (error) {
                pushError(result, { orderId: order._id, error: error.message });
            }
        }
    }
    catch (error) {
        result.errors.push({ type: 'boarding', error: error.message });
    }
}
// =====================================================================
// 业务函数 2：取消喂养订单
// =====================================================================
async function cancelFeedingOrders(result, feedingTimeout) {
    try {
        const expiredFeedingOrders = await fetchAllExpired('feedingOrders', {
            status: 'pending_payment',
            paymentStatus: 'unpaid',
            createdAt: _.lte(feedingTimeout),
        }, { _id: true, outTradeNo: true });
        for (const order of expiredFeedingOrders) {
            try {
                // H2: 幂等保护，仅当 status 仍为 pending_payment 时才更新
                const cancelRes = await db.collection('feedingOrders')
                    .where({ _id: order._id, status: 'pending_payment' })
                    .update({
                    data: {
                        status: 'cancelled',
                        cancelReason: '超时未支付，系统自动取消',
                        cancelledAt: db.serverDate(),
                        updatedAt: db.serverDate(),
                    },
                });
                if (!cancelRes.updated || cancelRes.updated === 0) {
                    logger.info('cancelFeedingOrders.skip_already_cancelled', { orderId: order._id });
                    continue;
                }
                if (order.outTradeNo) {
                    const closed = await closeWechatOrder(order.outTradeNo);
                    if (closed) {
                        result.closedWechatOrders++;
                    }
                }
                await unlockOrderCoupons(order._id);
                result.cancelledFeedingOrders++;
            }
            catch (error) {
                pushError(result, { orderId: order._id, error: error.message });
            }
        }
    }
    catch (error) {
        result.errors.push({ type: 'feeding', error: error.message });
    }
}
// =====================================================================
// 业务函数 3：取消商城订单（含库存回退）
// =====================================================================
async function cancelMallOrders(result, mallTimeout) {
    try {
        // P2-011: 补充 paymentStatus: 'unpaid' 过滤，防止取消已支付订单（与 cancelBoardingOrders 一致）
        const expiredMallOrders = await fetchAllExpired('orders', {
            type: 'mall',
            status: 'pending_payment',
            paymentStatus: 'unpaid',
            createdAt: _.lte(mallTimeout),
        }, { _id: true, productId: true, skuId: true, quantity: true, outTradeNo: true });
        for (const order of expiredMallOrders) {
            try {
                // H2: 幂等保护，仅当 status 仍为 pending_payment 时才更新
                const cancelRes = await db.collection('orders')
                    .where({ _id: order._id, status: 'pending_payment' })
                    .update({
                    data: {
                        status: 'cancelled',
                        cancelReason: '超时未支付，系统自动取消',
                        cancelledAt: db.serverDate(),
                        updatedAt: db.serverDate(),
                    },
                });
                if (!cancelRes.updated || cancelRes.updated === 0) {
                    logger.info('cancelMallOrders.skip_already_cancelled', { orderId: order._id });
                    continue;
                }
                if (order.outTradeNo) {
                    const closed = await closeWechatOrder(order.outTradeNo);
                    if (closed) {
                        result.closedWechatOrders++;
                    }
                }
                try {
                    await restoreProductStock(order.productId, order.skuId, order.quantity);
                }
                catch (stockErr) {
                    pushError(result, { orderId: order._id, stockRestoreError: stockErr.message });
                }
                await unlockOrderCoupons(order._id);
                result.cancelledMallOrders++;
            }
            catch (error) {
                pushError(result, { orderId: order._id, error: error.message });
            }
        }
    }
    catch (error) {
        result.errors.push({ type: 'mall', error: error.message });
    }
}
// =====================================================================
// 业务函数 4：取消团购订单（含库存 + 团名额回退）
// =====================================================================
async function cancelGroupBuyOrders(result, groupBuyTimeout) {
    try {
        // P2-011: 补充 paymentStatus: 'unpaid' 过滤，防止取消已支付订单（与 cancelBoardingOrders 一致）
        const expiredGroupBuyOrders = await fetchAllExpired('orders', {
            type: 'group_buy',
            status: 'pending_payment',
            paymentStatus: 'unpaid',
            createdAt: _.lte(groupBuyTimeout),
        }, { _id: true, productId: true, quantity: true, dealId: true, outTradeNo: true, tuanOrderId: true });
        for (const order of expiredGroupBuyOrders) {
            try {
                // H2: 幂等保护，仅当 status 仍为 pending_payment 时才更新
                const cancelRes = await db.collection('orders')
                    .where({ _id: order._id, status: 'pending_payment' })
                    .update({
                    data: {
                        status: 'cancelled',
                        cancelReason: '超时未支付，系统自动取消',
                        cancelledAt: db.serverDate(),
                        updatedAt: db.serverDate(),
                    },
                });
                if (!cancelRes.updated || cancelRes.updated === 0) {
                    logger.info('cancelGroupBuyOrders.skip_already_cancelled', { orderId: order._id });
                    continue;
                }
                if (order.outTradeNo) {
                    const closed = await closeWechatOrder(order.outTradeNo);
                    if (closed) {
                        result.closedWechatOrders++;
                    }
                }
                try {
                    await restoreProductStock(order.productId, null, order.quantity);
                }
                catch (stockErr) {
                    pushError(result, { orderId: order._id, stockRestoreError: stockErr.message });
                }
                await restoreTuanDealStock(order.dealId, order.quantity);
                // ★ 同步取消 tuan_orders 集合（避免管理后台显示"待确认"幽灵订单）
                // H3: 仅传 tuanOrderId，删除无效的 outTradeNo fallback
                await cancelTuanOrder(order.tuanOrderId);
                await unlockOrderCoupons(order._id);
                result.cancelledGroupBuyOrders++;
            }
            catch (error) {
                pushError(result, { orderId: order._id, error: error.message });
            }
        }
    }
    catch (error) {
        result.errors.push({ type: 'group_buy', error: error.message });
    }
}
// =====================================================================
// 业务函数 5：取消活动报名（含名额回退）
// =====================================================================
async function cancelActivityOrders(result, activityTimeout) {
    try {
        const expiredActivityOrders = await fetchAllExpired('activity_registrations', {
            status: 'pending_payment',
            paymentStatus: 'unpaid',
            createdAt: _.lte(activityTimeout),
        }, { _id: true, activityId: true, participantCount: true, outTradeNo: true });
        for (const order of expiredActivityOrders) {
            try {
                // H2: 幂等保护，仅当 status 仍为 pending_payment 时才更新
                const cancelRes = await db.collection('activity_registrations')
                    .where({ _id: order._id, status: 'pending_payment' })
                    .update({
                    data: {
                        status: 'cancelled',
                        cancelReason: '超时未支付，系统自动取消',
                        cancelledAt: db.serverDate(),
                        updatedAt: db.serverDate(),
                    },
                });
                if (!cancelRes.updated || cancelRes.updated === 0) {
                    logger.info('cancelActivityOrders.skip_already_cancelled', { orderId: order._id });
                    continue;
                }
                if (order.outTradeNo) {
                    const closed = await closeWechatOrder(order.outTradeNo);
                    if (closed) {
                        result.closedWechatOrders++;
                    }
                }
                await restoreActivityQuota(order.activityId, order.participantCount);
                await unlockOrderCoupons(order._id);
                result.cancelledActivityOrders++;
            }
            catch (error) {
                pushError(result, { orderId: order._id, error: error.message });
            }
        }
    }
    catch (error) {
        result.errors.push({ type: 'activity', error: error.message });
    }
}
const FAILED_OP_MAX_RETRY = 5;
const FAILED_OP_BATCH = 50;
/** 按 type 重新执行单条失败操作（复用 orderService 同款补偿函数） */
async function dispatchRetry(doc) {
    const { type, payload } = doc;
    if (type === 'create_commission') {
        await createCommissionRecord(payload.orderType || 'boarding', payload.orderSnapshot);
    }
    else if (type === 'cancel_commission') {
        await cancelCommissionRecord(payload.orderId);
    }
    else if (type === 'create_service_income') {
        await createServiceIncomeRecord(payload.organizerId, payload.business || 'boarding', payload.orderId, payload.amount, payload.orderNo, payload.description);
    }
    else if (type === 'cancel_service_income') {
        await cancelServiceIncomeRecord(payload.orderId, payload.business || 'boarding');
    }
    else {
        throw new Error(`unknown failed op type: ${type}`);
    }
}
/** 扫描并重试 failed_operations 中 pending 的记录 */
async function processFailedOperations() {
    const res = await db.collection('failed_operations')
        .where({ status: 'pending' })
        .orderBy('createdAt', 'asc')
        .limit(FAILED_OP_BATCH)
        .get();
    const docs = (res.data || []);
    let success = 0;
    let failed = 0;
    let dead = 0;
    for (const doc of docs) {
        try {
            await dispatchRetry(doc);
            await db.collection('failed_operations').doc(doc._id).update({
                data: { status: 'done', updatedAt: db.serverDate() },
            });
            success++;
        }
        catch (e) {
            const next = (doc.retryCount || 0) + 1;
            const isDead = next >= FAILED_OP_MAX_RETRY;
            const status = isDead ? 'dead' : 'pending';
            if (isDead) {
                dead++;
                // 死信明确日志：伙伴收入可能漏算，需人工介入
                logger.error('failedOperations.dead_letter', {
                    id: doc._id,
                    type: doc.type,
                    retryCount: next,
                    lastError: e?.message || String(e),
                });
            }
            await db.collection('failed_operations').doc(doc._id).update({
                data: {
                    status,
                    retryCount: next,
                    lastError: { message: e?.message || String(e), at: db.serverDate() },
                    deadAt: isDead ? db.serverDate() : (doc.deadAt || null),
                    updatedAt: db.serverDate(),
                },
            });
            failed++;
        }
    }
    return { scanned: docs.length, success, failed, dead };
}
/**
 * 订单超时自动取消主入口。
 *
 * cron 表达式：7 段（秒 分 时 日 月 星期 年），每 30 分钟触发一次
 * 入口签名遵循 CloudBase 云函数约定（event, context）
 *
 * 流程：
 *   1. M1: _isRunning 并发保护——前次未完成时跳过本次执行
 *   2. 计算 5 类订单各自的超时截止时间（now - 30min）
 *   3. H6: Promise.all 并行扫描 5 类订单集合的过期未支付记录
 *   4. 标记 status='cancelled' + 记录 cancelReason（H2: 幂等保护）
 *   5. 关闭对应的微信支付订单
 *   6. 恢复相关资源（库存 / 团名额 / 活动名额 / 优惠券锁定）
 *   7. M2: 失败时通过 recordAlert 告警
 *   8. 汇总结果（各类取消数 + 微信关单数 + 错误列表）
 */
// M1: 进程内并发保护标志（参考 couponExpiryCheck 实现）
let _isRunning = false;
async function main(event, _context) {
    logger.info('orderTimeoutService.start', {
        trigger: event.TriggerName || 'manual',
        message: event.Message,
    });
    // M1: cron 触发器不保证单一实例执行，前次未完成时跳过
    if (_isRunning) {
        logger.warn('orderTimeoutService.skipped_concurrent_run');
        return handleSuccess({ skipped: true }, '上一次执行尚未完成，跳过本次');
    }
    _isRunning = true;
    const results = {
        cancelledBoardingOrders: 0,
        cancelledFeedingOrders: 0,
        cancelledMallOrders: 0,
        cancelledGroupBuyOrders: 0,
        cancelledActivityOrders: 0,
        closedWechatOrders: 0,
        errors: [],
    };
    // L6: 优先使用 cron 触发时间作为超时基准，避免 cron 调度延迟导致的时间偏差
    //   - event.Time: ISO 字符串（CloudBase cron 标准字段）
    //   - event.Timestamp: 毫秒数（兜底）
    //   - Date.now(): 最终兜底（手动调用场景）
    let now;
    if (event.Time) {
        const parsed = new Date(event.Time);
        now = isNaN(parsed.getTime()) ? new Date() : parsed;
    }
    else if (event.Timestamp && typeof event.Timestamp === 'number') {
        now = new Date(event.Timestamp);
    }
    else {
        now = new Date();
    }
    const boardingTimeout = new Date(now.getTime() - exports.ORDER_TIMEOUT_MINUTES * 60 * 1000);
    const feedingTimeout = new Date(now.getTime() - exports.FEEDING_ORDER_TIMEOUT_MINUTES * 60 * 1000);
    const mallTimeout = new Date(now.getTime() - exports.MALL_ORDER_TIMEOUT_MINUTES * 60 * 1000);
    const groupBuyTimeout = new Date(now.getTime() - exports.GROUP_BUY_TIMEOUT_MINUTES * 60 * 1000);
    const activityTimeout = new Date(now.getTime() - exports.ACTIVITY_ORDER_TIMEOUT_MINUTES * 60 * 1000);
    try {
        // H6: 5 类订单无依赖关系，改为 Promise.all 并行处理
        //   原串行执行 + 每单多次 IO，1000 单上限下必然超过 30s 超时
        //   并行后总耗时降为 max(各类耗时)，配合 timeout 上调到 60s 可覆盖大部分场景
        //   JS 单线程下 results 共享对象的 ++ 操作和 errors.push 在并发 await 中安全
        await Promise.all([
            cancelBoardingOrders(results, boardingTimeout),
            cancelFeedingOrders(results, feedingTimeout),
            cancelMallOrders(results, mallTimeout),
            cancelGroupBuyOrders(results, groupBuyTimeout),
            cancelActivityOrders(results, activityTimeout),
        ]);
        // H4 / M10 补偿队列闭环：消费 failed_operations 中 pending 记录并重试
        //   独立 try，失败不影响上面的超时取消逻辑；底层补偿函数幂等，安全重试
        try {
            const foResult = await processFailedOperations();
            logger.info('orderTimeoutService.failedOps', foResult);
            if (foResult.failed > 0) {
                await recordAlert('warning', 'failedOps.retry', `补偿队列重试存在 ${foResult.failed} 个失败（其中 ${foResult.dead} 个已达重试上限）`, foResult);
            }
            // F7: 死信告警钩子——伙伴收入可能漏算，必须主动知会运维
            if (foResult.dead > 0) {
                await recordAlert('critical', 'failedOps.dead_letter', `补偿队列出现 ${foResult.dead} 条死信（伙伴收入可能漏算），需人工介入`, foResult);
            }
        }
        catch (foErr) {
            logger.error('orderTimeoutService.failedOps.fatal', { msg: foErr?.message });
        }
        logger.info('orderTimeoutService.success', {
            ...results,
            errorsCount: results.errors.length,
        });
        // M2: 错误数超阈值时触发告警（critical/warning 两级）
        if (results.errors.length > 0) {
            const severity = results.errors.length > 20 ? 'critical' : 'warning';
            try {
                await recordAlert(severity, 'orderTimeout.errors', `订单超时取消存在 ${results.errors.length} 个错误`, {
                    ...results,
                    sampleErrors: results.errors.slice(0, 10),
                });
            }
            catch (alertErr) {
                logger.warn('orderTimeoutService.recordAlert_failed', { msg: alertErr.message });
            }
        }
    }
    catch (error) {
        logger.error('orderTimeoutService.fatal', error);
        // M2: 致命错误时 critical 告警
        try {
            await recordAlert('critical', 'orderTimeout.fatal', '订单超时处理发生致命错误', { error: error.message, stack: error.stack });
        }
        catch (alertErr) {
            logger.warn('orderTimeoutService.recordAlert_failed', { msg: alertErr.message });
        }
        return handleError(error, '订单超时处理异常', ERROR_CODES.SERVER);
    }
    finally {
        _isRunning = false;
    }
    return handleSuccess(results, `处理完成：取消寄养${results.cancelledBoardingOrders}笔，喂养${results.cancelledFeedingOrders}笔，商城${results.cancelledMallOrders}笔，团购${results.cancelledGroupBuyOrders}笔，活动${results.cancelledActivityOrders}笔，微信关单${results.closedWechatOrders}笔`);
}
exports.main = main;
// =====================================================================
// Runtime shim（CommonJS 兼容）
// =====================================================================
const _mod = module;
_mod.exports = {
    main,
    // 超时常量
    ORDER_TIMEOUT_MINUTES: exports.ORDER_TIMEOUT_MINUTES,
    FEEDING_ORDER_TIMEOUT_MINUTES: exports.FEEDING_ORDER_TIMEOUT_MINUTES,
    MALL_ORDER_TIMEOUT_MINUTES: exports.MALL_ORDER_TIMEOUT_MINUTES,
    GROUP_BUY_TIMEOUT_MINUTES: exports.GROUP_BUY_TIMEOUT_MINUTES,
    ACTIVITY_ORDER_TIMEOUT_MINUTES: exports.ACTIVITY_ORDER_TIMEOUT_MINUTES,
    BATCH_SIZE: exports.BATCH_SIZE,
    MAX_BATCHES: exports.MAX_BATCHES,
    // 辅助函数（测试用）
    normalizePrivateKey,
    generateAuthorization,
    closeWechatOrder,
    restoreProductStock,
    unlockOrderCoupons,
    restoreTuanDealStock,
    cancelTuanOrder,
    restoreActivityQuota,
    fetchAllExpired,
};
_mod.exports.default = _mod.exports;
exports.default = {
    main,
    ORDER_TIMEOUT_MINUTES: exports.ORDER_TIMEOUT_MINUTES,
    FEEDING_ORDER_TIMEOUT_MINUTES: exports.FEEDING_ORDER_TIMEOUT_MINUTES,
    MALL_ORDER_TIMEOUT_MINUTES: exports.MALL_ORDER_TIMEOUT_MINUTES,
    GROUP_BUY_TIMEOUT_MINUTES: exports.GROUP_BUY_TIMEOUT_MINUTES,
    ACTIVITY_ORDER_TIMEOUT_MINUTES: exports.ACTIVITY_ORDER_TIMEOUT_MINUTES,
    BATCH_SIZE: exports.BATCH_SIZE,
    MAX_BATCHES: exports.MAX_BATCHES,
    normalizePrivateKey,
    generateAuthorization,
    closeWechatOrder,
    restoreProductStock,
    unlockOrderCoupons,
    restoreTuanDealStock,
    cancelTuanOrder,
    restoreActivityQuota,
    fetchAllExpired,
};
