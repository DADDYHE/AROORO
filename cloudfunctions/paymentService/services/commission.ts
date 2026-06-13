/**
 * paymentService/commission.ts - 佣金记录服务（TypeScript 源文件 - Sprint 27 迁移）
 *
 * 业务功能：
 *   - createCommissionRecord：订单支付成功后创建佣金记录（best-effort）
 *     1) 读取 system_config.commission_rates[orderType]
 *     2) 查询订单买家（users._id = openid）
 *     3) 查找邀请人（inviterId）
 *     4) 计算佣金金额 = 订单金额 × 佣金率 / 100
 *     5) 幂等检查（已存在则跳过）
 *     6) 写入 tuan_commissions 集合
 *
 * 与 pay.ts / refund.ts / notify.ts 的关键差异：
 *   - 工具函数（非 handler）：被 pay.ts / notify.ts 异步调用
 *   - 导出形式：CommonJS `module.exports = createCommissionRecord`（default export）
 *   - 错误处理：所有异常都被吞掉（best-effort），仅记录日志
 *   - 无需鉴权 / 无需返回结构
 *
 * 迁移目标：
 *   - 强类型化 orderType / order / config / user / inviter / commission record
 *   - 与 common/* 共享类型（CloudBaseDB / CommissionDoc）
 *   - 编译产物（commission.js）继续被 pay.js / notify.js require
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.paymentService.json
 *   （运行时仍消费 .js 编译产物）
 */

// Sprint 27 迁移说明：
//   - 仍消费 .js 编译产物（tsc 输出到 cloudfunctions/paymentService/services/commission.js）
//   - 对 .js 文件（utils）使用 require() 而非 import
//   - 强类型作用于 common/* 与本文件内部接口
//   - 默认导出为函数本身（与原 CommonJS 行为一致），支持 `require('./commission')(orderType, order)`

import { initCloud } from '../../common/utils'
import { createLogger } from '../../common/logger'
import type { CloudBaseDB } from '../../common/types'

// service 内部 .js 模块走 CommonJS require
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { generateId } = require('../common/utils')

// =====================================================================
// 类型定义
// =====================================================================

/** 订单类型（与 pay.ts / notify.ts 保持一致） */
export type CommissionOrderType = 'order' | 'mall' | 'tuan' | 'activity' | 'feeding'

/** 订单文档（最小子集） */
export interface CommissionOrderDoc {
  _id: string
  ownerId?: string
  outTradeNo?: string
  orderNo?: string
  totalPrice?: number
  totalAmount?: number
  basicPrice?: number
  [k: string]: unknown
}

/** 系统配置（佣金率） */
export interface CommissionConfig {
  order?: number
  mall?: number
  tuan?: number
  activity?: number
  feeding?: number
  [k: string]: number | undefined
}

/** 用户文档（最小子集） */
export interface CommissionUserDoc {
  _id: string
  inviterId?: string
  nickName?: string
  [k: string]: unknown
}

/** 佣金记录写入载荷 */
export interface CommissionRecordPayload {
  _id: string
  inviterId: string
  inviterNickName: string
  ownerId: string
  orderType: CommissionOrderType
  orderId: string
  orderNo: string
  orderAmount: number
  commissionRate: number
  commissionAmount: number
  status: 'pending'
  createdAt: Date
  updatedAt: Date
  // 索引签名：与 CloudBaseDB.add() 的 Record<string, unknown> 参数兼容
  [k: string]: unknown
}

// =====================================================================
// 模块初始化
// =====================================================================

const { db } = initCloud()
const logger = createLogger('paymentService:commission')

// =====================================================================
// 内部辅助
// =====================================================================

/**
 * 读取系统佣金率配置
 *
 * @returns 配置对象（缺失则返回空对象）
 */
async function loadCommissionConfig(dbInstance: CloudBaseDB): Promise<CommissionConfig> {
  try {
    const configRes = await dbInstance.collection('system_config').doc('commission_rates').get()
    return (configRes.data || {}) as CommissionConfig
  } catch (e) {
    logger.warn('loadCommissionConfig: 读取 system_config 失败', { msg: (e as Error)?.message })
    return {}
  }
}

/**
 * 查询买家档案（users._id = openid）
 */
async function loadBuyer(dbInstance: CloudBaseDB, ownerId: string): Promise<CommissionUserDoc | null> {
  try {
    const buyerRes = await dbInstance.collection('users').doc(ownerId).get()
    return (buyerRes.data || null) as CommissionUserDoc | null
  } catch (e) {
    logger.warn('loadBuyer: 查询买家失败', { ownerId, msg: (e as Error)?.message })
    return null
  }
}

/**
 * 查询邀请人档案
 */
async function loadInviter(dbInstance: CloudBaseDB, inviterId: string): Promise<CommissionUserDoc | null> {
  try {
    const inviterLookup = await dbInstance.collection('users').doc(inviterId).get()
    return (inviterLookup.data || null) as CommissionUserDoc | null
  } catch (e) {
    logger.warn('loadInviter: 查询邀请人失败', { inviterId, msg: (e as Error)?.message })
    return null
  }
}

/**
 * 计算订单金额（兼容 totalPrice / totalAmount / basicPrice 三种字段）
 */
function resolveOrderAmount(order: CommissionOrderDoc): number {
  return Number(order.totalPrice) || Number(order.totalAmount) || Number(order.basicPrice) || 0
}

/**
 * 检查是否已存在佣金记录（幂等保护）
 */
async function hasExistingCommission(
  dbInstance: CloudBaseDB,
  orderId: string,
  inviterId: string
): Promise<boolean> {
  try {
    const existRes = await dbInstance.collection('tuan_commissions')
      .where({ orderId, inviterId })
      .count()
    return existRes.total > 0
  } catch (e) {
    logger.warn('hasExistingCommission: 幂等检查失败', { orderId, inviterId, msg: (e as Error)?.message })
    return false
  }
}

// =====================================================================
// 主入口
// =====================================================================

/**
 * 创建佣金记录（best-effort）
 *
 * 调用时机：
 *   - confirmPayment 成功（pay.ts）
 *   - paymentNotify 成功（notify.ts）
 *
 * 流程：
 *   1. 读取 system_config.commission_rates[orderType]
 *   2. 若 rate <= 0 → 跳过（无佣金）
 *   3. 若 order.ownerId 缺失 → 跳过
 *   4. 查询买家（users._id = ownerId）
 *   5. 若买家 inviterId 缺失 → 跳过
 *   6. 查询邀请人档案
 *   7. 计算佣金金额（orderAmount × rate / 100，保留 2 位小数）
 *   8. 幂等检查（orderId + inviterId 已存在 → 跳过）
 *   9. 写入 tuan_commissions
 *
 * 错误处理：
 *   - 任何异常都被吞掉，仅记录日志
 *   - 不影响主业务（支付成功）的响应
 *
 * @param orderType 订单类型
 * @param order 订单文档
 * @returns 始终返回 void；失败仅记日志
 */
export async function createCommissionRecord(
  orderType: CommissionOrderType | string,
  order: CommissionOrderDoc
): Promise<void> {
  try {
    // 1. 读取佣金率
    const config = await loadCommissionConfig(db)
    const rate = Number(config[orderType as string]) || 0
    if (rate <= 0) {return}

    if (!order.ownerId) {return}

    // 2. 查询买家
    const buyerData = await loadBuyer(db, order.ownerId)
    if (!buyerData) {return}

    // 3. 查询邀请人
    const inviterId = buyerData.inviterId
    if (!inviterId) {return}

    const inviterData = await loadInviter(db, inviterId)
    if (!inviterData) {return}

    // 4. 计算订单金额 + 佣金金额
    const orderAmount = resolveOrderAmount(order)
    if (orderAmount <= 0) {return}

    const commissionAmount = Math.round((orderAmount * rate / 100) * 100) / 100
    if (commissionAmount <= 0) {return}

    // 5. 幂等检查
    if (await hasExistingCommission(db, order._id, inviterId)) {return}

    // 6. 写入佣金记录
    const payload: CommissionRecordPayload = {
      _id: generateId('commission', order.ownerId),
      inviterId,
      inviterNickName: inviterData.nickName || '',
      ownerId: buyerData._id,
      orderType: orderType as CommissionOrderType,
      orderId: order._id,
      orderNo: order.outTradeNo || order.orderNo || '',
      orderAmount,
      commissionRate: rate,
      commissionAmount,
      status: 'pending',
      createdAt: db.serverDate(),
      updatedAt: db.serverDate(),
    }

    await db.collection('tuan_commissions').add({ data: payload })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : '未知错误'
    logger.error('createCommissionRecord', { msg, orderType, orderId: order?._id })
  }
}

// =====================================================================
// 默认导出（保持 CommonJS 兼容：module.exports = createCommissionRecord）
// =====================================================================

export default createCommissionRecord
