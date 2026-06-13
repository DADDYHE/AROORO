/**
 * wallet.ts - 合作伙伴钱包与收入服务（TypeScript 源文件 - Sprint 36 迁移）
 *
 * 业务功能：
 *   - 获取收入概览（getMyIncomeOverview）
 *   - 获取收入明细（getMyIncomeDetails）
 *   - 获取钱包信息（getMyWallet）
 *   - 获取提现记录（getMyWithdrawals）
 *   - 申请提现（requestWithdrawal）
 *
 * 迁移目标：
 *   - 强类型化所有 db 操作、handler 签名、返回结构
 *   - 复用统计算法（月度 / 当日 / 总和）
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.partnerService.json
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { err } = require('../common/errors')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { initCloud, handleSuccess, handleError, generateId, ERROR_CODES } = require('../common/utils')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createLogger } = require('../common/logger')

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { cloud, db } = initCloud()
const _ = db.command
const logger = createLogger('partnerService:wallet')

// =====================================================================
// 类型定义
// =====================================================================

export interface AuthLike {
  openid?: string
  adminId?: string
  partnerId?: string
  isPartner?: boolean
  roles?: string[]
  permissions?: string[]
  [k: string]: unknown
}

export interface CloudEvent {
  action?: string
  data?: Record<string, unknown>
  type?: string
  page?: number
  pageSize?: number
  amount?: number | string
  [k: string]: unknown
}

export interface CloudContext {
  [k: string]: unknown
}

export type WalletHandler = (
  event: CloudEvent,
  context: CloudContext,
  auth: AuthLike
) => Promise<unknown>

export interface WalletRecord {
  _id: string
  openid: string
  balance: number
  totalIncome: number
  totalWithdrawn: number
  frozenAmount: number
  status: 'active' | 'frozen'
  createdAt: Date
  updatedAt: Date
}

export interface CommissionItem {
  total: number
  pending: number
  settled: number
  monthly: number
  today: number
}

export interface OrderAggregate {
  total: number
  monthly: number
  today: number
}

export interface WalletSummary {
  balance: number
  totalIncome: number
  totalWithdrawn: number
  frozenAmount: number
}

export interface IncomeOverview {
  commission: CommissionItem
  hosting: OrderAggregate
  feeding: OrderAggregate
  wallet: WalletSummary
}

export interface IncomeDetailItem {
  id: string
  type: 'commission' | 'hosting' | 'feeding'
  typeName: string
  amount: number
  orderNo: string
  description: string
  status: string
  createdAt: Date
}

export interface IncomeDetailsResult {
  list: IncomeDetailItem[]
  total: number
  totalAmount: number
}

interface OrderLike {
  _id?: string
  ownerId?: string
  totalPrice?: number | string
  price?: number | string
  totalAmount?: number | string
  completedAt?: Date | string
  updatedAt?: Date | string
  createdAt?: Date | string
  hostId?: string
  [k: string]: unknown
}

interface CommissionLike {
  _id?: string
  commissionAmount?: number | string
  status?: string
  createdAt?: Date | string
  [k: string]: unknown
}

// =====================================================================
// 辅助函数
// =====================================================================

/** 累加 order 集合的总金额 / 月度金额 / 当日金额 */
function sumOrders(orders: OrderLike[], monthStart: Date, todayStart: Date): OrderAggregate {
  let total = 0
  let monthly = 0
  let today = 0
  orders.forEach((o) => {
    const amt = Number(o.totalPrice) || Number(o.price) || 0
    total += amt
    if (o.completedAt && new Date(o.completedAt) >= monthStart) {
      monthly += amt
    } else if (o.updatedAt && new Date(o.updatedAt) >= monthStart) {
      monthly += amt
    }
    if (o.completedAt && new Date(o.completedAt) >= todayStart) {
      today += amt
    } else if (o.updatedAt && new Date(o.updatedAt) >= todayStart) {
      today += amt
    }
  })
  return { total, monthly, today }
}

/** 累加 commission 集合的总金额 / 待结算 / 已结算 / 月度 / 当日 */
function sumCommissions(commissions: CommissionLike[], monthStart: Date, todayStart: Date): CommissionItem {
  let total = 0
  let pending = 0
  let settled = 0
  let monthly = 0
  let today = 0
  commissions.forEach((c) => {
    const amt = Number(c.commissionAmount) || 0
    total += amt
    if (c.status === 'pending') { pending += amt }
    if (c.status === 'settled') { settled += amt }
    if (c.createdAt && new Date(c.createdAt) >= monthStart) { monthly += amt }
    if (c.createdAt && new Date(c.createdAt) >= todayStart) { today += amt }
  })
  return { total, pending, settled, monthly, today }
}

const EMPTY_COMMISSION: CommissionItem = { total: 0, pending: 0, settled: 0, monthly: 0, today: 0 }
const EMPTY_AGGREGATE: OrderAggregate = { total: 0, monthly: 0, today: 0 }
const EMPTY_WALLET: WalletSummary = { balance: 0, totalIncome: 0, totalWithdrawn: 0, frozenAmount: 0 }

const EMPTY_OVERVIEW: IncomeOverview = {
  commission: EMPTY_COMMISSION,
  hosting: EMPTY_AGGREGATE,
  feeding: EMPTY_AGGREGATE,
  wallet: EMPTY_WALLET,
}

// =====================================================================
// Handler 实现
// =====================================================================

export async function getMyIncomeOverview(
  event: CloudEvent,
  context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  try {
    let user: unknown = null
    try {
      const userRes = await db.collection('users').doc(openid).get()
      user = userRes.data
    } catch (e) {
      user = null
    }
    if (!user) {
      return handleSuccess(EMPTY_OVERVIEW)
    }

    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    const [commissionRes, hostingRes, feedingRes, walletRes] = await Promise.all([
      db.collection('tuan_commissions').where({ inviterId: openid }).get(),
      db.collection('orders').where({ organizerId: openid, status: 'completed', type: 'boarding' }).get(),
      (async () => {
        const feederRes = await db.collection('feeders').where({ createdBy: openid }).limit(1).get()
        if (!feederRes.data || !feederRes.data.length) { return { data: [] } }
        const feederId = feederRes.data[0]._id
        return db.collection('feedingOrders').where({ feederId, status: 'completed' }).get()
      })(),
      db.collection('wallets').where({ openid }).limit(1).get(),
    ])

    const commission = sumCommissions((commissionRes.data || []) as CommissionLike[], monthStart, todayStart)
    const hosting = sumOrders((hostingRes.data || []) as OrderLike[], monthStart, todayStart)
    const feeding = sumOrders((feedingRes.data || []) as OrderLike[], monthStart, todayStart)

    let wallet: WalletSummary = { ...EMPTY_WALLET }
    if (walletRes.data && walletRes.data.length > 0) {
      const w = walletRes.data[0] as WalletRecord
      wallet = {
        balance: Number(w.balance) || 0,
        totalIncome: Number(w.totalIncome) || 0,
        totalWithdrawn: Number(w.totalWithdrawn) || 0,
        frozenAmount: Number(w.frozenAmount) || 0,
      }
    }

    return handleSuccess({ commission, hosting, feeding, wallet })
  } catch (error) {
    logger.error('getMyIncomeOverview', error)
    return handleError(error, '获取收入概览失败', ERROR_CODES.DATA)
  }
}

export async function getMyIncomeDetails(
  event: CloudEvent,
  context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  const { type = 'all', page = 1, pageSize = 20 } = event

  try {
    let user: unknown = null
    try {
      const userRes = await db.collection('users').doc(openid).get()
      user = userRes.data
    } catch (e) {
      user = null
    }
    if (!user) {
      return handleSuccess({ list: [], total: 0, totalAmount: 0 })
    }

    const allItems: IncomeDetailItem[] = []

    if (type === 'all' || type === 'commission') {
      const res = await db.collection('tuan_commissions').where({ inviterId: openid }).get()
      ;((res.data || []) as Array<Record<string, unknown>>).forEach((c) => {
        allItems.push({
          id: (c._id as string) || '',
          type: 'commission',
          typeName: '佣金',
          amount: Number(c.commissionAmount) || 0,
          orderNo: (c.orderNo as string) || '',
          description: `带货佣金-${c.orderType || ''}`,
          status: (c.status as string) || 'pending',
          createdAt: c.createdAt as Date,
        })
      })
    }

    if (type === 'all' || type === 'hosting') {
      const res = await db.collection('orders').where({ hostId: openid, status: 'completed', type: 'boarding' }).get()
      ;((res.data || []) as Array<Record<string, unknown>>).forEach((o) => {
        allItems.push({
          id: (o._id as string) || '',
          type: 'hosting',
          typeName: '寄养',
          amount: Number(o.totalPrice) || Number(o.price) || 0,
          orderNo: (o.orderNo as string) || '',
          description: '寄养订单收入',
          status: 'completed',
          createdAt: (o.completedAt || o.updatedAt || o.createdAt) as Date,
        })
      })
    }

    if (type === 'all' || type === 'feeding') {
      const feederRes = await db.collection('feeders').where({ createdBy: openid }).limit(1).get()
      if (feederRes.data && feederRes.data.length) {
        const feederId = feederRes.data[0]._id
        const res = await db.collection('feedingOrders').where({ feederId, status: 'completed' }).get()
        ;((res.data || []) as Array<Record<string, unknown>>).forEach((o) => {
          allItems.push({
            id: (o._id as string) || '',
            type: 'feeding',
            typeName: '服务',
            amount: Number(o.totalPrice) || 0,
            orderNo: (o.orderNo as string) || '',
            description: '上门服务收入',
            status: 'completed',
            createdAt: (o.completedAt || o.updatedAt || o.createdAt) as Date,
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

export async function getMyWallet(
  event: CloudEvent,
  context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  try {
    let walletRes = await db.collection('wallets').where({ openid }).limit(1).get()
    if (!walletRes.data || walletRes.data.length === 0) {
      await db.collection('wallets').add({
        data: {
          _id: generateId('wallet', openid),
          openid,
          balance: 0,
          totalIncome: 0,
          totalWithdrawn: 0,
          frozenAmount: 0,
          status: 'active',
          createdAt: db.serverDate(),
          updatedAt: db.serverDate(),
        },
      })
      walletRes = await db.collection('wallets').where({ openid }).limit(1).get()
    }
    const w = walletRes.data[0] as WalletRecord
    return handleSuccess({
      balance: Number(w.balance) || 0,
      totalIncome: Number(w.totalIncome) || 0,
      totalWithdrawn: Number(w.totalWithdrawn) || 0,
      frozenAmount: Number(w.frozenAmount) || 0,
      status: w.status,
    })
  } catch (error) {
    logger.error('getMyWallet', error)
    return handleError(error, '获取钱包信息失败', ERROR_CODES.DATA)
  }
}

export async function getMyWithdrawals(
  event: CloudEvent,
  context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
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

export async function requestWithdrawal(
  event: CloudEvent,
  context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  const { amount } = event

  if (!amount || Number(amount) < 10) {
    throw err('INVALID_PARAMS', '最低提现金额为10元')
  }
  const withdrawAmount = Number(amount)

  try {
    // 先检查每日提现次数
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayCount = await db.collection('withdrawals').where({ openid, createdAt: _.gte(today) }).count()
    if (todayCount.total >= 1) {
      throw err('BUSINESS_ERROR', '每日限提现1次')
    }

    // 重新查询最新余额（减少竞态条件窗口）
    const walletRes = await db.collection('wallets').where({ openid }).limit(1).get()
    if (!walletRes.data || walletRes.data.length === 0) {
      throw err('NOT_FOUND', '钱包不存在')
    }
    const w = walletRes.data[0] as WalletRecord
    
    if (w.status !== 'active') {
      throw err('BUSINESS_ERROR', '钱包已冻结')
    }
    
    if (Number(w.balance) < withdrawAmount) {
      throw err('BUSINESS_ERROR', '余额不足')
    }

    // 尝试扣减余额（原子操作）
    const updateRes = await db.collection('wallets').doc(w._id).update({
      data: { balance: _.inc(-withdrawAmount), frozenAmount: _.inc(withdrawAmount), updatedAt: db.serverDate() },
    })

    // 如果更新失败（updated=0），表示余额不足或其他问题
    if (updateRes.updated === 0) {
      throw err('BUSINESS_ERROR', '余额不足或钱包状态异常')
    }

    // 再次验证余额（防止并发超提）
    const freshWalletRes = await db.collection('wallets').where({ openid }).limit(1).get()
    if (freshWalletRes.data && freshWalletRes.data.length > 0) {
      const freshW = freshWalletRes.data[0] as WalletRecord
      if (Number(freshW.balance) < 0) {
        // 余额为负数，回滚扣减
        await db.collection('wallets').doc(w._id).update({
          data: { balance: _.inc(withdrawAmount), frozenAmount: _.inc(-withdrawAmount), updatedAt: db.serverDate() },
        })
        throw err('BUSINESS_ERROR', '余额不足')
      }
    }

    await db.collection('withdrawals').add({
      data: { openid, amount: withdrawAmount, method: 'wechat', status: 'pending', createdAt: db.serverDate(), updatedAt: db.serverDate() },
    })

    return handleSuccess({ message: '提现申请已提交' })
  } catch (error) {
    logger.error('requestWithdrawal', error)
    return handleError(error, '申请提现失败', ERROR_CODES.DATA)
  }
}

// =====================================================================
// Runtime shim: CommonJS 兼容
// =====================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _mod = module as { exports: Record<string, unknown> }
_mod.exports = {
  getMyIncomeOverview,
  getMyIncomeDetails,
  getMyWallet,
  getMyWithdrawals,
  requestWithdrawal,
}
_mod.exports.default = _mod.exports

export default {
  getMyIncomeOverview,
  getMyIncomeDetails,
  getMyWallet,
  getMyWithdrawals,
  requestWithdrawal,
}

// 避免 unused 警告
void cloud
