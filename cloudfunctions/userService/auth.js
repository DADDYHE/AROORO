const { err } = require('./common/errors')
const { initCloud, handleSuccess, handleError, ERROR_CODES } = require('./common/utils')
const { createLogger } = require('./common/logger')
const { filterFields, FIELD_WHITELISTS } = require('./common/validator')
const { getCache, setCache, deleteCache } = require('./common/cache')

const { cloud, db } = initCloud()
const logger = createLogger('userService')

async function login(event) {
  try {
    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID

    if (!openid) {
      throw err('AUTH_REQUIRED', '未登录')
    }

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
        logger.warn('login.users.inviterCheck', { inviterId, code: e.errCode, msg: e.message })
      }
    }
    let user = null
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
      const userData = {
        openid,
        role: 'user',
        inviterId: validInviterId,
        createdAt: db.serverDate(),
        updatedAt: db.serverDate(),
      }

      if (userInfo && typeof userInfo === 'object') {
        Object.assign(userData, filterFields(FIELD_WHITELISTS.user, userInfo))
      }

      // _id = openid，使用 doc(openid).set()
      await db.collection('users').doc(openid).set({ data: userData })
      user = { _id: openid, ...userData }
    } else {
      const updateData = { lastLoginAt: db.serverDate(), updatedAt: db.serverDate() }
      if (validInviterId && !user.inviterId) {
        updateData.inviterId = validInviterId
      }
      if (userInfo && typeof userInfo === 'object') {
        const filteredInfo = filterFields(FIELD_WHITELISTS.user, userInfo)
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
      const adminInfo = adminRes.data
      if (adminInfo && adminInfo.status === 'active') {
        isPartner = Boolean(adminInfo.isPartner)
      }
    } catch (e) {
      logger.warn('login.admins.fetch', { openid, code: e.errCode, msg: e.message })
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
    }, isNewUser ? '新用户注册成功' : '登录成功')
  } catch (error) {
    return handleError(error, '登录失败', ERROR_CODES.DATA)
  }
}

async function getIdentity(event, context, auth) {
  const { openid } = auth
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  try {
    // users._id = openid，直接 doc 查询
    let user = null
    try {
      const userResult = await db.collection('users').doc(openid).get()
      user = userResult.data
    } catch (e) {
      throw err('NOT_FOUND', '用户不存在')
    }

    const identityData = {
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

async function syncIdentity(event, context, auth) {
  const { openid } = auth
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  const cacheKey = `identity_${openid}`
  deleteCache(cacheKey)

  return getIdentity(event, context, auth)
}

async function checkUserInfo(event) {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return handleSuccess({ exists: false }, '用户不存在')
  }

  try {
    // users._id = openid，直接 doc 查询
    let user = null
    try {
      const userRes = await db.collection('users').doc(openid).get()
      user = userRes.data
    } catch (e) {
      logger.warn('checkUserInfo.users.fetch', { openid, code: e.errCode, msg: e.message })
    }

    if (!user) {
      return handleSuccess({ exists: false }, '用户不存在')
    }

    return handleSuccess({
      exists: true,
      nickName: user.nickName || '',
      avatarUrl: user.avatarUrl || '',
      hasPhone: Boolean(user.phone),
    }, '获取用户信息成功')
  } catch (error) {
    return handleError(error, '获取用户信息失败', ERROR_CODES.DATA)
  }
}

async function updateUserInfo(event, context, auth) {
  const { openid } = auth
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

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
      logger.warn('updateUserInfo.users.fetch', { openid, code: e.errCode, msg: e.message })
    }

    if (userExists) {
      await db.collection('users').doc(openid).update({ data: updateData })
      return handleSuccess(null, '更新用户信息成功')
    } else {
      const createData = { openid, createdAt: db.serverDate(), updatedAt: db.serverDate(), ...filterFields(FIELD_WHITELISTS.user, userInfo) }
      if (userInfo.bio !== undefined) {createData.bio = userInfo.bio}
      await db.collection('users').doc(openid).set({ data: createData })
      return handleSuccess(null, '创建用户信息成功')
    }
  } catch (error) {
    return handleError(error, '更新用户信息失败', ERROR_CODES.DATA)
  }
}

async function getPhoneNumber(event) {
  const { code } = event
  if (!code) {throw err('INVALID_PARAMS', '缺少 code 参数')}

  try {
    const result = await cloud.getOpenData({ list: [code] })

    if (result && result.list && result.list[0]) {
      const phoneData = result.list[0]
      return handleSuccess({
        phoneNumber: phoneData.data.phoneNumber || phoneData.purePhoneNumber || '未获取到手机号',
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
}

async function getAllUserInfo(event, context, auth) {
  const { openid } = auth
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  try {
    const [allUserInfo, allPhoneData] = await Promise.all([
      checkUserInfo(event),
      getPhoneNumber(event).catch(() => null),
    ])
    return handleSuccess({
      userInfo: allUserInfo.data,
      phone: allPhoneData?.data,
    }, '获取成功')
  } catch (error) {
    return handleError(error, '获取用户信息失败', ERROR_CODES.DATA)
  }
}

async function getConfig() {
  return handleSuccess({}, '获取配置成功')
}

async function checkAdminStatus(event, context, auth) {
  const { openid } = auth
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  try {
    let adminInfo = null
    try {
      const adminRes = await db.collection('admins').doc(openid).get()
      adminInfo = adminRes.data
    } catch (e) {
      logger.warn('checkAdminStatus.admins.fetch', { openid, code: e.errCode, msg: e.message })
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

module.exports = {
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
