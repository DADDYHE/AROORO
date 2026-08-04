/** 获取 access_token（带缓存 + 串行化） */
export declare function getMiniProgramAccessToken(): Promise<string>;
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
export declare function getWxOrderStatus(params: {
    transaction_id?: string;
    merchant_id?: string;
    sub_merchant_id?: string;
    merchant_trade_no?: string;
}): Promise<{
    ok: boolean;
    data?: any;
    error?: string;
}>;
/** 单元测试 / 健康检查用：手动清除 token 缓存 */
export declare function clearAccessTokenCache(): void;
