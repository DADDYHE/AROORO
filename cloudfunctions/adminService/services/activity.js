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

/**
 * P2 修复：时间存储统一规范化为 'YYYY-MM-DD HH:mm' 字符串
 *   - activityService.autoUpdateActivityStatus 用 'YYYY-MM-DD HH:mm' 字符串比较
 *     驱动 published→registration_stopped→ended，存储格式不一致会导致状态不流转
 *   - 支持字符串 / Date / 时间戳对象；解析失败返回 ''（validateActivityFields 已先行校验）
 */
function _normalizeTime(v) {
  if (!v) {return ''}
  let date = null
  if (typeof v === 'object' && v !== null) {
    if (typeof v.getTime === 'function') {
      date = new Date(v.getTime())
    } else if (v.$date != null) {
      date = new Date(typeof v.$date === 'number' ? v.$date : Number(v.$date))
    } else if (v.timestamp != null) {
      date = new Date(typeof v.timestamp === 'number' ? v.timestamp : Number(v.timestamp))
    }
  } else {
    const s = String(v).trim()
    if (s) {
      const d = new Date(s.replace(/-/g, '/'))
      if (!isNaN(d.getTime())) {date = d}
    }
  }
  if (!date || isNaN(date.getTime())) {return ''}
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
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
  } else {
    // P2 修复：软删除的活动不默认展示（选择 deleted 状态可查看）
    where.status = db.command.neq('deleted')
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
  // P2 修复：price 为历史兼容字段，报名金额只认 pricePerPerson/pricePerPet；
  //   仅填 price 会导致"标价活动按免费报名"，直接拒绝并要求使用新字段
  const ppp = Number(event.pricePerPerson) || 0
  const ppet = Number(event.pricePerPet) || 0
  if ((Number(price) || 0) > 0 && ppp === 0 && ppet === 0) {
    throw err('INVALID_PARAMS', '收费活动请填写每人费用或每只宠物费用（price 已废弃）')
  }

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
    startTime: _normalizeTime(startTime), endTime: _normalizeTime(endTime),
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

  // P2 修复：时间字段落库前统一规范化（与 activityService 状态流转的字符串比较口径一致）
  if (filteredFields.startTime !== undefined) {filteredFields.startTime = _normalizeTime(filteredFields.startTime)}
  if (filteredFields.endTime !== undefined) {filteredFields.endTime = _normalizeTime(filteredFields.endTime)}

  // P2 修复：不允许把名额下调到小于已报名人数（避免已报名数超过上限后满员判断失真）
  if (filteredFields.maxParticipants !== undefined && filteredFields.maxParticipants !== null && filteredFields.maxParticipants !== '') {
    const newMax = Number(filteredFields.maxParticipants)
    const cur = Number(existing.data.currentParticipants) || 0
    if (Number.isInteger(newMax) && newMax >= 0 && newMax < cur) {
      throw err('INVALID_PARAMS', `名额不能小于已报名人数（当前 ${cur} 人）`)
    }
  }

  // P2 修复：收费活动必须提供每人/每宠费用（price 已废弃，防标价活动变免费）
  const effPrice = filteredFields.price !== undefined ? Number(filteredFields.price) : Number(existing.data.price) || 0
  const effPPP = filteredFields.pricePerPerson !== undefined ? Number(filteredFields.pricePerPerson) : Number(existing.data.pricePerPerson) || 0
  const effPPet = filteredFields.pricePerPet !== undefined ? Number(filteredFields.pricePerPet) : Number(existing.data.pricePerPet) || 0
  if (effPrice > 0 && effPPP === 0 && effPPet === 0) {
    throw err('INVALID_PARAMS', '收费活动请填写每人费用或每只宠物费用（price 已废弃）')
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
      const userMap = {}
      // P2 修复：大批量报名时 _id in 分批查询，避免单次 get() 100 条截断导致昵称缺失
      const uniqueIds = [...new Set(openids)]
      for (let i = 0; i < uniqueIds.length; i += 100) {
        const usersRes = await db.collection('users')
          .where({ _id: _.in(uniqueIds.slice(i, i + 100)) })
          .get()
        ;(usersRes.data || []).forEach(u => { userMap[u._id] = u })
      }

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

  // P2 修复：CSV 公式注入防护——以 = + - @ 及制表符/回车开头的单元格加单引号前缀，
  // 防止 Excel/WPS 打开导出文件时把用户可控内容（备注/昵称/电话）当公式执行
  const escapeCell = (cell) => {
    let str = String(cell).replace(/"/g, '""')
    if (/^[=+\-@\t\r]/.test(str)) {str = `'${str}`}
    return `"${str}"`
  }
  const csvContent = [headers.join(','), ...rows.map(row => row.map(escapeCell).join(','))].join('\n')

  return handleSuccess({
    activityTitle: activityRes.data.title,
    totalCount: registrations.length,
    csvContent,
  }, '导出成功')
}

async function getActivityOrders(event, context, auth) {
  const { status, page = 1, pageSize = 20, startDate, endDate } = event
  const safePageSize = Math.min(Math.max(1, Number(pageSize) || 20), 100)
  const _ = db.command

  const where = { orderType: 'activity' }
  // P1 修复：活动订单按活动创建者隔离（活动订单写入 organizerId = 活动 createdBy），
  //   非超管只能看到自己名下活动的订单，避免任意 partner 枚举全量订单（含手机号 PII）。
  //   与 feeding 订单的 P2-3 归属过滤、getActivityRegistrations 的 createdBy 校验保持一致。
  if (!auth.isSuperAdmin && !(auth.roles || []).includes('super_admin')) {
    where.organizerId = auth.openid || auth.partnerId || ''
  }
  if (status) {where.status = status}
  if (startDate || endDate) {
    let timeCond = null
    if (startDate) {
      const startVal = /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? `${startDate}T00:00:00.000` : startDate
      timeCond = _.gte(new Date(startVal))
    }
    if (endDate) {
      const endVal = /^\d{4}-\d{2}-\d{2}$/.test(endDate) ? `${endDate}T23:59:59.999` : endDate
      const end = new Date(endVal)
      timeCond = timeCond ? timeCond.and(_.lte(end)) : _.lte(end)
    }
    if (timeCond) {where.createdAt = timeCond}
  }

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

async function getActivityOrderDetail(event, context, auth) {
  const { orderId } = event
  if (!orderId) {throw err('INVALID_PARAMS', '缺少订单ID')}

  const res = await db.collection('orders').doc(orderId).get()
  if (!res.data) {throw err('NOT_FOUND', '订单不存在')}
  const order = res.data
  if (order.orderType !== 'activity') {
    throw err('NOT_FOUND', '订单不存在')
  }
  // P1 修复：非超管仅可查看自己名下活动的订单（与 getActivityOrders 同口径）
  if (!auth.isSuperAdmin && !(auth.roles || []).includes('super_admin')) {
    const myId = auth.openid || auth.partnerId || ''
    if (order.organizerId !== myId) {
      throw err('PERMISSION_DENIED', '无权查看该订单')
    }
  }

  // 补齐买家昵称
  const enriched = await enrichBuyerFields(db, [order])
  return handleSuccess(enriched[0] || order)
}

async function deleteActivity(event, context, auth) {
  const { activityId } = event
  if (!activityId) {throw err('INVALID_PARAMS', '缺少活动ID')}
  // P2 修复：删除为破坏性操作，仅超管可执行（partner 仅可创建/编辑/管理报名）
  if (!auth.isSuperAdmin && !(auth.roles || []).includes('super_admin')) {
    throw err('PERMISSION_DENIED', '仅超级管理员可删除活动')
  }

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

  // P2 修复：物理删除改为软删除（status='deleted'），保留审计与数据可恢复性；
  //   用户端列表已按 published/registration_stopped/ended 过滤，deleted 不再外露
  await db.collection('activities').doc(activityId).update({
    data: { status: 'deleted', deletedAt: db.serverDate(), updatedAt: db.serverDate() },
  })
  return handleSuccess(null, '已删除（软删除，可在数据库中恢复）')
}

module.exports = { getActivityList, getActivityDetail, createActivity, updateActivity, deleteActivity, getActivityRegistrations, exportActivityRegistrations, getActivityOrders, getActivityOrderDetail }
