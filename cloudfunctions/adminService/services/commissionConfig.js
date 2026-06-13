/* eslint-disable */
"use strict";
/**
 * adminService/commissionConfig.ts - 平台级佣金率配置（TypeScript 源文件 - Sprint 33 迁移）
 *
 * 业务功能：
 *   - getCommissionConfig: 读取 system_config.commission_rates（按 ORDER_TYPES 兜底）
 *   - updateCommissionConfig: 更新佣金率（按 type 校验 0-100）
 *
 * 关键设计：
 *   - 使用 err() 工厂 + withErrorHandling 包装
 *   - 不依赖 initCloud 在顶层（懒加载 db）以支持 adminService/index.js 中多 db 上下文
 *   - 与 paymentService/services/commission.ts 行为对齐
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.adminService.json
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateCommissionConfig = exports.getCommissionConfig = void 0;
const utils_1 = require("../common/utils");
const logger_1 = require("../common/logger");
const errors_1 = require("../common/errors");
const constants_1 = require("../constants");
const logger = (0, logger_1.createLogger)('adminService.commissionConfig');
/* ============================================================
 * Handlers
 * ============================================================ */
exports.getCommissionConfig = (0, errors_1.withErrorHandling)(async (_event, _context, _auth) => {
    const { db } = (0, utils_1.initCloud)();
    let config = {};
    try {
        const res = await db.collection('system_config').doc('commission_rates').get();
        config = (res.data || {});
    }
    catch (e) {
        logger.warn('getCommissionConfig.system_config', { code: e?.errCode, msg: e?.message });
    }
    const rates = {};
    for (const type of constants_1.ORDER_TYPES) {
        const value = config[type];
        rates[type] = typeof value === 'number' ? value : 0;
    }
    return (0, utils_1.handleSuccess)({ rates, updatedAt: config.updatedAt, updatedBy: config.updatedBy });
});
exports.updateCommissionConfig = (0, errors_1.withErrorHandling)(async (event, _context, auth) => {
    const { db } = (0, utils_1.initCloud)();
    const { rates } = event;
    if (!rates || typeof rates !== 'object') {
        throw (0, errors_1.err)('INVALID_PARAMS', '配置格式错误');
    }
    const data = {
        updatedBy: auth?.openid,
        updatedAt: new Date(),
    };
    for (const type of Object.keys(rates)) {
        if (!constants_1.ORDER_TYPES.includes(type)) {
            continue;
        }
        const rate = Number(rates[type]);
        if (isNaN(rate) || rate < 0 || rate > 100) {
            throw (0, errors_1.err)('INVALID_PARAMS', `${constants_1.ORDER_TYPE_NAMES[type] || type}分佣比例须在0-100之间`);
        }
        data[type] = rate;
    }
    if (Object.keys(data).length <= 2) {
        throw (0, errors_1.err)('INVALID_PARAMS', '没有需要更新的字段');
    }
    await db.collection('system_config').doc('commission_rates').set({ data });
    return (0, utils_1.handleSuccess)(data);
});
/* ============================================================
 * 默认导出（保持 CommonJS 兼容）
 * ============================================================ */
const _handlers = { getCommissionConfig: exports.getCommissionConfig, updateCommissionConfig: exports.updateCommissionConfig };
// Runtime shim: 把 module.exports 指向包装后的 handlers
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _mod = module;
_mod.exports = _handlers;
_handlers.default = _handlers;
exports.default = _handlers;
