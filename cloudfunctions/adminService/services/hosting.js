const { err } = require('../common/errors')
const { handleSuccess, handleError, ERROR_CODES, paginate } = require('../common/utils')
const { initCloud } = require('../common/utils')
const { createLogger } = require('../common/logger')
const { enrichBuyerFields } = require('./_enrichBuyers')
const { filterFields, FIELD_WHITELISTS } = require('../common/validator')
const { BOARDING_ORDER_TRANSITIONS, BOARDING_STATUS_MAP, validateTransition } = require('./stateMachine')
const { createCommissionRecord } = require('./commission')

const { db } = initCloud()
const _ = db.command
const logger = createLogger('adminService.hosting')

async function enrichAdminOrder(order) {
  if (!order) {return order}

  const enriched = { ...order }

  // 优先使用冗余信息
  if (enriched.ownerInfo) {
    enriched.ownerName = enriched.ownerName || enriched.ownerInfo.nickName || ''
    enriched.ownerPhone = enriched.ownerPhone || enriched.ownerInfo.phone || ''
  }
  if (enriched.hostInfo) {
    enriched.hostName = enriched.hostName || enriched.hostInfo.hostName || ''
    enriched.hostPhone = enriched.hostPhone || enriched.hostInfo.phone || ''
  }
  if (enriched.petsInfo && enriched.petsInfo.length > 0) {
    enriched.pets = enriched.petsInfo
  }

  // 如果没有冗余信息，尝试关联查询
  // 关联宠物数据
  if (!enriched.pets && order.petIds && order.petIds.length > 0) {
    try {
      const petRes = await db.collection('pets').where({ _id: _.in(order.petIds) }).get()
      const petMap = {}
      petRes.data.forEach(p => { petMap[p._id] = p })
      enriched.pets = order.petIds.map(id => petMap[id]).filter(Boolean)
    } catch (e) {
      logger.error('getPet', e)
      enriched.pets = []
    }
  }

  // 关联主人信息
  if (!enriched.ownerName && !enriched.ownerPhone && order.ownerId) {
    try {
      const userRes = await db.collection('users').doc(order.ownerId)
        .field({ _id: true, nickName: true, phone: true })
        .get()
      if (userRes.data) {
        enriched.ownerName = enriched.ownerName || userRes.data.nickName || ''
        enriched.ownerPhone = enriched.ownerPhone || userRes.data.phone || ''
      }
    } catch (e) {
      logger.error('getOwner', e)
    }
  }

  // 关联寄养家庭信息
  if (!enriched.hostName && !enriched.hostPhone && order.hostId) {
    try {
      const hostRes = await db.collection('hostProfiles').doc(order.hostId).get()
      if (hostRes.data) {
        enriched.hostName = hostRes.data.hostName || hostRes.data.name || ''
        enriched.hostPhone = hostRes.data.phone || ''
      }
    } catch (e) {
      logger.error('getHost', e)
    }
  }

  // 字段映射适配前端展示
  enriched.days = enriched.duration
  enriched.notes = enriched.note
  enriched.price = enriched.totalPrice

  return enriched
}

async function getBoardingOrders(event, context, auth) {
  const { status, page = 1, pageSize = 20, startDate, endDate } = event
  const where = {}
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
  where.type = _.nin(['mall', 'group_buy'])
  where.orderType = _.nin(['activity'])

  if (!auth.roles?.includes('super_admin') && !auth.permissions?.includes('hosting')) {
    let hostProfileRes
    try {
      hostProfileRes = await db.collection('hostProfiles').doc(auth.openid).get()
      where.hostId = hostProfileRes.data._id
    } catch (e) {
      logger.warn('getBoardingOrders.hostProfiles.fetch', { openid: auth.openid, code: e.errCode, msg: e.message })
    }
  }

  const result = await paginate(db, 'orders', { page, pageSize, where })

  const list = result.list || []

  // 1) 优先用本集合 ownerInfo 快照补充 host/owner 名称
  const partialEnriched = list.map(order => {
    const enriched = { ...order }

    if (enriched.ownerInfo) {
      enriched.ownerName = enriched.ownerName || enriched.ownerInfo.nickName || ''
      enriched.ownerPhone = enriched.ownerPhone || enriched.ownerInfo.phone || ''
    }
    if (enriched.hostInfo) {
      enriched.hostName = enriched.hostName || enriched.hostInfo.hostName || ''
      enriched.hostPhone = enriched.hostPhone || enriched.hostInfo.phone || ''
    }

    enriched.orderNo = enriched.orderNo || enriched._id || ''
    enriched.productName = enriched.hostName ? `寄养 - ${enriched.hostName}` : '寄养服务'
    enriched.totalAmount = enriched.totalAmount || enriched.totalPrice || enriched.basicPrice || 0

    return enriched
  })

  // 2) 缺失的 buyerNickName / buyerPhone 走 users 表 join（按 ownerId）
  const enrichedList = await enrichBuyerFields(db, partialEnriched)

  return handleSuccess({ ...result, list: enrichedList })
}

async function getBoardingOrderDetail(event, context, auth) {
  const { orderId } = event
  if (!orderId) {throw err('INVALID_PARAMS', '缺少订单ID')}
  const res = await db.collection('orders').doc(orderId).get()
  if (!res.data) {throw err('NOT_FOUND', '订单不存在')}

  const order = await enrichAdminOrder(res.data)

  return handleSuccess(order)
}

async function handleBoardingOrder(event, context, auth) {
  const { orderId, operation } = event
  if (!orderId) {throw err('INVALID_PARAMS', '缺少订单ID')}
  if (!operation) {throw err('INVALID_PARAMS', '缺少操作类型')}
  if (!auth.roles?.includes('super_admin') && !auth.permissions?.includes('hosting')) {
    throw err('PERMISSION_DENIED', '无操作权限')
  }

  const newStatus = BOARDING_STATUS_MAP[operation]
  if (!newStatus) {throw err('INVALID_PARAMS', '无效操作')}

  const orderRes = await db.collection('orders').doc(orderId).get()
  if (!orderRes.data) {throw err('NOT_FOUND', '订单不存在')}

  // 资源归属校验：super_admin 可操作所有订单；其他角色须为订单 host 的归属人
  // 参考 getBoardingOrders：通过 hostProfiles.doc(auth.openid) 反查 hostId
  if (!auth.isSuperAdmin) {
    let hostOwner
    if (orderRes.data.hostId) {
      // 直接以 auth.openid 作为 hostProfiles 主键反查自身 hostId
      try {
        const hostProfileRes = await db.collection('hostProfiles').doc(auth.openid).get()
        if (hostProfileRes.data && hostProfileRes.data._id === orderRes.data.hostId) {
          hostOwner = auth.openid
        }
      } catch (e) {
        hostOwner = null
      }
    }
    if (hostOwner !== auth.openid) {
      throw err('PERMISSION_DENIED', '无权操作他人资源')
    }
  }

  // B5 【P0 资损守卫】：取消操作需校验支付状态——已支付订单不可直接取消（应走退款流程），避免绕过资金流
  // 与 feeding.js handleFeedingOrder 同款守卫：paid 抛错走退款；unpaid/空放行；其他值报异常
  if (newStatus === 'cancelled') {
    const ps = String(orderRes.data.paymentStatus || '').toLowerCase()
    if (ps === 'paid') {
      throw err('ORDER_STATUS_INVALID', '已支付订单无法直接取消，请申请退款')
    }
    if (ps !== 'unpaid' && ps !== '') {
      throw err('ORDER_STATUS_INVALID', `订单支付状态异常：${ps || '(空)'}`)
    }
  }

  // reject 仅限已支付订单（pending_payment 不允许 rejected，与状态机 B1 表一致）；
  // 未支付单被拒时报明确业务提示，避免误以为可拒绝未支付单
  if (newStatus === 'rejected' && orderRes.data.status === 'pending_payment') {
    throw err('ORDER_STATUS_INVALID', '订单尚未支付，无法拒绝；未支付订单将自动超时取消或由用户主动取消')
  }

  try {
    validateTransition(BOARDING_ORDER_TRANSITIONS, orderRes.data.status, newStatus)
  } catch (e) {
    return handleError(e, e.message, ERROR_CODES.BUSINESS)
  }

  await db.collection('orders').doc(orderId).update({
    data: { status: newStatus, updatedAt: db.serverDate() },
  })

  if (newStatus === 'completed') {await createCommissionRecord('boarding', orderRes.data)}

  return handleSuccess(null, '操作成功')
}

async function getHostProfile(event, context, auth) {
  try {
    const hostProfileRes = await db.collection('hostProfiles').doc(auth.openid).get()
    return handleSuccess(hostProfileRes.data)
  } catch (e) {
    return handleSuccess(null)
  }
}

async function updateHostProfile(event, context, auth) {
  const updateData = { updatedAt: db.serverDate(), ...filterFields(FIELD_WHITELISTS.hostDefault, event) }
  if (event.pricePerDay !== undefined) {updateData.pricePerDay = Number(event.pricePerDay)}
  if (event.maxPets !== undefined) {updateData.maxPets = Number(event.maxPets)}
  if (event.pricePerDay !== undefined && Number(event.pricePerDay) < 0) {throw err('INVALID_PARAMS', '价格不能为负')}

  let hostProfileRes
  try {
    hostProfileRes = await db.collection('hostProfiles').doc(auth.openid).get()
  } catch (e) {
    throw err('HOST_NOT_FOUND', '未找到寄养家庭档案')
  }

  await db.collection('hostProfiles').doc(auth.openid).update({ data: updateData })
  return handleSuccess(null, '更新成功')
}

async function createHostProfile(event, context, auth) {
  const { hostName, realName, phone, idCard, address, housingType, hasYard, maxPets, hasOtherPets, nativePetInfo, petTypes, serviceTypes, pricePerDay, description, photos, idCardFront, idCardBack, healthCertificate, emergencyContactName, emergencyContactPhone } = event

  if (!hostName) {throw err('INVALID_PARAMS', '请填写寄养家庭名称')}
  if (!phone) {throw err('INVALID_PARAMS', '请填写手机号')}

  const existingProfiles = await db.collection('hostProfiles')
    .where({ phone, status: _.in(['active', 'pending_review']) }).count()
  if (existingProfiles.total > 0) {
    throw err('BUSINESS_ERROR', '该手机号已注册寄养家庭')
  }

  const profileData = {
    hostName,
    realName: realName || '',
    phone,
    idCard: idCard || '',
    address: address || '',
    housingType: housingType || '',
    hasYard: hasYard || '',
    maxPets: Number(maxPets) || 0,
    hasOtherPets: hasOtherPets || '',
    nativePetInfo: nativePetInfo || '',
    petTypes: petTypes || '',
    serviceTypes: serviceTypes || [],
    pricePerDay: Number(pricePerDay) || 0,
    description: description || '',
    photos: photos || [],
    idCardFront: idCardFront || '',
    idCardBack: idCardBack || '',
    healthCertificate: healthCertificate || '',
    emergencyContactName: emergencyContactName || '',
    emergencyContactPhone: emergencyContactPhone || '',
    status: 'pending_review',
    rating: 5.0,
    isAcceptingOrders: true,
    isActive: 1,
    createdBy: auth.openid,
    createdAt: db.serverDate(),
    updatedAt: db.serverDate(),
  }

  const res = await db.collection('hostProfiles').doc(auth.openid).set({ data: profileData })
  return handleSuccess({ id: auth.openid }, '寄养家庭创建成功，等待管理员审核')
}

async function getPendingHostReviews(event, context, auth) {
  const { page = 1, pageSize = 20 } = event
  const safePageSize = Math.min(Math.max(1, Number(pageSize) || 20), 100)

  const result = await paginate(db, 'hostProfiles', {
    page, pageSize: safePageSize,
    where: { status: 'pending_review' },
    orderBy: { field: 'createdAt', direction: 'desc' },
  })
  return handleSuccess(result)
}

async function reviewHost(event, context, auth) {
  const { hostId, operation, reason } = event
  if (!hostId) {throw err('INVALID_PARAMS', '缺少寄养家庭ID')}
  if (!operation) {throw err('INVALID_PARAMS', '缺少操作类型')}

  if (operation === 'approve') {
    await db.collection('hostProfiles').doc(hostId).update({
      data: { status: 'active', isAcceptingOrders: true, updatedAt: db.serverDate() },
    })
  } else if (operation === 'reject') {
    await db.collection('hostProfiles').doc(hostId).update({
      data: { status: 'rejected', rejectReason: reason || '', updatedAt: db.serverDate() },
    })
  } else {
    throw err('INVALID_PARAMS', '仅支持 approve 或 reject')
  }
  return handleSuccess(null, '审核完成')
}

async function getActiveHosts(event, context, auth) {
  const { page = 1, pageSize = 50 } = event
  const safePageSize = Math.min(Math.max(1, Number(pageSize) || 50), 100)

  const result = await paginate(db, 'hostProfiles', {
    page, pageSize: safePageSize,
    where: { status: 'active' },
    orderBy: { field: 'createdAt', direction: 'desc' },
  })
  return handleSuccess(result)
}

async function getDisabledHosts(event, context, auth) {
  const { page = 1, pageSize = 50 } = event
  const safePageSize = Math.min(Math.max(1, Number(pageSize) || 50), 100)

  const result = await paginate(db, 'hostProfiles', {
    page, pageSize: safePageSize,
    where: { status: 'disabled' },
    orderBy: { field: 'createdAt', direction: 'desc' },
  })
  return handleSuccess(result)
}

async function toggleHostAccepting(event, context, auth) {
  const { hostId, isAccepting } = event
  if (!hostId) {throw err('INVALID_PARAMS', '缺少寄养家庭ID')}
  if (typeof isAccepting !== 'boolean') {throw err('INVALID_PARAMS', '参数错误')}

  await db.collection('hostProfiles').doc(hostId).update({
    data: { isAcceptingOrders: isAccepting, updatedAt: db.serverDate() },
  })
  return handleSuccess(null, isAccepting ? '已开启接单' : '已暂停接单')
}

async function toggleHostStatus(event, context, auth) {
  const { hostId, status } = event
  if (!hostId) {throw err('INVALID_PARAMS', '缺少寄养家庭ID')}
  if (!status) {throw err('INVALID_PARAMS', '缺少目标状态')}

  const targetStatus = status === 'active' ? 'active' : 'disabled'
  const message = targetStatus === 'active' ? '已恢复上架' : '已下架'

  await db.collection('hostProfiles').doc(hostId).update({
    data: { status: targetStatus, updatedAt: db.serverDate() },
  })
  return handleSuccess(null, message)
}

module.exports = { getBoardingOrders, getBoardingOrderDetail, handleBoardingOrder, getHostProfile, updateHostProfile, createHostProfile, getPendingHostReviews, reviewHost, getActiveHosts, getDisabledHosts, toggleHostAccepting, toggleHostStatus }
