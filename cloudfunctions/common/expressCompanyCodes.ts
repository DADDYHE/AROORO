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
  code: string
  label: string
}

export const EXPRESS_COMPANY_OPTIONS: readonly ExpressCompanyOption[] = [
  // ============ 主流国内快递（按业务量排序） ============
  { code: 'ZTO', label: '中通快递' },
  { code: 'YTO', label: '圆通速递' },
  { code: 'STO', label: '申通快递' },
  { code: 'YD', label: '韵达速递' },
  { code: 'SF', label: '顺丰速运' },
  { code: 'JTSD', label: '极兔速递' },
  { code: 'JD', label: '京东物流' },
  { code: 'EMS', label: 'EMS' },
  { code: 'POSTB', label: '邮政包裹' },

  // ============ 大件/重货 ============
  { code: 'DBL', label: '德邦快递' },
  { code: 'BSKY', label: '百世快运' },
  { code: 'ADS', label: '安能物流' },
  { code: 'ZHY', label: '中铁快运' },
  { code: 'KYE', label: '跨越速运' },
  { code: 'RRD', label: '日日顺' },

  // ============ 其他国内快递 ============
  { code: 'HTKY', label: '百世快递' },
  { code: 'UC', label: '优速快递' },
  { code: 'ZJS', label: '宅急送' },
  { code: 'FAST', label: '快捷速递' },
  { code: 'RF', label: '如风达' },
  { code: 'HT', label: '天天快递' },
  { code: 'SUN', label: '苏宁物流' },

  // ============ 国际快递 ============
  { code: 'UPS', label: 'UPS' },
  { code: 'DHS', label: 'DHL' },
  { code: 'FDX', label: 'FedEx' },
  { code: 'TNT', label: 'TNT' },

  // ============ 兜底 ============
  { code: 'OTHER', label: '其他' },
]

/** 根据编码查中文标签，找不到返回原值 */
export function getExpressCompanyLabel(code: string): string {
  if (!code) return ''
  const found = EXPRESS_COMPANY_OPTIONS.find(o => o.code === code)
  return found ? found.label : code
}

/** 列表导出为前端下拉直接可用的格式 */
export const EXPRESS_COMPANY_SELECT_OPTIONS = EXPRESS_COMPANY_OPTIONS.map(o => ({
  value: o.code,
  label: o.label,
}))
