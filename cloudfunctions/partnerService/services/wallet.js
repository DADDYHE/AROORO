const { err } = require('../common/errors')
const { initCloud, handleSuccess, handleError, generateId, ERROR_CODES } = require('../common/utils')
const { createLogger } = require('../common/logger')

const { cloud, db } = initCloud()
const _ = db.command
const logger = createLogger('partnerService:wallet')

async function getMyIncomeOverview(event, context, auth) {
  const { openid } = auth
  try {
    let user = null
    try {
      const userRes = await db.collection('users').doc(openid).get()
      user = userRes.data
    } catch (e) {}
    if (!user) {return handleSuccess({ commission: { total: 0, pending: 0, settled: 0, monthly: 0, today: 0 }, hosting: { total: 0, monthly: 0, today: 0 }, feeding: { total: 0, monthly: 0, today: 0 }, wallet: { balance: 0, totalIncome: 0, totalWithdrawn: 0, frozenAmount: 0 } })}

    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    const [commissionRes, hostingRes, feedingRes, walletRes] = await Promise.all([
      db.collection('tuan_commissions').where({ inviterId: openid }).get(),
      db.collection('orders').where({ hostId: openid, status: 'completed', type: 'boarding' }).get(),
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
    } catch (e) {}
    if (!user) {return handleSuccess({ list: [], total: 0 })}

    const allItems = []

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

    if (type === 'all' || type === 'hosting') {
      const res = await db.collection('orders').where({ hostId: openid, status: 'completed', type: 'boarding' }).get()
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

  if (!amount || Number(amount) < 10) {
    throw err('INVALID_PARAMS', '最低提现金额为10元')
  }
  const withdrawAmount = Number(amount)

  try {
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
      data: { openid, amount: withdrawAmount, method: 'wechat', status: 'pending', createdAt: db.serverDate(), updatedAt: db.serverDate() },
    })

    return handleSuccess({ message: '提现申请已提交' })
  } catch (error) {
    logger.error('requestWithdrawal', error)
    return handleError(error, '申请提现失败', ERROR_CODES.DATA)
  }
}

module.exports = { getMyIncomeOverview, getMyIncomeDetails, getMyWallet, getMyWithdrawals, requestWithdrawal }
