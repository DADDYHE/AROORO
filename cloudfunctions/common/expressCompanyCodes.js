"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EXPRESS_COMPANY_SELECT_OPTIONS = exports.getExpressCompanyLabel = exports.EXPRESS_COMPANY_OPTIONS = void 0;
exports.EXPRESS_COMPANY_OPTIONS = [
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
