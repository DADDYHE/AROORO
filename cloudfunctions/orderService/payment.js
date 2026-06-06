/* eslint-disable */
"use strict";
/**
 * orderService/payment.ts - 旧版支付实现（TypeScript 源文件 - Sprint 29 迁移）
 *
 * @deprecated 此文件为旧版支付实现，请使用 paymentService 云函数。
 *   新版支付入口: cloudfunctions/paymentService/services/pay.js
 *   保留此文件仅为向后兼容，请勿新增调用。
 *
 * 业务功能（2 个 handler）：
 *   1. wechatPay          微信支付下单（旧版）
 *   2. wechatPayNotify    微信支付回调（旧版）
 *
 * 关键设计：
 *   - 鉴权：wechatPay 需 auth，wechatPayNotify 不需（由 index.js 判定）
 *   - 错误：使用 err() 工厂（参数校验），withErrorHandling 包装（统一响应）
 *   - 业务错误：isBusinessError 类型守卫（替代裸字符串 e.code === 'X'）
 *   - wechatPayNotify 返回原始 HTTP 响应（statusCode + body）
 *   - wechatPay 返回 ApiResponse（标准 handler 响应）
 *
 * 迁移目标：
 *   - 强类型化 2 个 handler 的 event / context / auth
 *   - 强类型化微信支付配置、请求体、响应（避免拼写错误）
 *   - 编译产物（payment.js）继续被 index.js require
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.orderService.json
 *   （运行时仍消费 .js 编译产物）
 *
 * 后续计划：
 *   - Sprint 30: 移除旧版 payment.js（在新版 paymentService 完全替代后）
 *   - 现阶段保留 .js 是为了与 orderService/index.js 兼容
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.wechatPayNotify = exports.wechatPay = void 0;
// Sprint 29 迁移说明：
//   - 仍消费 .js 编译产物（tsc 输出到 cloudfunctions/orderService/payment.js）
//   - 对 .js 文件（utils / errors / config / logger）使用 require() 而非 import
//   - 强类型作用于 common/* 与本文件内部接口
//   - handler 在 module.exports 时统一用 withErrorHandling 包装
const utils_1 = require("../common/utils");
const logger_1 = require("../common/logger");
// service 内部 .js 模块走 CommonJS require
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { err, isBusinessError, withErrorHandling } = require('./common/errors');
// =====================================================================
// 模块初始化
// =====================================================================
const { db } = (0, utils_1.initCloud)();
const _ = db.command;
const logger = (0, logger_1.createLogger)('orderService');
// =====================================================================
// 内部辅助
// =====================================================================
/** 生成指定长度的随机字符串（用于 nonce / outTradeNo） */
function randomString(length = 32) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const crypto = require('crypto');
    const bytes = crypto.randomBytes(length);
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(bytes[i] % chars.length);
    }
    return result;
}
/** RSA-SHA256 签名（用于微信支付 v3） */
function rsaSign(privateKey, data) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const crypto = require('crypto');
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(data);
    sign.end();
    return sign.sign(privateKey, 'base64');
}
/** HTTPS POST 请求（用于调用微信支付 v3 API） */
function httpsRequest(url, data, authorization) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const https = require('https');
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            port: 443,
            path: urlObj.pathname + urlObj.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': authorization,
                'User-Agent': 'WeChat-Mini-Program-Pay',
                'Content-Length': Buffer.byteLength(JSON.stringify(data)),
            },
        };
        const req = https.request(options, res => {
            let chunks = '';
            res.on('data', chunk => { chunks += chunk; });
            res.on('end', () => {
                try {
                    const json = JSON.parse(chunks || '{}');
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(json);
                    }
                    else {
                        reject(new Error(`HTTP ${res.statusCode}: ${JSON.stringify(json)}`));
                    }
                }
                catch (e) {
                    reject(new Error(`解析响应失败：${chunks}`));
                }
            });
        });
        req.on('error', reject);
        req.write(JSON.stringify(data));
        req.end();
    });
}
/** 生成微信支付 v3 鉴权头 */
function generateAuthorization(method, path, body, mchId, serialNo, privateKey) {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonceStr = randomString(32);
    const message = `${[method, path, timestamp, nonceStr, body].join('\n')}\n`;
    const signature = rsaSign(privateKey, message);
    return `WECHATPAY2-SHA256-RSA2048 mchid="${mchId}",nonce_str="${nonceStr}",timestamp="${timestamp}",serial_no="${serialNo}",signature="${signature}"`;
}
/** AES-256-GCM 解密（用于微信支付回调） */
function decryptAes256Gcm(data, key, nonce, associatedData) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const crypto = require('crypto');
    const ciphertext = Buffer.from(data, 'base64');
    const keyBuffer = Buffer.from(key, 'utf8');
    const nonceBuffer = Buffer.from(nonce, 'utf8');
    const authTag = ciphertext.slice(ciphertext.length - 16);
    const actualCiphertext = ciphertext.slice(0, ciphertext.length - 16);
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, nonceBuffer, { authTagLength: 16 });
    decipher.setAuthTag(authTag);
    decipher.setAAD(Buffer.from(associatedData));
    let decrypted = decipher.update(actualCiphertext);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString('utf8');
}
// =====================================================================
// Handler 实现
// =====================================================================
/**
 * 1. wechatPay - 微信支付下单（旧版）
 * @deprecated 请使用 paymentService 云函数
 */
async function wechatPay(event, _context, auth) {
    const { openid } = auth;
    if (!openid) {
        throw err('AUTH_REQUIRED', '未登录');
    }
    const { orderId, amount } = event;
    if (!orderId || !amount || amount <= 0) {
        throw err('INVALID_PARAMS', '订单信息不完整');
    }
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { WECHAT_PAY } = require('./common/config');
        const config = {
            appId: WECHAT_PAY.appId,
            mchId: WECHAT_PAY.mchId,
            serialNo: WECHAT_PAY.serialNo,
            privateKey: WECHAT_PAY.privateKey,
            notifyUrl: WECHAT_PAY.notifyUrl,
        };
        if (!config.mchId || !config.privateKey) {
            throw err('BUSINESS_ERROR', '微信支付未配置');
        }
        const outTradeNo = `ORDER_${Date.now()}_${randomString(6).toUpperCase()}`;
        const requestBody = {
            appid: config.appId,
            mchid: config.mchId,
            description: '宠物寄养订单',
            out_trade_no: outTradeNo,
            notify_url: config.notifyUrl,
            amount: { total: amount, currency: 'CNY' },
            payer: { openid },
        };
        const authorization = generateAuthorization('POST', '/v3/pay/transactions/jsapi', JSON.stringify(requestBody), config.mchId, config.serialNo, config.privateKey);
        const payResult = await httpsRequest('https://api.mch.weixin.qq.com/v3/pay/transactions/jsapi', requestBody, authorization);
        if (!payResult.prepay_id) {
            throw err('BUSINESS_ERROR', '获取支付参数失败');
        }
        await db.collection('orders').doc(orderId).update({
            data: { outTradeNo, updatedAt: db.serverDate() },
        });
        const timeStamp = String(Math.floor(Date.now() / 1000));
        const nonceStr = randomString(32);
        const packageStr = `prepay_id=${payResult.prepay_id}`;
        const payMessage = `${[config.appId, timeStamp, nonceStr, packageStr].join('\n')}\n`;
        const paySign = rsaSign(config.privateKey, payMessage);
        const clientData = {
            orderId,
            outTradeNo,
            paymentParams: { timeStamp, nonceStr, package: packageStr, signType: 'RSA', paySign },
        };
        return (0, utils_1.handleSuccess)(clientData, '获取支付参数成功');
    }
    catch (error) {
        if (isBusinessError(error)) {
            return (0, utils_1.handleError)(error, '支付下单失败', utils_1.ERROR_CODES.BUSINESS);
        }
        logger.error('wechatPay', { msg: error?.message });
        return (0, utils_1.handleError)(error, '支付下单失败', utils_1.ERROR_CODES.BUSINESS);
    }
}
exports.wechatPay = wechatPay;
/**
 * 2. wechatPayNotify - 微信支付回调（旧版）
 *
 * 注意：此 handler 返回原始 HTTP 响应（statusCode + body），
 *       而非 ApiResponse。原因：微信支付回调需要返回特定的状态码和 body。
 *
 * @deprecated 请使用 paymentService 云函数
 */
async function wechatPayNotify(event) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { WECHAT_PAY } = require('./common/config');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const crypto = require('crypto');
    // Sprint 29: 强类型化 transaction 对象
    const tx = db;
    const transaction = tx.startTransaction();
    try {
        const headers = (event.headers || {});
        const signature = headers['Wechatpay-Signature'] || headers['wechatpay-signature'];
        const timestamp = headers['Wechatpay-Timestamp'] || headers['wechatpay-timestamp'];
        const nonce = headers['Wechatpay-Nonce'] || headers['wechatpay-nonce'];
        if (!signature || !timestamp || !nonce) {
            await transaction.rollback();
            return {
                statusCode: 401,
                body: JSON.stringify({ code: 'FAIL', message: '缺少签名头信息' }),
            };
        }
        const rawBody = event.body;
        const body = typeof rawBody === 'string' ? JSON.parse(rawBody) : (rawBody || {});
        const resource = body.resource || {};
        const ciphertext = resource.ciphertext;
        const associatedData = resource.associated_data;
        const resourceNonce = resource.nonce;
        if (!ciphertext) {
            await transaction.rollback();
            return {
                statusCode: 400,
                body: JSON.stringify({ code: 'FAIL', message: '回调数据缺少 ciphertext' }),
            };
        }
        const wechatpayCertificate = WECHAT_PAY.certificate;
        if (!wechatpayCertificate) {
            await transaction.rollback();
            return {
                statusCode: 500,
                body: JSON.stringify({ code: 'FAIL', message: '未配置微信支付平台证书，无法验证签名' }),
            };
        }
        const message = `${timestamp}\n${nonce}\n${JSON.stringify(body)}\n`;
        const publicKey = crypto.createPublicKey(wechatpayCertificate);
        const verify = crypto.createVerify('SHA256withRSA');
        verify.update(message);
        verify.end();
        const isValid = verify.verify(publicKey, Buffer.from(signature, 'base64'));
        if (!isValid) {
            await transaction.rollback();
            return {
                statusCode: 401,
                body: JSON.stringify({ code: 'FAIL', message: '签名验证失败' }),
            };
        }
        const apiV3Key = WECHAT_PAY.apiV3Key;
        if (!apiV3Key) {
            await transaction.rollback();
            return {
                statusCode: 500,
                body: JSON.stringify({ code: 'FAIL', message: '未配置微信支付API V3密钥' }),
            };
        }
        const decryptedData = decryptAes256Gcm(ciphertext, apiV3Key, resourceNonce || '', associatedData || '');
        const orderInfo = JSON.parse(decryptedData);
        const { out_trade_no, transaction_id, trade_state } = orderInfo;
        if (trade_state === 'SUCCESS') {
            const txCol = transaction;
            const orderRes = await txCol.collection('orders').where({ outTradeNo: out_trade_no }).limit(1).get();
            if (orderRes.data && orderRes.data.length > 0) {
                const existingOrder = orderRes.data[0];
                if (existingOrder.paymentStatus === 'paid') {
                    await transaction.rollback();
                    return {
                        statusCode: 200,
                        body: JSON.stringify({ code: 'SUCCESS', message: 'OK' }),
                    };
                }
                await txCol.collection('orders').doc(existingOrder._id).update({
                    data: {
                        status: 'paid',
                        paymentStatus: 'paid',
                        transactionId: transaction_id,
                        paidAt: db.serverDate(),
                        updatedAt: db.serverDate(),
                    },
                });
            }
        }
        await transaction.commit();
        return {
            statusCode: 200,
            body: JSON.stringify({ code: 'SUCCESS', message: 'OK' }),
        };
    }
    catch (error) {
        logger.error('wechatPayNotify', { msg: error?.message });
        await transaction.rollback();
        return {
            statusCode: 500,
            body: JSON.stringify({ code: 'FAIL', message: error?.message || 'internal error' }),
        };
    }
}
exports.wechatPayNotify = wechatPayNotify;
// =====================================================================
// 默认导出（保持 CommonJS 兼容：module.exports = { handler: withErrorHandling(...) }）
// =====================================================================
/** wechatPayNotify 返回原始 HTTP 响应，不通过 withErrorHandling 包装（保留原始 statusCode） */
const _handlers = {
    wechatPay: withErrorHandling(wechatPay),
    wechatPayNotify,
};
// Runtime shim: 把 module.exports 指向包装后的 handlers
// (兼容原 CommonJS 模式 `module.exports = { ... }`，
//  避免消费方需用 .default 才能取到包装后的 handler)
// index.js 使用 `require('./payment').wechatPay`，因此需要这个 shim。
// eslint-disable-next-line @typescript-eslint/no-var-requires
const _mod = module;
_mod.exports = _handlers;
_handlers.default = _handlers;
exports.default = _handlers;
