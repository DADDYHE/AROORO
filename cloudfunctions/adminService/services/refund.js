/**
 * adminService/services/refund.js - 管理员退款服务
 *
 * 功能：
 *   - adminRefund：管理员主动发起微信支付退款（无需订单 owner 校验）
 *   - queryRefund：查询退款单进度
 *
 * 与 paymentService/services/refund.js 的区别：
 *   - paymentService 版本限制只有订单 owner 本人能退款（小程序端用户自助）
 *   - adminService 版本供管理员从后台主动退款（客诉处理、异常订单）
 *   - 由 ACTION_PERMISSIONS 的 super_admin 权限保证安全
 *
 * 依赖：
 *   - common/config.js   → WECHAT_PAY, ENDPOINTS
 *   - common/utils.js    → initCloud, handleSuccess, handleError
 *   - common/errors.js   → err
 *   - common/logger.js   → createLogger
 *   - common/transfer.js → normalizePrivateKey（私钥格式归一化）
 *   （P4-1-5: 佣金/服务收入撤销改为事务内直接 update，不再依赖 commission-utils / service-income-utils）
 */

const https = require('https')
const crypto = require('crypto')

const { WECHAT_PAY, ENDPOINTS } = require('../common/config')
const { err } = require('../common/errors')
const { initCloud, handleSuccess } = require('../common/utils')
const { createLogger } = require('../common/logger')
const { normalizePrivateKey } = require('../common/transfer')
// P0-6: 资金事务失败主动告警
const { recordAlert } = require('../common/alert')
// P0-6: 敏感接口限流
const { withRateLimit } = require('../common/risk-rate-limit')
// P4-1-5: cancelCommissionRecord / cancelServiceIncomeRecord 改为事务内直接 update，
// 不再使用全局 db 的 best-effort 工具函数

const { db } = initCloud()
const _ = db.command
const logger = createLogger('adminService:refund')

/**
 * H5: 退款失败/未受理时，把订单支付状态从 refunding 条件回滚为原状态，
 * 避免订单永久卡死在 refunding（无法再次发起退款）。
 * 条件更新（where paymentStatus=refunding）保证并发安全与幂等。
 */
async function restoreRefundingStatus(orderId, originalPaymentStatus) {
  try {
    await db.collection('orders')
      .where({ _id: orderId, paymentStatus: 'refunding' })
      .update({
        data: {
          paymentStatus: originalPaymentStatus || 'paid',
          updatedAt: db.serverDate(),
        },
      })
  } catch (e) {
    logger.error('adminRefund.restoreStatus.failed', { orderId, msg: e?.message })
    await recordAlert('critical', 'adminRefund.restoreStatus.failed',
      '退款失败后订单状态回滚失败，订单可能卡死在 refunding，需人工修复',
      { orderId, originalPaymentStatus, error: e?.message })
  }
}

// =====================================================================
// 管理员发起退款
// =====================================================================

/**
 * 管理员主动发起微信支付退款
 *
 * @param {string} event.outTradeNo    - 商户订单号（必填）
 * @param {number} event.refundAmount  - 退款金额，单位：元（必填）
 * @param {string} event.reason        - 退款原因（选填，默认"管理员退款"）
 * @returns {Promise<{refundId, outRefundNo, status, channel, userReceivedAccount}>}
 */
async function adminRefund(event, context, auth) {
  const { outTradeNo, refundAmount, reason } = event

  if (!outTradeNo) { throw err('INVALID_PARAMS', '缺少订单号 outTradeNo') }
  if (!refundAmount || refundAmount <= 0) { throw err('INVALID_PARAMS', '退款金额异常') }

  // P0-6: 管理员退款限流（防止管理员账号泄露后无限速退款）
  await withRateLimit(
    { userId: auth.openid, type: 'admin_refund', targetId: outTradeNo },
    async () => null
  )

  // 查询订单（不校验 owner，管理员操作）
  const orderRes = await db.collection('orders')
    .where({ outTradeNo })
    .limit(1)
    .get()

  const orderList = (orderRes && orderRes.data) || []
  if (orderList.length === 0) {
    throw err('NOT_FOUND', '订单不存在')
  }

  const orderDoc = orderList[0]

  // 幂等保护：已退款订单拒绝重复退款
  if (orderDoc.paymentStatus === 'refunded' || orderDoc.status === 'refunded') {
    throw err('BUSINESS_ERROR', '该订单已退款，请勿重复操作')
  }

  // 校验订单支付状态
  if (orderDoc.paymentStatus !== 'paid' && orderDoc.paymentStatus !== 'completed') {
    throw err('BUSINESS_ERROR', `订单支付状态异常（${orderDoc.paymentStatus || '未知'}），无法退款`)
  }

  // 金额校验：退款金额（分）不得超过实际支付金额（分）
  const actualTotalYuan = Number(orderDoc.paidAmount || orderDoc.totalPrice || orderDoc.totalAmount || orderDoc.finalAmount || 0)
  if (actualTotalYuan <= 0) {
    throw err('BUSINESS_ERROR', '订单实际支付金额为 0，无法退款')
  }
  const refundAmountFen = Math.round(Number(refundAmount) * 100)
  const totalAmountFen = Math.round(actualTotalYuan * 100)
  if (refundAmountFen > totalAmountFen) {
    throw err('INVALID_PARAMS', `退款金额（¥${Number(refundAmount).toFixed(2)}）不能超过订单支付金额（¥${actualTotalYuan.toFixed(2)}）`)
  }

  // P1-E: 条件更新防并发重复退款 — 将 paymentStatus 从 paid/completed 改为 refunding
  // 两个管理员同时点击退款时，只有第一个能通过，第二个被拦截
  const validStatuses = _.in(['paid', 'completed'])
  const claimRes = await db.collection('orders')
    .where({ _id: orderDoc._id, paymentStatus: validStatuses })
    .update({ data: { paymentStatus: 'refunding', updatedAt: db.serverDate() } })
  const claimCount = (claimRes && claimRes.stats && claimRes.stats.updated) || 0
  if (claimCount === 0) {
    throw err('BUSINESS_ERROR', '该订单正在被退款处理或状态已变更，请勿重复操作')
  }

  // 调用微信支付退款 API
  const config = WECHAT_PAY
  if (!config.mchId || !config.privateKey) {
    throw err('BUSINESS_ERROR', '微信支付未配置')
  }

  const outRefundNo = `REFUND_${Date.now()}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`
  const requestBody = {
    out_trade_no: outTradeNo,
    out_refund_no: outRefundNo,
    reason: reason || '管理员退款',
    amount: {
      refund: refundAmountFen,
      total: totalAmountFen,
      currency: 'CNY',
    },
  }

  logger.info('adminRefund', {
    outTradeNo, outRefundNo,
    refundAmount: refundAmountFen,
    totalAmount: totalAmountFen,
    operator: auth?.openid,
  })

  // H5: 记录占位前的原始支付状态，退款失败时用于条件回滚，避免订单永久卡死在 refunding
  const originalPaymentStatus = orderDoc.paymentStatus

  let refundResult = null
  try {
    refundResult = await callWechatRefundApi(requestBody)
  } catch (apiError) {
    // H5: 调用异常可能是网络超时（微信侧可能已受理），先按退款单号查单确认
    let accepted = false
    try {
      const q = await callWechatRefundQueryApi(`/v3/refund/domestic/refunds/out-refund-no/${outRefundNo}`)
      if (q && (q.status === 'SUCCESS' || q.status === 'PROCESSING')) {
        accepted = true
        refundResult = q
      }
    } catch (_) { /* 查无此退款单 → 微信侧未受理 */ }
    if (!accepted) {
      await restoreRefundingStatus(orderDoc._id, originalPaymentStatus)
      throw err('BUSINESS_ERROR', `微信退款调用失败：${apiError?.message || '未知错误'}`)
    }
    logger.warn('adminRefund.api.timeout_but_accepted', { outTradeNo, outRefundNo })
  }

  if (refundResult && refundResult.status === 'FAIL') {
    // H5: 微信明确退款失败 → 条件回滚订单状态，允许后续重新发起退款
    await restoreRefundingStatus(orderDoc._id, originalPaymentStatus)
    throw err('BUSINESS_ERROR', `微信退款失败：${refundResult.message || '未知原因'}`)
  }

  // P4-1-5: 退款成功后，订单状态 + 业务表同步 + 佣金撤销 + 服务收入撤销 + 库存回退 必须原子完成
  // 旧实现五个独立 try/catch 块，任一步失败留下中间状态（订单已退款但佣金未取消、库存未回退等）。
  // 新实现：事务前查询 _id 列表（CloudBase 事务内不支持 where().update()），
  // 然后在单一事务内逐个 doc(id).update()，任一失败整体回滚。
  // 注意：微信退款已实际发生无法回滚，事务失败时记录告警日志供人工对账。
  if (orderDoc._id) {
    const orderType = orderDoc.orderType || outTradeNo.split('_')[0].toLowerCase()

    // 事务前：查询所有需要在事务内更新的文档 _id 列表
    let commissionIds = []
    let serviceIncomeIds = []
    let registrationIds = []
    // H6: settled 佣金冲销所需数据（记录 + 邀请人钱包 _id）
    let settledCommissions = []
    const commissionWalletIdByOpenid = {}

    try {
      const commissionRes = await db.collection('commissions')
        .where({ orderId: orderDoc._id, status: 'pending' })
        .field({ _id: true })
        .limit(100)
        .get()
      commissionIds = ((commissionRes && commissionRes.data) || []).map((c) => c._id)
    } catch (e) {
      logger.warn('adminRefund.queryCommissions.failed', { orderId: orderDoc._id, msg: e?.message })
    }

    // H6: 查询已结算（settled）佣金 —— 退款时需冲销（status→reversed + 钱包反向扣减），
    // 旧实现只取消 pending 佣金，settled 佣金在退款后仍留在邀请人钱包，形成资金漏洞。
    try {
      const settledRes = await db.collection('commissions')
        .where({ orderId: orderDoc._id, status: 'settled' })
        .field({ _id: true, inviterId: true, commissionAmount: true })
        .limit(100)
        .get()
      settledCommissions = (settledRes && settledRes.data) || []
      // 预查询邀请人 commission 钱包 _id（CloudBase 事务内不支持 where().update()）
      const inviterIds = [...new Set(settledCommissions.map((c) => c.inviterId).filter(Boolean))]
      for (const inviterId of inviterIds) {
        const wRes = await db.collection('wallets')
          .where({ openid: inviterId, type: 'commission' })
          .field({ _id: true, balance: true })
          .limit(1)
          .get()
        const wDoc = wRes.data && wRes.data[0]
        if (wDoc) { commissionWalletIdByOpenid[inviterId] = wDoc }
      }
    } catch (e) {
      logger.warn('adminRefund.querySettledCommissions.failed', { orderId: orderDoc._id, msg: e?.message })
    }

    // 服务收入记录：boarding/feeding/activity 三种类型
    const typeMap = { boarding: 'boarding', feeding: 'feeding', activity: 'activity' }
    const serviceIncomeType = typeMap[orderType]
    if (serviceIncomeType) {
      try {
        const incomeRes = await db.collection('service_incomes')
          .where({ orderId: orderDoc._id, type: serviceIncomeType, status: 'completed' })
          .field({ _id: true })
          .limit(10)
          .get()
        serviceIncomeIds = ((incomeRes && incomeRes.data) || []).map((r) => r._id)
      } catch (e) {
        logger.warn('adminRefund.queryServiceIncomes.failed', { orderId: orderDoc._id, msg: e?.message })
      }
    }

    if (orderType === 'activity' && orderDoc.activityId && orderDoc.ownerId) {
      try {
        const regRes = await db.collection('activity_registrations')
          .where({ activityId: orderDoc.activityId, ownerId: orderDoc.ownerId })
          .field({ _id: true })
          .limit(10)
          .get()
        registrationIds = ((regRes && regRes.data) || []).map((r) => r._id)
      } catch (e) {
        logger.warn('adminRefund.queryRegistrations.failed', { orderId: orderDoc._id, msg: e?.message })
      }
    }

    // 商城订单库存回退：事务前读取 product 数据（事务外读取，事务内 update）
    // 背景：mallService.cancelOrder 对已支付订单不再回退库存（P1-5 修复），
    //       库存回退改由退款流程在资金实际返还后执行，避免"已收款但库存被还原"的不一致。
    let mallProductId = null
    let mallStockUpdateData = null
    const isMallOrder = orderDoc.orderType === 'mall' || (!orderDoc.type && !orderDoc.orderType && orderDoc.productId)
    if (isMallOrder && orderDoc.productId) {
      mallProductId = orderDoc.productId
      const qty = Number(orderDoc.quantity) || 1
      mallStockUpdateData = {
        totalStock: _.inc(qty),
        soldCount: _.inc(-qty),
        stock: _.inc(qty),
        updatedAt: db.serverDate(),
      }
      // SKU 维度回退
      if (orderDoc.skuId) {
        try {
          const productRes = await db.collection('products').doc(orderDoc.productId).get()
          const productData = productRes && productRes.data
          if (productData && Array.isArray(productData.skus)) {
            const skuIndex = productData.skus.findIndex((s) => s && s.skuId === orderDoc.skuId)
            if (skuIndex >= 0) {
              mallStockUpdateData[`skus.${skuIndex}.stock`] = _.inc(qty)
              mallStockUpdateData[`skus.${skuIndex}.soldCount`] = _.inc(-qty)
            }
          }
        } catch (e) {
          logger.warn('adminRefund.queryProduct.failed', { orderId: orderDoc._id, msg: e?.message })
        }
      }
    }

    const transaction = await db.startTransaction()
    try {
      // 1) 更新订单状态
      await transaction.collection('orders').doc(orderDoc._id).update({
        data: {
          status: 'refunded',
          paymentStatus: 'refunded',
          refundAmount: Number(refundAmount),
          refundedAt: db.serverDate(),
          updatedAt: db.serverDate(),
        },
      })

      // 2) 同步业务表状态
      if (orderType === 'tuan' && orderDoc.tuanOrderId) {
        await transaction.collection('tuan_orders').doc(orderDoc.tuanOrderId).update({
          data: { status: 'refunded', paymentStatus: 'refunded', updatedAt: db.serverDate() },
        })
      }
      if (orderType === 'feeding') {
        await transaction.collection('feedingOrders').doc(orderDoc._id).update({
          data: { status: 'refunded', paymentStatus: 'refunded', updatedAt: db.serverDate() },
        })
      }
      for (const rid of registrationIds) {
        await transaction.collection('activity_registrations').doc(rid).update({
          data: { status: 'refunded', updatedAt: db.serverDate() },
        })
      }

      // 3) 取消佣金记录（pending → cancelled）
      for (const cid of commissionIds) {
        await transaction.collection('commissions').doc(cid).update({
          data: { status: 'cancelled', cancelledAt: db.serverDate(), updatedAt: db.serverDate() },
        })
      }

      // 3.5) H6: 冲销已结算佣金（settled → reversed + 邀请人钱包反向扣减）
      for (const comm of settledCommissions) {
        await transaction.collection('commissions').doc(comm._id).update({
          data: { status: 'reversed', reversedAt: db.serverDate(), reversedReason: 'order_refunded', updatedAt: db.serverDate() },
        })
        const amount = Number(comm.commissionAmount) || 0
        const walletDoc = comm.inviterId && commissionWalletIdByOpenid[comm.inviterId]
        if (amount > 0 && walletDoc) {
          await transaction.collection('wallets').doc(walletDoc._id).update({
            data: {
              balance: _.inc(-amount),
              totalIncome: _.inc(-amount),
              updatedAt: db.serverDate(),
            },
          })
        }
      }

      // 4) 取消服务收入记录
      for (const sid of serviceIncomeIds) {
        await transaction.collection('service_incomes').doc(sid).update({
          data: { status: 'cancelled', cancelledAt: db.serverDate(), updatedAt: db.serverDate() },
        })
      }

      // 5) 商城订单回退库存
      if (mallProductId && mallStockUpdateData) {
        await transaction.collection('products').doc(mallProductId).update({ data: mallStockUpdateData })
      }

      await transaction.commit()
      logger.info('adminRefund.transaction.success', {
        orderId: orderDoc._id,
        orderType,
        commissionCount: commissionIds.length,
        settledReversedCount: settledCommissions.length,
        serviceIncomeCount: serviceIncomeIds.length,
        registrationCount: registrationIds.length,
        mallStockRestored: !!mallProductId,
      })

      // H6: 已结算佣金存在但邀请人钱包缺失 → 记录已置 reversed 但资金无法扣回，需告警人工处理
      const missingWalletComms = settledCommissions.filter(
        (c) => Number(c.commissionAmount) > 0 && c.inviterId && !commissionWalletIdByOpenid[c.inviterId]
      )
      if (missingWalletComms.length > 0) {
        await recordAlert('critical', 'adminRefund.reverseCommission.walletMissing',
          '退款冲销已结算佣金时未找到邀请人钱包，佣金记录已置 reversed 但资金未扣回，需人工处理',
          {
            orderId: orderDoc._id,
            outTradeNo,
            commissions: missingWalletComms.map((c) => ({
              commissionId: c._id, inviterId: c.inviterId, amount: c.commissionAmount,
            })),
          })
      }
    } catch (txError) {
      try { await transaction.rollback() } catch (_) { /* ignore rollback error */ }
      // 退款资金已实际发生，DB 同步失败需告警人工对账
      logger.error('adminRefund.transaction.failed', {
        orderId: orderDoc._id,
        orderType,
        msg: txError?.message,
        alert: '管理员退款已成功但 DB 状态同步失败，需人工对账',
      })

      // H5: 补偿更新 —— 微信退款已实际成功，订单不能卡死在 refunding（否则永远无法再操作）。
      // 非事务条件更新订单为 refunded + needsReconcile 标记，业务表/佣金/库存由人工按告警对账。
      let orderCompensated = false
      try {
        const compRes = await db.collection('orders')
          .where({ _id: orderDoc._id, paymentStatus: 'refunding' })
          .update({
            data: {
              status: 'refunded',
              paymentStatus: 'refunded',
              refundAmount: Number(refundAmount),
              refundedAt: db.serverDate(),
              needsReconcile: true,
              updatedAt: db.serverDate(),
            },
          })
        orderCompensated = ((compRes && compRes.stats && compRes.stats.updated) || 0) > 0
      } catch (compError) {
        logger.error('adminRefund.compensate.failed', { orderId: orderDoc._id, msg: compError?.message })
      }

      // P0-6: 持久化告警，供运维主动查询对账
      await recordAlert(
        'critical',
        'adminRefund.transaction.failed',
        orderCompensated
          ? '管理员退款成功且事务失败，订单已补偿为 refunded（needsReconcile），佣金/业务表/库存需人工对账'
          : '管理员退款已成功但 DB 状态同步与补偿更新均失败，需人工对账',
        {
          orderId: orderDoc._id,
          orderType,
          outTradeNo,
          outRefundNo,
          refundAmount: Number(refundAmount),
          settledCommissionCount: settledCommissions.length,
          orderCompensated,
          error: txError?.message,
        }
      )
    }
  }

  return handleSuccess({
    refundId: refundResult.refund_id,
    outRefundNo,
    status: refundResult.status,
    channel: refundResult.channel,
    userReceivedAccount: refundResult.user_received_account,
  })
}

// =====================================================================
// 查询退款状态
// =====================================================================

/**
 * 查询退款单进度
 *
 * @param {string} event.outRefundNo - 商户退款单号（必填）
 */
async function queryRefund(event, context, auth) {
  const { outRefundNo } = event
  if (!outRefundNo) { throw err('INVALID_PARAMS', '缺少退款单号 outRefundNo') }

  const config = WECHAT_PAY
  if (!config.mchId || !config.privateKey) {
    throw err('BUSINESS_ERROR', '微信支付未配置')
  }

  const path = `/v3/refund/domestic/refunds/out-refund-no/${outRefundNo}`
  const result = await callWechatRefundQueryApi(path)

  return handleSuccess(result)
}

// =====================================================================
// 内部辅助：微信支付 API 调用
// =====================================================================

/**
 * 生成 APIv3 签名
 */
function signRequest(method, url, timestamp, nonceStr, body, privateKeyPem) {
  const signStr = [method, url, timestamp, nonceStr, body, ''].join('\n')
  const normalizedKey = normalizePrivateKey(privateKeyPem)
  const sign = crypto.createSign('RSA-SHA256')
  sign.update(signStr, 'utf8')
  sign.end()
  return sign.sign(normalizedKey, 'base64')
}

/**
 * 构建 Authorization 头
 */
function buildAuthorization(mchId, nonceStr, timestamp, serialNo, signature) {
  return [
    'WECHATPAY2-SHA256-RSA2048',
    `mchid="${mchId}"`,
    `nonce_str="${nonceStr}"`,
    `timestamp="${timestamp}"`,
    `serial_no="${serialNo}"`,
    `signature="${signature}"`,
  ].join(',')
}

/**
 * 随机字符串
 */
function randomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

/**
 * 调用微信支付退款 API
 * POST /v3/refund/domestic/refunds
 */
function callWechatRefundApi(requestBody) {
  return new Promise((resolve, reject) => {
    const { mchId, serialNo, privateKey } = WECHAT_PAY
    const bodyStr = JSON.stringify(requestBody)
    const url = ENDPOINTS.WECHAT_PAY_REFUND || '/v3/refund/domestic/refunds'
    const timestamp = Math.floor(Date.now() / 1000).toString()
    const nonceStr = randomString(16)

    const signature = signRequest('POST', url, timestamp, nonceStr, bodyStr, privateKey)
    const authorization = buildAuthorization(mchId, nonceStr, timestamp, serialNo, signature)

    const apiBase = ENDPOINTS.WECHAT_PAY_API_BASE || 'https://api.mch.weixin.qq.com'
    const fullUrl = `${apiBase}${url}`
    const u = new URL(fullUrl)
    const payload = Buffer.from(bodyStr, 'utf8')

    const req = https.request({
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: 'POST',
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Accept': 'application/json',
        'Authorization': authorization,
        'Content-Length': payload.length,
      },
    }, (res) => {
      let buf = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => { buf += chunk })
      res.on('end', () => {
        try {
          if (!buf) {
            reject(new Error(`微信API返回空响应(${res.statusCode})`))
            return
          }
          const data = JSON.parse(buf)
          if (res.statusCode >= 400) {
            const errMsg = data.message || data.detail || `HTTP ${res.statusCode}`
            reject(new Error(`微信退款API错误(${res.statusCode}): ${errMsg}`))
          } else {
            resolve(data)
          }
        } catch (e) {
          reject(new Error(`微信API返回非JSON: ${buf.slice(0, 200)}`))
        }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(new Error('微信API请求超时')) })
    req.write(payload)
    req.end()
  })
}

/**
 * 查询微信退款状态
 * GET /v3/refund/domestic/refunds/out-refund-no/{outRefundNo}
 */
function callWechatRefundQueryApi(path) {
  return new Promise((resolve, reject) => {
    const { mchId, serialNo, privateKey } = WECHAT_PAY
    const timestamp = Math.floor(Date.now() / 1000).toString()
    const nonceStr = randomString(16)

    const signature = signRequest('GET', path, timestamp, nonceStr, '', privateKey)
    const authorization = buildAuthorization(mchId, nonceStr, timestamp, serialNo, signature)

    const apiBase = ENDPOINTS.WECHAT_PAY_API_BASE || 'https://api.mch.weixin.qq.com'
    const fullUrl = `${apiBase}${path}`
    const u = new URL(fullUrl)

    const req = https.request({
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: 'GET',
      timeout: 10000,
      headers: {
        'Accept': 'application/json',
        'Authorization': authorization,
      },
    }, (res) => {
      let buf = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => { buf += chunk })
      res.on('end', () => {
        try {
          if (!buf) {
            reject(new Error(`微信API返回空响应(${res.statusCode})`))
            return
          }
          const data = JSON.parse(buf)
          if (res.statusCode >= 400) {
            const errMsg = data.message || data.detail || `HTTP ${res.statusCode}`
            reject(new Error(`微信退款查询API错误(${res.statusCode}): ${errMsg}`))
          } else {
            resolve(data)
          }
        } catch (e) {
          reject(new Error(`微信API返回非JSON: ${buf.slice(0, 200)}`))
        }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(new Error('微信API请求超时')) })
    req.end()
  })
}

module.exports = {
  adminRefund,
  queryRefund,
}
