/**
 * common/commission-utils.js - 共享佣金记录工具
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

const { initCloud, generateId } = require('./utils')
const { createLogger } = require('./logger')

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
async function loadCommissionConfig() {
  try {
    const configRes = await db.collection('system_config').doc('commission_rates').get()
    return configRes.data || {}
  } catch (e) {
    logger.warn('loadCommissionConfig: 读取 system_config 失败', { msg: e?.message })
    return {}
  }
}

/**
 * 查询买家档案（users._id = openid）
 */
async function loadBuyer(ownerId) {
  try {
    const buyerRes = await db.collection('users').doc(ownerId).get()
    return buyerRes.data || null
  } catch (e) {
    logger.warn('loadBuyer: 查询买家失败', { ownerId, msg: e?.message })
    return null
  }
}

/**
 * 检查邀请人是否为合作伙伴
 */
async function isPartner(inviterId) {
  try {
    const adminRes = await db.collection('admins').doc(inviterId).get()
    const admin = adminRes.data
    return admin && admin.status === 'active' && admin.isPartner
  } catch (e) {
    return false
  }
}

/**
 * 查询邀请人档案
 */
async function loadInviter(inviterId) {
  try {
    const inviterLookup = await db.collection('users').doc(inviterId).get()
    return inviterLookup.data || null
  } catch (e) {
    logger.warn('loadInviter: 查询邀请人失败', { inviterId, msg: e?.message })
    return null
  }
}

/**
 * 计算订单金额（兼容 totalPrice / totalAmount / basicPrice 三种字段）
 */
function resolveOrderAmount(order) {
  return Number(order.totalPrice) || Number(order.totalAmount) || Number(order.basicPrice) || 0
}

/**
 * 检查是否已存在佣金记录（幂等保护）
 */
async function hasExistingCommission(orderId, inviterId) {
  try {
    const existRes = await db.collection('tuan_commissions')
      .where({ orderId, inviterId })
      .count()
    return existRes.total > 0
  } catch (e) {
    logger.warn('hasExistingCommission: 幂等检查失败', { orderId, inviterId, msg: e?.message })
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
 * @param {string} orderType 订单类型
 * @param {object} order 订单文档
 * @returns {Promise<void>} 始终返回 void；失败仅记日志
 */
async function createCommissionRecord(orderType, order) {
  try {
    if (!order.ownerId) { return }

    // 1. 查询买家
    const buyerData = await loadBuyer(order.ownerId)
    if (!buyerData) { return }

    // 2. 查询邀请人
    const inviterId = buyerData.inviterId
    if (!inviterId) { return }

    // 检查邀请人是否为合作伙伴
    if (!(await isPartner(inviterId))) { return }

    const inviterData = await loadInviter(inviterId)
    if (!inviterData) { return }

    // 3. 读取佣金率：优先合作伙伴自定义配置，fallback 到系统默认
    let rate = 0
    try {
      const adminRes = await db.collection('admins').doc(inviterId).get()
      const admin = adminRes.data
      if (admin && admin.commissionRates && admin.commissionRates[orderType] !== undefined) {
        rate = Number(admin.commissionRates[orderType])
      }
    } catch (e) {
      logger.warn('loadAdminCommissionRates', { inviterId, msg: e?.message })
    }
    if (rate <= 0) {
      const config = await loadCommissionConfig()
      rate = Number(config[orderType]) || 0
    }
    if (rate <= 0) { return }

    // 4. 计算订单金额 + 佣金金额
    const orderAmount = resolveOrderAmount(order)
    if (orderAmount <= 0) { return }

    const commissionAmount = Math.round((orderAmount * rate / 100) * 100) / 100
    if (commissionAmount <= 0) { return }

    // 5. 幂等检查
    if (await hasExistingCommission(order._id, inviterId)) { return }

    // 6. 写入佣金记录
    const payload = {
      _id: generateId('commission', order.ownerId),
      inviterId,
      inviterNickName: inviterData.nickName || '',
      ownerId: buyerData._id,
      orderType,
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
  } catch (error) {
    const msg = error instanceof Error ? error.message : '未知错误'
    logger.error('createCommissionRecord', { msg, orderType, orderId: order?._id })
  }
}

module.exports = { createCommissionRecord }
