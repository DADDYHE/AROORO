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

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { initCloud } = require('./utils')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createLogger } = require('./logger')

const { db } = initCloud()
const logger = createLogger('alert')

/**
 * 邮件外部通道总开关（默认关闭）
 *
 * 2026-08-02 DADDY 决策：邮件推送能力先实现、暂不启用，后续需要时再优化。
 * 默认 false 可确保任何一次常规部署都不会把邮件推送意外带上线
 * （代码已 sync 到全部服务的 common/ 副本，仅靠"不配 system_config"兜底不够）。
 *
 * 启用步骤（两处都要，双保险）：
 *   1. 云函数环境变量加 ALERT_EMAIL_ENABLED=true（注意禁用 TENCENTCLOUD_/SCF_/QCLOUD_ 前缀）
 *   2. system_config 集合写入 _id=alert_email 文档（enabled/host/port/user/pass/from/to）
 * 任一未满足 → 静默跳过，不产生 DB 读与日志噪音。
 */
const EMAIL_ALERT_ENABLED = process.env.ALERT_EMAIL_ENABLED === 'true'

/** 告警严重级别 */
export type AlertSeverity = 'critical' | 'warning' | 'info'

/** 告警记录文档 */
export interface AlertRecord {
  _id?: string
  severity: AlertSeverity
  action: string
  message: string
  context: Record<string, unknown>
  resolved: boolean
  createdAt: Date
  resolvedAt?: Date
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
export async function recordAlert(
  severity: AlertSeverity,
  action: string,
  message: string,
  context: Record<string, unknown> = {}
): Promise<void> {
  try {
    const record: AlertRecord = {
      severity,
      action,
      message,
      context,
      resolved: false,
      createdAt: db.serverDate() as Date,
    }

    await db.collection('alerts').add({ data: record })
    logger.warn('alert.recorded', { severity, action, message })

    // 外部通道：critical 级别在落库后额外推送邮件（best-effort，失败仅记日志，不影响主流程）
    // 开关未打开时直接短路：不 require、不读 system_config、不产生日志噪音
    if (EMAIL_ALERT_ENABLED && severity === 'critical') {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { sendAlertEmail } = require('./notify-email')
        await sendAlertEmail({ severity, action, message, context }, db)
      } catch (emailErr) {
        logger.error('alert.external.failed', {
          action,
          error: emailErr instanceof Error ? emailErr.message : String(emailErr),
        })
      }
    }
  } catch (error) {
    // 告警写入失败不能影响主流程，仅记日志
    logger.error('alert.record.failed', {
      severity,
      action,
      message,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * 标记告警为已解决
 *
 * @param alertId 告警记录 _id
 */
export async function resolveAlert(alertId: string): Promise<void> {
  try {
    if (!alertId) return

    await db.collection('alerts').doc(alertId).update({
      data: {
        resolved: true,
        resolvedAt: db.serverDate(),
      },
    })
    logger.info('alert.resolved', { alertId })
  } catch (error) {
    logger.error('alert.resolve.failed', {
      alertId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

// =====================================================================
// Runtime shim: CommonJS 兼容
// =====================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _mod = module as { exports: Record<string, unknown> }
_mod.exports = { recordAlert, resolveAlert }
_mod.exports.default = _mod.exports

export default { recordAlert, resolveAlert }
