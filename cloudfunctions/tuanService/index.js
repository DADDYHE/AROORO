const { err } = require('./common/errors')
const { initCloud, handleSuccess, handleError, generateId, ERROR_CODES, paginate } = require('./common/utils')
const { createLogger } = require('./common/logger')
const { verifyAuth } = require('./common/auth-middleware')

const { cloud, db } = initCloud()
const logger = createLogger('tuanService')
const _ = db.command

const TUAN_DEAL_LIST_FIELDS = {
  _id: true, title: true, coverUrl: true, description: true, images: true,
  products: true, startTime: true, endTime: true, status: true,
  totalOrders: true, totalAmount: true, createdAt: true,
}

const WRITE_ACTIONS = ['createTuanOrder']

exports.main = async (event, context) => {
  const { action } = event
  try {
    if (!action || !handlers[action]) {
      throw err('UNKNOWN_ACTION', action ? `未知的操作：${action}` : '缺少 action 参数')
    }

    const requireLogin = WRITE_ACTIONS.includes(action)
    const auth = await verifyAuth(event, { requireLogin })
    logger.info(action, { openid: auth.openid })
    return await handlers[action](event, context, auth)
  } catch (error) {
    logger.error(action || '(no action)', error)
    const code = error.code || ERROR_CODES.BUSINESS
    return handleError(error, error.message || '操作失败', code)
  }
}

function computeMinPrice(products) {
  let min = Infinity
  for (const p of products) {
    if (p.skuType === 'multi' && p.skus && p.skus.length > 0) {
      for (const sku of p.skus) {
        if (sku.enabled !== false) {
          const price = Number(sku.tuanPrice) || Number(sku.price) || Infinity
          if (price < min) {min = price}
        }
      }
    } else {
      const price = Number(p.tuanPrice) || 0
      if (price > 0 && price < min) {min = price}
    }
  }
  return min === Infinity ? 0 : min
}

async function getTuanDealList(event) {
  const { page = 1, pageSize = 10, status } = event
  const where = {}
  if (status) {
    where.status = status
  } else {
    where.status = db.command.in(['published', 'active'])
  }
  const now = new Date()
  where.startTime = db.command.lte(now)
  where.endTime = db.command.gte(now)

  const result = await paginate(db, 'tuan_deals', {
    page, pageSize, where, projection: TUAN_DEAL_LIST_FIELDS,
    orderBy: { field: 'createdAt', direction: 'desc' },
  })
  if (result.list) {
    result.list = result.list.map(deal => ({
      ...deal,
      minPrice: computeMinPrice(deal.products || []),
    }))
  }
  return handleSuccess(result, '获取成功')
}

async function getTuanDealDetail(event) {
  const { id, dealId } = event
  const targetId = id || dealId
  if (!targetId) {throw err('INVALID_PARAMS', '缺少团购ID')}

  try {
    const res = await db.collection('tuan_deals').doc(targetId).field(TUAN_DEAL_LIST_FIELDS).get()
    if (!res.data) {throw err('NOT_FOUND', '团购不存在')}
    const deal = res.data
    deal.minPrice = computeMinPrice(deal.products || [])

    for (const p of (deal.products || [])) {
      if (p.skuType === 'multi' && p.skus && p.skus.length > 0) {
        p.minSkuPrice = Infinity
        for (const sku of p.skus) {
          if (sku.enabled !== false) {
            const price = Number(sku.tuanPrice) || Number(sku.price) || Infinity
            if (price < p.minSkuPrice) {p.minSkuPrice = price}
          }
        }
        if (p.minSkuPrice === Infinity) {p.minSkuPrice = p.tuanPrice || 0}
      }
    }
    return handleSuccess(deal, '获取成功')
  } catch (error) {
    return handleError(error, '团购不存在', ERROR_CODES.NOT_FOUND)
  }
}

async function createTuanOrder(event, context, auth) {
  const { openid } = auth
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  const { dealId, productId, skuId, quantity = 1, tuanPrice, totalAmount, originalAmount, couponId, couponDiscount, specText, receiverName, receiverPhone, receiverAddress, remark } = event
  if (!dealId) {throw err('INVALID_PARAMS', '缺少dealId')}
  if (!productId) {throw err('INVALID_PARAMS', '缺少productId')}

  const dealRes = await db.collection('tuan_deals').doc(dealId).get()
  if (!dealRes.data) {throw err('NOT_FOUND', '团购不存在')}
  if (dealRes.data.status !== 'published' && dealRes.data.status !== 'active') {
    throw err('BUSINESS_ERROR', '团购已结束')
  }
  if (dealRes.data.endTime && new Date(dealRes.data.endTime) < new Date()) {
    throw err('BUSINESS_ERROR', '团购已结束')
  }

  const dealProducts = dealRes.data.products || []
  const dealProduct = dealProducts.find(p => p.productId === productId)
  if (!dealProduct) {throw err('INVALID_PARAMS', '商品不在团购中')}

  let finalPrice = Number(tuanPrice) || 0
  let finalStock = Number(dealProduct.stock) || 0

  if (skuId && dealProduct.skuType === 'multi' && dealProduct.skus) {
    const sku = dealProduct.skus.find(s => s.skuId === skuId)
    if (!sku) {throw err('INVALID_PARAMS', 'SKU不存在')}
    if (sku.enabled === false) {throw err('BUSINESS_ERROR', '该规格已下架')}
    finalPrice = Number(sku.tuanPrice) || Number(sku.price) || finalPrice
    finalStock = Number(sku.stock) || 0
    if (finalStock < quantity) {throw err('BUSINESS_ERROR', '库存不足')}
  } else {
    if (finalStock < quantity) {throw err('BUSINESS_ERROR', '库存不足')}
  }

  const finalAmount = Number(totalAmount) || finalPrice * quantity
  const orderNo = `T${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`

  const order = {
    dealId,
    productId,
    skuId: skuId || '',
    specText: specText || '',
    ownerId: openid,
    quantity,
    tuanPrice: finalPrice,
    originalAmount: originalAmount || finalAmount,
    totalAmount: finalAmount,
    couponId: couponId || '',
    couponDiscount: Number(couponDiscount) || 0,
    status: 'pending',
    createdAt: db.serverDate(),
    updatedAt: db.serverDate(),
  }

  order._id = generateId('tuan', openid)
  const orderRes = await db.collection('tuan_orders').add({ data: order })

  const unifiedOrder = {
    orderNo,
    dealId,
    productId,
    productName: dealProduct.name || '',
    productImage: dealProduct.image || '',
    skuId: skuId || '',
    skuText: specText || '',
    unitPrice: finalPrice,
    quantity: Number(quantity),
    originalAmount: originalAmount || finalAmount,
    totalAmount: finalAmount,
    couponId: couponId || '',
    couponDiscount: Number(couponDiscount) || 0,
    receiverName: receiverName || '',
    receiverPhone: receiverPhone || '',
    receiverAddress: receiverAddress || '',
    remark: remark || '',
    ownerId: openid,
    status: 'pending_payment',
    type: 'group_buy',
    tuanOrderId: orderRes._id,
    createdAt: db.serverDate(),
    updatedAt: db.serverDate(),
  }

  unifiedOrder._id = generateId('order', openid)
  const unifiedOrderRes = await db.collection('orders').add({ data: unifiedOrder })

  const updateData = {
    totalOrders: db.command.inc(1),
    totalAmount: db.command.inc(finalAmount),
    updatedAt: new Date(),
  }

  if (skuId && dealProduct.skuType === 'multi' && dealProduct.skus) {
    const skuIndex = dealProduct.skus.findIndex(s => s.skuId === skuId)
    if (skuIndex >= 0) {
      updateData[`products.${dealProducts.indexOf(dealProduct)}.skus.${skuIndex}.stock`] = db.command.inc(-quantity)
      updateData[`products.${dealProducts.indexOf(dealProduct)}.skus.${skuIndex}.sold`] = db.command.inc(quantity)
    }
  }
  updateData[`products.${dealProducts.indexOf(dealProduct)}.stock`] = db.command.inc(-quantity)
  updateData[`products.${dealProducts.indexOf(dealProduct)}.sold`] = db.command.inc(quantity)

  await db.collection('tuan_deals').doc(dealId).update({ data: updateData })

  return handleSuccess({ _id: orderRes._id, unifiedOrderId: unifiedOrderRes._id, ...order }, '下单成功')
}

const handlers = {
  getTuanDealList,
  getTuanDealDetail,
  createTuanOrder,
}
