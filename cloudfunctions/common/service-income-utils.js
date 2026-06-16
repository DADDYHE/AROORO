/**
 * service-income-utils.js - 服务收入记录工具（编译版本）
 * 
 * 业务功能：
 *   - 记录服务收入（活动收入、寄养收入、上门服务收入）
 *   - 在特定时机（活动结束、订单完成）调用
 * 
 * 与佣金的区别：
 *   - 佣金：推广奖励，记录在 tuan_commissions 表
 *   - 收入：服务报酬，记录在 service_incomes 表
 */

const { initCloud } = require('../common/utils')
const { createLogger } = require('../common/logger')

const { cloud, db } = initCloud()
const logger = createLogger('service-income-utils')

/**
 * 创建服务收入记录
 * 
 * @param {string} providerId 服务提供者ID
 * @param {string} type 收入类型
 * @param {string} orderId 订单ID
 * @param {number} amount 收入金额
 * @param {string} orderNo 订单编号（可选）
 * @param {string} description 收入描述（可选）
 */
async function createServiceIncomeRecord(
  providerId,
  type,
  orderId,
  amount,
  orderNo,
  description
) {
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
    const record = {
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
 * @param {string} activityId 活动ID
 * @param {string} creatorId 活动创建者ID
 */
async function createActivityIncomeRecords(
  activityId,
  creatorId
) {
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

module.exports = {
  createServiceIncomeRecord,
  createActivityIncomeRecords,
}
