const { err } = require('../common/errors')
const { initCloud, handleSuccess, handleError, generateId, ERROR_CODES } = require('../common/utils')
const { createLogger } = require('../common/logger')
// P0-6: 资金事务失败主动告警
const { recordAlert } = require('../common/alert')
// 推广/邀请统计统一口径（板块→权威集合→状态集→金额字段）
const { REFERRAL_BOARDS, resolveOrderAmount, fetchBoardOrders } = require('./referralStats')

const { cloud, db } = initCloud()
const _ = db.command
const logger = createLogger('walletService')

const WALLET_TYPES = ['commission', 'serviceIncome']

async function getMyIncomeOverview(event, context, auth) {
  const { openid } = auth
  try {
    let user = null
    try {
      const userRes = await db.collection('users').doc(openid).get()
      user = userRes.data
    } catch (e) {
      logger.warn('getMyIncomeOverview.users.fetch', { openid, code: e.errCode, msg: e.message })
    }
    if (!user) {return handleSuccess({ commission: { total: 0, pending: 0, settled: 0, monthly: 0, today: 0 }, activity: { total: 0, monthly: 0, today: 0 }, boarding: { total: 0, monthly: 0, today: 0 }, feeding: { total: 0, monthly: 0, today: 0 }, wallet: { commission: { balance: 0, totalIncome: 0, totalWithdrawn: 0, frozenAmount: 0 }, serviceIncome: { balance: 0, totalIncome: 0, totalWithdrawn: 0, frozenAmount: 0 } } })}

    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    // inviterId 现在存的是 openid，commissions 中也存 openid
    // L6: 喂养师体系已废弃——feedingOrders 直接按 ownerId（合作伙伴 openid）查询，不再中转 feeders 集合
    const [commissionRes, activityRes, boardingRes, feedingRes, commissionWalletRes, serviceIncomeWalletRes] = await Promise.all([
      db.collection('commissions').where({ inviterId: openid }).limit(500).get(),
      db.collection('orders').where({ organizerId: openid, status: 'confirmed', orderType: 'activity' }).limit(500).get(),
      db.collection('orders').where({ organizerId: openid, status: 'completed', type: 'boarding' }).limit(500).get(),
      db.collection('feedingOrders').where({ ownerId: openid, status: 'completed' }).limit(500).get(),
      db.collection('wallets').where({ openid, type: 'commission' }).limit(1).get(),
      db.collection('wallets').where({ openid, type: 'serviceIncome' }).limit(1).get(),
    ])

    let commissionTotal = 0, commissionPending = 0, commissionSettled = 0, commissionMonthly = 0, commissionToday = 0
    ;(commissionRes.data || []).forEach(c => {
      const amt = Number(c.commissionAmount) || 0
      commissionTotal += amt
      if (c.status === 'pending') {commissionPending += amt}
      if (c.status === 'settled') {commissionSettled += amt}
      if (c.createdAt && new Date(c.createdAt) >= monthStart) {commissionMonthly += amt}
      if (c.createdAt && new Date(c.createdAt) >= todayStart) {commissionToday += amt}
    })

    let boardingTotal = 0, boardingMonthly = 0, boardingToday = 0
    ;(boardingRes.data || []).forEach(o => {
      const amt = Number(o.totalPrice) || Number(o.price) || 0
      boardingTotal += amt
      if (o.completedAt && new Date(o.completedAt) >= monthStart) {boardingMonthly += amt} else if (o.updatedAt && new Date(o.updatedAt) >= monthStart) {boardingMonthly += amt}
      if (o.completedAt && new Date(o.completedAt) >= todayStart) {boardingToday += amt} else if (o.updatedAt && new Date(o.updatedAt) >= todayStart) {boardingToday += amt}
    })

    let activityTotal = 0, activityMonthly = 0, activityToday = 0
    ;(activityRes.data || []).forEach(o => {
      const amt = Number(o.totalPrice) || 0
      activityTotal += amt
      if (o.paidAt && new Date(o.paidAt) >= monthStart) {activityMonthly += amt} else if (o.updatedAt && new Date(o.updatedAt) >= monthStart) {activityMonthly += amt}
      if (o.paidAt && new Date(o.paidAt) >= todayStart) {activityToday += amt} else if (o.updatedAt && new Date(o.updatedAt) >= todayStart) {activityToday += amt}
    })

    let feedingTotal = 0, feedingMonthly = 0, feedingToday = 0
    ;(feedingRes.data || []).forEach(o => {
      const amt = Number(o.totalPrice) || 0
      feedingTotal += amt
      if (o.completedAt && new Date(o.completedAt) >= monthStart) {feedingMonthly += amt} else if (o.updatedAt && new Date(o.updatedAt) >= monthStart) {feedingMonthly += amt}
      if (o.completedAt && new Date(o.completedAt) >= todayStart) {feedingToday += amt} else if (o.updatedAt && new Date(o.updatedAt) >= todayStart) {feedingToday += amt}
    })

    const buildWallet = (walletRes) => {
      let wallet = { balance: 0, totalIncome: 0, totalWithdrawn: 0, frozenAmount: 0 }
      if (walletRes.data && walletRes.data.length > 0) {
        const w = walletRes.data[0]
        wallet = { balance: Number(w.balance) || 0, totalIncome: Number(w.totalIncome) || 0, totalWithdrawn: Number(w.totalWithdrawn) || 0, frozenAmount: Number(w.frozenAmount) || 0 }
      }
      return wallet
    }
    const wallet = {
      commission: buildWallet(commissionWalletRes),
      serviceIncome: buildWallet(serviceIncomeWalletRes),
    }

    return handleSuccess({
      commission: { total: commissionTotal, pending: commissionPending, settled: commissionSettled, monthly: commissionMonthly, today: commissionToday },
      activity: { total: activityTotal, monthly: activityMonthly, today: activityToday },
      boarding: { total: boardingTotal, monthly: boardingMonthly, today: boardingToday },
      feeding: { total: feedingTotal, monthly: feedingMonthly, today: feedingToday },
      wallet,
    })
  } catch (error) {
    logger.error('getMyIncomeOverview', error)
    return handleError(error, '获取收入概览失败', ERROR_CODES.DATA)
  }
}

async function getMyIncomeDetails(event, context, auth) {
  const { openid } = auth
  const { type = 'all', page = 1, pageSize = 20 } = event

  try {
    let user = null
    try {
      const userRes = await db.collection('users').doc(openid).get()
      user = userRes.data
    } catch (e) {
      logger.warn('getMyIncomeDetails.users.fetch', { openid, code: e.errCode, msg: e.message })
    }
    if (!user) {return handleSuccess({ list: [], total: 0 })}

    const allItems = []

    // inviterId 现在存的是 openid，commissions 中也存 openid
    // 佣金类（团购/商城）按 orderType 细分；all/commission 查全部
    if (type === 'all' || type === 'commission' || type === 'tuan' || type === 'mall') {
      const commissionQuery = { inviterId: openid }
      if (type === 'tuan' || type === 'mall') {
        commissionQuery.orderType = type
      }
      const res = await db.collection('commissions').where(commissionQuery).limit(500).get()
      ;(res.data || []).forEach(c => {
        allItems.push({
          id: c._id, type: 'commission', typeName: '佣金',
          amount: Number(c.commissionAmount) || 0,
          orderNo: c.orderNo || '', description: `带货佣金-${c.orderType || ''}`,
          status: c.status || 'pending', createdAt: c.createdAt,
          buyerId: c.ownerId || '',
        })
      })
    }

    if (type === 'all' || type === 'activity') {
      const res = await db.collection('orders').where({ organizerId: openid, status: 'confirmed', orderType: 'activity' }).limit(500).get()
      ;(res.data || []).forEach(o => {
        allItems.push({
          id: o._id, type: 'activity', typeName: '活动',
          amount: Number(o.totalPrice) || 0,
          orderNo: o.orderNo || '', description: `活动报名-${o.activityTitle || ''}`,
          status: 'confirmed', createdAt: o.paidAt || o.updatedAt || o.createdAt,
          buyerId: o.ownerId || '',
        })
      })
    }

    if (type === 'all' || type === 'boarding' || type === 'hosting') {
      const res = await db.collection('orders').where({ organizerId: openid, status: 'completed', type: 'boarding' }).limit(500).get()
      ;(res.data || []).forEach(o => {
        allItems.push({
          id: o._id, type: 'boarding', typeName: '寄养',
          amount: Number(o.totalPrice) || Number(o.price) || 0,
          orderNo: o.orderNo || '', description: '寄养订单收入',
          status: 'completed', createdAt: o.completedAt || o.updatedAt || o.createdAt,
          buyerId: o.ownerId || '',
        })
      })
    }

    if (type === 'all' || type === 'feeding') {
      // L6: 喂养师体系已废弃——feedingOrders 直接按 ownerId（合作伙伴 openid）查询，不再中转 feeders 集合
      const res = await db.collection('feedingOrders').where({ ownerId: openid, status: 'completed' }).limit(500).get()
      ;(res.data || []).forEach(o => {
        allItems.push({
          id: o._id, type: 'feeding', typeName: '服务',
          amount: Number(o.totalPrice) || 0,
          orderNo: o.orderNo || '', description: '上门服务收入',
          status: 'completed', createdAt: o.completedAt || o.updatedAt || o.createdAt,
          buyerId: o.ownerId || '',
        })
      })
    }

    // 批量查询下单用户昵称/头像，回填到明细项
    const buyerIds = [...new Set(allItems.map(i => i.buyerId).filter(Boolean))]
    let buyerMap = {}
    if (buyerIds.length > 0) {
      try {
        const buyerRes = await db.collection('users').where({ _id: _.in(buyerIds) }).field({ _id: true, nickName: true, avatarUrl: true }).limit(500).get()
        ;(buyerRes.data || []).forEach(u => {
          buyerMap[u._id] = { nickName: u.nickName || '', avatarUrl: u.avatarUrl || '' }
        })
      } catch (e) {
        logger.warn('getMyIncomeDetails.buyers.fetch', { msg: e.message, count: buyerIds.length })
      }
    }
    allItems.forEach(item => {
      const b = item.buyerId ? buyerMap[item.buyerId] : null
      item.buyerNickName = b?.nickName || ''
      item.buyerAvatarUrl = b?.avatarUrl || ''
    })

    allItems.sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0
      return tb - ta
    })

    const total = allItems.length
    const totalAmount = allItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
    const start = (page - 1) * pageSize
    const list = allItems.slice(start, start + pageSize)

    return handleSuccess({ list, total, totalAmount })
  } catch (error) {
    logger.error('getMyIncomeDetails', error)
    return handleError(error, '获取收入明细失败', ERROR_CODES.DATA)
  }
}

async function getMyWallet(event, context, auth) {
  const { openid } = auth
  const { walletType = 'commission' } = event
  if (!WALLET_TYPES.includes(walletType)) {
    throw err('INVALID_PARAMS', '无效的钱包类型')
  }
  try {
    let walletRes = await db.collection('wallets').where({ openid, type: walletType }).limit(1).get()
    if (!walletRes.data || walletRes.data.length === 0) {
      await db.collection('wallets').add({ data: { _id: generateId('wallet', openid), openid, type: walletType, balance: 0, totalIncome: 0, totalWithdrawn: 0, frozenAmount: 0, status: 'active', createdAt: db.serverDate(), updatedAt: db.serverDate() } })
      walletRes = await db.collection('wallets').where({ openid, type: walletType }).limit(1).get()
    }
    const w = walletRes.data[0]
    return handleSuccess({ balance: Number(w.balance) || 0, totalIncome: Number(w.totalIncome) || 0, totalWithdrawn: Number(w.totalWithdrawn) || 0, frozenAmount: Number(w.frozenAmount) || 0, status: w.status })
  } catch (error) {
    logger.error('getMyWallet', error)
    return handleError(error, '获取钱包信息失败', ERROR_CODES.DATA)
  }
}

async function getMyWithdrawals(event, context, auth) {
  const { openid } = auth
  const { page = 1, pageSize = 20 } = event
  try {
    const countRes = await db.collection('withdrawals').where({ openid }).count()
    const total = countRes.total || 0
    const res = await db.collection('withdrawals')
      .where({ openid })
      .orderBy('createdAt', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get()
    return handleSuccess({ list: res.data || [], total })
  } catch (error) {
    logger.error('getMyWithdrawals', error)
    return handleError(error, '获取提现记录失败', ERROR_CODES.DATA)
  }
}

async function requestWithdrawal(event, context, auth) {
  const { openid } = auth
  const { amount, walletType = 'commission' } = event

  if (!WALLET_TYPES.includes(walletType)) {
    throw err('INVALID_PARAMS', '无效的钱包类型')
  }
  if (!amount || Number(amount) < 1) {
    throw err('INVALID_PARAMS', '最低提现金额为1元')
  }
  const withdrawAmount = Number(amount)

  try {
    // 读取用户昵称，用于管理端提现列表展示
    let nickName = ''
    try {
      const userRes = await db.collection('users').doc(openid).get()
      nickName = userRes.data?.nickName || ''
    } catch (e) { /* 忽略 */ }

    const walletRes = await db.collection('wallets').where({ openid, type: walletType }).limit(1).get()
    if (!walletRes.data || walletRes.data.length === 0) {
      throw err('NOT_FOUND', '钱包不存在')
    }
    const w = walletRes.data[0]
    if (Number(w.balance) < withdrawAmount) {
      throw err('BUSINESS_ERROR', '余额不足')
    }
    if (w.status !== 'active') {
      throw err('BUSINESS_ERROR', '钱包已冻结')
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayCount = await db.collection('withdrawals').where({ openid, walletType, createdAt: _.gte(today) }).count()
    if (todayCount.total >= 10) {
      throw err('BUSINESS_ERROR', '每日限提现10次')
    }

    // P1-4: 钱包扣减 + 提现记录创建 纳入单一事务，防止资金丢失
    const transaction = await db.startTransaction()
    try {
      // 事务内重新查询最新余额（防止并发超提）
      const freshWalletRes = await transaction.collection('wallets').doc(w._id).get()
      const freshWallet = freshWalletRes.data
      if (!freshWallet) {
        await transaction.rollback()
        throw err('NOT_FOUND', '钱包不存在')
      }
      if (freshWallet.status !== 'active') {
        await transaction.rollback()
        throw err('BUSINESS_ERROR', '钱包已冻结')
      }
      if (Number(freshWallet.balance) < withdrawAmount) {
        await transaction.rollback()
        throw err('BUSINESS_ERROR', '余额不足')
      }

      // 扣减余额、增加冻结金额
      await transaction.collection('wallets').doc(w._id).update({
        data: { balance: _.inc(-withdrawAmount), frozenAmount: _.inc(withdrawAmount), updatedAt: db.serverDate() },
      })

      // 创建提现记录
      await transaction.collection('withdrawals').add({
        data: { openid, walletType, amount: withdrawAmount, nickName: nickName || '', method: 'wechat', status: 'pending', createdAt: db.serverDate(), updatedAt: db.serverDate() },
      })

      await transaction.commit()
      return handleSuccess({ message: '提现申请已提交' })
    } catch (txError) {
      try { await transaction.rollback() } catch (_) { /* ignore rollback error */ }
      throw txError
    }
  } catch (error) {
    logger.error('requestWithdrawal', error)
    return handleError(error, '申请提现失败', ERROR_CODES.DATA)
  }
}

async function getMyInvitedUsers(event, context, auth) {
  console.log('[getMyInvitedUsers] === START ===', {
    eventKeys: Object.keys(event || {}),
    authKeys: Object.keys(auth || {}),
    authOpenid: auth?.openid,
    eventPage: event?.page,
    eventPageSize: event?.pageSize
  })

  const { openid } = auth
  const { page = 1, pageSize = 20 } = event

  console.log('[getMyInvitedUsers] 解析参数:', { openid, page, pageSize })

  logger.info('getMyInvitedUsers.start', { openid, page, pageSize })

  try {
    let user = null
    try {
      const userRes = await db.collection('users').doc(openid).get()
      user = userRes.data
    } catch (e) {
      logger.warn('getMyIncomeDetails.users.fetch', { openid, code: e.errCode, msg: e.message })
    }
    if (!user) {
      logger.warn('getMyInvitedUsers.noUser', { openid })
      return handleSuccess({ list: [], total: 0 })
    }

    // inviterId 现在存的是 openid，直接用 openid 查询
    const countRes = await db.collection('users').where({ inviterId: openid }).count()
    const total = countRes.total || 0

    logger.info('getMyInvitedUsers.invitedCount', { openid, total })

    const invitedRes = await db.collection('users')
      .where({ inviterId: openid })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .field({ _id: true, nickName: true, avatarUrl: true, createdAt: true })
      .get()

    const invitedUsers = invitedRes.data || []
    logger.info('getMyInvitedUsers.invitedUsers', { count: invitedUsers.length, sampleIds: invitedUsers.slice(0, 3).map(u => u._id) })

    const invitedList = []
    for (const u of invitedUsers) {
      let orderCount = 0
      let totalSpent = 0

      try {
        // 统一口径：每个板块只从一个权威集合取数，状态=已支付且未取消，金额 totalAmount || totalPrice || price
        for (const board of REFERRAL_BOARDS) {
          const list = await fetchBoardOrders(board, [u._id])
          for (const o of list) {
            orderCount += 1
            totalSpent += resolveOrderAmount(o)
          }
        }

        logger.info('getMyInvitedUsers.orderStats', { userId: u._id, orderCount, totalSpent })
      } catch (e) {
        logger.warn('getMyInvitedUsers.consume', { userId: u._id, msg: e.message })
      }

      invitedList.push({
        _id: u._id, nickName: u.nickName || '', avatarUrl: u.avatarUrl || '',
        createdAt: u.createdAt, orderCount, totalSpent: Math.round(totalSpent * 100) / 100,
      })
    }

    const cloudAvatars = invitedList.filter(u => u.avatarUrl && u.avatarUrl.startsWith('cloud://'))
    if (cloudAvatars.length > 0) {
      try {
        const uniqueFileIds = [...new Set(cloudAvatars.map(u => u.avatarUrl))]
        const urlRes = await cloud.getTempFileURL({ fileList: uniqueFileIds })
        const urlMap = {}
        ;(urlRes.fileList || []).forEach(f => {
          if (f.status === 0 && f.tempFileURL) {urlMap[f.fileID] = f.tempFileURL}
        })
        invitedList.forEach(u => {
          if (u.avatarUrl && urlMap[u.avatarUrl]) {u.avatarUrl = urlMap[u.avatarUrl]}
        })
      } catch (e) {
        logger.warn('getMyInvitedUsers.avatarUrl', { msg: e.message })
      }
    }

    return handleSuccess({ list: invitedList, total })
  } catch (error) {
    logger.error('getMyInvitedUsers', error)
    return handleError(error, '获取带货用户失败', ERROR_CODES.DATA)
  }
}

async function getWithdrawalList(event, context, auth) {
  const { status, page = 1, pageSize = 20 } = event
  try {
    const query = {}
    if (status) {query.status = status}
    const countRes = await db.collection('withdrawals').where(query).count()
    const total = countRes.total || 0
    const res = await db.collection('withdrawals')
      .where(query)
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
  const walletIncData = {
    frozenAmount: _.inc(-w.amount),
    totalWithdrawn: _.inc(w.amount),
    updatedAt: db.serverDate(),
  }

  // 首选路径：单一事务保证提现状态与钱包数据一致
  const transaction = await db.startTransaction()
  try {
    await transaction.collection('withdrawals').doc(withdrawalId).update({ data: completedData })
    if (walletDoc) {
      await transaction.collection('wallets').doc(walletDoc._id).update({ data: walletIncData })
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
      await db.collection('wallets').doc(walletDoc._id).update({ data: walletIncData })
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
            balance: _.inc(w.amount),
            frozenAmount: _.inc(-w.amount),
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
  getMyIncomeOverview,
  getMyIncomeDetails,
  getMyWallet,
  getMyWithdrawals,
  requestWithdrawal,
  getMyInvitedUsers,
  getWithdrawalList,
  approveWithdrawal,
  rejectWithdrawal,
  retryTransfer,
  ensureWalletBalance,
}
