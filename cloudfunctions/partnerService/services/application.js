const { err } = require('./common/errors')
const { initCloud, handleSuccess, handleError, generateId, ERROR_CODES } = require('../common/utils')
const { createLogger } = require('../common/logger')

const { db } = initCloud()
const logger = createLogger('partnerService:application')

async function submitApplication(event, context, auth) {
  const { openid } = auth
  const { realName, phone, reason, permissions } = event

  if (!realName || !phone || !reason) {
    throw err('INVALID_PARAMS', '请填写完整信息')
  }

  const existingRes = await db.collection('admin_applications')
    .where({ openid, status: 'pending' }).limit(1).get()
  if (existingRes.data && existingRes.data.length > 0) {
    throw err('BUSINESS_ERROR', '您已有待审核申请')
  }

  let admin = {}
  try {
    const adminRes = await db.collection('admins').doc(openid).get()
    admin = adminRes.data || {}
  } catch (e) {}

  const application = {
    openid,
    nickName: admin.nickName || '',
    avatarUrl: admin.avatarUrl || '',
    realName,
    phone,
    role: 'partner',
    permissions: Array.isArray(permissions) ? permissions : [],
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

async function getMyPermissions(event, context, auth) {
  const { openid } = auth
  let admin = null
  try {
    const adminRes = await db.collection('admins').doc(openid).get()
    admin = adminRes.data
  } catch (e) {}

  if (!admin || admin.status !== 'active') {
    return handleSuccess({ isPartner: false })
  }

  return handleSuccess({ isPartner: admin.isPartner || false })
}

module.exports = { submitApplication, getApplicationStatus, getMyPermissions }
