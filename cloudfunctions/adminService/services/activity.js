const { err } = require('../common/errors')
const { handleSuccess, handleError, generateId, ERROR_CODES, paginate, escapeRegExp } = require('../common/utils')
const { initCloud } = require('../common/utils')
const { createLogger } = require('../common/logger')
const { enrichBuyerFields } = require('./_enrichBuyers')

const logger = createLogger('adminService.activity')

function _formatTime(timestamp) {
  if (!timestamp) {return ''}
  let date
  if (timestamp instanceof Date) {
    date = timestamp
  } else if (typeof timestamp === 'object' && timestamp !== null) {
    if (typeof timestamp.getTime === 'function' && !isNaN(timestamp.getTime())) {
      date = new Date(timestamp.getTime())
    } else if (timestamp.$date != null) {
      date = new Date(typeof timestamp.$date === 'number' ? timestamp.$date : Number(timestamp.$date))
    } else if (timestamp.timestamp != null) {
      date = new Date(typeof timestamp.timestamp === 'number' ? timestamp.timestamp : Number(timestamp.timestamp))
    } else {
      date = new Date(Number(timestamp))
    }
  } else if (typeof timestamp === 'number') {
    date = new Date(timestamp)
  } else if (typeof timestamp === 'string') {
    date = new Date(String(timestamp).replace(/-/g, '/'))
  }
  if (!date || isNaN(date.getTime())) {return String(timestamp)}
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  const second = String(date.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`
}

const { db } = initCloud()

function _parseDate(dateStr) {
  if (!dateStr) {return null}
  try {
    return new Date(String(dateStr).replace(/-/g, '/'))
  } catch (e) {
    return null
  }
}

// P2-4 修复：与 activityService 对齐的活动状态机 + 关键字段校验（活跃管理路径此前缺失）
const ACTIVITY_CREATE_STATUS = ['draft', 'published']
const ACTIVITY_STATUS_TRANSITIONS = {
  draft: ['published', 'cancelled', 'deleted'],
  published: ['registration_stopped', 'cancelled'],
  registration_stopped: ['ended', 'cancelled'],
  ended: [],
  cancelled: ['deleted'],
}

function validateActivityFields(data) {
  const parseTime = (v) => {
    if (v === undefined || v === null || v === '') {return null}
    const d = new Date(String(v).replace(/-/g, '/'))
    return isNaN(d.getTime()) ? null : d
  }
  if (data.startTime !== undefined && data.startTime !== '' && !parseTime(data.startTime)) {
    throw err('INVALID_PARAMS', '活动开始时间格式无效')
  }
  if (data.endTime !== undefined && data.endTime !== '' && !parseTime(data.endTime)) {
    throw err('INVALID_PARAMS', '活动结束时间格式无效')
  }
  const st = parseTime(data.startTime)
  const et = parseTime(data.endTime)
  if (st && et && et <= st) {
    throw err('INVALID_PARAMS', '活动结束时间必须晚于开始时间')
  }
  for (const key of ['price', 'pricePerPerson', 'pricePerPet']) {
    if (data[key] !== undefined && data[key] !== null && data[key] !== '') {
      const n = Number(data[key])
      if (isNaN(n) || n < 0) {
        throw err('INVALID_PARAMS', `${key} 必须为不小于 0 的数字`)
      }
    }
  }
  if (data.maxParticipants !== undefined && data.maxParticipants !== null && data.maxParticipants !== '') {
    const n = Number(data.maxParticipants)
    if (isNaN(n) || n < 0 || !Number.isInteger(n)) {
      throw err('INVALID_PARAMS', 'maxParticipants 必须为非负整数')
    }
  }
}

async function getActivityList(event, context, auth) {
  const { page = 1, pageSize = 20, status, keyword } = event
  const safePageSize = Math.min(Math.max(1, Number(pageSize) || 20), 100)

  const where = {}
  if (status) {
    where.status = status
  }
  if (keyword && keyword.trim()) {
    where.title = db.RegExp({
      regexp: escapeRegExp(keyword.trim()),
      options: 'i',
    })
  }

  const result = await paginate(db, 'activities', {
    page, pageSize: safePageSize, where,
    orderBy: { field: 'createdAt', direction: 'desc' },
  })
  return handleSuccess(result)
}

async function getActivityDetail(event, context, auth) {
  const { activityId } = event
  if (!activityId) {throw err('INVALID_PARAMS', '缺少活动ID')}
  const res = await db.collection('activities').doc(activityId).get()
  return handleSuccess(res.data)
}

async function createActivity(event, context, auth) {
  const { title, category, description, price, maxParticipants, location, latitude, longitude, startTime, endTime, coverUrl, images, contactName, contactPhone, wechatId } = event
  if (!title) {throw err('INVALID_PARAMS', '缺少活动标题')}
  // P2-4 修复：状态白名单 + 时间/价格/名额校验（与 activityService 对齐）
  const requestedStatus = String(event.status || 'draft')
  if (!ACTIVITY_CREATE_STATUS.includes(requestedStatus)) {
    throw err('INVALID_PARAMS', `无效的活动状态: ${requestedStatus}`)
  }
  validateActivityFields({ startTime, endTime, price, pricePerPerson: event.pricePerPerson, pricePerPet: event.pricePerPet, maxParticipants })

  let organizer = null
  try {
    const adminId = auth.openid || auth.adminId
    const adminRes = await db.collection('admins').doc(adminId).get()
    organizer = adminRes.data
  } catch (e) {
    logger.warn('createActivity.admins.fetch', { adminId: auth.openid || auth.adminId, code: e.errCode, msg: e.message })
  }

  const activity = {
    title, category: category || 'outdoor', description: description || '',
    price: Number(price) || 0,
    pricePerPerson: Number(event.pricePerPerson) || 0,
    pricePerPet: Number(event.pricePerPet) || 0,
    maxParticipants: Number(maxParticipants) || 0,
    location: location || '', latitude: latitude || null, longitude: longitude || null,
    startTime: startTime || '', endTime: endTime || '',
    coverUrl: coverUrl || '', images: images || [],
    contactName: contactName || '', contactPhone: contactPhone || '', wechatId: wechatId || '',
    currentParticipants: 0, createdBy: auth.openid,
    organizer: organizer ? {
      name: organizer.nickName || '宠团团',
      avatar: organizer.avatarUrl || '/images/default-avatar.svg',
    } : { name: '宠团团', avatar: '/images/default-avatar.svg' },
    status: requestedStatus, createdAt: db.serverDate(), updatedAt: db.serverDate(),
  }

  activity._id = generateId('activity', auth.openid || auth.adminId)
  const res = await db.collection('activities').add({ data: activity })
  return handleSuccess({ id: res._id }, '创建成功')
}

async function updateActivity(event, context, auth) {
  const { activityId } = event
  if (!activityId) {throw err('INVALID_PARAMS', '缺少活动ID')}

  const existing = await db.collection('activities').doc(activityId).get()
  if (!existing.data) {throw err('NOT_FOUND', '活动不存在')}
  if (!auth.isSuperAdmin && existing.data.createdBy !== auth.openid) {
    throw err('PERMISSION_DENIED', '无权操作他人资源')
  }

  // P2-015: 移除完整 event 调试日志（可能含手机号/地址等敏感字段），仅记录字段名
  const { filterFields, FIELD_WHITELISTS } = require('../common/validator')
  const filteredFields = filterFields(FIELD_WHITELISTS.activity, event)
  logger.info('updateActivity', { activityId, fields: Object.keys(filteredFields) })

  // P2-4 修复：状态迁移走状态机 + 时间/价格/名额校验
  if (filteredFields.status !== undefined) {
    const nextStatus = String(filteredFields.status)
    const currStatus = String(existing.data.status || 'draft')
    if (nextStatus !== currStatus) {
      const allowed = ACTIVITY_STATUS_TRANSITIONS[currStatus] || []
      if (!allowed.includes(nextStatus)) {
        throw err('INVALID_PARAMS', `活动状态不允许从 ${currStatus} 变更为 ${nextStatus}`)
      }
    } else {
      delete filteredFields.status
    }
  }
  validateActivityFields({
    startTime: filteredFields.startTime !== undefined ? filteredFields.startTime : event.startTime,
    endTime: filteredFields.endTime !== undefined ? filteredFields.endTime : event.endTime,
    price: filteredFields.price,
    pricePerPerson: filteredFields.pricePerPerson,
    pricePerPet: filteredFields.pricePerPet,
    maxParticipants: filteredFields.maxParticipants,
  })
  const effStart = filteredFields.startTime !== undefined ? filteredFields.startTime : existing.data.startTime
  const effEnd = filteredFields.endTime !== undefined ? filteredFields.endTime : existing.data.endTime
  if (effStart && effEnd) {
    validateActivityFields({ startTime: effStart, endTime: effEnd })
  }

  const updateData = { updatedAt: db.serverDate(), ...filteredFields }

  await db.collection('activities').doc(activityId).update({ data: updateData })
  return handleSuccess(null, '更新成功')
}

async function getActivityRegistrations(event, context, auth) {
  const { activityId, page = 1, pageSize = 20 } = event
  if (!activityId) {throw err('INVALID_PARAMS', '缺少活动ID')}

  const activityRes = await db.collection('activities').doc(activityId).get()
  if (!activityRes.data) {throw err('NOT_FOUND', '活动不存在')}
  if (!auth.isSuperAdmin && activityRes.data.createdBy !== auth.openid) {
    throw err('PERMISSION_DENIED', '无权操作他人资源')
  }

  const safePageSize = Math.min(Math.max(1, Number(pageSize) || 20), 100)

  const result = await paginate(db, 'activity_registrations', {
    page, pageSize: safePageSize,
    where: { activityId },
    orderBy: { field: 'createdAt', direction: 'desc' },
  })

  if (result.list && result.list.length > 0) {
    const openids = result.list.map(r => r.ownerId).filter(Boolean)
    if (openids.length > 0) {
      const _ = db.command
      const usersRes = await db.collection('users').where({ _id: _.in(openids) }).get()
      const userMap = {}
      usersRes.data.forEach(u => { userMap[u._id] = u })

      result.list = result.list.map(r => {
        const user = userMap[r.ownerId] || {}
        return {
          ...r,
          userNickName: user.nickName || '',
          userAvatar: user.avatarUrl || '',
          displayName: user.nickName || '未知用户',
          createdAt: _formatTime(r.createdAt),
        }
      })
    } else {
      result.list = result.list.map(r => ({
        ...r,
        userNickName: '',
        userAvatar: '',
        displayName: '未知用户',
        createdAt: _formatTime(r.createdAt),
      }))
    }
  }

  return handleSuccess(result)
}

async function exportActivityRegistrations(event, context, auth) {
  const { activityId } = event
  if (!activityId) {throw err('NOT_FOUND', '缺少活动ID')}

  const activityRes = await db.collection('activities').doc(activityId).get()
  if (!activityRes.data) {
    throw err('NOT_FOUND', '活动不存在')
  }
  if (!auth.isSuperAdmin && activityRes.data.createdBy !== auth.openid) {
    throw err('PERMISSION_DENIED', '无权操作他人资源')
  }

  // P3 修复：分页拉取全量，避免 limit(1000) 静默截断大活动报名
  let registrations = []
  const PAGE_SIZE = 100
  let page = 0
  while (true) {
    const res = await db.collection('activity_registrations')
      .where({ activityId })
      .orderBy('createdAt', 'desc')
      .skip(page * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .get()
    const data = res.data || []
    registrations.push(...data)
    if (data.length < PAGE_SIZE) {break}
    page++
    if (page >= 50) {break} // 安全上限 5000
  }

  if (registrations.length > 0) {
    const openids = registrations.map(r => r.ownerId).filter(Boolean)
    if (openids.length > 0) {
      const _ = db.command
      const usersRes = await db.collection('users').where({ _id: _.in(openids) }).get()
      const userMap = {}
      usersRes.data.forEach(u => { userMap[u._id] = u })

      registrations = registrations.map(r => ({
        ...r,
        userNickName: userMap[r.ownerId]?.nickName || '',
      }))
    }
  }

  const headers = ['序号', '宠物昵称', '报名时间', '用户昵称', '联系电话', '备注', '签到']

  const rows = registrations.map((reg, index) => [
    index + 1,
    (reg.pets && reg.pets.map(p => p.name).join(', ')) || '',
    _formatTime(reg.createdAt),
    reg.userNickName || '',
    reg.phone || '',
    reg.notes || '',
    '',
  ])

  const csvContent = [headers.join(','), ...rows.map(row => row.map(cell => {
    const str = String(cell).replace(/"/g, '""')
    return `"${str}"`
  }).join(','))].join('\n')

  return handleSuccess({
    activityTitle: activityRes.data.title,
    totalCount: registrations.length,
    csvContent,
  }, '导出成功')
}

async function getActivityOrders(event, context, auth) {
  const { status, page = 1, pageSize = 20 } = event
  const safePageSize = Math.min(Math.max(1, Number(pageSize) || 20), 100)
  const _ = db.command

  const where = { orderType: 'activity' }
  if (status) {where.status = status}

  const result = await paginate(db, 'orders', {
    page, pageSize: safePageSize,
    where,
    orderBy: { field: 'createdAt', direction: 'desc' },
  })

  const list = result.list || []
  const partialEnriched = list.map(order => ({
    ...order,
    productName: order.activityTitle || '',
  }))

  // 缺失的 buyerNickName 走 users 表 join（按 ownerId）
  const enrichedList = await enrichBuyerFields(db, partialEnriched)

  return handleSuccess({ ...result, list: enrichedList })
}

async function deleteActivity(event, context, auth) {
  const { activityId } = event
  if (!activityId) {throw err('INVALID_PARAMS', '缺少活动ID')}

  const activityRes = await db.collection('activities').doc(activityId).get()
  if (!activityRes.data) {
    throw err('NOT_FOUND', '活动不存在')
  }

  if (activityRes.data.status === 'published') {
    throw err('INVALID_PARAMS', '已发布的活动不能删除')
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

module.exports = { getActivityList, getActivityDetail, createActivity, updateActivity, deleteActivity, getActivityRegistrations, exportActivityRegistrations, getActivityOrders }
