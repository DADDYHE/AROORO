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
// 复用统一佣金写入器的费率键别名工具（与 services/tuan.js 同源问题）：
//   线上 system_config.commission_rates 历史上用 hosting 键，而 ORDER_TYPES 用
//   boarding，直接 config['boarding'] 取不到 → 配置页寄养费率恒显示 0（假 0）。
const commission_utils_1 = require("../common/commission-utils");
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
        // pickRate 会按 RATE_KEY_ALIASES 依次尝试 boarding/hosting/order 等别名键，
        // 取到第一个非零值；全部缺失或为 0 时返回 0。
        const value = (0, commission_utils_1.pickRate)(config, type);
        rates[type] = value;
        // 与合作伙伴层(getPartnerCommissionRates/getMyCommissionRates)保持一致：
        // 寄养同时下发 boarding 与 hosting 两个键，兼容「读 boarding」与「读 hosting」的
        // 调用方，消除全局配置接口只返回 boarding 导致读 hosting 的页面/端显示 0 的残留问题。
        if (type === 'boarding') {
            rates['hosting'] = value;
        }
    }
    return (0, utils_1.handleSuccess)({ rates, updatedAt: config.updatedAt, updatedBy: config.updatedBy });
});
exports.updateCommissionConfig = (0, errors_1.withErrorHandling)(async (event, _context, auth) => {
    const { db } = (0, utils_1.initCloud)();
    const { rates } = event;
    if (!rates || typeof rates !== 'object') {
        throw (0, errors_1.err)('INVALID_PARAMS', '配置格式错误');
    }
    // P0 修复：原实现直接 .set({ data }) 整文档覆盖，而 data 只包含本次提交且命中
    // ORDER_TYPES 的键 —— 前端若只提交部分字段（如仅改 mall），其余类型的费率会被
    // 整体清空。改为「读现有配置 → 增量合并 → 写回」。
    let existing = {};
    try {
        const res = await db.collection('system_config').doc('commission_rates').get();
        existing = (res.data || {});
    }
    catch (e) {
        // 文档不存在（首次配置）走空对象，等价于原 set 语义
        logger.warn('updateCommissionConfig.read_existing', { code: e?.errCode, msg: e?.message });
    }
    const data = {
        updatedBy: auth?.openid,
        updatedAt: new Date(),
    };
    let changed = 0;
    for (const type of Object.keys(rates)) {
        if (!constants_1.ORDER_TYPES.includes(type)) {
            continue;
        }
        const rate = Number(rates[type]);
        if (isNaN(rate) || rate < 0 || rate > 100) {
            throw (0, errors_1.err)('INVALID_PARAMS', `${constants_1.ORDER_TYPE_NAMES[type] || type}分佣比例须在0-100之间`);
        }
        data[type] = rate;
        changed++;
        // 键漂移防护：线上历史文档用别名键（如 hosting），只写 canonical 键（boarding）
        // 会让同一类型两个键并存且值分裂，读侧 pickRate 可能取到过期的非零旧值。
        // 仅同步「文档中已存在」的别名键，不新增冗余键。
        for (const alias of (commission_utils_1.RATE_KEY_ALIASES[type] || [])) {
            if (alias !== type && Object.prototype.hasOwnProperty.call(existing, alias)) {
                data[alias] = rate;
            }
        }
    }
    if (!changed) {
        throw (0, errors_1.err)('INVALID_PARAMS', '没有需要更新的字段');
    }
    const merged = { ...existing, ...data };
    delete merged._id;
    await db.collection('system_config').doc('commission_rates').set({ data: merged });
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
