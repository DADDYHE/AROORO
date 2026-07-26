export interface ShippingItem {
    /** 微信快递公司编码，如 'ZTO' / 'SF' */
    expressCompany: string;
    /** 快递单号 */
    expressNo: string;
    /** 商品描述，例如 '宠物用品 ×1' */
    itemDesc?: string;
}
export interface UploadShippingInfoParams {
    /** 微信支付订单号 */
    transactionId: string;
    /** 商家内部订单号（订单 _id） */
    merchantTradeNo: string;
    shippingItem: ShippingItem;
}
export interface UploadShippingInfoResult {
    ok: boolean;
    error?: string;
}
export interface LogisticsPathItem {
    /** 时间戳（秒），如 1717689600 */
    time: number;
    /** 轨迹描述，如 '快件已到达【北京分拨中心】' */
    desc: string;
}
export interface GetLogisticsPathParams {
    /** 微信快递公司编码，如 'ZTO' */
    expressCompany: string;
    /** 快递单号 */
    expressNo: string;
}
export interface GetLogisticsPathResult {
    ok: boolean;
    data?: LogisticsPathItem[];
    error?: string;
}
/**
 * 上传发货信息到微信「发货信息管理」。
 * - 必须在订单付款后 7 天内调用，否则会被微信侧判定为「发货超时」。
 * - 同一 transactionId 可重复上传，以最后一次为准。
 */
export declare function uploadShippingInfo(params: UploadShippingInfoParams): Promise<UploadShippingInfoResult>;
/**
 * 拉取运单轨迹。
 * - 调用前必须先调用 uploadShippingInfo 把快递信息绑定到微信订单。
 * - 微信侧每隔一段时间会从快递公司拉取轨迹并缓存，本接口返回的是缓存数据。
 */
export declare function getLogisticsPath(params: GetLogisticsPathParams): Promise<GetLogisticsPathResult>;
