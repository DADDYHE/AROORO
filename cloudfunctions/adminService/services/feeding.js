const { err } = require('../common/errors')
const { handleSuccess, handleError, generateId, ERROR_CODES, paginate } = require('../common/utils')
const { initCloud } = require('../common/utils')
const { filterFields, FIELD_WHITELISTS } = require('../common/validator')
const { createLogger } = require('../common/logger')
const { FEEDING_ORDER_TRANSITIONS, FEEDING_STATUS_MAP, validateTransition } = require('./stateMachine')
const { createCommissionRecord } = require('./commission')

const { db } = initCloud()
const _ = db.command
const logger = createLogger('adminService:feeding')

async function getFeederList(event, context, auth) {
  const { page = 1, pageSize = 20 } = event
  const result = await paginate(db, 'feeders', { page, pageSize, where: {} })
  return handleSuccess(result)
}

async function getFeederDetail(event, context, auth) {
  const { feederId } = event
  if (!feederId) {throw err('INVALID_PARAMS', '缺少喂养师ID')}

  try {
    const res = await db.collection('feeders').doc(feederId).get()
    return handleSuccess(res.data, '获取成功')
  } catch (error) {
    return handleError(error, '喂养师不存在', ERROR_CODES.NOT_FOUND)
  }
}

async function getCurrentFeeder(event, context, auth) {
  const { openid } = auth
  const { serviceType } = event
  const where = { createdBy: openid }
  if (serviceType) {where.serviceTypes = _.in([serviceType])}
  const res = await db.collection('feeders')
    .where(where)
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get()
  if (res.data && res.data.length > 0) {
    return handleSuccess(res.data[0])
  }
  return handleSuccess(null)
}

async function createFeederProfile(event, context, auth) {
  const { realName, nickname, phone, gender, avatarUrl, address, pricePerVisit, description, serviceTypes, serviceTags, photos, idCardFront, idCardBack, healthCertificate, emergencyContactName, emergencyContactPhone, beautyInfo } = event

  logger.info('createFeederProfile', { event: JSON.stringify(event) })
  logger.info('createFeederProfile.auth', { auth: JSON.stringify(auth) })

  if (!realName) {throw err('INVALID_PARAMS', '请填写真实姓名')}
  if (!phone) {throw err('INVALID_PARAMS', '请填写手机号')}

  try {
    const existingRes = await db.collection('feeders')
      .where({ phone, status: 'active' }).count()
    logger.info('createFeederProfile.existingCheck', { total: existingRes.total })
    if (existingRes.total > 0) {
      throw err('BUSINESS_ERROR', '该手机号已注册为喂养师')
    }
  } catch (e) {
    logger.warn('createFeederProfile.existingCheck', { msg: e.message })
  }

  const feederData = {
    realName,
    nickname: nickname || '',
    phone,
    gender: gender || '',
    avatarUrl: avatarUrl || '',
    address: address || '',
    pricePerVisit: Number(pricePerVisit) || 0,
    description: description || '',
    serviceTypes: serviceTypes || [],
    serviceTags: serviceTags || [],
    photos: photos || [],
    idCardFront: idCardFront || '',
    idCardBack: idCardBack || '',
    healthCertificate: healthCertificate || '',
    emergencyContactName: emergencyContactName || '',
    emergencyContactPhone: emergencyContactPhone || '',
    beautyInfo: beautyInfo || null,
    status: 'pending',
    rating: 5.0,
    createdBy: auth.openid,
    createdAt: db.serverDate(),
    updatedAt: db.serverDate(),
  }

  logger.info('createFeederProfile.insert', { data: JSON.stringify(feederData) })

  feederData._id = generateId('feeder', auth.openid || auth.adminId)
  const res = await db.collection('feeders').add({ data: feederData })
  logger.info('createFeederProfile.result', { id: res._id })
  return handleSuccess({ id: res._id }, '喂养师创建成功')
}

async function updateFeederProfile(event, context, auth) {
  const { feederId } = event
  if (!feederId) {throw err('INVALID_PARAMS', '缺少喂养师ID')}

  const updateData = { updatedAt: db.serverDate(), ...filterFields(FIELD_WHITELISTS.feeder, event) }

  await db.collection('feeders').doc(feederId).update({ data: updateData })
  return handleSuccess(null, '更新成功')
}

async function getFeedingOrders(event, context, auth) {
  const { status, page = 1, pageSize = 20 } = event
  const where = {}
  if (status) {where.status = status}

  const result = await paginate(db, 'feedingOrders', { page, pageSize, where })

  const list = result.list || []
  const feederIds = [...new Set(list.map(o => o.feederId).filter(Boolean))]
  const ownerIds = [...new Set(list.map(o => o.ownerId).filter(Boolean))]
  const feederMap = {}
  const userMap = {}
  if (feederIds.length > 0) {
    const feedersRes = await db.collection('feeders').where({ _id: _.in(feederIds) }).field({ _id: true, realName: true, nickname: true }).get()
    feedersRes.data.forEach(f => { feederMap[f._id] = f })
  }
  if (ownerIds.length > 0) {
    const usersRes = await db.collection('users').where({ _id: _.in(ownerIds) }).field({ _id: true, nickName: true }).limit(100).get()
    usersRes.data.forEach(u => { userMap[u._id] = u })
  }
  const enrichedList = list.map(order => {
    const feeder = feederMap[order.feederId]
    const user = userMap[order.ownerId]
    return {
      ...order,
      orderNo: order.orderNo || order._id || '',
      userName: user?.nickName || order.userName || '',
      feederName: feeder ? (feeder.realName || feeder.nickname || '') : (order.feederName || ''),
      totalPrice: order.totalAmount || order.totalPrice || 0,
    }
  })

  return handleSuccess({ ...result, list: enrichedList })
}

async function getFeederOrders(event, context, auth) {
  const { openid } = auth
  const { status, page = 1, pageSize = 20 } = event

  const feedersRes = await db.collection('feeders')
    .where({ createdBy: openid })
    .field({ _id: true })
    .get()
  const feederIds = (feedersRes.data || []).map(f => f._id)

  if (feederIds.length === 0) {
    return handleSuccess({ list: [], total: 0, page, pageSize })
  }

  const where = { feederId: db.command.in(feederIds) }
  if (status && status !== 'all') {where.status = status}

  const result = await paginate(db, 'feedingOrders', { page, pageSize, where })
  return handleSuccess(result)
}

async function handleFeedingOrder(event, context, auth) {
  const orderId = event.orderId || event.data?.orderId
  const operation = event.operation || event.data?.operation
  if (!orderId) {throw err('INVALID_PARAMS', '缺少订单ID')}
  if (!operation) {throw err('INVALID_PARAMS', '缺少操作类型')}
  if (!auth.roles?.includes('super_admin') && !auth.permissions?.includes('feeding')) {
    throw err('PERMISSION_DENIED', '无操作权限')
  }

  const newStatus = FEEDING_STATUS_MAP[operation]
  if (!newStatus) {throw err('INVALID_PARAMS', '无效操作')}

  const orderRes = await db.collection('feedingOrders').where({ _id: orderId }).limit(1).get()
  if (!orderRes.data || orderRes.data.length === 0) {throw err('NOT_FOUND', '订单不存在')}
  const orderData = orderRes.data[0]

  try {
    validateTransition(FEEDING_ORDER_TRANSITIONS, orderData.status, newStatus)
  } catch (e) {
    return handleError(e, e.message, ERROR_CODES.BUSINESS)
  }

  await db.collection('feedingOrders').where({ _id: orderId }).update({
    data: { status: newStatus, updatedAt: db.serverDate() },
  })

  if (newStatus === 'completed') {await createCommissionRecord('feeding', orderData)}

  return handleSuccess(null, '操作成功')
}

async function getFeedingOrderDetail(event, context, auth) {
  const orderId = event.orderId || event.data?.orderId
  if (!orderId) {throw err('INVALID_PARAMS', '缺少订单ID')}

  try {
    const orderRes = await db.collection('feedingOrders').where({ _id: orderId }).limit(1).get()
    if (!orderRes.data || orderRes.data.length === 0) {throw err('NOT_FOUND', '订单不存在')}

    const order = orderRes.data[0]
    let feederName = ''
    let feederPhone = ''
    if (order.feederId) {
      const feederRes = await db.collection('feeders').where({ _id: order.feederId }).field({ realName: true, nickname: true, phone: true }).limit(1).get()
      const feeder = feederRes.data && feederRes.data[0]
      if (feeder) {
        feederName = feeder.realName || feeder.nickname || ''
        feederPhone = feeder.phone || ''
      }
    }

    let userName = ''
    if (order.ownerId) {
      const userRes = await db.collection('users').where({ _id: order.ownerId }).field({ nickName: true }).limit(1).get()
      const user = userRes.data && userRes.data[0]
      if (user) {userName = user.nickName || ''}
    }

    return handleSuccess({
      ...order,
      userName: userName || order.userName || '',
      feederName,
      feederPhone,
      totalPrice: order.totalAmount || order.totalPrice || 0,
    }, '获取成功')
  } catch (error) {
    return handleError(error, '获取订单详情失败', ERROR_CODES.DATA)
  }
}

module.exports = { getFeederList, getFeederDetail, getCurrentFeeder, createFeederProfile, updateFeederProfile, getFeedingOrders, getFeederOrders, handleFeedingOrder, getFeedingOrderDetail }
