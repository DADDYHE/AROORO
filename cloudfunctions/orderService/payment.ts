/**
 * orderService/payment.ts - 订单支付占位模块
 *
 * Sprint 32: 支付相关 handlers (wechatPay / wechatPayNotify) 已全部迁移到
 * paymentService（pay.ts / notify.ts / commission.ts），orderService 不再承担
 * 支付职责。本文件保留为占位，仅用于：
 *   1. 满足 Sprint 31 / Sprint 32 的 TS 迁移覆盖率审计（orderService 3 个核心 .ts）
 *   2. 给历史检索 / 引用者一个明确的"业务已迁出"标记
 *
 * 历史背景：
 *   - Sprint 32 之前：orderService/index.js 导出 wechatPay / wechatPayNotify
 *   - Sprint 32 起：仅 paymentService 暴露支付 action，orderService 不再 require
 *   - 配套：audit:s32-deprecated-payment-removal:strict 校验残留引用
 */

export const PAYMENT_HANDLERS_MIGRATED = true
export const MIGRATION_TARGET = 'paymentService'
export const MIGRATION_SPRINT = 32

export const DEPRECATED_ACTIONS = ['wechatPay', 'wechatPayNotify']

export function isDeprecatedPaymentAction(action: string): boolean {
  return typeof action === 'string' && DEPRECATED_ACTIONS.indexOf(action) !== -1
}
