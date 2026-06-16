/**
 * common/commission-utils.ts - 共享佣金记录工具
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
 * 使用方式：
 *   - 各云函数通过 require('../../common/commission-utils').createCommissionRecord 调用
 *   - 所有异常都被吞掉（best-effort），仅记录日志
 *   - 无需鉴权 / 无需返回结构
 */

import { initCloud } from './utils'
import { createLogger } from './logger'
import type { CloudBaseDB } from './types'

// =====================================================================
// 类型定义
// =====================================================================

/** 订单类型 */
export type CommissionOrderType = 'order' | 'mall' | 'tuan' | 'activity' | 'boarding' | 'feeding'

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
  boarding?: number
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
  [k: string]: unknown
}

// =====================================================================
// 模块初始化
// =====================================================================

const { db } = initCloud()
const logger = createLogger('commission-utils')

// =====================================================================
// 内部辅助
// =====================================================================

/**
 * 读取系统佣金率配置
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

/**
 * 生成唯一 ID
 */
function generateId(prefix: string, seed: string): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 8)
  return `${prefix}_${timestamp}_${random}_${seed.substring(0, 8)}`
}

// =====================================================================
// 主入口
// =====================================================================

/**
 * 创建佣金记录（best-effort）
 *
 * 调用时机：
 *   - 支付成功后（paymentService / mallService / activityService / feedingService）
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
    if (!order.ownerId) { return }

    // 1. 查询买家
    const buyerData = await loadBuyer(db, order.ownerId)
    if (!buyerData) { return }

    // 2. 查询邀请人
    const inviterId = buyerData.inviterId
    if (!inviterId) { return }

    const inviterData = await loadInviter(db, inviterId)
    if (!inviterData) { return }

    // 3. 读取佣金率：优先合作伙伴自定义配置，fallback 到系统默认
    let rate = 0
    try {
      const adminRes = await db.collection('admins').doc(inviterId).get()
      const admin = adminRes.data
      if (admin && admin.commissionRates && admin.commissionRates[orderType as string] !== undefined) {
        rate = Number(admin.commissionRates[orderType as string])
      }
    } catch (e) {
      logger.warn('loadAdminCommissionRates', { inviterId, msg: (e as Error)?.message })
    }
    if (rate <= 0) {
      const config = await loadCommissionConfig(db)
      rate = Number(config[orderType as string]) || 0
    }
    if (rate <= 0) { return }

    // 4. 计算订单金额 + 佣金金额
    const orderAmount = resolveOrderAmount(order)
    if (orderAmount <= 0) { return }

    const commissionAmount = Math.round((orderAmount * rate / 100) * 100) / 100
    if (commissionAmount <= 0) { return }

    // 5. 幂等检查
    if (await hasExistingCommission(db, order._id, inviterId)) { return }

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
    logger.info('commission_created', { orderType, orderId: order._id, amount: orderAmount, rate, commission: commissionAmount })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : '未知错误'
    logger.error('createCommissionRecord', { msg, orderType, orderId: order?._id })
  }
}

/**
 * 取消佣金记录（best-effort）
 *
 * 调用时机：
 *   - 订单取消/退款时
 *
 * 流程：
 *   1. 查找 tuan_commissions 中 orderId 对应的所有记录
 *   2. 将 status 从 'pending' 更新为 'cancelled'
 *
 * 错误处理：
 *   - 任何异常都被吞掉，仅记录日志
 *   - 不影响主业务（订单取消）的响应
 *
 * @param orderId 订单ID
 * @returns 始终返回 void；失败仅记日志
 */
export async function cancelCommissionRecord(orderId: string): Promise<void> {
  try {
    if (!orderId) { return }

    const result = await db.collection('tuan_commissions')
      .where({ orderId, status: 'pending' })
      .update({
        data: {
          status: 'cancelled',
          cancelledAt: db.serverDate(),
          updatedAt: db.serverDate(),
        },
      })

    logger.info('commission_cancelled', { orderId, updated: result.updated })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : '未知错误'
    logger.error('cancelCommissionRecord', { msg, orderId })
  }
}

export default createCommissionRecord
