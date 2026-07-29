/**
 * expressCompanyCodes.ts - 微信物流助手快递公司编码表
 *
 * 文档：
 *   - 物流查询插件：https://developers.weixin.qq.com/miniprogram/dev/platform-capabilities/industry/express/business/express_search.html
 *   - 获取运力id列表：https://developers.weixin.qq.com/miniprogram/dev/server/API/weixin-express/express-msg/api_get_delivery_list.html
 *
 * 编码与微信官方 delivery_id 一致，前后端共用：
 *   - 后端在 uploadShippingInfo 时把 expressCompany 字段填入 express_company
 *   - 后端在 traceWaybill 时填入 delivery_id
 *   - 前端在 MallOrderDetail.vue 下拉选择时使用 value 字段
 *
 * 列表说明：
 *   - 微信官方 get_delivery_list 接口返回 1379 个运力公司（含国际）
 *   - 本表精选国内常用 25+ 个，按使用频率排序，覆盖 99% 业务场景
 *   - 如需使用列表外的运力，可在后台调 getDeliveryList 拉取全量
 *
 * 字段说明：
 *   - code: 微信官方 delivery_id（如 'ZTO'）
 *   - label: 中文显示名（如 '中通快递'）
 */
export interface ExpressCompanyOption {
    code: string;
    label: string;
}
export declare const EXPRESS_COMPANY_OPTIONS: readonly ExpressCompanyOption[];
/** 根据编码查中文标签，找不到返回原值 */
export declare function getExpressCompanyLabel(code: string): string;
/** 列表导出为前端下拉直接可用的格式 */
export declare const EXPRESS_COMPANY_SELECT_OPTIONS: {
    value: string;
    label: string;
}[];
