const { err } = require('../common/errors')
const { handleSuccess, handleError, ERROR_CODES } = require('../common/utils')
const { initCloud } = require('../common/utils')
const { createLogger } = require('../common/logger')
const crypto = require('crypto')
// P2 修复：webLogin 防爆破限流
const { withRateLimit } = require('../common/risk-rate-limit')

const { db } = initCloud()
const logger = createLogger('adminService.auth')

// 管理员权限数据库实例（绕过安全规则，用于 Web 端登录等场景）
// 使用 wx-server-sdk（云函数运行时自动具备管理员权限，绕过集合安全规则）
// 注：@cloudbase/node-sdk 不带 env 时为匿名身份，无法查询 PRIVATE 集合（如 admins）
let _adminDb = null
function getAdminDb() {
  if (!_adminDb) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const cloud = require('wx-server-sdk')
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
    _adminDb = cloud.database()
  }
  return _adminDb
}

function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex')
}

async function checkAuth(event, context, auth) {
  const { openid } = auth

  let admin = null
  try {
    const adminRes = await db.collection('admins').doc(openid).get()
    admin = adminRes.data
  } catch (e) {
    logger.warn('checkAuth.admins.fetch', { openid, code: e.errCode, msg: e.message })
  }

  if (!admin || admin.status !== 'active') {
    return handleSuccess({
      isPartner: false,
      isNewUser: true,
    })
  }

  const isPartner = Boolean(admin.isPartner)

  const sessionToken = generateSessionToken()
  const updateData = { sessionToken, updatedAt: db.serverDate() }
  await db.collection('admins').doc(openid).update({ data: updateData })

  return handleSuccess({
    isPartner,
    isNewUser: false,
    sessionToken,
    adminInfo: {
      _id: openid,
      isPartner,
      nickName: admin.nickName || '',
      avatarUrl: admin.avatarUrl || '',
      realName: admin.realName || '',
      phone: admin.phone || '',
    },
  })
}

async function login(event, context, auth) {
  const { openid } = auth
  const { userInfo } = event

  const sessionToken = generateSessionToken()

  let admin = null

  try {
    const adminRes = await db.collection('admins').doc(openid).get()
    admin = adminRes.data
  } catch (e) {
    logger.warn('login.admins.fetch', { openid, code: e.errCode, msg: e.message })
  }

  if (!admin) {
    // P1 修复：不再自动创建 active 管理员——合作伙伴需经审批流程才写入 admins，
    //   任意小程序用户登录即插入 admins(status=active) 会污染权限集合，
    //   且一旦被误配 isPartner/roles 即形成越权面。
    logger.info('login.no_admin_record', { openid })
    return handleSuccess({
      isPartner: false,
      isNewUser: true,
      sessionToken: '',
      adminInfo: null,
    })
  }

  const updateData = { sessionToken, updatedAt: db.serverDate() }
  if (userInfo?.nickName && !admin.nickName) {updateData.nickName = userInfo.nickName}
  if (userInfo?.avatarUrl && !admin.avatarUrl) {updateData.avatarUrl = userInfo.avatarUrl}
  await db.collection('admins').doc(openid).update({ data: updateData })

  const isPartner = Boolean(admin.isPartner)

  return handleSuccess({
    isPartner,
    isNewUser: false,
    sessionToken,
    adminInfo: {
      _id: openid,
      isPartner,
      nickName: admin.nickName || '',
      avatarUrl: admin.avatarUrl || '',
      realName: admin.realName || '',
      phone: admin.phone || '',
    },
  })
}

async function logout(event, context, auth) {
  const { openid } = auth

  await db.collection('admins').doc(openid).update({
    data: { sessionToken: '', updatedAt: db.serverDate() },
  })

  return handleSuccess({ success: true })
}

async function getAvailableRoles(event, context, auth) {
  return handleSuccess([])
}

async function updateProfile(event, context, auth) {
  const { openid } = auth
  const { nickName, avatarUrl, realName, phone } = event

  const updateData = { updatedAt: db.serverDate() }

  if (nickName !== undefined) {updateData.nickName = nickName}
  if (avatarUrl !== undefined) {updateData.avatarUrl = avatarUrl}
  if (realName !== undefined) {updateData.realName = realName}
  if (phone !== undefined) {updateData.phone = phone}

  await db.collection('admins').doc(openid).update({ data: updateData })

  return handleSuccess({
    nickName: updateData.nickName !== undefined ? updateData.nickName : undefined,
    avatarUrl: updateData.avatarUrl !== undefined ? updateData.avatarUrl : undefined,
    realName: updateData.realName !== undefined ? updateData.realName : undefined,
    phone: updateData.phone !== undefined ? updateData.phone : undefined,
  })
}

async function getConfig() {
  return handleSuccess({}, '获取配置成功')
}

async function webLogin(event, context, auth) {
  const { username, password } = event
  if (!username || !password) {
    throw err('INVALID_PARAMS', '参数错误')
  }

  // P2 修复：登录接口防爆破——按用户名每分钟最多 10 次尝试
  await withRateLimit(
    { userId: `web_login:${String(username).slice(0, 64)}`, type: 'web_login' },
    async () => null
  )

  const adminDb = getAdminDb()
  const adminRes = await adminDb.collection('admins')
    .where({ username, status: 'active' })
    .limit(1)
    .get()

  if (!adminRes.data || adminRes.data.length === 0) {
    throw err('AUTH_REQUIRED', '登录失败')
  }

  const admin = adminRes.data[0]
  if (!admin.passwordHash) {
    throw err('AUTH_REQUIRED', '登录失败')
  }

  const bcrypt = require('bcryptjs')
  const valid = await bcrypt.compare(password, admin.passwordHash)
  if (!valid) {
    throw err('AUTH_REQUIRED', '登录失败')
  }

  const { generateToken } = require('../common/token-utils')
  const { isSuperAdmin, isPartner: isPartnerFn } = require('../common/permissions')

  const token = generateToken({
    openid: admin.openid,
    adminId: admin._id,
    isPartner: admin.isPartner || false,
    isSuperAdmin: isSuperAdmin(admin),
  })

  return handleSuccess({
    token,
    admin: {
      _id: admin._id,
      openid: admin.openid,
      nickName: admin.nickName || admin.username,
      avatarUrl: admin.avatarUrl || '',
      isPartner: isPartnerFn(admin),
      // P2 修复：前端菜单按角色过滤需要 isSuperAdmin（以 DB roles 实时判定）
      isSuperAdmin: isSuperAdmin(admin),
    },
  })
}

async function createScanLogin(event, context, auth) {
  // P3 修复：生成新扫码 token 前清理过期/已完成的旧记录，避免集合无限增长
  try {
    const adminDbForClean = getAdminDb()
    await adminDbForClean.collection('scanLoginTokens')
      .where({
        $or: [
          { expiresAt: adminDbForClean.command.lt(Date.now()) },
          { status: adminDbForClean.command.in(['completed', 'denied', 'expired']) },
        ],
      })
      .remove()
  } catch (e) {
    logger.warn('createScanLogin.cleanup.failed', { msg: e?.message || String(e) })
  }

  const loginToken = crypto.randomBytes(16).toString('hex')
  const expiresAt = Date.now() + 5 * 60 * 1000

  const adminDb = getAdminDb()
  await adminDb.collection('scanLoginTokens').add({
    data: {
      loginToken,
      status: 'pending',
      expiresAt,
      createdAt: adminDb.serverDate(),
    },
  })

  const urlScheme = `arooro://scan-login?token=${loginToken}`

  return handleSuccess({
    loginToken,
    urlScheme,
    expiresAt,
  })
}

async function pollScanLogin(event, context, auth) {
  const { loginToken } = event
  if (!loginToken) {
    throw err('INVALID_PARAMS', '参数错误')
  }

  const adminDb = getAdminDb()
  const tokenRes = await adminDb.collection('scanLoginTokens')
    .where({ loginToken })
    .limit(1)
    .get()

  if (!tokenRes.data || tokenRes.data.length === 0) {
    return handleSuccess({ status: 'invalid' })
  }

  const tokenDoc = tokenRes.data[0]

  if (tokenDoc.status === 'expired' || Date.now() > tokenDoc.expiresAt) {
    return handleSuccess({ status: 'expired' })
  }

  if (tokenDoc.status === 'denied') {
    return handleSuccess({ status: 'denied' })
  }

  if (tokenDoc.status === 'confirmed' && tokenDoc.openid) {
    let admin = null
    try {
      const adminRes = await adminDb.collection('admins').doc(tokenDoc.openid).get()
      admin = adminRes.data
    } catch (e) {
      logger.warn('confirmScanLogin.admins.fetch', { openid: tokenDoc.openid, code: e.errCode, msg: e.message })
    }

    if (!admin || admin.status !== 'active') {
      return handleSuccess({ status: 'denied' })
    }

    const { generateToken } = require('../common/token-utils')
    const { isSuperAdmin, isPartner: isPartnerFn } = require('../common/permissions')
    const isPartner = isPartnerFn(admin)

    const token = generateToken({
      openid: admin.openid,
      adminId: admin._id,
      isPartner,
    })

    await adminDb.collection('scanLoginTokens').doc(tokenDoc._id).update({
      data: { status: 'completed', updatedAt: adminDb.serverDate() },
    })

    return handleSuccess({
      status: 'confirmed',
      token,
      admin: {
        _id: admin._id,
        openid: admin.openid,
        nickName: admin.nickName || '',
        avatarUrl: admin.avatarUrl || '',
        isPartner,
        isSuperAdmin: isSuperAdmin(admin),
      },
    })
  }

  return handleSuccess({ status: 'pending' })
}

async function confirmScanLogin(event, context, auth) {
  const { loginToken, confirmed } = event
  const { openid } = auth
  if (!loginToken) {
    throw err('INVALID_PARAMS', '参数错误')
  }

  const adminDb = getAdminDb()
  const tokenRes = await adminDb.collection('scanLoginTokens')
    .where({ loginToken, status: 'pending' })
    .limit(1)
    .get()

  if (!tokenRes.data || tokenRes.data.length === 0) {
    throw err('BUSINESS_ERROR', '扫码登录失败')
  }

  const tokenDoc = tokenRes.data[0]
  if (Date.now() > tokenDoc.expiresAt) {
    await adminDb.collection('scanLoginTokens').doc(tokenDoc._id).update({
      data: { status: 'expired', updatedAt: adminDb.serverDate() },
    })
    throw err('BUSINESS_ERROR', '请重新扫码')
  }

  if (confirmed) {
    await adminDb.collection('scanLoginTokens').doc(tokenDoc._id).update({
      data: { status: 'confirmed', openid, updatedAt: adminDb.serverDate() },
    })
  } else {
    await adminDb.collection('scanLoginTokens').doc(tokenDoc._id).update({
      data: { status: 'denied', updatedAt: adminDb.serverDate() },
    })
  }

  return handleSuccess({ confirmed: Boolean(confirmed) })
}

module.exports = { checkAuth, login, webLogin, logout, getAvailableRoles, updateProfile, getConfig, createScanLogin, pollScanLogin, confirmScanLogin }
