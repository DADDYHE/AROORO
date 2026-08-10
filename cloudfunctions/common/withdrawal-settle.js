/**
 * withdrawal-settle.js - 提现转账成功后的共享结算逻辑
 *
 * 供 adminService（审批通过 / 重试转账 / 对账）与 partnerService（用户确认收款后）
 * 共用，避免两处重复实现导致结算口径漂移。
 *
 * 语义：仅当微信侧转账已达终态 SUCCESS 时调用。
 *  - 事务内：withdrawals → completed（记录 transferBatchNo/outBatchNo/transferTime）
 *    + wallets.frozenAmount 释放 / totalWithdrawn 累计
 *  - 事务失败降级：条件更新（status=processing 防并发重复结算）补偿，失败则告警待人工对账
 */

const { initCloud } = require('./utils')
const { createLogger } = require('./logger')
const { recordAlert } = require('./alert')

const { db } = initCloud()
const _ = db.command
const logger = createLogger('withdrawal-settle')

/**
 * @param {string} withdrawalId 提现记录 _id
 * @param {object} w 提现记录文档（需含 openid/amount/walletType）
 * @param {object} transferInfo 转账结果（transfer_bill_no/out_bill_no，可来自发起转账或查单接口）
 * @param {string} source 日志/告警来源标识
 * @param {string} [lockStatus='processing'] 补偿路径条件更新的前置状态（auto='processing'，manual='approved'）
 * @param {object} [extraData={}] 额外落库字段（人工打款：transferMethod/payoutChannel/paidAmount/...）
 * @returns {Promise<{settled: boolean, viaTransaction: boolean}>}
 */
async function settleWithdrawalCompleted(withdrawalId, w, transferInfo, source, lockStatus = 'processing', extraData = {}) {
  const walletType = w.walletType || 'commission'
  // 事务前先查询钱包 _id（CloudBase 事务内不支持 where().get() / where().update()）
  const walletRes = await db.collection('wallets').where({ openid: w.openid, type: walletType }).limit(1).get()
  const walletDoc = walletRes.data && walletRes.data[0]

  const completedData = {
    status: 'completed',
    transferTime: db.serverDate(),
    transferBatchNo: transferInfo.transfer_bill_no || '',
    outBatchNo: transferInfo.out_bill_no || w.outBatchNo || '',
    ...extraData,
    updatedAt: db.serverDate(),
  }

  // 首选路径：单一事务保证提现状态与钱包数据一致
  const transaction = await db.startTransaction()
  try {
    await transaction.collection('withdrawals').doc(withdrawalId).update({ data: completedData })
    if (walletDoc) {
      await transaction.collection('wallets').doc(walletDoc._id).update({
        data: {
          frozenAmount: _.inc(-(Number(w.amount) || 0)),
          totalWithdrawn: _.inc(Number(w.amount) || 0),
          updatedAt: db.serverDate(),
        },
      })
    }
    await transaction.commit()
    return { settled: true, viaTransaction: true }
  } catch (txError) {
    try { await transaction.rollback() } catch (_) { /* ignore rollback error */ }
    logger.error(`${source}.transaction.failed`, {
      withdrawalId, openid: w.openid, msg: txError?.message,
    })
  }

  // 补偿路径：转账已成功、事务失败 → 非事务条件更新落库（where status=processing 保证幂等且防并发重复）
  let withdrawalFixed = false
  let walletFixed = false
  try {
    const upRes = await db.collection('withdrawals')
      .where({ _id: withdrawalId, status: lockStatus })
      .update({ data: { ...completedData, needsReconcile: true } })
    withdrawalFixed = ((upRes && upRes.stats && upRes.stats.updated) || 0) > 0
  } catch (e) {
    logger.error(`${source}.compensate.withdrawal.failed`, { withdrawalId, msg: e?.message })
  }
  if (withdrawalFixed && walletDoc) {
    try {
      await db.collection('wallets').doc(walletDoc._id).update({
        data: {
          frozenAmount: _.inc(-w.amount),
          totalWithdrawn: _.inc(w.amount),
          updatedAt: db.serverDate(),
        },
      })
      walletFixed = true
    } catch (e) {
      logger.error(`${source}.compensate.wallet.failed`, { withdrawalId, msg: e?.message })
    }
  }

  await recordAlert(
    'critical',
    `${source}.transaction.failed`,
    withdrawalFixed
      ? '提现转账成功且事务失败，已通过补偿更新落库（needsReconcile），请核对钱包数据'
      : '提现转账已成功但 DB 状态同步与补偿更新均失败，需人工对账',
    {
      withdrawalId,
      openid: w.openid,
      amount: w.amount,
      walletType,
      transferBatchNo: transferInfo.transfer_bill_no || '',
      outBatchNo: transferInfo.out_bill_no || w.outBatchNo || '',
      withdrawalFixed,
      walletFixed,
    }
  )
  return { settled: withdrawalFixed, viaTransaction: false }
}

module.exports = { settleWithdrawalCompleted }
