const { handleSuccess, handleError, generateId, ERROR_CODES, paginate } = require('../common/utils')
const { initCloud } = require('../common/utils')
const { createLogger } = require('../common/logger')
const { filterFields, FIELD_WHITELISTS } = require('../common/validator')
const { MALL_ORDER_TRANSITIONS, MALL_STATUS_MAP, STATUS_LABELS, validateTransition } = require('./stateMachine')
const { createCommissionRecord } = require('./commission')
const { err } = require('../common/errors')

const { db } = initCloud()
const _ = db.command
const logger = createLogger('adminService:mall')

const PRODUCT_LIST_PROJECTION = {
  _id: true, name: true, subTitle: true, description: true,
  coverImage: true, coverUrl: true, images: true, detailImages: true,
  price: true, originalPrice: true, minPrice: true, maxPrice: true,
  categoryId: true, categoryName: true, category: true,
  stock: true, totalStock: true, soldCount: true,
  status: true, isFeatured: true, tags: true,
  sortOrder: true, skuType: true, skus: true, specGroups: true,
  createdAt: true, updatedAt: true,
}

async function getProductList(event, context, auth) {
  const {
    page = 1, pageSize = 20,
    keyword, category, categoryId, status,
    minPrice, maxPrice, minStock, maxStock,
    isFeatured, tags, sortBy = 'sortOrder', sortOrder = 'desc',
  } = event

  const where = {}
  if (keyword) {where.name = db.RegExp({ regexp: keyword, options: 'i' })}
  if (category) {where.category = category}
  if (categoryId) {where.categoryId = categoryId}
  if (status) {
    if (typeof status === 'string' && status.includes(',')) {
      where.status = _.in(status.split(','))
    } else {
      where.status = status
    }
  }
  if (isFeatured !== undefined) {where.isFeatured = isFeatured}
  if (tags && tags.length > 0) {where.tags = _.in(tags)}
  if (minPrice !== undefined || maxPrice !== undefined) {
    where.price = {}
    if (minPrice !== undefined) {Object.assign(where.price, { $gte: Number(minPrice) })}
    if (maxPrice !== undefined) {Object.assign(where.price, { $lte: Number(maxPrice) })}
  }
  if (minStock !== undefined || maxStock !== undefined) {
    const stockWhere = {}
    if (minStock !== undefined) {Object.assign(stockWhere, { $gte: Number(minStock) })}
    if (maxStock !== undefined) {Object.assign(stockWhere, { $lte: Number(maxStock) })}
    where.$or = [{ stock: stockWhere }, { totalStock: stockWhere }]
  }

  const orderBy = { field: sortBy, direction: sortOrder }
  const result = await paginate(db, 'products', {
    page, pageSize, where, orderBy, projection: PRODUCT_LIST_PROJECTION,
  })
  return handleSuccess(result)
}

async function getProductDetail(event, context, auth) {
  const { productId } = event
  if (!productId) {throw err('INVALID_PARAMS', '缺少商品ID')}
  const res = await db.collection('products').doc(productId).get()
  return handleSuccess(res.data)
}

async function createProduct(event, context, auth) {
  const { name, category, categoryId, categoryName, description, price, originalPrice, stock, coverImage, images, detailImages, subTitle, tags, isFeatured, sortOrder, skuType, specGroups, skus, minPrice, maxPrice, totalStock, status } = event
  if (!name) {throw err('INVALID_PARAMS', '缺少商品名称')}

  const isMultiSku = skuType === 'multi' && specGroups && specGroups.length > 0

  const product = {
    name, subTitle: subTitle || '',
    category: category || 'general',
    categoryId: categoryId || '',
    categoryName: categoryName || '',
    description: description || '',
    skuType: isMultiSku ? 'multi' : 'single',
    coverImage: coverImage || '', images: images || [],
    detailImages: detailImages || [],
    tags: tags || [], isFeatured: Boolean(isFeatured),
    sortOrder: sortOrder || 0,
    createdBy: auth.openid, status: status || 'draft',
    createdAt: db.serverDate(), updatedAt: db.serverDate(),
  }

  if (isMultiSku) {
    product.specGroups = specGroups
    product.skus = (skus || []).map(sku => ({
      skuId: sku.skuId, specIds: sku.specIds, specText: sku.specText,
      price: Number(sku.price) || 0, originalPrice: Number(sku.originalPrice) || 0,
      stock: Number(sku.stock) || 0, soldCount: 0,
      skuCode: sku.skuCode || '', image: sku.image || '',
    }))
    product.price = product.skus.length > 0 ? product.skus[0].price : 0
    product.originalPrice = product.skus.length > 0 ? (product.skus[0].originalPrice || 0) : 0
    product.stock = product.skus.reduce((sum, s) => sum + s.stock, 0)
    product.totalStock = product.stock
    product.minPrice = minPrice || product.price
    product.maxPrice = maxPrice || product.price
    product.soldCount = 0
  } else {
    product.price = Number(price) || 0
    product.originalPrice = Number(originalPrice) || 0
    product.stock = Number(stock) || 0
    product.totalStock = Number(stock) || 0
    product.minPrice = product.price
    product.maxPrice = product.price
    product.soldCount = 0
  }

  product._id = generateId('product', auth.openid || auth.adminId)
  const res = await db.collection('products').add({ data: product })
  return handleSuccess({ id: res._id }, '创建成功')
}

async function updateProduct(event, context, auth) {
  const { productId } = event
  if (!productId) {throw err('INVALID_PARAMS', '缺少商品ID')}

  const updateData = { updatedAt: db.serverDate(), ...filterFields(FIELD_WHITELISTS.product, event) }

  if (updateData.stock !== undefined && updateData.totalStock === undefined) {
    updateData.totalStock = Number(updateData.stock)
  }
  if (updateData.price !== undefined) {
    if (updateData.minPrice === undefined) {updateData.minPrice = Number(updateData.price)}
    if (updateData.maxPrice === undefined) {updateData.maxPrice = Number(updateData.price)}
  }

  await db.collection('products').doc(productId).update({ data: updateData })
  return handleSuccess(null, '更新成功')
}

async function deleteProduct(event, context, auth) {
  const { productId } = event
  if (!productId) {throw err('INVALID_PARAMS', '缺少商品ID')}

  const product = await db.collection('products').doc(productId).get()
  if (!product.data) {throw err('PRODUCT_NOT_FOUND', '商品不存在')}
  if (product.data.status === 'on_sale') {
    throw err('BUSINESS_ERROR', '在售商品无法删除，请先下架')
  }

  await db.collection('products').doc(productId).remove()
  return handleSuccess(null, '删除成功')
}

async function batchUpdateProducts(event, context, auth) {
  const { productIds, operation } = event
  if (!productIds || !productIds.length) {
    throw err('INVALID_PARAMS', '请选择商品')
  }

  const updateData = { updatedAt: db.serverDate() }

  switch (operation) {
  case 'on_shelf':
    updateData.status = 'on_sale'
    updateData.onSaleAt = db.serverDate()
    break
  case 'off_shelf':
    updateData.status = 'off_sale'
    updateData.offShelfAt = db.serverDate()
    break
  case 'set_featured':
    updateData.isFeatured = true
    break
  case 'unset_featured':
    updateData.isFeatured = false
    break
  case 'delete':
    await db.collection('products').where({ _id: _.in(productIds) }).remove()
    return handleSuccess(null, '批量删除成功')
  default:
    throw err('INVALID_PARAMS', '无效操作')
  }

  await db.collection('products').where({ _id: _.in(productIds) }).update({ data: updateData })
  return handleSuccess(null, '批量操作成功')
}

async function cloneProduct(event, context, auth) {
  const { productId } = event
  if (!productId) {throw err('INVALID_PARAMS', '缺少商品ID')}

  const source = await db.collection('products').doc(productId).get()
  if (!source.data) {throw err('PRODUCT_NOT_FOUND', '商品不存在')}

  const cloned = { ...source.data }
  delete cloned._id
  delete cloned.onSaleAt
  delete cloned.offShelfAt
  cloned.name = `${cloned.name || ''}（副本）`
  cloned.status = 'draft'
  cloned.soldCount = 0
  cloned.totalStock = cloned.totalStock || cloned.stock || 0
  if (cloned.skus && cloned.skus.length > 0) {
    cloned.skus = cloned.skus.map(sku => ({
      ...sku, skuId: `sku_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`, soldCount: 0,
    }))
  }
  cloned.createdAt = db.serverDate()
  cloned.updatedAt = db.serverDate()

  cloned._id = generateId('product', auth.openid || auth.adminId)
  const res = await db.collection('products').add({ data: cloned })
  return handleSuccess({ id: res._id }, '克隆成功')
}

async function getMallOrders(event, context, auth) {
  const { status, page = 1, pageSize = 20, keyword } = event
  const where = { type: 'mall' }
  if (status) {where.status = status}
  if (keyword) {
    where.$or = [
      { orderNo: db.RegExp({ regexp: keyword, options: 'i' }) },
      { productName: db.RegExp({ regexp: keyword, options: 'i' }) },
      { ownerName: db.RegExp({ regexp: keyword, options: 'i' }) },
    ]
  }

  const result = await paginate(db, 'orders', {
    page, pageSize, where,
    orderBy: { field: 'createdAt', direction: 'desc' },
  })

  const list = result.list || []
  const enrichedList = list.map(order => ({
    ...order,
    buyerNickName: order.ownerName || order.buyerNickName || '',
    productName: order.productName || '',
    totalAmount: order.totalAmount || 0,
  }))

  return handleSuccess({ ...result, list: enrichedList })
}

async function getMallOrderDetail(event, context, auth) {
  const { orderId } = event
  if (!orderId) {throw err('INVALID_PARAMS', '缺少订单ID')}
  const res = await db.collection('orders').doc(orderId).get()
  if (!res.data || res.data.type !== 'mall') {throw err('NOT_FOUND', '订单不存在')}
  return handleSuccess(res.data)
}

async function handleMallOrder(event, context, auth) {
  const { orderId, operation } = event
  if (!orderId) {throw err('INVALID_PARAMS', '缺少订单ID')}
  if (!operation) {throw err('INVALID_PARAMS', '缺少操作类型')}

  const newStatus = MALL_STATUS_MAP[operation]
  if (!newStatus) {throw err('INVALID_PARAMS', '无效操作')}

  const orderRes = await db.collection('orders').doc(orderId).get()
  if (!orderRes.data) {throw err('NOT_FOUND', '订单不存在')}
  if (orderRes.data.type !== 'mall') {throw err('BUSINESS_ERROR', '非商城订单')}

  try {
    validateTransition(MALL_ORDER_TRANSITIONS, orderRes.data.status, newStatus)
  } catch (e) {
    return handleError(e, e.message, ERROR_CODES.BUSINESS)
  }

  await db.collection('orders').doc(orderId).update({
    data: { status: newStatus, updatedAt: db.serverDate() },
  })
  return handleSuccess(null, '操作成功')
}

async function shipMallOrder(event, context, auth) {
  const { orderId, expressCompany, expressNo } = event
  if (!orderId) {throw err('INVALID_PARAMS', '缺少订单ID')}
  if (!expressNo) {throw err('INVALID_PARAMS', '请填写快递单号')}

  const orderRes = await db.collection('orders').doc(orderId).get()
  if (!orderRes.data) {throw err('NOT_FOUND', '订单不存在')}
  if (orderRes.data.type !== 'mall') {throw err('BUSINESS_ERROR', '非商城订单')}

  try {
    validateTransition(MALL_ORDER_TRANSITIONS, orderRes.data.status, 'shipped')
  } catch (e) {
    return handleError(e, e.message, ERROR_CODES.BUSINESS)
  }

  await db.collection('orders').doc(orderId).update({
    data: {
      status: 'shipped',
      expressCompany, expressNo,
      shippedAt: db.serverDate(),
      updatedAt: db.serverDate(),
    },
  })
  return handleSuccess(null, '发货成功')
}

async function completeMallOrder(event, context, auth) {
  const { orderId } = event
  if (!orderId) {throw err('INVALID_PARAMS', '缺少订单ID')}

  const orderRes = await db.collection('orders').doc(orderId).get()
  if (!orderRes.data) {throw err('NOT_FOUND', '订单不存在')}

  try {
    validateTransition(MALL_ORDER_TRANSITIONS, orderRes.data.status, 'completed')
  } catch (e) {
    return handleError(e, e.message, ERROR_CODES.BUSINESS)
  }

  await db.collection('orders').doc(orderId).update({
    data: { status: 'completed', updatedAt: db.serverDate() },
  })

  await createCommissionRecord('mall', orderRes.data)

  return handleSuccess(null, '订单已完成')
}

async function getProductStats(event, context, auth) {
  const [totalRes, onSaleRes, offSaleRes, draftRes] = await Promise.all([
    db.collection('products').count(),
    db.collection('products').where({ status: 'on_sale' }).count(),
    db.collection('products').where({ status: 'off_sale' }).count(),
    db.collection('products').where({ status: 'draft' }).count(),
  ])
  return handleSuccess({
    total: totalRes.total,
    on_sale: onSaleRes.total,
    off_sale: offSaleRes.total,
    draft: draftRes.total,
  })
}

async function getCategoryStats() {
  try {
    const res = await db.collection('products')
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

async function createCategory(event, context, auth) {
  const { key, label, sortOrder, subcats } = event
  if (!key || !label) {throw err('INVALID_PARAMS', '缺少分类key或名称')}

  const existRes = await db.collection('categories').where({ key }).count()
  if (existRes.total > 0) {throw err('BUSINESS_ERROR', '分类key已存在')}

  const doc = {
    key, label,
    sortOrder: sortOrder || 0,
    subcats: subcats || [],
    createdAt: db.serverDate(),
    updatedAt: db.serverDate(),
  }
  doc._id = generateId('category', auth.openid || auth.adminId)
  const res = await db.collection('categories').add({ data: doc })
  return handleSuccess({ _id: res._id, ...doc }, '创建成功')
}

async function updateCategory(event) {
  const { categoryId, label, sortOrder, subcats } = event
  if (!categoryId) {throw err('INVALID_PARAMS', '缺少分类ID')}

  const updateData = { updatedAt: db.serverDate() }
  if (label !== undefined) {updateData.label = label}
  if (sortOrder !== undefined) {updateData.sortOrder = sortOrder}
  if (subcats !== undefined) {updateData.subcats = subcats}

  await db.collection('categories').doc(categoryId).update({ data: updateData })
  return handleSuccess(null, '更新成功')
}

async function deleteCategory(event) {
  const { categoryId, key } = event
  if (!categoryId) {throw err('INVALID_PARAMS', '缺少分类ID')}

  const categoryKey = key
  if (categoryKey) {
    const productCount = await db.collection('products').where({ category: categoryKey }).count()
    if (productCount.total > 0) {
      throw err('CATEGORY_HAS_PRODUCTS', `该分类下有 ${productCount.total} 个商品，无法删除`)
    }
  }

  await db.collection('categories').doc(categoryId).remove()
  return handleSuccess(null, '删除成功')
}

module.exports = {
  getProductList, getProductDetail, createProduct, updateProduct, deleteProduct,
  batchUpdateProducts, cloneProduct,
  getMallOrders, getMallOrderDetail, handleMallOrder, shipMallOrder, completeMallOrder,
  getProductStats, getCategoryStats,
  listCategories, createCategory, updateCategory, deleteCategory,
}
