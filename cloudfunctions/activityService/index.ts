/**
 * activityService/index.ts - 活动服务主入口（TypeScript 源文件 - Sprint 38 迁移）
 *
 * 业务功能：
 *   - 活动管理（CRUD + 自动状态更新）
 *   - 活动报名（带风控前置 + 优惠券）
 *   - 活动支付订单（创建 + 确认）
 *   - 报名管理（详情、列表、导出）
 *   - 合作伙伴视角（活动报名列表、活动订单列表、CSV 导出）
 *
 * 共 13 个 action：
 *   1. getActivityList - 活动列表
 *   2. getActivityDetail - 活动详情
 *   3. createActivity - 创建活动
 *   4. updateActivity - 更新活动
 *   5. deleteActivity - 删除活动
 *   6. submitRegistration - 提交报名（含风控前置）
 *   7. getRegistrationDetail - 报名详情
 *   8. getRegistrationList - 报名列表
 *   9. createActivityPaymentOrder - 创建活动支付订单
 *  10. confirmActivityPayment - 确认活动支付
 *  11. getActivityRegistrations - 活动报名列表（合作伙伴）
 *  12. exportActivityRegistrations - 导出活动报名（CSV）
 *  13. getActivityOrders - 活动订单列表（合作伙伴）
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
const { initCloud, handleSuccess, handleError, generateId, ERROR_CODES, paginate } = require('./common/utils')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createLogger } = require('./common/logger')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { verifyAuth } = require('./common/auth-middleware')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { filterFields, FIELD_WHITELISTS } = require('./common/validator')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { err, isBusinessError } = require('./common/errors')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ENDPOINTS } = require('../common/config')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { detectActivityApplyRisk, mapActionToErrorCode } = require('../common/risk-control')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { withRateLimit } = require('../common/risk-rate-limit')
// Sprint 50: 限流统一 bootstrap
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { bootstrapRateLimit } = require('../common/rate-limit-bootstrap')

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
      logger.warn('activityApply.risk_reject', { userId: openid, activityId, amountFen, reasons: risk.reasons })
      throw err('RISK_REJECT', '报名被风控拦截', {
        reasons: risk.reasons,
        level: risk.level,
        activityId,
      })
    }
    if (risk.action === 'review') {
      pendingReview = true
      logger.info('activityApply.risk_pending', { userId: openid, activityId, amountFen, reasons: risk.reasons })
    } else {
      const debug = (logger as { debug?: (msg: string, meta: unknown) => void }).debug
      if (debug) { debug('activityApply.risk_pass', { userId: openid, activityId }) }
    }
  } catch (e) {
    if (isBusinessError(e) && ((e as { code?: string }).code === 'RATE_LIMITED' || (e as { code?: string }).code === 'RISK_REJECT')) {
      throw e
    }
    logger.warn('activityApply.risk_control_error', { userId: openid, activityId, msg: e && (e as Error).message })
    riskDecision = 'RISK_PASS'
  }
  return { pendingReview, reasons: riskReasons, decision: riskDecision }
}

// =====================================================================
// 辅助函数：佣金记录
// =====================================================================

async function createCommissionRecord(orderType: string, order: OrderRecord): Promise<void> {
  try {
    if (!order.ownerId) { return }
    let user: UserRecord | null = null
    try {
      const userRes = await db.collection('users').doc(order.ownerId).field({ _id: true, inviterId: true }).get()
      user = userRes.data
    } catch (e) {
      logger.warn('commission.users.fetch', { ownerId: order.ownerId, code: (e as { errCode?: unknown }).errCode, msg: (e as Error).message })
      return
    }
    if (!user || !user.inviterId) { return }

    let config: Record<string, unknown> = {}
    try {
      const configRes = await db.collection('system_config').doc('commission_rates').get()
      config = configRes.data || {}
    } catch (e) {
      logger.warn('commission.system_config', { code: (e as { errCode?: unknown }).errCode, msg: (e as Error).message })
      return
    }
    const rate = config[orderType] !== undefined ? Number(config[orderType]) : 0
    if (!rate || rate <= 0) { return }

    const orderAmount = Number(order.totalAmount || order.totalPrice || order.basicPrice || 0)
    if (orderAmount <= 0) { return }
    const commissionAmount = Math.round(orderAmount * rate / 100 * 100) / 100

    let inviter: UserRecord | null = null
    try {
      const inviterRes = await db.collection('users').doc(user.inviterId).field({ _id: true, nickName: true }).get()
      inviter = inviterRes.data
    } catch (e) {
      logger.warn('commission.inviter.fetch', { inviterId: user.inviterId, code: (e as { errCode?: unknown }).errCode, msg: (e as Error).message })
      return
    }
    if (!inviter) { return }

    const existRes = await db.collection('tuan_commissions').where({ orderNo: order.orderId || order._id, inviterId: user.inviterId }).count()
    if (existRes.total > 0) { return }

    const commissionData: CommissionRecord = {
      _id: generateId('commission', order.ownerId),
      inviterId: user.inviterId,
      inviterNickName: inviter.nickName || '',
      ownerId: user._id || order.ownerId,
      orderType,
      orderId: order._id,
      orderNo: order.orderId || order._id,
      orderAmount,
      commissionRate: rate,
      commissionAmount,
      status: 'pending',
      createdAt: db.serverDate(),
      updatedAt: db.serverDate(),
    }
    await db.collection('tuan_commissions').add({ data: commissionData })
  } catch (e) {
    logger.error('commission_error', e)
  }
}

// =====================================================================
// 辅助函数：活动状态自动更新
// =====================================================================

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

    const endedRes = await db.collection('activities')
      .where({ status: _.in(['published', 'registration_stopped']), endTime: _.lte(nowStr) })
      .update({ data: { status: 'ended', updatedAt: db.serverDate() } })
    if (endedRes.updated > 0) {
      logger.info('autoUpdate.ended', { updated: endedRes.updated })
    }
  } catch (e) {
    logger.error('autoUpdate', e)
  }
}

// =====================================================================
// 辅助函数：合作伙伴权限校验
// =====================================================================

async function checkPartnerPermission(openid: string, permission: string): Promise<AdminRecord> {
  const adminRes = await db.collection('admins')
    .where({ _id: openid, status: 'active' })
    .limit(1).get()
  if (!adminRes.data || adminRes.data.length === 0) {
    throw err('PARTNER_REQUIRED', '无合作伙伴权限')
  }
  const admin = adminRes.data[0] as AdminRecord
  const roles = admin.roles || []
  if (roles.includes('super_admin')) { return admin }
  const perms = admin.permissions || []
  if (!perms.includes(permission)) {
    throw err('PERMISSION_DENIED', `权限不足：需要 ${permission} 权限`)
  }
  return admin
}

// =====================================================================
// 辅助函数：支付参数创建
// =====================================================================

async function _createPaymentParams(
  openid: string,
  orderId: string,
  amount: number,
  description: string
): Promise<PaymentParams> {
  const wxContext = cloud.getWXContext() as { APPID?: string; [k: string]: unknown }
  const mchId = (cloud as { env: Record<string, string | undefined> }).env.MERCHANT_ID || process.env.MERCHANT_ID

  if (!mchId) {
    throw new Error('商户号未配置')
  }

  const nonceStr = Math.random().toString(36).substr(2, 15)
  const timestamp = String(Math.floor(Date.now() / 1000))
  const body = description
  const totalFee = Math.round(amount * 100)

  const outTradeNo = orderId
  const cloudEnv = (cloud as { env: string }).env
  const notifyUrl = `https://${cloudEnv}-1300000000.ap-shanghai.tencentscf.com/payment/notify`
  const spbillCreateIp = '127.0.0.1'
  const tradeType = 'JSAPI'

  const signStr = `appid=${wxContext.APPID}&body=${body}&mch_id=${mchId}&nonce_str=${nonceStr}&notify_url=${notifyUrl}&openid=${openid}&out_trade_no=${outTradeNo}&spbill_create_ip=${spbillCreateIp}&total_fee=${totalFee}&trade_type=${tradeType}`

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const crypto = require('crypto')
  const merchantKey = (cloud as { env: Record<string, string | undefined> }).env.MERCHANT_KEY || process.env.MERCHANT_KEY || ''
  const paySign = crypto.createHash('md5').update(`${signStr}&key=${merchantKey}`).digest('hex').toUpperCase()

  // XML 转义函数，防止 XML 注入
  const escapeXml = (str: string): string => {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
  }

  const unifiedOrderXml = `<xml>
    <appid>${escapeXml(wxContext.APPID || '')}</appid>
    <body>${escapeXml(body)}</body>
    <mch_id>${escapeXml(mchId)}</mch_id>
    <nonce_str>${escapeXml(nonceStr)}</nonce_str>
    <notify_url>${escapeXml(notifyUrl)}</notify_url>
    <openid>${escapeXml(openid)}</openid>
    <out_trade_no>${escapeXml(outTradeNo)}</out_trade_no>
    <spbill_create_ip>${escapeXml(spbillCreateIp)}</spbill_create_ip>
    <total_fee>${escapeXml(String(totalFee))}</total_fee>
    <trade_type>${escapeXml(tradeType)}</trade_type>
    <sign>${escapeXml(paySign)}</sign>
  </xml>`

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const https = require('https')
    const result = await new Promise<string>((resolve, reject) => {
      const req = https.request(`${ENDPOINTS.WECHAT_PAY_API_BASE}${ENDPOINTS.WECHAT_PAY_UNIFIEDORDER}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/xml' },
      }, (res: { on: (e: string, cb: (chunk: Buffer) => void) => void }) => {
        let data = ''
        res.on('data', (chunk: Buffer) => { data += chunk.toString() })
        res.on('end', () => resolve(data))
      })
      req.on('error', reject)
      req.write(unifiedOrderXml)
      req.end()
    })

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const xml2js = require('xml2js')
    const xmlResult = await new Promise<{ xml: Record<string, string> }>((resolve, reject) => {
      xml2js.parseString(result, { explicitArray: false }, (e: Error | null, parsed: { xml: Record<string, string> }) => {
        if (e) { reject(e) } else { resolve(parsed) }
      })
    })

    if (xmlResult.xml.return_code === 'SUCCESS' && xmlResult.xml.result_code === 'SUCCESS') {
      const prepayId = xmlResult.xml.prepay_id
      const jsNounceStr = Math.random().toString(36).substr(2, 15)
      const jsTimestamp = String(Math.floor(Date.now() / 1000))
      const jsPackage = `prepay_id=${prepayId}`

      const jsSignStr = `appid=${wxContext.APPID}&noncestr=${jsNounceStr}&package=${jsPackage}&signType=MD5&timeStamp=${jsTimestamp}`
      const jsPaySign = crypto.createHash('md5').update(`${jsSignStr}&key=${merchantKey}`).digest('hex').toUpperCase()

      return {
        timeStamp: jsTimestamp,
        nonceStr: jsNounceStr,
        package: jsPackage,
        signType: 'MD5',
        paySign: jsPaySign,
      }
    } else {
      throw new Error(xmlResult.xml.err_code_des || xmlResult.xml.return_msg || '统一下单失败')
    }
  } catch (e) {
    logger.error('创建支付参数失败:', e)
    throw new Error(`创建支付参数失败: ${(e as Error).message}`)
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
  const { page = 1, pageSize = 10, status, category } = event
  const safePageSize = Math.min(Math.max(1, Number(pageSize) || 10), 100)
  logger.info('getActivityList.query', { page, pageSize: safePageSize, status, category })

  await autoUpdateActivityStatus()

  const where: Record<string, unknown> = {}
  if (status && status !== 'all') {
    where.status = status
  } else {
    where.status = _.neq('deleted')
  }
  if (category && category !== 'all') {
    where.category = category
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
    const res = await db.collection('activities').doc(activityId).get()

    let isRegistered = false
    if (auth.openid) {
      const regRes = await db.collection('activity_registrations')
        .where({ activityId, ownerId: auth.openid, status: 'confirmed' })
        .count()
      isRegistered = regRes.total > 0
    }

    const data = res.data as ActivityRecord | null
    if (!data) {
      throw err('NOT_FOUND', '活动不存在')
    }

    const result: ActivityDetailResult = { ...data, isRegistered }

    if (result.organizer && result.organizer.avatar) {
      const avatar = result.organizer.avatar
      if (!avatar.startsWith('cloud://') && !avatar.startsWith('https://')) {
        result.organizer.avatar = ''
        if (result.createdBy) {
          try {
            let admin: AdminRecord | null = null
            try {
              const adminRes = await db.collection('admins').doc(result.createdBy).field({ avatarUrl: true, nickName: true }).get()
              admin = adminRes.data
            } catch (e) {
              logger.warn('getActivityDetail.admins.fetch', { createdBy: result.createdBy, code: (e as { errCode?: unknown }).errCode, msg: (e as Error).message })
            }
            if (admin && admin.avatarUrl && (admin.avatarUrl.startsWith('cloud://') || admin.avatarUrl.startsWith('https://'))) {
              result.organizer.avatar = admin.avatarUrl
              if (admin.nickName && result.organizer.name === '宠团团') {
                result.organizer.name = admin.nickName
              }
            }
          } catch (e) {
            logger.warn('getActivityDetail.organizer.fill', { createdBy: result.createdBy, code: (e as { errCode?: unknown }).errCode, msg: (e as Error).message })
          }
        }
      }
    }

    if (data.createdBy && result.organizer) {
      try {
        const countRes = await db.collection('activities')
          .where({ createdBy: data.createdBy, status: _.in(['published', 'ongoing', 'ended']) })
          .count()
        result.organizer.activityCount = countRes.total || 0
      } catch (e) {
        logger.warn('queryHostActivities', e)
        result.organizer.activityCount = 0
      }
    }

    return handleSuccess(result, '获取成功')
  } catch (error) {
    return handleError(error, '活动不存在', ERROR_CODES.NOT_FOUND)
  }
}

// =====================================================================
// Handler 3: createActivity - 创建活动
// =====================================================================

export async function createActivity(
  event: CloudEvent,
  context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  const { title, description, coverUrl, startTime, endTime, location, latitude, longitude, maxParticipants, category, price } = event
  if (!title) { throw err('INVALID_PARAMS', '缺少活动标题') }

  let organizer: UserRecord | null = null
  try {
    const userRes = await db.collection('users').doc(openid).get()
    organizer = userRes.data
  } catch (e) {
    logger.warn('createActivity.users.fetch', { openid, msg: (e as Error).message })
  }

  const activity: ActivityRecord = {
    title,
    description: description || '',
    coverUrl: coverUrl || '',
    images: event.images || [],
    startTime: startTime || '',
    endTime: endTime || '',
    location: location || '',
    latitude: latitude || null,
    longitude: longitude || null,
    maxParticipants: maxParticipants || 0,
    currentParticipants: 0,
    category: category || 'outdoor',
    price: (Number(event.pricePerPerson) || 0) + (Number(event.pricePerPet) || 0) || Number(price) || 0,
    pricePerPerson: Number(event.pricePerPerson) || 0,
    pricePerPet: Number(event.pricePerPet) || 0,
    contactName: event.contactName || '',
    contactPhone: event.contactPhone || '',
    wechatId: event.wechatId || '',
    status: event.status || 'draft',
    createdBy: openid,
    organizer: organizer ? {
      name: organizer.nickName || '宠团团',
      avatar: organizer.avatarUrl || '/images/default-avatar.svg',
    } : { name: '宠团团', avatar: '/images/default-avatar.svg' },
    createdAt: db.serverDate(),
    updatedAt: db.serverDate(),
  }

  activity._id = generateId('activity', openid)
  const res = await db.collection('activities').add({ data: activity })
  return handleSuccess({ id: res._id }, '创建成功')
}

// =====================================================================
// Handler 4: updateActivity - 更新活动
// =====================================================================

export async function updateActivity(
  event: CloudEvent,
  context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { activityId } = event
  const { openid } = auth
  if (!activityId) { throw err('INVALID_PARAMS', '缺少活动ID') }
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  const updateData: Record<string, unknown> = { updatedAt: db.serverDate(), ...filterFields(FIELD_WHITELISTS.activity, event) }

  const existRes = await db.collection('activities').doc(activityId).get()
  const existData = existRes.data as ActivityRecord | null
  if (!existData) {
    throw err('NOT_FOUND', '活动不存在')
  }
  if (existData.createdBy !== openid) {
    try {
      await checkPartnerPermission(openid, 'activity')
    } catch (e) {
      throw err('PERMISSION_DENIED', '无权修改此活动')
    }
  }

  await db.collection('activities').doc(activityId).update({ data: updateData })
  return handleSuccess(null, '更新成功')
}

// =====================================================================
// Handler 5: deleteActivity - 删除活动
// =====================================================================

export async function deleteActivity(
  event: CloudEvent,
  context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { activityId } = event
  const { openid } = auth
  if (!activityId) { throw err('INVALID_PARAMS', '缺少活动ID') }
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  const existRes = await db.collection('activities').doc(activityId).get()
  const existData = existRes.data as ActivityRecord | null
  if (!existData) { throw err('ACTIVITY_NOT_FOUND', '活动不存在') }

  if (existData.status === 'published') {
    throw err('INVALID_PARAMS', '已发布的活动不能删除')
  }

  if (existData.createdBy !== openid) {
    try {
      await checkPartnerPermission(openid, 'activity')
    } catch (e) {
      throw err('PERMISSION_DENIED', '无权删除此活动')
    }
  }

  const regCountRes = await db.collection('activity_registrations')
    .where({ activityId })
    .count()
  const regCount = regCountRes.total || 0

  if (regCount > 0) {
    throw err('ACTIVITY_HAS_REGISTRATIONS', `该活动已有 ${regCount} 人报名，无法删除`, { regCount })
  }

  await db.collection('activities').doc(activityId).remove()
  return handleSuccess(null, '删除成功')
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

  const { activityId, pets, phone, notes, friends, petIds, totalAmount, originalAmount, couponId, couponDiscount, participantCount } = event
  if (!activityId) { throw err('INVALID_PARAMS', '缺少活动ID') }
  if (!pets || !Array.isArray(pets) || pets.length === 0) { throw err('INVALID_PARAMS', '请选择参与的宠物') }
  if (!phone) { throw err('INVALID_PARAMS', '请填写联系电话') }

  const transaction = await db.startTransaction()

  try {
    const activityRes = await db.collection('activities').doc(activityId).get()
    const activity = activityRes.data as ActivityRecord | null
    if (!activity) {
      await transaction.rollback()
      throw err('NOT_FOUND', '活动不存在')
    }

    if (activity.maxParticipants && (activity.currentParticipants || 0) >= activity.maxParticipants) {
      await transaction.rollback()
      throw err('BUSINESS_ERROR', '报名人数已满')
    }

    const existReg = await db.collection('activity_registrations')
      .where({ activityId, openid, status: 'confirmed' })
      .count()
    if (existReg.total > 0) {
      await transaction.rollback()
      throw err('BUSINESS_ERROR', '您已报名此活动')
    }

    const pricePerPerson = activity.pricePerPerson || 0
    const pricePerPet = activity.pricePerPet || 0
    const pCount = participantCount || 1
    const petsArray = pets as PetInput[]
    const friendsArray = Array.isArray(friends) ? friends : []
    const petCount = petsArray.length + friendsArray.length
    const calculatedAmount = pricePerPerson * pCount + pricePerPet * petCount

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
      _id: generateId('registration', openid),
      activityId,
      ownerId: openid,
      pets: petsInfo,
      petIds: petIds || [],
      phone: phone || '',
      notes: notes || '',
      friends: friendsArray,
      status: isPaid ? 'pending_payment' : 'confirmed',
      participantCount: pCount,
      petCount,
      pricePerPerson,
      pricePerPet,
      totalAmount: calculatedAmount,
      originalAmount: originalAmount || calculatedAmount,
      couponId: couponId || '',
      couponDiscount: couponDiscount || 0,
      finalAmount: totalAmount,
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
        logger.warn('submitRegistration.users.fetch', { openid, code: (e as { errCode?: unknown }).errCode, msg: (e as Error).message })
      }

      const activityOrder: OrderRecord = {
        ownerId: openid,
        orderType: 'activity',
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
        totalPrice: totalAmount || calculatedAmount,
        originalAmount: originalAmount || calculatedAmount,
        couponId: couponId || '',
        couponDiscount: couponDiscount || 0,
        phone: phone || '',
        notes: notes || '',
        status: isPaid ? 'pending_payment' : 'confirmed',
        ownerInfo: user ? { nickName: user.nickName, avatarUrl: user.avatarUrl, phone } : { phone },
        createdAt: now,
        updatedAt: now,
      }

      await transaction.collection('orders').add({ data: activityOrder })
    } catch (orderErr) {
      logger.warn('创建活动订单记录失败:', (orderErr as Error).message)
    }

    await transaction.commit()
    return handleSuccess({ id: (regResult as { _id?: string })._id || 'ok', registrationId: (regResult as { _id?: string })._id }, '报名成功')
  } catch (error) {
    await transaction.rollback()
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
  const where: Record<string, unknown> = { ownerId: openid }
  if (activityId) { where.activityId = activityId }
  if (status) { where.status = status }

  const result = await paginate(db, 'activity_registrations', {
    page, pageSize: Math.min(pageSize, 20), where, projection: REGISTRATION_LIST_FIELDS,
    orderBy: { field: 'createdAt', direction: 'desc' },
  })

  const activityIds = [...new Set((result.list as RegistrationRecord[]).map((r) => r.activityId).filter((id): id is string => Boolean(id)))]
  if (activityIds.length > 0) {
    const activitiesRes = await db.collection('activities')
      .where({ _id: _.in(activityIds) })
      .get()

    const activityMap: Record<string, ActivityRecord> = {}
    ;(activitiesRes.data as ActivityRecord[] || []).forEach((a) => { if (a._id) { activityMap[a._id] = a } })

    const regMap: Record<string, RegistrationRecord> = {}
    ;(result.list as RegistrationRecord[]).forEach((r) => { if (r.activityId) { regMap[r.activityId] = r } })

    let activities: (ActivityRecord & { joined: boolean; _registrationId: string; regStatus: string; regCreatedAt: Date | undefined })[] = activityIds
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

    if (status === 'active') {
      const now = new Date()
      const utc = now.getTime() + (now.getTimezoneOffset() * 60000)
      const bjTime = new Date(utc + (8 * 3600000))
      const nowStr = `${bjTime.getFullYear()}-${String(bjTime.getMonth() + 1).padStart(2, '0')}-${String(bjTime.getDate()).padStart(2, '0')} ${String(bjTime.getHours()).padStart(2, '0')}:${String(bjTime.getMinutes()).padStart(2, '0')}`

      activities = activities.filter((a) => {
        if (a.status === 'ended' || a.status === 'cancelled' || a.status === 'deleted') { return false }
        if (a.endTime) {
          const end = new Date(String(a.endTime).replace(/-/g, '/'))
          if (!isNaN(end.getTime()) && end <= now) { return false }
        }
        return true
      })
      result.total = activities.length
    }

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

// =====================================================================
// Handler 9: createActivityPaymentOrder - 创建活动支付订单
// =====================================================================

export async function createActivityPaymentOrder(
  event: CloudEvent,
  context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  const { activityId, pets, phone, notes, friends, petIds, totalAmount, originalAmount, couponId, couponDiscount, orderId } = event
  if (!activityId) { throw err('INVALID_PARAMS', '缺少活动ID') }
  if (!pets || !Array.isArray(pets) || pets.length === 0) { throw err('INVALID_PARAMS', '请选择参与的宠物') }
  if (!phone) { throw err('INVALID_PARAMS', '请填写联系电话') }
  if (!totalAmount || totalAmount <= 0) { throw err('INVALID_PARAMS', '金额异常') }

  try {
    const activityRes = await db.collection('activities').doc(activityId).get()
    const activity = activityRes.data as ActivityRecord | null
    if (!activity) {
      throw err('NOT_FOUND', '活动不存在')
    }

    if (activity.maxParticipants && (activity.currentParticipants || 0) >= activity.maxParticipants) {
      throw err('BUSINESS_ERROR', '报名人数已满')
    }

    const existReg = await db.collection('activity_registrations')
      .where({ activityId, ownerId: openid, status: _.in(['confirmed', 'pending_payment']) })
      .count()
    if (existReg.total > 0) {
      throw err('BUSINESS_ERROR', '您已报名此活动')
    }

    const now = db.serverDate()
    const petsArray = pets as PetInput[]
    const petsInfo: PetInfo[] = petsArray.map((p) => ({
      name: p.petName || p.name || '',
      gender: p.petGender || p.gender || 'male',
      breed: p.petBreed || p.breed || '',
      petId: p.petId || '',
    }))

    const pendingRegistration: RegistrationRecord = {
      _id: generateId('registration', openid),
      activityId,
      ownerId: openid,
      orderId,
      pets: petsInfo,
      petIds: petIds || [],
      phone: phone || '',
      notes: notes || '',
      friends: Array.isArray(friends) ? friends : [],
      status: 'pending_payment',
      totalAmount,
      originalAmount: originalAmount || totalAmount,
      couponId: couponId || '',
      couponDiscount: couponDiscount || 0,
      finalAmount: totalAmount,
      createdAt: now,
      updatedAt: now,
    }
    const regResult = await db.collection('activity_registrations').add({ data: pendingRegistration })

    const orderDoc: OrderRecord = {
      ownerId: openid,
      orderType: 'activity',
      orderId,
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
      petCount: petsArray.length,
      basicPrice: totalAmount,
      totalPrice: totalAmount,
      originalAmount: originalAmount || totalAmount,
      couponId: couponId || '',
      couponDiscount: couponDiscount || 0,
      phone: phone || '',
      notes: notes || '',
      status: 'pending_payment',
      paymentStatus: 'pending',
      createdAt: now,
      updatedAt: now,
    }

    await db.collection('orders').add({ data: orderDoc })

    const paymentParams = await _createPaymentParams(openid, orderId || '', totalAmount, activity.title || '活动报名')

    return handleSuccess({
      orderId,
      registrationId: (regResult as { _id?: string })._id,
      paymentParams,
    }, '订单创建成功')
  } catch (error) {
    return handleError(error, '创建订单失败', ERROR_CODES.DATA)
  }
}

// =====================================================================
// Handler 10: confirmActivityPayment - 确认活动支付
// =====================================================================

export async function confirmActivityPayment(
  event: CloudEvent,
  context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  const { orderId } = event
  if (!orderId) { throw err('INVALID_PARAMS', '缺少订单ID') }

  const transaction = await db.startTransaction()

  try {
    const orderRes = await db.collection('orders').where({ orderId, ownerId: openid }).get()
    const orderList = (orderRes.data || []) as OrderRecord[]
    if (orderList.length === 0) {
      await transaction.rollback()
      throw err('NOT_FOUND', '订单不存在')
    }

    const order = orderList[0]
    if (order.status !== 'pending_payment') {
      await transaction.rollback()
      throw err('BUSINESS_ERROR', '订单状态异常')
    }

    const now = db.serverDate()

    await transaction.collection('orders').doc(order._id || '').update({
      data: { status: 'confirmed', paymentStatus: 'paid', paidAt: now, updatedAt: now },
    })

    await transaction.collection('activity_registrations')
      .where({ orderId, openid, status: 'pending_payment' })
      .update({
        data: { status: 'confirmed', updatedAt: now },
      })

    await transaction.collection('activities').doc(order.activityId || '').update({
      data: {
        currentParticipants: _.inc(order.petCount || 1),
        updatedAt: now,
      },
    })

    await transaction.commit()

    await createCommissionRecord('activity', order)

    return handleSuccess({ orderId }, '支付成功')
  } catch (error) {
    await transaction.rollback()
    return handleError(error, '支付确认失败', ERROR_CODES.DATA)
  }
}

// =====================================================================
// Handler 11: getActivityRegistrations - 活动报名列表（合作伙伴）
// =====================================================================

export async function getActivityRegistrations(
  event: CloudEvent,
  context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  const { activityId, page = 1, pageSize = 20 } = event
  if (!activityId) { throw err('INVALID_PARAMS', '缺少活动ID') }

  await checkPartnerPermission(openid, 'activity')

  const safePageSize = Math.min(Math.max(1, Number(pageSize) || 20), 100)

  const result = await paginate(db, 'activity_registrations', {
    page, pageSize: safePageSize,
    where: { activityId },
    orderBy: { field: 'createdAt', direction: 'desc' },
  })

  if (result.list && result.list.length > 0) {
    const openids = (result.list as RegistrationRecord[]).map((r) => r.ownerId).filter((id): id is string => Boolean(id))
    if (openids.length > 0) {
      const usersRes = await db.collection('users').where({ _id: _.in(openids) }).get()
      const userMap: Record<string, UserRecord> = {}
      ;((usersRes.data || []) as UserRecord[]).forEach((u) => { if (u._id) { userMap[u._id] = u } })

      result.list = (result.list as RegistrationRecord[]).map((r) => {
        const user = userMap[r.ownerId || ''] || {}
        return {
          ...r,
          userNickName: user.nickName || '',
          userAvatar: user.avatarUrl || '',
          displayName: user.nickName || '未知用户',
        }
      })
    } else {
      result.list = (result.list as RegistrationRecord[]).map((r) => ({
        ...r,
        userNickName: '',
        userAvatar: '',
        displayName: '未知用户',
      }))
    }
  }

  return handleSuccess(result, '获取成功')
}

// =====================================================================
// Handler 12: exportActivityRegistrations - 导出活动报名（CSV）
// =====================================================================

export async function exportActivityRegistrations(
  event: CloudEvent,
  context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  const { activityId } = event
  if (!activityId) { throw err('INVALID_PARAMS', '缺少活动ID') }

  await checkPartnerPermission(openid, 'activity')

  const activityRes = await db.collection('activities').doc(activityId).get()
  const activity = activityRes.data as ActivityRecord | null
  if (!activity) {
    throw err('NOT_FOUND', '活动不存在')
  }

  const registrationsRes = await db.collection('activity_registrations')
    .where({ activityId })
    .orderBy('createdAt', 'desc')
    .get()

  let registrations: (RegistrationRecord & { userNickName?: string })[] = (registrationsRes.data || []) as RegistrationRecord[]

  if (registrations.length > 0) {
    const openids = registrations.map((r) => r.ownerId).filter((id): id is string => Boolean(id))
    if (openids.length > 0) {
      const usersRes = await db.collection('users').where({ _id: _.in(openids) }).get()
      const userMap: Record<string, UserRecord> = {}
      ;((usersRes.data || []) as UserRecord[]).forEach((u) => { if (u._id) { userMap[u._id] = u } })

      registrations = registrations.map((r) => ({
        ...r,
        userNickName: (r.ownerId && userMap[r.ownerId]?.nickName) || '',
      }))
    }
  }

  const headers = ['序号', '宠物昵称', '报名时间', '用户昵称', '联系电话', '备注', '签到']

  const rows = registrations.map((reg, index) => [
    index + 1,
    (reg.pets && reg.pets.map((p) => p.name).join(', ')) || '',
    reg.createdAt ? new Date(reg.createdAt).toLocaleString('zh-CN') : '',
    reg.userNickName || '',
    reg.phone || '',
    reg.notes || '',
    '',
  ])

  const csvContent = [headers.join(','), ...rows.map((row) => row.map((cell) => {
    const str = String(cell).replace(/"/g, '""')
    return `"${str}"`
  }).join(','))].join('\n')

  const exportResult: ExportResult = {
    activityTitle: activity.title || '',
    totalCount: registrations.length,
    csvContent,
  }
  return handleSuccess(exportResult, '导出成功')
}

// =====================================================================
// Handler 13: getActivityOrders - 活动订单列表（合作伙伴）
// =====================================================================

export async function getActivityOrders(
  event: CloudEvent,
  context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  await checkPartnerPermission(openid, 'activity')

  const { status, page = 1, pageSize = 20 } = event
  const safePageSize = Math.min(Math.max(1, Number(pageSize) || 20), 100)

  const where: Record<string, unknown> = { orderType: 'activity' }
  if (status) { where.status = status }

  const result = await paginate(db, 'orders', {
    page, pageSize: safePageSize,
    where,
    orderBy: { field: 'createdAt', direction: 'desc' },
  })

  const list = (result.list || []) as OrderRecord[]
  const enrichedList = list.map((order) => ({
    ...order,
    buyerNickName: order.ownerInfo?.nickName || '',
    productName: order.activityTitle || '',
  }))

  return handleSuccess({ ...result, list: enrichedList }, '获取成功')
}

// =====================================================================
// 入口聚合：handlers 路由表
// =====================================================================

export const handlers: Record<string, ActivityActionHandler> = {
  getActivityList,
  getActivityDetail,
  createActivity,
  updateActivity,
  deleteActivity,
  submitRegistration,
  getRegistrationDetail,
  getRegistrationList,
  createActivityPaymentOrder,
  confirmActivityPayment,
  getActivityRegistrations,
  exportActivityRegistrations,
  getActivityOrders,
}

// =====================================================================
// Main 入口（云函数调用）
// =====================================================================

export async function main(
  event: CloudEvent,
  context: CloudContext
): Promise<unknown> {
  const { action } = event
  if (!action || !handlers[action]) {
    throw err('INVALID_PARAMS', '无效的操作类型')
  }

  const WRITE_ACTIONS = ['createActivity', 'updateActivity', 'deleteActivity', 'submitRegistration', 'createActivityPaymentOrder', 'confirmActivityPayment']
  const LOGIN_REQUIRED_ACTIONS = [...WRITE_ACTIONS, 'getActivityDetail', 'getRegistrationDetail', 'getRegistrationList', 'getActivityRegistrations', 'exportActivityRegistrations', 'getActivityOrders']
  const requireLogin = LOGIN_REQUIRED_ACTIONS.includes(action)

  try {
    const auth = await verifyAuth(event, { requireLogin })
    logger.info(action, { openid: auth.openid })
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
  createActivity,
  updateActivity,
  deleteActivity,
  submitRegistration,
  getRegistrationDetail,
  getRegistrationList,
  createActivityPaymentOrder,
  confirmActivityPayment,
  getActivityRegistrations,
  exportActivityRegistrations,
  getActivityOrders,
  handlers,
}
_mod.exports.default = _mod.exports

export default {
  main,
  getActivityList,
  getActivityDetail,
  createActivity,
  updateActivity,
  deleteActivity,
  submitRegistration,
  getRegistrationDetail,
  getRegistrationList,
  createActivityPaymentOrder,
  confirmActivityPayment,
  getActivityRegistrations,
  exportActivityRegistrations,
  getActivityOrders,
  handlers,
}
