/**
 * notifications.ts - 通知服务（TypeScript 源文件 - Sprint 37 迁移）
 *
 * 业务功能：
 *   - 获取通知列表（getNotificationList）
 *   - 标记单条通知已读（markNotificationRead）
 *   - 标记全部通知已读（markAllNotificationsRead）
 *   - 获取通知详情（getNotificationDetail）
 *
 * 迁移目标：
 *   - 强类型化所有 db 操作、handler 签名、返回结构
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.userService.json
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { err } = require('./common/errors')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { initCloud, handleSuccess, handleError, ERROR_CODES } = require('./common/utils')

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { db } = initCloud()

// =====================================================================
// 类型定义（AuthLike / CloudEvent / CloudContext 抽至 common/types.ts）
// =====================================================================
import type { AuthLike, CloudEvent, CloudContext } from './common/types'

export type NotificationHandler = (
  event: CloudEvent,
  context: CloudContext,
  auth: AuthLike
) => Promise<unknown>

export interface NotificationRecord {
  _id: string
  ownerId: string
  type: string
  isRead: boolean
  title?: string
  content?: string
  orderId?: string
  status?: string
  statusText?: string
  createdAt: Date
  [k: string]: unknown
}

export interface NotificationListResult {
  list: NotificationRecord[]
  unreadCount: number
  page: number
  pageSize: number
}

// =====================================================================
// Handler 实现
// =====================================================================

export async function getNotificationList(
  event: CloudEvent,
  context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  const { page = 1 } = event
  // L5 修复：pageSize 加 100 上限保护，避免前端传超大值拉爆 DB（与 utils.MAX_PAGE_SIZE 语义一致）
  const pageSize = Math.min(Number(event.pageSize) || 20, 100)

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

    const result: NotificationListResult = {
      list: (listRes.data || []) as NotificationRecord[],
      unreadCount: unreadRes.total,
      page,
      pageSize,
    }
    return handleSuccess(result, '获取通知成功')
  } catch (error) {
    return handleError(error, '获取通知失败', ERROR_CODES.DATA)
  }
}

export async function markNotificationRead(
  event: CloudEvent,
  context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  const { notificationId } = event
  if (!notificationId) { throw err('INVALID_PARAMS', '操作失败') }

  try {
    const notification = await db.collection('notifications').doc(notificationId).get()
    if (!notification.data) {
      throw err('NOT_FOUND', '操作失败')
    }
    const data = notification.data as NotificationRecord
    if (data.ownerId !== openid) {
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

export async function markAllNotificationsRead(
  event: CloudEvent,
  context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  try {
    await db.collection('notifications')
      .where({ ownerId: openid, isRead: false })
      .update({ data: { isRead: true } })
    return handleSuccess(null, '已全部标记已读')
  } catch (error) {
    return handleError(error, '操作失败', ERROR_CODES.DATA)
  }
}

export async function getNotificationDetail(
  event: CloudEvent,
  context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  const { notificationId } = event
  if (!notificationId) { throw err('INVALID_PARAMS', '操作失败') }

  try {
    const res = await db.collection('notifications').doc(notificationId).get()

    const data = res.data as NotificationRecord | null
    if (!data || data.ownerId !== openid) {
      throw err('NOT_FOUND', '通知不存在')
    }

    if (!data.isRead) {
      await db.collection('notifications').doc(notificationId).update({
        data: { isRead: true },
      })
    }

    return handleSuccess(data, '获取通知详情成功')
  } catch (error) {
    return handleError(error, '获取通知详情失败', ERROR_CODES.DATA)
  }
}

// =====================================================================
// Runtime shim: CommonJS 兼容
// =====================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _mod = module as { exports: Record<string, unknown> }
_mod.exports = {
  getNotificationList,
  markNotificationRead,
  markAllNotificationsRead,
  getNotificationDetail,
}
_mod.exports.default = _mod.exports

export default {
  getNotificationList,
  markNotificationRead,
  markAllNotificationsRead,
  getNotificationDetail,
}
