const { err } = require('../common/errors')
const { handleSuccess, handleError, generateId, ERROR_CODES } = require('../common/utils')
const { initCloud } = require('../common/utils')
const { createLogger } = require('../common/logger')

const { db } = initCloud()
const logger = createLogger('adminService.application')

async function submitApplication(event, context, auth) {
  const { realName, phone, reason } = event
  const { openid } = auth

  if (!realName || !phone || !reason) {
    throw err('INVALID_PARAMS', '请填写完整信息')
  }

  const existingRes = await db.collection('admin_applications')
    .where({ openid, status: 'pending' }).limit(1).get()
  if (existingRes.data && existingRes.data.length > 0) {
    throw err('BUSINESS_ERROR', '您已有待审核申请')
  }

  let admin = null
  try {
    const adminRes = await db.collection('admins').doc(openid).get()
    admin = adminRes.data
  } catch (e) {
    logger.warn('application.admins.fetch', { openid, code: e.errCode, msg: e.message })
  }

  const application = {
    openid,
    nickName: admin?.nickName || '',
    avatarUrl: admin?.avatarUrl || '',
    realName,
    phone,
    reason,
    status: 'pending',
    createdAt: db.serverDate(),
    updatedAt: db.serverDate(),
  }

  application._id = generateId('application', openid)
  const res = await db.collection('admin_applications').add({ data: application })
  return handleSuccess({ id: res._id }, '提交成功')
}

async function getApplicationStatus(event, context, auth) {
  const { openid } = auth
  const res = await db.collection('admin_applications')
    .where({ openid, status: 'pending' }).limit(1).get()
  const hasPending = res.data && res.data.length > 0
  return handleSuccess({ hasPending, application: hasPending ? res.data[0] : null })
}

async function approveApplication(event, context, auth) {
  if (!auth.isPartner) {
    throw err('PERMISSION_DENIED', '需要合作伙伴权限')
  }

  const { applicationId } = event
  if (!applicationId) {
    throw err('INVALID_PARAMS', '缺少申请ID')
  }

  const transaction = await db.startTransaction()
  try {
    const appRes = await transaction.collection('admin_applications').doc(applicationId).get()
    if (!appRes.data) {
      await transaction.rollback()
      throw err('NOT_FOUND', '申请不存在')
    }

    const application = appRes.data
    if (application.status !== 'pending') {
      await transaction.rollback()
      throw err('BUSINESS_ERROR', '申请状态不是待审核')
    }

    await transaction.collection('admin_applications').doc(applicationId).update({
      data: {
        status: 'approved',
        reviewerId: auth.adminId,
        updatedAt: db.serverDate(),
      },
    })

    let existingAdmin = null
    try {
      const userRes = await transaction.collection('admins')
        .doc(application.openid).get()
      existingAdmin = userRes.data || null
    } catch (e) {
      existingAdmin = null
    }

    if (existingAdmin) {
      const updateData = {
        isPartner: true,
        status: 'active',
        updatedAt: db.serverDate(),
      }
      await transaction.collection('admins').doc(application.openid).update({ data: updateData })
    } else {
      let userInfo = {}
      try {
        const userLookup = await db.collection('users').doc(application.openid).get()
        userInfo = userLookup.data || {}
      } catch (e) {
        logger.warn('approveApplication.users.fetch', { openid: application.openid, code: e.errCode, msg: e.message })
      }
      await transaction.collection('admins').doc(application.openid).set({
        data: {
          nickName: userInfo.nickName || application.nickName || '',
          avatarUrl: userInfo.avatarUrl || application.avatarUrl || '',
          isPartner: true,
          status: 'active',
          createdAt: db.serverDate(),
          updatedAt: db.serverDate(),
        },
      })
    }

    await transaction.commit()
    return handleSuccess(null, '审批通过')
  } catch (error) {
    await transaction.rollback()
    throw error
  }
}

async function rejectApplication(event, context, auth) {
  if (!auth.isPartner) {
    throw err('PERMISSION_DENIED', '需要合作伙伴权限')
  }

  const { applicationId, rejectReason } = event
  if (!applicationId) {
    throw err('INVALID_PARAMS', '缺少申请ID')
  }

  await db.collection('admin_applications').doc(applicationId).update({
    data: {
      status: 'rejected',
      rejectReason: rejectReason || '',
      updatedAt: db.serverDate(),
    },
  })
  return handleSuccess(null, '已拒绝')
}

async function getApplicationList(event, context, auth) {
  const { status, page = 1, pageSize = 20 } = event
  const where = {}
  if (status) {where.status = status}

  const { paginate } = require('../common/utils')
  const result = await paginate(db, 'admin_applications', { page, pageSize, where })

  // 补充申请人昵称和头像
  const items = result.list || []
  const openids = [...new Set(items.map(item => item.openid).filter(Boolean))]
  if (openids.length > 0) {
    const userMap = {}
    // 从 users 集合查询昵称
    const userRes = await db.collection('users')
      .where({ _id: db.command.in(openids) })
      .field({ _id: true, nickName: true, avatarUrl: true })
      .limit(100)
      .get()
    for (const u of (userRes.data || [])) {
      userMap[u._id] = u
    }
    // 从 admins 集合补充
    const adminRes = await db.collection('admins')
      .where({ _id: db.command.in(openids) })
      .field({ _id: true, nickName: true, avatarUrl: true })
      .limit(100)
      .get()
    for (const a of (adminRes.data || [])) {
      if (!userMap[a._id]) {userMap[a._id] = a}
    }
    for (const item of items) {
      const user = userMap[item.openid]
      if (user) {
        if (!item.nickName && user.nickName) {item.nickName = user.nickName}
        if (!item.avatarUrl && user.avatarUrl) {item.avatarUrl = user.avatarUrl}
      }
    }
  }

  return handleSuccess(result)
}

async function getMyPermissions(event, context, auth) {
  const { openid } = auth

  let admin = null
  try {
    const adminRes = await db.collection('admins').doc(openid).get()
    admin = adminRes.data
  } catch (e) {
    logger.warn('application.admins.fetch', { openid, code: e.errCode, msg: e.message })
  }
  if (!admin) {
    return handleSuccess({ isPartner: false })
  }

  return handleSuccess({ isPartner: admin.isPartner || false })
}

module.exports = { submitApplication, getApplicationStatus, approveApplication, rejectApplication, getApplicationList, getMyPermissions }
