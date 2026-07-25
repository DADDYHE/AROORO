/**
 * service-income-utils.ts - 服务收入记录工具
 * 
 * 业务功能：
 *   - 记录服务收入（活动收入、寄养收入、上门服务收入）
 *   - 在特定时机（活动结束、订单完成）调用
 * 
 * 与佣金的区别：
 *   - 佣金：推广奖励，记录在 commissions 表
 *   - 收入：服务报酬，记录在 service_incomes 表
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { initCloud } = require('../common/utils')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createLogger } = require('../common/logger')

const { cloud, db } = initCloud()
const _ = db.command
const logger = createLogger('service-income-utils')

// =====================================================================
// 类型定义
// =====================================================================

export type ServiceIncomeType = 'activity' | 'boarding' | 'feeding'

export interface ServiceIncomeRecord {
  _id?: string
  providerId: string          // 服务提供者ID
  type: ServiceIncomeType     // 收入类型
  orderId: string             // 关联订单ID
  orderNo?: string            // 订单编号
  amount: number              // 收入金额
  status: 'pending' | 'completed' | 'cancelled'  // 收入状态
  description?: string        // 收入描述
  createdAt?: Date
  updatedAt?: Date
  settledAt?: Date            // 结算时间
  cancelledAt?: Date          // 取消时间
}

// =====================================================================
// 主入口
// =====================================================================

/**
 * 创建服务收入记录
 * 
 * @param providerId 服务提供者ID
 * @param type 收入类型
 * @param orderId 订单ID
 * @param amount 收入金额
 * @param orderNo 订单编号（可选）
 * @param description 收入描述（可选）
 */
export async function createServiceIncomeRecord(
  providerId: string,
  type: ServiceIncomeType,
  orderId: string,
  amount: number,
  orderNo?: string,
  description?: string
): Promise<void> {
  try {
    if (!providerId || !orderId || amount <= 0) {
      logger.warn('createServiceIncomeRecord: invalid params', { providerId, type, orderId, amount })
      return
    }

    // 检查是否已存在收入记录（幂等性）
    const existingRes = await db.collection('service_incomes')
      .where({ providerId, orderId, type })
      .count()
    
    if (existingRes.total > 0) {
      logger.info('createServiceIncomeRecord: already exists', { providerId, orderId, type })
      return
    }

    // 创建收入记录
    const record: ServiceIncomeRecord = {
      providerId,
      type,
      orderId,
      orderNo: orderNo || '',
      amount,
      status: 'completed',  // 收入直接标记为已完成
      description: description || `${type}收入`,
      createdAt: db.serverDate(),
      updatedAt: db.serverDate(),
      settledAt: db.serverDate(),
    }

    await db.collection('service_incomes').add({ data: record })

    // P0-1: 服务收入入账钱包（原子增 balance/totalIncome，幂等：已有记录则跳过）
    try {
      const { ensureWalletBalance } = require('./wallet-utils')
      await ensureWalletBalance(providerId, amount, 'serviceIncome')
    } catch (walletErr) {
      logger.error('createServiceIncomeRecord: wallet update failed', {
        providerId, type, orderId, amount,
        error: walletErr instanceof Error ? walletErr.message : String(walletErr)
      })
      // 钱包更新失败不回滚收入记录（已创建），通过告警补偿
      const { recordAlert } = require('./alert')
      await recordAlert('critical', 'service.income.wallet.failed', '服务收入入账钱包失败', {
        providerId, type, orderId, amount
      })
    }

    logger.info('createServiceIncomeRecord: success', {
      providerId,
      type,
      orderId,
      amount
    })
  } catch (error) {
    logger.error('createServiceIncomeRecord: error', { 
      providerId, 
      type, 
      orderId, 
      error: error instanceof Error ? error.message : String(error) 
    })
  }
}

/**
 * 批量创建活动收入记录
 * 在活动结束时调用，为活动创建者记录所有报名订单的收入
 * 
 * @param activityId 活动ID
 * @param creatorId 活动创建者ID
 */
export async function createActivityIncomeRecords(
  activityId: string,
  creatorId: string
): Promise<void> {
  try {
    if (!activityId || !creatorId) {
      logger.warn('createActivityIncomeRecords: invalid params', { activityId, creatorId })
      return
    }

    // 查询该活动的所有已支付订单
    const ordersRes = await db.collection('orders')
      .where({
        activityId,
        orderType: 'activity',
        paymentStatus: 'paid',
      })
      .get()

    if (!ordersRes.data || ordersRes.data.length === 0) {
      logger.info('createActivityIncomeRecords: no orders found', { activityId })
      return
    }

    // 为每个订单创建收入记录
    for (const order of ordersRes.data) {
      const amount = Number(order.totalPrice) || 0
      if (amount > 0) {
        await createServiceIncomeRecord(
          creatorId,
          'activity',
          order._id,
          amount,
          order.orderNo || '',
          `活动收入-${order.activityTitle || '活动'}`
        )
      }
    }

    logger.info('createActivityIncomeRecords: success', {
      activityId,
      creatorId,
      orderCount: ordersRes.data.length
    })
  } catch (error) {
    logger.error('createActivityIncomeRecords: error', {
      activityId,
      creatorId,
      error: error instanceof Error ? error.message : String(error)
    })
  }
}

/**
 * 取消服务收入记录
 *
 * 调用时机：
 *   - 取消活动订单/报名时（type='activity'）
 *   - 取消寄养订单时（type='boarding'）
 *   - 取消喂养订单时（type='feeding'）
 *
 * 行为：
 *   - 将匹配的 service_incomes 记录 status 更新为 'cancelled'
 *   - best-effort：异常被吞掉，仅记日志
 *
 * @param orderId 订单ID
 * @param type 收入类型
 * @returns 始终返回 void；失败仅记日志
 */
export async function cancelServiceIncomeRecord(
  orderId: string,
  type: ServiceIncomeType
): Promise<void> {
  try {
    if (!orderId || !type) {
      logger.warn('cancelServiceIncomeRecord: invalid params', { orderId, type })
      return
    }

    const result = await db.collection('service_incomes')
      .where({ orderId, type, status: _.in(['pending', 'completed']) })
      .update({
        data: {
          status: 'cancelled',
          cancelledAt: db.serverDate(),
          updatedAt: db.serverDate(),
        },
      })

    logger.info('cancelServiceIncomeRecord: success', {
      orderId,
      type,
      updated: result.updated,
    })
  } catch (error) {
    logger.error('cancelServiceIncomeRecord: error', {
      orderId,
      type,
      error: error instanceof Error ? error.message : String(error)
    })
  }
}

// =====================================================================
// Runtime shim: CommonJS 兼容
// =====================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _mod = module as { exports: Record<string, unknown> }
_mod.exports = {
  createServiceIncomeRecord,
  createActivityIncomeRecords,
  cancelServiceIncomeRecord,
}
_mod.exports.default = _mod.exports

export default {
  createServiceIncomeRecord,
  createActivityIncomeRecords,
  cancelServiceIncomeRecord,
}

// 避免 unused 警告
void cloud
