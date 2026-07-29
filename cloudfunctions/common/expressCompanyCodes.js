"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EXPRESS_COMPANY_SELECT_OPTIONS = exports.getExpressCompanyLabel = exports.EXPRESS_COMPANY_OPTIONS = void 0;
exports.EXPRESS_COMPANY_OPTIONS = [
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
];
/** 根据编码查中文标签，找不到返回原值 */
function getExpressCompanyLabel(code) {
    if (!code)
        return '';
    const found = exports.EXPRESS_COMPANY_OPTIONS.find(o => o.code === code);
    return found ? found.label : code;
}
exports.getExpressCompanyLabel = getExpressCompanyLabel;
/** 列表导出为前端下拉直接可用的格式 */
exports.EXPRESS_COMPANY_SELECT_OPTIONS = exports.EXPRESS_COMPANY_OPTIONS.map(o => ({
    value: o.code,
    label: o.label,
}));
