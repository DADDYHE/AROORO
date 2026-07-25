/**
 * auth.ts - 用户身份服务（TypeScript 源文件 - Sprint 37 迁移）
 *
 * 业务功能：
 *   - 登录（login）
 *   - 获取身份（getIdentity）
 *   - 同步身份（syncIdentity）
 *   - 检查用户信息（checkUserInfo）
 *   - 更新用户信息（updateUserInfo）
 *   - 获取手机号（getPhoneNumber）
 *   - 获取全部用户信息（getAllUserInfo）
 *   - 获取配置（getConfig）
 *   - 检查管理员状态（checkAdminStatus）
 *
 * 迁移目标：
 *   - 强类型化所有 db 操作、handler 签名、返回结构
 *   - 与 index.ts 的 UserActionHandler 类型对齐
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.userService.json
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { err } = require('./common/errors')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { initCloud, handleSuccess, handleError, ERROR_CODES, maskOpenid } = require('./common/utils')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createLogger } = require('./common/logger')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { filterFields, FIELD_WHITELISTS } = require('./common/validator')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getCache, setCache, deleteCache } = require('./common/cache')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { withRateLimit } = require('./common/risk-rate-limit')

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { cloud, db } = initCloud()
const logger = createLogger('userService:auth')

// =====================================================================
// 类型定义（AuthLike / CloudEvent / CloudContext 抽至 common/types.ts）
// =====================================================================
import type { AuthLike, CloudEvent, CloudContext } from './common/types'

export type AuthHandler = (
  event: CloudEvent,
  context: CloudContext,
  auth: AuthLike
) => Promise<unknown>

export interface UserRecord {
  _id: string
  openid: string
  nickName: string
  avatarUrl: string
  gender?: string
  phone?: string
  birthday?: string
  email?: string
  address?: string
  ownerName?: string
  role: string
  isPartner?: boolean
  bio?: string
  inviterId?: string
  createdAt: Date
  updatedAt: Date
  lastLoginAt?: Date
}

export interface UserPublicView {
  _id: string
  openid: string
  nickName: string
  avatarUrl: string
  gender: string
  phone: string
  birthday: string
  email: string
  address: string
  ownerName: string
  hasPhone: boolean
  role: string
  isPartner: boolean
}

export interface AdminRecord {
  _id: string
  status: string
  isPartner?: boolean
  roles?: string[]
  permissions?: string[]
  [k: string]: unknown
}

export interface LoginResult {
  user: UserPublicView
  isNewUser: boolean
}

export interface IdentityResult {
  user: Omit<UserPublicView, 'role' | 'isPartner'>
}

export interface CheckResult {
  exists: boolean
  nickName?: string
  avatarUrl?: string
  hasPhone?: boolean
}

export interface PhoneData {
  phoneNumber?: string
  purePhoneNumber?: string
  data?: { phoneNumber?: string }
}

export interface AllUserInfoResult {
  userInfo: CheckResult | null
  phone: { phoneNumber: string } | null
}

export interface WxContext {
  OPENID?: string
  APPID?: string
  UNIONID?: string
  [k: string]: unknown
}

// =====================================================================
// Handler 实现
// =====================================================================

export async function login(
  event: CloudEvent,
  context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const wxContext = cloud.getWXContext() as WxContext
  const openid = wxContext.OPENID

  if (!openid) {
    throw err('AUTH_REQUIRED', '未登录')
  }

  // 登录限流：每个 openid 每分钟最多 10 次
  return withRateLimit(
    { userId: openid, type: 'login' },
    async () => {
      try {
        const { userInfo } = event
        const inviterId = event.inviterId || ''
        let validInviterId = ''
        if (inviterId) {
          // users._id = openid，inviterId 就是 openid，直接 doc 查询
          try {
            const inviterRes = await db.collection('users').doc(inviterId).field({ _id: true }).get()
            if (inviterRes.data) {
              validInviterId = inviterId
            }
          } catch (e) {
            logger.warn('login.users.inviterCheck', {
              inviterId,
              code: (e as { errCode?: unknown }).errCode,
              msg: (e as Error).message,
            })
          }
        }
        let user: UserRecord | null = null
        let isNewUser = false

        // users._id = openid，直接 doc 查询
        try {
          const userResult = await db.collection('users').doc(openid).get()
          user = userResult.data
        } catch (e) {
          user = null
        }

        if (!user) {
          isNewUser = true
          // M3 修复：并发 login 竞态保护。两个并发请求都读到 user 不存在时会各自 set，
          // 后到的 set 会覆盖先到者的 inviterId/role。用事务 + 事务内重查避免覆盖。
          const transaction = await db.startTransaction()
          try {
            const existRes = await transaction.collection('users').doc(openid).get()
            if (existRes.data) {
              // 并发下被其他请求抢先创建，直接复用，不再覆盖
              user = existRes.data as UserRecord
            } else {
              const userData: Record<string, unknown> = {
                openid,
                role: 'user',
                inviterId: validInviterId,
                createdAt: db.serverDate(),
                updatedAt: db.serverDate(),
              }

              if (userInfo && typeof userInfo === 'object') {
                const filteredInfo = filterFields(FIELD_WHITELISTS.user, userInfo)
                // 微信号格式的昵称替换为默认昵称（微信在用户未设昵称时会返回 wxid_ 开头的微信号）
                if (filteredInfo.nickName && /^wxid_/i.test(filteredInfo.nickName as string)) {
                  filteredInfo.nickName = '萌宠爱好者' + openid.slice(-4)
                }
                Object.assign(userData, filteredInfo)
              }

              await transaction.collection('users').doc(openid).set({ data: userData })
              user = { _id: openid, ...userData } as UserRecord
            }
            await transaction.commit()
          } catch (txErr) {
            await transaction.rollback().catch(() => {})
            // 事务冲突等异常：降级为普通查询，若已被其他请求创建则复用
            logger.warn('login.create.txFailed', { openid: maskOpenid(openid), code: (txErr as { errCode?: unknown }).errCode })
            const retryRes = await db.collection('users').doc(openid).get().catch(() => null)
            if (retryRes && retryRes.data) {
              user = retryRes.data as UserRecord
            } else {
              throw txErr
            }
          }
        } else {
          const updateData: Record<string, unknown> = { lastLoginAt: db.serverDate(), updatedAt: db.serverDate() }
          if (validInviterId && !user.inviterId) {
            updateData.inviterId = validInviterId
          }
          if (userInfo && typeof userInfo === 'object') {
            const filteredInfo = filterFields(FIELD_WHITELISTS.user, userInfo)
            // 微信号格式的昵称替换为默认昵称
            if (filteredInfo.nickName && /^wxid_/i.test(filteredInfo.nickName as string)) {
              filteredInfo.nickName = '萌宠爱好者' + openid.slice(-4)
            }
            if (filteredInfo.nickName) {
              updateData.nickName = filteredInfo.nickName
            }
            if (filteredInfo.avatarUrl) {
              updateData.avatarUrl = filteredInfo.avatarUrl
            }
          }
          await db.collection('users').doc(openid).update({ data: updateData })
        }

        let isPartner = false
        try {
          const adminRes = await db.collection('admins').doc(openid).get()
          const adminInfo = adminRes.data as AdminRecord | null
          if (adminInfo && adminInfo.status === 'active') {
            isPartner = Boolean(adminInfo.isPartner)
          }
        } catch (e) {
          logger.warn('login.admins.fetch', {
            openid: maskOpenid(openid),
            code: (e as { errCode?: unknown }).errCode,
            msg: (e as Error).message,
          })
        }

        return handleSuccess({
          user: {
            _id: user._id,
            openid: user.openid,
            nickName: user.nickName || '',
            avatarUrl: user.avatarUrl || '',
            gender: user.gender || '',
            phone: user.phone || '',
            birthday: user.birthday || '',
            email: user.email || '',
            address: user.address || '',
            ownerName: user.ownerName || '',
            hasPhone: Boolean(user.phone),
            role: user.role || 'user',
            isPartner,
          },
          isNewUser,
        } as LoginResult, isNewUser ? '新用户注册成功' : '登录成功')
      } catch (error) {
        return handleError(error, '登录失败', ERROR_CODES.DATA)
      }
    },
    { perUserPerMinute: 10, perUserPerTargetPerMinute: 10, windowMs: 60000 }  // 每个 openid 每分钟最多 10 次
  )
}

export async function getIdentity(
  event: CloudEvent,
  context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  // M2 修复：启用缓存读取，让 300s TTL 的 identity 缓存真正生效（避免每次打库）
  const cacheKey = `identity_${openid}`
  const cached = getCache(cacheKey)
  if (cached) {
    return handleSuccess(cached, '获取身份成功')
  }

  try {
    // users._id = openid，直接 doc 查询
    let user: UserRecord | null = null
    try {
      const userResult = await db.collection('users').doc(openid).get()
      user = userResult.data
    } catch (e) {
      throw err('NOT_FOUND', '用户不存在')
    }

    if (!user) {
      throw err('NOT_FOUND', '用户不存在')
    }

    const identityData: IdentityResult = {
      user: {
        _id: user._id,
        openid: user.openid,
        nickName: user.nickName,
        avatarUrl: user.avatarUrl,
        gender: user.gender || '',
        phone: user.phone || '',
        birthday: user.birthday || '',
        email: user.email || '',
        address: user.address || '',
        ownerName: user.ownerName || '',
        hasPhone: Boolean(user.phone),
      },
    }

    const cacheKey = `identity_${openid}`
    setCache(cacheKey, identityData, 300)

    return handleSuccess(identityData, '获取身份成功')
  } catch (error) {
    return handleError(error, '获取身份失败', ERROR_CODES.DATA)
  }
}

export async function syncIdentity(
  event: CloudEvent,
  context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  const cacheKey = `identity_${openid}`
  deleteCache(cacheKey)

  return getIdentity(event, context, auth)
}

export async function checkUserInfo(event: CloudEvent): Promise<unknown> {
  const wxContext = cloud.getWXContext() as WxContext
  const openid = wxContext.OPENID

  if (!openid) {
    return handleSuccess({ exists: false }, '用户不存在')
  }

  try {
    // users._id = openid，直接 doc 查询
    let user: UserRecord | null = null
    try {
      const userRes = await db.collection('users').doc(openid).get()
      user = userRes.data
    } catch (e) {
      logger.warn('checkUserInfo.users.fetch', {
        openid: maskOpenid(openid),
        code: (e as { errCode?: unknown }).errCode,
        msg: (e as Error).message,
      })
    }

    if (!user) {
      return handleSuccess({ exists: false }, '用户不存在')
    }

    return handleSuccess({
      exists: true,
      nickName: user.nickName || '',
      avatarUrl: user.avatarUrl || '',
      hasPhone: Boolean(user.phone),
    } as CheckResult, '获取用户信息成功')
  } catch (error) {
    return handleError(error, '获取用户信息失败', ERROR_CODES.DATA)
  }
}

export async function updateUserInfo(
  event: CloudEvent,
  context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  const { userInfo } = event

  if (!userInfo || typeof userInfo !== 'object') {
    throw err('INVALID_PARAMS', '缺少用户信息')
  }

  try {
    const safeUserInfo = filterFields(FIELD_WHITELISTS.user, userInfo)
    if (userInfo.bio !== undefined) {
      const bioStr = String(userInfo.bio)
      if (bioStr.length > 500) {
        throw err('INVALID_PARAMS', '个人简介不能超过500字')
      }
      safeUserInfo.bio = bioStr
    }

    const updateData = { updatedAt: db.serverDate(), ...safeUserInfo }

    // users._id = openid，直接 doc 查询和更新
    let userExists = false
    try {
      await db.collection('users').doc(openid).get()
      userExists = true
    } catch (e) {
      logger.warn('updateUserInfo.users.fetch', {
        openid: maskOpenid(openid),
        code: (e as { errCode?: unknown }).errCode,
        msg: (e as Error).message,
      })
    }

    if (userExists) {
      await db.collection('users').doc(openid).update({ data: updateData })
      return handleSuccess(null, '更新用户信息成功')
    } else {
      // L2 修复：复用已过滤+特殊处理的 safeUserInfo（430 行），避免重复 filterFields 且 bio 取值不一致
      const createData = {
        openid,
        createdAt: db.serverDate(),
        updatedAt: db.serverDate(),
        ...safeUserInfo,
      }
      await db.collection('users').doc(openid).set({ data: createData })
      return handleSuccess(null, '创建用户信息成功')
    }
  } catch (error) {
    return handleError(error, '更新用户信息失败', ERROR_CODES.DATA)
  }
}

export async function getPhoneNumber(event: CloudEvent): Promise<unknown> {
  const { code } = event
  if (!code) { throw err('INVALID_PARAMS', '缺少 code 参数') }

  // H2 修复：从服务端上下文取 openid 作为限流 key（与 login / checkUserInfo 一致）
  const wxContext = cloud.getWXContext() as WxContext
  const openid = wxContext.OPENID
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  // H2 修复：按 openid 限流（每分钟最多 5 次），防刷微信手机号解密配额 / 触发微信风控
  return withRateLimit(
    { userId: openid, type: 'getPhoneNumber' },
    async () => {
      try {
        const result = (await cloud.getOpenData({ list: [code] })) as {
          list?: PhoneData[]
          errcode?: number
          errmsg?: string
        }

        if (result && result.list && result.list[0]) {
          const phoneData = result.list[0]
          return handleSuccess({
            phoneNumber: phoneData.data?.phoneNumber || phoneData.purePhoneNumber || '未获取到手机号',
          }, '获取手机号成功')
        } else {
          // 区分微信侧返回错误码：errcode != 0 视为微信侧登录失败
          if (result && result.errcode && result.errcode !== 0) {
            throw err('WX_LOGIN_FAILED', `微信侧登录失败：${result.errmsg || result.errcode}`)
          }
          throw err('BUSINESS_ERROR', '获取手机号失败')
        }
      } catch (error) {
        return handleError(error, '获取手机号失败', ERROR_CODES.DATA)
      }
    },
    { perUserPerMinute: 5, perUserPerTargetPerMinute: 5, windowMs: 60000 }
  )
}

export async function getAllUserInfo(
  event: CloudEvent,
  context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  try {
    // L1 修复：原 getAllUserInfo 内调 getPhoneNumber(event) 是死调用——event 不含微信 button 的 code，
    // 必抛后被 .catch 吞，phone 永远 null。删除该调用，手机号改由前端单独调 getPhoneNumber action。
    const allUserInfo = await checkUserInfo(event)

    const userInfoData = (allUserInfo as { data?: CheckResult | null })?.data ?? null
    const result: AllUserInfoResult = {
      userInfo: userInfoData,
      phone: null,
    }
    return handleSuccess(result, '获取成功')
  } catch (error) {
    return handleError(error, '获取用户信息失败', ERROR_CODES.DATA)
  }
}

export async function getConfig(): Promise<unknown> {
  return handleSuccess({}, '获取配置成功')
}

export async function checkAdminStatus(
  event: CloudEvent,
  context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  try {
    let adminInfo: AdminRecord | null = null
    try {
      const adminRes = await db.collection('admins').doc(openid).get()
      adminInfo = adminRes.data
    } catch (e) {
      logger.warn('checkAdminStatus.admins.fetch', {
        openid: maskOpenid(openid),
        code: (e as { errCode?: unknown }).errCode,
        msg: (e as Error).message,
      })
    }

    if (adminInfo && adminInfo.status === 'active') {
      const isPartner = Boolean(adminInfo.isPartner)
      return handleSuccess({ isPartner })
    } else {
      return handleSuccess({ isPartner: false })
    }
  } catch (error) {
    logger.error('checkAdminStatus', error)
    return handleError(error, '检查管理员状态失败', ERROR_CODES.DATA)
  }
}

// =====================================================================
// Runtime shim: CommonJS 兼容
// =====================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _mod = module as { exports: Record<string, unknown> }
_mod.exports = {
  login,
  getIdentity,
  syncIdentity,
  checkUserInfo,
  updateUserInfo,
  getPhoneNumber,
  getAllUserInfo,
  getConfig,
  checkAdminStatus,
}
_mod.exports.default = _mod.exports

export default {
  login,
  getIdentity,
  syncIdentity,
  checkUserInfo,
  updateUserInfo,
  getPhoneNumber,
  getAllUserInfo,
  getConfig,
  checkAdminStatus,
}

// M2 已启用 getIdentity 缓存读取（auth.ts:299 调 getCache(cacheKey)），getCache 已被业务使用，无需 void 抑制
