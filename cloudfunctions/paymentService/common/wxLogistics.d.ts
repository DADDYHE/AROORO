export interface ShippingItem {
    /** 微信快递公司编码，如 'ZTO' / 'SF'；仅实体物流（logisticsType=1）必填 */
    expressCompany?: string;
    /** 快递单号；仅实体物流（logisticsType=1）必填 */
    expressNo?: string;
    /** 商品描述，例如 '宠物用品 ×1' / '寄养服务定金' */
    itemDesc: string;
}
export interface UploadShippingInfoParams {
    /** 微信支付订单号 */
    transactionId: string;
    /** 商家内部订单号（订单 _id） */
    merchantTradeNo: string;
    /** 物流模式：1=实体物流 2=同城配送 3=虚拟商品（无实体配送）4=用户自提；默认 1 */
    logisticsType?: 1 | 2 | 3 | 4;
    /** 购买用户 openid（订单 ownerId），payer.openid 为微信必填字段 */
    openid: string;
    shippingItem: ShippingItem;
}
export interface UploadShippingInfoResult {
    ok: boolean;
    error?: string;
}
/**
 * 传运单的商品信息（trace_waybill 必填）
 */
export interface TraceGoodsItem {
    /** 商品名称 */
    goodsName: string;
    /** 商品图片 URL */
    goodsImgUrl: string;
}
export interface TraceWaybillParams {
    /** 购买用户 openid（订单 ownerId） */
    openid: string;
    /** 收件人手机号（部分运力需要作为查单依据） */
    receiverPhone: string;
    /** 运单号（快递单号） */
    waybillId: string;
    /** 微信支付交易单号（420 开头） */
    transId: string;
    /** 点击落地页商品卡片跳转路径（订单详情页 path） */
    orderDetailPath: string;
    /** 商品信息列表 */
    goodsInfo: TraceGoodsItem[];
    /** 运力 id（快递公司编码，用于提高运单号识别准确度） */
    deliveryId?: string;
    /** 寄件人手机号（可选） */
    senderPhone?: string;
}
export interface TraceWaybillResult {
    ok: boolean;
    /** 微信返回的 waybill_token，前端调 plugin.openWaybillTracking 用 */
    waybillToken?: string;
    error?: string;
}
/**
 * 上传发货信息到微信「发货信息管理」。
 * - 必须在订单付款后 48 小时内调用，否则微信推送「发货超时」提醒。
 * - 同一支付单重复上报视为重新发货，每笔支付单仅 1 次重新发货机会，重复调用失败请容忍记录。
 * - 服务类/虚拟商品订单（寄养/喂养/活动）应传 logisticsType=3（虚拟商品，无需物流单号）。
 *
 * P0-1 修复（2026-09-13，对照官方文档 /wxa/sec/order/upload_shipping_info）：
 *   - order_key.order_number_type: 1 → 2（枚举 1=商户单号需 mchid+out_trade_no；2=微信支付单号 transaction_id）
 *   - 补必填 payer.openid 与 upload_time（RFC3339）
 *   - 新增 logisticsType 支持虚拟商品发货（logistics_type=3，shipping_list 免物流单号）
 */
export declare function uploadShippingInfo(params: UploadShippingInfoParams): Promise<UploadShippingInfoResult>;
export interface TraceWaybillResult {
    ok: boolean;
    /** 微信返回的 waybill_token，前端调 plugin.openWaybillTracking 用 */
    waybillToken?: string;
    error?: string;
}
/**
 * 传运单到微信「物流查询组件」并获取 waybill_token。
 */
export declare function traceWaybill(params: TraceWaybillParams): Promise<TraceWaybillResult>;
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
export declare function followWaybill(params: TraceWaybillParams): Promise<TraceWaybillResult>;
/** 运单状态枚举（与微信官方 waybill_info.status 对齐） */
export declare const WAYBILL_STATUS_MAP: Record<number, {
    label: string;
    color: string;
}>;
export interface QueryTraceParams {
    /** trace_waybill 返回的 waybill_token */
    waybillToken: string;
    /** 订单购买者 openid（可选，传了可提高查询精度） */
    openid?: string;
}
export interface QueryTraceResult {
    ok: boolean;
    /** 运单状态码 0-6 */
    status?: number;
    /** 运单状态中文标签 */
    statusLabel?: string;
    /** 状态颜色（用于前端展示） */
    statusColor?: string;
    /** 运单号 */
    waybillId?: string;
    /** 商品信息列表 */
    goodsInfo?: Array<{
        goodsName: string;
        goodsImgUrl: string;
    }>;
    error?: string;
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
export declare function queryTrace(params: QueryTraceParams): Promise<QueryTraceResult>;
