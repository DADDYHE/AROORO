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
 *
 * 数据库索引建议（运维需在对应集合上创建）：
 *   wallets: { openid: 1, type: 1 }                              - 复合唯一索引（硬约束）
 *   withdrawals: { openid: 1, walletType: 1, status: 1, createdAt: -1 } - 覆盖 getMyWithdrawals + 每日次数查询（M9: 含 status）
 *   commissions: { inviterId: 1, status: 1, createdAt: -1 } - 覆盖 getMyIncomeOverview/Details
 *   commissions: { inviterId: 1, orderType: 1, status: 1 } - 覆盖 byOrderType 双维度 aggregate（M5）
 *   orders: { organizerId: 1, status: 1, type: 1 }               - 覆盖 boarding 寄养收入查询
 *   feedingOrders: { feederId: 1, status: 1 }                    - 覆盖 feeding 服务收入查询
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { err } = require('../common/errors')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { initCloud, handleSuccess, handleError, generateId, ERROR_CODES } = require('../common/utils')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createLogger } = require('../common/logger')

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { db } = initCloud()
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
  // M6: 显式声明 nickName 字段（硬约束 #40）
  nickName?: string
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
  type?: string
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

export interface CommissionByOrderType {
  total: number
  pending: number
  settled: number
  monthly: number
  today: number
}

export interface CommissionOverview extends CommissionItem {
  // H3: 硬约束 #19——commission 按 orderType 分组
  byOrderType: Record<string, CommissionByOrderType>
}

export interface OrderAggregate {
  total: number
  monthly: number
  today: number
}

export interface ServiceIncomeByType {
  total: number
  monthly: number
  today: number
}

export interface ServiceIncomeOverview {
  total: number
  monthly: number
  today: number
  // H3: 硬约束 #19——serviceIncome 按 type 分组
  byType: Record<string, ServiceIncomeByType>
}

export interface WalletSummary {
  balance: number
  totalIncome: number
  totalWithdrawn: number
  frozenAmount: number
}

export interface IncomeOverview {
  commission: CommissionOverview
  hosting: OrderAggregate
  feeding: OrderAggregate
  // H3: 硬约束 #19——serviceIncome 按 type 分组独立返回
  serviceIncome: ServiceIncomeOverview
  wallet: WalletSummary & { commission: WalletSummary; serviceIncome: WalletSummary }
}

export interface IncomeDetailItem {
  id: string
  type: 'commission' | 'hosting' | 'feeding' | 'tuan' | 'mall' | 'activity'
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

// =====================================================================
// 辅助函数
// =====================================================================

const EMPTY_COMMISSION: CommissionItem = { total: 0, pending: 0, settled: 0, monthly: 0, today: 0 }
const EMPTY_COMMISSION_OVERVIEW: CommissionOverview = { ...EMPTY_COMMISSION, byOrderType: {} }
const EMPTY_AGGREGATE: OrderAggregate = { total: 0, monthly: 0, today: 0 }
const EMPTY_SERVICE_INCOME_OVERVIEW: ServiceIncomeOverview = { total: 0, monthly: 0, today: 0, byType: {} }
const EMPTY_WALLET: WalletSummary = { balance: 0, totalIncome: 0, totalWithdrawn: 0, frozenAmount: 0 }

const EMPTY_OVERVIEW: IncomeOverview = {
  commission: EMPTY_COMMISSION_OVERVIEW,
  hosting: EMPTY_AGGREGATE,
  feeding: EMPTY_AGGREGATE,
  serviceIncome: EMPTY_SERVICE_INCOME_OVERVIEW,
  wallet: { ...EMPTY_WALLET, commission: EMPTY_WALLET, serviceIncome: EMPTY_WALLET },
}

/** 钱包类型白名单：commission（佣金）/ serviceIncome（服务收入） */
const WALLET_TYPES = ['commission', 'serviceIncome'] as const
type WalletType = typeof WALLET_TYPES[number]

/** 校验钱包类型，非法值回退为 'commission' */
function normalizeWalletType(raw: unknown): WalletType {
  return (typeof raw === 'string' && (WALLET_TYPES as readonly string[]).includes(raw))
    ? (raw as WalletType)
    : 'commission'
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
      // L5: 静默吞错改为告警，提升可观测性
      logger.warn('getMyIncomeOverview.users.fetch', {
        openid, msg: (e as Error).message,
      })
      user = null
    }
    if (!user) {
      return handleSuccess(EMPTY_OVERVIEW)
    }

    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    // M6: 对可选查询降级处理——Promise.all 中任一失败不应整体失败
    const safeGet = async (collection: string, where: Record<string, unknown>): Promise<{ data: unknown[] }> => {
      try {
        return await db.collection(collection).where(where).get()
      } catch (e) {
        logger.warn(`getMyIncomeOverview.${collection}.fetch`, {
          openid, msg: (e as Error).message,
        })
        return { data: [] }
      }
    }

    // H1: 改用 aggregate sum 在 DB 侧累加，避免 CloudBase 默认 limit(100) 截断
    //   原：safeGet 全量 get() 后 sumCommissions/sumOrders 内存累加，超过 100 条会静默截断
    //   新：aggregate match + group 在 DB 侧完成计算，无截断风险
    const $ = _.aggregate
    const safeAggSum = async (
      collection: string,
      match: Record<string, unknown>,
      groupBy: string | null,
      sumField: string
    ): Promise<Array<{ key: string | null; total: number }>> => {
      try {
        const agg = db.collection(collection).aggregate().match(match)
        const aggRes = await (groupBy
          ? agg.group({ _id: `$${groupBy}`, total: $.sum(`$${sumField}`) }).end()
          : agg.group({ _id: null, total: $.sum(`$${sumField}`) }).end()
        )
        return (aggRes.list || []).map((r: unknown) => ({
          key: (r as { _id?: string | null })._id ?? null,
          total: Number((r as { total?: number }).total) || 0,
        }))
      } catch (e) {
        logger.warn(`getMyIncomeOverview.${collection}.aggregate`, {
          openid, msg: (e as Error).message,
        })
        return []
      }
    }

    // M5: 双维度 aggregate——同时按 orderType + 另一维度（status/时间）分组
    //   避免 byOrderType 的 pending/settled/monthly/today 全置 0 的问题
    //   一次 aggregate 同时返回 (orderType, status) 笛卡尔积的 sum
    const safeAggSum2D = async (
      collection: string,
      match: Record<string, unknown>,
      groupBy1: string,
      groupBy2: string,
      sumField: string
    ): Promise<Array<{ key1: string | null; key2: string | null; total: number }>> => {
      try {
        const aggRes = await db.collection(collection)
          .aggregate()
          .match(match)
          .group({
            _id: { k1: `$${groupBy1}`, k2: `$${groupBy2}` },
            total: $.sum(`$${sumField}`),
          })
          .end()
        return (aggRes.list || []).map((r: unknown) => {
          const id = (r as { _id?: { k1?: string | null; k2?: string | null } })._id
          return {
            key1: id?.k1 ?? null,
            key2: id?.k2 ?? null,
            total: Number((r as { total?: number }).total) || 0,
          }
        })
      } catch (e) {
        logger.warn(`getMyIncomeOverview.${collection}.aggregate2D`, {
          openid, msg: (e as Error).message,
        })
        return []
      }
    }

    // boarding 已完成订单状态白名单——兼容 status='completed' 与历史 'finished' 状态
    const COMPLETED_BOARDING_STATUSES = ['completed', 'finished']

    // 先查询 feederId（feeding 查询依赖）
    let feederId: string | null = null
    try {
      const feederRes = await db.collection('feeders').where({ createdBy: openid }).limit(1).get()
      if (feederRes.data && feederRes.data.length > 0) {
        feederId = feederRes.data[0]._id
      }
    } catch (e) {
      logger.warn('getMyIncomeOverview.feeders.fetch', { openid, msg: (e as Error).message })
    }

    // H1+H3: 并行执行所有 aggregate 查询
    //   commission: total/byOrderType/pending/settled/monthly/today 共 5 次 aggregate
    //   boarding/feeding: total/monthly/today 各 3 次 aggregate
    //   wallets: 直接 get（单文档，无截断风险）
    const commissionMatch = { inviterId: openid, status: _.neq('cancelled') }
    const boardingMatch = { organizerId: openid, status: _.in(COMPLETED_BOARDING_STATUSES), type: 'boarding' }
    const feedingMatch = feederId ? { feederId, status: 'completed' } : null

    const [
      commissionByOrderTypeAgg,
      commissionByOrderTypeStatusAgg,
      commissionByOrderTypeMonthlyAgg,
      commissionByOrderTypeTodayAgg,
      boardingTotalAgg, boardingMonthlyAgg, boardingTodayAgg,
      feedingTotalAgg, feedingMonthlyAgg, feedingTodayAgg,
      commissionWalletRes, serviceWalletRes,
    ] = await Promise.all([
      // H3+M5: commission 按 orderType 分组（total）
      safeAggSum('commissions', commissionMatch, 'orderType', 'commissionAmount'),
      // M5: commission 按 (orderType, status) 双维度分组——同时获取 byOrderType 的 pending/settled
      safeAggSum2D('commissions', commissionMatch, 'orderType', 'status', 'commissionAmount'),
      // M5: commission 按 (orderType, month) 双维度分组——byOrderType 的 monthly
      //   注意：match 已过滤 createdAt >= monthStart，group 后即按 orderType 分月度
      safeAggSum('commissions', { ...commissionMatch, createdAt: _.gte(monthStart) }, 'orderType', 'commissionAmount'),
      safeAggSum('commissions', { ...commissionMatch, createdAt: _.gte(todayStart) }, 'orderType', 'commissionAmount'),
      // boarding 三维度
      safeAggSum('orders', boardingMatch, null, 'totalPrice'),
      safeAggSum('orders', { ...boardingMatch, completedAt: _.gte(monthStart) }, null, 'totalPrice'),
      safeAggSum('orders', { ...boardingMatch, completedAt: _.gte(todayStart) }, null, 'totalPrice'),
      // feeding 三维度（feederId 为空时返回空数组）
      feedingMatch ? safeAggSum('feedingOrders', feedingMatch, null, 'totalPrice') : Promise.resolve([]),
      feedingMatch ? safeAggSum('feedingOrders', { ...feedingMatch, completedAt: _.gte(monthStart) }, null, 'totalPrice') : Promise.resolve([]),
      feedingMatch ? safeAggSum('feedingOrders', { ...feedingMatch, completedAt: _.gte(todayStart) }, null, 'totalPrice') : Promise.resolve([]),
      // wallets 直接 get
      safeGet('wallets', { openid, type: 'commission' }),
      safeGet('wallets', { openid, type: 'serviceIncome' }),
    ])

    // 组装 commission 结果（H3: 含 byOrderType 分组，M5: 补全 pending/settled/monthly/today 维度）
    const byOrderType: Record<string, CommissionByOrderType> = {}
    let commissionTotal = 0
    commissionByOrderTypeAgg.forEach((r) => {
      const key = r.key || 'unknown'
      byOrderType[key] = { total: r.total, pending: 0, settled: 0, monthly: 0, today: 0 }
      commissionTotal += r.total
    })
    // M5: 填充 byOrderType 的 pending/settled 维度（来自双维度 aggregate）
    commissionByOrderTypeStatusAgg.forEach((r) => {
      const key = r.key1 || 'unknown'
      if (!byOrderType[key]) {
        byOrderType[key] = { total: 0, pending: 0, settled: 0, monthly: 0, today: 0 }
      }
      if (r.key2 === 'pending') { byOrderType[key].pending = r.total }
      else if (r.key2 === 'settled') { byOrderType[key].settled = r.total }
    })
    // M5: 填充 byOrderType 的 monthly/today 维度
    commissionByOrderTypeMonthlyAgg.forEach((r) => {
      const key = r.key || 'unknown'
      if (!byOrderType[key]) {
        byOrderType[key] = { total: 0, pending: 0, settled: 0, monthly: 0, today: 0 }
      }
      byOrderType[key].monthly = r.total
    })
    commissionByOrderTypeTodayAgg.forEach((r) => {
      const key = r.key || 'unknown'
      if (!byOrderType[key]) {
        byOrderType[key] = { total: 0, pending: 0, settled: 0, monthly: 0, today: 0 }
      }
      byOrderType[key].today = r.total
    })
    // 汇总值
    const commissionPending = Object.values(byOrderType).reduce((s, v) => s + v.pending, 0)
    const commissionSettled = Object.values(byOrderType).reduce((s, v) => s + v.settled, 0)
    const commissionMonthly = Object.values(byOrderType).reduce((s, v) => s + v.monthly, 0)
    const commissionToday = Object.values(byOrderType).reduce((s, v) => s + v.today, 0)

    const commission: CommissionOverview = {
      total: commissionTotal,
      pending: commissionPending,
      settled: commissionSettled,
      monthly: commissionMonthly,
      today: commissionToday,
      byOrderType,
    }

    // 组装 boarding/feeding
    // L1: 局部变量名与 orderType 'boarding' 对齐（API 字段名仍为 hosting，前端已依赖）
    const boarding: OrderAggregate = {
      total: boardingTotalAgg[0]?.total || 0,
      monthly: boardingMonthlyAgg[0]?.total || 0,
      today: boardingTodayAgg[0]?.total || 0,
    }
    const feeding: OrderAggregate = {
      total: feedingTotalAgg[0]?.total || 0,
      monthly: feedingMonthlyAgg[0]?.total || 0,
      today: feedingTodayAgg[0]?.total || 0,
    }

    // H3: serviceIncome 按 type 分组（boarding + feeding 汇总）
    const serviceIncome: ServiceIncomeOverview = {
      total: boarding.total + feeding.total,
      monthly: boarding.monthly + feeding.monthly,
      today: boarding.today + feeding.today,
      byType: {
        boarding,
        feeding,
      },
    }

    // 钱包汇总
    const commissionWallet: WalletSummary = { ...EMPTY_WALLET }
    if (commissionWalletRes.data && commissionWalletRes.data.length > 0) {
      const w = commissionWalletRes.data[0] as WalletRecord
      commissionWallet.balance = Number(w.balance) || 0
      commissionWallet.totalIncome = Number(w.totalIncome) || 0
      commissionWallet.totalWithdrawn = Number(w.totalWithdrawn) || 0
      commissionWallet.frozenAmount = Number(w.frozenAmount) || 0
    }

    const serviceIncomeWallet: WalletSummary = { ...EMPTY_WALLET }
    if (serviceWalletRes.data && serviceWalletRes.data.length > 0) {
      const w = serviceWalletRes.data[0] as WalletRecord
      serviceIncomeWallet.balance = Number(w.balance) || 0
      serviceIncomeWallet.totalIncome = Number(w.totalIncome) || 0
      serviceIncomeWallet.totalWithdrawn = Number(w.totalWithdrawn) || 0
      serviceIncomeWallet.frozenAmount = Number(w.frozenAmount) || 0
    }

    // H2: 硬约束 #17——home page total income must be sum of commission and service income
    //   原：wallet.totalIncome 仅 commissionWallet.totalIncome
    //   新：wallet.totalIncome = commissionWallet.totalIncome + serviceIncomeWallet.totalIncome
    //   balance/frozenAmount/totalWithdrawn 同样汇总（业务语义：首页展示总览）
    const wallet: WalletSummary & { commission: WalletSummary; serviceIncome: WalletSummary } = {
      balance: commissionWallet.balance + serviceIncomeWallet.balance,
      totalIncome: commissionWallet.totalIncome + serviceIncomeWallet.totalIncome,
      totalWithdrawn: commissionWallet.totalWithdrawn + serviceIncomeWallet.totalWithdrawn,
      frozenAmount: commissionWallet.frozenAmount + serviceIncomeWallet.frozenAmount,
      commission: commissionWallet,
      serviceIncome: serviceIncomeWallet,
    }

    // L1: API 字段名保留为 hosting（前端 overview.hosting 已依赖），值指向 boarding 局部变量
    return handleSuccess({ commission, hosting: boarding, feeding, serviceIncome, wallet })
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
  // H4: type 参数白名单校验——删除 'commission' 选项（与 'all' 行为重复）
  //   原：['all', 'commission', 'tuan', 'mall']，type='commission' 不应用 orderType 过滤，等同 'all'
  //   新：['all', 'tuan', 'mall']，避免 API 语义混淆
  const ALLOWED_TYPES = ['all', 'tuan', 'mall']
  const rawType = typeof event.type === 'string' ? event.type : 'all'
  if (!ALLOWED_TYPES.includes(rawType)) {
    throw err('INVALID_PARAMS', `无效的 type，仅支持：${ALLOWED_TYPES.join(', ')}`)
  }
  const type = rawType
  const page = Math.max(1, Number(event.page) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(event.pageSize) || 20))

  try {
    // H7: 仅查询 commissions 集合（project_memory 硬约束）
    //   getMyIncomeDetails must only query commissions collection for income page
    //   income page details must only display commission records
    //   服务收入明细由 service-income 页面独立查询
    //   原代码查询 activity_registrations/orders/feedingOrders 违反硬约束
    // M8: 补 status: _.neq('cancelled') 默认过滤，与 referral.ts getReferralOrders 行为一致
    //   原：未过滤 status，已取消的佣金记录也会出现在收入明细中
    //   新：默认排除 cancelled 状态，索引利用率也更高（索引含 status 字段）
    const where: Record<string, unknown> = {
      inviterId: openid,
      status: _.neq('cancelled'),
    }
    if (type !== 'all') {
      // type 映射到 orderType：tuan/mall 直接用
      if (type === 'tuan') where.orderType = 'tuan'
      else if (type === 'mall') where.orderType = 'mall'
    }

    // M3: 使用数据库分页（skip/limit/orderBy）替代内存分页
    //   原代码全量 get() 后在内存排序分页，limit(100) 隐式截断 + OOM 风险
    const [listRes, countRes] = await Promise.all([
      db.collection('commissions')
        .where(where)
        .orderBy('createdAt', 'desc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get(),
      db.collection('commissions')
        .where(where)
        .count(),
    ])

    const list = ((listRes.data || []) as Array<Record<string, unknown>>).map((c) => {
      const orderType = (c.orderType as string) || ''
      const subType = orderType === 'mall' ? 'mall' : 'tuan'
      // L2: description 空尾巴容错——orderType 为空时不再显示 "带货佣金-"
      const typeLabel = orderType === 'tuan' ? '团购' : orderType === 'mall' ? '商城' : '通用'
      return {
        id: (c._id as string) || '',
        type: subType,
        typeName: typeLabel,
        amount: Number(c.commissionAmount) || 0,
        orderNo: (c.orderNo as string) || '',
        description: `带货佣金-${typeLabel}`,
        status: (c.status as string) || 'pending',
        createdAt: c.createdAt as Date,
      } as IncomeDetailItem
    })

    // totalAmount 用 aggregate 在数据库侧累加，避免全量拉取
    let totalAmount = 0
    try {
      const $ = _.aggregate
      const sumRes = await db.collection('commissions')
        .aggregate()
        .match(where)
        .group({ _id: null, total: $.sum('$commissionAmount') })
        .end()
      if (sumRes.list && sumRes.list.length > 0) {
        totalAmount = Number((sumRes.list[0] as { total?: number }).total) || 0
      }
    } catch (e) {
      logger.warn('getMyIncomeDetails.aggregate_sum', { msg: (e as Error).message })
      // 降级：当前页累加（不精确但可用）
      totalAmount = list.reduce((s, i) => s + (Number(i.amount) || 0), 0)
    }

    return handleSuccess({ list, total: countRes.total, totalAmount })
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
  const walletType = normalizeWalletType(event.walletType)
  try {
    // M5: GET 请求不再创建钱包——查询接口不应承担初始化职责
    //   原代码在 GET 中创建钱包违反幂等性，并发场景下可能创建多个钱包
    //   钱包初始化应在合作伙伴审批通过时（adminService approveApplication）由 admin 端创建
    //   查询遇到钱包不存在，返回默认空钱包
    const walletRes = await db.collection('wallets').where({ openid, type: walletType }).limit(1).get()
    if (!walletRes.data || walletRes.data.length === 0) {
      logger.info('getMyWallet.empty_wallet', { openid, walletType })
      return handleSuccess({
        balance: 0,
        totalIncome: 0,
        totalWithdrawn: 0,
        frozenAmount: 0,
        status: 'active',
        type: walletType,
      })
    }
    const w = walletRes.data[0] as WalletRecord
    return handleSuccess({
      balance: Number(w.balance) || 0,
      totalIncome: Number(w.totalIncome) || 0,
      totalWithdrawn: Number(w.totalWithdrawn) || 0,
      frozenAmount: Number(w.frozenAmount) || 0,
      status: w.status,
      type: walletType,
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
  // M9: 分页参数边界校验——page >= 1，pageSize 范围 [1, 100]
  //   原：未限制上限，传入 pageSize=9999 会拉取全表数据
  const page = Math.max(1, Math.floor(Number(event.page) || 1))
  const pageSize = Math.min(100, Math.max(1, Math.floor(Number(event.pageSize) || 20)))
  // 可选按 walletType 过滤（仅当传入合法值时启用）
  const walletTypeRaw = event.walletType
  const hasWalletTypeFilter = typeof walletTypeRaw === 'string' && (WALLET_TYPES as readonly string[]).includes(walletTypeRaw)
  const whereCond: Record<string, unknown> = { openid }
  if (hasWalletTypeFilter) {
    whereCond.walletType = walletTypeRaw
  }
  try {
    const countRes = await db.collection('withdrawals').where(whereCond).count()
    const total = countRes.total || 0
    // M1: 字段投影——仅返回前端需要的字段，避免敏感数据泄露
    //   原：返回完整记录含 transferSceneId/outTradeNo/method/openid 等内部字段
    //   新：仅返回展示所需字段（amount/status/createdAt/walletType 等）
    const res = await db.collection('withdrawals')
      .where(whereCond)
      .field({
        _id: true,
        amount: true,
        status: true,
        walletType: true,
        method: true,
        nickName: true,
        createdAt: true,
        updatedAt: true,
        // outTradeNo 保留——前端可能用于查询转账状态
        outTradeNo: true,
      })
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
  const walletType = normalizeWalletType(event.walletType)

  // H4: 金额校验——精度限制 2 位小数 + 单次上限 + NaN 防御
  const parsedAmount = Number(amount)
  if (!Number.isFinite(parsedAmount) || parsedAmount < 1) {
    throw err('INVALID_PARAMS', '最低提现金额为1元')
  }
  const withdrawAmount = Math.round(parsedAmount * 100) / 100
  if (withdrawAmount !== parsedAmount) {
    throw err('INVALID_PARAMS', '提现金额精度不能超过2位小数')
  }
  const MAX_SINGLE_WITHDRAWAL = 50000
  if (withdrawAmount > MAX_SINGLE_WITHDRAWAL) {
    throw err('BUSINESS_ERROR', `单次最多提现 ${MAX_SINGLE_WITHDRAWAL} 元`)
  }

  try {
    // M7: 每日次数查询过滤 status——仅统计有效提现（不含 cancelled/failed）
    // H4: 硬约束 #24——提现状态仅 4 种：awaiting_confirm/completed/failed/cancelled
    //   原代码含 awaiting_partner_confirm（不在硬约束枚举内，全局仅此一处使用，确属遗留值）
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    // M9: todayCount 与 walletRes 无依赖关系，并行查询降低串行 await 链超时风险
    const [todayCountRes, walletRes] = await Promise.all([
      db.collection('withdrawals').where({
        openid, walletType, createdAt: _.gte(today),
        status: _.in(['awaiting_confirm', 'completed']),
      }).count(),
      db.collection('wallets').where({ openid, type: walletType }).limit(1).get(),
    ])
    if (todayCountRes.total >= 10) {
      throw err('BUSINESS_ERROR', '每日限提现10次')
    }

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

    // H1: 获取 nickName——优先 auth.nickName，fallback 查询 users 集合
    let nickName = auth.nickName || ''
    if (!nickName) {
      try {
        const userRes = await db.collection('users').doc(openid!).get()
        const userData = userRes.data as { nickName?: string } | null
        nickName = (userData && userData.nickName) || ''
      } catch (e) {
        logger.warn('requestWithdrawal.fetch_nickName', { openid, msg: (e as Error).message })
      }
    }

    // H2: 生成提现单号 + withdrawalId（与项目其他业务 generateId 模式一致）
    const withdrawalId = generateId('withdrawal', openid!)
    // M8: outTradeNo 增强唯一性——原 1/1000 碰撞风险改为 1/1000000
    //   格式：WD + 13位时间戳 + 6位随机数（同毫秒并发碰撞概率 1/1000000）
    const outTradeNo = `WD${Date.now()}${String(Math.floor(Math.random() * 1000000)).padStart(6, '0')}`

    // P1-4: 钱包扣减 + 提现记录创建 纳入单一事务，防止资金丢失
    const transaction = await db.startTransaction()
    // H6: 使用 transaction.command 替代 db.command，确保事务原子性
    //   project_memory 硬约束：Transaction operations in wallet services must use
    //   transaction.collection() instead of db.collection() to ensure atomicity
    const _tx = transaction.command
    try {
      // 事务内重新查询最新余额（防止并发超提）
      const freshWalletRes = await transaction.collection('wallets').doc(w._id!).get()
      const freshWallet = freshWalletRes.data as WalletRecord | null
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

      // 扣减余额、增加冻结金额（使用 _tx.inc 而非 _.inc）
      await transaction.collection('wallets').doc(w._id!).update({
        data: { balance: _tx.inc(-withdrawAmount), frozenAmount: _tx.inc(withdrawAmount), updatedAt: db.serverDate() },
      })

      // 创建提现记录
      // H1: 包含 nickName 字段（硬约束：partnerService wallet withdrawal records must include nickName field）
      // H2: 包含 _id / outTradeNo / transferSceneId，供 adminService 审批后发起微信转账
      // H3: 状态改为 awaiting_confirm（硬约束：Withdrawal records have states: awaiting_confirm, completed, failed, cancelled）
      await transaction.collection('withdrawals').add({
        data: {
          _id: withdrawalId,
          outTradeNo,
          openid,
          walletType,
          nickName,
          amount: withdrawAmount,
          method: 'wechat',
          status: 'awaiting_confirm',
          // H2: packageInfo 待 adminService 审批后回填（mchId/appId/package）
          transferSceneId: process.env.WECHAT_TRANSFER_SCENE_ID || '',
          createdAt: db.serverDate(),
          updatedAt: db.serverDate(),
        },
      })

      await transaction.commit()
      return handleSuccess({ message: '提现申请已提交', withdrawalId, outTradeNo })
    } catch (txError) {
      // M4: 事务回滚失败不再静默吞错，记录 warn 日志便于排查
      try { await transaction.rollback() } catch (rbErr) {
        logger.warn('requestWithdrawal.rollback_failed', {
          openid, withdrawalId, msg: (rbErr as Error).message,
        })
      }
      throw txError
    }
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
