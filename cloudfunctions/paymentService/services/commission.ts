/**
 * paymentService/commission.ts - 佣金记录服务（委托层）
 *
 * 沿革：
 *   - Sprint 27：commission.js → commission.ts 迁移，本地实现强类型化
 *     （CommissionOrderType / CommissionOrderDoc / CommissionConfig /
 *      CommissionRecordPayload 四接口即在该 Sprint 引入，现已随写入器
 *      统一迁移到 common/commission-utils.ts，审计见 audit-s27）
 *   - 2026-08-02：写入器统一，本文件退化为薄委托层（见下）
 *
 * ⚠️ 2026-08-02 写入器统一：
 *   本文件曾是三套并行佣金写入实现之一（另两套：common/commission-utils、activityService 本地版），
 *   三者在费率键、金额字段、幂等策略上长期漂移，导致：
 *     - 寄养费率键 hosting/boarding 不匹配 → 寄养佣金恒为 0（P0）
 *     - mall 双触发（pay.ts + adminService.completeMallOrder）走不同实现
 *   现统一收敛到 common/commission-utils，本文件仅保留薄委托，
 *   维持 pay.js / notify.js 的 `require('./commission').createCommissionRecord` 调用契约不变。
 *
 * 能力已全部由公共写入器提供：
 *   - 费率键别名（boarding ↔ hosting ↔ order）、类型规范化（group_buy → tuan）
 *   - 金额字段按 orderType 路由（activity=finalAmount / feeding=totalAmount / 其余 totalPrice）
 *   - system_config 5 分钟缓存、确定性 _id、唯一索引冲突优雅恢复、失败落 alerts
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.paymentService.json
 */

import {
  createCommissionRecord as sharedCreateCommissionRecord,
  cancelCommissionRecord as sharedCancelCommissionRecord,
} from '../common/commission-utils'
import type { CommissionOrderDoc, CommissionOrderType } from '../common/commission-utils'

// 类型再导出：保持既有 import 契约（历史上从本文件引入类型的代码不受影响）
export type { CommissionOrderDoc, CommissionOrderType }

/**
 * 创建佣金记录（best-effort）——委托 common/commission-utils
 *
 * 调用时机：
 *   - confirmPayment 成功（pay.ts，mall / tuan）
 *   - paymentNotify 成功（notify.ts，mall / tuan / feeding）
 *
 * @param orderType 订单类型（接受 order/hosting/boarding/group_buy 等别名）
 * @param order 订单文档
 */
export async function createCommissionRecord(
  orderType: CommissionOrderType | string,
  order: CommissionOrderDoc
): Promise<void> {
  return sharedCreateCommissionRecord(orderType, order)
}

/**
 * 取消佣金记录（best-effort）——委托 common/commission-utils
 * @param orderId 订单ID
 */
export async function cancelCommissionRecord(orderId: string): Promise<void> {
  return sharedCancelCommissionRecord(orderId)
}

// 默认导出（保持 CommonJS 兼容：require('./commission')(orderType, order)）
export default createCommissionRecord
