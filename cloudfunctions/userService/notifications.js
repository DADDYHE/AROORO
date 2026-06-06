const { err } = require('./common/errors')
const { initCloud, handleSuccess, handleError, ERROR_CODES } = require('./common/utils')

const { db } = initCloud()

async function getNotificationList(event, context, auth) {
  const { openid } = auth
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  const { page = 1, pageSize = 20 } = event

  try {
    const unreadRes = await db.collection('notifications')
      .where({ ownerId: openid, isRead: false })
      .count()

    const listRes = await db.collection('notifications')
      .where({ ownerId: openid })
      .orderBy('createdAt', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get()

    return handleSuccess({
      list: listRes.data,
      unreadCount: unreadRes.total,
      page,
      pageSize,
    }, '获取通知成功')
  } catch (error) {
    return handleError(error, '获取通知失败', ERROR_CODES.DATA)
  }
}

async function markNotificationRead(event, context, auth) {
  const { openid } = auth
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  const { notificationId } = event
  if (!notificationId) {throw err('INVALID_PARAMS', '操作失败')}

  try {
    const notification = await db.collection('notifications').doc(notificationId).get()
    if (!notification.data) {
      throw err('NOT_FOUND', '操作失败')
    }
    if (notification.data.ownerId !== openid) {
      throw err('PERMISSION_DENIED', '只能操作自己的通知')
    }
    await db.collection('notifications').doc(notificationId).update({
      data: { isRead: true },
    })
    return handleSuccess(null, '已标记已读')
  } catch (error) {
    return handleError(error, '操作失败', ERROR_CODES.DATA)
  }
}

async function markAllNotificationsRead(event, context, auth) {
  const { openid } = auth
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  try {
    await db.collection('notifications')
      .where({ ownerId: openid, isRead: false })
      .update({ data: { isRead: true } })
    return handleSuccess(null, '已全部标记已读')
  } catch (error) {
    return handleError(error, '操作失败', ERROR_CODES.DATA)
  }
}

async function getNotificationDetail(event, context, auth) {
  const { openid } = auth
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  const { notificationId } = event
  if (!notificationId) {throw err('INVALID_PARAMS', '操作失败')}

  try {
    const res = await db.collection('notifications').doc(notificationId).get()

    if (!res.data || res.data.ownerId !== openid) {
      throw err('NOT_FOUND', '通知不存在')
    }

    if (!res.data.isRead) {
      await db.collection('notifications').doc(notificationId).update({
        data: { isRead: true },
      })
    }

    return handleSuccess(res.data, '获取通知详情成功')
  } catch (error) {
    return handleError(error, '获取通知详情失败', ERROR_CODES.DATA)
  }
}

module.exports = {
  getNotificationList,
  markNotificationRead,
  markAllNotificationsRead,
  getNotificationDetail,
}
