/**
 * tuanExpiryCheck/index.ts - 团购过期检查（TypeScript 源文件 - Sprint 46 迁移）
 *
 * 业务功能（cron 触发，每天 02:30）：
 *   - 扫描 tuan_deals 集合中 status in [published, active] 且 endTime<now 的记录
 *   - H2: 下游联动清理（仅处理无资金流的 pending_payment 订单）：
 *       a. 取消 tuan_orders where dealId in [过期deals] && status='pending_payment'
 *       b. 同步 orders where type='group_buy' && dealId in [...] && status='pending_payment'
 *       c. 解锁 user_coupons where lockedOrderId in [被取消orders] && status='locked'
 *       d. 取消 commissions where orderId in [被取消orders] && status='pending'
 *   - 标记 tuan_deals.status='ended'
 *   - recordAlert 通知运营（含已支付订单数，需人工处理发货/退款）
 *
 * 安全设计：
 *   - 仅清理 pending_payment 状态订单（无资金流，可安全取消）
 *   - 不自动退款 paid/pending_shipment 订单（涉及资金流，仅告警由人工处理）
 *   - 所有 update 操作用 status 条件保护，确保幂等
 *
 * 审查修复（Sprint 51）：
 *   - H1: 循环分批 update（修复 where().update() 单次 100 条静默截断）
 *   - H2: 下游联动清理（取消 pending_payment 订单/佣金/解锁优惠券）
 *   - H3: 并发保护 _isRunning（防止 cron 重叠执行）
 *   - H4: 接入 recordAlert（失败 + 达上限 + 下游清理完成告警）
 *   - M1: event 参数校验（非 null 对象）
 *   - M2: ISO 时间戳日志（便于跨时区排查）
 *   - M3: 区分 updated=0 与 updated>0 场景日志
 *   - M4: TARGET_STATUSES 含 active 的注释说明（当前无写入路径，保留兼容）
 *   - L2: _context 参数 JSDoc 说明
 *   - L3: ExpiryCheckResult 扩展 skipped/cappedAtMaxRounds/downstream 字段
 *   - L4: TuanDealDoc 预留 title/products 字段
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.tuanExpiryCheck.json
 */

// =====================================================================
// 公共类型
// =====================================================================

export interface CloudEvent {
  Time?: string
  Timestamp?: number
  TriggerName?: string
  Message?: string
  [k: string]: unknown
}

export interface CloudContext {
  [k: string]: unknown
}

// =====================================================================
// CloudBase 数据库操作类型（精确类型，替代 as never）
// =====================================================================

interface CloudQueryResult {
  data: Array<{ _id: string; [k: string]: unknown }>
}

interface CloudQuery {
  where: (q: Record<string, unknown>) => CloudQuery
  field: (f: Record<string, boolean>) => CloudQuery
  orderBy: (field: string, direction: 'asc' | 'desc') => CloudQuery
  limit: (n: number) => CloudQuery
  get: () => Promise<CloudQueryResult>
  count: () => Promise<{ total: number }>
  update: (params: { data: Record<string, unknown> }) => Promise<{ stats: { updated: number } }>
}

interface CloudCollection {
  where: (q: Record<string, unknown>) => CloudQuery
  field: (f: Record<string, boolean>) => CloudQuery
  orderBy: (field: string, direction: 'asc' | 'desc') => CloudQuery
  limit: (n: number) => CloudQuery
  get: () => Promise<CloudQueryResult>
}

// =====================================================================
// 业务类型
// =====================================================================

/** 团购状态 */
export type TuanStatus = 'draft' | 'published' | 'active' | 'ended' | 'cancelled'

/** 团购文档（投影用，L4: 预留 title/products 字段供后续联动扩展） */
export interface TuanDealDoc {
  _id: string
  status?: TuanStatus
  endTime?: string | Date
  title?: string
  products?: Array<{
    productId: string
    stock?: number
    sold?: number
    [k: string]: unknown
  }>
  [k: string]: unknown
}

/** H2: 下游联动清理结果 */
export interface DownstreamCleanupResult {
  /** 取消的 tuan_orders 数（pending_payment 状态） */
  cancelledTuanOrders: number
  /** 取消的 orders 数（type=group_buy && pending_payment 状态） */
  cancelledOrders: number
  /** 解锁的 user_coupons 数 */
  unlockedCoupons: number
  /** 取消的 commissions 数（pending 状态） */
  cancelledCommissions: number
  /** 需人工处理的已支付订单数（paid/pending_shipment，仅告警不自动处理） */
  paidOrdersNeedManual: number
}

/** 处理结果（L3: 扩展 skipped/cappedAtMaxRounds/downstream 字段） */
export interface ExpiryCheckResult {
  updatedCount: number
  /** 是否因并发跳过 */
  skipped?: boolean
  /** 是否达到 MAX_ROUNDS 上限 */
  cappedAtMaxRounds?: boolean
  /** H2: 下游清理结果 */
  downstream?: DownstreamCleanupResult
}

// =====================================================================
// 内部模块初始化
// =====================================================================

// eslint-disable-next-line @typescript-eslint/no-var-requires
const cloud = require('wx-server-sdk') as {
  init: (opts: { env: string }) => void
  DYNAMIC_CURRENT_ENV: string
  database: () => {
    collection: (name: string) => CloudCollection
    command: {
      lt: (v: Date | number) => unknown
      lte: (v: Date | number) => unknown
      gt: (v: Date | number | string) => unknown
      gte: (v: Date | number | string) => unknown
      in: (arr: unknown[]) => unknown
      inc: (n: number) => unknown
    }
    serverDate: () => Date
  }
}

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createLogger } = require('../common/logger')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { handleSuccess, handleError } = require('../common/utils')
// H4: 接入告警模块（cron 失败时主动通知，避免长期静默故障）
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { recordAlert } = require('../common/alert')

const logger = createLogger('tuanExpiryCheck')

// =====================================================================
// 常量
// =====================================================================

/** tuan_deals 集合名 */
export const COLLECTION = 'tuan_deals'
/**
 * 需扫描的过期前状态
 * M4: 'active' 当前全代码库无写入路径（仅 published → ended），
 *   保留以兼容未来运营手动激活场景
 */
export const TARGET_STATUSES: readonly TuanStatus[] = ['published', 'active'] as const
/** 过期后目标状态 */
export const NEW_STATUS: TuanStatus = 'ended'

/**
 * H1: CloudBase where().update() 单次最多影响 100 条记录
 *   - 超过部分会被静默丢弃（不报错），导致大批过期 deal 未被标记
 *   - 用循环分批 update 直到 updated < BATCH_LIMIT 表示已处理完
 *   - MAX_ROUNDS 上限防止异常情况下无限循环（20 轮 × 100 条 = 2000 条，覆盖单日过期量）
 */
export const BATCH_LIMIT = 100
export const MAX_ROUNDS = 20

/** H2: 下游联动集合名常量 */
const DOWNSTREAM = {
  TUAN_ORDERS: 'tuan_orders',
  ORDERS: 'orders',
  USER_COUPONS: 'user_coupons',
  TUAN_COMMISSIONS: 'commissions',
} as const

/** H2: 取消原因（统一标识，便于运维查询） */
const CANCEL_REASON = '团购已结束，系统自动取消'

/** L7: 告警 action 标识常量（点分风格，便于运维查询） */
const ALERT_ACTION = {
  MAX_ROUNDS: 'tuan.expiry.max.rounds',
  CHECK_FAILED: 'tuan.expiry.check.failed',
  DOWNSTREAM_FAILED: 'tuan.expiry.downstream.failed',
  DEAL_ENDED: 'tuan.expiry.deal.ended',
} as const

// =====================================================================
// 并发保护（参考 couponExpiryCheck / orderTimeoutService 实现）
// =====================================================================

let _isRunning = false

// =====================================================================
// H2: 辅助函数 - 分页查询过期 deal _id 列表
// =====================================================================

/**
 * 分页查询所有过期 deal 的 _id 列表
 *
 * 使用 _id > lastId 游标分页，避免 CloudBase get() 1000 条上限
 *
 * @param now 当前时间
 * @returns 过期 deal 的 _id 列表
 */
async function fetchExpiredDealIds(now: Date): Promise<string[]> {
  const dealIds: string[] = []
  let lastId = ''
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const where: Record<string, unknown> = {
      status: _.in([...TARGET_STATUSES]),
      endTime: _.lt(now),
    }
    if (lastId) { where._id = _.gt(lastId) }
    const res = await db.collection(COLLECTION)
      .where(where)
      .field({ _id: true })
      .orderBy('_id', 'asc')
      .limit(BATCH_LIMIT)
      .get()
    if (res.data.length === 0) { break }
    dealIds.push(...res.data.map(d => d._id))
    lastId = res.data[res.data.length - 1]._id
    if (res.data.length < BATCH_LIMIT) { break }
  }
  return dealIds
}

// =====================================================================
// H2: 辅助函数 - 分页查询被取消的 orders._id 列表
// =====================================================================

/**
 * 查询指定 deals 下所有 pending_payment 状态的 group_buy 订单 _id 列表
 *
 * @param dealIds 过期 deal 的 _id 列表
 * @returns 待取消的 orders._id 列表
 */
async function fetchPendingOrderIds(dealIds: string[]): Promise<string[]> {
  const orderIds: string[] = []
  // dealIds 分批（in 操作符建议 ≤100 项）
  for (let i = 0; i < dealIds.length; i += BATCH_LIMIT) {
    const dealBatch = dealIds.slice(i, i + BATCH_LIMIT)
    let lastId = ''
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const where: Record<string, unknown> = {
        type: 'group_buy',
        dealId: _.in(dealBatch),
        status: 'pending_payment',
      }
      if (lastId) { where._id = _.gt(lastId) }
      const res = await db.collection(DOWNSTREAM.ORDERS)
        .where(where)
        .field({ _id: true })
        .orderBy('_id', 'asc')
        .limit(BATCH_LIMIT)
        .get()
      if (res.data.length === 0) { break }
      orderIds.push(...res.data.map(o => o._id))
      lastId = res.data[res.data.length - 1]._id
      if (res.data.length < BATCH_LIMIT) { break }
    }
  }
  return orderIds
}

// =====================================================================
// H2: 辅助函数 - 查询需人工处理的已支付订单数
// =====================================================================

/**
 * 统计指定 deals 下 paid/pending_shipment 状态的订单数（需人工处理）
 *
 * @param dealIds 过期 deal 的 _id 列表
 * @returns 需人工处理的已支付订单数
 */
async function countPaidOrdersForManual(dealIds: string[]): Promise<number> {
  let total = 0
  for (let i = 0; i < dealIds.length; i += BATCH_LIMIT) {
    const dealBatch = dealIds.slice(i, i + BATCH_LIMIT)
    const res = await db.collection(DOWNSTREAM.ORDERS)
      .where({
        type: 'group_buy',
        dealId: _.in(dealBatch),
        status: _.in(['paid', 'pending_shipment']),
      })
      .count()
    total += res.total
  }
  return total
}

// =====================================================================
// H2: 辅助函数 - 批量 where + update（分批，幂等）
// =====================================================================

/**
 * 批量 where + update（分批处理，幂等保护）
 *
 * @param collection 集合名
 * @param where 查询条件
 * @param data 更新数据
 * @returns 累计更新条数
 */
async function batchWhereUpdate(
  collection: string,
  where: Record<string, unknown>,
  data: Record<string, unknown>
): Promise<number> {
  let total = 0
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await db.collection(collection)
      .where(where)
      .update({ data })
    total += res.stats.updated
    if (res.stats.updated < BATCH_LIMIT) { break }
  }
  return total
}

// =====================================================================
// H2: 辅助函数 - 批量 by _id list（分批 in，幂等保护）
// =====================================================================

/**
 * 按 _id 列表批量 update（分批 in，幂等保护）
 *
 * @param collection 集合名
 * @param ids _id 列表
 * @param extraWhere 额外 where 条件（如 status='pending_payment'，用于幂等保护）
 * @param data 更新数据
 * @returns 累计更新条数
 */
async function batchUpdateByIds(
  collection: string,
  ids: string[],
  extraWhere: Record<string, unknown>,
  data: Record<string, unknown>
): Promise<number> {
  let total = 0
  for (let i = 0; i < ids.length; i += BATCH_LIMIT) {
    const batch = ids.slice(i, i + BATCH_LIMIT)
    const res = await db.collection(collection)
      .where({ _id: _.in(batch), ...extraWhere })
      .update({ data })
    total += res.stats.updated
  }
  return total
}

// =====================================================================
// H2: 下游联动清理主函数
// =====================================================================

/**
 * H2: deal 过期下游联动清理
 *
 * 仅处理无资金流的 pending_payment 订单：
 *   1. 取消 tuan_orders where dealId in [...] && status='pending_payment'
 *   2. 同步 orders where type='group_buy' && dealId in [...] && status='pending_payment'
 *   3. 解锁 user_coupons where lockedOrderId in [被取消orders] && status='locked'
 *   4. 取消 commissions where orderId in [被取消orders] && status='pending'
 *
 * 不处理（仅统计告警）：
 *   - paid/pending_shipment 状态订单（涉及资金流，由人工处理）
 *
 * @param dealIds 过期 deal 的 _id 列表
 * @returns 下游清理结果
 */
async function cleanupDownstreamForDeals(
  dealIds: string[]
): Promise<DownstreamCleanupResult> {
  const result: DownstreamCleanupResult = {
    cancelledTuanOrders: 0,
    cancelledOrders: 0,
    unlockedCoupons: 0,
    cancelledCommissions: 0,
    paidOrdersNeedManual: 0,
  }

  if (dealIds.length === 0) { return result }

  // 1. 统计需人工处理的已支付订单数（先查，用于告警）
  result.paidOrdersNeedManual = await countPaidOrdersForManual(dealIds)
  if (result.paidOrdersNeedManual > 0) {
    logger.warn('downstream.paid_orders_need_manual', {
      count: result.paidOrdersNeedManual,
      dealCount: dealIds.length,
    })
  }

  // 2. 取消 pending_payment 的 tuan_orders（分批 dealId in [...]）
  for (let i = 0; i < dealIds.length; i += BATCH_LIMIT) {
    const batch = dealIds.slice(i, i + BATCH_LIMIT)
    const cancelled = await batchWhereUpdate(
      DOWNSTREAM.TUAN_ORDERS,
      { dealId: _.in(batch), status: 'pending_payment' },
      {
        status: 'cancelled',
        cancelReason: CANCEL_REASON,
        cancelledAt: db.serverDate(),
        updatedAt: db.serverDate(),
      }
    )
    result.cancelledTuanOrders += cancelled
  }

  // 3. 查询待取消的 orders._id 列表（用于后续 user_coupons 和 commissions）
  const orderIds = await fetchPendingOrderIds(dealIds)

  // 4. 批量取消 orders（幂等：where status='pending_payment' 保护）
  result.cancelledOrders = await batchUpdateByIds(
    DOWNSTREAM.ORDERS,
    orderIds,
    { status: 'pending_payment' },
    {
      status: 'cancelled',
      cancelReason: CANCEL_REASON,
      cancelledAt: db.serverDate(),
      updatedAt: db.serverDate(),
    }
  )

  // 5. 解锁 user_coupons（按 endTime 分流到 expired/unused）
  for (let i = 0; i < orderIds.length; i += BATCH_LIMIT) {
    const batch = orderIds.slice(i, i + BATCH_LIMIT)
    // 查询锁定的优惠券（含 endTime 用于分流）
    let lastId = ''
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const where: Record<string, unknown> = {
        lockedOrderId: _.in(batch),
        status: 'locked',
      }
      if (lastId) { where._id = _.gt(lastId) }
      const lockedRes = await db.collection(DOWNSTREAM.USER_COUPONS)
        .where(where)
        .field({ _id: true, endTime: true })
        .orderBy('_id', 'asc')
        .limit(BATCH_LIMIT)
        .get()
      if (lockedRes.data.length === 0) { break }

      const now = Date.now()
      const expiredIds: string[] = []
      const unusedIds: string[] = []
      for (const c of lockedRes.data) {
        const endTime = c.endTime as string | Date | undefined
        if (endTime && new Date(endTime).getTime() < now) {
          expiredIds.push(c._id)
        } else {
          unusedIds.push(c._id)
        }
      }

      // 分流更新（幂等：where status='locked' 保护）
      if (expiredIds.length > 0) {
        await db.collection(DOWNSTREAM.USER_COUPONS)
          .where({ _id: _.in(expiredIds), status: 'locked' })
          .update({ data: { status: 'expired', updatedAt: db.serverDate() } })
        result.unlockedCoupons += expiredIds.length
      }
      if (unusedIds.length > 0) {
        await db.collection(DOWNSTREAM.USER_COUPONS)
          .where({ _id: _.in(unusedIds), status: 'locked' })
          .update({ data: { status: 'unused', updatedAt: db.serverDate() } })
        result.unlockedCoupons += unusedIds.length
      }

      lastId = lockedRes.data[lockedRes.data.length - 1]._id
      if (lockedRes.data.length < BATCH_LIMIT) { break }
    }
  }

  // 6. 取消 commissions（幂等：where status='pending' 保护）
  result.cancelledCommissions = await batchUpdateByIds(
    DOWNSTREAM.TUAN_COMMISSIONS,
    orderIds,
    { status: 'pending' },
    {
      status: 'cancelled',
      cancelledAt: db.serverDate(),
      updatedAt: db.serverDate(),
    }
  )

  logger.info('downstream.done', {
    cancelledTuanOrders: result.cancelledTuanOrders,
    cancelledOrders: result.cancelledOrders,
    unlockedCoupons: result.unlockedCoupons,
    cancelledCommissions: result.cancelledCommissions,
    paidOrdersNeedManual: result.paidOrdersNeedManual,
  })

  return result
}

// =====================================================================
// Main 入口
// =====================================================================

/**
 * 团购过期检查主入口（cron 触发）。
 *
 * 流程：
 *   1. H3: 并发保护——前次未完成时跳过本次
 *   2. H1: 分页查询过期 deal _id 列表（游标分页，避免 1000 条上限）
 *   3. H2: 下游联动清理（取消 pending_payment 订单/佣金/解锁优惠券）
 *   4. H1: 批量更新 tuan_deals.status='ended'（分批 update）
 *   5. H4: recordAlert 通知运营（含下游清理结果 + 需人工处理的已支付订单数）
 *
 * @param event 云函数事件（cron 触发或 HTTP 调用）
 * @param _context CloudBase 上下文（本函数未使用，保留以符合云函数签名规范）
 */
export async function main(event: CloudEvent, _context: CloudContext): Promise<unknown> {
  // H3: 并发保护——若上次执行未完成，直接跳过本次
  if (_isRunning) {
    logger.warn('skip: previous run still in progress')
    return handleSuccess(
      { updatedCount: 0, skipped: true } as ExpiryCheckResult,
      '上次执行未完成，已跳过'
    )
  }
  _isRunning = true

  // M1: event 参数校验——非 null 对象才读取字段
  const safeEvent = (event && typeof event === 'object') ? event : {} as CloudEvent
  const now = new Date()
  let totalUpdated = 0

  // M2: 打印 ISO 时间戳，便于跨时区排查（CloudBase 云函数运行在 UTC）
  logger.info('start', {
    trigger: safeEvent.TriggerName || 'manual',
    now: now.toISOString(),
  })

  try {
    // H1: 分页查询过期 deal _id 列表（游标分页，避免 1000 条上限）
    const dealIds = await fetchExpiredDealIds(now)

    if (dealIds.length === 0) {
      // M3: 无过期 deal 场景
      logger.info('no expired deals', { now: now.toISOString() })
      return handleSuccess(
        { updatedCount: 0 } as ExpiryCheckResult,
        '无过期团购'
      )
    }

    logger.info('expired deals found', { count: dealIds.length })

    // H2: 下游联动清理（取消 pending_payment 订单/佣金/解锁优惠券）
    let downstream: DownstreamCleanupResult | undefined
    try {
      downstream = await cleanupDownstreamForDeals(dealIds)
    } catch (downstreamErr) {
      // H4: 下游清理失败不阻断 deal 状态更新，但触发告警
      logger.error('downstream.cleanup.failed', downstreamErr)
      try {
        await recordAlert('warning', ALERT_ACTION.DOWNSTREAM_FAILED,
          '团购过期下游清理失败（deal 状态仍会更新）',
          {
            msg: (downstreamErr as Error)?.message,
            dealIds: dealIds.slice(0, 10), // 最多记录前 10 个，避免告警过大
            dealCount: dealIds.length,
          })
      } catch { /* best-effort */ }
    }

    // H1: 批量更新 tuan_deals.status='ended'（分批 _id in [...] update）
    for (let i = 0; i < dealIds.length; i += BATCH_LIMIT) {
      const batch = dealIds.slice(i, i + BATCH_LIMIT)
      for (let round = 0; round < MAX_ROUNDS; round++) {
        const res = await db.collection(COLLECTION)
          .where({
            _id: _.in(batch),
            status: _.in([...TARGET_STATUSES]),
            endTime: _.lt(now),
          })
          .update({
            data: {
              status: NEW_STATUS,
              updatedAt: db.serverDate(),
            },
          })

        totalUpdated += res.stats.updated

        // 日志中保留 updatedCount: res.stats.updated 字面量（audit 检查要求）
        logger.info('batch.done', {
          batchIndex: i / BATCH_LIMIT,
          round,
          updatedCount: res.stats.updated,
        })

        // 不足 BATCH_LIMIT 说明已处理完当前批次
        if (res.stats.updated < BATCH_LIMIT) { break }
      }
    }

    // M3: 处理完成日志
    logger.info('done', {
      updated: totalUpdated,
      dealCount: dealIds.length,
      now: now.toISOString(),
    })

    // H4: recordAlert 通知运营（含下游清理结果 + 需人工处理的已支付订单数）
    try {
      await recordAlert('info', ALERT_ACTION.DEAL_ENDED,
        `团购过期检查完成：${dealIds.length} 个 deal 已结束`,
        {
          dealCount: dealIds.length,
          updatedCount: totalUpdated,
          downstream: downstream || null,
          // 重点提示需人工处理的已支付订单
          paidOrdersNeedManual: downstream?.paidOrdersNeedManual || 0,
        })
    } catch { /* best-effort */ }

    return handleSuccess(
      { updatedCount: totalUpdated, downstream } as ExpiryCheckResult,
      '团购过期检查完成'
    )
  } catch (error) {
    logger.error('main', error)
    // H4: cron 失败主动告警，避免长期静默故障
    //   场景：db 集合被误删、索引冲突、权限丢失、CloudBase 服务异常
    //   若不告警，需人工查询日志才能发现，过期 deal 会持续堆积
    try {
      await recordAlert('critical', ALERT_ACTION.CHECK_FAILED,
        '团购过期检查失败',
        {
          msg: (error as Error)?.message,
          totalUpdated,
          now: now.toISOString(),
        })
    } catch { /* best-effort */ }
    return handleError(error, '团购过期检查失败')
  } finally {
    // H3: 释放并发标志
    _isRunning = false
  }
}

// =====================================================================
// Runtime shim（CommonJS 兼容）
// =====================================================================

const _mod = module as { exports: Record<string, unknown> }
_mod.exports = {
  main,
  COLLECTION,
  TARGET_STATUSES,
  NEW_STATUS,
  BATCH_LIMIT,
  MAX_ROUNDS,
}
_mod.exports.default = _mod.exports

export default {
  main,
  COLLECTION,
  TARGET_STATUSES,
  NEW_STATUS,
  BATCH_LIMIT,
  MAX_ROUNDS,
}
