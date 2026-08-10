/**
 * wxLogistics.ts - 微信物流助手服务端 API 封装
 *
 * 包含三个核心接口：
 *   1) uploadShippingInfo - 上传发货信息到微信「发货信息管理」
 *      文档：https://developers.weixin.qq.com/miniprogram/dev/platform-capabilities/business-capabilities/order-shipping/order-shipping.html
 *      用途：商家后台发货后，必须把快递信息推到微信侧，否则用户在微信「服务通知」中看不到物流进度，
 *           且 wx.openBusinessView({businessType:'weappOrderConfirm'}) 也无法拉起确认收货页。
 *
 *   2) traceWaybill - 传运单到微信「物流查询组件」并获取 waybill_token
 *      文档：https://developers.weixin.qq.com/miniprogram/dev/server/API/weixin-express/express-search/api_trace_waybill.html
 *      用途：发货时同步把运单信息推送给微信，微信侧跟踪运单状态变化，
 *           返回 waybill_token 供前端调「物流查询插件」openWaybillTracking 拉起原生物流详情页。
 *           注意：trace_waybill 不支持云调用，本模块通过 HTTPS 直接调用。
 *
 *   3) followWaybill - 传运单到微信「物流消息能力」触发服务通知推送
 *      文档：https://developers.weixin.qq.com/miniprogram/dev/platform-capabilities/industry/express/business/express_open_msg.html
 *      用途：发货时同步把运单信息推送给微信，微信在「已揽件/派件中/已签收」三个关键节点
 *           主动给下单用户推送服务通知，用户点击通知可回访小程序订单详情页。
 *           与 traceWaybill 参数结构完全一致，可并存调用。
 *           注意：follow_waybill 不支持云调用，本模块通过 HTTPS 直接调用。
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
const TRACE_WAYBILL_URL = 'https://api.weixin.qq.com/cgi-bin/express/delivery/open_msg/trace_waybill'
const QUERY_TRACE_URL = 'https://api.weixin.qq.com/cgi-bin/express/delivery/open_msg/query_trace'
const FOLLOW_WAYBILL_URL = 'https://api.weixin.qq.com/cgi-bin/express/delivery/open_msg/follow_waybill'

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

/**
 * 传运单的商品信息（trace_waybill 必填）
 */
export interface TraceGoodsItem {
  /** 商品名称 */
  goodsName: string
  /** 商品图片 URL */
  goodsImgUrl: string
}

export interface TraceWaybillParams {
  /** 购买用户 openid（订单 ownerId） */
  openid: string
  /** 收件人手机号（部分运力需要作为查单依据） */
  receiverPhone: string
  /** 运单号（快递单号） */
  waybillId: string
  /** 微信支付交易单号（420 开头） */
  transId: string
  /** 点击落地页商品卡片跳转路径（订单详情页 path） */
  orderDetailPath: string
  /** 商品信息列表 */
  goodsInfo: TraceGoodsItem[]
  /** 运力 id（快递公司编码，用于提高运单号识别准确度） */
  deliveryId?: string
  /** 寄件人手机号（可选） */
  senderPhone?: string
}

export interface TraceWaybillResult {
  ok: boolean
  /** 微信返回的 waybill_token，前端调 plugin.openWaybillTracking 用 */
  waybillToken?: string
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
      // uploader: 'AROORO小程序后台', // 可选
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

export interface TraceWaybillResult {
  ok: boolean
  /** 微信返回的 waybill_token，前端调 plugin.openWaybillTracking 用 */
  waybillToken?: string
  error?: string
}

/**
 * 传运单到微信「物流查询组件」并获取 waybill_token。
 */
export async function traceWaybill(params: TraceWaybillParams): Promise<TraceWaybillResult> {
  if (!params.openid) {
    return { ok: false, error: 'missing openid' }
  }
  if (!params.waybillId) {
    return { ok: false, error: 'missing waybillId' }
  }
  if (!params.transId) {
    return { ok: false, error: 'missing transId' }
  }
  if (!params.receiverPhone) {
    return { ok: false, error: 'missing receiverPhone' }
  }
  if (!params.orderDetailPath) {
    return { ok: false, error: 'missing orderDetailPath' }
  }
  if (!Array.isArray(params.goodsInfo) || params.goodsInfo.length === 0) {
    return { ok: false, error: 'missing goodsInfo' }
  }

  try {
    const token = await getMiniProgramAccessToken()
    const url = `${TRACE_WAYBILL_URL}?access_token=${encodeURIComponent(token)}`
    const body: Record<string, unknown> = {
      openid: params.openid,
      waybill_id: params.waybillId,
      trans_id: params.transId,
      receiver_phone: params.receiverPhone,
      order_detail_path: params.orderDetailPath,
      goods_info: {
        detail_list: params.goodsInfo.map(g => ({
          goods_name: g.goodsName,
          goods_img_url: g.goodsImgUrl,
        })),
      },
    }
    if (params.deliveryId) {
      body.delivery_id = params.deliveryId
    }
    if (params.senderPhone) {
      body.sender_phone = params.senderPhone
    }

    const result = await httpsPostJson(url, body)
    if (result && result.errcode === 0 && result.waybill_token) {
      return { ok: true, waybillToken: String(result.waybill_token) }
    }
    return {
      ok: false,
      error: result?.errmsg || `errcode=${result?.errcode}`,
    }
  } catch (e: unknown) {
    return { ok: false, error: (e as Error)?.message || String(e) }
  }
}

// =====================================================================
// 物流消息能力 - follow_waybill
// 文档：https://developers.weixin.qq.com/miniprogram/dev/platform-capabilities/industry/express/business/express_open_msg.html
//
// 与 trace_waybill（物流查询组件）的区别：
//   - trace_waybill：拿 waybill_token 给前端调插件拉起原生物流详情页
//   - follow_waybill：微信在「已揽件/派件中/已签收」三个节点主动给用户推送服务通知
//
// 两者参数结构完全一致，可并存调用，互不影响。
// =====================================================================

/**
 * 传运单到微信「物流消息能力」，触发微信在关键节点推送服务通知。
 *
 * 调用前提：小程序已在 mp.weixin.qq.com 后台开通「物流消息」权限。
 * 调用结果：返回 waybill_token（与 trace_waybill 返回的 token 不同，备 query_follow_trace 用）。
 *
 * 文档：https://developers.weixin.qq.com/miniprogram/dev/server/API/weixin-express/express-msg/api_follow_waybill.html
 *
 * 注意：follow_waybill 不支持云调用，本接口通过 HTTPS 直接调用。
 */
export async function followWaybill(params: TraceWaybillParams): Promise<TraceWaybillResult> {
  if (!params.openid) {
    return { ok: false, error: 'missing openid' }
  }
  if (!params.waybillId) {
    return { ok: false, error: 'missing waybillId' }
  }
  if (!params.transId) {
    return { ok: false, error: 'missing transId' }
  }
  if (!params.receiverPhone) {
    return { ok: false, error: 'missing receiverPhone' }
  }
  if (!params.orderDetailPath) {
    return { ok: false, error: 'missing orderDetailPath' }
  }
  if (!Array.isArray(params.goodsInfo) || params.goodsInfo.length === 0) {
    return { ok: false, error: 'missing goodsInfo' }
  }

  try {
    const token = await getMiniProgramAccessToken()
    const url = `${FOLLOW_WAYBILL_URL}?access_token=${encodeURIComponent(token)}`
    const body: Record<string, unknown> = {
      openid: params.openid,
      waybill_id: params.waybillId,
      trans_id: params.transId,
      receiver_phone: params.receiverPhone,
      order_detail_path: params.orderDetailPath,
      goods_info: {
        detail_list: params.goodsInfo.map(g => ({
          goods_name: g.goodsName,
          goods_img_url: g.goodsImgUrl,
        })),
      },
    }
    if (params.deliveryId) {
      body.delivery_id = params.deliveryId
    }
    if (params.senderPhone) {
      body.sender_phone = params.senderPhone
    }

    const result = await httpsPostJson(url, body)
    if (result && result.errcode === 0 && result.waybill_token) {
      return { ok: true, waybillToken: String(result.waybill_token) }
    }
    return {
      ok: false,
      error: result?.errmsg || `errcode=${result?.errcode}`,
    }
  } catch (e: unknown) {
    return { ok: false, error: (e as Error)?.message || String(e) }
  }
}

// =====================================================================
// 查询运单状态（query_trace）
// =====================================================================

/** 运单状态枚举（与微信官方 waybill_info.status 对齐） */
export const WAYBILL_STATUS_MAP: Record<number, { label: string; color: string }> = {
  0: { label: '未揽收', color: '#909399' },
  1: { label: '已揽件', color: '#409eff' },
  2: { label: '运输中', color: '#409eff' },
  3: { label: '派件中', color: '#e6a23c' },
  4: { label: '已签收', color: '#67c23a' },
  5: { label: '异常', color: '#f56c6c' },
  6: { label: '代签收', color: '#67c23a' },
}

export interface QueryTraceParams {
  /** trace_waybill 返回的 waybill_token */
  waybillToken: string
  /** 订单购买者 openid（可选，传了可提高查询精度） */
  openid?: string
}

export interface QueryTraceResult {
  ok: boolean
  /** 运单状态码 0-6 */
  status?: number
  /** 运单状态中文标签 */
  statusLabel?: string
  /** 状态颜色（用于前端展示） */
  statusColor?: string
  /** 运单号 */
  waybillId?: string
  /** 商品信息列表 */
  goodsInfo?: Array<{ goodsName: string; goodsImgUrl: string }>
  error?: string
}

/**
 * 查询运单状态（query_trace）。
 *
 * 调用前提：先调 traceWaybill 拿到 waybill_token 并存储。
 * 调用结果：返回运单当前状态（0-6），不含轨迹节点列表。
 *
 * 文档：https://developers.weixin.qq.com/miniprogram/dev/server/API/weixin-express/express-search/api_query_trace.html
 *
 * 注意：query_trace 不支持云调用，本接口通过 HTTPS 直接调用。
 */
export async function queryTrace(params: QueryTraceParams): Promise<QueryTraceResult> {
  if (!params.waybillToken) {
    return { ok: false, error: 'missing waybillToken' }
  }
  try {
    const token = await getMiniProgramAccessToken()
    const url = `${QUERY_TRACE_URL}?access_token=${encodeURIComponent(token)}`
    const body: Record<string, unknown> = {
      waybill_token: params.waybillToken,
    }
    if (params.openid) {
      body.openid = params.openid
    }
    const result = await httpsPostJson(url, body)
    if (result && result.errcode === 0 && result.waybill_info) {
      const status = Number(result.waybill_info.status)
      const statusMap = WAYBILL_STATUS_MAP[status] || { label: `未知状态(${status})`, color: '#909399' }
      const goodsInfo: Array<{ goodsName: string; goodsImgUrl: string }> = []
      if (result.shop_info && Array.isArray(result.shop_info.goods_info?.detail_list)) {
        for (const g of result.shop_info.goods_info.detail_list) {
          goodsInfo.push({
            goodsName: g.goods_name || '',
            goodsImgUrl: g.goods_img_url || '',
          })
        }
      }
      return {
        ok: true,
        status,
        statusLabel: statusMap.label,
        statusColor: statusMap.color,
        waybillId: result.waybill_info.waybill_id || '',
        goodsInfo,
      }
    }
    return {
      ok: false,
      error: result?.errmsg || `errcode=${result?.errcode}`,
    }
  } catch (e: unknown) {
    return { ok: false, error: (e as Error)?.message || String(e) }
  }
}
