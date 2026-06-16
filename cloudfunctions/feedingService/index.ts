/**
 * feedingService/index.ts - 喂养服务主入口（TypeScript 源文件 - Sprint 41 迁移）
 *
 * 业务功能：
 *   - 喂养师管理（CRUD + 列表筛选）
 *   - 喂养下单（多宠物 + 上门 + 钥匙 + 熟悉度 + 多次访问）
 *   - 订单管理（我的订单 / 详情 / 状态流转 / 喂养师视角订单）
 *   - 佣金记录（status=completed 触发）
 *
 * 共 12 个 action：
 *   1. getFeederList - 喂养师列表
 *   2. getFeederDetail - 喂养师详情
 *   3. createFeederProfile - 创建喂养师档案
 *   4. updateFeederProfile - 更新喂养师档案
 *   5. createFeedingOrder - 创建喂养订单
 *   6. getFeedingOrders - 我的喂养订单
 *   7. updateFeedingOrderStatus - 更新订单状态
 *   8. getOrderStatus - 获取订单状态
 *   9. getFeederOrders - 喂养师视角订单列表
 *  10. getFeedingOrderDetail - 喂养师视角订单详情
 *  11. handleFeedingOrder - 喂养师接单/完成操作
 *  12. getCurrentFeeder - 获取当前用户喂养师档案
 *
 * 迁移目标：
 *   - 强类型化所有 db 操作、handler 签名、返回结构
 *   - 复用 AuthLike / CloudEvent / CloudContext 公共类型
 *   - 与 adminService / partnerService / userService / activityService / mallService 保持类型一致
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.feedingService.json
 */

// =====================================================================
// 公共类型（与 adminService / partnerService / userService / activityService / mallService 保持一致）
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
  status?: string
  location?: string
  serviceType?: string
  feederId?: string
  orderId?: string
  operation?: string
  name?: string
  avatarUrl?: string
  phone?: string
  description?: string
  serviceArea?: string[]
  pricePerVisit?: number
  certifications?: unknown[]
  petIds?: string[]
  startDate?: string
  endDate?: string
  visitTimes?: string[]
  address?: string
  notes?: string
  keyMethod?: string
  visitTime?: string
  feederGender?: string
  familiarity?: string
  familiarityText?: string
  familiarityDates?: string[]
  multiVisit?: number
  multiVisitText?: string
  multiVisitDates?: string[]
  petDetails?: unknown[]
  petServices?: Record<string, unknown>
  totalAmount?: number
  originalAmount?: number
  couponId?: string
  couponDiscount?: number
  [k: string]: unknown
}

export interface CloudContext {
  [k: string]: unknown
}

export type FeedingActionHandler = (
  event: CloudEvent,
  context: CloudContext,
  auth: AuthLike
) => Promise<unknown>

// =====================================================================
// 业务类型定义
// =====================================================================

export interface UserRecord {
  _id?: string
  openid?: string
  nickName?: string
  inviterId?: string
  [k: string]: unknown
}

export interface AdminRecord {
  _id?: string
  openid?: string
  status?: string
  roles?: string[]
  permissions?: string[]
  [k: string]: unknown
}

export interface FeederRecord {
  _id?: string
  name?: string
  realName?: string
  nickname?: string
  avatarUrl?: string
  phone?: string
  description?: string
  serviceArea?: string[]
  serviceTypes?: string[]
  serviceTags?: string[]
  pricePerVisit?: number
  certifications?: unknown[]
  rating?: number
  orderCount?: number
  status?: string
  gender?: string
  beautyInfo?: Record<string, unknown>
  createdBy?: string
  createdAt?: Date
  updatedAt?: Date
  [k: string]: unknown
}

export interface FeedingOrderRecord {
  _id?: string
  orderNo?: string
  orderType?: string
  ownerId?: string
  feederId?: string
  petIds?: string[]
  petDetails?: PetDetailInput[]
  petServices?: Record<string, unknown>
  startDate?: string
  endDate?: string
  visitTimes?: string[]
  address?: string
  notes?: string
  keyMethod?: string
  visitTime?: string
  feederGender?: string
  familiarity?: string
  familiarityText?: string
  familiarityDates?: string[]
  multiVisit?: number
  multiVisitText?: string
  multiVisitDates?: string[]
  totalAmount?: number
  totalPrice?: number
  originalAmount?: number
  couponId?: string
  couponDiscount?: number
  status?: string
  paymentStatus?: string
  createdAt?: Date
  updatedAt?: Date
  [k: string]: unknown
}

export interface PetDetailInput {
  id?: string
  petId?: string
  _id?: string
  name?: string
  avatarUrl?: string
  [k: string]: unknown
}

export interface FeederInfo {
  feederName?: string
  feederPhone?: string
  feederAvatar?: string
  [k: string]: unknown
}

export interface StatusTip {
  title: string
  subtitle: string
  icon: string
}

export interface PaginateResult<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
  totalPages?: number
  hasNext?: boolean
}

export interface CommissionRecord {
  _id?: string
  inviterId?: string
  inviterNickName?: string
  ownerId?: string
  orderType?: string
  orderId?: string
  orderNo?: string
  orderAmount?: number
  commissionRate?: number
  commissionAmount?: number
  status?: string
  createdAt?: Date
  updatedAt?: Date
  [k: string]: unknown
}

export interface SystemConfig {
  [key: string]: unknown
}

// =====================================================================
// 内部模块初始化（require CommonJS 模块）
// =====================================================================

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { initCloud, handleSuccess, handleError, generateId, ERROR_CODES, paginate } = require('./common/utils')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createLogger } = require('./common/logger')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { verifyAuth } = require('./common/auth-middleware')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { filterFields, FIELD_WHITELISTS } = require('./common/validator')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { err, toResponse, isBusinessError } = require('./common/errors')

const { cloud, db } = initCloud()
const logger = createLogger('feedingService')
const _ = db.command

// =====================================================================
// 字段投影常量
// =====================================================================

const FEEDER_LIST_FIELDS: Record<string, boolean> = {
  _id: true, realName: true, nickname: true, avatarUrl: true, address: true,
  pricePerVisit: true, orderCount: true,
  serviceTags: true, serviceTypes: true, status: true, description: true,
  phone: true, gender: true, createdAt: true, beautyInfo: true,
}

const FEEDING_ORDER_FIELDS: Record<string, boolean> = {
  _id: true, orderNo: true, orderType: true, feederId: true, ownerId: true, petIds: true,
  petDetails: true, petServices: true,
  startDate: true, endDate: true, visitTimes: true,
  address: true, notes: true,
  keyMethod: true, visitTime: true, feederGender: true,
  familiarity: true, familiarityText: true, familiarityDates: true,
  multiVisit: true, multiVisitText: true, multiVisitDates: true,
  totalAmount: true, originalAmount: true, couponId: true, couponDiscount: true,
  status: true, paymentStatus: true, createdAt: true, updatedAt: true,
}

// =====================================================================
// 辅助函数：佣金记录
// =====================================================================

async function createCommissionRecord(orderType: string, order: FeedingOrderRecord): Promise<void> {
  try {
    if (!order.ownerId) { return }
    // users._id = openid，直接 doc 查询
    let user: UserRecord | null = null
    try {
      const userRes = await db.collection('users').doc(order.ownerId).field({ _id: true, inviterId: true }).get()
      user = userRes.data
    } catch (e) {
      logger.warn('commission.users.fetch', { ownerId: order.ownerId, msg: (e as Error).message })
      return
    }
    if (!user || !user.inviterId) { return }

    // 读取佣金率：优先合作伙伴自定义配置，fallback 到系统默认
    let rate = 0
    try {
      const adminRes = await db.collection('admins').doc(user.inviterId).get()
      const admin = adminRes.data
      if (admin && admin.commissionRates && admin.commissionRates[orderType] !== undefined) {
        rate = Number(admin.commissionRates[orderType])
      }
    } catch (e) {
      logger.warn('commission.admins.fetch', { inviterId: user.inviterId, msg: (e as Error).message })
    }
    if (rate <= 0) {
      try {
        const configRes = await db.collection('system_config').doc('commission_rates').get()
        const config = configRes.data || {}
        rate = config[orderType] !== undefined ? Number(config[orderType]) : 0
      } catch (e) {
        logger.warn('commission.tuan_config', { msg: (e as Error).message })
        return
      }
    }
    if (!rate || rate <= 0) { return }

    const orderAmount = Number(order.totalAmount || order.totalPrice || order.basicPrice || 0)
    if (orderAmount <= 0) { return }
    const commissionAmount = Math.round(orderAmount * rate / 100 * 100) / 100

    // inviterId 就是 openid，直接 doc 查询
    let inviter: UserRecord | null = null
    try {
      const inviterRes = await db.collection('users').doc(user.inviterId).field({ _id: true, nickName: true }).get()
      inviter = inviterRes.data
    } catch (e) {
      logger.warn('commission.inviter.fetch', { inviterId: user.inviterId, msg: (e as Error).message })
      return
    }
    if (!inviter) { return }

    const existRes = await db.collection('tuan_commissions').where({ orderNo: order.orderNo || order._id, inviterId: user.inviterId }).count()
    if (existRes.total > 0) { return }

    const commissionId = generateId('commission', order.ownerId)
    await db.collection('tuan_commissions').add({
      data: {
        _id: commissionId,
        inviterId: user.inviterId,
        inviterNickName: inviter.nickName || '',
        ownerId: user._id || order.ownerId,
        orderType,
        orderId: order._id,
        orderNo: order.orderNo || order._id,
        orderAmount,
        commissionRate: rate,
        commissionAmount,
        status: 'pending',
        createdAt: db.serverDate(),
        updatedAt: db.serverDate(),
      },
    })
    logger.info('commission_created', { orderType, orderNo: order.orderNo || order._id, amount: orderAmount, rate, commission: commissionAmount })
  } catch (e) {
    logger.error('commission_error', e)
  }
}

// =====================================================================
// 辅助函数：合作伙伴权限校验
// =====================================================================

async function checkPartnerPermission(openid: string, permission: string): Promise<AdminRecord> {
  let admin: AdminRecord | null = null
  try {
    const adminRes = await db.collection('admins').doc(openid).get()
    admin = adminRes.data || null
  } catch (e) {
    admin = null
  }
  if (!admin || admin.status !== 'active') {
    throw err('PARTNER_REQUIRED', '无合作伙伴权限')
  }
  const roles = admin.roles || []
  if (roles.includes('super_admin')) { return admin }
  const perms = admin.permissions || []
  if (!perms.includes(permission)) {
    throw err('PERMISSION_DENIED', `权限不足：需要 ${permission} 权限`)
  }
  return admin
}

// =====================================================================
// 私有辅助函数：刷新宠物头像
// =====================================================================

async function refreshPetAvatars(orders: FeedingOrderRecord[]): Promise<void> {
  const allPetIds: string[] = []
  for (const order of orders) {
    if (order.petIds && order.petIds.length > 0) {
      for (const pid of order.petIds) {
        if (!allPetIds.includes(pid)) { allPetIds.push(pid) }
      }
    }
  }
  if (allPetIds.length === 0) { return }

  const petMap: Record<string, string> = {}
  const batchSize = 20
  for (let i = 0; i < allPetIds.length; i += batchSize) {
    const batch = allPetIds.slice(i, i + batchSize)
    try {
      const res = await db.collection('pets')
        .where({ _id: _.in(batch) })
        .field({ _id: true, avatarUrl: true })
        .get()
      for (const pet of (res.data || []) as UserRecord[]) {
        petMap[pet._id || ''] = (pet.avatarUrl as string) || ''
      }
    } catch (e) {
      logger.error('refreshPetAvatars_error', e)
    }
  }

  for (const order of orders) {
    if (!order.petDetails || !Array.isArray(order.petDetails)) { continue }
    for (const detail of order.petDetails) {
      const petId = detail.id || detail.petId || detail._id
      if (petId && petMap[petId] !== undefined) {
        detail.avatarUrl = petMap[petId]
      }
    }
  }
}

// =====================================================================
// 状态提示常量
// =====================================================================

const STATUS_TIPS: Record<string, StatusTip> = {
  pending_payment: { title: '待付款', subtitle: '请尽快完成支付', icon: 'clock' },
  confirmed: { title: '订单已确认', subtitle: '平台已接单，将安排服务人员上门', icon: 'success' },
  in_progress: { title: '服务进行中', subtitle: '服务人员正在为您服务', icon: 'progress' },
  completed: { title: '服务已完成', subtitle: '感谢您的使用', icon: 'completed' },
  cancelled: { title: '订单已取消', subtitle: '', icon: 'cancelled' },
}

// =====================================================================
// Handler 1: getFeederList
// =====================================================================

export async function getFeederList(
  event: CloudEvent,
  _context: CloudContext,
  _auth: AuthLike
): Promise<unknown> {
  const { page = 1, pageSize = 10, location, serviceType } = event

  let whereQuery: Record<string, unknown>
  if (serviceType === 'beauty') {
    const beautyCondition = _.or(
      { serviceTypes: _.in(['beauty']) },
      { serviceTags: _.in(['美容造型']) }
    )
    if (location) {
      whereQuery = _.and(
        { status: 'active', serviceArea: _.in([location]) },
        beautyCondition
      ) as unknown as Record<string, unknown>
    } else {
      whereQuery = _.and(
        { status: 'active' },
        beautyCondition
      ) as unknown as Record<string, unknown>
    }
  } else {
    whereQuery = { status: 'active' }
    if (location) { whereQuery.serviceArea = _.in([location]) }
    if (serviceType) { whereQuery.serviceTypes = _.in([serviceType]) }
  }

  const countResult = await db.collection('feeders').where(whereQuery).count()
  const offset = (page - 1) * pageSize
  const dataResult = await db.collection('feeders')
    .where(whereQuery)
    .field(FEEDER_LIST_FIELDS)
    .orderBy('rating', 'desc')
    .skip(offset)
    .limit(pageSize)
    .get()

  const result: PaginateResult<FeederRecord> = {
    list: (dataResult.data || []) as FeederRecord[],
    total: countResult.total,
    page,
    pageSize,
    totalPages: Math.ceil(countResult.total / pageSize),
    hasNext: page * pageSize < countResult.total,
  }
  return handleSuccess(result, '获取成功')
}

// =====================================================================
// Handler 2: getFeederDetail
// =====================================================================

export async function getFeederDetail(
  event: CloudEvent,
  _context: CloudContext,
  _auth: AuthLike
): Promise<unknown> {
  const { feederId } = event
  if (!feederId) { throw err('INVALID_PARAMS', '缺少喂养师ID') }

  try {
    const res = await db.collection('feeders').doc(feederId).get()
    return handleSuccess(res.data, '获取成功')
  } catch (error) {
    return handleError(error, '喂养师不存在', ERROR_CODES.NOT_FOUND)
  }
}

// =====================================================================
// Handler 3: createFeederProfile
// =====================================================================

export async function createFeederProfile(
  event: CloudEvent,
  _context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  const { name, avatarUrl, phone, description, serviceArea, pricePerVisit, certifications } = event
  if (!name) { throw err('INVALID_PARAMS', '缺少喂养师名称') }
  if (phone && !/^1[3-9]\d{9}$/.test(phone)) {
    throw err('INVALID_PARAMS', '手机号格式不正确')
  }

  const feeder: FeederRecord = {
    name,
    avatarUrl: avatarUrl || '',
    phone: phone || '',
    description: description || '',
    serviceArea: serviceArea || [],
    pricePerVisit: Number(pricePerVisit) || 0,
    certifications: certifications || [],
    rating: 0,
    orderCount: 0,
    status: 'pending_review',
    createdBy: openid,
    createdAt: db.serverDate(),
    updatedAt: db.serverDate(),
  }

  feeder._id = generateId('feeder', openid)
  const res = await db.collection('feeders').add({ data: feeder })
  return handleSuccess({ id: res._id }, '创建成功')
}

// =====================================================================
// Handler 4: updateFeederProfile
// =====================================================================

export async function updateFeederProfile(
  event: CloudEvent,
  _context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { feederId } = event
  const { openid } = auth
  if (!feederId) { throw err('INVALID_PARAMS', '缺少喂养师ID') }
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  const updateData: Record<string, unknown> = {
    updatedAt: db.serverDate(),
    ...filterFields(FIELD_WHITELISTS.feeder, event),
  }

  const existRes = await db.collection('feeders').doc(feederId).get()
  const existData = existRes.data as FeederRecord | null
  if (existData && existData.createdBy !== openid) {
    try {
      await checkPartnerPermission(openid, 'feeding')
    } catch (e) {
      throw err('PERMISSION_DENIED', '无权修改此喂养师档案')
    }
  }

  await db.collection('feeders').doc(feederId).update({ data: updateData })
  return handleSuccess(null, '更新成功')
}

// =====================================================================
// Handler 5: createFeedingOrder
// =====================================================================

export async function createFeedingOrder(
  event: CloudEvent,
  _context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  const {
    feederId, petIds, startDate, endDate, visitTimes, address, notes,
    keyMethod, visitTime, feederGender,
    familiarity, familiarityText, familiarityDates,
    multiVisit, multiVisitText, multiVisitDates,
    petDetails, petServices,
    totalAmount, originalAmount, couponId, couponDiscount,
  } = event

  if (!petIds || petIds.length === 0) { throw err('INVALID_PARAMS', '请选择宠物') }

  try {
    let feederInfo: FeederRecord = {}
    if (feederId) {
      try {
        const feederRes = await db.collection('feeders').doc(feederId).get()
        feederInfo = (feederRes.data as FeederRecord) || {}
      } catch (e) {
        feederInfo = {}
      }
    }

    const orderNo = `FD${Date.now()}${Math.random().toString(36).substr(2, 6).toUpperCase()}`

    const order: FeedingOrderRecord = {
      orderNo,
      orderType: 'feeding',
      ownerId: openid,
      feederId: feederId || '',
      petIds: petIds || [],
      petDetails: (petDetails || []) as PetDetailInput[],
      petServices: petServices || {},
      startDate: startDate || '',
      endDate: endDate || '',
      visitTimes: visitTimes || [],
      address: address || '',
      notes: notes || '',
      keyMethod: keyMethod || '',
      visitTime: visitTime || '',
      feederGender: feederGender || '',
      familiarity: familiarity || '',
      familiarityText: familiarityText || '',
      familiarityDates: familiarityDates || [],
      multiVisit: Number(multiVisit) || 0,
      multiVisitText: multiVisitText || '',
      multiVisitDates: multiVisitDates || [],
      totalAmount: Number(totalAmount) || 0,
      originalAmount: Number(originalAmount) || 0,
      couponId: couponId || '',
      couponDiscount: Number(couponDiscount) || 0,
      status: 'pending_payment',
      paymentStatus: 'unpaid',
      createdAt: db.serverDate(),
      updatedAt: db.serverDate(),
    }

    order._id = generateId('feeding', openid)
    const res = await db.collection('feedingOrders').add({ data: order })
    return handleSuccess({ id: res._id, orderNo, totalAmount: order.totalAmount }, '下单成功')
  } catch (error) {
    if ((error as { code?: string }).code) { throw error }
    return handleError(error, '下单失败', ERROR_CODES.DATA)
  }
}

// =====================================================================
// Handler 6: getFeedingOrders
// =====================================================================

export async function getFeedingOrders(
  event: CloudEvent,
  _context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  const { page = 1, pageSize = 10, status } = event
  const where: Record<string, unknown> = { ownerId: openid }
  if (status) { where.status = status }

  const result = await paginate(db, 'feedingOrders', {
    page, pageSize, where, projection: FEEDING_ORDER_FIELDS,
  }) as PaginateResult<FeedingOrderRecord>

  await refreshPetAvatars(result.list)

  return handleSuccess(result, '获取成功')
}

// =====================================================================
// Handler 7: updateFeedingOrderStatus
// =====================================================================

export async function updateFeedingOrderStatus(
  event: CloudEvent,
  _context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { orderId, status } = event
  const { openid } = auth
  if (!orderId) { throw err('INVALID_PARAMS', '缺少订单ID') }
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }
  if (!status) { throw err('INVALID_PARAMS', '缺少状态') }

  const VALID_STATUSES = ['confirmed', 'in_progress', 'completed', 'cancelled']
  if (!VALID_STATUSES.includes(status)) { throw err('INVALID_PARAMS', '无效的状态值') }

  try {
    const orderRes = await db.collection('feedingOrders').doc(orderId).get()
    if (!orderRes.data) {
      throw err('NOT_FOUND', '订单不存在')
    }
    const order = orderRes.data as FeedingOrderRecord

    if (order.ownerId !== openid) {
      throw err('PERMISSION_DENIED', '无权操作该订单')
    }

    const allowedTransitions: Record<string, string[]> = {
      pending_payment: ['cancelled'],
      confirmed: ['in_progress', 'cancelled'],
      in_progress: ['completed', 'cancelled'],
      completed: [],
      cancelled: [],
    }

    const allowedNext = allowedTransitions[order.status || ''] || []
    if (!allowedNext.includes(status)) {
      throw err('BUSINESS_ERROR', '状态变更无效')
    }

    await db.collection('feedingOrders').doc(orderId).update({
      data: { status, updatedAt: db.serverDate() },
    })

    if (status === 'completed') {
      await createCommissionRecord('feeding', { ...order, totalAmount: order.totalPrice })
    }

    return handleSuccess(null, '状态更新成功')
  } catch (error) {
    if ((error as { code?: string }).code) { throw error }
    return handleError(error, '更新状态失败', ERROR_CODES.DATA)
  }
}

// =====================================================================
// Handler 8: getOrderStatus
// =====================================================================

export async function getOrderStatus(
  event: CloudEvent,
  _context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { orderId } = event
  const { openid } = auth
  if (!orderId) { throw err('INVALID_PARAMS', '缺少订单ID') }
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  try {
    const orderRes = await db.collection('feedingOrders').doc(orderId).get()
    if (!orderRes.data) {
      throw err('NOT_FOUND', '订单不存在')
    }
    const order = orderRes.data as FeedingOrderRecord
    if (order.ownerId !== openid) {
      throw err('PERMISSION_DENIED', '无权查看该订单')
    }

    let feederInfo: FeederInfo = { feederName: '', feederPhone: '', feederAvatar: '' }
    if (order.feederId) {
      try {
        const feederRes = await db.collection('feeders').doc(order.feederId).get()
        const feederData = feederRes.data as FeederRecord | null
        feederInfo = {
          feederName: feederData?.name || feederData?.realName || '',
          feederPhone: feederData?.phone || '',
          feederAvatar: feederData?.avatarUrl || '',
        }
      } catch (e) {
        feederInfo = { feederName: '', feederPhone: '', feederAvatar: '' }
      }
    }

    await refreshPetAvatars([order])

    return handleSuccess({
      ...order,
      status: order.status,
      paymentStatus: order.paymentStatus || '',
      totalPrice: order.totalAmount || order.totalPrice || 0,
      feederName: feederInfo.feederName,
      feederPhone: feederInfo.feederPhone,
      feederAvatar: feederInfo.feederAvatar,
      tip: STATUS_TIPS[order.status || ''] || { title: '未知状态', subtitle: '', icon: '' },
    }, '获取成功')
  } catch (error) {
    if ((error as { code?: string }).code) { throw error }
    return handleError(error, '获取订单状态失败', ERROR_CODES.DATA)
  }
}

// =====================================================================
// Handler 9: getFeederOrders
// =====================================================================

export async function getFeederOrders(
  event: CloudEvent,
  _context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  const { status, page = 1, pageSize = 10 } = event
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  await checkPartnerPermission(openid, 'feeding')
  const feederRes = await db.collection('feeders')
    .where({ createdBy: openid })
    .field({ _id: true })
    .limit(100)
    .get()
  const feederIds: string[] = ((feederRes.data || []) as FeederRecord[]).map((f) => f._id || '').filter(Boolean)
  if (feederIds.length === 0) {
    return handleSuccess({ list: [], total: 0, page, pageSize, totalPages: 0, hasNext: false }, '获取成功')
  }
  const where: Record<string, unknown> = { feederId: _.in(feederIds) }
  if (status) { where.status = status }
  const result = await paginate(db, 'feedingOrders', {
    page, pageSize, where, projection: FEEDING_ORDER_FIELDS,
  }) as PaginateResult<FeedingOrderRecord>

  await refreshPetAvatars(result.list)

  return handleSuccess(result, '获取成功')
}

// =====================================================================
// Handler 10: getFeedingOrderDetail
// =====================================================================

export async function getFeedingOrderDetail(
  event: CloudEvent,
  _context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  const { orderId } = event
  if (!orderId) {
    throw err('INVALID_PARAMS', '缺少订单ID')
  }
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  await checkPartnerPermission(openid, 'feeding')
  const orderRes = await db.collection('feedingOrders').doc(orderId).get()
  if (!orderRes.data) {
    throw err('ORDER_NOT_FOUND', '订单不存在', { orderId })
  }
  const order = orderRes.data as FeedingOrderRecord
  await refreshPetAvatars([order])
  return handleSuccess({ ...order }, '获取成功')
}

// =====================================================================
// Handler 11: handleFeedingOrder
// =====================================================================

export async function handleFeedingOrder(
  event: CloudEvent,
  _context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  const { orderId, operation } = event
  if (!orderId) {
    throw err('INVALID_PARAMS', '缺少订单ID')
  }
  if (!operation) {
    throw err('INVALID_PARAMS', '缺少操作类型')
  }
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  await checkPartnerPermission(openid, 'feeding')
  const OPERATION_MAP: Record<string, string> = { confirm: 'confirmed', complete: 'completed' }
  const targetStatus = OPERATION_MAP[operation]
  if (!targetStatus) {
    throw err('INVALID_PARAMS', '无效的操作类型')
  }
  const orderRes = await db.collection('feedingOrders').doc(orderId).get()
  if (!orderRes.data) {
    throw err('ORDER_NOT_FOUND', '订单不存在', { orderId })
  }
  const order = orderRes.data as FeedingOrderRecord
  const TRANSITIONS: Record<string, string[]> = {
    pending_payment: ['confirmed'],
    confirmed: ['completed'],
    in_progress: ['completed'],
  }
  const allowed = TRANSITIONS[order.status || ''] || []
  if (!allowed.includes(targetStatus)) {
    throw err('ORDER_STATUS_INVALID', `无法从 ${order.status} 变更为 ${targetStatus}`, { from: order.status, to: targetStatus })
  }
  await db.collection('feedingOrders').doc(orderId).update({
    data: { status: targetStatus, updatedAt: db.serverDate() },
  })
  if (targetStatus === 'completed') {
    await createCommissionRecord('feeding', { ...order, totalAmount: order.totalPrice })
  }
  return handleSuccess(null, '操作成功')
}

// =====================================================================
// Handler 12: getCurrentFeeder
// =====================================================================

export async function getCurrentFeeder(
  event: CloudEvent,
  _context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  const { serviceType } = event
  const where: Record<string, unknown> = { createdBy: openid }
  if (serviceType) { where.serviceTypes = _.in([serviceType]) }
  const feederRes = await db.collection('feeders')
    .where(where)
    .limit(1)
    .get()
  if (!feederRes.data || feederRes.data.length === 0) {
    return handleSuccess(null, '未找到喂养师档案')
  }
  return handleSuccess(feederRes.data[0], '获取成功')
}

// =====================================================================
// Handlers 聚合
// =====================================================================

export const handlers: Record<string, FeedingActionHandler> = {
  getFeederList,
  getFeederDetail,
  createFeederProfile,
  updateFeederProfile,
  createFeedingOrder,
  getFeedingOrders,
  getOrderStatus,
  updateFeedingOrderStatus,
  getFeederOrders,
  getFeedingOrderDetail,
  handleFeedingOrder,
  getCurrentFeeder,
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

  const AUTH_REQUIRED_ACTIONS: string[] = [
    'createFeederProfile', 'updateFeederProfile', 'createFeedingOrder',
    'updateFeedingOrderStatus', 'getFeedingOrders', 'getOrderStatus',
    'getFeederOrders', 'getFeedingOrderDetail', 'handleFeedingOrder', 'getCurrentFeeder',
  ]
  const requireLogin = AUTH_REQUIRED_ACTIONS.includes(action)

  try {
    const auth = await verifyAuth(event, { requireLogin }) as AuthLike
    logger.info(action, { openid: auth.openid })
    return await handlers[action](event, context, auth)
  } catch (error) {
    logger.error(action, error)
    if (isBusinessError(error)) {
      return toResponse(error)
    }
    const code = (error as { code?: string }).code || ERROR_CODES.BUSINESS
    return handleError(error, (error as Error).message, code)
  }
}

// =====================================================================
// Runtime shim（CommonJS 兼容）
// =====================================================================

const _mod = module as { exports: Record<string, unknown> }
_mod.exports = {
  main,
  getFeederList,
  getFeederDetail,
  createFeederProfile,
  updateFeederProfile,
  createFeedingOrder,
  getFeedingOrders,
  getOrderStatus,
  updateFeedingOrderStatus,
  getFeederOrders,
  getFeedingOrderDetail,
  handleFeedingOrder,
  getCurrentFeeder,
  handlers,
}
_mod.exports.default = _mod.exports

export default {
  main,
  getFeederList,
  getFeederDetail,
  createFeederProfile,
  updateFeederProfile,
  createFeedingOrder,
  getFeedingOrders,
  getOrderStatus,
  updateFeedingOrderStatus,
  getFeederOrders,
  getFeedingOrderDetail,
  handleFeedingOrder,
  getCurrentFeeder,
  handlers,
}
