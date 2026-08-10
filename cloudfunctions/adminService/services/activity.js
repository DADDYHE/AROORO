const { err } = require('../common/errors')
const { parseBJTime, bjWallClock, bjFormat } = require('./_bjtime')
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
    date = parseBJTime(timestamp)
  }
  if (!date || isNaN(date.getTime())) {return String(timestamp)}
  return bjWallClock(date)
}

const { db } = initCloud()

function _parseDate(dateStr) {
  if (!dateStr) {return null}
  try {
    return parseBJTime(dateStr)
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
      const d = parseBJTime(s)
      if (d && !isNaN(d.getTime())) {date = d}
    }
  }
  if (!date || isNaN(date.getTime())) {return ''}
  return bjFormat(date)
}

// P2-4 修复：与 activityService 对齐的活动状态机 + 关键字段校验（活跃管理路径此前缺失）
const ACTIVITY_CREATE_STATUS = ['draft', 'published']
const ACTIVITY_STATUS_TRANSITIONS = {
  draft: ['published', 'cancelled', 'deleted'],
  published: ['registration_stopped', 'cancelled'],
  registration_stopped: ['ended', 'cancelled', 'published'],
  ended: ['published'],
  cancelled: ['deleted', 'published'],
}

function validateActivityFields(data) {
  const parseTime = (v) => {
    if (v === undefined || v === null || v === '') {return null}
    const d = parseBJTime(v)
    return d && !isNaN(d.getTime()) ? d : null
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
    const safeKeyword = escapeRegExp(keyword.trim())
    where.$or = [
      { title: db.RegExp({ regexp: safeKeyword, options: 'i' }) },
      { location: db.RegExp({ regexp: safeKeyword, options: 'i' }) },
    ]
  }

  const result = await paginate(db, 'activities', {
    page, pageSize: safePageSize, where,
    orderBy: { field: 'createdAt', direction: 'desc' },
  })

  // P4 报名宠物数聚合：按活动分组统计已报名宠物总数（活动文档未单独维护 currentPets）
  const list = result.list || []
  if (list.length > 0) {
    const _ = db.command
    const ids = list.map(a => a._id)
    const aggRes = await db.collection('activity_registrations').aggregate()
      .match({ activityId: _.in(ids) })
      .group({
        _id: '$activityId',
        totalPets: {
          $sum: {
            $cond: [
              { $gt: [{ $size: { $ifNull: ['$pets', []] } }, 0] },
              { $size: { $ifNull: ['$pets', []] } },
              { $ifNull: ['$petCount', 0] },
            ],
          },
        },
      })
      .end()
    const petMap = {}
    ;(aggRes.data || []).forEach(g => { petMap[g._id] = g.totalPets || 0 })
    result.list = list.map(a => ({ ...a, currentPets: petMap[a._id] || 0 }))
  }

  return handleSuccess(result)
}

async function getActivityDetail(event, context, auth) {
  const { activityId } = event
  if (!activityId) {throw err('INVALID_PARAMS', '缺少活动ID')}
  const res = await db.collection('activities').doc(activityId).get()
  if (!res.data) {throw err('NOT_FOUND', '活动不存在')}
  // P4 报名汇总：宠物数/人数/组数/签到组数（供详情页「报名情况」卡片）
  const regs = await fetchAllRegistrations(db, activityId)
  const registrationSummary = computeRegSummary(regs)
  return handleSuccess({ ...res.data, registrationSummary })
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

// P4 报名统计：拉取活动全量报名（避免 limit 截断），并聚合人数/宠物/签到组数
async function fetchAllRegistrations(db, activityId) {
  let all = []
  const PAGE_SIZE = 100
  let page = 0
  while (true) {
    const res = await db.collection('activity_registrations')
      .where({ activityId })
      .orderBy('createdAt', 'asc')
      .skip(page * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .get()
    const data = res.data || []
    all.push(...data)
    if (data.length < PAGE_SIZE) {break}
    page++
    if (page >= 50) {break} // 安全上限 5000
  }
  return all
}

function computeRegSummary(registrations) {
  let totalPets = 0
  let totalPeople = 0
  let signedGroups = 0
  registrations.forEach(reg => {
    const pets = Array.isArray(reg.pets) ? reg.pets : []
    const petCount = pets.length || reg.petCount || 0
    totalPets += petCount
    totalPeople += (reg.participantCount || 1)
    if (reg.checkedIn || reg.signIn || reg.isCheckIn || reg.signInStatus === 'signed') {signedGroups++}
  })
  return { totalPets, totalPeople, totalGroups: registrations.length, signedGroups }
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

  // P4：拉全量报名用于聚合汇总；展示列表取前 safePageSize 条（合伙人名单体量可控）
  const all = await fetchAllRegistrations(db, activityId)
  const summary = computeRegSummary(all)

  const openids = [...new Set(all.map(r => r.ownerId).filter(Boolean))]
  const userMap = {}
  if (openids.length > 0) {
    const _ = db.command
    for (let i = 0; i < openids.length; i += 100) {
      const usersRes = await db.collection('users').where({ _id: _.in(openids.slice(i, i + 100)) }).get()
      ;(usersRes.data || []).forEach(u => { userMap[u._id] = u })
    }
  }

  const list = all.map(r => {
    const user = userMap[r.ownerId] || {}
    const pets = Array.isArray(r.pets) ? r.pets : []
    const petCount = pets.length || r.petCount || 0
    const participantCount = r.participantCount || 1
    return {
      ...r,
      petCount,
      participantCount,
      userNickName: user.nickName || '',
      userAvatar: user.avatarUrl || '',
      displayName: user.nickName || '未知用户',
      createdAt: _formatTime(r.createdAt),
    }
  })

  return handleSuccess({
    list: list.slice(0, safePageSize),
    total: all.length,
    summary,
  })
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
  const registrations = await fetchAllRegistrations(db, activityId)

  // P2 修复：大批量报名时 _id in 分批查询，避免单次 get() 100 条截断导致昵称缺失
  const userMap = {}
  const openids = [...new Set(registrations.map(r => r.ownerId).filter(Boolean))]
  if (openids.length > 0) {
    const _ = db.command
    for (let i = 0; i < openids.length; i += 100) {
      const usersRes = await db.collection('users')
        .where({ _id: _.in(openids.slice(i, i + 100)) })
        .get()
      ;(usersRes.data || []).forEach(u => { userMap[u._id] = u })
    }
  }

  const GENDER_MAP = { male: '弟弟', female: '妹妹', unknown: '未知' }
  const genderText = (g) => GENDER_MAP[(g || '').toLowerCase()] || '未知'
  const signText = (r) =>
    (r.checkedIn || r.signIn || r.isCheckIn || r.signInStatus === 'signed') ? '已签到' : ''
  const nickOf = (ownerId) => (userMap[ownerId] && userMap[ownerId].nickName) || ''
  // 联系人姓名：有则导出联系人姓名，没有则退回报名用户名（昵称）
  const contactOf = (r) => r.contactName || nickOf(r.ownerId) || ''

  // P2 修复：CSV 公式注入防护——以 = + - @ 及制表符/回车开头的单元格加单引号前缀，
  // 防止 Excel/WPS 打开导出文件时把用户可控内容（昵称/电话/备注）当公式执行
  const escapeCell = (cell) => {
    let str = String(cell == null ? '' : cell).replace(/"/g, '""')
    if (/^[=+\-@\t\r]/.test(str)) {str = `'${str}`}
    return `"${str}"`
  }

  const headers = ['报名分组', '宠物姓名', '宠物性别', '报名用户名', '联系人姓名', '联系电话', '签到']
  const rows = []
  registrations.forEach((reg, idx) => {
    const pets = Array.isArray(reg.pets) ? reg.pets : []
    const petCount = pets.length || reg.petCount || 0
    const participantCount = reg.participantCount || 1
    const userName = nickOf(reg.ownerId)
    const contact = contactOf(reg)
    const phone = reg.phone || ''
    const sign = signText(reg)
    const groupText = `报名${idx + 1}：宠物${petCount}只，人数${participantCount}人`
    const groupRows = pets.length === 0
      ? [[groupText, '', '', userName, contact, phone, sign]]
      : pets.map(p => [groupText, p.name || '', genderText(p.gender), userName, contact, phone, sign])
    // 每组仅首行显示「第X组」摘要，后续行该列留空
    groupRows.forEach((r, i) => { r[0] = i === 0 ? groupText : ''; rows.push(r) })
  })

  // P4 末行总计：宠物/人数/组数/签到组数
  const summary = computeRegSummary(registrations)
  const totalRow = [
    `总计：宠物${summary.totalPets}只，人数${summary.totalPeople}人，总报名${summary.totalGroups}组，签到${summary.signedGroups}组`,
    '', '', '', '', '', '',
  ]

  const csvBody = [headers.join(','), ...rows.map(row => row.map(escapeCell).join(',')), totalRow.map(escapeCell).join(',')].join('\n')
  const csvContent = '\uFEFF' + csvBody // BOM 防 Excel/WPS 中文乱码

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
