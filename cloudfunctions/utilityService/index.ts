/**
 * utilityService/index.ts - 通用工具服务（TypeScript 源文件 - Sprint 46 迁移）
 *
 * 业务功能：
 *   - getBanners - 拉取首页 banner 列表（带内存缓存，TTL 5 分钟）
 *   - getHostInfo - 拉取寄养家庭简要信息
 *   - getHomeFeed - 首页聚合 BFF（云资源优化：6 次调用 → 1 次，直查 DB 无 count）
 *
 * 迁移目标：
 *   - 强类型化 2 个 action handler 签名
 *   - 抽离 BannerItem / HostInfo 接口
 *   - 内联 createLogger（与原代码保持一致，避免 ../common/logger 部署问题）
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.utilityService.json
 */

// =====================================================================
// 公共类型
// =====================================================================

export interface CloudEvent {
  action?: string
  data?: Record<string, unknown>
  body?: string | Record<string, unknown>
  Time?: string
  Timestamp?: number
  TriggerName?: string
  Message?: string
  [k: string]: unknown
}

// =====================================================================
// 业务类型
// =====================================================================

/** Banner 文档（原始） */
export interface BannerDoc {
  _id: string
  imageUrl?: string
  title?: string
  subtitle?: string
  tag?: string
  ctaText?: string
  actionType?: string
  actionTarget?: string
  status?: 'active' | 'inactive'
  sortOrder?: number
  [k: string]: unknown
}

/** Banner 列表项（投影）
 * 字段名与数据库 banners 集合、首页 wxml 绑定保持一致，
 * 避免无意义的字段重命名导致前后端错配。
 */
export interface BannerItem {
  id: string
  imageUrl: string
  title: string
  subtitle: string
  tag: string
  ctaText: string
  actionType: string
  actionTarget: string
}

/** Banner 列表结果（带缓存） */
export interface BannerListResult {
  list: BannerItem[]
}

/** 寄养家庭公开信息（M5: 与 getHostInfo 实际返回对齐，不含 openid 等隐私数据） */
export interface HostInfoResult {
  hostName: string
  pricePerDay: number
  avatarUrl: string
}

/** 寄养家庭档案（L2: 从模块初始化区移到类型区，保持类型定义集中） */
export interface HostProfileDoc {
  _id: string
  openid?: string
  hostName?: string
  pricePerDay?: number
  avatarUrl?: string
  [k: string]: unknown
}

// =====================================================================
// 内部模块初始化
// =====================================================================

// eslint-disable-next-line @typescript-eslint/no-var-requires
const cloud = require('wx-server-sdk') as {
  init: (opts: { env: string }) => void
  DYNAMIC_CURRENT_ENV: string
  getWXContext: () => { OPENID?: string }
  database: () => UtilityDB
}

/** 宽松查询链（getHomeFeed 直查各集合用，字段以投影收窄） */
interface QueryChain {
  where: (q: Record<string, unknown>) => QueryChain
  field: (p: Record<string, boolean>) => QueryChain
  orderBy: (field: string, direction: 'asc' | 'desc') => QueryChain
  skip: (n: number) => QueryChain
  limit: (n: number) => QueryChain
  get: () => Promise<{ data: Record<string, unknown>[] }>
}

/** aggregate 链（products 缺货沉底排序，与 mallService.getProductList 同口径） */
interface AggregateChain {
  match: (q: Record<string, unknown>) => AggregateChain
  addFields: (f: Record<string, unknown>) => AggregateChain
  sort: (s: Record<string, number>) => AggregateChain
  project: (p: Record<string, number>) => AggregateChain
  skip: (n: number) => AggregateChain
  limit: (n: number) => AggregateChain
  end: () => Promise<{ list: Record<string, unknown>[] }>
}

interface UtilityDB {
  collection: (name: string) => {
    where: (q: Record<string, unknown>) => QueryChain
    aggregate?: () => AggregateChain
    doc: (id: string) => { get: () => Promise<{ data: HostProfileDoc | null }> }
  }
  command: {
    in: (arr: unknown[]) => unknown
    nin: (arr: unknown[]) => unknown
    lte: (v: unknown) => unknown
    gte: (v: unknown) => unknown
    neq: (v: unknown) => unknown
    aggregate: {
      cond: (o: Record<string, unknown>) => unknown
      gt: (args: unknown[]) => unknown
      ifNull: (args: unknown[]) => unknown
    }
  }
  serverDate: () => Date
}

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// P2-001: 使用项目统一日志模块（与其它 11 个服务保持一致）
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createLogger } = require('./common/logger')
const logger = createLogger('utilityService')

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { handleSuccess, handleError, convertCloudUrls } = require('./common/utils')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { err } = require('./common/errors')
// M3: 引入限流（bootstrap + withRateLimit），对齐 mallService/tuanService 模式
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { withRateLimit } = require('./common/risk-rate-limit')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { bootstrapRateLimit } = require('./common/rate-limit-bootstrap')

// M3: 注入全局限流存储（rate_limits + rate_limit_configs 一次注入）
//   - 失败时 fallback 到内存存储（不阻断业务）
try {
  bootstrapRateLimit(db, { logger })
} catch (e) {
  logger.warn('bootstrapRateLimit failed, fallback to memory:', e && (e as Error).message)
}

// =====================================================================
// 常量与缓存
// =====================================================================

export const BANNERS_CACHE_TTL = 300000
export const BANNER_FETCH_LIMIT = 10

let _bannersCache: BannerListResult | null = null
let _bannersCacheTime = 0

// =====================================================================
// Action 1：getBanners
// =====================================================================

export async function getBanners(): Promise<BannerListResult> {
  try {
    const now = Date.now()
    if (_bannersCache && now - _bannersCacheTime < BANNERS_CACHE_TTL) {
      return _bannersCache
    }

    const res = await db.collection('banners')
      .where({ status: 'active' })
      .orderBy('sortOrder', 'asc')
      .limit(BANNER_FETCH_LIMIT)
      .get()

    const list: BannerItem[] = ((res.data || []) as BannerDoc[]).map(b => ({
      id: b._id,
      imageUrl: b.imageUrl || '',
      title: b.title || '',
      subtitle: b.subtitle || '',
      tag: b.tag || '',
      ctaText: b.ctaText || '',
      actionType: b.actionType || '',
      actionTarget: b.actionTarget || '',
    }))

    _bannersCache = { list }
    _bannersCacheTime = now
    return _bannersCache
  } catch (e) {
    // H1: DB 异常不再静默返回空 list，而是记录告警后抛出，让 main 入口统一处理
    //   - 原 catch 返回 { list: [] } 会掩盖 banners 集合故障，运维无法感知
    //   - 现在改为 recordAlert + 抛错，前端可按错误码降级（如显示占位图）
    logger.error('getBanners.failed', e)
    try {
      const { recordAlert } = require('./common/alert')
      await recordAlert('warning', 'utility.banners.fetch.failed',
        '获取 banner 列表失败',
        { error: (e as Error)?.message })
    } catch { /* best-effort */ }
    throw err('BUSINESS_ERROR', '获取 banner 列表失败，请稍后重试')
  }
}

/** 清除 banner 缓存（供测试 / 数据更新时调用） */
export function clearBannersCache(): void {
  _bannersCache = null
  _bannersCacheTime = 0
}

// =====================================================================
// Action 2：getHostInfo
// =====================================================================

export async function getHostInfo(event: CloudEvent): Promise<unknown> {
  const { hostId } = event
  if (!hostId) { throw err('MISSING_REQUIRED', '缺少 hostId 参数') }

  // M1: hostId 格式白名单校验（仅允许字母数字下划线短横，长度 1-100）
  //   - 原校验仅阻止 '..' 和长度>100，未防其他特殊字符
  //   - CloudBase doc() 虽内置防注入，但仍应限制输入格式
  const hostIdStr = String(hostId)
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(hostIdStr)) {
    throw err('INVALID_PARAMS', 'hostId 格式无效')
  }

  // M3: 限流防 hostId 枚举（同 openid 10次/分钟）
  try {
    await withRateLimit(
      { userId: hostIdStr, type: 'utility_host_info', targetId: hostIdStr },
      async () => ({ ok: true })
    )
  } catch (e) {
    if (e && typeof e === 'object' && (e as { name?: string }).name === 'BusinessError') {throw e}
    throw err('RISK_REJECT', '查询过于频繁，请稍后重试')
  }

  // M6: DB 查询异常包装，记录告警后抛出（对齐 getBanners 的错误处理模式）
  //   - 原代码 DB 异常直接抛到 main，丢失 hostId 上下文，运维无法定位
  //   - 现在 recordAlert + 抛 BUSINESS_ERROR，便于监控告警
  let hostRes: { data: HostProfileDoc | null }
  try {
    hostRes = await db.collection('hostProfiles').doc(hostIdStr).get()
  } catch (e) {
    logger.error('getHostInfo.db.failed', { hostId: hostIdStr, error: (e as Error)?.message })
    try {
      const { recordAlert } = require('./common/alert')
      await recordAlert('warning', 'utility.host_info.fetch.failed',
        '获取寄养家庭信息失败',
        { hostId: hostIdStr, error: (e as Error)?.message })
    } catch { /* best-effort */ }
    throw err('BUSINESS_ERROR', '获取寄养家庭信息失败，请稍后重试')
  }
  if (!hostRes.data) { throw err('HOST_NOT_FOUND', '找不到对应的寄养家庭信息') }

  const host = hostRes.data
  // 不返回 openid（隐私数据），只返回公开信息
  return handleSuccess({
    hostName: host.hostName || '',
    pricePerDay: host.pricePerDay || 0,
    avatarUrl: host.avatarUrl || '',
  }, '获取成功')
}

// =====================================================================
// Action 3：getHomeFeed - 首页聚合 BFF（云资源优化）
// =====================================================================
// 一次调用返回首页全部板块（banner / 团购 / 活动 / 商城商品，
// 登录时附宠物 + 可签到活动），替代原先 6 次独立云函数调用
// （各服务还各含 1 次 count）。查询口径与原各服务实现对齐：
//   - tuan：tuanService.getTuanDealList（status/时间窗 + minPrice 计算）
//   - activities：activityService.getActivityList({status:'published'})
//   - products：mallService.getProductList（缺货沉底 aggregate 排序）
//   - pets：petService.getPetList（ownerId + isActive 投影）
//   - 报名：activityService.getRegistrationList（活动字段 + 报名字段合并）
// 全部直查 DB、带字段投影、无 count。

/** 首页各板块拉取条数（与原 behavior 单独调用时的参数一致） */
export const HOME_FEED_TUAN_LIMIT = 4
export const HOME_FEED_ACTIVITY_LIMIT = 10
export const HOME_FEED_PRODUCT_LIMIT = 6
export const HOME_FEED_PET_LIMIT = 10
export const HOME_FEED_REGISTRATION_LIMIT = 20

/** 团购最低价（与 tuanService.computeMinPrice 同口径） */
function computeTuanMinPrice(products: unknown[]): number {
  let min = Infinity
  for (const p of products) {
    const item = p as {
      tuanPrice?: unknown, skuType?: unknown,
      skus?: Array<{ enabled?: unknown, tuanPrice?: unknown, price?: unknown }>
    }
    if (item.skuType === 'multi' && item.skus && item.skus.length > 0) {
      for (const sku of item.skus) {
        if (sku.enabled !== false) {
          const price = Number(sku.tuanPrice) || Number(sku.price) || Infinity
          if (price < min) { min = price }
        }
      }
    } else {
      const price = Number(item.tuanPrice) || 0
      if (price > 0 && price < min) { min = price }
    }
  }
  return min === Infinity ? 0 : min
}

export async function getHomeFeed(event: CloudEvent): Promise<unknown> {
  const _ = db.command
  const withUser = event.withUser === true
  const openid = (cloud.getWXContext() || {}).OPENID || ''
  const now = new Date()

  // 公共板块并行直查（失败降级为空板块，不阻断整页）
  const [banners, tuanRes, actRes, prodList] = await Promise.all([
    getBanners().catch(() => ({ list: [] as BannerItem[] })),
    db.collection('tuan_deals')
      .where({ status: _.in(['published', 'active']), startTime: _.lte(now), endTime: _.gte(now) })
      .field({ _id: true, title: true, coverUrl: true, products: true, endTime: true, totalOrders: true })
      .orderBy('createdAt', 'desc')
      .limit(HOME_FEED_TUAN_LIMIT)
      .get()
      .catch(() => ({ data: [] as Record<string, unknown>[] })),
    db.collection('activities')
      .where({ status: 'published' })
      .field({
        _id: true, title: true, coverUrl: true, startTime: true, endTime: true,
        location: true, price: true, pricePerPerson: true, pricePerPet: true,
        currentParticipants: true, maxParticipants: true, category: true, createdAt: true,
      })
      .orderBy('createdAt', 'desc')
      .limit(HOME_FEED_ACTIVITY_LIMIT)
      .get()
      .catch(() => ({ data: [] as Record<string, unknown>[] })),
    (async (): Promise<Record<string, unknown>[]> => {
      // 商品：缺货沉底排序与 mallService.getProductList 同口径（aggregate 现算 _stockFlag）
      // 注意：必须直接链式调用 .aggregate()，不能先解构出方法引用再调用
      // （裸调用会丢失 this，CloudBase aggregate 链内部读 this._collection 崩溃）
      try {
        const $ = _.aggregate
        const res = await db.collection('products')
          .aggregate!()
          .match({ status: 'on_sale' })
          .addFields({
            _stockFlag: $.cond({
              if: $.gt([$.ifNull(['$totalStock', $.ifNull(['$stock', 1])]), 0]),
              then: 1,
              else: 0,
            }),
          })
          .sort({ _stockFlag: -1, isFeatured: -1, createdAt: -1 })
          .project({
            _id: 1, name: 1, coverUrl: 1, coverImage: 1, price: 1, originalPrice: 1,
            soldCount: 1, subTitle: 1, minPrice: 1, isFeatured: 1, createdAt: 1,
          })
          .limit(HOME_FEED_PRODUCT_LIMIT)
          .end()
        return (res.list || []) as Record<string, unknown>[]
      } catch (e) {
        logger.warn('getHomeFeed.products.aggregate', { error: (e as Error)?.message })
      }
      // 兜底：aggregate 不可用时退化为普通查询（仅排序口径降级）
      const res = await db.collection('products')
        .where({ status: 'on_sale' })
        .field({
          _id: true, name: true, coverUrl: true, coverImage: true, price: true,
          originalPrice: true, soldCount: true, subTitle: true, minPrice: true, createdAt: true,
        })
        .orderBy('createdAt', 'desc')
        .limit(HOME_FEED_PRODUCT_LIMIT)
        .get()
        .catch(() => ({ data: [] as Record<string, unknown>[] }))
      return res.data || []
    })(),
  ])

  // 登录态板块（pets + 可签到活动）——原 2 次云函数调用并入本次聚合
  let myPets: Record<string, unknown>[] | null = null
  let myActivities: Record<string, unknown>[] | null = null
  if (withUser && openid) {
    const petRes = await db.collection('pets')
      .where({ ownerId: openid, isActive: 1 })
      .field({ _id: true, name: true, breed: true, birthday: true, avatarUrl: true, gender: true, type: true })
      .orderBy('createdAt', 'desc')
      .limit(HOME_FEED_PET_LIMIT)
      .get()
      .catch(() => ({ data: [] as Record<string, unknown>[] }))
    myPets = petRes.data || []

    const regRes = await db.collection('activity_registrations')
      .where({ ownerId: openid, status: _.in(['pending_payment', 'paid', 'completed']) })
      .field({ _id: true, activityId: true, signInStatus: true })
      .orderBy('createdAt', 'desc')
      .limit(HOME_FEED_REGISTRATION_LIMIT)
      .get()
      .catch(() => ({ data: [] as Record<string, unknown>[] }))
    const registrations = regRes.data || []
    myActivities = []
    if (registrations.length > 0) {
      const activityIds = [...new Set(
        registrations.map(r => String(r.activityId || '')).filter(Boolean)
      )]
      if (activityIds.length > 0) {
        const actInfoRes = await db.collection('activities')
          .where({ _id: _.in(activityIds) })
          .field({ _id: true, title: true, coverUrl: true, location: true, startTime: true, endTime: true })
          .get()
          .catch(() => ({ data: [] as Record<string, unknown>[] }))
        const actMap: Record<string, Record<string, unknown>> = {}
        for (const a of (actInfoRes.data || [])) {
          actMap[String(a._id)] = a
        }
        // 与 activityService.getRegistrationList 返回结构对齐
        // （活动字段 + _registrationId/signInStatus 合并），前端 buildMyActivity 同口径消费
        myActivities = registrations
          .map((r): Record<string, unknown> | null => {
            const act = actMap[String(r.activityId || '')]
            if (!act) { return null }
            return {
              ...act,
              _registrationId: r._id,
              signInStatus: r.signInStatus || 'unsigned',
            }
          })
          .filter((x): x is Record<string, unknown> => x !== null)
      }
    }
  }

  const tuanDeals = (tuanRes.data || []).map(d => ({
    _id: d._id,
    title: d.title || '',
    coverUrl: d.coverUrl || '',
    minPrice: computeTuanMinPrice(Array.isArray(d.products) ? d.products : []),
    totalOrders: d.totalOrders || 0,
    endTime: d.endTime || '',
  }))
  const products = (prodList || []).map(p => ({
    _id: p._id,
    name: p.name || '',
    coverUrl: p.coverUrl || p.coverImage || '',
    price: p.minPrice || p.price || 0,
    originalPrice: p.originalPrice || 0,
    soldCount: p.soldCount || 0,
    subTitle: p.subTitle || '',
  }))

  // cloud:// 图片链接批量转 https 临时直链（递归替换各板块，一次调用）
  const feed = await convertCloudUrls({
    banners: (banners as BannerListResult).list || [],
    tuanDeals,
    activities: actRes.data || [],
    products,
    myPets,
    myActivities,
  })

  return handleSuccess(feed, '获取成功')
}

// =====================================================================
// Handlers 聚合 + Main 入口
// =====================================================================

const handlers: Record<string, (event: CloudEvent) => Promise<unknown>> = {
  getBanners: () => getBanners(),
  getHostInfo,
  getHomeFeed,
}

export async function main(event: CloudEvent): Promise<unknown> {
  try {
    const { action } = event
    if (!action || !handlers[action]) {
      throw err('UNKNOWN_ACTION', `未知 action: ${action || '<empty>'}`)
    }
    const result = await handlers[action](event)
    if (result && typeof result === 'object' && 'code' in result) { return result }
    return handleSuccess(result, '操作成功')
  } catch (e) {
    // M4: 区分 BusinessError 与未知错误
    //   - BusinessError 透传错误码（保留 INVALID_PARAMS/NOT_FOUND/RISK_REJECT 等）
    //   - 未知错误走 handleError 并记录日志
    if (e && typeof e === 'object' &&
        (e as { name?: string }).name === 'BusinessError') {
      return e as unknown
    }
    logger.error('main', e)
    return handleError(e, (e as Error)?.message || 'unknown error')
  }
}

// =====================================================================
// Runtime shim（CommonJS 兼容）
// =====================================================================

const _mod = module as { exports: Record<string, unknown> }
_mod.exports = {
  main,
  getBanners,
  getHostInfo,
  getHomeFeed,
  clearBannersCache,
  BANNERS_CACHE_TTL,
  BANNER_FETCH_LIMIT,
}
_mod.exports.default = _mod.exports

export default {
  main,
  getBanners,
  getHostInfo,
  getHomeFeed,
  clearBannersCache,
  BANNERS_CACHE_TTL,
  BANNER_FETCH_LIMIT,
}
