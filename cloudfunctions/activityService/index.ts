/**
 * activityService/index.ts - 活动服务主入口（TypeScript 源文件 - Sprint 38 迁移）
 *
 * 业务功能：
 *   - 活动列表 / 详情（用户端）
 *   - 活动报名（带风控前置 + 优惠券，支付走 paymentService 回调闭环）
 *   - 我的报名（详情、列表）
 *   - 定时状态自动更新（published → registration_stopped → ended + 佣金/收入）
 *
 * 注（P3-7 清理）：活动管理（CRUD/报名列表/导出/活动订单）已统一走
 *   adminService（合作伙伴端）与 orderService（订单列表），本服务不再承载。
 *
 * 共 5 个 action：
 *   1. getActivityList - 活动列表
 *   2. getActivityDetail - 活动详情
 *   3. submitRegistration - 提交报名（含风控前置）
 *   4. getRegistrationDetail - 报名详情
 *   5. getRegistrationList - 报名列表
 *
 * 迁移目标：
 *   - 强类型化所有 db 操作、handler 签名、返回结构
 *   - 复用 AuthLike / CloudEvent / CloudContext 公共类型
 *   - 与 adminService / partnerService / userService 保持类型一致
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.activityService.json
 */

// =====================================================================
// 公共类型（与 adminService / partnerService / userService 保持一致）
// =====================================================================

export interface AuthLike {
  openid?: string
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
  activityId?: string
  registrationId?: string
  orderId?: string
  pets?: PetInput[]
  petIds?: string[]
  phone?: string
  notes?: string
  friends?: unknown[]
  totalAmount?: number
  originalAmount?: number
  couponId?: string
  couponDiscount?: number
  participantCount?: number
  title?: string
  description?: string
  coverUrl?: string
  startTime?: string
  endTime?: string
  location?: string
  latitude?: number | null
  longitude?: number | null
  maxParticipants?: number
  category?: string
  price?: number
  pricePerPerson?: number
  pricePerPet?: number
  contactName?: string
  contactPhone?: string
  wechatId?: string
  images?: string[]
  [k: string]: unknown
}

export interface CloudContext {
  [k: string]: unknown
}

export type ActivityActionHandler = (
  event: CloudEvent,
  context: CloudContext,
  auth: AuthLike
) => Promise<unknown>

// =====================================================================
// 业务类型定义
// =====================================================================

export interface PetInput {
  petName?: string
  name?: string
  petGender?: string
  gender?: string
  petBreed?: string
  breed?: string
  petId?: string
  [k: string]: unknown
}

export interface PetInfo {
  name: string
  gender: string
  breed: string
  petId: string
}

export interface OrganizerInfo {
  name: string
  avatar: string
  _avatarInvalid?: boolean
  activityCount?: number
}

export interface UserRecord {
  _id?: string
  openid?: string
  nickName?: string
  avatarUrl?: string
  inviterId?: string
  [k: string]: unknown
}

export interface AdminRecord {
  _id?: string
  status?: string
  isPartner?: boolean
  nickName?: string
  avatarUrl?: string
  roles?: string[]
  permissions?: string[]
  [k: string]: unknown
}

export interface ActivityRecord {
  _id?: string
  title?: string
  description?: string
  coverUrl?: string
  images?: string[]
  startTime?: string
  endTime?: string
  location?: string
  latitude?: number | null
  longitude?: number | null
  maxParticipants?: number
  currentParticipants?: number
  category?: string
  price?: number
  pricePerPerson?: number
  pricePerPet?: number
  contactName?: string
  contactPhone?: string
  wechatId?: string
  status?: string
  createdBy?: string
  organizer?: OrganizerInfo
  createdAt?: Date
  updatedAt?: Date
  [k: string]: unknown
}

export interface RegistrationRecord {
  _id?: string
  activityId: string
  ownerId: string
  openid?: string
  phone?: string
  notes?: string
  pets?: PetInfo[]
  petIds?: string[]
  friends?: unknown[]
  status: string
  totalAmount?: number
  originalAmount?: number
  couponId?: string
  couponDiscount?: number
  finalAmount?: number
  participantCount?: number
  petCount?: number
  pricePerPerson?: number
  pricePerPet?: number
  orderId?: string
  outTradeNo?: string
  pendingReview?: boolean
  riskDecision?: string
  riskReasons?: string[]
  createdAt?: Date
  updatedAt?: Date
  [k: string]: unknown
}

export interface OrderRecord {
  _id?: string
  ownerId?: string
  orderId?: string
  outTradeNo?: string
  orderType?: string
  activityId?: string
  activityTitle?: string
  activityCoverUrl?: string
  activityStartTime?: string
  activityEndTime?: string
  activityLocation?: string
  organizerId?: string
  petIds?: string[]
  petsInfo?: PetInfo[]
  startDate?: string
  endDate?: string
  duration?: number
  pricePerDay?: number
  participantCount?: number
  petCount?: number
  pricePerPerson?: number
  pricePerPet?: number
  basicPrice?: number
  totalPrice?: number
  totalAmount?: number
  originalAmount?: number
  couponId?: string
  couponDiscount?: number
  phone?: string
  notes?: string
  status?: string
  paymentStatus?: string
  paidAt?: Date
  ownerInfo?: { nickName?: string; avatarUrl?: string; phone?: string }
  createdAt?: Date
  updatedAt?: Date
  [k: string]: unknown
}

export interface CommissionRecord {
  _id?: string
  inviterId: string
  inviterNickName: string
  ownerId: string
  orderType: string
  orderId?: string
  orderNo?: string
  orderAmount: number
  commissionRate: number
  commissionAmount: number
  status: string
  createdAt: Date
  updatedAt: Date
  [k: string]: unknown
}

export interface PaginateResult<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
}

export interface RiskCheckResult {
  pendingReview: boolean
  reasons: string[]
  decision: 'RISK_PASS' | 'RISK_PENDING' | 'RISK_REJECT'
}

export interface PaymentParams {
  timeStamp: string
  nonceStr: string
  package: string
  signType: string
  paySign: string
}

export interface ExportResult {
  activityTitle: string
  totalCount: number
  csvContent: string
}

export interface ActivityDetailResult extends ActivityRecord {
  isRegistered: boolean
}

// =====================================================================
// 内部模块初始化（require CommonJS 模块）
// =====================================================================

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { initCloud, handleSuccess, handleError, generateId, ERROR_CODES, paginate, escapeRegExp } = require('./common/utils')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createLogger } = require('./common/logger')
// 2026-08-02 写入器统一：佣金写入委托 common/commission-utils（全局唯一实现）
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createCommissionRecord } = require('./common/commission-utils')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { verifyAuth } = require('./common/auth-middleware')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { err, isBusinessError } = require('./common/errors')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { detectActivityApplyRisk, mapActionToErrorCode } = require('./common/risk-control')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { withRateLimit } = require('./common/risk-rate-limit')
// Sprint 50: 限流统一 bootstrap
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { bootstrapRateLimit } = require('./common/rate-limit-bootstrap')

const { cloud, db } = initCloud()
const logger = createLogger('activityService')
const _ = db.command

// Sprint 50: 注入全局限流存储（rate_limits + rate_limit_configs 一次注入）
try {
  bootstrapRateLimit(db, { logger })
} catch (e) {
  logger.warn('bootstrapRateLimit failed, fallback to memory:', e && (e as Error).message)
}

// =====================================================================
// 辅助函数：风控前置
// =====================================================================

/**
 * Sprint 22: 活动报名风控前置
 *   - reject → 抛 RISK_REJECT
 *   - review → 标 pendingReview = true（不阻塞报名，运营后续抽检）
 *   - allow  → 放行
 */
async function performActivityApplyRiskCheck(ctx: {
  openid: string
  activityId: string
  amountFen: number
}): Promise<RiskCheckResult> {
  const { openid, activityId, amountFen } = ctx
  let pendingReview = false
  let riskDecision: 'RISK_PASS' | 'RISK_PENDING' | 'RISK_REJECT' = 'RISK_PASS'
  let riskReasons: string[] = []
  try {
    const risk = await withRateLimit(
      { userId: openid, type: 'activity_apply', targetId: activityId },
      () => detectActivityApplyRisk({
        db,
        userId: openid,
        amountFen,
        targetId: activityId,
      })
    )
    riskDecision = mapActionToErrorCode(risk.action) as 'RISK_PASS' | 'RISK_PENDING' | 'RISK_REJECT'
    riskReasons = risk.reasons
    if (risk.action === 'reject') {
      logger.warn('activityApply.risk_reject', { userId: maskOpenid(openid), activityId, amountFen, reasons: risk.reasons })
      throw err('RISK_REJECT', '报名被风控拦截', {
        reasons: risk.reasons,
        level: risk.level,
        activityId,
      })
    }
    if (risk.action === 'review') {
      pendingReview = true
      logger.info('activityApply.risk_pending', { userId: maskOpenid(openid), activityId, amountFen, reasons: risk.reasons })
    } else {
      const debug = (logger as { debug?: (msg: string, meta: unknown) => void }).debug
      if (debug) { debug('activityApply.risk_pass', { userId: maskOpenid(openid), activityId }) }
    }
  } catch (e) {
    if (isBusinessError(e) && ((e as { code?: string }).code === 'RATE_LIMITED' || (e as { code?: string }).code === 'RISK_REJECT')) {
      throw e
    }
    logger.warn('activityApply.risk_control_error', { userId: maskOpenid(openid), activityId, msg: e && (e as Error).message })
    riskDecision = 'RISK_PASS'
  }
  return { pendingReview, reasons: riskReasons, decision: riskDecision }
}

// =====================================================================
// 辅助函数：佣金记录
// =====================================================================
// 2026-08-02 写入器统一：原本地实现（费率键 config[orderType] 同样踩中
// hosting/boarding 键不匹配的 P0，且金额/幂等口径与另两套实现漂移）已删除，
// 统一委托 common/commission-utils（全局唯一写入器）。
// 公共版已包含本地版的全部能力：确定性 _id 幂等、主键冲突静默跳过、
// 活动金额优先取 finalAmount → totalAmount → totalPrice。

// =====================================================================
// 辅助函数：活动状态自动更新
// =====================================================================

// M4 修复：本函数不再挂在 getActivityList 上同步执行（写放大），
// 改由 config.json 定时触发器（activityStatusTrigger，每 5 分钟）驱动
async function autoUpdateActivityStatus(): Promise<void> {
  try {
    const now = new Date()
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000)
    const bjTime = new Date(utc + (8 * 3600000))
    const nowStr = `${bjTime.getFullYear()}-${String(bjTime.getMonth() + 1).padStart(2, '0')}-${String(bjTime.getDate()).padStart(2, '0')} ${String(bjTime.getHours()).padStart(2, '0')}:${String(bjTime.getMinutes()).padStart(2, '0')}`

    const stoppedRes = await db.collection('activities')
      .where({ status: 'published', startTime: _.lte(nowStr) })
      .update({ data: { status: 'registration_stopped', updatedAt: db.serverDate() } })
    if (stoppedRes.updated > 0) {
      logger.info('autoUpdate.stopped', { updated: stoppedRes.updated })
    }

    // M4 修复：消除"查询-批量 update"竞态——先查候选，再逐活动条件更新，
    // updated===1（本次真正置为 ended）才生成佣金，不重不漏
    const endingActivitiesRes = await db.collection('activities')
      .where({ status: _.in(['published', 'registration_stopped']), endTime: _.lte(nowStr) })
      .field({ _id: true })
      .get()
    const endingActivities = (endingActivitiesRes.data || []) as { _id?: string }[]
    if (endingActivities.length === 0) { return }

    let endedCount = 0
    // M6 修复：分批限流（每批 5），避免瞬时打满数据库连接
    await runInBatches(endingActivities, 5, async (activity) => {
      if (!activity._id) { return }
      const upRes = await db.collection('activities')
        .where({ _id: activity._id, status: _.in(['published', 'registration_stopped']), endTime: _.lte(nowStr) })
        .update({ data: { status: 'ended', updatedAt: db.serverDate() } })
      if ((upRes.updated || 0) > 0) {
        endedCount += 1
        await generateActivityCommissions(activity._id)
      }
    })
    if (endedCount > 0) {
      logger.info('autoUpdate.ended', { updated: endedCount })
    }
  } catch (e) {
    logger.error('autoUpdate', e)
  }
}

/**
 * 为已结束的活动生成佣金记录
 * 查询所有已确认的报名，为每个报名创建佣金
 */
async function generateActivityCommissions(activityId: string): Promise<void> {
  try {
    // 查询该活动所有已确认的报名
    const registrationsRes = await db.collection('activity_registrations')
      .where({ activityId, status: 'confirmed' })
      .get()
    const registrations = registrationsRes.data || []

    if (registrations.length === 0) {
      logger.info('generateActivityCommissions.noRegistrations', { activityId })
      return
    }

    // 获取所有报名对应的订单ID
    const orderIds = registrations.map((r: { orderId?: string }) => r.orderId).filter(Boolean) as string[]
    if (orderIds.length === 0) return

    // M6 修复：_.in 大数组分批查询（每批 100）
    const orders: Record<string, unknown>[] = []
    for (let i = 0; i < orderIds.length; i += 100) {
      const ordersRes = await db.collection('orders')
        .where({ _id: _.in(orderIds.slice(i, i + 100)), status: 'confirmed' })
        .get()
      orders.push(...(ordersRes.data || []))
    }

    // M6 修复：分批限流（每批 5）创建佣金，替代无上限 Promise.all
    await runInBatches(orders, 5, async (order) => {
      await createCommissionRecord('activity', order as OrderRecord)
    })

    logger.info('generateActivityCommissions.done', { activityId, registrations: registrations.length, orders: orders.length })
  } catch (e) {
    logger.error('generateActivityCommissions', { activityId, msg: (e as Error).message })
  }
}

// =====================================================================
// 辅助函数：合作伙伴权限校验
// =====================================================================

// =====================================================================
// 辅助函数：金额 / 优惠券 服务端校验（H3 修复）
// =====================================================================

// 复刻 couponService.calculateCouponDiscount，避免跨云函数调用带来的不确定性
type CouponRulesLite = { threshold?: number; reduceAmount?: number; discountRate?: number; maxReduceAmount?: number }
function calculateActivityCouponDiscount(
  type: string | undefined,
  rules: CouponRulesLite | undefined,
  orderAmount: number
): { eligible: boolean; discountAmount?: number; message?: string } {
  if (!rules) { return { eligible: false, message: '优惠券规则缺失' } }
  // 与 couponService.calculateCouponDiscount 对齐：统一整数分计算，避免浮点漂移
  const orderAmountInFen = Math.round(orderAmount * 100)
  if (orderAmountInFen <= 10) {
    return { eligible: false, message: '订单金额过小，无法使用优惠券' }
  }
  if (rules.threshold) {
    const thresholdInFen = Math.round(rules.threshold * 100)
    if (orderAmountInFen < thresholdInFen) {
      return { eligible: false, message: `订单金额未达到满${rules.threshold}元使用门槛` }
    }
  }
  let discountInFen = 0
  switch (type) {
    case 'fixed_amount':
    case 'full_reduction':
      discountInFen = Math.round((rules.reduceAmount || 0) * 100)
      break
    case 'discount': {
      const discountRate = Number(rules.discountRate) || 1
      if (discountRate <= 0 || discountRate > 1) { return { eligible: false, message: '折扣率无效' } }
      discountInFen = Math.round(orderAmountInFen * (1 - discountRate))
      if (rules.maxReduceAmount && rules.maxReduceAmount > 0) {
        discountInFen = Math.min(discountInFen, Math.round(rules.maxReduceAmount * 100))
      }
      break
    }
    default:
      return { eligible: false, message: '未知优惠券类型' }
  }
  // 实付下限 0.1 元：折扣最高封顶到 原价 - 0.1（与商城/团购/喂养/寄养一致）
  discountInFen = Math.min(discountInFen, orderAmountInFen - 10)
  return { eligible: true, discountAmount: discountInFen / 100 }
}

// 服务端重算活动金额（H3：不再信任前端 totalAmount）
function computeActivityAmount(activity: ActivityRecord, pCount: number, petCount: number): number {
  const pricePerPerson = activity.pricePerPerson || 0
  const pricePerPet = activity.pricePerPet || 0
  return Math.max(0, pricePerPerson * pCount + pricePerPet * petCount)
}

// 校验并解析优惠券，返回服务端认定的折扣（H3）
// 仅做校验 + 计算，不修改券状态，避免与 couponService 的 lock/use 流程冲突导致重复核销
async function resolveCoupon(
  openid: string,
  couponId: string | undefined,
  calculatedAmount: number,
  activityId?: string
): Promise<{ couponId: string; discount: number }> {
  if (!couponId) { return { couponId: '', discount: 0 } }
  try {
    const couponRes = await db.collection('user_coupons').where({ _id: couponId }).limit(1).get()
    const coupon = (couponRes.data || [])[0] as
      | { ownerId?: string; status?: string; startTime?: string | Date; endTime?: string | Date; applicableScopes?: string[]; applicableItemIds?: string[]; type?: string; rules?: CouponRulesLite }
      | undefined
    if (!coupon) { logger.warn('resolveCoupon.notFound', { couponId, openid: maskOpenid(openid) }); return { couponId: '', discount: 0 } }
    if (coupon.ownerId !== openid) { logger.warn('resolveCoupon.ownerMismatch', { couponId, openid: maskOpenid(openid) }); return { couponId: '', discount: 0 } }
    if (coupon.status && coupon.status !== 'unused' && coupon.status !== 'locked') {
      logger.warn('resolveCoupon.statusInvalid', { couponId, status: coupon.status }); return { couponId: '', discount: 0 }
    }
    const now = new Date()
    if (coupon.startTime && now < new Date(coupon.startTime as string)) { return { couponId: '', discount: 0 } }
    if (coupon.endTime && now > new Date(coupon.endTime as string)) { return { couponId: '', discount: 0 } }
    const scopes = coupon.applicableScopes || []
    // 空数组/缺失=全模块；兼容历史 'all' 值
    if (scopes.length > 0 && !scopes.includes('all') && !scopes.includes('activity')) {
      logger.warn('resolveCoupon.scopeInvalid', { couponId, scopes }); return { couponId: '', discount: 0 }
    }
    // P1-5 修复：指定活动券必须命中当前活动（与服务端下单校验对齐）
    if (coupon.applicableItemIds && coupon.applicableItemIds.length > 0) {
      if (!activityId || !coupon.applicableItemIds.includes(activityId)) {
        logger.warn('resolveCoupon.itemInvalid', { couponId, activityId }); return { couponId: '', discount: 0 }
      }
    }
    const result = calculateActivityCouponDiscount(coupon.type, coupon.rules, calculatedAmount)
    if (!result.eligible || result.discountAmount === undefined) { return { couponId: '', discount: 0 } }
    return { couponId, discount: result.discountAmount }
  } catch (e) {
    logger.warn('resolveCoupon.error', { couponId, msg: (e as Error).message })
    return { couponId: '', discount: 0 }
  }
}

// 手机号脱敏（H5：列表/订单场景不直接暴露完整号码）
function maskPhone(phone: string | undefined): string {
  if (!phone) { return '' }
  const s = String(phone).trim()
  if (s.length < 7) { return s }
  return `${s.slice(0, 3)}****${s.slice(-4)}`
}

// L9 修复：openid 属 PII，日志中掩码，避免明文落盘
function maskOpenid(openid: string | undefined): string {
  if (!openid) { return '' }
  const s = String(openid)
  if (s.length <= 6) { return s }
  return `${s.slice(0, 6)}***`
}

// =====================================================================
// M7 修复：活动状态枚举 + 状态机 + 关键字段校验
// =====================================================================


/**
 * M3 修复：循环分页拉取集合全量数据，规避 CloudBase 单次 get 上限静默截断
 * @param maxTotal 安全上限，防止超大集合拖爆内存/超时
 */
async function fetchAllPaged<T>(
  collection: string,
  where: Record<string, unknown>,
  orderByField: string,
  maxTotal = 5000
): Promise<T[]> {
  const BATCH = 100
  const all: T[] = []
  let skip = 0
  for (;;) {
    const res = await db.collection(collection)
      .where(where)
      .orderBy(orderByField, 'desc')
      .skip(skip)
      .limit(BATCH)
      .get()
    const batch = (res.data || []) as T[]
    all.push(...batch)
    if (batch.length < BATCH || all.length >= maxTotal) { break }
    skip += BATCH
  }
  return all.slice(0, maxTotal)
}

/**
 * M3 修复：CSV 公式注入防护——以 = + - @ 及制表符/回车开头的单元格加单引号前缀，
 * 防止 Excel/WPS 打开时把用户可控内容当公式执行
 */

/**
 * M6 修复：并发批处理限流——分批执行异步任务，避免 Promise.all 无上限打满数据库连接
 */
async function runInBatches<T>(items: T[], batchSize: number, worker: (item: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    await Promise.all(batch.map((item) => worker(item).catch((e) => {
      logger.warn('runInBatches.item', { msg: (e as Error).message })
    })))
  }
}


// =====================================================================
// Handler 1: getActivityList - 活动列表
// =====================================================================

const ACTIVITY_LIST_FIELDS: Record<string, boolean> = {
  _id: true, title: true, coverUrl: true, startTime: true, endTime: true,
  location: true, latitude: true, longitude: true, category: true,
  price: true, pricePerPerson: true, pricePerPet: true,
  maxParticipants: true, currentParticipants: true, status: true, createdBy: true, createdAt: true, organizer: true,
}

const REGISTRATION_LIST_FIELDS: Record<string, boolean> = {
  _id: true, activityId: true, openid: true, phone: true, status: true,
  totalAmount: true, createdAt: true,
}

export async function getActivityList(
  event: CloudEvent,
  context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { page = 1, pageSize = 10, status, category, keyword } = event
  const safePageSize = Math.min(Math.max(1, Number(pageSize) || 10), 100)
  logger.info('getActivityList.query', { page, pageSize: safePageSize, status, category, keyword })

  // M4 修复：状态自动更新迁移至定时触发器（见 main 入口 Timer 分支），列表接口只读

  const where: Record<string, unknown> = {}
  if (status && status !== 'all') {
    where.status = status
  } else {
    // P1-A 修复：默认只展示"对用户可见"的活动（已发布/报名截止/已结束），
    //   原 _.neq('deleted') 会把草稿（draft）与已取消（cancelled）活动外露给用户列表
    where.status = _.in(['published', 'registration_stopped', 'ended'])
  }
  if (category && category !== 'all') {
    where.category = category
  }
  if (keyword) {
    const safeKeyword = escapeRegExp(String(keyword).slice(0, 50))
    where.$or = [
      { title: db.RegExp({ regexp: safeKeyword, options: 'i' }) },
      { location: db.RegExp({ regexp: safeKeyword, options: 'i' }) },
    ]
  }

  const result = await paginate(db, 'activities', {
    page, pageSize: safePageSize, where,
    projection: ACTIVITY_LIST_FIELDS,
    orderBy: { field: 'createdAt', direction: 'desc' },
  })

  ;(result.list as ActivityRecord[]).forEach((activity) => {
    const avatar = activity.organizer && activity.organizer.avatar
    if (avatar && !avatar.startsWith('cloud://') && !avatar.startsWith('https://')) {
      if (activity.organizer) {
        activity.organizer.avatar = ''
        activity.organizer._avatarInvalid = true
      }
    }
  })

  const invalidAvatarActivities = (result.list as ActivityRecord[]).filter(a => a.organizer && a.organizer._avatarInvalid && a.createdBy)
  if (invalidAvatarActivities.length > 0) {
    const creatorOpenids = [...new Set(invalidAvatarActivities.map(a => a.createdBy).filter((id): id is string => Boolean(id)))]
    try {
      const adminRes = await db.collection('admins').where({ _id: _.in(creatorOpenids) }).field({ avatarUrl: true, nickName: true }).get()
      const adminMap: Record<string, AdminRecord> = {}
      ;(adminRes.data || []).forEach((a: AdminRecord) => { if (a._id) { adminMap[a._id] = a } })
      invalidAvatarActivities.forEach((activity) => {
        if (!activity.createdBy || !activity.organizer) { return }
        const admin = adminMap[activity.createdBy]
        if (admin && admin.avatarUrl && (admin.avatarUrl.startsWith('cloud://') || admin.avatarUrl.startsWith('https://'))) {
          activity.organizer.avatar = admin.avatarUrl
          if (admin.nickName && activity.organizer.name === '宠团团') {
            activity.organizer.name = admin.nickName
          }
        }
        delete activity.organizer._avatarInvalid
      })
    } catch (e) {
      invalidAvatarActivities.forEach((a) => { if (a.organizer) { delete a.organizer._avatarInvalid } })
    }
  }

  logger.info('getActivityList.result', { total: result.total, listCount: result.list.length })

  let myRegistrations: string[] = []
  if (auth.openid) {
    const regRes = await db.collection('activity_registrations')
      .where({ ownerId: auth.openid, status: 'confirmed' })
      .field({ activityId: true })
      .get()
    myRegistrations = (regRes.data || []).map((r: { activityId?: string }) => r.activityId).filter((id: string | undefined): id is string => Boolean(id))
  }

  result.list = (result.list as ActivityRecord[]).map((activity) => ({
    ...activity,
    joined: myRegistrations.includes(activity._id || ''),
  }))

  return handleSuccess(result, '获取成功')
}

// =====================================================================
// Handler 2: getActivityDetail - 活动详情
// =====================================================================

export async function getActivityDetail(
  event: CloudEvent,
  context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { activityId } = event
  if (!activityId) { throw err('INVALID_PARAMS', '缺少活动ID') }

  try {
    // L8 修复：主查询与"我是否报名"相互独立，并行执行降低详情接口 P95
    const [res, regRes] = await Promise.all([
      db.collection('activities').doc(activityId).get(),
      auth.openid
        ? db.collection('activity_registrations')
            .where({ activityId, ownerId: auth.openid, status: 'confirmed' })
            .count()
        : Promise.resolve<{ total: number }>({ total: 0 }),
    ])

    const isRegistered = regRes.total > 0
    const data = res.data as ActivityRecord | null
    if (!data) {
      throw err('NOT_FOUND', '活动不存在')
    }

    const result: ActivityDetailResult = { ...data, isRegistered }

    // L8 修复：头像补全与活动数彼此独立且都依赖主查询结果 → 并行执行
    await Promise.all([
      (async () => {
        if (!(result.organizer && result.organizer.avatar)) return
        const avatar = result.organizer.avatar
        if (avatar.startsWith('cloud://') || avatar.startsWith('https://')) return
        result.organizer.avatar = ''
        if (!result.createdBy) return
        try {
          const adminRes = await db.collection('admins').doc(result.createdBy).field({ avatarUrl: true, nickName: true }).get()
          const admin = adminRes.data as AdminRecord | null
          if (admin && admin.avatarUrl && (admin.avatarUrl.startsWith('cloud://') || admin.avatarUrl.startsWith('https://'))) {
            result.organizer.avatar = admin.avatarUrl
            if (admin.nickName && result.organizer.name === '宠团团') {
              result.organizer.name = admin.nickName
            }
          }
        } catch (e) {
          logger.warn('getActivityDetail.admins.fetch', { createdBy: result.createdBy, code: (e as { errCode?: unknown }).errCode, msg: (e as Error).message })
        }
      })(),
      (async () => {
        if (!(data.createdBy && result.organizer)) return
        try {
          const countRes = await db.collection('activities')
            .where({ createdBy: data.createdBy, status: _.in(['published', 'ongoing', 'ended']) })
            .count()
          result.organizer.activityCount = countRes.total || 0
        } catch (e) {
          logger.warn('queryHostActivities', e)
          result.organizer.activityCount = 0
        }
      })(),
    ])

    return handleSuccess(result, '获取成功')
  } catch (error) {
    return handleError(error, '活动不存在', ERROR_CODES.NOT_FOUND)
  }
}

// =====================================================================
// Handler 6: submitRegistration - 提交报名（含风控前置）
// =====================================================================

export async function submitRegistration(
  event: CloudEvent,
  context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  const { activityId, pets, phone, notes, friends, petIds, couponId, participantCount, _registrationId } = event
  if (!activityId) { throw err('INVALID_PARAMS', '缺少活动ID') }
  if (!pets || !Array.isArray(pets) || pets.length === 0) { throw err('INVALID_PARAMS', '请选择参与的宠物') }
  if (!phone) { throw err('INVALID_PARAMS', '请填写联系电话') }

  // P0-B 配套：允许前端预生成报名单 ID（用于与 couponService.lockCoupon 关联的临时订单号一致），
  //   格式与 couponService.isValidId 对齐（字母数字下划线，≤64 位），避免注入。
  let preRegId = ''
  if (_registrationId !== undefined && _registrationId !== null && _registrationId !== '') {
    if (typeof _registrationId !== 'string' || _registrationId.length > 64 || !/^[a-zA-Z0-9_]+$/.test(_registrationId)) {
      throw err('INVALID_PARAMS', '报名单ID格式错误')
    }
    preRegId = _registrationId
    // 防重复提交：预生成 ID 已存在说明同一笔报名已被提交
    try {
      const dupRes = await db.collection('activity_registrations').doc(preRegId).get()
      if (dupRes.data) {
        throw err('BUSINESS_ERROR', '请勿重复提交')
      }
    } catch (e) {
      if ((e as { code?: string }).code === 'BUSINESS_ERROR') { throw e }
      // doc().get() 不存在时可能抛错，按"不存在"处理
    }
  }

  // M1 修复：查重前置到事务外（CloudBase 事务内不支持 where 查询），
  // 名额检查移入事务内基于快照读，避免"读-判-写"跨事务竞态
  const existReg = await db.collection('activity_registrations')
    .where({ activityId, ownerId: openid, status: 'confirmed' })
    .count()
  if (existReg.total > 0) {
    throw err('BUSINESS_ERROR', '您已报名此活动')
  }

  const transaction = await db.startTransaction()

  try {
    // M1 修复：活动读取走事务快照，与后续 _.inc 同事务；
    // 并发提交冲突时 CloudBase 事务失败回滚，杜绝名额超卖
    const activityRes = await transaction.collection('activities').doc(activityId).get()
    const activity = activityRes.data as ActivityRecord | null
    if (!activity) {
      throw err('NOT_FOUND', '活动不存在')
    }
    // P1-A 修复：仅"已发布"状态可报名——草稿/报名截止/已取消/已结束活动一律拒绝
    if (activity.status !== 'published') {
      throw err('BUSINESS_ERROR', `活动当前状态不可报名：${activity.status || '未知'}`)
    }

    const pricePerPerson = activity.pricePerPerson || 0
    const pricePerPet = activity.pricePerPet || 0
    // M2 修复：participantCount 服务端规范化（≥1 的整数），不再裸信前端
    const pCount = Math.max(1, Math.floor(Number(participantCount) || 1))

    if (activity.maxParticipants && (activity.currentParticipants || 0) + pCount > activity.maxParticipants) {
      throw err('BUSINESS_ERROR', '报名人数已满')
    }
    const petsArray = pets as PetInput[]
    const friendsArray = Array.isArray(friends) ? friends : []
    const petCount = petsArray.length + friendsArray.length
    // H3 修复：金额一律服务端重算，不再信任前端 totalAmount
    const calculatedAmount = computeActivityAmount(activity, pCount, petCount)
    const coupon = await resolveCoupon(openid, couponId, calculatedAmount, activityId)
    const finalAmount = Math.max(0, Math.round((calculatedAmount - coupon.discount) * 100) / 100)

    // Sprint 22: 活动报名前先做大额风控
    const applyRisk = await performActivityApplyRiskCheck({
      openid,
      activityId,
      amountFen: Math.round(calculatedAmount * 100),
    })

    const isPaid = calculatedAmount > 0
    const now = db.serverDate()
    const petsInfo: PetInfo[] = petsArray.map((p) => ({
      name: p.petName || p.name || '',
      gender: p.petGender || p.gender || 'male',
      breed: p.petBreed || p.breed || '',
      petId: p.petId || '',
    }))

    const registration: RegistrationRecord = {
      _id: preRegId || generateId('registration', openid),
      activityId,
      ownerId: openid,
      pets: petsInfo,
      petIds: petIds || [],
      phone: phone || '',
      notes: notes || '',
      friends: friendsArray,
      status: isPaid ? 'pending_payment' : 'confirmed',
      // P0-A 修复：报名单补写 paymentStatus（付费=pending 中间态 / 免费=paid 无支付流程），
      //   paymentService.createPayment 条件更新与 orderTimeoutService 超时扫描均依赖该字段
      paymentStatus: isPaid ? 'pending' : 'paid',
      participantCount: pCount,
      petCount,
      pricePerPerson,
      pricePerPet,
      totalAmount: calculatedAmount,
      originalAmount: calculatedAmount,
      couponId: coupon.couponId,
      couponDiscount: coupon.discount,
      finalAmount,
      pendingReview: applyRisk.pendingReview,
      riskDecision: applyRisk.decision,
      riskReasons: applyRisk.reasons,
      createdAt: now,
      updatedAt: now,
    }
    const regResult = await transaction.collection('activity_registrations').add({ data: registration })

    if (!isPaid) {
      await transaction.collection('activities').doc(activityId).update({
        data: {
          currentParticipants: _.inc(pCount),
          updatedAt: db.serverDate(),
        },
      })
    }

    try {
      let user: UserRecord | null = null
      try {
        const userRes = await db.collection('users').doc(openid).get()
        user = userRes.data
      } catch (e) {
        logger.warn('submitRegistration.users.fetch', { openid: maskOpenid(openid), code: (e as { errCode?: unknown }).errCode, msg: (e as Error).message })
      }

      const activityOrder: OrderRecord = {
        ownerId: openid,
        orderType: 'activity',
        type: 'activity',
        activityId,
        activityTitle: activity.title || '',
        activityCoverUrl: activity.coverUrl || '',
        activityStartTime: activity.startTime || '',
        activityEndTime: activity.endTime || '',
        activityLocation: activity.location || '',
        organizerId: activity.createdBy || '',
        petIds: petIds || [],
        petsInfo,
        startDate: activity.startTime || '',
        endDate: activity.endTime || '',
        duration: 1,
        pricePerDay: activity.price || 0,
        participantCount: pCount,
        petCount,
        pricePerPerson,
        pricePerPet,
        basicPrice: calculatedAmount,
        totalPrice: finalAmount,
        originalAmount: calculatedAmount,
        couponId: coupon.couponId,
        couponDiscount: coupon.discount,
        phone: phone || '',
        notes: notes || '',
        status: isPaid ? 'pending_payment' : 'confirmed',
        ownerInfo: user ? { nickName: user.nickName, avatarUrl: user.avatarUrl, phone } : { phone },
        createdAt: now,
        updatedAt: now,
      }

      // H7: idx_bookingKey_unique 唯一索引要求 orders 全文档 bookingKey 唯一
      //   活动订单无寄养业务键,用 _id 占位保证唯一性,避免 null 冲突导致 -502001 DuplicateKey
      activityOrder._id = generateId('order', openid)
      activityOrder.bookingKey = `nb_${activityOrder._id}`
      await transaction.collection('orders').add({ data: activityOrder })
    } catch (orderErr) {
      logger.warn('创建活动订单记录失败:', (orderErr as Error).message)
    }

    await transaction.commit()
    return handleSuccess({ id: (regResult as { _id?: string })._id || 'ok', registrationId: (regResult as { _id?: string })._id }, '报名成功')
  } catch (error) {
    // M1 修复：rollback 包裹 try/catch，避免二次 rollback 抛新错掩盖原始业务错误
    try { await transaction.rollback() } catch (_) { /* ignore rollback error */ }
    return handleError(error, '报名失败', ERROR_CODES.DATA)
  }
}

// =====================================================================
// Handler 7: getRegistrationDetail - 报名详情
// =====================================================================

export async function getRegistrationDetail(
  event: CloudEvent,
  context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  const { registrationId } = event
  if (!registrationId) { throw err('INVALID_PARAMS', '缺少订单ID') }

  try {
    let registration: RegistrationRecord | null = null

    try {
      const regRes = await db.collection('activity_registrations').doc(registrationId).get()
      if (regRes.data && (regRes.data as RegistrationRecord).ownerId === openid) {
        registration = regRes.data
      }
    } catch (e) {
      logger.warn('getRegistrationDetail.activity_registrations.fetch', { registrationId, code: (e as { errCode?: unknown }).errCode, msg: (e as Error).message })
    }

    if (!registration) {
      try {
        const orderRes = await db.collection('orders').doc(registrationId).get()
        if (orderRes.data) {
          const order = orderRes.data as OrderRecord
          if (order.ownerId === openid) {
            const regQuery = await db.collection('activity_registrations')
              .where({ activityId: order.activityId, ownerId: openid })
              .limit(1).get()
            const regData = (regQuery.data || []) as RegistrationRecord[]
            if (regData.length > 0) {
              registration = regData[0]
            } else {
              registration = {
                _id: order._id,
                activityId: order.activityId || '',
                ownerId: openid,
                pets: order.petsInfo || [],
                phone: order.phone || '',
                notes: order.notes || '',
                participantCount: order.participantCount || 1,
                petCount: order.petCount || 0,
                totalAmount: order.totalPrice || order.basicPrice || 0,
                originalAmount: order.originalAmount || order.totalPrice || 0,
                couponId: order.couponId || '',
                couponDiscount: order.couponDiscount || 0,
                finalAmount: order.totalPrice || 0,
                status: order.status || 'pending',
                createdAt: order.createdAt,
              }
            }
          } else {
            throw err('AUTH_REQUIRED', '无权查看此订单')
          }
        }
      } catch (e) {
        logger.warn('getRegistrationDetail.orders.lookup', { registrationId, code: (e as { errCode?: unknown }).errCode, msg: (e as Error).message })
      }
    }

    if (!registration) {
      throw err('NOT_FOUND', '订单不存在')
    }

    let activityInfo: Record<string, unknown> | null = null
    try {
      const activityRes = await db.collection('activities').doc(registration.activityId).get()
      if (activityRes.data) {
        const act = activityRes.data as ActivityRecord
        activityInfo = {
          title: act.title || '',
          coverUrl: act.coverUrl || '',
          startTime: act.startTime || '',
          endTime: act.endTime || '',
          location: act.location || '',
          pricePerPerson: act.pricePerPerson || 0,
          pricePerPet: act.pricePerPet || 0,
        }
      }
    } catch (e) {
      logger.warn('getRegistrationDetail: 获取活动信息失败', (e as Error).message)
    }

    return handleSuccess({
      registration,
      activityInfo,
    }, '获取成功')
  } catch (error) {
    logger.error('getRegistrationDetail', error)
    return handleError(error, '获取报名详情失败', ERROR_CODES.BUSINESS)
  }
}

// =====================================================================
// Handler 8: getRegistrationList - 报名列表
// =====================================================================

export async function getRegistrationList(
  event: CloudEvent,
  context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  const { page = 1, pageSize = 20, activityId, status } = event
  // M5 修复：pageSize 增加下限保护（0/负数/非数字回退默认），与其他 handler 口径一致
  const safePageSize = Math.min(Math.max(1, Number(pageSize) || 20), 20)
  const where: Record<string, unknown> = { ownerId: openid }
  if (activityId) { where.activityId = activityId }

  // M5 修复：status==='active'（进行中的已报名活动）过滤提前到查询层，
  // 分页与 total 均基于过滤后的数据集，不再对"当前页"做内存过滤导致分页错乱
  if (status === 'active') {
    const myRegs = await fetchAllPaged<{ activityId?: string }>(
      'activity_registrations', { ownerId: openid, status: 'confirmed' }, 'createdAt', 1000)
    const myActivityIds = [...new Set(myRegs.map((r) => r.activityId).filter((id): id is string => Boolean(id)))]
    if (myActivityIds.length === 0) {
      return handleSuccess({ list: [], total: 0, page, pageSize: safePageSize }, '获取成功')
    }

    const now = new Date()
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000)
    const bjTime = new Date(utc + (8 * 3600000))
    const nowStr = `${bjTime.getFullYear()}-${String(bjTime.getMonth() + 1).padStart(2, '0')}-${String(bjTime.getDate()).padStart(2, '0')} ${String(bjTime.getHours()).padStart(2, '0')}:${String(bjTime.getMinutes()).padStart(2, '0')}`

    const activeIds: string[] = []
    for (let i = 0; i < myActivityIds.length; i += 100) {
      const actRes = await db.collection('activities')
        .where({
          _id: _.in(myActivityIds.slice(i, i + 100)),
          status: _.nin(['ended', 'cancelled', 'deleted']),
        })
        .field({ _id: true, endTime: true })
        .get()
      ;((actRes.data || []) as { _id?: string; endTime?: string }[]).forEach((a) => {
        if (!a._id) { return }
        if (a.endTime && String(a.endTime) <= nowStr) { return }
        activeIds.push(a._id)
      })
    }
    if (activeIds.length === 0) {
      return handleSuccess({ list: [], total: 0, page, pageSize: safePageSize }, '获取成功')
    }
    where.activityId = _.in(activeIds)
    where.status = 'confirmed'
  } else if (status) {
    where.status = status
  }

  const result = await paginate(db, 'activity_registrations', {
    page, pageSize: safePageSize, where, projection: REGISTRATION_LIST_FIELDS,
    orderBy: { field: 'createdAt', direction: 'desc' },
  })

  const activityIds = [...new Set((result.list as RegistrationRecord[]).map((r) => r.activityId).filter((id): id is string => Boolean(id)))]
  if (activityIds.length > 0) {
    const activitiesRes = await db.collection('activities')
      .where({ _id: _.in(activityIds) })
      .get()

    const activityMap: Record<string, ActivityRecord> = {}
    ;(activitiesRes.data as ActivityRecord[] || []).forEach((a) => { if (a._id) { activityMap[a._id] = a } })

    // M5 修复：regMap 保留每个活动"最新"一条报名（列表已按 createdAt desc 排序，首条即最新），
    // 存量重复报名不再互相覆盖
    const regMap: Record<string, RegistrationRecord> = {}
    ;(result.list as RegistrationRecord[]).forEach((r) => {
      if (r.activityId && !regMap[r.activityId]) { regMap[r.activityId] = r }
    })

    const activities: (ActivityRecord & { joined: boolean; _registrationId: string; regStatus: string; regCreatedAt: Date | undefined })[] = activityIds
      .map((id) => activityMap[id])
      .filter((a): a is ActivityRecord => Boolean(a))
      .map((a) => {
        const reg = regMap[a._id || '']
        return {
          ...a,
          joined: true,
          _registrationId: reg ? (reg._id || '') : (a._id || ''),
          regStatus: reg ? reg.status : '',
          regCreatedAt: reg ? reg.createdAt : a.createdAt,
        }
      })

    // M5 修复：active 过滤已提前到查询层（见上方 where 构造），此处不再内存过滤、不再覆盖 result.total

    const invalidAvatarList: ActivityRecord[] = []
    for (const activity of activities) {
      if (activity.organizer && activity.organizer.avatar) {
        const avatar = activity.organizer.avatar
        if (!avatar.startsWith('cloud://') && !avatar.startsWith('https://')) {
          activity.organizer.avatar = ''
          if (activity.createdBy) { invalidAvatarList.push(activity) }
        }
      }
    }

    if (invalidAvatarList.length > 0) {
      const creatorOpenids = [...new Set(invalidAvatarList.map((a) => a.createdBy).filter((id): id is string => Boolean(id)))]
      try {
        const adminRes = await db.collection('admins').where({ _id: _.in(creatorOpenids) }).field({ avatarUrl: true, nickName: true }).get()
        const adminMap: Record<string, AdminRecord> = {}
        ;(adminRes.data || []).forEach((a: AdminRecord) => { if (a._id) { adminMap[a._id] = a } })
        invalidAvatarList.forEach((activity) => {
          if (!activity.createdBy || !activity.organizer) { return }
          const admin = adminMap[activity.createdBy]
          if (admin && admin.avatarUrl && (admin.avatarUrl.startsWith('cloud://') || admin.avatarUrl.startsWith('https://'))) {
            activity.organizer.avatar = admin.avatarUrl
            if (admin.nickName && activity.organizer.name === '宠团团') {
              activity.organizer.name = admin.nickName
            }
          }
        })
      } catch (e) {
        logger.warn('getRegistrationList.admins.fetch', { count: creatorOpenids.length, code: (e as { errCode?: unknown }).errCode, msg: (e as Error).message })
      }
    }

    result.list = activities
  } else {
    result.list = []
  }

  return handleSuccess(result, '获取成功')
}






export const handlers: Record<string, ActivityActionHandler> = {
  getActivityList,
  getActivityDetail,
  submitRegistration,
  getRegistrationDetail,
  getRegistrationList,
}

// =====================================================================
// Main 入口（云函数调用）
// =====================================================================

// P3-010: 写操作和登录校验 action 列表提升为模块级常量，避免每次调用重新创建数组
const WRITE_ACTIONS = ['submitRegistration'] as const
const LOGIN_REQUIRED_ACTIONS = [...WRITE_ACTIONS, 'getActivityDetail', 'getRegistrationDetail', 'getRegistrationList'] as const

export async function main(
  event: CloudEvent,
  context: CloudContext
): Promise<unknown> {
  // M4 修复：定时触发器入口（config.json triggers: activityStatusTrigger）
  // 仅接受平台 Timer 事件，不暴露为外部可调 action
  if ((event as { Type?: string }).Type === 'Timer') {
    logger.info('timer.autoUpdateActivityStatus', { trigger: (event as { TriggerName?: string }).TriggerName || 'timer' })
    await autoUpdateActivityStatus()
    return handleSuccess(null, '活动状态定时更新完成')
  }

  const { action } = event
  if (!action || !handlers[action]) {
    throw err('INVALID_PARAMS', '无效的操作类型')
  }

  const requireLogin = LOGIN_REQUIRED_ACTIONS.includes(action as typeof LOGIN_REQUIRED_ACTIONS[number])

  try {
    const auth = await verifyAuth(event, { requireLogin })
    logger.info(action, { openid: maskOpenid(auth.openid) })
    return await handlers[action](event, context, auth)
  } catch (error) {
    logger.error(action, error)
    const code = (error as { code?: string }).code || ERROR_CODES.BUSINESS
    return handleError(error, (error as Error).message, code)
  }
}

// =====================================================================
// Runtime shim: CommonJS 兼容
// =====================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _mod = module as { exports: Record<string, unknown> }
_mod.exports = {
  main,
  getActivityList,
  getActivityDetail,
  submitRegistration,
  getRegistrationDetail,
  getRegistrationList,
  handlers,
}
_mod.exports.default = _mod.exports

export default {
  main,
  getActivityList,
  getActivityDetail,
  submitRegistration,
  getRegistrationDetail,
  getRegistrationList,
  handlers,
}
