"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearAccessTokenCache = exports.getWxOrderStatus = exports.getMiniProgramAccessToken = void 0;
/**
 * wxAccessToken.ts - 微信小程序 access_token 缓存 + 工具
 *
 * 用法：
 *   const token = await getMiniProgramAccessToken()
 *   await getWxOrder({ transaction_id: 'xxx' })
 *
 * 设计原则：
 *   - 内存缓存 access_token（单实例，进程级），自动过期前 5 分钟刷新
 *   - 避免冷启动并发请求导致的 token 抖动（用 inFlightPromise 串行化）
 *   - 通过 cgi-bin/token 接口获取（grant_type=client_credential）
 *   - 通过 cgi-bin/wxa/sec/order/get_order 查询 wx 平台发货状态
 *   - 不抛异常，统一返回 { ok, data, error } 风格
 */
const https_1 = require("https");
const url_1 = require("url");
// 注意：不要在模块级用 const { APP_ID, WECHAT_MINIAPP_SECRET } = require('./config')
// 因为云函数实例在启动时读一次 process.env，模块级常量会被冻结。
// 改成函数内实时读 process.env，保证 env 更新后能被新调用感知到。
function getAppId() {
    return process.env.APP_ID || process.env.WECHAT_APPID || '';
}
function getSecret() {
    return process.env.WECHAT_MINIAPP_SECRET || '';
}
const TOKEN_URL = 'https://api.weixin.qq.com/cgi-bin/token';
const GET_ORDER_URL = 'https://api.weixin.qq.com/wxa/sec/order/get_order';
const TOKEN_TTL_MS = 110 * 60 * 1000; // 2 小时有效期，提前 10 分钟刷新
let cachedToken = '';
let cachedTokenAt = 0;
let inFlightToken = null;
/** 内部：调 cgi-bin/token 获取 access_token */
async function fetchAccessTokenFromWx(appid, secret) {
    const url = `${TOKEN_URL}?grant_type=client_credential&appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(secret)}`;
    const data = await httpsGetJson(url);
    if (!data || typeof data.access_token !== 'string') {
        throw new Error(`getAccessToken failed: ${JSON.stringify(data || {}).slice(0, 200)}`);
    }
    return data.access_token;
}
/** 获取 access_token（带缓存 + 串行化） */
async function getMiniProgramAccessToken() {
    const now = Date.now();
    if (cachedToken && now - cachedTokenAt < TOKEN_TTL_MS) {
        return cachedToken;
    }
    if (inFlightToken) {
        return inFlightToken;
    }
    const appid = getAppId();
    const secret = getSecret();
    if (!appid || !secret) {
        throw new Error('WECHAT_MINIAPP_SECRET / APP_ID not configured');
    }
    inFlightToken = fetchAccessTokenFromWx(appid, secret)
        .then((token) => {
        cachedToken = token;
        cachedTokenAt = Date.now();
        return token;
    })
        .catch((err) => {
        cachedToken = '';
        cachedTokenAt = 0;
        throw err;
    })
        .finally(() => {
        inFlightToken = null;
    });
    return inFlightToken;
}
exports.getMiniProgramAccessToken = getMiniProgramAccessToken;
/** 内部：HTTPS GET 返回 JSON */
function httpsGetJson(rawUrl) {
    return new Promise((resolve, reject) => {
        const u = new url_1.URL(rawUrl);
        const req = (0, https_1.request)({
            hostname: u.hostname,
            path: u.pathname + u.search,
            method: 'GET',
            timeout: 10000,
        }, (res) => {
            let buf = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => { buf += chunk; });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(buf));
                }
                catch (e) {
                    reject(new Error(`invalid JSON from wx: ${buf.slice(0, 200)}`));
                }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(new Error('wx api timeout')); });
        req.end();
    });
}
/** 内部：HTTPS POST application/json 返回 JSON */
function httpsPostJson(rawUrl, body) {
    return new Promise((resolve, reject) => {
        const u = new url_1.URL(rawUrl);
        const payload = JSON.stringify(body);
        const req = (0, https_1.request)({
            hostname: u.hostname,
            path: u.pathname + u.search,
            method: 'POST',
            timeout: 10000,
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Content-Length': Buffer.byteLength(payload),
            },
        }, (res) => {
            let buf = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => { buf += chunk; });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(buf));
                }
                catch (e) {
                    reject(new Error(`invalid JSON from wx: ${buf.slice(0, 200)}`));
                }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(new Error('wx api timeout')); });
        req.write(payload);
        req.end();
    });
}
/**
 * 查询订单发货状态（wx 平台 /wxa/sec/order/get_order）
 *
 * @param params.transaction_id 微信支付订单号
 * @param params.merchant_id 商户号
 * @param params.merchant_trade_no 商户系统内部订单号
 * @returns { ok, data?, error? }
 *   - data.order_state: 1=待发货 2=已发货 3=确认收货 4=交易完成 5=已退款 6=资金待结算
 *   - data.shipping: 发货信息（含 finish_shipping / shipping_list）
 */
async function getWxOrderStatus(params) {
    if (!params.transaction_id && !params.merchant_trade_no) {
        return { ok: false, error: 'transaction_id 或 merchant_trade_no 至少传一个' };
    }
    try {
        const token = await getMiniProgramAccessToken();
        const url = `${GET_ORDER_URL}?access_token=${encodeURIComponent(token)}`;
        const result = await httpsPostJson(url, params);
        if (result && result.errcode === 0) {
            return { ok: true, data: result.order };
        }
        return { ok: false, error: result?.errmsg || `errcode=${result?.errcode}` };
    }
    catch (e) {
        return { ok: false, error: e?.message || String(e) };
    }
}
exports.getWxOrderStatus = getWxOrderStatus;
/** 单元测试 / 健康检查用：手动清除 token 缓存 */
function clearAccessTokenCache() {
    cachedToken = '';
    cachedTokenAt = 0;
    inFlightToken = null;
}
exports.clearAccessTokenCache = clearAccessTokenCache;
