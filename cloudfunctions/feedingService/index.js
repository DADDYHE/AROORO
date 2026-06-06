const { initCloud, handleSuccess, handleError, generateId, ERROR_CODES, paginate } = require('./common/utils')
const { createLogger } = require('./common/logger')
const { verifyAuth } = require('./common/auth-middleware')
const { filterFields, FIELD_WHITELISTS } = require('./common/validator')
const { err, toResponse, isBusinessError } = require('./common/errors')

const { cloud, db } = initCloud()
const logger = createLogger('feedingService')
const _ = db.command

async function createCommissionRecord(orderType, order) {
  try {
    if (!order.ownerId) {return}
    // users._id = openid，直接 doc 查询
    let user = null
    try {
      const userRes = await db.collection('users').doc(order.ownerId).field({ _id: true, inviterId: true }).get()
      user = userRes.data
    } catch (e) { return }
    if (!user || !user.inviterId) {return}
    let config = {}
    try {
      const configRes = await db.collection('system_config').doc('commission_rates').get()
      config = configRes.data || {}
    } catch (e) { return }
    const rate = config[orderType] !== undefined ? Number(config[orderType]) : 0
    if (!rate || rate <= 0) {return}
    const orderAmount = Number(order.totalAmount || order.totalPrice || order.basicPrice || 0)
    if (orderAmount <= 0) {return}
    const commissionAmount = Math.round(orderAmount * rate / 100 * 100) / 100
    // inviterId 就是 openid，直接 doc 查询
    let inviter = null
    try {
      const inviterRes = await db.collection('users').doc(user.inviterId).field({ _id: true, nickName: true }).get()
      inviter = inviterRes.data
    } catch (e) { return }
    if (!inviter) {return}
    const existRes = await db.collection('tuan_commissions').where({ orderNo: order.orderNo || order._id, inviterId: user.inviterId }).count()
    if (existRes.total > 0) {return}
    await db.collection('tuan_commissions').add({
      data: {
        _id: generateId('commission', order.ownerId),
        inviterId: user.inviterId, inviterNickName: inviter.nickName || '',
        ownerId: user._id,
        orderType, orderId: order._id, orderNo: order.orderNo || order._id,
        orderAmount, commissionRate: rate, commissionAmount,
        status: 'pending', createdAt: db.serverDate(), updatedAt: db.serverDate(),
      },
    })
    logger.info('commission_created', { orderType, orderNo: order.orderNo || order._id, amount: orderAmount, rate, commission: commissionAmount })
  } catch (e) {
    logger.error('commission_error', e)
  }
}

const FEEDER_LIST_FIELDS = {
  _id: true, realName: true, nickname: true, avatarUrl: true, address: true,
  pricePerVisit: true, orderCount: true,
  serviceTags: true, serviceTypes: true, status: true, description: true,
  phone: true, gender: true, createdAt: true, beautyInfo: true,
}

const FEEDING_ORDER_FIELDS = {
  _id: true, orderNo: true, orderType: true, feederId: true, ownerId: true, petIds: true,
  petDetails: true, petServices: true,
  startDate: true, endDate: true, visitTimes: true,
  address: true, notes: true,
  keyMethod: true, visitTime: true, feederGender: true,
  familiarity: true, familiarityText: true, familiarityDates: true,
  multiVisit: true, multiVisitText: true, multiVisitDates: true,
  totalAmount: true, originalAmount: true, couponId: true, couponDiscount: true,
  status: true, paymentStatus: true, createdAt: true, updatedAt: true,
}

async function checkPartnerPermission(openid, permission) {
  let admin = null
  try {
    const adminRes = await db.collection('admins').doc(openid).get()
    admin = adminRes.data || null
  } catch (e) {
    admin = null
  }
  if (!admin || admin.status !== 'active') {
    throw err('PARTNER_REQUIRED', '无合作伙伴权限')
  }
  const roles = admin.roles || []
  if (roles.includes('super_admin')) {return admin}
  const perms = admin.permissions || []
  if (!perms.includes(permission)) {
    throw err('PERMISSION_DENIED', `权限不足：需要 ${permission} 权限`)
  }
  return admin
}

const handlers = {
  getFeederList,
  getFeederDetail,
  createFeederProfile,
  updateFeederProfile,
  createFeedingOrder,
  getFeedingOrders,
  getOrderStatus,
  updateFeedingOrderStatus,
  getFeederOrders,
  getFeedingOrderDetail,
  handleFeedingOrder,
  getCurrentFeeder,
}

exports.main = async (event, context) => {
  const { action } = event
  if (!action || !handlers[action]) {
    throw err('INVALID_PARAMS', '无效的操作类型')
  }

  const AUTH_REQUIRED_ACTIONS = ['createFeederProfile', 'updateFeederProfile', 'createFeedingOrder', 'updateFeedingOrderStatus', 'getFeedingOrders', 'getOrderStatus', 'getFeederOrders', 'getFeedingOrderDetail', 'handleFeedingOrder', 'getCurrentFeeder']
  const requireLogin = AUTH_REQUIRED_ACTIONS.includes(action)

  try {
    const auth = await verifyAuth(event, { requireLogin })
    logger.info(action, { openid: auth.openid })
    return await handlers[action](event, context, auth)
  } catch (error) {
    logger.error(action, error)
    if (isBusinessError(error)) {
      return toResponse(error)
    }
    const code = error.code || ERROR_CODES.BUSINESS
    return handleError(error, error.message, code)
  }
}

async function getFeederList(event) {
  const { page = 1, pageSize = 10, location, serviceType } = event

  let whereQuery
  if (serviceType === 'beauty') {
    const beautyCondition = _.or(
      { serviceTypes: _.in(['beauty']) },
      { serviceTags: _.in(['美容造型']) }
    )
    if (location) {
      whereQuery = _.and(
        { status: 'active', serviceArea: _.in([location]) },
        beautyCondition
      )
    } else {
      whereQuery = _.and(
        { status: 'active' },
        beautyCondition
      )
    }
  } else {
    whereQuery = { status: 'active' }
    if (location) {whereQuery.serviceArea = _.in([location])}
    if (serviceType) {whereQuery.serviceTypes = _.in([serviceType])}
  }

  const countResult = await db.collection('feeders').where(whereQuery).count()
  const offset = (page - 1) * pageSize
  const dataResult = await db.collection('feeders')
    .where(whereQuery)
    .field(FEEDER_LIST_FIELDS)
    .orderBy('rating', 'desc')
    .skip(offset)
    .limit(pageSize)
    .get()

  const result = {
    list: dataResult.data,
    total: countResult.total,
    page,
    pageSize,
    totalPages: Math.ceil(countResult.total / pageSize),
    hasNext: page * pageSize < countResult.total,
  }
  return handleSuccess(result, '获取成功')
}

async function getFeederDetail(event) {
  const { feederId } = event
  if (!feederId) {throw err('INVALID_PARAMS', '缺少喂养师ID')}

  try {
    const res = await db.collection('feeders').doc(feederId).get()
    return handleSuccess(res.data, '获取成功')
  } catch (error) {
    return handleError(error, '喂养师不存在', ERROR_CODES.NOT_FOUND)
  }
}

async function createFeederProfile(event, context, auth) {
  const { openid } = auth
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  const { name, avatarUrl, phone, description, serviceArea, pricePerVisit, certifications } = event
  if (!name) {throw err('INVALID_PARAMS', '缺少喂养师名称')}
  if (phone && !/^1[3-9]\d{9}$/.test(phone)) {throw err('INVALID_PARAMS', '手机号格式不正确')}

  const feeder = {
    name,
    avatarUrl: avatarUrl || '',
    phone: phone || '',
    description: description || '',
    serviceArea: serviceArea || [],
    pricePerVisit: Number(pricePerVisit) || 0,
    certifications: certifications || [],
    rating: 0,
    orderCount: 0,
    status: 'pending_review',
    createdBy: openid,
    createdAt: db.serverDate(),
    updatedAt: db.serverDate(),
  }

  feeder._id = generateId('feeder', openid)
  const res = await db.collection('feeders').add({ data: feeder })
  return handleSuccess({ id: res._id }, '创建成功')
}

async function updateFeederProfile(event, context, auth) {
  const { feederId } = event
  const { openid } = auth
  if (!feederId) {throw err('INVALID_PARAMS', '缺少喂养师ID')}
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  const updateData = { updatedAt: db.serverDate(), ...filterFields(FIELD_WHITELISTS.feeder, event) }

  const existRes = await db.collection('feeders').doc(feederId).get()
  if (existRes.data.createdBy !== openid) {
    try {
      await checkPartnerPermission(openid, 'feeding')
    } catch (e) {
      throw err('PERMISSION_DENIED', '无权修改此喂养师档案')
    }
  }

  await db.collection('feeders').doc(feederId).update({ data: updateData })
  return handleSuccess(null, '更新成功')
}

async function createFeedingOrder(event, context, auth) {
  const { openid } = auth
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  const {
    feederId, petIds, startDate, endDate, visitTimes, address, notes,
    keyMethod, visitTime, feederGender,
    familiarity, familiarityText, familiarityDates,
    multiVisit, multiVisitText, multiVisitDates,
    petDetails, petServices,
    totalAmount, originalAmount, couponId, couponDiscount,
  } = event

  if (!petIds || petIds.length === 0) {throw err('INVALID_PARAMS', '请选择宠物')}

  try {
    let feederInfo = {}
    if (feederId) {
      try {
        const feederRes = await db.collection('feeders').doc(feederId).get()
        feederInfo = feederRes.data || {}
      } catch (e) {
        feederInfo = {}
      }
    }

    const orderNo = `FD${Date.now()}${Math.random().toString(36).substr(2, 6).toUpperCase()}`

    const order = {
      orderNo,
      orderType: 'feeding',
      ownerId: openid,
      feederId: feederId || '',
      petIds: petIds || [],
      petDetails: petDetails || [],
      petServices: petServices || {},
      startDate: startDate || '',
      endDate: endDate || '',
      visitTimes: visitTimes || [],
      address: address || '',
      notes: notes || '',
      keyMethod: keyMethod || '',
      visitTime: visitTime || '',
      feederGender: feederGender || '',
      familiarity: familiarity || '',
      familiarityText: familiarityText || '',
      familiarityDates: familiarityDates || [],
      multiVisit: multiVisit || 0,
      multiVisitText: multiVisitText || '',
      multiVisitDates: multiVisitDates || [],
      totalAmount: Number(totalAmount) || 0,
      originalAmount: Number(originalAmount) || 0,
      couponId: couponId || '',
      couponDiscount: Number(couponDiscount) || 0,
      status: 'pending_payment',
      paymentStatus: 'unpaid',
      createdAt: db.serverDate(),
      updatedAt: db.serverDate(),
    }

    order._id = generateId('feeding', openid)
    const res = await db.collection('feedingOrders').add({ data: order })
    return handleSuccess({ id: res._id, orderNo, totalAmount: order.totalAmount }, '下单成功')
  } catch (error) {
    if (error.code) {throw error}
    return handleError(error, '下单失败', ERROR_CODES.DATA)
  }
}

async function refreshPetAvatars(orders) {
  const allPetIds = []
  for (const order of orders) {
    if (order.petIds && order.petIds.length > 0) {
      for (const pid of order.petIds) {
        if (!allPetIds.includes(pid)) {allPetIds.push(pid)}
      }
    }
  }
  if (allPetIds.length === 0) {return}

  const petMap = {}
  const batchSize = 20
  for (let i = 0; i < allPetIds.length; i += batchSize) {
    const batch = allPetIds.slice(i, i + batchSize)
    try {
      const res = await db.collection('pets')
        .where({ _id: _.in(batch) })
        .field({ _id: true, avatarUrl: true })
        .get()
      for (const pet of res.data) {
        petMap[pet._id] = pet.avatarUrl || ''
      }
    } catch (e) {
      logger.error('refreshPetAvatars_error', e)
    }
  }

  for (const order of orders) {
    if (!order.petDetails || !Array.isArray(order.petDetails)) {continue}
    for (const detail of order.petDetails) {
      const petId = detail.id || detail.petId || detail._id
      if (petId && petMap[petId] !== undefined) {
        detail.avatarUrl = petMap[petId]
      }
    }
  }
}

async function getFeedingOrders(event, context, auth) {
  const { openid } = auth
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  const { page = 1, pageSize = 10, status } = event
  const where = { ownerId: openid }
  if (status) {where.status = status}

  const result = await paginate(db, 'feedingOrders', {
    page, pageSize, where, projection: FEEDING_ORDER_FIELDS,
  })

  await refreshPetAvatars(result.list)

  return handleSuccess(result, '获取成功')
}

async function updateFeedingOrderStatus(event, context, auth) {
  const { orderId, status } = event
  const { openid } = auth
  if (!orderId) {throw err('INVALID_PARAMS', '缺少订单ID')}
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}
  if (!status) {throw err('INVALID_PARAMS', '缺少状态')}

  const VALID_STATUSES = ['confirmed', 'in_progress', 'completed', 'cancelled']
  if (!VALID_STATUSES.includes(status)) {throw err('INVALID_PARAMS', '无效的状态值')}

  try {
    const orderRes = await db.collection('feedingOrders').doc(orderId).get()
    if (!orderRes.data) {
      throw err('NOT_FOUND', '订单不存在')
    }
    const order = orderRes.data

    if (order.ownerId !== openid) {
      throw err('PERMISSION_DENIED', '无权操作该订单')
    }

    const allowedTransitions = {
      'pending_payment': ['cancelled'],
      'confirmed': ['in_progress', 'cancelled'],
      'in_progress': ['completed', 'cancelled'],
      'completed': [],
      'cancelled': [],
    }

    if (!allowedTransitions[order.status]?.includes(status)) {
      throw err('BUSINESS_ERROR', '状态变更无效')
    }

    await db.collection('feedingOrders').doc(orderId).update({
      data: { status, updatedAt: db.serverDate() },
    })

    if (status === 'completed') {
      await createCommissionRecord('feeding', { ...order, totalAmount: order.totalPrice })
    }

    return handleSuccess(null, '状态更新成功')
  } catch (error) {
    if (error.code) {throw error}
    return handleError(error, '更新状态失败', ERROR_CODES.DATA)
  }
}

async function getOrderStatus(event, context, auth) {
  const { orderId } = event
  const { openid } = auth
  if (!orderId) {throw err('INVALID_PARAMS', '缺少订单ID')}
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  try {
    const orderRes = await db.collection('feedingOrders').doc(orderId).get()
    if (!orderRes.data) {
      throw err('NOT_FOUND', '订单不存在')
    }
    const order = orderRes.data
    if (order.ownerId !== openid) {
      throw err('PERMISSION_DENIED', '无权查看该订单')
    }

    let feederInfo = { feederName: '', feederPhone: '', feederAvatar: '' }
    if (order.feederId) {
      try {
        const feederRes = await db.collection('feeders').doc(order.feederId).get()
        feederInfo = {
          feederName: feederRes.data?.name || feederRes.data?.realName || '',
          feederPhone: feederRes.data?.phone || '',
          feederAvatar: feederRes.data?.avatarUrl || '',
        }
      } catch (e) {
        feederInfo = { feederName: '', feederPhone: '', feederAvatar: '' }
      }
    }

    await refreshPetAvatars([order])

    const STATUS_TIPS = {
      pending_payment: { title: '待付款', subtitle: '请尽快完成支付', icon: 'clock' },
      confirmed: { title: '订单已确认', subtitle: '平台已接单，将安排服务人员上门', icon: 'success' },
      in_progress: { title: '服务进行中', subtitle: '服务人员正在为您服务', icon: 'progress' },
      completed: { title: '服务已完成', subtitle: '感谢您的使用', icon: 'completed' },
      cancelled: { title: '订单已取消', subtitle: '', icon: 'cancelled' },
    }

    return handleSuccess({
      ...order,
      status: order.status,
      paymentStatus: order.paymentStatus || '',
      totalPrice: order.totalAmount || order.totalPrice || 0,
      feederName: feederInfo.feederName,
      feederPhone: feederInfo.feederPhone,
      feederAvatar: feederInfo.feederAvatar,
      tip: STATUS_TIPS[order.status] || { title: '未知状态', subtitle: '', icon: '' },
    }, '获取成功')
  } catch (error) {
    if (error.code) {throw error}
    return handleError(error, '获取订单状态失败', ERROR_CODES.DATA)
  }
}

async function getFeederOrders(event, context, auth) {
  const { openid } = auth
  const { status, page = 1, pageSize = 10 } = event
  await checkPartnerPermission(openid, 'feeding')
  const feederRes = await db.collection('feeders')
    .where({ createdBy: openid })
    .field({ _id: true })
    .limit(100)
    .get()
  const feederIds = feederRes.data.map(f => f._id)
  if (feederIds.length === 0) {
    return handleSuccess({ list: [], total: 0, page, pageSize, totalPages: 0, hasNext: false }, '获取成功')
  }
  const where = { feederId: _.in(feederIds) }
  if (status) {where.status = status}
  const result = await paginate(db, 'feedingOrders', {
    page, pageSize, where, projection: FEEDING_ORDER_FIELDS,
  })

  await refreshPetAvatars(result.list)

  return handleSuccess(result, '获取成功')
}

async function getFeedingOrderDetail(event, context, auth) {
  const { openid } = auth
  const { orderId } = event
  if (!orderId) {
    throw err('INVALID_PARAMS', '缺少订单ID')
  }
  await checkPartnerPermission(openid, 'feeding')
  const orderRes = await db.collection('feedingOrders').doc(orderId).get()
  if (!orderRes.data) {
    throw err('ORDER_NOT_FOUND', '订单不存在', { orderId })
  }
  const order = orderRes.data
  await refreshPetAvatars([order])
  return handleSuccess({ ...order }, '获取成功')
}

async function handleFeedingOrder(event, context, auth) {
  const { openid } = auth
  const { orderId, operation } = event
  if (!orderId) {
    throw err('INVALID_PARAMS', '缺少订单ID')
  }
  if (!operation) {
    throw err('INVALID_PARAMS', '缺少操作类型')
  }
  await checkPartnerPermission(openid, 'feeding')
  const OPERATION_MAP = { confirm: 'confirmed', complete: 'completed' }
  const targetStatus = OPERATION_MAP[operation]
  if (!targetStatus) {
    throw err('INVALID_PARAMS', '无效的操作类型')
  }
  const orderRes = await db.collection('feedingOrders').doc(orderId).get()
  if (!orderRes.data) {
    throw err('ORDER_NOT_FOUND', '订单不存在', { orderId })
  }
  const order = orderRes.data
  const TRANSITIONS = {
    pending_payment: ['confirmed'],
    confirmed: ['completed'],
    in_progress: ['completed'],
  }
  if (!TRANSITIONS[order.status] || !TRANSITIONS[order.status].includes(targetStatus)) {
    throw err('ORDER_STATUS_INVALID', `无法从 ${order.status} 变更为 ${targetStatus}`, { from: order.status, to: targetStatus })
  }
  await db.collection('feedingOrders').doc(orderId).update({
    data: { status: targetStatus, updatedAt: db.serverDate() },
  })
  if (targetStatus === 'completed') {
    await createCommissionRecord('feeding', { ...order, totalAmount: order.totalPrice })
  }
  return handleSuccess(null, '操作成功')
}

async function getCurrentFeeder(event, context, auth) {
  const { openid } = auth
  const { serviceType } = event
  const where = { createdBy: openid }
  if (serviceType) {where.serviceTypes = _.in([serviceType])}
  const feederRes = await db.collection('feeders')
    .where(where)
    .limit(1)
    .get()
  if (!feederRes.data || feederRes.data.length === 0) {
    return handleSuccess(null, '未找到喂养师档案')
  }
  return handleSuccess(feederRes.data[0], '获取成功')
}
