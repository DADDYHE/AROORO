/**
 * orderService/invitations.ts - 寄养家庭主动开单（boarding_invitations）
 *
 * 业务背景（2026-09-07 产品决策）：
 *   寄养家庭与用户线下沟通好后，由家庭主动开单：家庭选定寄养日期/时间段/
 *   宠物数量/总价，生成开单邀请分享给用户；用户在分享页填写宠物信息
 *   （含健康信息）并支付定金或全款，支付成功后订单自动确认（跳过接单环节）。
 *
 * 共 6 个 handler：
 *   1. createInvitation     家庭创建开单邀请（hosting 权限）
 *   2. getMyInvitations     家庭的开单列表（分页 + 状态筛选）
 *   3. cancelInvitation     家庭取消邀请（仅 active 可取消，手动，无自动过期）
 *   4. getInvitationByCode  公开读：用户从分享卡片/小程序码进入填写页
 *   5. submitInvitation     用户提交：原子占用邀请 + 生成正式订单
 *   6. getInviteQrCode      家庭获取小程序码（wxacode.getUnlimited，云端缓存）
 *
 * 关键设计：
 *   - 邀请是独立实体，不混入 orders；用户提交且支付成功后才进入订单体系
 *   - 价格权威：订单 totalPrice 取邀请快照，服务端不重新计价，用户不可改
 *   - 防并发：submitInvitation 用条件更新（status='active'）原子占用，
 *     两人同抢时后者报「已被占用」（产品决策：不绑定用户、谁打开谁填）
 *   - 宠物健康信息（既往病史/过敏源/药品/保养品/疫苗/绝育/驱虫/行为习惯）
 *     由前端先行调用 petService.createPet/updatePet 持久化到宠物档案，
 *     本模块只接收最终 petIds（已含 healthInfo 校验，避免跨函数调用）
 *   - bookingKey 使用 invit_${invitationId} 前缀：天然防重复成单（一次性）
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.orderService.json
 */

import { initCloud, handleSuccess, generateId } from './common/utils'
import { createLogger, type ServiceLogger } from './common/logger'
import { computeBoardingAmount } from './common/boarding-pricing'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { err, withErrorHandling } = require('./common/errors')

type AuthLike = { openid?: string, roles?: string[], [k: string]: unknown }
type EventLike = Record<string, unknown>
type ContextLike = Record<string, unknown>
type HandlerResult = Promise<unknown>

/** 跨云函数调用 + openapi 接口（wx-server-sdk cloud 实例） */
interface CloudApi {
  callFunction: (args: { name: string, data: Record<string, unknown> }) => Promise<{ result: unknown }>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  openapi: { wxacode: { getUnlimited: (args: Record<string, unknown>) => Promise<any> } }
  uploadFile: (args: { cloudPath: string, fileContent: Buffer }) => Promise<{ fileID: string }>
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const { cloud, db } = initCloud() as unknown as { cloud: CloudApi, db: any }
const logger: ServiceLogger = createLogger('orderService.invitations')

// =====================================================================
// 常量
// =====================================================================

const COLLECTION = 'boarding_invitations'

/** 邀请状态：active 待填写 / filled 已成单 / cancelled 已取消（家庭手动或订单超时联动） */
const INVITATION_STATUSES: ReadonlySet<string> = new Set(['active', 'filled', 'cancelled'])

/** 单家庭有效邀请上限（active 状态），防止无限开单占档期 */
const MAX_ACTIVE_INVITATIONS_PER_HOST = 20

/** 宠物数量上限（家庭开单时指定） */
const MAX_PET_COUNT = 10

/** 总价区间（元） */
const MIN_TOTAL_PRICE = 0.01
const MAX_TOTAL_PRICE = 100000

/** 支付超时（与 orders.createOrder / orderTimeoutService 30 分钟对齐） */
const PAY_TIMEOUT_MS = 30 * 60 * 1000

/** 寄养家庭档案敏感字段（不写入邀请/订单文档，与 orders.ts 对齐） */
const SENSITIVE_HOST_FIELDS = [
  'idCard', 'idCardFront', 'idCardBack', 'healthCertificate', 'emergencyContactPhone',
] as const

/** 分享码字符集（去掉易混淆的 0/O/1/I/l） */
const SHARE_CODE_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz'

/** 生成短分享码（8 位，用于分享路径参数与小程序码 scene） */
function generateShareCode(): string {
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += SHARE_CODE_ALPHABET[Math.floor(Math.random() * SHARE_CODE_ALPHABET.length)]
  }
  return code
}

/** 校验 YYYY-MM-DD 日期格式 */
function validateDateStr(value: unknown, fieldName: string): string {
  const str = String(value ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    throw err('INVALID_PARAMS', `${fieldName}格式应为 YYYY-MM-DD`)
  }
  const d = new Date(str.replace(/-/g, '/'))
  if (isNaN(d.getTime())) {throw err('INVALID_PARAMS', `${fieldName}日期无效`)}
  return str
}

/** 校验 HH:mm 时刻格式 */
function validateTimeStr(value: unknown, fieldName: string): string {
  const str = String(value ?? '').trim()
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(str)) {
    throw err('INVALID_PARAMS', `${fieldName}格式应为 HH:mm`)
  }
  return str
}

/** 文本清洗（trim + 长度上限） */
function validateText(value: unknown, maxLength: number, fieldName: string): string {
  const str = String(value ?? '').trim()
  if (str.length > maxLength) {
    throw err('INVALID_PARAMS', `${fieldName}长度不能超过 ${maxLength} 个字符`)
  }
  return str
}

/** 查询寄养家庭档案（按 openid，返回 null 表示未入驻） */
async function getHostProfileByOpenid(openid: string): Promise<Record<string, unknown> | null> {
  const res = await db.collection('hostProfiles').where({ openid }).limit(1).get()
  if (!res.data || res.data.length === 0) {return null}
  return res.data[0] as Record<string, unknown>
}

/** 内部：检查合作伙伴 hosting 权限（admins 集合，与 orders.ts 逻辑对齐） */
async function checkPartnerHostingPermission(openid: string): Promise<void> {
  const adminRes = await db.collection('admins')
    .where({ _id: openid, status: 'active' })
    .limit(1)
    .get()
  if (!adminRes.data || adminRes.data.length === 0) {
    throw err('PARTNER_REQUIRED', '无合作伙伴权限')
  }
  const admin = adminRes.data[0] as { roles?: string[], permissions?: string[] }
  const roles = admin.roles || []
  if (roles.includes('super_admin')) {return}
  if (!(admin.permissions || []).includes('hosting')) {
    throw err('PERMISSION_DENIED', '权限不足：需要 hosting 权限')
  }
}

// =====================================================================
// Handler 1: createInvitation - 家庭创建开单邀请
// =====================================================================

async function createInvitation(event: EventLike, _context: ContextLike, auth: AuthLike | null): HandlerResult {
  const openid = auth?.openid
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  await checkPartnerHostingPermission(openid)

  const hostProfile = await getHostProfileByOpenid(openid)
  if (!hostProfile) {throw err('NOT_FOUND', '未找到您的寄养家庭档案，请先完成家庭入驻')}

  const hostId = hostProfile._id as string
  const { startDate, endDate, startAt, endAt, petCount, totalPrice, note } = event as {
    startDate?: string,
    endDate?: string,
    startAt?: string,
    endAt?: string,
    petCount?: number,
    totalPrice?: number,
    note?: string,
  }

  const safeStartDate = validateDateStr(startDate, '入住日期')
  const safeEndDate = validateDateStr(endDate, '离店日期')
  const safeStartAt = validateTimeStr(startAt, '接宠时刻')
  const safeEndAt = validateTimeStr(endAt, '还宠时刻')
  if (safeEndDate < safeStartDate) {
    throw err('INVALID_PARAMS', '离店日期不能早于入住日期')
  }
  // 组合时间戳校验：同日寄养要求还宠晚于接宠（否则计价器抛原生 Error 被 5001 兜底，用户看到「服务内部错误」）
  if (safeEndDate === safeStartDate) {
    const startTs = Date.parse(`${safeStartDate}T${safeStartAt}:00`)
    const endTs = Date.parse(`${safeEndDate}T${safeEndAt}:00`)
    if (endTs <= startTs) {
      throw err('INVALID_PARAMS', '同日寄养时，还宠时刻需晚于接宠时刻')
    }
  }

  const safePetCount = Math.floor(Number(petCount))
  if (!Number.isFinite(safePetCount) || safePetCount < 1 || safePetCount > MAX_PET_COUNT) {
    throw err('INVALID_PARAMS', `宠物数量需在 1-${MAX_PET_COUNT} 之间`)
  }

  const safeTotalPrice = Math.round(Number(totalPrice) * 100) / 100
  if (!Number.isFinite(safeTotalPrice) || safeTotalPrice < MIN_TOTAL_PRICE || safeTotalPrice > MAX_TOTAL_PRICE) {
    throw err('INVALID_PARAMS', `总价需在 ${MIN_TOTAL_PRICE}-${MAX_TOTAL_PRICE} 元之间`)
  }

  const safeNote = note ? validateText(note, 200, '备注') : ''

  // 单家庭有效邀请上限（防无限开单占档期）
  const activeCount = await db.collection(COLLECTION)
    .where({ hostId, status: 'active' })
    .count()
  if (activeCount.total >= MAX_ACTIVE_INVITATIONS_PER_HOST) {
    throw err('BUSINESS_ERROR', `待填写邀请最多 ${MAX_ACTIVE_INVITATIONS_PER_HOST} 个，请先取消或分享现有邀请`)
  }

  // 系统参考价（家庭定价参考，快照展示用；订单金额以 totalPrice 为准）
  const billingMode = (typeof hostProfile.billingMode === 'string' && hostProfile.billingMode)
    ? hostProfile.billingMode : 'hotel'
  const checkOutBefore = (typeof hostProfile.checkOutBefore === 'string' && hostProfile.checkOutBefore)
    ? hostProfile.checkOutBefore : '12:00'
  let referencePrice = 0
  try {
    referencePrice = computeBoardingAmount({
      mode: billingMode,
      pricePerDay: Number(hostProfile.pricePerDay) || 0,
      startDate: safeStartDate,
      startAt: safeStartAt,
      endDate: safeEndDate,
      endAt: safeEndAt,
      petCount: safePetCount,
      checkOutBefore,
    }).total
  } catch (priceErr) {
    // 计价器校验失败（如跨天时刻组合无效）→ 以业务错误呈现，避免 5001「服务内部错误」
    throw err('INVALID_PARAMS', (priceErr as Error).message || '寄养时间参数无效，请检查日期与时刻')
  }

  // 家庭展示快照（剔除敏感字段）
  const hostSnapshot: Record<string, unknown> = { ...hostProfile }
  SENSITIVE_HOST_FIELDS.forEach(f => { delete hostSnapshot[f] })
  delete hostSnapshot._openid
  delete hostSnapshot.openid

  // shareCode 唯一性：8 位短码，冲突概率极低；唯一索引兜底重试一次
  const invitation: Record<string, unknown> = {
    _id: generateId('binv', openid),
    shareCode: generateShareCode(),
    hostId,
    hostOpenid: openid,
    hostSnapshot: {
      _id: hostId,
      hostName: (hostProfile.hostName as string) || '',
      avatarUrl: (hostProfile.avatarUrl as string) || '',
      addressPublic: (hostProfile.addressPublic as string) || '',
    },
    startDate: safeStartDate,
    endDate: safeEndDate,
    startAt: safeStartAt,
    endAt: safeEndAt,
    pricingMode: billingMode,
    referencePrice,
    petCount: safePetCount,
    totalPrice: safeTotalPrice,
    note: safeNote,
    status: 'active',
    inviteeOpenId: '',
    orderId: '',
    createdAt: db.serverDate(),
    updatedAt: db.serverDate(),
  }

  try {
    await db.collection(COLLECTION).add({ data: invitation })
  } catch (e) {
    const rawMsg = (e as Error)?.message || ''
    // shareCode 唯一索引冲突 → 换码重试一次
    if (/E11000|duplicate key|shareCode/i.test(rawMsg)) {
      invitation.shareCode = generateShareCode()
      await db.collection(COLLECTION).add({ data: invitation })
    } else {
      throw e
    }
  }

  logger.info('createInvitation', { hostId, shareCode: invitation.shareCode, petCount: safePetCount })
  return handleSuccess({ invitation }, '开单成功')
}

// =====================================================================
// Handler 2: getMyInvitations - 家庭的开单列表
// =====================================================================

async function getMyInvitations(event: EventLike, _context: ContextLike, auth: AuthLike | null): HandlerResult {
  const openid = auth?.openid
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  await checkPartnerHostingPermission(openid)

  const hostProfile = await getHostProfileByOpenid(openid)
  if (!hostProfile) {throw err('NOT_FOUND', '未找到您的寄养家庭档案')}

  const { status, page = 1, pageSize = 20 } = event as { status?: string, page?: number, pageSize?: number }
  const pageNum = Math.max(1, Math.floor(Number(page) || 1))
  const pageSizeNum = Math.min(50, Math.max(1, Math.floor(Number(pageSize) || 20)))

  const where: Record<string, unknown> = { hostId: hostProfile._id }
  if (status && status !== 'all') {
    if (!INVITATION_STATUSES.has(status)) {
      throw err('INVALID_PARAMS', `无效的状态筛选：${status}`)
    }
    where.status = status
  }

  const countResult = await db.collection(COLLECTION).where(where).count()
  const result = await db.collection(COLLECTION)
    .where(where)
    .orderBy('createdAt', 'desc')
    .skip((pageNum - 1) * pageSizeNum)
    .limit(pageSizeNum)
    .get()

  return handleSuccess({
    list: result.data || [],
    total: countResult.total,
    page: pageNum,
    pageSize: pageSizeNum,
    totalPages: Math.ceil(countResult.total / pageSizeNum),
  }, '获取成功')
}

// =====================================================================
// Handler 3: cancelInvitation - 家庭取消邀请（仅 active 可取消）
// =====================================================================

async function cancelInvitation(event: EventLike, _context: ContextLike, auth: AuthLike | null): HandlerResult {
  const openid = auth?.openid
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  await checkPartnerHostingPermission(openid)

  const { invitationId } = event as { invitationId?: string }
  if (!invitationId) {throw err('INVALID_PARAMS', '缺少邀请 ID')}

  const invRes = await db.collection(COLLECTION).doc(invitationId).get()
  if (!invRes.data) {throw err('NOT_FOUND', '邀请不存在')}
  const inv = invRes.data as { hostOpenid?: string, status?: string, orderId?: string }
  if (inv.hostOpenid !== openid) {
    throw err('PERMISSION_DENIED', '无权操作他人邀请')
  }

  // 修复 #1（2026-09-07）：允许释放「失联卡死态」filled 邀请。
  //   订单超时取消时邀请作废为 best-effort，失败会让邀请永久卡在 filled
  //   （既不可再填、也无法释放）。此处允许 active 一律取消；filled 仅当
  //   其指向的订单已取消或不存在（订单创建失败遗留的孤儿 filled）时释放。
  if (inv.status === 'filled') {
    let orderTerminated = false
    if (!inv.orderId) {
      // 无 orderId：订单创建失败回滚后的孤儿，允许释放
      orderTerminated = true
    } else {
      try {
        const oRes = await db.collection('orders').doc(inv.orderId).get()
        if (!oRes.data) {
          orderTerminated = true
        } else if ((oRes.data as { status?: string }).status === 'cancelled') {
          orderTerminated = true
        }
      } catch (e) {
        logger.warn('cancelInvitation.order.query_failed', { invitationId, msg: (e as Error)?.message })
        // 查询失败：保守拒绝，避免误释放仍有效的订单
      }
    }
    if (!orderTerminated) {
      throw err('STATE_INVALID', '该邀请对应的订单仍有效，无法取消')
    }
  } else if (inv.status !== 'active') {
    throw err('STATE_INVALID', '仅待填写或已作废的邀请可取消')
  }

  // 条件更新防并发（用户恰好同时提交 / 邀请已结束）
  const updateRes = await db.collection(COLLECTION)
    .where({ _id: invitationId, status: db.command.in(['active', 'filled']) })
    .update({ data: { status: 'cancelled', cancelledAt: db.serverDate(), updatedAt: db.serverDate() } })
  if (!updateRes || updateRes.stats?.updated === 0) {
    throw err('STATE_INVALID', '取消失败，邀请可能刚被用户填写')
  }

  logger.info('cancelInvitation', { invitationId })
  return handleSuccess(null, '已取消')
}

// =====================================================================
// Handler 4: getInvitationByCode - 公开读（用户从分享进入）
// =====================================================================

async function getInvitationByCode(event: EventLike): HandlerResult {
  const { code } = event as { code?: string }
  const safeCode = String(code ?? '').trim()
  if (!safeCode || safeCode.length > 32) {throw err('INVALID_PARAMS', '邀请码无效')}

  const res = await db.collection(COLLECTION).where({ shareCode: safeCode }).limit(1).get()
  if (!res.data || res.data.length === 0) {throw err('NOT_FOUND', '邀请不存在或已失效')}
  const inv = res.data[0] as Record<string, unknown>

  // 修复 #2：计算过期标记（离店日当天 23:59:59 前仍有效），供前端展示「邀请已过期」
  const endTs = Date.parse(`${inv.endDate as string}T23:59:59Z`)
  const expired = Number.isFinite(endTs) && endTs < Date.now()

  // 修复 #3：filled 但 orderId 缺失（回填失败）时，按本人最近一笔未支付邀请订单反查补齐，
  //   避免前端「查看订单」无跳转目标。仅透传 pending_payment 订单，不泄露他人隐私。
  let resolvedOrderId = (inv.orderId as string) || ''
  if (!resolvedOrderId && inv.status === 'filled' && inv.inviteeOpenId) {
    try {
      const backfilled = await db.collection('orders')
        .where({ ownerId: inv.inviteeOpenId as string, source: 'invitation', invitationId: inv._id })
        .orderBy('createdAt', 'desc')
        .limit(1)
        .field({ _id: true, status: true } as Record<string, true>)
        .get()
      const latest = (backfilled.data || [])[0] as { _id?: string, status?: string } | undefined
      if (latest && latest._id && latest.status === 'pending_payment') {
        resolvedOrderId = latest._id
      }
    } catch (e) {
      logger.warn('getInvitationByCode.backfill_query_failed', { invitationId: inv._id, msg: (e as Error)?.message })
    }
  }

  // 公开字段白名单（hostSnapshot 已在创建时剔除敏感字段，这里再显式投影）
  const publicInvitation: Record<string, unknown> = {
    _id: inv._id,
    shareCode: inv.shareCode,
    hostId: inv.hostId,
    hostSnapshot: inv.hostSnapshot,
    startDate: inv.startDate,
    endDate: inv.endDate,
    startAt: inv.startAt,
    endAt: inv.endAt,
    pricingMode: inv.pricingMode,
    petCount: inv.petCount,
    totalPrice: inv.totalPrice,
    note: inv.note,
    status: inv.status,
    expired,
    // 已成单时前端跳转订单详情用（仅返回 orderId，不返回 invitee 隐私信息）
    orderId: resolvedOrderId,
    createdAt: inv.createdAt,
  }
  return handleSuccess({ invitation: publicInvitation }, '获取成功')
}

// =====================================================================
// Handler 5: submitInvitation - 用户提交（原子占用 + 生成订单）
// =====================================================================

async function submitInvitation(event: EventLike, _context: ContextLike, auth: AuthLike | null): HandlerResult {
  const openid = auth?.openid
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  const { code, petIds, note } = event as { code?: string, petIds?: string[], note?: string }
  const safeCode = String(code ?? '').trim()
  if (!safeCode) {throw err('INVALID_PARAMS', '缺少邀请码')}

  // 前端已通过 petService 完成：新建宠物 / 更新宠物健康信息
  // 此处只接收最终 petIds，校验归属 + 数量
  if (!Array.isArray(petIds) || petIds.length === 0) {
    throw err('INVALID_PARAMS', '请填写宠物信息')
  }
  const uniquePetIds = [...new Set(petIds)]
  if (uniquePetIds.length !== petIds.length) {
    throw err('INVALID_PARAMS', '宠物存在重复')
  }

  const invRes = await db.collection(COLLECTION).where({ shareCode: safeCode }).limit(1).get()
  if (!invRes.data || invRes.data.length === 0) {throw err('NOT_FOUND', '邀请不存在或已失效')}
  const inv = invRes.data[0] as Record<string, unknown>

  // 家庭不能自填自己发出的邀请（防资金自循环：自己开单自己支付）
  if ((inv.hostOpenid as string) === openid) {
    throw err('PERMISSION_DENIED', '不能填写自己发出的开单邀请')
  }

  if (inv.status !== 'active') {
    if (inv.status === 'filled') {throw err('STATE_INVALID', '该邀请已被填写')}
    if (inv.status === 'cancelled') {throw err('STATE_INVALID', '该邀请已被取消')}
    throw err('STATE_INVALID', '邀请状态异常')
  }

  // 修复 #2（2026-09-07）：过期邀请不可再成单。离店日当天 23:59:59 仍有效，
  //   避免用户保存旧分享卡片生成「过去日期」订单并支付。
  const endDateStr2 = inv.endDate as string
  const endTs2 = Date.parse(`${endDateStr2}T23:59:59Z`)
  if (Number.isFinite(endTs2) && endTs2 < Date.now()) {
    throw err('INVITATION_EXPIRED', '该邀请已过期')
  }

  if (petIds.length !== (inv.petCount as number)) {
    throw err('INVALID_PARAMS', `本次开单需填写 ${inv.petCount} 只宠物的信息`)
  }

  // 校验宠物归属（防为他人宠物下单）
  const petsRes = await db.collection('pets')
    .where({ _id: db.command.in(petIds), ownerId: openid })
    .get()
  const petList = (petsRes.data || []) as Array<Record<string, unknown>>
  if (petList.length !== petIds.length) {
    throw err('PET_NOT_FOUND', '宠物档案不存在、已删除或不属于当前用户')
  }

  // —— 原子占用邀请（条件更新：仅 active 可占用，首填锁定）——
  const claimRes = await db.collection(COLLECTION)
    .where({ _id: inv._id, status: 'active' })
    .update({ data: { status: 'filled', inviteeOpenId: openid, filledAt: db.serverDate(), updatedAt: db.serverDate() } })
  if (!claimRes || claimRes.stats?.updated === 0) {
    // 并发：他人刚占用
    const retryRes = await db.collection(COLLECTION).doc(inv._id as string).get()
    const finalStatus = (retryRes.data as { status?: string } | undefined)?.status
    if (finalStatus === 'filled') {throw err('STATE_INVALID', '手慢了，该邀请刚被他人填写')}
    if (finalStatus === 'cancelled') {throw err('STATE_INVALID', '该邀请已被取消')}
    throw err('STATE_INVALID', '邀请状态异常')
  }

  // —— 生成正式订单（价格为邀请快照，服务端不重新计价）——
  const startDate = inv.startDate as string
  const endDate = inv.endDate as string
  const calendarDays = Math.max(1, Math.round(
    (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86400000,
  ))

  let ownerInfo: Record<string, unknown> = {}
  try {
    const owner = await db.collection('users').doc(openid).get()
    ownerInfo = { ...(owner.data as Record<string, unknown>) }
  } catch (e) {
    logger.warn('submitInvitation.users.fetch', { code: (e as { errCode?: string }).errCode, msg: (e as Error).message })
  }

  // hostInfo 完整快照（与 createOrder 对齐：剔除敏感字段后存订单）
  const hostInfo: Record<string, unknown> = { ...(inv.hostSnapshot as Record<string, unknown>) }
  try {
    const hostDoc = await db.collection('hostProfiles').doc(inv.hostId as string).get()
    if (hostDoc.data) {
      const fullHost = { ...(hostDoc.data as Record<string, unknown>) }
      SENSITIVE_HOST_FIELDS.forEach(f => { delete fullHost[f] })
      Object.assign(hostInfo, fullHost)
    }
  } catch (e) {
    logger.warn('submitInvitation.hostProfiles.fetch', { msg: (e as Error).message })
  }

  const totalYuan = Number(inv.totalPrice) || 0
  const order: Record<string, unknown> = {
    ownerId: openid,
    hostId: inv.hostId,
    type: 'boarding',
    organizerId: (hostInfo.openid as string) || inv.hostOpenid,
    petIds,
    startDate,
    endDate,
    startAt: inv.startAt,
    endAt: inv.endAt,
    duration: calendarDays,
    pricePerDay: 0, // 家庭手动定价，无单价口径
    petCount: petIds.length,
    billingMode: inv.pricingMode,
    basicPrice: totalYuan,
    originalAmount: totalYuan,
    totalPrice: totalYuan,
    couponId: '',
    couponDiscount: 0,
    couponSnapshot: null,
    note: note ? String(note).trim().slice(0, 500) : '',
    status: 'pending_payment',
    paymentStatus: 'unpaid',
    // 邀请来源标记：支付回调据此自动确认（跳过家庭接单环节）
    source: 'invitation',
    invitationId: inv._id,
    // 一次性键位：天然防重复成单（邀请一次占用后不可再用）
    bookingKey: `invit_${inv._id}`,
    createdAt: db.serverDate(),
    updatedAt: db.serverDate(),
    timeoutAt: Date.now() + PAY_TIMEOUT_MS,
    ownerInfo,
    hostInfo,
    petsInfo: petList,
    ownerName: (ownerInfo.nickName as string) || '',
    ownerPhone: (ownerInfo.phone as string) || '',
    hostName: ((inv.hostSnapshot as { hostName?: string }).hostName) || '',
    autoConfirmed: false, // 支付成功后置 true（paymentService 回调）
  }

  const orderId = generateId('order', openid)
  order._id = orderId

  try {
    await db.collection('orders').add({ data: order })
  } catch (e) {
    // 订单写入失败 → 补偿回滚邀请到 active（条件更新，仅本人占用可回滚）
    logger.error('submitInvitation.order.create_failed', { invitationId: inv._id, msg: (e as Error)?.message })
    try {
      await db.collection(COLLECTION)
        .where({ _id: inv._id, status: 'filled', inviteeOpenId: openid })
        .update({ data: { status: 'active', inviteeOpenId: '', filledAt: null, updatedAt: db.serverDate() } })
    } catch (revertErr) {
      // 回滚失败：人工兜底（记日志，邀请保持 filled 无 orderId，家庭可手动取消）
      logger.error('submitInvitation.revert_failed', { invitationId: inv._id, msg: (revertErr as Error)?.message })
    }
    throw err('ORDER_CREATE_FAILED', '订单创建失败，请重试')
  }

  // 回填 orderId（best-effort；失败不影响主流程，家庭列表可看到 filled 状态）
  try {
    await db.collection(COLLECTION).doc(inv._id as string)
      .update({ data: { orderId, updatedAt: db.serverDate() } })
  } catch (e) {
    logger.warn('submitInvitation.orderId_backfill_failed', { invitationId: inv._id, msg: (e as Error)?.message })
  }

  logger.info('submitInvitation', { invitationId: inv._id, orderId })
  return handleSuccess({ orderId, invitationId: inv._id }, '提交成功')
}

// =====================================================================
// Handler 6: getInviteQrCode - 家庭获取小程序码（云端缓存）
// =====================================================================

async function getInviteQrCode(event: EventLike, _context: ContextLike, auth: AuthLike | null): HandlerResult {
  const openid = auth?.openid
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  await checkPartnerHostingPermission(openid)

  const { invitationId } = event as { invitationId?: string }
  if (!invitationId) {throw err('INVALID_PARAMS', '缺少邀请 ID')}

  const invRes = await db.collection(COLLECTION).doc(invitationId).get()
  if (!invRes.data) {throw err('NOT_FOUND', '邀请不存在')}
  const inv = invRes.data as { hostOpenid?: string, shareCode?: string, qrCodeFileId?: string, status?: string }
  if (inv.hostOpenid !== openid) {
    throw err('PERMISSION_DENIED', '无权操作他人邀请')
  }

  // 已生成过 → 直接返回缓存的 fileID
  if (inv.qrCodeFileId) {
    return handleSuccess({ fileId: inv.qrCodeFileId }, '获取成功')
  }

  // wxacode.getUnlimited：scene 上限 32 字符；c=分享码
  const wxRes = await cloud.openapi.wxacode.getUnlimited({
    scene: `c=${inv.shareCode}`,
    page: 'subpackages/booking/invitation-fill',
    checkPath: false, // 页面可能未发布，跳过校验（开发/体验阶段必需）
    // 环境版本：默认 release（正式版）。联调/体验阶段可用云函数环境变量
    // WXACODE_ENV_VERSION=trial 临时覆盖，便于在正式版发布前用体验版扫码验证。
    envVersion: (process.env.WXACODE_ENV_VERSION || 'release') as 'trial' | 'release' | 'formal',
    width: 430,
  })

  if (!wxRes || wxRes.errCode !== undefined && wxRes.errCode !== 0 || !wxRes.buffer) {
    throw err('BUSINESS_ERROR', `小程序码生成失败：${wxRes?.errMsg || '未知错误'}`)
  }

  // 上传云存储缓存（fileID 可被 <image> 与 canvas（转临时链接后）直接使用）
  const cloudPath = `invite-qrcodes/${inv.shareCode}.png`
  const uploadRes = await cloud.uploadFile({
    cloudPath,
    fileContent: Buffer.from(wxRes.buffer),
  })

  // 回填缓存（并发下重复生成无害，幂等覆盖）
  await db.collection(COLLECTION).doc(invitationId)
    .update({ data: { qrCodeFileId: uploadRes.fileID, updatedAt: db.serverDate() } })

  logger.info('getInviteQrCode', { invitationId, fileId: uploadRes.fileID })
  return handleSuccess({ fileId: uploadRes.fileID }, '获取成功')
}

// =====================================================================
// 导出（withErrorHandling 统一包装，与 orders.ts 一致）
// =====================================================================

const _handlers = {
  createInvitation: withErrorHandling(createInvitation),
  getMyInvitations: withErrorHandling(getMyInvitations),
  cancelInvitation: withErrorHandling(cancelInvitation),
  getInvitationByCode: withErrorHandling(getInvitationByCode),
  submitInvitation: withErrorHandling(submitInvitation),
  getInviteQrCode: withErrorHandling(getInviteQrCode),
}

const _mod = module as { exports: Record<string, unknown> }
_mod.exports = _handlers
;(_handlers as Record<string, unknown>).default = _handlers

export default _handlers
