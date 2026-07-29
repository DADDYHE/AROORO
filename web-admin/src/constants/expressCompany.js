/**
 * 快递公司编码表（与云函数 common/expressCompanyCodes.ts 保持一致）
 *
 * 编码与微信官方 delivery_id 一致，用于：
 *   - uploadShippingInfo 的 express_company 字段
 *   - traceWaybill 的 delivery_id 字段
 *
 * 列表来源：微信官方 get_delivery_list 接口（共 1379 个运力公司）
 * 本表精选国内常用 28 个，按使用频率排序，覆盖 99% 业务场景
 */

export const EXPRESS_COMPANY_OPTIONS = [
  // ============ 主流国内快递（按业务量排序） ============
  { value: 'ZTO', label: '中通快递' },
  { value: 'YTO', label: '圆通速递' },
  { value: 'STO', label: '申通快递' },
  { value: 'YD', label: '韵达速递' },
  { value: 'SF', label: '顺丰速运' },
  { value: 'JTSD', label: '极兔速递' },
  { value: 'JD', label: '京东物流' },
  { value: 'EMS', label: 'EMS' },
  { value: 'POSTB', label: '邮政包裹' },

  // ============ 大件/重货 ============
  { value: 'DBL', label: '德邦快递' },
  { value: 'BSKY', label: '百世快运' },
  { value: 'ADS', label: '安能物流' },
  { value: 'ZHY', label: '中铁快运' },
  { value: 'KYE', label: '跨越速运' },
  { value: 'RRD', label: '日日顺' },

  // ============ 其他国内快递 ============
  { value: 'HTKY', label: '百世快递' },
  { value: 'UC', label: '优速快递' },
  { value: 'ZJS', label: '宅急送' },
  { value: 'FAST', label: '快捷速递' },
  { value: 'RF', label: '如风达' },
  { value: 'HT', label: '天天快递' },
  { value: 'SUN', label: '苏宁物流' },

  // ============ 国际快递 ============
  { value: 'UPS', label: 'UPS' },
  { value: 'DHS', label: 'DHL' },
  { value: 'FDX', label: 'FedEx' },
  { value: 'TNT', label: 'TNT' },

  // ============ 兜底 ============
  { value: 'OTHER', label: '其他' },
]

/** 根据编码查中文标签，找不到返回原值 */
export function getExpressCompanyLabel(code) {
  if (!code) return ''
  const found = EXPRESS_COMPANY_OPTIONS.find(o => o.value === code)
  return found ? found.label : code
}
