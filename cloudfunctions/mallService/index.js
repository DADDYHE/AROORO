const { initCloud, handleSuccess, handleError, generateId, ERROR_CODES, paginate } = require('./common/utils')
const { createLogger } = require('./common/logger')
const { verifyAuth } = require('./common/auth-middleware')
const { filterFields, FIELD_WHITELISTS } = require('./common/validator')
const { err, isBusinessError } = require('./common/errors')
const { detectMallOrderRisk, mapActionToErrorCode } = require('../common/risk-control')
const { withRateLimit, initGlobalRateLimitFromDb } = require('../common/risk-rate-limit')

const { cloud, db } = initCloud()
const logger = createLogger('mallService')
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
 * Sprint 22: 商城下单风控前置
 *   - reject → 抛 RISK_REJECT
 *   - review → 标 pendingReview = true（不阻塞下单，运营后续抽检）
 *   - allow  → 放行
 *
 * @returns {{ pendingReview: boolean, reasons: string[], decision: 'RISK_PASS' | 'RISK_PENDING' | 'RISK_REJECT' }}
 * @throws {BusinessError} RISK_REJECT / RATE_LIMITED
 */
async function performMallOrderRiskCheck(ctx) {
  const { openid, productId, amountFen } = ctx
  let pendingReview = false
  let riskDecision = 'RISK_PASS'
  let riskReasons = []
  try {
    const risk = await withRateLimit(
      { userId: openid, type: 'mall_order', targetId: productId },
      () => detectMallOrderRisk({
        db,
        userId: openid,
        amountFen,
        targetId: productId,
      })
    )
    riskDecision = mapActionToErrorCode(risk.action)
    riskReasons = risk.reasons
    if (risk.action === 'reject') {
      logger.warn('mallOrder.risk_reject', { userId: openid, productId, amountFen, reasons: risk.reasons })
      throw err('RISK_REJECT', '下单被风控拦截', {
        reasons: risk.reasons,
        level: risk.level,
        productId,
      })
    }
    if (risk.action === 'review') {
      pendingReview = true
      logger.info('mallOrder.risk_pending', { userId: openid, productId, amountFen, reasons: risk.reasons })
    } else {
      logger.debug?.('mallOrder.risk_pass', { userId: openid, productId })
    }
  } catch (e) {
    // RATE_LIMITED / RISK_REJECT 透传
    if (isBusinessError(e) && (e.code === 'RATE_LIMITED' || e.code === 'RISK_REJECT')) {
      throw e
    }
    // 其他风控模块异常不应阻塞下单，降级放行
    logger.warn('mallOrder.risk_control_error', { userId: openid, productId, msg: e && e.message })
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
    } catch (e) { return }
    if (!user || !user.inviterId) {return}
    let config = {}
    try {
      const configRes = await db.collection('tuan_config').doc('commission_rates').get()
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

const PRODUCT_LIST_FIELDS = {
  _id: true, name: true, coverUrl: true, coverImage: true, price: true, originalPrice: true,
  category: true, categoryId: true, stock: true, totalStock: true, soldCount: true,
  status: true, isFeatured: true, createdAt: true,
  skuType: true, specGroups: true, skus: true, minPrice: true, maxPrice: true,
  images: true, tags: true, subTitle: true,
}

const handlers = {
  getProductList,
  getProductDetail,
  getCategoryStats,
  listCategories,
  checkCartItems,
  createProduct,
  updateProduct,
  deleteProduct,
  batchUpdateProducts,
  createOrder,
  createGroupBuyOrder,
  getMyOrders,
  getGroupBuyOrders,
  getOrderDetail,
  cancelOrder,
  confirmReceive,
  deleteOrder,
}

exports.main = async (event, context) => {
  const { action } = event
  if (!action || !handlers[action]) {
    throw err('INVALID_PARAMS', '无效的操作类型')
  }

  const WRITE_ACTIONS = ['createProduct', 'updateProduct', 'deleteProduct', 'batchUpdateProducts', 'createOrder', 'createGroupBuyOrder', 'cancelOrder', 'confirmReceive', 'deleteOrder', 'getGroupBuyOrders']
  const requireLogin = WRITE_ACTIONS.includes(action)

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

async function getProductList(event) {
  const { page = 1, pageSize = 10, category, categoryId, status = 'on_sale', isFeatured } = event
  const where = { status }
  if (categoryId) {
    where.categoryId = categoryId
  } else if (category) {
    where.category = category
  }
  if (isFeatured !== undefined) {where.isFeatured = isFeatured}

  const result = await paginate(db, 'products', {
    page, pageSize, where, projection: PRODUCT_LIST_FIELDS,
  })

  const cloudUrls = []
  for (const item of result.list) {
    item.coverUrl = item.coverUrl || item.coverImage || ''
    if (item.coverUrl && item.coverUrl.startsWith('cloud://')) {
      cloudUrls.push(item.coverUrl)
    }
  }

  if (cloudUrls.length > 0) {
    try {
      const urlMap = await batchGetTempFileURL(cloudUrls)
      for (const item of result.list) {
        if (item.coverUrl && urlMap[item.coverUrl]) {
          item.coverUrl = urlMap[item.coverUrl]
        }
      }
    } catch (e) {
      logger.error('getProductList.getTempFileURL', e)
    }
  }

  return handleSuccess(result, '获取成功')
}

async function batchGetTempFileURL(fileIds) {
  const BATCH_SIZE = 50
  const urlMap = {}
  for (let i = 0; i < fileIds.length; i += BATCH_SIZE) {
    const batch = fileIds.slice(i, i + BATCH_SIZE)
    const res = await cloud.getTempFileURL({ fileList: batch })
    for (const f of res.fileList || []) {
      if (f.tempFileURL) {
        urlMap[f.fileID] = f.tempFileURL
      }
    }
  }
  return urlMap
}

async function getCategoryStats() {
  try {
    const res = await db.collection('products')
      .where({ status: 'on_sale' })
      .field({ category: true, categoryId: true })
      .limit(1000)
      .get()

    const stats = {}
    for (const item of res.data || []) {
      if (item.category) {
        stats[item.category] = (stats[item.category] || 0) + 1
      }
      if (item.categoryId) {
        stats[item.categoryId] = (stats[item.categoryId] || 0) + 1
      }
    }
    return handleSuccess(stats, '获取成功')
  } catch (error) {
    logger.error('getCategoryStats', error)
    return handleSuccess({}, '获取成功')
  }
}

async function listCategories() {
  try {
    const res = await db.collection('categories')
      .orderBy('sortOrder', 'asc')
      .limit(100)
      .get()
    return handleSuccess(res.data, '获取成功')
  } catch (error) {
    logger.error('listCategories', error)
    return handleError(error, '获取分类列表失败', ERROR_CODES.DATA)
  }
}

async function checkCartItems(event) {
  const { productIds } = event
  if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
    return handleSuccess({}, '获取成功')
  }

  try {
    const res = await db.collection('products')
      .where({ _id: _.in(productIds) })
      .field({ _id: true, status: true, coverUrl: true, coverImage: true, name: true, price: true })
      .limit(100)
      .get()

    const cloudFileIds = []
    for (const item of res.data || []) {
      const url = item.coverUrl || item.coverImage || ''
      if (url.startsWith('cloud://')) {
        cloudFileIds.push(url)
      }
    }

    const urlMap = {}
    if (cloudFileIds.length > 0) {
      try {
        const urlRes = await cloud.getTempFileURL({ fileList: cloudFileIds })
        for (const f of urlRes.fileList || []) {
          if (f.tempFileURL) {
            urlMap[f.fileID] = f.tempFileURL
          }
        }
      } catch (e) {
        logger.error('checkCartItems.getTempFileURL', e)
      }
    }

    const statusMap = {}
    for (const item of res.data || []) {
      const rawUrl = item.coverUrl || item.coverImage || ''
      statusMap[item._id] = {
        status: item.status,
        coverUrl: urlMap[rawUrl] || rawUrl,
        name: item.name || '',
        price: item.price || 0,
      }
    }
    return handleSuccess(statusMap, '获取成功')
  } catch (error) {
    logger.error('checkCartItems', error)
    return handleSuccess({}, '获取成功')
  }
}

async function getProductDetail(event) {
  const { productId } = event
  if (!productId) {throw err('INVALID_PARAMS', '缺少商品ID')}

  try {
    const res = await db.collection('products').doc(productId).get()
    const product = res.data

    product.coverUrl = product.coverUrl || product.coverImage || ''

    const cloudFields = ['coverUrl', 'coverImage']
    const cloudArrayFields = ['images', 'detailImages']
    const cloudUrls = []

    for (const field of cloudFields) {
      if (product[field] && product[field].startsWith('cloud://')) {
        cloudUrls.push(product[field])
      }
    }
    for (const field of cloudArrayFields) {
      if (Array.isArray(product[field])) {
        for (const url of product[field]) {
          if (url && url.startsWith('cloud://')) {
            cloudUrls.push(url)
          }
        }
      }
    }

    if (cloudUrls.length > 0) {
      try {
        const urlMap = await batchGetTempFileURL(cloudUrls)
        for (const field of cloudFields) {
          if (product[field] && urlMap[product[field]]) {
            product[field] = urlMap[product[field]]
          }
        }
        for (const field of cloudArrayFields) {
          if (Array.isArray(product[field])) {
            product[field] = product[field].map(url => urlMap[url] || url)
          }
        }
      } catch (e) {
        logger.error('getProductDetail.getTempFileURL', e)
      }
    }

    return handleSuccess(product, '获取成功')
  } catch (error) {
    return handleError(error, '商品不存在', ERROR_CODES.NOT_FOUND)
  }
}

async function createProduct(event, context, auth) {
  const { openid } = auth
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  const { name, description, price, originalPrice, coverUrl, images, category, stock, specs } = event
  if (!name) {throw err('INVALID_PARAMS', '缺少商品名称')}
  if (price === undefined || price === null) {throw err('INVALID_PARAMS', '缺少商品价格')}

  const product = {
    name,
    description: description || '',
    price: Number(price),
    originalPrice: Number(originalPrice) || null,
    coverUrl: coverUrl || '',
    images: images || [],
    category: category || 'general',
    stock: Number(stock) || 0,
    soldCount: 0,
    specs: specs || [],
    status: 'draft',
    isFeatured: false,
    createdBy: openid,
    createdAt: db.serverDate(),
    updatedAt: db.serverDate(),
  }

  product._id = generateId('product', openid)
  const res = await db.collection('products').add({ data: product })
  return handleSuccess({ id: res._id }, '创建成功')
}

async function updateProduct(event, context, auth) {
  const { productId } = event
  const { openid } = auth
  if (!productId) {throw err('INVALID_PARAMS', '缺少商品ID')}
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  const updateData = { updatedAt: db.serverDate(), ...filterFields(FIELD_WHITELISTS.product, event) }

  const existRes = await db.collection('products').doc(productId).get()
  if (existRes.data.createdBy !== openid) {
    throw err('PERMISSION_DENIED', '无权修改此商品')
  }

  await db.collection('products').doc(productId).update({ data: updateData })
  return handleSuccess(null, '更新成功')
}

async function deleteProduct(event, context, auth) {
  const { productId } = event
  const { openid } = auth
  if (!productId) {throw err('INVALID_PARAMS', '缺少商品ID')}
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  const existRes = await db.collection('products').doc(productId).get()
  if (existRes.data.createdBy !== openid) {
    throw err('PERMISSION_DENIED', '无权下架此商品')
  }

  await db.collection('products').doc(productId).update({
    data: { status: 'off_sale', updatedAt: db.serverDate() },
  })
  return handleSuccess(null, '下架成功')
}

async function batchUpdateProducts(event, context, auth) {
  const { productIds, operation } = event
  const { openid } = auth

  if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
    throw err('INVALID_PARAMS', '缺少商品ID列表')
  }
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  const VALID_OPERATIONS = ['on_shelf', 'off_shelf', 'delete', 'set_featured', 'unset_featured']
  if (!VALID_OPERATIONS.includes(operation)) {
    throw err('INVALID_PARAMS', '无效的操作类型')
  }

  const STATUS_MAP = { on_shelf: 'on_sale', off_shelf: 'off_sale' }
  const results = { success: 0, failed: 0 }

  for (const productId of productIds) {
    try {
      if (operation === 'delete') {
        await db.collection('products').doc(productId).remove()
      } else if (operation === 'set_featured') {
        await db.collection('products').doc(productId).update({
          data: { isFeatured: true, updatedAt: db.serverDate() },
        })
      } else if (operation === 'unset_featured') {
        await db.collection('products').doc(productId).update({
          data: { isFeatured: false, updatedAt: db.serverDate() },
        })
      } else {
        await db.collection('products').doc(productId).update({
          data: { status: STATUS_MAP[operation], updatedAt: db.serverDate() },
        })
      }
      results.success++
    } catch (e) {
      logger.error('batchUpdateProducts', { productId, error: e })
      results.failed++
    }
  }

  return handleSuccess(results, `操作完成: 成功${results.success}个, 失败${results.failed}个`)
}

async function createGroupBuyOrder(event, context, auth) {
  const { openid } = auth
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  const { productId, quantity = 1, receiverName, receiverPhone, receiverAddress } = event
  if (!productId) {throw err('INVALID_PARAMS', '缺少商品ID')}
  if (!receiverName) {throw err('INVALID_PARAMS', '请填写收货人姓名')}
  if (!receiverPhone) {throw err('INVALID_PARAMS', '请填写联系电话')}
  if (!receiverAddress) {throw err('INVALID_PARAMS', '请填写收货地址')}

  // Sprint 22: 团购下单前先做商品/库存预读 + 大额风控
  const productRes = await db.collection('products').doc(productId).get()
  const previewProduct = productRes.data
  if (!previewProduct || previewProduct.status !== 'on_sale') {
    throw err('BUSINESS_ERROR', '商品已下架或不可购买')
  }
  const previewUnitPrice = Number(previewProduct.price) || 0
  const previewTotalAmount = Math.round(previewUnitPrice * Number(quantity) * 100) // 转分
  const groupRisk = await performMallOrderRiskCheck({
    openid,
    productId,
    amountFen: previewTotalAmount,
  })

  const transaction = await db.startTransaction()

  try {
    const product = previewProduct
    if (!product || product.status !== 'on_sale') {
      await transaction.rollback()
      throw err('BUSINESS_ERROR', '商品已下架或不可购买')
    }

    const availableStock = product.totalStock || product.stock || 0
    if (availableStock < quantity) {
      await transaction.rollback()
      throw err('STOCK_INSUFFICIENT', `库存不足，仅剩${availableStock}件`)
    }

    const unitPrice = product.price
    const totalAmount = unitPrice * Number(quantity)
    const orderNo = `G${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`

    const order = {
      orderNo,
      productId,
      productName: product.name,
      productImage: product.coverUrl || (product.images && product.images[0]) || '',
      unitPrice,
      quantity: Number(quantity),
      totalAmount,
      receiverName,
      receiverPhone,
      receiverAddress,
      ownerId: openid,
      ownerName: auth.nickName || '',
      sellerId: product.createdBy || '',
      status: 'pending_payment',
      type: 'group_buy',
      // Sprint 22: 标记风控抽检状态
      pendingReview: groupRisk.pendingReview,
      riskDecision: groupRisk.decision,
      riskReasons: groupRisk.reasons,
      createdAt: db.serverDate(),
      updatedAt: db.serverDate(),
    }

    order._id = generateId('order', openid)
    const addRes = await transaction.collection('orders').add({ data: order })

    await transaction.collection('products').doc(productId).update({
      data: {
        totalStock: _.inc(-Number(quantity)),
        stock: _.inc(-Number(quantity)),
        soldCount: _.inc(Number(quantity)),
        joinCount: _.inc(Number(quantity)),
        updatedAt: db.serverDate(),
      },
    })

    await transaction.commit()
    return handleSuccess({ orderId: addRes._id, ...order }, '下单成功')
  } catch (error) {
    await transaction.rollback()
    return handleError(error, '下单失败', ERROR_CODES.DATA)
  }
}

async function createOrder(event, context, auth) {
  const { openid } = auth
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  const { productId, skuId, quantity = 1, receiverName, receiverPhone, receiverAddress } = event
  if (!productId) {throw err('INVALID_PARAMS', '缺少商品ID')}
  if (!receiverAddress) {throw err('INVALID_PARAMS', '缺少收货地址')}

  // Sprint 22: 商城下单前先做商品预读 + 大额风控
  //   - 预读失败 → 抛错
  //   - 风控 reject → 直接 RISK_REJECT
  //   - 风控 review → pendingReview=true，正常下单
  const productRes = await db.collection('products').doc(productId).get()
  const previewProduct = productRes.data
  if (!previewProduct || previewProduct.status !== 'on_sale') {
    throw err('BUSINESS_ERROR', '商品不可购买')
  }
  let previewUnitPrice = Number(previewProduct.price) || 0
  if (previewProduct.skuType === 'multi' && skuId) {
    const sku = (previewProduct.skus || []).find(s => s.skuId === skuId)
    if (!sku) {throw err('BUSINESS_ERROR', 'SKU不存在')}
    previewUnitPrice = Number(sku.price) || 0
  }
  const previewTotalAmount = Math.round(previewUnitPrice * Number(quantity) * 100) // 转分
  const orderRisk = await performMallOrderRiskCheck({
    openid,
    productId,
    amountFen: previewTotalAmount,
  })

  const transaction = await db.startTransaction()

  try {
    const product = previewProduct
    if (!product || product.status !== 'on_sale') {
      await transaction.rollback()
      throw err('BUSINESS_ERROR', '商品不可购买')
    }

    let unitPrice = product.price
    let skuText = ''
    let stockKey = 'stock'

    if (product.skuType === 'multi' && skuId) {
      const skuIndex = product.skus ? product.skus.findIndex(s => s.skuId === skuId) : -1
      if (skuIndex < 0) {
        await transaction.rollback()
        throw err('BUSINESS_ERROR', 'SKU不存在')
      }
      const sku = product.skus[skuIndex]
      if (sku.stock < quantity) {
        await transaction.rollback()
        throw err('BUSINESS_ERROR', '库存不足')
      }
      unitPrice = sku.price
      skuText = sku.specText || ''
      stockKey = `skus.${skuIndex}.stock`
    } else {
      const availableStock = product.totalStock || product.stock || 0
      if (availableStock < quantity) {
        await transaction.rollback()
        throw err('BUSINESS_ERROR', '库存不足')
      }
    }

    const orderNo = `M${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`

    const order = {
      orderNo,
      productId,
      productName: product.name,
      productImage: product.coverImage || product.coverUrl || (product.images && product.images[0]) || '',
      skuId: skuId || '',
      skuText,
      unitPrice,
      quantity: Number(quantity),
      totalAmount: unitPrice * Number(quantity),
      receiverName: receiverName || '',
      receiverPhone: receiverPhone || '',
      receiverAddress,
      ownerId: openid,
      ownerName: auth.nickName || '',
      status: 'pending_payment',
      type: 'mall',
      // Sprint 22: 标记风控抽检状态
      pendingReview: orderRisk.pendingReview,
      riskDecision: orderRisk.decision,
      riskReasons: orderRisk.reasons,
      createdAt: db.serverDate(),
      updatedAt: db.serverDate(),
    }

    order._id = generateId('order', openid)
    const orderAddRes = await transaction.collection('orders').add({ data: order })

    const updateData = {
      totalStock: _.inc(-Number(quantity)),
      soldCount: _.inc(Number(quantity)),
      updatedAt: db.serverDate(),
    }

    if (product.skuType === 'multi' && skuId) {
      updateData[stockKey] = _.inc(-Number(quantity))
      updateData[`skus.${product.skus.findIndex(s => s.skuId === skuId)}.soldCount`] = _.inc(Number(quantity))
    } else {
      updateData.stock = _.inc(-Number(quantity))
    }

    await transaction.collection('products').doc(productId).update({ data: updateData })
    await transaction.commit()
    return handleSuccess({ orderId: orderAddRes._id, orderNo }, '下单成功')
  } catch (error) {
    await transaction.rollback()
    return handleError(error, '下单失败', ERROR_CODES.DATA)
  }
}

async function getMyOrders(event, context, auth) {
  const { openid } = auth
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  const { status, page = 1, pageSize = 20 } = event
  const where = { ownerId: openid, type: 'mall', status: _.neq('deleted') }
  if (status && status !== 'all') {where.status = status}

  try {
    const result = await paginate(db, 'orders', {
      page,
      pageSize,
      where,
      orderBy: { field: 'createdAt', direction: 'desc' },
    })
    return handleSuccess(result)
  } catch (error) {
    logger.error('getMyOrders', error)
    return handleError(error, '获取商城订单失败', ERROR_CODES.DATA)
  }
}

async function getGroupBuyOrders(event, context, auth) {
  const { openid } = auth
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  const { status, page = 1, pageSize = 20 } = event
  const where = { ownerId: openid, type: 'group_buy', status: _.neq('deleted') }
  if (status && status !== 'all') {where.status = status}

  try {
    const result = await paginate(db, 'orders', {
      page,
      pageSize,
      where,
      orderBy: { field: 'createdAt', direction: 'desc' },
    })
    return handleSuccess(result)
  } catch (error) {
    logger.error('getGroupBuyOrders', error)
    return handleError(error, '获取团购订单失败', ERROR_CODES.DATA)
  }
}

async function cancelOrder(event, context, auth) {
  const { openid } = auth
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  const { orderId } = event
  if (!orderId) {throw err('INVALID_PARAMS', '缺少订单ID')}

  try {
    const orderRes = await db.collection('orders').doc(orderId).get()
    if (!orderRes.data || orderRes.data.ownerId !== openid) {
      throw err('PERMISSION_DENIED', '无权限操作此订单')
    }

    const cancellableStatuses = ['pending_payment', 'pending_shipment']
    if (!cancellableStatuses.includes(orderRes.data.status)) {
      throw err('BUSINESS_ERROR', '当前订单状态不可取消')
    }

    await db.collection('orders').doc(orderId).update({
      data: { status: 'cancelled', cancelReason: '买家主动取消', cancelledAt: db.serverDate(), updatedAt: db.serverDate() },
    })

    const qty = orderRes.data.quantity || 1
    const stockUpdateData = {
      totalStock: _.inc(qty),
      soldCount: _.inc(-qty),
      stock: _.inc(qty),
      updatedAt: db.serverDate(),
    }

    if (orderRes.data.skuId) {
      const productRes = await db.collection('products').doc(orderRes.data.productId).get()
      if (productRes.data && productRes.data.skus) {
        const skuIndex = productRes.data.skus.findIndex(s => s.skuId === orderRes.data.skuId)
        if (skuIndex >= 0) {
          stockUpdateData[`skus.${skuIndex}.stock`] = _.inc(qty)
          stockUpdateData[`skus.${skuIndex}.soldCount`] = _.inc(-qty)
        }
      }
    }

    await db.collection('products').doc(orderRes.data.productId).update({
      data: stockUpdateData,
    })

    return handleSuccess(null, '取消成功')
  } catch (error) {
    logger.error('cancelOrder', error)
    return handleError(error, '取消订单失败', ERROR_CODES.DATA)
  }
}

async function getOrderDetail(event, context, auth) {
  const { openid } = auth
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  const { orderId } = event
  if (!orderId) {throw err('INVALID_PARAMS', '缺少订单ID')}

  try {
    const orderRes = await db.collection('orders').doc(orderId).get()
    if (!orderRes.data || orderRes.data.ownerId !== openid) {
      throw err('PERMISSION_DENIED', '无权限查看此订单')
    }

    return handleSuccess(orderRes.data, '获取成功')
  } catch (error) {
    logger.error('getOrderDetail', error)
    return handleError(error, '获取订单详情失败', ERROR_CODES.DATA)
  }
}

async function confirmReceive(event, context, auth) {
  const { openid } = auth
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  const { orderId } = event
  if (!orderId) {throw err('INVALID_PARAMS', '缺少订单ID')}

  try {
    const orderRes = await db.collection('orders').doc(orderId).get()
    if (!orderRes.data || orderRes.data.ownerId !== openid) {
      throw err('PERMISSION_DENIED', '无权限操作此订单')
    }

    if (orderRes.data.status !== 'shipped') {
      throw err('BUSINESS_ERROR', '当前订单状态不可确认收货')
    }

    await db.collection('orders').doc(orderId).update({
      data: { status: 'completed', updatedAt: db.serverDate() },
    })

    await createCommissionRecord(orderRes.data.type === 'group_buy' ? 'tuan' : 'mall', orderRes.data)

    return handleSuccess(null, '确认收货成功')
  } catch (error) {
    logger.error('confirmReceive', error)
    return handleError(error, '确认收货失败', ERROR_CODES.DATA)
  }
}

async function deleteOrder(event, context, auth) {
  const { openid } = auth
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  const { orderId } = event
  if (!orderId) {throw err('INVALID_PARAMS', '缺少订单ID')}

  try {
    const orderRes = await db.collection('orders').doc(orderId).get()
    if (!orderRes.data || orderRes.data.ownerId !== openid) {
      throw err('PERMISSION_DENIED', '无权限操作此订单')
    }

    const deletableStatuses = ['completed', 'cancelled']
    if (!deletableStatuses.includes(orderRes.data.status)) {
      throw err('BUSINESS_ERROR', '当前订单状态不可删除')
    }

    await db.collection('orders').doc(orderId).update({
      data: { status: 'deleted', updatedAt: db.serverDate() },
    })

    return handleSuccess(null, '删除成功')
  } catch (error) {
    logger.error('deleteOrder', error)
    return handleError(error, '删除订单失败', ERROR_CODES.DATA)
  }
}
