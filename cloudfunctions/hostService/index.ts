/**
 * hostService/index.ts - 寄养服务主入口（TypeScript 源文件 - Sprint 42 迁移）
 *
 * 业务功能：
 *   - 寄养家庭档案管理（CRUD + 详情查询）
 *   - 接单状态切换
 *   - 寄养家庭列表（关键词 + 筛选 + 排序 + 缓存）
 *   - 寄养家庭统计（订单总数 / 完成 / 待付款 / 取消率）
 *   - 敏感字段加密（AES-256-GCM 优先，兼容 AES-256-CBC 双写）
 *
 * 共 7 个 action：
 *   1. createHostProfile - 创建寄养家庭档案
 *   2. updateHostProfile - 更新寄养家庭档案
 *   3. getHostList - 寄养家庭列表（公开）
 *   4. getHostDetail - 寄养家庭详情（公开）
 *   5. getHostProfile - 获取当前用户寄养家庭档案
 *   6. updateHostAcceptingOrders - 更新接单状态
 *   7. getHostStats - 寄养家庭统计
 *
 * 加密方案（Sprint 2 升级）：
 *   - v2 AES-256-GCM（推荐）：`gcm:base64(iv).base64(tag).base64(cipher)`
 *   - v1 AES-256-CBC（迁移期）：`legacy_cbc:base64(iv):base64(cipher)`
 *   - 双写策略：ENABLE_CBC_DUAL_WRITE=true 时同时写 v1 与 v2
 *
 * 迁移目标：
 *   - 强类型化所有 db 操作、handler 签名、返回结构
 *   - 复用 AuthLike / CloudEvent / CloudContext 公共类型
 *   - 加密子系统强类型化（key 版本 + payload 格式）
 *   - 与 adminService / partnerService / userService / activityService / mallService / feedingService 保持类型一致
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.hostService.json
 */

// =====================================================================
// 公共类型（与 adminService / partnerService / userService / activityService / mallService / feedingService 保持一致）
// =====================================================================

export interface AuthLike {
  openid?: string
  nickName?: string
  adminId?: string
  partnerId?: string
  isPartner?: boolean
  isSuperAdmin?: boolean
  roles?: string[]
  permissions?: string[]
  _isHttpAuth?: boolean
  [k: string]: unknown
}

export interface CloudEvent {
  action?: string
  data?: Record<string, unknown>
  body?: string | Record<string, unknown>
  page?: number
  pageSize?: number
  keyword?: string
  sort?: string
  filters?: HostFilters
  hostId?: string
  hostName?: string
  realName?: string
  phone?: string
  idCard?: string
  address?: string
  housingType?: string
  hasYard?: string
  maxPets?: number
  hasOtherPets?: string
  nativePetInfo?: string
  petTypes?: string
  serviceTypes?: string[]
  pricePerDay?: number
  description?: string
  photos?: string[]
  videos?: string[]
  avatarUrl?: string
  idCardFront?: string
  idCardBack?: string
  healthCertificate?: string
  emergencyContactName?: string
  emergencyContactPhone?: string
  isAcceptingOrders?: boolean
  updateType?: string
  [k: string]: unknown
}

export interface CloudContext {
  [k: string]: unknown
}

export type HostActionHandler = (
  event: CloudEvent,
  context: CloudContext,
  auth: AuthLike
) => Promise<unknown>

// =====================================================================
// 业务类型定义
// =====================================================================

export interface HostFilters {
  roomType?: string
  minPrice?: number
  maxPrice?: number
  [k: string]: unknown
}

export interface HostRecord {
  _id?: string
  openid?: string
  hostName?: string
  name?: string
  realName?: string
  avatarUrl?: string
  phone?: string
  idCard?: string
  address?: string
  housingType?: string
  hasYard?: string
  maxPets?: number
  hasOtherPets?: string
  nativePetInfo?: string
  petTypes?: string
  serviceTypes?: string[]
  pricePerDay?: number
  description?: string
  photos?: string[]
  videos?: string[]
  idCardFront?: string
  idCardBack?: string
  healthCertificate?: string
  emergencyContactName?: string
  emergencyContactPhone?: string
  status?: string
  rating?: number
  averageRating?: number
  isAcceptingOrders?: boolean
  isActive?: number
  isRecommended?: boolean
  roomType?: string
  petLimit?: number
  tags?: string[]
  createdBy?: string
  createdAt?: Date
  updatedAt?: Date
  [k: string]: unknown
}

export interface HostStats {
  totalOrders: number
  completedOrders: number
  pendingOrders: number
  cancellationRate: string
}

export interface PaginateResult<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
  totalPages?: number
  hasNext?: boolean
}

export interface EncryptedPayload {
  v1?: string
  v2: string
}

export type KeyVersion = 1 | 2

// =====================================================================
// 内部模块初始化（require CommonJS 模块）
// =====================================================================

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { err, isBusinessError, toResponse } = require('./common/errors')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { initCloud, handleSuccess, handleError, ERROR_CODES } = require('./common/utils')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createLogger } = require('./common/logger')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { verifyAuth } = require('./common/auth-middleware')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getCache, setCache, deleteCache } = require('./common/cache')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { filterFields, FIELD_WHITELISTS } = require('./common/validator')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { deriveKey, encrypt: gcmEncrypt, decrypt: gcmDecrypt } = require('./common/crypto')

const { db } = initCloud()
const logger = createLogger('hostService')
const _ = db.command

// =====================================================================
// 敏感字段加密常量
// =====================================================================

const CBC_ALGORITHM = 'aes-256-cbc'
const CBC_IV_LENGTH = 16
const LEGACY_PREFIX = 'legacy_cbc:'
const KEY_VERSION: Record<string, KeyVersion> = {
  V1_CBC: 1,
  V2_GCM: 2,
}

let _derivedKey: Buffer | null = null

function _getKey(): Buffer {
  if (_derivedKey) { return _derivedKey }
  const passphrase = process.env.ENCRYPT_KEY
  if (!passphrase || passphrase.length < 16) {
    throw new Error('ENCRYPT_KEY 环境变量未配置或长度不足（至少 16 字符），无法加密敏感数据')
  }
  // P2-019: 强制要求显式配置 ENCRYPT_SALT，避免使用弱盐值（回归 P3-6 约束）
  const salt = process.env.ENCRYPT_SALT
  if (!salt || salt.length < 8) {
    throw new Error('ENCRYPT_SALT 环境变量未配置或长度不足（至少 8 字符），无法加密敏感数据')
  }
  const { key } = deriveKey(passphrase, salt)
  _derivedKey = key
  return key
}

/**
 * v2 AES-256-GCM 加密（推荐）
 * @param value 明文
 * @returns 形如 `gcm:base64(iv).base64(tag).base64(cipher)`
 */
function _encryptSensitive(value: string): string {
  if (!value) { return '' }
  const key = _getKey()
  const payload = gcmEncrypt(value, key)
  return `gcm:${payload}`
}

/**
 * v1 AES-256-CBC 加密（迁移期使用，需显式开启双写）
 * 输出格式：base64(iv):base64(cipher)
 */
function _encryptSensitiveCBC(value: string): string {
  if (!value) { return '' }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const crypto = require('crypto')
  const key = _getKey()
  const iv = crypto.randomBytes(CBC_IV_LENGTH)
  const cipher = crypto.createCipheriv(CBC_ALGORITHM, key, iv)
  let encrypted = cipher.update(value, 'utf8', 'base64')
  encrypted += cipher.final('base64')
  return `${LEGACY_PREFIX}${iv.toString('base64')}:${encrypted}`
}

/**
 * 双写加密：同时返回 v1 与 v2
 * 启用条件：process.env.ENABLE_CBC_DUAL_WRITE === 'true'
 */
function _encryptDual(value: string): EncryptedPayload {
  const v2 = _encryptSensitive(value)
  if (process.env.ENABLE_CBC_DUAL_WRITE === 'true') {
    return { v1: _encryptSensitiveCBC(value), v2 }
  }
  return { v2 }
}

/**
 * 解密敏感数据：自动识别 v1 / v2 格式
 */
function _decryptSensitive(payload: string): string {
  if (!payload) { return '' }
  const key = _getKey()

  if (payload.startsWith('gcm:')) {
    return gcmDecrypt(payload.slice(4), key)
  }
  if (payload.startsWith(LEGACY_PREFIX)) {
    return _decryptCBC(payload.slice(LEGACY_PREFIX.length), key)
  }
  // 兼容历史纯 base64(iv):base64(cipher) 格式（v1 未加前缀）
  if (payload.includes(':')) {
    try {
      return _decryptCBC(payload, key)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      logger.warn('_decryptSensitive.fallbackCBC', { msg })
    }
  }
  throw new Error('无法识别的密文格式')
}

function _decryptCBC(payload: string, key: Buffer): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const crypto = require('crypto')
  const parts = payload.split(':')
  if (parts.length !== 2) { throw new Error('CBC payload 格式错误') }
  const iv = Buffer.from(parts[0], 'base64')
  if (iv.length !== CBC_IV_LENGTH) { throw new Error('CBC iv 长度错误') }
  const ciphertext = parts[1]
  const decipher = crypto.createDecipheriv(CBC_ALGORITHM, key, iv)
  let decrypted = decipher.update(ciphertext, 'base64', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

function _resetKey(): void {
  _derivedKey = null
}

// =====================================================================
// 字段投影常量
// =====================================================================

const HOST_LIST_FIELDS: Record<string, boolean> = {
  _id: true, hostName: true, avatarUrl: true, name: true,
  address: true, hasYard: true, housingType: true, maxPets: true,
  petTypes: true, pricePerDay: true, averageRating: true,
  isAcceptingOrders: true, status: true, description: true, createdAt: true, updatedAt: true,
  roomType: true, petLimit: true, tags: true, isRecommended: true, photos: true,
}

const HOST_DETAIL_PUBLIC_FIELDS: Record<string, boolean> = {
  _id: true, hostName: true, avatarUrl: true, name: true,
  address: true, hasYard: true, housingType: true, maxPets: true,
  petTypes: true, pricePerDay: true,
  isAcceptingOrders: true, status: true, description: true,
  hasOtherPets: true, nativePetInfo: true, serviceTypes: true,
  photos: true, videos: true, createdAt: true, updatedAt: true,
}

// =====================================================================
// 工具函数
// =====================================================================

const KEYWORD_MAX_LENGTH = 50
const REGEXP_SPECIAL_CHARS = /[.*+?^${}()|[\]\\]/g

function escapeRegExp(str: string): string {
  return str.replace(REGEXP_SPECIAL_CHARS, '\\$&')
}

// =====================================================================
// Handler 1: createHostProfile
// =====================================================================

export async function createHostProfile(
  event: CloudEvent,
  _context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  const {
    hostName, realName, phone, idCard, address, housingType, hasYard, maxPets,
    hasOtherPets, nativePetInfo, petTypes, serviceTypes, pricePerDay,
    description, photos, idCardFront, idCardBack, healthCertificate,
    emergencyContactName, emergencyContactPhone,
  } = event

  if (!hostName) { throw err('INVALID_PARAMS', '请填写寄养家庭名称') }
  if (!phone) { throw err('INVALID_PARAMS', '请填写手机号') }

  const existingProfiles = await db.collection('hostProfiles')
    .where({ phone, status: _.in(['active', 'pending_review']) }).count()
  if (existingProfiles.total > 0) {
    throw err('BUSINESS_ERROR', '该手机号已注册寄养家庭')
  }

  const profileData: HostRecord = {
    openid,
    hostName,
    realName: realName || '',
    phone,
    idCard: idCard || '',
    address: address || '',
    housingType: housingType || '',
    hasYard: hasYard || '',
    maxPets: Number(maxPets) || 0,
    hasOtherPets: hasOtherPets || '',
    nativePetInfo: nativePetInfo || '',
    petTypes: petTypes || '',
    serviceTypes: serviceTypes || [],
    pricePerDay: Number(pricePerDay) || 0,
    description: description || '',
    photos: photos || [],
    idCardFront: idCardFront || '',
    idCardBack: idCardBack || '',
    healthCertificate: healthCertificate || '',
    emergencyContactName: emergencyContactName || '',
    emergencyContactPhone: emergencyContactPhone || '',
    status: 'pending_review',
    rating: 5.0,
    isAcceptingOrders: true,
    isActive: 1,
    createdBy: openid,
    createdAt: db.serverDate(),
    updatedAt: db.serverDate(),
  }

  await db.collection('hostProfiles').doc(openid).set({ data: profileData })
  return handleSuccess({ id: openid }, '寄养家庭创建成功，等待管理员审核')
}

// =====================================================================
// Handler 2: updateHostProfile
// =====================================================================

export async function updateHostProfile(
  event: CloudEvent,
  _context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  const { updateType, description, photos, videos, resubmit } = event

  let existingStatus = ''
  try {
    const existing = await db.collection('hostProfiles').doc(openid).get()
    existingStatus = ((existing.data as HostRecord | undefined) || {}).status || ''
  } catch (e) {
    throw err('NOT_FOUND', '您尚未创建寄养家庭配置')
  }

  const updateData: Record<string, unknown> = { updatedAt: db.serverDate() }

  if (updateType === 'basicInfo') {
    // P1 档案自助编辑：hostBasic 全量 + 服务/简介/相册一次提交（status/rating 等保护字段不在白名单）
    const editableFields = [
      ...FIELD_WHITELISTS.hostBasic,
      'serviceTypes', 'description', 'photos', 'videos', 'tags',
    ]
    Object.assign(updateData, filterFields(editableFields, event))
    if (event.hostName !== undefined && event.hostName !== null) {
      updateData.name = event.hostName
    }
  } else if (updateType === 'description') {
    if (description !== undefined && description !== null) { updateData.description = description }
    if (event.avatarUrl !== undefined && event.avatarUrl !== null) { updateData.avatarUrl = event.avatarUrl }
  } else {
    // 支持同时更新 photos 和 videos
    if (photos !== undefined && photos !== null) { updateData.photos = photos }
    if (videos !== undefined && videos !== null) { updateData.videos = videos }
    // 如果没有指定 photos 或 videos，使用默认字段过滤
    if (updateData.photos === undefined && updateData.videos === undefined) {
      Object.assign(updateData, filterFields(FIELD_WHITELISTS.hostDefault, event))
    }
  }

  // 重新提审：仅 rejected 允许自助改回待审核；status 不可通过白名单打穿
  if (resubmit === true) {
    if (existingStatus === 'rejected') {
      updateData.status = 'pending_review'
    } else if (existingStatus !== 'pending_review') {
      throw err('BUSINESS_ERROR', '当前状态无需重新提交审核')
    }
  }

  if (Object.keys(updateData).length > 1) {
    await db.collection('hostProfiles').doc(openid).update({ data: updateData })
    deleteCache('host_list')
    deleteCache(`host_profile_${openid}`)
  }

  return handleSuccess({ status: (updateData.status as string) || existingStatus }, '更新成功')
}

// =====================================================================
// Handler 3: getHostList（公开）
// =====================================================================

export async function getHostList(
  event: CloudEvent,
  _context: CloudContext,
  _auth: AuthLike
): Promise<unknown> {
  const { page = 1, pageSize = 20, keyword = '', sort = 'default', filters = {} } = event
  const safePageSize = Math.min(Math.max(1, Number(pageSize) || 20), 100)
  const skip = (page - 1) * safePageSize

  const filterKey = JSON.stringify({ keyword, sort, filters })
  const cacheKey = `host_list_p${page}_s${safePageSize}_${Buffer.from(filterKey).toString('base64').slice(0, 16)}`
  const cachedList = getCache(cacheKey)
  if (cachedList) {
    return handleSuccess({ list: cachedList.list, total: cachedList.total, page, pageSize: safePageSize }, '获取成功')
  }

  const baseQuery: Record<string, unknown> = { status: _.in(['active', 'approved']) }

  if (keyword) {
    const safeKeyword = escapeRegExp(String(keyword).slice(0, KEYWORD_MAX_LENGTH))
    baseQuery.$or = [
      { hostName: db.RegExp({ regexp: safeKeyword, options: 'i' }) },
      { address: db.RegExp({ regexp: safeKeyword, options: 'i' }) },
    ]
  }

  if (filters && filters.roomType) {
    baseQuery.roomType = filters.roomType
  }
  if (filters && filters.minPrice !== undefined) {
    const priceCond: Record<string, unknown> = (baseQuery.pricePerDay as Record<string, unknown>) || {}
    baseQuery.pricePerDay = { ...priceCond, ..._.gte(Number(filters.minPrice)) }
  }
  if (filters && filters.maxPrice !== undefined) {
    const priceCond: Record<string, unknown> = (baseQuery.pricePerDay as Record<string, unknown>) || {}
    baseQuery.pricePerDay = { ...priceCond, ..._.lte(Number(filters.maxPrice)) }
  }

  const countResult = await db.collection('hostProfiles').where(baseQuery).count()

  let sortField = 'createdAt'
  let sortOrder: 'asc' | 'desc' = 'desc'
  if (sort === 'price_asc') {
    sortField = 'pricePerDay'
    sortOrder = 'asc'
  } else if (sort === 'price_desc') {
    sortField = 'pricePerDay'
    sortOrder = 'desc'
  }

  const result = await db.collection('hostProfiles')
    .field(HOST_LIST_FIELDS)
    .where(baseQuery)
    .orderBy(sortField, sortOrder)
    .skip(skip)
    .limit(safePageSize)
    .get()

  const data: HostRecord[] = ((result.data || []) as HostRecord[]).map((host) => ({
    ...host,
    isAcceptingOrders: host.isAcceptingOrders !== undefined ? host.isAcceptingOrders : true,
    avatarUrl: host.avatarUrl || '/images/default-avatar.svg',
  }))

  setCache(cacheKey, { list: data, total: countResult.total }, 600)
  return handleSuccess({
    list: data,
    total: countResult.total,
    page,
    pageSize: safePageSize,
    totalPages: Math.ceil(countResult.total / safePageSize),
  }, '获取成功')
}

// =====================================================================
// Handler 4: getHostDetail（公开）
// =====================================================================

export async function getHostDetail(
  event: CloudEvent,
  _context: CloudContext,
  _auth: AuthLike
): Promise<unknown> {
  const { hostId } = event
  if (!hostId) { throw err('INVALID_PARAMS', '缺少 hostId 参数') }

  const cacheKey = `host_detail_${hostId}`
  const cachedHost = getCache(cacheKey)
  if (cachedHost) { return handleSuccess(cachedHost, '获取成功') }

  try {
    // P2-A 修复：仅 active/approved 状态家庭详情可公开访问，
    //   原 where({_id}) 会把未审核（pending）/已拒绝/已下架家庭的信息暴露给用户
    const result = await db.collection('hostProfiles')
      .where({ _id: hostId, status: _.in(['active', 'approved']) })
      .limit(1)
      .field(HOST_DETAIL_PUBLIC_FIELDS)
      .get()
    if (!result.data || result.data.length === 0) {
      throw err('NOT_FOUND', '未找到寄养家庭')
    }

    const hostData = (result.data[0] || {}) as HostRecord

    if (!hostData.avatarUrl || hostData.avatarUrl === '') {
      hostData.avatarUrl = '/images/default-avatar.svg'
    }

    hostData.isAcceptingOrders = hostData.isAcceptingOrders !== undefined ? hostData.isAcceptingOrders : true

    setCache(cacheKey, hostData, 300)
    return handleSuccess(hostData, '获取成功')
  } catch (error) {
    // 保留 BusinessError 的原始错误码
    if (isBusinessError(error)) {
      return toResponse(error)
    }
    return handleError(error, '获取寄养家庭详情失败', ERROR_CODES.DATA)
  }
}

// =====================================================================
// Handler 5: getHostProfile
// =====================================================================

export async function getHostProfile(
  event: CloudEvent,
  _context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  try {
    // 无档案是预期状态（首访合伙人），用 where 查询避免 doc().get() 对不存在文档直接 reject
    //   → 返回 code 0 + data null，前端据此展示创建引导，不进错误上报通道
    const profileResult = await db.collection('hostProfiles')
      .where({ _id: openid })
      .limit(1)
      .get()
    const profile = (profileResult.data && profileResult.data[0]) || null
    if (profile) { deleteCache(`host_profile_${openid}`) }
    return handleSuccess(profile, profile ? '获取成功' : '尚未创建寄养家庭档案')
  } catch (error) {
    return handleError(error, '获取寄养家庭档案失败', ERROR_CODES.DATA)
  }
}

// =====================================================================
// Handler 6: updateHostAcceptingOrders
// =====================================================================

export async function updateHostAcceptingOrders(
  event: CloudEvent,
  _context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  const { isAcceptingOrders } = event
  if (isAcceptingOrders === undefined) {
    throw err('INVALID_PARAMS', '缺少参数')
  }

  await db.collection('hostProfiles').doc(openid).update({
    data: { isAcceptingOrders, updatedAt: db.serverDate() },
  })

  deleteCache('host_list')
  return handleSuccess(null, '更新成功')
}

// =====================================================================
// Handler 7: getHostStats
// =====================================================================

export async function getHostStats(
  event: CloudEvent,
  _context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  const cacheKey = `host_stats_${openid}`
  const cachedStats = getCache(cacheKey)
  if (cachedStats) { return handleSuccess(cachedStats, '获取成功') }

  try {
    const [totalRes, completedRes, pendingRes, cancelledRes] = await Promise.all([
      db.collection('orders').where({ organizerId: openid }).count(),
      db.collection('orders').where({ organizerId: openid, status: 'completed' }).count(),
      db.collection('orders').where({ organizerId: openid, status: 'pending' }).count(),
      db.collection('orders').where({ organizerId: openid, status: 'cancelled' }).count(),
    ])

    const totalOrders = totalRes.total
    const completedOrders = completedRes.total
    const pendingOrders = pendingRes.total
    const cancellationRate = totalOrders > 0
      ? (cancelledRes.total / totalOrders * 100).toFixed(2)
      : '0.00'

    const stats: HostStats = { totalOrders, completedOrders, pendingOrders, cancellationRate }
    setCache(cacheKey, stats, 300)
    return handleSuccess(stats, '获取成功')
  } catch (error) {
    return handleError(error, '获取统计数据失败', ERROR_CODES.DATA)
  }
}

// =====================================================================
// Handlers 聚合
// =====================================================================

export const handlers: Record<string, HostActionHandler> = {
  createHostProfile,
  updateHostProfile,
  getHostList,
  getHostDetail,
  getHostProfile,
  updateHostAcceptingOrders,
  getHostStats,
}

// =====================================================================
// Main 入口
// =====================================================================

export async function main(
  event: CloudEvent,
  context: CloudContext
): Promise<unknown> {
  const { action } = event
  if (!action || !handlers[action]) {
    throw err('INVALID_PARAMS', '无效的操作类型')
  }

  try {
    const PUBLIC_ACTIONS = ['getHostList', 'getHostDetail']
    const requireLogin = !PUBLIC_ACTIONS.includes(action)
    const auth = await verifyAuth(event, { requireLogin }) as AuthLike
    logger.info(action, { openid: auth.openid })
    return await handlers[action](event, context, auth)
  } catch (error) {
    logger.error(action, error)
    const code = (error as { code?: string }).code || ERROR_CODES.BUSINESS
    return handleError(error, (error as Error).message, code)
  }
}

// =====================================================================
// Runtime shim（CommonJS 兼容 + 测试用 internal 导出）
// =====================================================================

const _mod = module as { exports: Record<string, unknown> }
_mod.exports = {
  main,
  createHostProfile,
  updateHostProfile,
  getHostList,
  getHostDetail,
  getHostProfile,
  updateHostAcceptingOrders,
  getHostStats,
  handlers,
}

// 仅供测试：暴露加密 / 双写 / 解密内部函数
// 生产路径通过 handlers 触发，不会从这里调用
if (process.env.NODE_ENV === 'test' || process.env.HOST_SERVICE_EXPOSE_INTERNALS === 'true') {
  _mod.exports._encryptSensitive = _encryptSensitive
  _mod.exports._encryptSensitiveCBC = _encryptSensitiveCBC
  _mod.exports._encryptDual = _encryptDual
  _mod.exports._decryptSensitive = _decryptSensitive
  _mod.exports._decryptCBC = _decryptCBC
  _mod.exports._getKey = _getKey
  _mod.exports._resetKey = _resetKey
  _mod.exports.KEY_VERSION = KEY_VERSION
}
_mod.exports.default = _mod.exports

export default {
  main,
  createHostProfile,
  updateHostProfile,
  getHostList,
  getHostDetail,
  getHostProfile,
  updateHostAcceptingOrders,
  getHostStats,
  handlers,
}
