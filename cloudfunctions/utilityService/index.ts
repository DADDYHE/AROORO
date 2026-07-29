/**
 * utilityService/index.ts - 通用工具服务（TypeScript 源文件 - Sprint 46 迁移）
 *
 * 业务功能：
 *   - getBanners - 拉取首页 banner 列表（带内存缓存，TTL 5 分钟）
 *   - getHostInfo - 拉取寄养家庭简要信息
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
  database: () => {
    collection: (name: string) => {
      where: (q: Record<string, unknown>) => {
        orderBy: (field: string, direction: 'asc' | 'desc') => {
          limit: (n: number) => {
            get: () => Promise<{ data: BannerDoc[] }>
          }
        }
      }
      doc: (id: string) => {
        get: () => Promise<{ data: HostProfileDoc | null }>
      }
    }
    serverDate: () => Date
  }
}

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// P2-001: 使用项目统一日志模块（与其它 11 个服务保持一致）
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createLogger } = require('./common/logger')
const logger = createLogger('utilityService')

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { handleSuccess, handleError } = require('./common/utils')
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

    const list: BannerItem[] = (res.data || []).map(b => ({
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
// Handlers 聚合 + Main 入口
// =====================================================================

const handlers: Record<string, (event: CloudEvent) => Promise<unknown>> = {
  getBanners: () => getBanners(),
  getHostInfo,
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
  clearBannersCache,
  BANNERS_CACHE_TTL,
  BANNER_FETCH_LIMIT,
}
_mod.exports.default = _mod.exports

export default {
  main,
  getBanners,
  getHostInfo,
  clearBannersCache,
  BANNERS_CACHE_TTL,
  BANNER_FETCH_LIMIT,
}
