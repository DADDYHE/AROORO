const { initCloud, handleSuccess, handleError, generateId, ERROR_CODES, paginate } = require('./common/utils')
const { createLogger } = require('./common/logger')
const { verifyAuth } = require('./common/auth-middleware')
const { filterFields, FIELD_WHITELISTS } = require('./common/validator')
const { err, toResponse, isBusinessError } = require('./common/errors')
const { ENDPOINTS } = require('../common/config')
const { detectActivityApplyRisk, mapActionToErrorCode } = require('../common/risk-control')
const { withRateLimit, initGlobalRateLimitFromDb } = require('../common/risk-rate-limit')

const { cloud, db } = initCloud()
const logger = createLogger('activityService')
const _ = db.command

// Sprint 21: 注入全局限流存储（基于 db 集合 rate_limits）
//  - 跨云函数实例共享计数
//  - 若 db 不可用则降级到内存（initGlobalRateLimitFromDb 内部 try/catch）
try {
  initGlobalRateLimitFromDb(db, { collectionName: 'rate_limits' })
} catch (e) {
  logger.warn('initGlobalRateLimitFromDb failed, fallback to memory:', e && e.message)
}

/**
 * Sprint 22: 活动报名风控前置
 *   - reject → 抛 RISK_REJECT
 *   - review → 标 pendingReview = true（不阻塞报名，运营后续抽检）
 *   - allow  → 放行
 *
 * @returns {{ pendingReview: boolean, reasons: string[], decision: 'RISK_PASS' | 'RISK_PENDING' | 'RISK_REJECT' }}
 * @throws {BusinessError} RISK_REJECT / RATE_LIMITED
 */
async function performActivityApplyRiskCheck(ctx) {
  const { openid, activityId, amountFen } = ctx
  let pendingReview = false
  let riskDecision = 'RISK_PASS'
  let riskReasons = []
  try {
    const risk = await withRateLimit(
      { userId: openid, type: 'activity_apply', targetId: activityId },
      () => detectActivityApplyRisk({
        db,
        userId: openid,
        amountFen,
        targetId: activityId,
      })
    )
    riskDecision = mapActionToErrorCode(risk.action)
    riskReasons = risk.reasons
    if (risk.action === 'reject') {
      logger.warn('activityApply.risk_reject', { userId: openid, activityId, amountFen, reasons: risk.reasons })
      throw err('RISK_REJECT', '报名被风控拦截', {
        reasons: risk.reasons,
        level: risk.level,
        activityId,
      })
    }
    if (risk.action === 'review') {
      pendingReview = true
      logger.info('activityApply.risk_pending', { userId: openid, activityId, amountFen, reasons: risk.reasons })
    } else {
      logger.debug?.('activityApply.risk_pass', { userId: openid, activityId })
    }
  } catch (e) {
    // RATE_LIMITED / RISK_REJECT 透传
    if (isBusinessError(e) && (e.code === 'RATE_LIMITED' || e.code === 'RISK_REJECT')) {
      throw e
    }
    // 其他风控模块异常不应阻塞报名，降级放行
    logger.warn('activityApply.risk_control_error', { userId: openid, activityId, msg: e && e.message })
    riskDecision = 'RISK_PASS'
  }
  return { pendingReview, reasons: riskReasons, decision: riskDecision }
}

async function createCommissionRecord(orderType, order) {
  try {
    if (!order.ownerId) {return}
    // users._id = openid，直接 doc 查询
    let user = null
    try {
      const userRes = await db.collection('users').doc(order.ownerId).field({ _id: true, inviterId: true }).get()
      user = userRes.data
    } catch (e) {
      logger.warn('commission.users.fetch', { ownerId: order.ownerId, code: e.errCode, msg: e.message })
      return
    }
    if (!user || !user.inviterId) {return}
    let config = {}
    try {
      const configRes = await db.collection('system_config').doc('commission_rates').get()
      config = configRes.data || {}
    } catch (e) {
      logger.warn('commission.system_config', { code: e.errCode, msg: e.message })
      return
    }
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
    } catch (e) {
      logger.warn('commission.inviter.fetch', { inviterId: user.inviterId, code: e.errCode, msg: e.message })
      return
    }
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
  } catch (e) { logger.error('commission_error', e) }
}

const ACTIVITY_LIST_FIELDS = {
  _id: true, title: true, coverUrl: true, startTime: true, endTime: true,
  location: true, latitude: true, longitude: true, category: true,
  price: true, pricePerPerson: true, pricePerPet: true,
  maxParticipants: true, currentParticipants: true, status: true, createdBy: true, createdAt: true, organizer: true,
}

const REGISTRATION_LIST_FIELDS = {
  _id: true, activityId: true, openid: true, phone: true, status: true,
  totalAmount: true, createdAt: true,
}

const handlers = {
  getActivityList,
  getActivityDetail,
  createActivity,
  updateActivity,
  deleteActivity,
  submitRegistration,
  getRegistrationDetail,
  getRegistrationList,
  createActivityPaymentOrder,
  confirmActivityPayment,
  getActivityRegistrations,
  exportActivityRegistrations,
  getActivityOrders,
}

exports.main = async (event, context) => {
  const { action } = event
  if (!action || !handlers[action]) {
    throw err('INVALID_PARAMS', '无效的操作类型')
  }

  const WRITE_ACTIONS = ['createActivity', 'updateActivity', 'deleteActivity', 'submitRegistration', 'createActivityPaymentOrder', 'confirmActivityPayment']
  const LOGIN_REQUIRED_ACTIONS = [...WRITE_ACTIONS, 'getActivityDetail', 'getRegistrationDetail', 'getRegistrationList', 'getActivityRegistrations', 'exportActivityRegistrations', 'getActivityOrders']
  const requireLogin = LOGIN_REQUIRED_ACTIONS.includes(action)

  try {
    const auth = await verifyAuth(event, { requireLogin })
    logger.info(action, { openid: auth.openid })
    return await handlers[action](event, context, auth)
  } catch (error) {
    logger.error(action, error)
    const code = error.code || ERROR_CODES.BUSINESS
    return handleError(error, error.message, code)
  }
}

async function autoUpdateActivityStatus() {
  try {
    const now = new Date()
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000)
    const bjTime = new Date(utc + (8 * 3600000))
    const nowStr = `${bjTime.getFullYear()}-${
      String(bjTime.getMonth() + 1).padStart(2, '0')}-${
      String(bjTime.getDate()).padStart(2, '0')} ${
      String(bjTime.getHours()).padStart(2, '0')}:${
      String(bjTime.getMinutes()).padStart(2, '0')}`

    const stoppedRes = await db.collection('activities')
      .where({ status: 'published', startTime: _.lte(nowStr) })
      .update({ data: { status: 'registration_stopped', updatedAt: db.serverDate() } })
    if (stoppedRes.updated > 0) {
      logger.info('autoUpdate.stopped', { updated: stoppedRes.updated })
    }

    const endedRes = await db.collection('activities')
      .where({ status: _.in(['published', 'registration_stopped']), endTime: _.lte(nowStr) })
      .update({ data: { status: 'ended', updatedAt: db.serverDate() } })
    if (endedRes.updated > 0) {
      logger.info('autoUpdate.ended', { updated: endedRes.updated })
    }
  } catch (e) {
    logger.error('autoUpdate', e)
  }
}

async function getActivityList(event, context, auth) {
  const { page = 1, pageSize = 10, status } = event
  const safePageSize = Math.min(Math.max(1, Number(pageSize) || 10), 100)
  logger.info('getActivityList.query', { page, pageSize: safePageSize, status })

  await autoUpdateActivityStatus()

  const where = {}
  if (status && status !== 'all') {
    where.status = status
  } else {
    where.status = _.neq('deleted')
  }

  const result = await paginate(db, 'activities', {
    page, pageSize: safePageSize, where,
    projection: ACTIVITY_LIST_FIELDS,
    orderBy: { field: 'createdAt', direction: 'desc' },
  })

  result.list.forEach(activity => {
    const avatar = activity.organizer && activity.organizer.avatar
    if (avatar && !avatar.startsWith('cloud://') && !avatar.startsWith('https://')) {
      activity.organizer.avatar = ''
      activity.organizer._avatarInvalid = true
    }
  })

  const invalidAvatarActivities = result.list.filter(a => a.organizer && a.organizer._avatarInvalid && a.createdBy)
  if (invalidAvatarActivities.length > 0) {
    const creatorOpenids = [...new Set(invalidAvatarActivities.map(a => a.createdBy))]
    try {
      const adminRes = await db.collection('admins').where({ _id: _.in(creatorOpenids) }).field({ avatarUrl: true, nickName: true }).get()
      const adminMap = {}
      ;(adminRes.data || []).forEach(a => { adminMap[a._id] = a })
      invalidAvatarActivities.forEach(activity => {
        const admin = adminMap[activity.createdBy]
        if (admin && admin.avatarUrl && (admin.avatarUrl.startsWith('cloud://') || admin.avatarUrl.startsWith('https://'))) {
          activity.organizer.avatar = admin.avatarUrl
          if (admin.nickName && activity.organizer.name === '宠团团') {
            activity.organizer.name = admin.nickName
          }
        }
        delete activity.organizer._avatarInvalid
      })
    } catch (e) {
      invalidAvatarActivities.forEach(a => delete a.organizer._avatarInvalid)
    }
  }

  logger.info('getActivityList.result', { total: result.total, listCount: result.list.length })

  let myRegistrations = []
  if (auth.openid) {
    const regRes = await db.collection('activity_registrations')
      .where({ ownerId: auth.openid, status: 'confirmed' })
      .field({ activityId: true })
      .get()
    myRegistrations = regRes.data.map(r => r.activityId)
  }

  result.list = result.list.map(activity => ({
    ...activity,
    joined: myRegistrations.includes(activity._id),
  }))

  return handleSuccess(result, '获取成功')
}

async function getActivityDetail(event, context, auth) {
  const { activityId } = event
  if (!activityId) {throw err('INVALID_PARAMS', '缺少活动ID')}

  try {
    const res = await db.collection('activities').doc(activityId).get()

    let isRegistered = false
    if (auth.openid) {
      const regRes = await db.collection('activity_registrations')
        .where({
          activityId,
          ownerId: auth.openid,
          status: 'confirmed',
        })
        .count()
      isRegistered = regRes.total > 0
    }

    const result = {
      ...res.data,
      isRegistered,
    }

    if (result.organizer && result.organizer.avatar) {
      const avatar = result.organizer.avatar
      if (!avatar.startsWith('cloud://') && !avatar.startsWith('https://')) {
        result.organizer.avatar = ''
        if (result.createdBy) {
          try {
            let admin = null
            try {
              const adminRes = await db.collection('admins').doc(result.createdBy).field({ avatarUrl: true, nickName: true }).get()
              admin = adminRes.data
            } catch (e) {
              logger.warn('getActivityDetail.admins.fetch', { createdBy: result.createdBy, code: e.errCode, msg: e.message })
            }
            if (admin && admin.avatarUrl && (admin.avatarUrl.startsWith('cloud://') || admin.avatarUrl.startsWith('https://'))) {
              result.organizer.avatar = admin.avatarUrl
              if (admin.nickName && result.organizer.name === '宠团团') {
                result.organizer.name = admin.nickName
              }
            }
          } catch (e) {
            logger.warn('getActivityDetail.organizer.fill', { createdBy: result.createdBy, code: e.errCode, msg: e.message })
          }
        }
      }
    }

    if (res.data.createdBy && result.organizer) {
      try {
        const countRes = await db.collection('activities')
          .where({ createdBy: res.data.createdBy, status: _.in(['published', 'ongoing', 'ended']) })
          .count()
        result.organizer.activityCount = countRes.total || 0
      } catch (e) {
        logger.warn('queryHostActivities', e)
        result.organizer.activityCount = 0
      }
    }

    return handleSuccess(result, '获取成功')
  } catch (error) {
    return handleError(error, '活动不存在', ERROR_CODES.NOT_FOUND)
  }
}

async function createActivity(event, context, auth) {
  const { openid } = auth
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  const { title, description, coverUrl, startTime, endTime, location, latitude, longitude, maxParticipants, category, price } = event
  if (!title) {throw err('INVALID_PARAMS', '缺少活动标题')}

  let organizer = null
  try {
    const userRes = await db.collection('users').doc(openid).get()
    organizer = userRes.data
  } catch (e) {}

  const activity = {
    title,
    description: description || '',
    coverUrl: coverUrl || '',
    images: event.images || [],
    startTime: startTime || '',
    endTime: endTime || '',
    location: location || '',
    latitude: event.latitude || null,
    longitude: event.longitude || null,
    maxParticipants: maxParticipants || 0,
    currentParticipants: 0,
    category: category || 'outdoor',
    price: (Number(event.pricePerPerson) || 0) + (Number(event.pricePerPet) || 0) || Number(event.price) || 0,
    pricePerPerson: Number(event.pricePerPerson) || 0,
    pricePerPet: Number(event.pricePerPet) || 0,
    contactName: event.contactName || '',
    contactPhone: event.contactPhone || '',
    wechatId: event.wechatId || '',
    status: event.status || 'draft',
    createdBy: openid,
    organizer: organizer ? {
      name: organizer.nickName || '宠团团',
      avatar: organizer.avatarUrl || '/images/default-avatar.svg',
    } : { name: '宠团团', avatar: '/images/default-avatar.svg' },
    createdAt: db.serverDate(),
    updatedAt: db.serverDate(),
  }

  activity._id = generateId('activity', auth.openid)
  const res = await db.collection('activities').add({ data: activity })
  return handleSuccess({ id: res._id }, '创建成功')
}

async function updateActivity(event, context, auth) {
  const { activityId } = event
  const { openid } = auth
  if (!activityId) {throw err('INVALID_PARAMS', '缺少活动ID')}
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  const updateData = { updatedAt: db.serverDate(), ...filterFields(FIELD_WHITELISTS.activity, event) }

  const existRes = await db.collection('activities').doc(activityId).get()
  if (existRes.data.createdBy !== openid) {
    try {
      await checkPartnerPermission(openid, 'activity')
    } catch (e) {
      throw err('PERMISSION_DENIED', '无权修改此活动')
    }
  }

  await db.collection('activities').doc(activityId).update({ data: updateData })
  return handleSuccess(null, '更新成功')
}

async function deleteActivity(event, context, auth) {
  const { activityId } = event
  const { openid } = auth
  if (!activityId) {throw err('INVALID_PARAMS', '缺少活动ID')}
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  const existRes = await db.collection('activities').doc(activityId).get()
  if (!existRes.data) {throw err('ACTIVITY_NOT_FOUND', '活动不存在')}

  if (existRes.data.status === 'published') {
    throw err('INVALID_PARAMS', '已发布的活动不能删除')
  }

  if (existRes.data.createdBy !== openid) {
    try {
      await checkPartnerPermission(openid, 'activity')
    } catch (e) {
      throw err('PERMISSION_DENIED', '无权删除此活动')
    }
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

async function submitRegistration(event, context, auth) {
  const { openid } = auth
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  const { activityId, pets, phone, notes, friends, petIds, totalAmount, originalAmount, couponId, couponDiscount, participantCount } = event
  if (!activityId) {throw err('INVALID_PARAMS', '缺少活动ID')}
  if (!pets || pets.length === 0) {throw err('INVALID_PARAMS', '请选择参与的宠物')}
  if (!phone) {throw err('INVALID_PARAMS', '请填写联系电话')}

  const transaction = await db.startTransaction()

  try {
    const activityRes = await db.collection('activities').doc(activityId).get()
    if (!activityRes.data) {
      await transaction.rollback()
      throw err('NOT_FOUND', '活动不存在')
    }

    if (activityRes.data.maxParticipants && activityRes.data.currentParticipants >= activityRes.data.maxParticipants) {
      await transaction.rollback()
      throw err('BUSINESS_ERROR', '报名人数已满')
    }

    const existReg = await db.collection('activity_registrations')
      .where({ activityId, openid, status: 'confirmed' })
      .count()
    if (existReg.total > 0) {
      await transaction.rollback()
      throw err('BUSINESS_ERROR', '您已报名此活动')
    }

    const activity = activityRes.data
    const pricePerPerson = activity.pricePerPerson || 0
    const pricePerPet = activity.pricePerPet || 0
    const pCount = participantCount || 1
    const petCount = pets.length + (friends ? friends.length : 0)
    const calculatedAmount = pricePerPerson * pCount + pricePerPet * petCount

    // Sprint 22: 活动报名前先做大额风控
    //   - 元 → 分（风控模块以分为单位）
    //   - reject → 抛 RISK_REJECT
    //   - review → pendingReview=true，正常落库
    const applyRisk = await performActivityApplyRiskCheck({
      openid,
      activityId,
      amountFen: Math.round(calculatedAmount * 100),
    })

    const isPaid = calculatedAmount > 0
    const now = db.serverDate()
    const registration = {
      activityId,
      ownerId: openid,
      pets: pets.map(p => ({
        name: p.petName || p.name || '',
        gender: p.petGender || p.gender || 'male',
        breed: p.petBreed || p.breed || '',
        petId: p.petId || '',
      })),
      petIds: petIds || [],
      phone: phone || '',
      notes: notes || '',
      friends: friends || [],
      status: isPaid ? 'pending_payment' : 'confirmed',
      participantCount: pCount,
      petCount,
      pricePerPerson,
      pricePerPet,
      totalAmount: calculatedAmount,
      originalAmount: originalAmount || calculatedAmount,
      couponId: couponId || '',
      couponDiscount: couponDiscount || 0,
      finalAmount: totalAmount,
      // Sprint 22: 标记风控抽检状态
      pendingReview: applyRisk.pendingReview,
      riskDecision: applyRisk.decision,
      riskReasons: applyRisk.reasons,
      createdAt: now,
      updatedAt: now,
    }

    registration._id = generateId('registration', openid)
    const regResult = await transaction.collection('activity_registrations').add({ data: registration })

    if (!isPaid) {
      await transaction.collection('activities').doc(activityId).update({
        data: {
          currentParticipants: _.inc(pCount),
          updatedAt: db.serverDate(),
        },
      })
    }

    try {
      let user = null
      try {
        const userRes = await db.collection('users').doc(openid).get()
        user = userRes.data
      } catch (e) {
        logger.warn('submitRegistration.users.fetch', { openid, code: e.errCode, msg: e.message })
      }

      const activityOrder = {
        ownerId: openid,
        orderType: 'activity',
        activityId,
        activityTitle: activity.title || '',
        activityCoverUrl: activity.coverUrl || '',
        activityStartTime: activity.startTime || '',
        activityEndTime: activity.endTime || '',
        activityLocation: activity.location || '',
        organizerId: activity.createdBy || '',
        petIds: petIds || [],
        petsInfo: registration.pets,
        startDate: activity.startTime || '',
        endDate: activity.endTime || '',
        duration: 1,
        pricePerDay: activity.price || 0,
        participantCount: pCount,
        petCount,
        pricePerPerson,
        pricePerPet,
        basicPrice: calculatedAmount,
        totalPrice: totalAmount || calculatedAmount,
        originalAmount: originalAmount || calculatedAmount,
        couponId: couponId || '',
        couponDiscount: couponDiscount || 0,
        phone: phone || '',
        notes: notes || '',
        status: isPaid ? 'pending_payment' : 'confirmed',
        ownerInfo: user ? { nickName: user.nickName, avatarUrl: user.avatarUrl, phone } : { phone },
        createdAt: now,
        updatedAt: now,
      }

      await transaction.collection('orders').add({ data: activityOrder })
    } catch (orderErr) {
      logger.warn('创建活动订单记录失败:', orderErr)
    }

    await transaction.commit()
    return handleSuccess({ id: regResult._id || 'ok', registrationId: regResult._id }, '报名成功')
  } catch (error) {
    await transaction.rollback()
    return handleError(error, '报名失败', ERROR_CODES.DATA)
  }
}

async function getRegistrationDetail(event, context, auth) {
  const { openid } = auth
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  const { registrationId } = event
  if (!registrationId) {throw err('INVALID_PARAMS', '缺少订单ID')}

  try {
    let registration = null

    try {
      const regRes = await db.collection('activity_registrations').doc(registrationId).get()
      if (regRes.data && regRes.data.ownerId === openid) {
        registration = regRes.data
      }
    } catch (e) {
      logger.warn('getRegistrationDetail.activity_registrations.fetch', { registrationId, code: e.errCode, msg: e.message })
    }

    if (!registration) {
      try {
        const orderRes = await db.collection('orders').doc(registrationId).get()
        if (orderRes.data) {
          const order = orderRes.data
          if (order.ownerId === openid) {
            const regQuery = await db.collection('activity_registrations')
              .where({ activityId: order.activityId, ownerId: openid })
              .limit(1).get()
            if (regQuery.data && regQuery.data.length > 0) {
              registration = regQuery.data[0]
            } else {
              registration = {
                _id: order._id,
                activityId: order.activityId,
                openid,
                pets: order.petsInfo || [],
                phone: order.phone || '',
                notes: order.notes || '',
                participantCount: order.participantCount || 1,
                petCount: order.petCount || 0,
                totalAmount: order.totalPrice || order.basicPrice || 0,
                originalAmount: order.originalAmount || order.totalPrice || 0,
                couponId: order.couponId || '',
                couponDiscount: order.couponDiscount || 0,
                finalAmount: order.totalPrice || 0,
                status: order.status,
                createdAt: order.createdAt,
              }
            }
          } else {
            throw err('AUTH_REQUIRED', '无权查看此订单')
          }
        }
      } catch (e) {
        logger.warn('getRegistrationDetail.orders.lookup', { registrationId, code: e.errCode, msg: e.message })
      }
    }

    if (!registration) {
      throw err('NOT_FOUND', '订单不存在')
    }

    let activityInfo = null
    try {
      const activityRes = await db.collection('activities').doc(registration.activityId).get()
      if (activityRes.data) {
        activityInfo = {
          title: activityRes.data.title || '',
          coverUrl: activityRes.data.coverUrl || '',
          startTime: activityRes.data.startTime || '',
          endTime: activityRes.data.endTime || '',
          location: activityRes.data.location || '',
          pricePerPerson: activityRes.data.pricePerPerson || 0,
          pricePerPet: activityRes.data.pricePerPet || 0,
        }
      }
    } catch (e) {
      logger.warn('getRegistrationDetail: 获取活动信息失败', e.message)
    }

    return handleSuccess({
      registration,
      activityInfo,
    }, '获取成功')
  } catch (error) {
    logger.error('getRegistrationDetail', error)
    return handleError(error, '获取报名详情失败', ERROR_CODES.BUSINESS)
  }
}

async function getRegistrationList(event, context, auth) {
  const { openid } = auth
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  const { page = 1, pageSize = 20, activityId, status } = event
  const where = { openid }
  if (activityId) {where.activityId = activityId}
  if (status) {where.status = status}

  const result = await paginate(db, 'activity_registrations', {
    page, pageSize: Math.min(pageSize, 20), where, projection: REGISTRATION_LIST_FIELDS,
    orderBy: { field: 'createdAt', direction: 'desc' },
  })

  const activityIds = [...new Set(result.list.map(r => r.activityId))]
  if (activityIds.length > 0) {
    const activitiesRes = await db.collection('activities')
      .where({ _id: _.in(activityIds) })
      .get()

    const activityMap = {}
    activitiesRes.data.forEach(a => { activityMap[a._id] = a })

    const regMap = {}
    result.list.forEach(r => { regMap[r.activityId] = r })

    let activities = activityIds
      .map(id => activityMap[id])
      .filter(a => a)
      .map(a => {
        const reg = regMap[a._id]
        return { ...a, joined: true, _registrationId: reg ? reg._id : a._id, regStatus: reg ? reg.status : '', regCreatedAt: reg ? reg.createdAt : a.createdAt }
      })

    if (status === 'active') {
      const now = new Date()
      const utc = now.getTime() + (now.getTimezoneOffset() * 60000)
      const bjTime = new Date(utc + (8 * 3600000))
      const nowStr = `${bjTime.getFullYear()}-${
        String(bjTime.getMonth() + 1).padStart(2, '0')}-${
        String(bjTime.getDate()).padStart(2, '0')} ${
        String(bjTime.getHours()).padStart(2, '0')}:${
        String(bjTime.getMinutes()).padStart(2, '0')}`

      activities = activities.filter(a => {
        if (a.status === 'ended' || a.status === 'cancelled' || a.status === 'deleted') {return false}
        if (a.endTime) {
          const end = new Date(String(a.endTime).replace(/-/g, '/'))
          if (!isNaN(end.getTime()) && end <= now) {return false}
        }
        return true
      })
      result.total = activities.length
    }

    const invalidAvatarList = []
    for (const activity of activities) {
      if (activity.organizer && activity.organizer.avatar) {
        const avatar = activity.organizer.avatar
        if (!avatar.startsWith('cloud://') && !avatar.startsWith('https://')) {
          activity.organizer.avatar = ''
          if (activity.createdBy) {invalidAvatarList.push(activity)}
        }
      }
    }

    if (invalidAvatarList.length > 0) {
      const creatorOpenids = [...new Set(invalidAvatarList.map(a => a.createdBy))]
      try {
        const adminRes = await db.collection('admins').where({ _id: _.in(creatorOpenids) }).field({ avatarUrl: true, nickName: true }).get()
        const adminMap = {}
        ;(adminRes.data || []).forEach(a => { adminMap[a._id] = a })
        invalidAvatarList.forEach(activity => {
          const admin = adminMap[activity.createdBy]
          if (admin && admin.avatarUrl && (admin.avatarUrl.startsWith('cloud://') || admin.avatarUrl.startsWith('https://'))) {
            activity.organizer.avatar = admin.avatarUrl
            if (admin.nickName && activity.organizer.name === '宠团团') {
              activity.organizer.name = admin.nickName
            }
          }
        })
      } catch (e) {
        logger.warn('getRegistrationList.admins.fetch', { count: creatorOpenids.length, code: e.errCode, msg: e.message })
      }
    }

    result.list = activities

  } else {
    result.list = []
  }

  return handleSuccess(result, '获取成功')
}

async function createActivityPaymentOrder(event, context, auth) {
  const { openid } = auth
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  const { activityId, pets, phone, notes, friends, petIds, totalAmount, originalAmount, couponId, couponDiscount, orderId } = event
  if (!activityId) {throw err('INVALID_PARAMS', '缺少活动ID')}
  if (!pets || pets.length === 0) {throw err('INVALID_PARAMS', '请选择参与的宠物')}
  if (!phone) {throw err('INVALID_PARAMS', '请填写联系电话')}
  if (totalAmount <= 0) {throw err('INVALID_PARAMS', '金额异常')}

  try {
    const activityRes = await db.collection('activities').doc(activityId).get()
    if (!activityRes.data) {
      throw err('NOT_FOUND', '活动不存在')
    }

    const activity = activityRes.data
    if (activity.maxParticipants && activity.currentParticipants >= activity.maxParticipants) {
      throw err('BUSINESS_ERROR', '报名人数已满')
    }

    const existReg = await db.collection('activity_registrations')
      .where({ activityId, ownerId: openid, status: _.in(['confirmed', 'pending_payment']) })
      .count()
    if (existReg.total > 0) {
      throw err('BUSINESS_ERROR', '您已报名此活动')
    }

    const now = db.serverDate()
    const pendingRegistration = {
      activityId,
      ownerId: openid,
      orderId,
      pets: pets.map(p => ({
        name: p.petName || p.name || '',
        gender: p.petGender || p.gender || 'male',
        breed: p.petBreed || p.breed || '',
        petId: p.petId || '',
      })),
      petIds: petIds || [],
      phone: phone || '',
      notes: notes || '',
      friends: friends || [],
      status: 'pending_payment',
      totalAmount,
      originalAmount: originalAmount || totalAmount,
      couponId: couponId || '',
      couponDiscount: couponDiscount || 0,
      finalAmount: totalAmount,
      createdAt: now,
      updatedAt: now,
    }

    pendingRegistration._id = generateId('registration', openid)
    const regResult = await db.collection('activity_registrations').add({ data: pendingRegistration })

    const orderDoc = {
      ownerId: openid,
      orderType: 'activity',
      orderId,
      activityId,
      activityTitle: activity.title || '',
      activityCoverUrl: activity.coverUrl || '',
      activityStartTime: activity.startTime || '',
      activityEndTime: activity.endTime || '',
      activityLocation: activity.location || '',
      organizerId: activity.createdBy || '',
      petIds: petIds || [],
      petsInfo: pendingRegistration.pets,
      startDate: activity.startTime || '',
      endDate: activity.endTime || '',
      duration: 1,
      pricePerDay: activity.price || 0,
      petCount: pets.length,
      basicPrice: totalAmount,
      totalPrice: totalAmount,
      originalAmount: originalAmount || totalAmount,
      couponId: couponId || '',
      couponDiscount: couponDiscount || 0,
      phone: phone || '',
      notes: notes || '',
      status: 'pending_payment',
      paymentStatus: 'pending',
      createdAt: now,
      updatedAt: now,
    }

    await db.collection('orders').add({ data: orderDoc })

    const paymentParams = await _createPaymentParams(openid, orderId, totalAmount, activity.title || '活动报名')

    return handleSuccess({
      orderId,
      registrationId: regResult._id,
      paymentParams,
    }, '订单创建成功')
  } catch (error) {
    return handleError(error, '创建订单失败', ERROR_CODES.DATA)
  }
}

async function confirmActivityPayment(event, context, auth) {
  const { openid } = auth
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  const { orderId } = event
  if (!orderId) {throw err('INVALID_PARAMS', '缺少订单ID')}

  const transaction = await db.startTransaction()

  try {
    const orderRes = await db.collection('orders').where({ orderId, ownerId: openid }).get()
    if (!orderRes.data || orderRes.data.length === 0) {
      await transaction.rollback()
      throw err('NOT_FOUND', '订单不存在')
    }

    const order = orderRes.data[0]
    if (order.status !== 'pending_payment') {
      await transaction.rollback()
      throw err('BUSINESS_ERROR', '订单状态异常')
    }

    const now = db.serverDate()

    await transaction.collection('orders').doc(order._id).update({
      data: { status: 'confirmed', paymentStatus: 'paid', paidAt: now, updatedAt: now },
    })

    await transaction.collection('activity_registrations')
      .where({ orderId, openid, status: 'pending_payment' })
      .update({
        data: { status: 'confirmed', updatedAt: now },
      })

    await transaction.collection('activities').doc(order.activityId).update({
      data: {
        currentParticipants: _.inc(order.petCount || 1),
        updatedAt: now,
      },
    })

    await transaction.commit()

    await createCommissionRecord('activity', order)

    return handleSuccess({ orderId }, '支付成功')
  } catch (error) {
    await transaction.rollback()
    return handleError(error, '支付确认失败', ERROR_CODES.DATA)
  }
}

async function _createPaymentParams(openid, orderId, amount, description) {
  const wxContext = cloud.getWXContext()
  const mchId = cloud.env.MERCHANT_ID || process.env.MERCHANT_ID

  if (!mchId) {
    throw new Error('商户号未配置')
  }

  const nonceStr = Math.random().toString(36).substr(2, 15)
  const timestamp = String(Math.floor(Date.now() / 1000))
  const body = description
  const totalFee = Math.round(amount * 100)

  const outTradeNo = orderId
  const notifyUrl = `https://${cloud.env}-1300000000.ap-shanghai.tencentscf.com/payment/notify`
  const spbillCreateIp = '127.0.0.1'
  const tradeType = 'JSAPI'

  const signStr = `appid=${wxContext.APPID}&body=${body}&mch_id=${mchId}&nonce_str=${nonceStr}&notify_url=${notifyUrl}&openid=${openid}&out_trade_no=${outTradeNo}&spbill_create_ip=${spbillCreateIp}&total_fee=${totalFee}&trade_type=${tradeType}`

  const crypto = require('crypto')
  const paySign = crypto.createHash('md5').update(`${signStr}&key=${cloud.env.MERCHANT_KEY || process.env.MERCHANT_KEY}`).digest('hex').toUpperCase()

  const unifiedOrderXml = `<xml>
    <appid>${wxContext.APPID}</appid>
    <body>${body}</body>
    <mch_id>${mchId}</mch_id>
    <nonce_str>${nonceStr}</nonce_str>
    <notify_url>${notifyUrl}</notify_url>
    <openid>${openid}</openid>
    <out_trade_no>${outTradeNo}</out_trade_no>
    <spbill_create_ip>${spbillCreateIp}</spbill_create_ip>
    <total_fee>${totalFee}</total_fee>
    <trade_type>${tradeType}</trade_type>
    <sign>${paySign}</sign>
  </xml>`

  try {
    const https = require('https')
    const result = await new Promise((resolve, reject) => {
      const req = https.request(`${ENDPOINTS.WECHAT_PAY_API_BASE}${ENDPOINTS.WECHAT_PAY_UNIFIEDORDER}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/xml' },
      }, res => {
        let data = ''
        res.on('data', chunk => { data += chunk })
        res.on('end', () => resolve(data))
      })
      req.on('error', reject)
      req.write(unifiedOrderXml)
      req.end()
    })

    const parseXml = require('xml2js').parseString
    const xmlResult = await new Promise((resolve, reject) => {
      parseXml(result, { explicitArray: false }, (e, parsed) => { if (e) { reject(e) } else { resolve(parsed) } })
    })

    if (xmlResult.xml.return_code === 'SUCCESS' && xmlResult.xml.result_code === 'SUCCESS') {
      const prepayId = xmlResult.xml.prepay_id
      const jsNounceStr = Math.random().toString(36).substr(2, 15)
      const jsTimestamp = String(Math.floor(Date.now() / 1000))
      const jsPackage = `prepay_id=${prepayId}`

      const jsSignStr = `appid=${wxContext.APPID}&noncestr=${jsNounceStr}&package=${jsPackage}&signType=MD5&timeStamp=${jsTimestamp}`
      const jsPaySign = crypto.createHash('md5').update(`${jsSignStr}&key=${cloud.env.MERCHANT_KEY || process.env.MERCHANT_KEY}`).digest('hex').toUpperCase()

      return {
        timeStamp: jsTimestamp,
        nonceStr: jsNounceStr,
        package: jsPackage,
        signType: 'MD5',
        paySign: jsPaySign,
      }
    } else {
      throw new Error(xmlResult.xml.err_code_des || xmlResult.xml.return_msg || '统一下单失败')
    }
  } catch (e) {
    logger.error('创建支付参数失败:', e)
    throw new Error(`创建支付参数失败: ${e.message}`)
  }
}

async function checkPartnerPermission(openid, permission) {
  const adminRes = await db.collection('admins')
    .where({ _id: openid, status: 'active' })
    .limit(1).get()
  if (!adminRes.data || adminRes.data.length === 0) {
    throw err('PARTNER_REQUIRED', '无合作伙伴权限')
  }
  const admin = adminRes.data[0]
  const roles = admin.roles || []
  if (roles.includes('super_admin')) {return admin}
  const perms = admin.permissions || []
  if (!perms.includes(permission)) {
    throw err('PERMISSION_DENIED', `权限不足：需要 ${permission} 权限`)
  }
  return admin
}

async function getActivityRegistrations(event, context, auth) {
  const { openid } = auth
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  const { activityId, page = 1, pageSize = 20 } = event
  if (!activityId) {throw err('INVALID_PARAMS', '缺少活动ID')}

  await checkPartnerPermission(openid, 'activity')

  const safePageSize = Math.min(Math.max(1, Number(pageSize) || 20), 100)

  const result = await paginate(db, 'activity_registrations', {
    page, pageSize: safePageSize,
    where: { activityId },
    orderBy: { field: 'createdAt', direction: 'desc' },
  })

  if (result.list && result.list.length > 0) {
    const openids = result.list.map(r => r.ownerId).filter(Boolean)
    if (openids.length > 0) {
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
        }
      })
    } else {
      result.list = result.list.map(r => ({
        ...r,
        userNickName: '',
        userAvatar: '',
        displayName: '未知用户',
      }))
    }
  }

  return handleSuccess(result, '获取成功')
}

async function exportActivityRegistrations(event, context, auth) {
  const { openid } = auth
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  const { activityId } = event
  if (!activityId) {throw err('INVALID_PARAMS', '缺少活动ID')}

  await checkPartnerPermission(openid, 'activity')

  const activityRes = await db.collection('activities').doc(activityId).get()
  if (!activityRes.data) {
    throw err('NOT_FOUND', '活动不存在')
  }

  const registrationsRes = await db.collection('activity_registrations')
    .where({ activityId })
    .orderBy('createdAt', 'desc')
    .get()

  let registrations = registrationsRes.data || []

  if (registrations.length > 0) {
    const openids = registrations.map(r => r.ownerId).filter(Boolean)
    if (openids.length > 0) {
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
    reg.createdAt ? new Date(reg.createdAt).toLocaleString('zh-CN') : '',
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
  const { openid } = auth
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  await checkPartnerPermission(openid, 'activity')

  const { status, page = 1, pageSize = 20 } = event
  const safePageSize = Math.min(Math.max(1, Number(pageSize) || 20), 100)

  const where = { orderType: 'activity' }
  if (status) {where.status = status}

  const result = await paginate(db, 'orders', {
    page, pageSize: safePageSize,
    where,
    orderBy: { field: 'createdAt', direction: 'desc' },
  })

  const list = result.list || []
  const enrichedList = list.map(order => ({
    ...order,
    buyerNickName: order.ownerInfo?.nickName || order.ownerName || '',
    productName: order.activityTitle || '',
  }))

  return handleSuccess({ ...result, list: enrichedList }, '获取成功')
}
