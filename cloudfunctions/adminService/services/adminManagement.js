const { handleSuccess, handleError, ERROR_CODES } = require('../common/utils')
const { initCloud } = require('../common/utils')
const { createLogger } = require('../common/logger')
const { err } = require('../common/errors')

const { db } = initCloud()
const logger = createLogger('adminService.adminManagement')

async function getAdminList(event, context, auth) {
  if (!auth.isPartner) {throw err('SUPER_ADMIN_REQUIRED', '需要合作伙伴权限')}
  const { page = 1, pageSize = 20 } = event
  const safePageSize = Math.min(Math.max(1, Number(pageSize) || 20), 100)

  const { paginate } = require('../common/utils')
  const result = await paginate(db, 'admins', { page, pageSize: safePageSize })
  return handleSuccess(result)
}

async function getAdminDetail(event, context, auth) {
  if (!auth.isPartner) {throw err('PERMISSION_DENIED', '需要合作伙伴权限')}
  const { openid } = event
  if (!openid) {throw err('INVALID_PARAMS', '缺少管理员openid')}
  const res = await db.collection('admins').doc(openid).get()
  return handleSuccess(res.data)
}

async function updateAdminStatus(event, context, auth) {
  if (!auth.isPartner) {throw err('PERMISSION_DENIED', '需要合作伙伴权限')}
  const { openid, status } = event
  if (!openid) {throw err('INVALID_PARAMS', '缺少管理员openid')}
  if (!status) {throw err('INVALID_PARAMS', '缺少状态')}

  const VALID_STATUSES = ['active', 'suspended', 'disabled']
  if (!VALID_STATUSES.includes(status)) {throw err('INVALID_PARAMS', '无效状态')}

  await db.collection('admins').doc(openid).update({
    data: { status, updatedAt: db.serverDate() },
  })
  return handleSuccess(null, '状态更新成功')
}

module.exports = { getAdminList, getAdminDetail, updateAdminStatus }
