const { err } = require('../common/errors')
const { initCloud, handleSuccess, handleError, generateId, ERROR_CODES } = require('../common/utils')
const { createLogger } = require('../common/logger')

const { cloud, db } = initCloud()
const _ = db.command
const logger = createLogger('walletService')

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
    if (!user) {return handleSuccess({ commission: { total: 0, pending: 0, settled: 0, monthly: 0, today: 0 }, activity: { total: 0, monthly: 0, today: 0 }, hosting: { total: 0, monthly: 0, today: 0 }, feeding: { total: 0, monthly: 0, today: 0 }, wallet: { balance: 0, totalIncome: 0, totalWithdrawn: 0, frozenAmount: 0 } })}

    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    // inviterId 现在存的是 openid，tuan_commissions 中也存 openid
    const [commissionRes, activityRes, hostingRes, feedingRes, walletRes] = await Promise.all([
      db.collection('tuan_commissions').where({ inviterId: openid }).get(),
      db.collection('orders').where({ organizerId: openid, status: 'confirmed', orderType: 'activity' }).get(),
      db.collection('orders').where({ organizerId: openid, status: 'completed', type: 'boarding' }).get(),
      (async () => {
        const feederRes = await db.collection('feeders').where({ createdBy: openid }).limit(1).get()
        if (!feederRes.data.length) {return { data: [] }}
        const feederId = feederRes.data[0]._id
        return db.collection('feedingOrders').where({ feederId, status: 'completed' }).get()
      })(),
      db.collection('wallets').where({ openid }).limit(1).get(),
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

    let hostingTotal = 0, hostingMonthly = 0, hostingToday = 0
    ;(hostingRes.data || []).forEach(o => {
      const amt = Number(o.totalPrice) || Number(o.price) || 0
      hostingTotal += amt
      if (o.completedAt && new Date(o.completedAt) >= monthStart) {hostingMonthly += amt} else if (o.updatedAt && new Date(o.updatedAt) >= monthStart) {hostingMonthly += amt}
      if (o.completedAt && new Date(o.completedAt) >= todayStart) {hostingToday += amt} else if (o.updatedAt && new Date(o.updatedAt) >= todayStart) {hostingToday += amt}
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

    let wallet = { balance: 0, totalIncome: 0, totalWithdrawn: 0, frozenAmount: 0 }
    if (walletRes.data && walletRes.data.length > 0) {
      const w = walletRes.data[0]
      wallet = { balance: Number(w.balance) || 0, totalIncome: Number(w.totalIncome) || 0, totalWithdrawn: Number(w.totalWithdrawn) || 0, frozenAmount: Number(w.frozenAmount) || 0 }
    }

    return handleSuccess({
      commission: { total: commissionTotal, pending: commissionPending, settled: commissionSettled, monthly: commissionMonthly, today: commissionToday },
      activity: { total: activityTotal, monthly: activityMonthly, today: activityToday },
      hosting: { total: hostingTotal, monthly: hostingMonthly, today: hostingToday },
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

    // inviterId 现在存的是 openid，tuan_commissions 中也存 openid
    if (type === 'all' || type === 'commission') {
      const res = await db.collection('tuan_commissions').where({ inviterId: openid }).get()
      ;(res.data || []).forEach(c => {
        allItems.push({
          id: c._id, type: 'commission', typeName: '佣金',
          amount: Number(c.commissionAmount) || 0,
          orderNo: c.orderNo || '', description: `带货佣金-${c.orderType || ''}`,
          status: c.status || 'pending', createdAt: c.createdAt,
        })
      })
    }

    if (type === 'all' || type === 'activity') {
      const res = await db.collection('orders').where({ organizerId: openid, status: 'confirmed', orderType: 'activity' }).get()
      ;(res.data || []).forEach(o => {
        allItems.push({
          id: o._id, type: 'activity', typeName: '活动',
          amount: Number(o.totalPrice) || 0,
          orderNo: o.orderNo || '', description: `活动报名-${o.activityTitle || ''}`,
          status: 'confirmed', createdAt: o.paidAt || o.updatedAt || o.createdAt,
        })
      })
    }

    if (type === 'all' || type === 'hosting') {
      const res = await db.collection('orders').where({ organizerId: openid, status: 'completed', type: 'boarding' }).get()
      ;(res.data || []).forEach(o => {
        allItems.push({
          id: o._id, type: 'hosting', typeName: '寄养',
          amount: Number(o.totalPrice) || Number(o.price) || 0,
          orderNo: o.orderNo || '', description: '寄养订单收入',
          status: 'completed', createdAt: o.completedAt || o.updatedAt || o.createdAt,
        })
      })
    }

    if (type === 'all' || type === 'feeding') {
      const feederRes = await db.collection('feeders').where({ createdBy: openid }).limit(1).get()
      if (feederRes.data.length) {
        const feederId = feederRes.data[0]._id
        const res = await db.collection('feedingOrders').where({ feederId, status: 'completed' }).get()
        ;(res.data || []).forEach(o => {
          allItems.push({
            id: o._id, type: 'feeding', typeName: '服务',
            amount: Number(o.totalPrice) || 0,
            orderNo: o.orderNo || '', description: '上门服务收入',
            status: 'completed', createdAt: o.completedAt || o.updatedAt || o.createdAt,
          })
        })
      }
    }

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
  try {
    let walletRes = await db.collection('wallets').where({ openid }).limit(1).get()
    if (!walletRes.data || walletRes.data.length === 0) {
      await db.collection('wallets').add({ data: { _id: generateId('wallet', openid), openid, balance: 0, totalIncome: 0, totalWithdrawn: 0, frozenAmount: 0, status: 'active', createdAt: db.serverDate(), updatedAt: db.serverDate() } })
      walletRes = await db.collection('wallets').where({ openid }).limit(1).get()
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
  const { amount } = event

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

    const walletRes = await db.collection('wallets').where({ openid }).limit(1).get()
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
    const todayCount = await db.collection('withdrawals').where({ openid, createdAt: _.gte(today) }).count()
    if (todayCount.total >= 1) {
      throw err('BUSINESS_ERROR', '每日限提现1次')
    }

    await db.collection('wallets').doc(w._id).update({
      data: { balance: _.inc(-withdrawAmount), frozenAmount: _.inc(withdrawAmount), updatedAt: db.serverDate() },
    })

    await db.collection('withdrawals').add({
      data: { openid, amount: withdrawAmount, nickName: nickName || '', method: 'wechat', status: 'pending', createdAt: db.serverDate(), updatedAt: db.serverDate() },
    })

    return handleSuccess({ message: '提现申请已提交' })
  } catch (error) {
    logger.error('requestWithdrawal', error)
    return handleError(error, '申请提现失败', ERROR_CODES.DATA)
  }
}

async function getMyInvitedUsers(event, context, auth) {
  const { openid } = auth
  const { page = 1, pageSize = 20 } = event

  try {
    let user = null
    try {
      const userRes = await db.collection('users').doc(openid).get()
      user = userRes.data
    } catch (e) {
      logger.warn('getMyIncomeDetails.users.fetch', { openid, code: e.errCode, msg: e.message })
    }
    if (!user) {return handleSuccess({ list: [], total: 0 })}

    // inviterId 现在存的是 openid，直接用 openid 查询
    const countRes = await db.collection('users').where({ inviterId: openid }).count()
    const total = countRes.total || 0

    const invitedRes = await db.collection('users')
      .where({ inviterId: openid })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .field({ nickName: true, avatarUrl: true, createdAt: true })
      .get()

    const invitedList = []
    for (const u of (invitedRes.data || [])) {
      let orderCount = 0
      let totalSpent = 0

      try {
        const [mallRes, feedingRes, tuanRes, activityRes, boardingRes] = await Promise.all([
          db.collection('orders').where({ ownerId: u._id, type: 'mall', status: _.in(['paid', 'shipped', 'completed']) }).get(),
          db.collection('feedingOrders').where({ ownerId: u._id, status: 'completed' }).get(),
          db.collection('tuan_orders').where({ ownerId: u._id, status: _.in(['paid', 'completed']) }).get(),
          db.collection('activity_registrations').where({ ownerId: u._id, status: 'confirmed' }).get(),
          db.collection('orders').where({ ownerId: u._id, status: 'completed', type: 'boarding' }).get(),
        ])

        const countAndSum = res => {
          let c = 0, s = 0
          ;(res.data || []).forEach(o => { c++; s += Number(o.totalPrice) || Number(o.totalAmount) || Number(o.price) || 0 })
          return { c, s }
        }

        const mall = countAndSum(mallRes)
        const feeding = countAndSum(feedingRes)
        const tuan = countAndSum(tuanRes)
        const activity = countAndSum(activityRes)
        const boarding = countAndSum(boardingRes)

        orderCount = mall.c + feeding.c + tuan.c + activity.c + boarding.c
        totalSpent = mall.s + feeding.s + tuan.s + activity.s + boarding.s
      } catch (e) {
        logger.warn('getMyInvitedUsers.consume', { msg: e.message })
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

async function approveWithdrawal(event, context, auth) {
  const { withdrawalId } = event
  if (!withdrawalId) {throw err('INVALID_PARAMS', '参数错误')}

  try {
    const wRes = await db.collection('withdrawals').doc(withdrawalId).get()
    if (!wRes.data) {throw err('DATA_ERROR', '数据错误')}
    const w = wRes.data
    if (w.status !== 'pending') {throw err('BUSINESS_ERROR', '状态错误')}

    await db.collection('withdrawals').doc(withdrawalId).update({
      data: {
        status: 'processing',
        reviewedBy: auth.openid,
        reviewedAt: db.serverDate(),
        updatedAt: db.serverDate(),
      },
    })

    let transferResult = null
    let transferError = null
    try {
      const { initiateTransfer } = require('../common/transfer')
      const outBatchNo = `WD_${withdrawalId}_${Date.now()}`
      transferResult = await initiateTransfer(w.openid, w.amount, outBatchNo, '提现到零钱')
    } catch (e) {
      logger.error('approveWithdrawal transfer failed', e)
      transferError = e
    }

    if (transferResult) {
      await db.collection('withdrawals').doc(withdrawalId).update({
        data: {
          status: 'completed',
          transferTime: db.serverDate(),
          transferBatchNo: transferResult.batch_id || '',
          outBatchNo: transferResult.out_batch_no || '',
          updatedAt: db.serverDate(),
        },
      })

      await db.collection('wallets').where({ openid: w.openid }).update({
        data: {
          frozenAmount: _.inc(-w.amount),
          totalWithdrawn: _.inc(w.amount),
          updatedAt: db.serverDate(),
        },
      })

      return handleSuccess({ message: '审核通过，已自动转账到用户微信零钱' })
    } else {
      await db.collection('withdrawals').doc(withdrawalId).update({
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

    await db.collection('withdrawals').doc(withdrawalId).update({
      data: {
        status: 'rejected',
        rejectReason: rejectReason || '审核未通过',
        reviewedBy: auth.openid,
        reviewedAt: db.serverDate(),
        updatedAt: db.serverDate(),
      },
    })

    await db.collection('wallets').where({ openid: w.openid }).update({
      data: {
        balance: _.inc(w.amount),
        frozenAmount: _.inc(-w.amount),
        updatedAt: db.serverDate(),
      },
    })

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
    if (w.status !== 'approved') {
      throw err('BUSINESS_ERROR', '仅审核通过但转账失败的记录可重试')
    }

    await db.collection('withdrawals').doc(withdrawalId).update({
      data: { status: 'processing', updatedAt: db.serverDate() },
    })

    let transferResult = null
    let transferError = null
    try {
      const { initiateTransfer } = require('../common/transfer')
      const outBatchNo = `WD_RETRY_${withdrawalId}_${Date.now()}`
      transferResult = await initiateTransfer(w.openid, w.amount, outBatchNo, '提现到零钱')
    } catch (e) {
      logger.error('retryTransfer transfer failed', e)
      transferError = e
    }

    if (transferResult) {
      await db.collection('withdrawals').doc(withdrawalId).update({
        data: {
          status: 'completed',
          transferTime: db.serverDate(),
          transferBatchNo: transferResult.batch_id || '',
          outBatchNo: transferResult.out_batch_no || '',
          updatedAt: db.serverDate(),
        },
      })

      await db.collection('wallets').where({ openid: w.openid }).update({
        data: {
          frozenAmount: _.inc(-w.amount),
          totalWithdrawn: _.inc(w.amount),
          updatedAt: db.serverDate(),
        },
      })

      return handleSuccess({ message: '重试转账成功，已自动转账到用户微信零钱' })
    } else {
      await db.collection('withdrawals').doc(withdrawalId).update({
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
