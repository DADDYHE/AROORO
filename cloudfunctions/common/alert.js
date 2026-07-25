"use strict";
/**
 * common/alert.ts - 主动告警工具
 *
 * 设计目标：
 *   - 资金类事务失败等关键事件写入 DB alerts 集合，供运维主动查询
 *   - 补充 logger.error 的不足（logger 仅输出到 console，无持久化）
 *   - best-effort：写入失败不影响主流程，仅记日志
 *
 * 使用方式：
 *   const { recordAlert } = require('./common/alert')
 *   await recordAlert('critical', 'refund.transaction.failed', '退款DB同步失败', { orderId })
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.common.json
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveAlert = exports.recordAlert = void 0;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { initCloud } = require('./utils');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createLogger } = require('./logger');
const { db } = initCloud();
const logger = createLogger('alert');
/**
 * 记录告警到 DB alerts 集合
 *
 * @param severity 严重级别：critical（资金/数据不一致）、warning（可恢复异常）、info（提示）
 * @param action 告警标识（点分风格，如 'refund.transaction.failed'）
 * @param message 人类可读的告警消息
 * @param context 上下文信息（orderId、openid 等）
 *
 * @returns 始终返回 void；写入失败仅记日志，不抛错
 */
async function recordAlert(severity, action, message, context = {}) {
    try {
        const record = {
            severity,
            action,
            message,
            context,
            resolved: false,
            createdAt: db.serverDate(),
        };
        await db.collection('alerts').add({ data: record });
        logger.warn('alert.recorded', { severity, action, message });
    }
    catch (error) {
        // 告警写入失败不能影响主流程，仅记日志
        logger.error('alert.record.failed', {
            severity,
            action,
            message,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}
exports.recordAlert = recordAlert;
/**
 * 标记告警为已解决
 *
 * @param alertId 告警记录 _id
 */
async function resolveAlert(alertId) {
    try {
        if (!alertId)
            return;
        await db.collection('alerts').doc(alertId).update({
            data: {
                resolved: true,
                resolvedAt: db.serverDate(),
            },
        });
        logger.info('alert.resolved', { alertId });
    }
    catch (error) {
        logger.error('alert.resolve.failed', {
            alertId,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}
exports.resolveAlert = resolveAlert;
// =====================================================================
// Runtime shim: CommonJS 兼容
// =====================================================================
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _mod = module;
_mod.exports = { recordAlert, resolveAlert };
_mod.exports.default = _mod.exports;
exports.default = { recordAlert, resolveAlert };
