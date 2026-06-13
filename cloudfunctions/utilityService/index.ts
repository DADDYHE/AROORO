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

export interface CloudContext {
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

/** Banner 列表项（投影） */
export interface BannerItem {
  id: string
  image: string
  title: string
  subtitle: string
  tag: string
  ctaText: string
  action: string
  actionTarget: string
}

/** Banner 列表结果（带缓存） */
export interface BannerListResult {
  list: BannerItem[]
}

/** 寄养家庭信息 */
export interface HostInfoResult {
  openid: string
  hostName: string
  pricePerDay: number
}

/** 内联 logger 类型 */
interface Logger {
  info: (action: string, ctx?: Record<string, unknown>) => void
  warn: (action: string, ctx?: Record<string, unknown>) => void
  error: (action: string, error: unknown) => void
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

// 内联日志（避免 ../common/logger 部署问题）
function createLogger(serviceName: string): Logger {
  const fmt = (level: string, action: string) => `[${new Date().toISOString()}] [${level}] [${serviceName}] [${action}]`
  return {
    info: (action, ctx) => console.log(fmt('INFO', action), ctx || {}),
    warn: (action, ctx) => console.warn(fmt('WARN', action), ctx || {}),
    error: (action, error) => console.error(fmt('ERROR', action), (error as Error)?.message || error),
  }
}

const logger = createLogger('utilityService')

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { handleSuccess, handleError } = require('../common/utils')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { err } = require('../common/errors')

/** 寄养家庭档案 */
interface HostProfileDoc {
  _id: string
  openid?: string
  hostName?: string
  pricePerDay?: number
  [k: string]: unknown
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
      image: b.imageUrl || '',
      title: b.title || '',
      subtitle: b.subtitle || '',
      tag: b.tag || '',
      ctaText: b.ctaText || '',
      action: b.actionType || '',
      actionTarget: b.actionTarget || '',
    }))

    _bannersCache = { list }
    _bannersCacheTime = now
    return _bannersCache
  } catch (e) {
    logger.error('getBanners', e)
    return { list: [] }
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

  // 验证 hostId 格式（防止恶意输入）
  const hostIdStr = String(hostId)
  if (hostIdStr.length > 100 || hostIdStr.includes('..')) {
    throw err('INVALID_PARAMS', 'hostId 格式无效')
  }

  const hostRes = await db.collection('hostProfiles').doc(hostIdStr).get()
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
