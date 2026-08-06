const { err } = require('../common/errors')
const { initCloud, handleSuccess, handleError, ERROR_CODES } = require('../common/utils')
const { createLogger } = require('../common/logger')
// P0-6: 资金事务失败主动告警
const { recordAlert } = require('../common/alert')
// P1 修复：提现申请限流
const { withRateLimit } = require('../common/risk-rate-limit')
// 推广/邀请统计统一口径（板块→权威集合→状态集→金额字段）
const { REFERRAL_BOARDS, resolveOrderAmount, fetchBoardOrders } = require('./referralStats')

const { cloud, db } = initCloud()
const _ = db.command
const logger = createLogger('walletService')

const WALLET_TYPES = ['commission', 'serviceIncome']

async function getWithdrawalList(event, context, auth) {
  // P2 修复：分页参数边界校验（pageSize 上限 100，防拉全表）+ 字段投影（去除 openid 等内部字段）
  const { status } = event
  const page = Math.max(1, Math.floor(Number(event.page) || 1))
  const pageSize = Math.min(100, Math.max(1, Math.floor(Number(event.pageSize) || 20)))
  try {
    const query = {}
    if (status) {query.status = status}
    const countRes = await db.collection('withdrawals').where(query).count()
    const total = countRes.total || 0
    const res = await db.collection('withdrawals')
      .where(query)
      .field({
        _id: true,
        amount: true,
        status: true,
        walletType: true,
        method: true,
        nickName: true,
        createdAt: true,
        updatedAt: true,
        reviewedBy: true,
        reviewedAt: true,
        rejectReason: true,
        transferError: true,
        outTradeNo: true,
        outBatchNo: true,
        transferBatchNo: true,
        transferTime: true,
      })
      .orderBy('createdAt', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get()
    return handleSuccess({ list: res.data || [], total })
  } catch (error) {
    logger.error('getWithdrawalList', error)
    return handleError(error, '获取提现列表失败', ERROR_CODES.DATA)
  }
}

/**
 * H4: 转账成功后的落库结算（提现→completed + 钱包冻结释放/累计提现）
 * 优先使用事务；事务失败时降级为非事务补偿更新（条件更新保证幂等），
 * 避免记录卡死在 processing 状态造成"钱已转出、状态永远无法闭环"的死锁。
 *
 * @param {string} withdrawalId 提现记录 _id
 * @param {object} w 提现记录文档（需含 openid/amount/walletType）
 * @param {object} transferInfo 转账结果（transfer_bill_no/out_bill_no，可来自发起转账或查单接口）
 * @param {string} source 日志/告警来源标识
 * @returns {Promise<{settled: boolean, viaTransaction: boolean}>}
 */
async function settleWithdrawalCompleted(withdrawalId, w, transferInfo, source) {
  const walletType = w.walletType || 'commission'
  // 事务前先查询钱包 _id（CloudBase 事务内不支持 where().get() / where().update()）
  const walletRes = await db.collection('wallets').where({ openid: w.openid, type: walletType }).limit(1).get()
  const walletDoc = walletRes.data && walletRes.data[0]

  const completedData = {
    status: 'completed',
    transferTime: db.serverDate(),
    transferBatchNo: transferInfo.transfer_bill_no || '',
    outBatchNo: transferInfo.out_bill_no || w.outBatchNo || '',
    updatedAt: db.serverDate(),
  }

  // 首选路径：单一事务保证提现状态与钱包数据一致
  const transaction = await db.startTransaction()
  // P3 修复：事务内使用 transaction.command
  const _tx = transaction.command
  try {
    await transaction.collection('withdrawals').doc(withdrawalId).update({ data: completedData })
    if (walletDoc) {
      await transaction.collection('wallets').doc(walletDoc._id).update({
        data: {
          frozenAmount: _tx.inc(-w.amount),
          totalWithdrawn: _tx.inc(w.amount),
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

  // H4 补偿路径：转账已成功、事务失败 → 非事务条件更新落库（where status=processing 保证幂等且防并发重复）
  let withdrawalFixed = false
  let walletFixed = false
  try {
    const upRes = await db.collection('withdrawals')
      .where({ _id: withdrawalId, status: 'processing' })
      .update({ data: { ...completedData, needsReconcile: true } })
    withdrawalFixed = ((upRes && upRes.stats && upRes.stats.updated) || 0) > 0
  } catch (e) {
    logger.error(`${source}.compensate.withdrawal.failed`, { withdrawalId, msg: e?.message })
  }
  if (withdrawalFixed && walletDoc) {
    try {
      // 补偿路径为非事务更新，使用 db.command
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

/**
 * H4: processing 卡死记录对账 —— 通过微信查单接口确认真实转账状态后补偿：
 * - SUCCESS → 结算为 completed（走 settleWithdrawalCompleted）
 * - FAIL/CANCELLED → 条件回退为 approved，可重新发起转账
 * - 中间态（ACCEPTED/PROCESSING/WAIT_USER_CONFIRM/TRANSFERING 等）→ 提示稍后再对账
 */
async function reconcileProcessingWithdrawal(withdrawalId, w) {
  if (!w.outBatchNo) {
    throw err('BUSINESS_ERROR', '该记录缺少商户转账单号，无法自动对账，请人工处理')
  }
  const { queryTransferByOutBillNo } = require('../common/transfer')
  const q = await queryTransferByOutBillNo(w.outBatchNo)
  const state = q.state || ''

  if (state === 'SUCCESS') {
    const r = await settleWithdrawalCompleted(withdrawalId, w, q, 'reconcileWithdrawal')
    if (!r.settled) {
      throw err('DATA_ERROR', '微信转账已成功但状态补偿失败，请人工对账')
    }
    return handleSuccess({ message: '对账完成：微信转账已成功，提现状态已修复为已完成' })
  }

  if (state === 'FAIL' || state === 'CANCELLED' || state === 'CANCELING') {
    // 条件更新防并发：仅当仍为 processing 时回退
    const upRes = await db.collection('withdrawals')
      .where({ _id: withdrawalId, status: 'processing' })
      .update({
        data: {
          status: 'approved',
          transferError: `微信转账状态: ${state}${q.fail_reason ? ` (${q.fail_reason})` : ''}`,
          updatedAt: db.serverDate(),
        },
      })
    const upCount = (upRes && upRes.stats && upRes.stats.updated) || 0
    if (upCount === 0) {
      throw err('BUSINESS_ERROR', '该提现记录状态已被其他操作变更，请刷新后重试')
    }
    return handleSuccess({ message: `对账完成：微信转账${state === 'FAIL' ? '失败' : '已撤销'}，已回退为待重试状态，可重新发起转账` })
  }

  return handleSuccess({ message: `微信转账仍在处理中（${state || '未知状态'}），请稍后再对账`, state })
}

async function approveWithdrawal(event, context, auth) {
  const { withdrawalId } = event
  if (!withdrawalId) {throw err('INVALID_PARAMS', '参数错误')}

  try {
    const wRes = await db.collection('withdrawals').doc(withdrawalId).get()
    if (!wRes.data) {throw err('DATA_ERROR', '数据错误')}
    const w = wRes.data
    if (w.status !== 'pending') {throw err('BUSINESS_ERROR', '状态错误')}

    // H4: 转账前先生成并持久化商户单号，确保 processing 卡死后可按单号对账
    const outBatchNo = `WD_${withdrawalId}_${Date.now()}`

    // P1-D: 条件更新防并发重复转账 — where(status=pending) 原子占位
    const claimRes = await db.collection('withdrawals')
      .where({ _id: withdrawalId, status: 'pending' })
      .update({
        data: {
          status: 'processing',
          outBatchNo,
          reviewedBy: auth.openid,
          reviewedAt: db.serverDate(),
          updatedAt: db.serverDate(),
        },
      })
    const claimCount = (claimRes && claimRes.stats && claimRes.stats.updated) || 0
    if (claimCount === 0) {
      throw err('BUSINESS_ERROR', '该提现申请正在被处理或状态已变更')
    }
    w.outBatchNo = outBatchNo

    let transferResult = null
    let transferError = null
    try {
      const { initiateTransfer } = require('../common/transfer')
      transferResult = await initiateTransfer(w.openid, w.amount, outBatchNo, '提现到零钱')
    } catch (e) {
      logger.error('approveWithdrawal transfer failed', e)
      transferError = e
    }

    if (transferResult) {
      // P0-7 + H4: 事务优先，失败降级补偿，保证提现不卡死在 processing
      await settleWithdrawalCompleted(withdrawalId, w, transferResult, 'approveWithdrawal')

      return handleSuccess({ message: '审核通过，已自动转账到用户微信零钱' })
    } else {
      // H4: 转账调用异常可能是网络超时（状态不明），直接回退 approved 后重试会换新单号造成重复打款。
      // 先按商户单号查单确认微信侧是否已受理，未受理才回退 approved。
      let acceptedByWechat = false
      try {
        const { queryTransferByOutBillNo } = require('../common/transfer')
        const q = await queryTransferByOutBillNo(outBatchNo)
        if (q.state && q.state !== 'FAIL' && q.state !== 'CANCELLED' && q.state !== 'CANCELING') {
          acceptedByWechat = true
          if (q.state === 'SUCCESS') {
            await settleWithdrawalCompleted(withdrawalId, w, q, 'approveWithdrawal')
            return handleSuccess({ message: '审核通过，转账已成功（查单确认）' })
          }
        }
      } catch (_) { /* 查单失败（如单不存在）按未受理处理 */ }

      if (acceptedByWechat) {
        // 微信侧已受理但未终态：保持 processing，由 retryTransfer 对账闭环
        await recordAlert('warning', 'approveWithdrawal.transfer.pending',
          '转账接口返回异常但微信侧已受理，保持 processing 待对账',
          { withdrawalId, outBatchNo, error: transferError?.message })
        return handleSuccess({ message: '转账已受理但结果未知，请稍后通过重试转账入口对账' })
      }

      // 条件回退防并发：仅当仍为 processing 时回退为 approved
      await db.collection('withdrawals')
        .where({ _id: withdrawalId, status: 'processing' })
        .update({
          data: {
            status: 'approved',
            transferError: transferError ? transferError.message : '转账接口调用失败',
            updatedAt: db.serverDate(),
          },
        })

      return handleSuccess({ message: '审核通过，但自动转账失败，请手动打款', transferError: transferError ? transferError.message : '' })
    }
  } catch (error) {
    logger.error('approveWithdrawal', error)
    return handleError(error, '审核提现失败', ERROR_CODES.DATA)
  }
}

async function rejectWithdrawal(event, context, auth) {
  const { withdrawalId, rejectReason } = event
  if (!withdrawalId) {throw err('INVALID_PARAMS', '参数错误')}

  try {
    const wRes = await db.collection('withdrawals').doc(withdrawalId).get()
    if (!wRes.data) {throw err('DATA_ERROR', '数据错误')}
    const w = wRes.data
    if (w.status !== 'pending') {throw err('BUSINESS_ERROR', '状态错误')}

    // P0-7: 提现状态更新→rejected + 钱包 balance/frozenAmount 恢复 纳入单一事务
    // 事务前先查询钱包 _id（CloudBase 事务内不支持 where().get() / where().update()）
    const walletType = w.walletType || 'commission'
    const walletRes = await db.collection('wallets').where({ openid: w.openid, type: walletType }).limit(1).get()
    const walletDoc = walletRes.data && walletRes.data[0]

    const transaction = await db.startTransaction()
    // P3 修复：事务内使用 transaction.command
    const _tx = transaction.command
    try {
      // 1) 更新提现记录状态为 rejected
      await transaction.collection('withdrawals').doc(withdrawalId).update({
        data: {
          status: 'rejected',
          rejectReason: rejectReason || '审核未通过',
          reviewedBy: auth.openid,
          reviewedAt: db.serverDate(),
          updatedAt: db.serverDate(),
        },
      })

      // 2) 钱包 balance 恢复、frozenAmount 递减
      if (walletDoc) {
        await transaction.collection('wallets').doc(walletDoc._id).update({
          data: {
            balance: _tx.inc(w.amount),
            frozenAmount: _tx.inc(-w.amount),
            updatedAt: db.serverDate(),
          },
        })
      }

      await transaction.commit()
    } catch (txError) {
      try { await transaction.rollback() } catch (_) { /* ignore rollback error */ }
      throw txError
    }

    return handleSuccess({ message: '已拒绝提现申请' })
  } catch (error) {
    logger.error('rejectWithdrawal', error)
    return handleError(error, '拒绝提现失败', ERROR_CODES.DATA)
  }
}

async function retryTransfer(event, context, auth) {
  const { withdrawalId } = event
  if (!withdrawalId) { throw err('INVALID_PARAMS', '参数错误') }

  try {
    const wRes = await db.collection('withdrawals').doc(withdrawalId).get()
    if (!wRes.data) { throw err('DATA_ERROR', '数据错误') }
    const w = wRes.data

    // H4: processing 卡死记录 → 查单对账闭环（成功补落库 / 失败回退 approved / 处理中提示等待）
    if (w.status === 'processing') {
      return await reconcileProcessingWithdrawal(withdrawalId, w)
    }

    if (w.status !== 'approved') {
      throw err('BUSINESS_ERROR', '仅审核通过但转账失败、或转账结果待对账的记录可重试')
    }

    // H4: 重试前先生成并持久化商户单号（随占位一起写入），保证异常后可对账
    const outBatchNo = `WD_RETRY_${withdrawalId}_${Date.now()}`

    // P1-D: 条件更新防并发重复转账 — where(status=approved) 原子占位
    const claimRes = await db.collection('withdrawals')
      .where({ _id: withdrawalId, status: 'approved' })
      .update({ data: { status: 'processing', outBatchNo, updatedAt: db.serverDate() } })
    const claimCount = (claimRes && claimRes.stats && claimRes.stats.updated) || 0
    if (claimCount === 0) {
      throw err('BUSINESS_ERROR', '该提现记录正在被处理或状态已变更')
    }
    w.outBatchNo = outBatchNo

    let transferResult = null
    let transferError = null
    try {
      const { initiateTransfer } = require('../common/transfer')
      transferResult = await initiateTransfer(w.openid, w.amount, outBatchNo, '提现到零钱')
    } catch (e) {
      logger.error('retryTransfer transfer failed', e)
      transferError = e
    }

    if (transferResult) {
      // P0-7 + H4: 事务优先，失败降级补偿，保证提现不卡死在 processing
      await settleWithdrawalCompleted(withdrawalId, w, transferResult, 'retryTransfer')

      return handleSuccess({ message: '重试转账成功，已自动转账到用户微信零钱' })
    } else {
      // H4: 与 approveWithdrawal 一致 —— 先查单确认微信侧未受理，才回退 approved，避免重复打款
      let acceptedByWechat = false
      try {
        const { queryTransferByOutBillNo } = require('../common/transfer')
        const q = await queryTransferByOutBillNo(outBatchNo)
        if (q.state && q.state !== 'FAIL' && q.state !== 'CANCELLED' && q.state !== 'CANCELING') {
          acceptedByWechat = true
          if (q.state === 'SUCCESS') {
            await settleWithdrawalCompleted(withdrawalId, w, q, 'retryTransfer')
            return handleSuccess({ message: '重试转账已成功（查单确认）' })
          }
        }
      } catch (_) { /* 查单失败（如单不存在）按未受理处理 */ }

      if (acceptedByWechat) {
        await recordAlert('warning', 'retryTransfer.transfer.pending',
          '重试转账接口返回异常但微信侧已受理，保持 processing 待对账',
          { withdrawalId, outBatchNo, error: transferError?.message })
        return handleSuccess({ message: '转账已受理但结果未知，请稍后再次点击重试进行对账' })
      }

      // 条件回退防并发：仅当仍为 processing 时回退为 approved
      await db.collection('withdrawals')
        .where({ _id: withdrawalId, status: 'processing' })
        .update({
          data: {
            status: 'approved',
            transferError: transferError ? transferError.message : '转账接口调用失败',
            updatedAt: db.serverDate(),
          },
        })

      return handleSuccess({ message: '重试转账失败，请稍后再试', transferError: transferError ? transferError.message : '' })
    }
  } catch (error) {
    logger.error('retryTransfer', error)
    return handleError(error, '重试转账失败', ERROR_CODES.DATA)
  }
}

// Re-export from common for cross-service usage
const { ensureWalletBalance } = require('../common/wallet-utils')

module.exports = {
  getWithdrawalList,
  approveWithdrawal,
  rejectWithdrawal,
  retryTransfer,
  ensureWalletBalance,
}
