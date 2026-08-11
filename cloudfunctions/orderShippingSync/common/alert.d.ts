/**
 * common/alert.ts - 主动告警工具
 *
 * 设计目标：
 *   - 资金类事务失败等关键事件写入 DB alerts 集合，供运维主动查询
 *   - 补充 logger.error 的不足（logger 仅输出到 console，无持久化）
 *   - best-effort：写入失败不影响主流程，仅记日志
 *   - 外部通道：critical 级别在落库后额外推送邮件（common/notify-email，配置驱动、best-effort）
 *     ⚠️ 默认关闭，需环境变量 ALERT_EMAIL_ENABLED=true 才生效，详见下方开关说明
 *
 * 使用方式：
 *   const { recordAlert } = require('./common/alert')
 *   await recordAlert('critical', 'refund.transaction.failed', '退款DB同步失败', { orderId })
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.common.json
 */
/** 告警严重级别 */
export type AlertSeverity = 'critical' | 'warning' | 'info';
/** 告警记录文档 */
export interface AlertRecord {
    _id?: string;
    severity: AlertSeverity;
    action: string;
    message: string;
    context: Record<string, unknown>;
    resolved: boolean;
    createdAt: Date;
    resolvedAt?: Date;
}
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
export declare function recordAlert(severity: AlertSeverity, action: string, message: string, context?: Record<string, unknown>): Promise<void>;
/**
 * 标记告警为已解决
 *
 * @param alertId 告警记录 _id
 */
export declare function resolveAlert(alertId: string): Promise<void>;
declare const _default: {
    recordAlert: typeof recordAlert;
    resolveAlert: typeof resolveAlert;
};
export default _default;
