const { err } = require('../common/errors')
const { initCloud, handleSuccess, handleError, ERROR_CODES } = require('../common/utils')
const { createLogger } = require('../common/logger')
// P0-6: 资金事务失败主动告警
const { recordAlert } = require('../common/alert')
// P1 修复：提现申请限流
const { withRateLimit } = require('../common/risk-rate-limit')
// 推广/邀请统计统一口径（板块→权威集合→状态集→金额字段）
const { REFERRAL_BOARDS, resolveOrderAmount, fetchBoardOrders } = require('./referralStats')
// P0: 提现成功结算统一走共享模块（与 partnerService 确认收款后结算共用同一口径）
const { settleWithdrawalCompleted } = require('../common/withdrawal-settle')
// v5.1：收款账号工具（渠道白名单 / 校验 / 脱敏快照）
const { PAYOUT_CHANNELS, hasPayeeChannel, maskPayee } = require('../common/payee-utils')
// v5.1：操作审计（best-effort）
const { writeOperationLog } = require('../common/operation-log')

const { cloud, db } = initCloud()
const _ = db.command
const logger = createLogger('walletService')

const WALLET_TYPES = ['commission', 'serviceIncome']

/**
 * 生成微信商家转账商户单号（out_bill_no）：
 * 微信要求 ≤32 字符、字母/数字/下划线；这里用 前缀+13位时间戳+6位随机数（约 21-22 字符），
 * 同毫秒并发碰撞概率 1/1000000，且每次重试都会生成新单号（微信侧单号唯一）。
 */
function buildOutBatchNo(prefix) {
  return `${prefix}${Date.now()}${String(Math.floor(Math.random() * 1000000)).padStart(6, '0')}`
}

/**
 * 自动打款总开关（预留接口）：
 *  - 默认开启（未配置或值为 1/true/on 时走自动转账）；
 *  - 配置 WECHAT_TRANSFER_AUTO_ENABLED=0/false/off 时，审批通过仅置为 approved（待人工打款），
 *    不再调用微信转账，由人工打款流程接管（状态/冻结金额保持不变）。
 */
function isAutoTransferEnabled() {
  const v = String(process.env.WECHAT_TRANSFER_AUTO_ENABLED || '').trim().toLowerCase()
  return !(v === '0' || v === 'false' || v === 'off' || v === 'no')
}

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
        // 后台列表需展示申请人兜底（web-admin 读取 row.openid）
        openid: true,
        amount: true,
        status: true,
        // v5.1：模式/渠道/人工打款信息（只出脱敏，不出完整账号）
        mode: true,
        method: true,
        payeeSnapshot: true,
        payoutChannel: true,
        paidAmount: true,
        amountDiff: true,
        manualPaidBy: true,
        manualPaidAt: true,
        payEvidence: true,
        manualNote: true,
        paidToSnapshot: true,
        cancelReason: true,
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
  const { withdrawalId, mode = 'auto' } = event
  if (!withdrawalId) {throw err('INVALID_PARAMS', '参数错误')}

  try {
    const wRes = await db.collection('withdrawals').doc(withdrawalId).get()
    if (!wRes.data) {throw err('DATA_ERROR', '数据错误')}
    const w = wRes.data
    if (w.status !== 'pending') {throw err('BUSINESS_ERROR', '状态错误')}

    // v5.1：管理员每单显式二选一；mode='manual' 走人工打款分支（不调 transfer.js）
    if (mode === 'manual') {
      // 校验用户所选渠道已预留账号（人工打款前置）
      const channel = PAYOUT_CHANNELS.includes(w.method) ? w.method : 'wechat'
      const userRes = await db.collection('users').doc(w.openid).get()
      const payee = (userRes.data && userRes.data.payee) || {}
      if (!hasPayeeChannel(payee, channel)) {
        throw err('BUSINESS_ERROR', '用户未预留所选收款方式的账号，无法人工打款')
      }
      const snapshot = maskPayee(payee, channel)
      const manualClaim = await db.collection('withdrawals')
        .where({ _id: withdrawalId, status: 'pending' })
        .update({
          data: {
            status: 'approved',
            mode: 'manual',
            payeeSnapshot: snapshot || {},
            manualPayoutRequired: true,
            reviewedBy: auth.openid,
            reviewedAt: db.serverDate(),
            transferError: '',
            updatedAt: db.serverDate(),
          },
        })
      const manualCount = (manualClaim && manualClaim.stats && manualClaim.stats.updated) || 0
      if (manualCount === 0) {
        throw err('BUSINESS_ERROR', '该提现申请正在被处理或状态已变更')
      }
      writeOperationLog({
        module: 'withdrawal',
        action: 'approve_manual',
        targetId: withdrawalId,
        operatorId: auth.openid,
        afterData: { status: 'approved', mode: 'manual', channel },
      })
      return handleSuccess({ message: '审核通过，已进入人工打款队列（待管理员打款）' })
    }

    // —— 自动打款分支（行为与 v3 前一致，仅新增渠道与总闸前置校验） ——
    // 渠道约束：仅微信收款方式支持自动打款
    if ((w.method || 'wechat') !== 'wechat') {
      throw err('BUSINESS_ERROR', '仅微信收款方式支持自动打款，请选择人工打款')
    }
    // 运维总闸：关闭时不允许自动打款
    if (!isAutoTransferEnabled()) {
      throw err('BUSINESS_ERROR', '自动转账已关闭，请选择人工打款')
    }

    // H4: 转账前先生成并持久化商户单号，确保 processing 卡死后可按单号对账
    const outBatchNo = buildOutBatchNo('WD')

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
      const transferState = transferResult.state || ''
      // P0 修复：新版商家转账为“用户确认收款”模式——只有微信侧终态 SUCCESS 才能结算。
      // 创建成功（WAIT_USER_CONFIRM/ACCEPTED/PROCESSING 等非终态）仅持久化单据信息并保持
      // processing，等待用户在小程序确认收款后由 confirmWithdrawal / 后台对账闭环。
      if (transferState === 'SUCCESS') {
        await settleWithdrawalCompleted(withdrawalId, w, transferResult, 'approveWithdrawal')
        return handleSuccess({ message: '审核通过，转账已到账' })
      }

      await db.collection('withdrawals').doc(withdrawalId).update({
        data: {
          packageInfo: transferResult.package_info || '',
          transferBatchNo: transferResult.transfer_bill_no || '',
          outBatchNo: transferResult.out_bill_no || w.outBatchNo || '',
          transferState,
          updatedAt: db.serverDate(),
        },
      })
      await recordAlert(
        'warning',
        'approveWithdrawal.transfer.pending',
        transferState === 'WAIT_USER_CONFIRM'
          ? '转账已创建，等待用户在小程序确认收款'
          : `转账处理中（${transferState}），待对账`,
        { withdrawalId, outBatchNo: transferResult.out_bill_no || w.outBatchNo || '' }
      )
      return handleSuccess({
        message: transferState === 'WAIT_USER_CONFIRM'
          ? '转账已受理，请提醒用户在小程序确认收款'
          : `转账处理中（${transferState || '未知'}），请稍后对账`,
      })
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

    // 并发防双回退：事务前原子占位（rejectStarted 标记，与 approveWithdrawal 的占位同构），
    // 否则两个并发拒绝会各自通过“事务外旧快照”校验并双恢复钱包余额
    const claim = await db.collection('withdrawals')
      .where({ _id: withdrawalId, status: 'pending', rejectStarted: _.neq(true) })
      .update({
        data: {
          rejectStarted: true,
          rejectStartedBy: auth.openid,
          rejectStartedAt: db.serverDate(),
          updatedAt: db.serverDate(),
        },
      })
    const claimed = (claim && claim.stats && claim.stats.updated) || 0
    if (claimed === 0) {
      const cur = (await db.collection('withdrawals').doc(withdrawalId).get()).data
      if (cur && cur.status === 'rejected') {
        return handleSuccess({ message: '该提现已被拒绝' })
      }
      if (cur && cur.rejectStarted === true) {
        const startedAt = cur.rejectStartedAt ? new Date(cur.rejectStartedAt).getTime() : 0
        // 崩溃残留占位超过 2 分钟自动清理，允许重试
        if (Date.now() - startedAt > 120000) {
          await db.collection('withdrawals').where({ _id: withdrawalId, rejectStarted: true }).update({
            data: { rejectStarted: false, updatedAt: db.serverDate() },
          })
        }
      }
      throw err('BUSINESS_ERROR', '该提现正在被处理，请刷新后重试')
    }

    // P0-7: 提现状态更新→rejected + 钱包 balance/frozenAmount 恢复 纳入单一事务
    // 事务前先查询钱包 _id（CloudBase 事务内不支持 where().get() / where().update()）
    const walletType = w.walletType || 'commission'
    const walletRes = await db.collection('wallets').where({ openid: w.openid, type: walletType }).limit(1).get()
    const walletDoc = walletRes.data && walletRes.data[0]

    const transaction = await db.startTransaction()
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
            balance: _.inc(Number(w.amount) || 0),
            frozenAmount: _.inc(-(Number(w.amount) || 0)),
            updatedAt: db.serverDate(),
          },
        })
      }

      await transaction.commit()
    } catch (txError) {
      try { await transaction.rollback() } catch (_) { /* ignore rollback error */ }
      // 事务失败清理占位，允许重试
      await db.collection('withdrawals').where({ _id: withdrawalId, rejectStarted: true }).update({
        data: { rejectStarted: false, updatedAt: db.serverDate() },
      })
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
    // 人工打款记录与确认/撤销互斥：只能走确认/撤销流程，禁止自动重试
    if (w.mode === 'manual') {
      throw err('BUSINESS_ERROR', '人工打款记录请使用确认/撤销流程')
    }

    // 自动打款关闭时禁止重新发起自动转账（人工打款流程接管）
    if (!isAutoTransferEnabled()) {
      throw err('BUSINESS_ERROR', '自动转账已关闭，请走人工打款流程')
    }

    // H4: 重试前先生成并持久化商户单号（随占位一起写入），保证异常后可对账
    const outBatchNo = buildOutBatchNo('WDR')

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
      const transferState = transferResult.state || ''
      // P0 修复：与 approveWithdrawal 一致——仅 SUCCESS 终态结算，非终态保持 processing 待确认/对账
      if (transferState === 'SUCCESS') {
        await settleWithdrawalCompleted(withdrawalId, w, transferResult, 'retryTransfer')
        return handleSuccess({ message: '重试转账成功，已到账' })
      }

      await db.collection('withdrawals').doc(withdrawalId).update({
        data: {
          packageInfo: transferResult.package_info || '',
          transferBatchNo: transferResult.transfer_bill_no || '',
          outBatchNo: transferResult.out_bill_no || w.outBatchNo || '',
          transferState,
          updatedAt: db.serverDate(),
        },
      })
      await recordAlert(
        'warning',
        'retryTransfer.transfer.pending',
        transferState === 'WAIT_USER_CONFIRM'
          ? '重试转账已创建，等待用户在小程序确认收款'
          : `重试转账处理中（${transferState}），待对账`,
        { withdrawalId, outBatchNo: transferResult.out_bill_no || w.outBatchNo || '' }
      )
      return handleSuccess({
        message: transferState === 'WAIT_USER_CONFIRM'
          ? '转账已受理，请提醒用户在小程序确认收款'
          : `转账处理中（${transferState || '未知'}），请稍后对账`,
      })
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

      // 前端 WithdrawalReview 读取顶层 transferError（res.transferError）判断失败；
      // data 内同时保留一份，兼容其他消费方
      const retryFailMsg = transferError ? transferError.message : '转账接口调用失败'
      return {
        ...handleSuccess({ message: '重试转账失败，请稍后再试', transferError: retryFailMsg }),
        transferError: retryFailMsg,
      }
    }
  } catch (error) {
    logger.error('retryTransfer', error)
    return handleError(error, '重试转账失败', ERROR_CODES.DATA)
  }
}

/**
 * v5.1：确认人工打款（事后记录——管理员已在系统外完成打款）
 * 两道保险：先读记录校验 mode='manual'，再条件更新 where(status='approved', mode='manual') 防并发。
 * payEvidence / paidAmount 必填；|差异|>0.01 必须填差异原因；结算按申请金额。
 */
async function confirmManualTransfer(event, context, auth) {
  const { withdrawalId, payEvidence, payoutChannel, paidAmount, manualNote } = event
  if (!withdrawalId) {throw err('INVALID_PARAMS', '参数错误')}

  try {
    const wRes = await db.collection('withdrawals').doc(withdrawalId).get()
    const w = wRes.data
    if (!w) {throw err('NOT_FOUND', '提现记录不存在')}
    if (w.status === 'completed') {
      return handleSuccess({ message: '该提现已完成' })
    }
    if (w.status !== 'approved' || w.mode !== 'manual') {
      throw err('BUSINESS_ERROR', '仅“待人工打款（approved, manual）”状态可确认')
    }

    const evidence = String(payEvidence || '').trim()
    if (!evidence) {throw err('INVALID_PARAMS', '请上传打款凭证或填写流水号')}
    const paid = Number(paidAmount)
    if (!Number.isFinite(paid) || paid <= 0) {throw err('INVALID_PARAMS', '请输入实际打款金额')}
    const channel = PAYOUT_CHANNELS.includes(payoutChannel) ? payoutChannel : (PAYOUT_CHANNELS.includes(w.method) ? w.method : 'wechat')
    const diff = Math.round((paid - Number(w.amount || 0)) * 100) / 100
    const note = String(manualNote || '').trim()
    if (Math.abs(diff) > 0.01 && !note) {
      throw err('INVALID_PARAMS', '实际打款金额与申请金额不一致，请填写差异原因')
    }

    // 打款对象脱敏快照：取当前 users.payee（与审批时快照可能不同，两者均留档）
    let paidToSnapshot = w.payeeSnapshot || {}
    try {
      const userRes = await db.collection('users').doc(w.openid).get()
      const cur = maskPayee((userRes.data && userRes.data.payee) || {}, channel)
      if (cur) {paidToSnapshot = cur}
    } catch (e) {
      logger.warn('confirmManualTransfer.payee.fetch', { withdrawalId, msg: e?.message })
    }

    // 并发防双付：事务前原子占位（manualConfirmStarted 标记）。
    // 事务路径的 doc().update() 无 where 守卫，入口校验基于事务外旧快照，
    // 两个并发确认会在交错下双释放冻结金额；占位成功者才允许结算。
    const claim = await db.collection('withdrawals')
      .where({ _id: withdrawalId, status: 'approved', mode: 'manual', manualConfirmStarted: _.neq(true), cancelStarted: _.neq(true) })
      .update({
        data: {
          manualConfirmStarted: true,
          manualConfirmingBy: auth.openid,
          manualConfirmingAt: db.serverDate(),
          updatedAt: db.serverDate(),
        },
      })
    const claimed = (claim && claim.stats && claim.stats.updated) || 0
    if (claimed === 0) {
      const cur = (await db.collection('withdrawals').doc(withdrawalId).get()).data
      if (cur && cur.status === 'completed') {
        return handleSuccess({ message: '该提现已由其他管理员确认完成' })
      }
      if (cur && cur.status === 'cancelled') {
        throw err('BUSINESS_ERROR', '该提现已撤销，无法确认打款')
      }
      if (cur && cur.manualConfirmStarted === true) {
        const startedAt = cur.manualConfirmingAt ? new Date(cur.manualConfirmingAt).getTime() : 0
        // 崩溃残留占位超过 2 分钟自动清理，允许重试
        if (Date.now() - startedAt > 120000) {
          await db.collection('withdrawals').where({ _id: withdrawalId, manualConfirmStarted: true }).update({
            data: { manualConfirmStarted: false, updatedAt: db.serverDate() },
          })
        }
      }
      throw err('BUSINESS_ERROR', '该提现正在被其他管理员确认，请稍后重试')
    }

    const extra = {
      transferMethod: 'manual',
      payoutChannel: channel,
      paidAmount: paid,
      amountDiff: diff,
      manualPaidBy: auth.openid,
      manualPaidAt: db.serverDate(),
      payEvidence: evidence,
      manualNote: note,
      paidToSnapshot,
    }
    const r = await settleWithdrawalCompleted(withdrawalId, w, {}, 'confirmManualTransfer', 'approved', extra)
    if (!r.settled) {
      // 并发下可能已被另一管理员完成/撤销 → 幂等返回或明确报错
      const reRes = await db.collection('withdrawals').doc(withdrawalId).get()
      const cur = reRes.data
      if (cur && cur.status === 'completed') {
        return handleSuccess({ message: '该提现已由其他管理员确认完成' })
      }
      if (cur && cur.status === 'cancelled') {
        throw err('BUSINESS_ERROR', '该提现已撤销，无法确认打款')
      }
      // 落库失败：清理占位，允许重试
      await db.collection('withdrawals').where({ _id: withdrawalId, manualConfirmStarted: true }).update({
        data: { manualConfirmStarted: false, updatedAt: db.serverDate() },
      })
      throw err('DATA_ERROR', '确认打款落库失败，请重试或人工对账')
    }

    writeOperationLog({
      module: 'withdrawal',
      action: 'confirm_manual',
      targetId: withdrawalId,
      operatorId: auth.openid,
      afterData: { status: 'completed', transferMethod: 'manual', paidAmount: paid, amountDiff: diff, payoutChannel: channel },
    })
    return handleSuccess({ message: '已确认人工打款完成' })
  } catch (error) {
    logger.error('confirmManualTransfer', error)
    return handleError(error, '确认人工打款失败', ERROR_CODES.DATA)
  }
}

/**
 * v5.1：查看完整收款信息（唯一完整账号出口，super_admin，每次查看写审计）
 */
async function getFullPayeeInfo(event, context, auth) {
  const { withdrawalId } = event
  if (!withdrawalId) {throw err('INVALID_PARAMS', '参数错误')}
  try {
    const wRes = await db.collection('withdrawals').doc(withdrawalId).get()
    const w = wRes.data
    if (!w) {throw err('NOT_FOUND', '提现记录不存在')}
    const userRes = await db.collection('users').doc(w.openid).get()
    const payee = (userRes.data && userRes.data.payee) || {}
    writeOperationLog({
      module: 'withdrawal',
      action: 'view_full_payee',
      targetId: withdrawalId,
      operatorId: auth.openid,
      afterData: { channel: PAYOUT_CHANNELS.includes(w.method) ? w.method : 'wechat' },
    })
    return handleSuccess({
      withdrawalId,
      method: PAYOUT_CHANNELS.includes(w.method) ? w.method : 'wechat',
      nickName: w.nickName || '',
      payee,
      payeeSnapshot: w.payeeSnapshot || null,
    })
  } catch (error) {
    logger.error('getFullPayeeInfo', error)
    return handleError(error, '获取收款信息失败', ERROR_CODES.DATA)
  }
}

/**
 * v5.1：打款配置（透出运维总闸，web-admin 据此禁用自动选项）
 */
async function getPayoutConfig(event, context, auth) {
  return handleSuccess({ autoTransferEnabled: isAutoTransferEnabled() })
}

/**
 * v5.1：super_admin 撤销 approved 提现（打款前撤销，frozen→balance 回退）
 * 覆盖 manual（待人工打款）与 auto 失败回退单（无 mode 或 mode=auto）；
 * 强约束：原因必填 + operation-log；系统无法验证是否已打款，文案强确认由前端承担。
 */
async function cancelWithdrawal(event, context, auth) {
  const { withdrawalId, reason } = event
  if (!withdrawalId) {throw err('INVALID_PARAMS', '参数错误')}
  const cancelReason = String(reason || '').trim()
  if (!cancelReason) {throw err('INVALID_PARAMS', '请填写撤销原因')}

  try {
    const wRes = await db.collection('withdrawals').doc(withdrawalId).get()
    const w = wRes.data
    if (!w) {throw err('NOT_FOUND', '提现记录不存在')}
    if (w.status === 'cancelled') {
      return handleSuccess({ message: '该提现已取消' })
    }
    if (w.status !== 'approved') {
      throw err('BUSINESS_ERROR', '仅“待打款（approved）”状态可撤销')
    }
    // 并发防双回退：事务前原子占位（cancelStarted 标记）
    const claim = await db.collection('withdrawals')
      .where({ _id: withdrawalId, status: 'approved', cancelStarted: _.neq(true), manualConfirmStarted: _.neq(true) })
      .update({
        data: {
          cancelStarted: true,
          cancelStartedBy: auth.openid,
          cancelStartedAt: db.serverDate(),
          updatedAt: db.serverDate(),
        },
      })
    const claimed = (claim && claim.stats && claim.stats.updated) || 0
    if (claimed === 0) {
      const cur = (await db.collection('withdrawals').doc(withdrawalId).get()).data
      if (cur && cur.status === 'cancelled') {
        return handleSuccess({ message: '该提现已取消' })
      }
      if (cur && cur.cancelStarted === true) {
        const startedAt = cur.cancelStartedAt ? new Date(cur.cancelStartedAt).getTime() : 0
        if (Date.now() - startedAt > 120000) {
          await db.collection('withdrawals').where({ _id: withdrawalId, cancelStarted: true }).update({
            data: { cancelStarted: false, updatedAt: db.serverDate() },
          })
        }
      }
      throw err('BUSINESS_ERROR', '该提现正在被处理，请刷新后重试')
    }
    const walletType = w.walletType || 'commission'
    const walletRes = await db.collection('wallets').where({ openid: w.openid, type: walletType }).limit(1).get()
    const walletDoc = walletRes.data && walletRes.data[0]
    // 防静默丢钱：钱包不存在或金额非法时必须显式失败，不允许“标记已撤销但余额未退回”
    const amountNum = Number(w.amount)
    if (!walletDoc) {
      throw err('BUSINESS_ERROR', '未找到用户钱包，无法退回冻结金额，请人工处理')
    }
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      throw err('BUSINESS_ERROR', '提现金额非法，无法退回冻结金额，请人工处理')
    }
    const transaction = await db.startTransaction()
    try {
      await transaction.collection('withdrawals').doc(withdrawalId).update({
        data: {
          status: 'cancelled',
          cancelReason,
          cancelledBy: auth.openid,
          cancelledAt: db.serverDate(),
          updatedAt: db.serverDate(),
        },
      })
      await transaction.collection('wallets').doc(walletDoc._id).update({
        data: {
          balance: _.inc(amountNum),
          frozenAmount: _.inc(-amountNum),
          updatedAt: db.serverDate(),
        },
      })
      await transaction.commit()
    } catch (txError) {
      try { await transaction.rollback() } catch (_) { /* ignore */ }
      // 事务失败清理占位，允许重试
      await db.collection('withdrawals').where({ _id: withdrawalId, cancelStarted: true }).update({
        data: { cancelStarted: false, updatedAt: db.serverDate() },
      })
      logger.error('cancelWithdrawal.transaction.failed', {
        withdrawalId, code: txError?.code, errCode: txError?.errCode, msg: txError?.message,
      })
      throw err('BUSINESS_ERROR', `撤销失败：${txError?.message || '该提现状态可能已变更，请刷新后重试'}`)
    }
    writeOperationLog({
      module: 'withdrawal',
      action: 'cancel_by_admin',
      targetId: withdrawalId,
      operatorId: auth.openid,
      afterData: { status: 'cancelled', reason: cancelReason },
    })
    return handleSuccess({ message: '已撤销提现，冻结金额已退回余额' })
  } catch (error) {
    logger.error('cancelWithdrawal', error)
    // 透出具体原因（如状态非 approved / 状态已变更），便于后台定位
    return handleError(error, error.message || '撤销提现失败', ERROR_CODES.DATA)
  }
}

/**
 * v5.1：auto 失败遗留的 approved 记录显式转为人工打款（补齐 payeeSnapshot/mode）
 */
async function convertToManual(event, context, auth) {
  const { withdrawalId } = event
  if (!withdrawalId) {throw err('INVALID_PARAMS', '参数错误')}
  try {
    const wRes = await db.collection('withdrawals').doc(withdrawalId).get()
    const w = wRes.data
    if (!w) {throw err('NOT_FOUND', '提现记录不存在')}
    if (w.status !== 'approved' || w.mode === 'manual') {
      throw err('BUSINESS_ERROR', '仅自动转账失败遗留的 approved 记录可转为人工打款')
    }
    const channel = PAYOUT_CHANNELS.includes(w.method) ? w.method : 'wechat'
    const userRes = await db.collection('users').doc(w.openid).get()
    const payee = (userRes.data && userRes.data.payee) || {}
    if (!hasPayeeChannel(payee, channel)) {
      throw err('BUSINESS_ERROR', '用户未预留所选收款方式的账号，无法转为人工打款')
    }
    const snapshot = maskPayee(payee, channel)
    const up = await db.collection('withdrawals')
      .where({ _id: withdrawalId, status: 'approved' })
      .update({
        data: {
          mode: 'manual',
          payeeSnapshot: snapshot || {},
          manualPayoutRequired: true,
          updatedAt: db.serverDate(),
        },
      })
    const count = (up && up.stats && up.stats.updated) || 0
    if (count === 0) {
      throw err('BUSINESS_ERROR', '该提现状态已变更，请刷新后重试')
    }
    writeOperationLog({
      module: 'withdrawal',
      action: 'convert_manual',
      targetId: withdrawalId,
      operatorId: auth.openid,
      afterData: { mode: 'manual' },
    })
    return handleSuccess({ message: '已转为人工打款，可确认已打款' })
  } catch (error) {
    logger.error('convertToManual', error)
    return handleError(error, '转为人工打款失败', ERROR_CODES.DATA)
  }
}

/**
 * v5.1 运维诊断：查看提现单 + 用户钱包 + 其他提现单（super_admin 只读）
 * 用于核对撤销/审批后钱包余额与冻结金额是否一致。
 */
async function inspectWithdrawal(event, context, auth) {
  const { withdrawalId } = event
  if (!withdrawalId) {throw err('INVALID_PARAMS', '参数错误')}
  try {
    const wRes = await db.collection('withdrawals').doc(withdrawalId).get()
    const w = wRes.data
    if (!w) {throw err('NOT_FOUND', '提现记录不存在')}
    const openid = w.openid || ''
    const [commissionRes, serviceRes, othersRes] = await Promise.all([
      db.collection('wallets').where({ openid, type: 'commission' }).limit(1).get(),
      db.collection('wallets').where({ openid, type: 'serviceIncome' }).limit(1).get(),
      db.collection('withdrawals').where({ openid }).count(),
    ])
    const wallet = (doc) => {
      const d = doc && doc[0]
      return d
        ? { balance: Number(d.balance) || 0, frozenAmount: Number(d.frozenAmount) || 0, totalIncome: Number(d.totalIncome) || 0, totalWithdrawn: Number(d.totalWithdrawn) || 0 }
        : null
    }
    writeOperationLog({
      module: 'withdrawal',
      action: 'inspect',
      targetId: withdrawalId,
      operatorId: auth.openid,
      afterData: { openid },
    })
    return handleSuccess({
      withdrawal: {
        _id: w._id,
        openid,
        amount: w.amount,
        status: w.status,
        mode: w.mode || 'auto',
        method: w.method || 'wechat',
        walletType: w.walletType || 'commission',
        createdAt: w.createdAt,
        cancelledAt: w.cancelledAt || null,
        cancelReason: w.cancelReason || '',
        outBatchNo: w.outBatchNo || '',
      },
      wallets: {
        commission: wallet(commissionRes.data),
        serviceIncome: wallet(serviceRes.data),
      },
      otherWithdrawalsTotal: (othersRes && othersRes.total) || 0,
    })
  } catch (error) {
    logger.error('inspectWithdrawal', error)
    return handleError(error, error.message || '检查提现失败', ERROR_CODES.DATA)
  }
}

/**
 * v5.1 运维修复：cancelled 记录幂等回补冻结金额
 * 仅当 status='cancelled' 且钱包 frozenAmount >= 金额时才执行（条件更新防重复），
 * 否则返回当前状态不动作。
 */
async function repairWithdrawalBalance(event, context, auth) {
  const { withdrawalId } = event
  if (!withdrawalId) {throw err('INVALID_PARAMS', '参数错误')}
  try {
    const wRes = await db.collection('withdrawals').doc(withdrawalId).get()
    const w = wRes.data
    if (!w) {throw err('NOT_FOUND', '提现记录不存在')}
    if (w.status !== 'cancelled') {
      throw err('BUSINESS_ERROR', '仅已撤销（cancelled）的记录可修复回补')
    }
    const amountNum = Number(w.amount)
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      throw err('BUSINESS_ERROR', '提现金额非法，无法修复')
    }
    const walletType = w.walletType || 'commission'
    const walletRes = await db.collection('wallets').where({ openid: w.openid, type: walletType }).limit(1).get()
    const walletDoc = walletRes.data && walletRes.data[0]
    if (!walletDoc) {
      throw err('BUSINESS_ERROR', '未找到用户钱包，无法修复，请人工处理')
    }
    const before = {
      balance: Number(walletDoc.balance) || 0,
      frozenAmount: Number(walletDoc.frozenAmount) || 0,
    }
    // 条件更新：仅当冻结金额仍 >= 金额时才回补（幂等）
    const up = await db.collection('wallets')
      .where({ _id: walletDoc._id, frozenAmount: _.gte(amountNum) })
      .update({
        data: {
          balance: _.inc(amountNum),
          frozenAmount: _.inc(-amountNum),
          updatedAt: db.serverDate(),
        },
      })
    const updated = (up && up.stats && up.stats.updated) || 0
    const after = {
      balance: before.balance + (updated ? amountNum : 0),
      frozenAmount: before.frozenAmount - (updated ? amountNum : 0),
    }
    if (updated > 0) {
      writeOperationLog({
        module: 'withdrawal',
        action: 'repair_balance',
        targetId: withdrawalId,
        operatorId: auth.openid,
        afterData: { amount: amountNum, before, after },
      })
      await recordAlert('warning', 'withdrawal.repair_balance.applied',
        '撤销记录钱包回补缺失，已通过修复接口补回冻结金额',
        { withdrawalId, openid: w.openid, amount: amountNum, before, after })
    }
    return handleSuccess({ repaired: updated > 0, before, after })
  } catch (error) {
    logger.error('repairWithdrawalBalance', error)
    return handleError(error, error.message || '修复提现余额失败', ERROR_CODES.DATA)
  }
}

/**
 * v5.1 运维诊断：查看某合作伙伴（inviterId/openid）的全部佣金、双钱包与提现单
 * 用于核对“累计收入 / 待结算佣金 / 钱包余额”是否一致（super_admin 只读 + 审计）。
 */
async function inspectPartnerFinance(event, context, auth) {
  const { inviterId } = event
  if (!inviterId) {throw err('INVALID_PARAMS', '缺少合作伙伴 openid')}
  try {
    const [commRes, commissionWalletRes, serviceWalletRes, wdRes] = await Promise.all([
      db.collection('commissions').where({ inviterId }).orderBy('createdAt', 'desc').limit(100).get(),
      db.collection('wallets').where({ openid: inviterId, type: 'commission' }).limit(1).get(),
      db.collection('wallets').where({ openid: inviterId, type: 'serviceIncome' }).limit(1).get(),
      db.collection('withdrawals').where({ openid: inviterId }).orderBy('createdAt', 'desc').limit(20).get(),
    ])
    const commissions = (commRes.data || []).map(c => ({
      _id: c._id,
      orderId: c.orderId || '',
      orderNo: c.orderNo || '',
      orderType: c.orderType || '',
      commissionAmount: c.commissionAmount,
      status: c.status || '',
      settledAt: c.settledAt || null,
      createdAt: c.createdAt,
    }))
    const wallet = (d) => {
      const x = d && d[0]
      return x
        ? {
            balance: Number(x.balance) || 0,
            frozenAmount: Number(x.frozenAmount) || 0,
            totalIncome: Number(x.totalIncome) || 0,
            totalWithdrawn: Number(x.totalWithdrawn) || 0,
          }
        : null
    }
    const withdrawals = (wdRes.data || []).map(w => ({
      _id: w._id,
      amount: w.amount,
      status: w.status || '',
      mode: w.mode || 'auto',
      method: w.method || 'wechat',
      createdAt: w.createdAt,
      cancelledAt: w.cancelledAt || null,
      cancelReason: w.cancelReason || '',
    }))
    writeOperationLog({
      module: 'commission',
      action: 'inspect_partner',
      targetId: inviterId,
      operatorId: auth.openid,
    })
    return handleSuccess({
      inviterId,
      commissions,
      wallets: {
        commission: wallet(commissionWalletRes.data),
        serviceIncome: wallet(serviceWalletRes.data),
      },
      withdrawals,
    })
  } catch (error) {
    logger.error('inspectPartnerFinance', error)
    return handleError(error, error.message || '检查合作伙伴财务失败', ERROR_CODES.DATA)
  }
}

// Re-export from common for cross-service usage
const { ensureWalletBalance } = require('../common/wallet-utils')

module.exports = {
  getWithdrawalList,
  approveWithdrawal,
  rejectWithdrawal,
  retryTransfer,
  confirmManualTransfer,
  getFullPayeeInfo,
  getPayoutConfig,
  cancelWithdrawal,
  convertToManual,
  inspectWithdrawal,
  repairWithdrawalBalance,
  inspectPartnerFinance,
  ensureWalletBalance,
}
