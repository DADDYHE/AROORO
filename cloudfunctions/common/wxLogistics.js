"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLogisticsPath = exports.uploadShippingInfo = void 0;
/**
 * wxLogistics.ts - 微信物流助手服务端 API 封装
 *
 * 包含两个核心接口：
 *   1) uploadShippingInfo - 上传发货信息到微信「发货信息管理」
 *      文档：https://developers.weixin.qq.com/miniprogram/dev/platform-capabilities/business-capabilities/order-shipping/order-shipping.html
 *      用途：商家后台发货后，必须把快递信息推到微信侧，否则用户在微信「服务通知」中看不到物流进度，
 *           且 wx.openBusinessView({businessType:'logisticsDetail'}) 也无法拉起轨迹页。
 *
 *   2) getLogisticsPath - 拉取运单轨迹
 *      文档：https://developers.weixin.qq.com/miniprogram/dev/server/API/express/delivery/open/get_path.html
 *      用途：作为前端 wx.openBusinessView 不可用时的降级方案。
 *
 * 设计原则：
 *   - 复用 wxAccessToken.ts 的 getMiniProgramAccessToken
 *   - 不抛异常，统一返回 { ok, data?, error? } 风格
 *   - 与 getWxOrderStatus 保持一致的错误码语义
 */
const wxAccessToken_1 = require("./wxAccessToken");
const https_1 = require("https");
const url_1 = require("url");
const UPLOAD_SHIPPING_URL = 'https://api.weixin.qq.com/wxa/sec/order/upload_shipping_info';
const GET_PATH_URL = 'https://api.weixin.qq.com/cgi-bin/express/delivery/open/get_path';
/** 内部：HTTPS POST application/json 返回 JSON（与 wxAccessToken.httpsPostJson 等价，但本模块独立避免循环依赖） */
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
 * 上传发货信息到微信「发货信息管理」。
 * - 必须在订单付款后 7 天内调用，否则会被微信侧判定为「发货超时」。
 * - 同一 transactionId 可重复上传，以最后一次为准。
 */
async function uploadShippingInfo(params) {
    if (!params.transactionId) {
        return { ok: false, error: 'missing transactionId' };
    }
    if (!params.shippingItem || !params.shippingItem.expressNo) {
        return { ok: false, error: 'missing expressNo' };
    }
    try {
        const token = await (0, wxAccessToken_1.getMiniProgramAccessToken)();
        const url = `${UPLOAD_SHIPPING_URL}?access_token=${encodeURIComponent(token)}`;
        const body = {
            order_key: {
                order_number_type: 1, // 1 = 使用微信支付订单号
                transaction_id: params.transactionId,
            },
            logistics_type: 1, // 1 = 实物快递
            delivery_mode: 1, // 1 = 统一发货
            is_all_delivered: true,
            shipping_list: [
                {
                    tracking_no: params.shippingItem.expressNo,
                    express_company: params.shippingItem.expressCompany,
                    item_desc: params.shippingItem.itemDesc || '商品已发货',
                },
            ],
            // uploader: '左右小程序后台', // 可选
            //payer_openid 不传，由微信侧根据 transactionId 自动反查
        };
        const result = await httpsPostJson(url, body);
        if (result && result.errcode === 0) {
            return { ok: true };
        }
        return { ok: false, error: result?.errmsg || `errcode=${result?.errcode}` };
    }
    catch (e) {
        return { ok: false, error: e?.message || String(e) };
    }
}
exports.uploadShippingInfo = uploadShippingInfo;
/**
 * 拉取运单轨迹。
 * - 调用前必须先调用 uploadShippingInfo 把快递信息绑定到微信订单。
 * - 微信侧每隔一段时间会从快递公司拉取轨迹并缓存，本接口返回的是缓存数据。
 */
async function getLogisticsPath(params) {
    if (!params.expressCompany || !params.expressNo) {
        return { ok: false, error: 'missing expressCompany or expressNo' };
    }
    try {
        const token = await (0, wxAccessToken_1.getMiniProgramAccessToken)();
        const url = `${GET_PATH_URL}?access_token=${encodeURIComponent(token)}`;
        const body = {
            order: {
                delivery_id: params.expressCompany,
                waybill_id: params.expressNo,
            },
        };
        const result = await httpsPostJson(url, body);
        if (result && result.errcode === 0 && Array.isArray(result.path_item_list)) {
            const data = result.path_item_list.map((it) => ({
                time: Number(it.ctime) || 0,
                desc: String(it.content || ''),
            }));
            return { ok: true, data };
        }
        return { ok: false, error: result?.errmsg || `errcode=${result?.errcode}` };
    }
    catch (e) {
        return { ok: false, error: e?.message || String(e) };
    }
}
exports.getLogisticsPath = getLogisticsPath;
