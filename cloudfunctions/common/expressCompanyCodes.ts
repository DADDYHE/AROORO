/**
 * expressCompanyCodes.ts - 微信物流助手快递公司编码表
 *
 * 文档：https://developers.weixin.qq.com/miniprogram/dev/server/API/express/delivery/open/delivery_open_msg_list.html
 *
 * 编码与微信官方 delivery_id 一致，前后端共用：
 *   - 后端在 uploadShippingInfo 时把 expressCompany 字段填入 express_company
 *   - 前端在 MallOrderDetail.vue 下拉选择时使用 value 字段
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
  { code: 'ZTO', label: '中通快递' },
  { code: 'SF', label: '顺丰速运' },
  { code: 'YTO', label: '圆通速递' },
  { code: 'STO', label: '申通快递' },
  { code: 'HTKY', label: '百世快递' },
  { code: 'JD', label: '京东物流' },
  { code: 'EMS', label: 'EMS' },
  { code: 'ZJS', label: '宅急送' },
  { code: 'DBL', label: '德邦快递' },
  { code: 'POSTB', label: '邮政包裹' },
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
