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
import { getMiniProgramAccessToken } from './wxAccessToken'
import { request as httpsRequest } from 'https'
import { URL } from 'url'

const UPLOAD_SHIPPING_URL = 'https://api.weixin.qq.com/wxa/sec/order/upload_shipping_info'
const GET_PATH_URL = 'https://api.weixin.qq.com/cgi-bin/express/delivery/open/get_path'

/** 内部：HTTPS POST application/json 返回 JSON（与 wxAccessToken.httpsPostJson 等价，但本模块独立避免循环依赖） */
function httpsPostJson(rawUrl: string, body: unknown): Promise<any> {
  return new Promise((resolve, reject) => {
    const u = new URL(rawUrl)
    const payload = JSON.stringify(body)
    const req = httpsRequest(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'POST',
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let buf = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => { buf += chunk })
        res.on('end', () => {
          try {
            resolve(JSON.parse(buf))
          } catch (e) {
            reject(new Error(`invalid JSON from wx: ${buf.slice(0, 200)}`))
          }
        })
      },
    )
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(new Error('wx api timeout')) })
    req.write(payload)
    req.end()
  })
}

export interface ShippingItem {
  /** 微信快递公司编码，如 'ZTO' / 'SF' */
  expressCompany: string
  /** 快递单号 */
  expressNo: string
  /** 商品描述，例如 '宠物用品 ×1' */
  itemDesc?: string
}

export interface UploadShippingInfoParams {
  /** 微信支付订单号 */
  transactionId: string
  /** 商家内部订单号（订单 _id） */
  merchantTradeNo: string
  shippingItem: ShippingItem
}

export interface UploadShippingInfoResult {
  ok: boolean
  error?: string
}

export interface LogisticsPathItem {
  /** 时间戳（秒），如 1717689600 */
  time: number
  /** 轨迹描述，如 '快件已到达【北京分拨中心】' */
  desc: string
}

export interface GetLogisticsPathParams {
  /** 微信快递公司编码，如 'ZTO' */
  expressCompany: string
  /** 快递单号 */
  expressNo: string
}

export interface GetLogisticsPathResult {
  ok: boolean
  data?: LogisticsPathItem[]
  error?: string
}

/**
 * 上传发货信息到微信「发货信息管理」。
 * - 必须在订单付款后 7 天内调用，否则会被微信侧判定为「发货超时」。
 * - 同一 transactionId 可重复上传，以最后一次为准。
 */
export async function uploadShippingInfo(params: UploadShippingInfoParams): Promise<UploadShippingInfoResult> {
  if (!params.transactionId) {
    return { ok: false, error: 'missing transactionId' }
  }
  if (!params.shippingItem || !params.shippingItem.expressNo) {
    return { ok: false, error: 'missing expressNo' }
  }
  try {
    const token = await getMiniProgramAccessToken()
    const url = `${UPLOAD_SHIPPING_URL}?access_token=${encodeURIComponent(token)}`
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
    }
    const result = await httpsPostJson(url, body)
    if (result && result.errcode === 0) {
      return { ok: true }
    }
    return { ok: false, error: result?.errmsg || `errcode=${result?.errcode}` }
  } catch (e: unknown) {
    return { ok: false, error: (e as Error)?.message || String(e) }
  }
}

/**
 * 拉取运单轨迹。
 * - 调用前必须先调用 uploadShippingInfo 把快递信息绑定到微信订单。
 * - 微信侧每隔一段时间会从快递公司拉取轨迹并缓存，本接口返回的是缓存数据。
 */
export async function getLogisticsPath(params: GetLogisticsPathParams): Promise<GetLogisticsPathResult> {
  if (!params.expressCompany || !params.expressNo) {
    return { ok: false, error: 'missing expressCompany or expressNo' }
  }
  try {
    const token = await getMiniProgramAccessToken()
    const url = `${GET_PATH_URL}?access_token=${encodeURIComponent(token)}`
    const body = {
      order: {
        delivery_id: params.expressCompany,
        waybill_id: params.expressNo,
      },
    }
    const result = await httpsPostJson(url, body)
    if (result && result.errcode === 0 && Array.isArray(result.path_item_list)) {
      const data: LogisticsPathItem[] = result.path_item_list.map((it: any) => ({
        time: Number(it.ctime) || 0,
        desc: String(it.content || ''),
      }))
      return { ok: true, data }
    }
    return { ok: false, error: result?.errmsg || `errcode=${result?.errcode}` }
  } catch (e: unknown) {
    return { ok: false, error: (e as Error)?.message || String(e) }
  }
}
