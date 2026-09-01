const { handleSuccess, handleError, generateId, ERROR_CODES, paginate, escapeRegExp } = require('../common/utils')
const { initCloud } = require('../common/utils')
const { createLogger } = require('../common/logger')
const { filterFields, FIELD_WHITELISTS } = require('../common/validator')
const { LOGISTICS_ORDER_TRANSITIONS, MALL_STATUS_MAP, STATUS_LABELS, validateTransition } = require('./stateMachine')
const { createCommissionRecord } = require('./commission')
const { enrichBuyerFields } = require('./_enrichBuyers')
const { err } = require('../common/errors')
const { uploadShippingInfo, traceWaybill, followWaybill, queryTrace } = require('../common/wxLogistics')

const { db } = initCloud()
const _ = db.command
const logger = createLogger('adminService:mall')

const https = require('https')
const { URL } = require('url')

// 1688 外链图在浏览器/小程序端会因防盗链或跨域裂图。
// 导入时把图下载后转存到 CloudBase 存储，前端永远走自家 CDN。
async function store1688Image(srcUrl) {
  if (!srcUrl || !/^https?:\/\//.test(srcUrl)) { return srcUrl }
  const { cloud } = initCloud()
  return new Promise((resolve) => {
    const req = https.get(srcUrl, { timeout: 12000, headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://detail.1688.com/' } }, res => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // 跟随一次重定向
        res.resume()
        return store1688Image(res.headers.location).then(resolve, () => resolve(srcUrl))
      }
      if (!res.statusCode || res.statusCode >= 400) { res.resume(); return resolve(srcUrl) }
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', async () => {
        try {
          const buf = Buffer.concat(chunks)
          if (buf.length < 512) { return resolve(srcUrl) } // 太小疑似防盗链占位图
          const ext = (srcUrl.split('?')[0].match(/\.(jpg|jpeg|png|gif|webp|bmp)(?:$|[?#])/i) || [,'jpg'])[1].toLowerCase()
          const stamp = Date.now().toString(36)
          const rand = Math.random().toString(36).slice(2, 8)
          const cloudPath = `products/1688/${stamp}_${rand}.${ext}`
          const up = await cloud.uploadFile({ cloudPath, fileContent: buf })
          resolve(up.fileID)
        } catch (e) {
          logger.warn('store1688Image.uploadFailed', { srcUrl, msg: e?.message })
          resolve(srcUrl) // 降级：保留原外链，不阻断导入
        }
      })
    })
    req.on('error', () => resolve(srcUrl))
    req.on('timeout', () => { req.destroy(); resolve(srcUrl) })
  })
}

// 并发受限地转存一组图片（失败项保持原 URL）
async function store1688Images(urls, concurrency = 5) {
  const out = []
  let i = 0
  async function worker() {
    while (i < urls.length) {
      const idx = i++
      out[idx] = await store1688Image(urls[idx])
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, urls.length || 1) }, () => worker())
  await Promise.all(workers)
  return out
}

// ---- mantas 图片转存（复用 CloudBase 存储，避免前端裂图/防盗链） ----
// mantas 价格/图片需登录，服务端无登录抓不到；故插件在已登录页面内把图转成
// data:URL 传过来，云函数直接解码入库（最可靠）。http URL 走服务端带 Referer 下载兜底。
async function fetchStoreImage(url, folder, referer) {
  if (!url || !/^https?:\/\//.test(url)) { return url }
  const { cloud } = initCloud()
  return new Promise((resolve) => {
    const req = https.get(url, { timeout: 12000, headers: { 'User-Agent': 'Mozilla/5.0', Referer: referer } }, res => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        return fetchStoreImage(res.headers.location, folder, referer).then(resolve, () => resolve(url))
      }
      if (!res.statusCode || res.statusCode >= 400) { res.resume(); return resolve(url) }
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', async () => {
        try {
          const buf = Buffer.concat(chunks)
          if (buf.length < 512) { return resolve(url) }
          const ext = (url.split('?')[0].match(/\.(jpg|jpeg|png|gif|webp|bmp)(?:$|[?#])/i) || [,'jpg'])[1].toLowerCase()
          const stamp = Date.now().toString(36)
          const rand = Math.random().toString(36).slice(2, 8)
          const cloudPath = `${folder}/${stamp}_${rand}.${ext}`
          const up = await cloud.uploadFile({ cloudPath, fileContent: buf })
          resolve(up.fileID)
        } catch (e) {
          logger.warn('fetchStoreImage.uploadFailed', { url, msg: e?.message })
          resolve(url)
        }
      })
    })
    req.on('error', () => resolve(url))
    req.on('timeout', () => { req.destroy(); resolve(url) })
  })
}

async function storeDataUrlImage(dataUrl, folder = 'products/mantas') {
  if (!dataUrl || !/^data:image\//.test(dataUrl)) { return '' }
  const { cloud } = initCloud()
  try {
    const m = dataUrl.match(/^data:image\/([a-zA-Z]+);base64,(.*)$/)
    if (!m) { return '' }
    const ext = m[1] === 'jpeg' ? 'jpg' : m[1]
    const buf = Buffer.from(m[2], 'base64')
    if (buf.length < 200) { return '' }
    const stamp = Date.now().toString(36)
    const rand = Math.random().toString(36).slice(2, 8)
    const cloudPath = `${folder}/${stamp}_${rand}.${ext}`
    const up = await cloud.uploadFile({ cloudPath, fileContent: buf })
    return up.fileID
  } catch (e) {
    logger.warn('storeDataUrlImage.fail', { msg: e?.message })
    return ''
  }
}

async function storeMantasImage(src) {
  if (!src) { return '' }
  if (/\.tcb\.qcloud\.la\//.test(src)) { return src } // 已是自家存储 URL（分张上传的 fileId），透传不二次转存
  if (/^data:image\//.test(src)) { return storeDataUrlImage(src) }
  if (/^https?:\/\//.test(src)) { return fetchStoreImage(src, 'products/mantas', 'https://mall.mantas.cn/') }
  return src
}

async function storeMantasImages(urls, concurrency = 5) {
  const out = []
  let i = 0
  async function worker() {
    while (i < urls.length) {
      const idx = i++
      out[idx] = await storeMantasImage(urls[idx])
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, urls.length || 1) }, () => worker())
  await Promise.all(workers)
  return out
}

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
  if (keyword) {where.name = db.RegExp({ regexp: escapeRegExp(keyword), options: 'i' })}
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
  if (price !== undefined && Number(price) < 0) {throw err('INVALID_PARAMS', '商品价格不能为负')}

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

// ===================== 1688 一键导入（插件 action: import1688Product） =====================
// 入参（由浏览器插件在 1688 详情页抓取并转发）：
//   { offerId, title, sourceUrl, categoryPath, specGroups, skus, images, detailImages, basePrice, detailUrl }
// 规则（与插件 manifest 约定一致）：
//   - 售价 = 1688 原价 × 1.5；库存照搬
//   - 按 offerId 去重：已存在本人商品则覆盖更新，否则新建草稿
//   - 分类按 categoryPath 末级名称匹配已有分类，未匹配则置 uncategorized
async function import1688Product(event, context, auth) {
  const {
    offerId, title, sourceUrl, categoryPath,
    specGroups, skus, images, detailImages, basePrice, detailUrl,
  } = event
  if (!offerId) {throw err('INVALID_PARAMS', '缺少 1688 商品ID(offerId)')}
  if (!title) {throw err('INVALID_PARAMS', '缺少商品标题')}

  const safeNum = (v, d = 0) => {
    const n = Number(v)
    return Number.isFinite(n) ? n : d
  }
  // 1688 原价（起批价）；多规格时优先用各 SKU 自身零售价
  const base = safeNum(basePrice)

  // ---- 分类匹配：取 categoryPath 末级名称，模糊匹配已有 categories ----
  let category = 'uncategorized'
  let categoryId = ''
  let categoryName = ''
  const pathSegs = String(categoryPath || '').split(/[>/／\s]+/).map(s => s.trim()).filter(Boolean)
  const lastSeg = pathSegs[pathSegs.length - 1] || ''
  if (lastSeg) {
    try {
      const cats = await db.collection('categories').limit(100).get()
      const list = (cats.data || []).map(c => ({ key: c.key || '', label: c.label || '', id: c._id }))
      const hit = list.find(c => c.label === lastSeg || c.key === lastSeg)
      if (hit) {
        category = hit.key || 'uncategorized'
        categoryId = hit.id || ''
        categoryName = hit.label || lastSeg
      } else {
        categoryName = lastSeg
      }
    } catch (e) {
      logger.warn('import1688Product.categoryMatch', { msg: e?.message })
      categoryName = lastSeg
    }
  }

  const isMultiSku = Array.isArray(skus) && skus.length > 0

  // ---- 1688 外链图转存 CloudBase 存储（解决前端裂图/防盗链）----
  const rawImages = Array.isArray(images) ? images.filter(u => /^https?:\/\//.test(u)) : []
  const rawDetail = Array.isArray(detailImages) ? detailImages.filter(u => /^https?:\/\//.test(u)) : []
  const rawSkuImages = isMultiSku
    ? skus.map(s => s.imageUrl).filter(u => /^https?:\/\//.test(u || ''))
    : []
  // 合并去重后批量转存，减少重复上传
  const allUrls = [...new Set([...rawImages, ...rawDetail, ...rawSkuImages])]
  let storedMap = {}
  try {
    const stored = await store1688Images(allUrls, 5)
    allUrls.forEach((u, i) => { storedMap[u] = stored[i] })
  } catch (e) {
    logger.warn('import1688Product.storeImagesFailed', { msg: e?.message })
  }
  const toStored = (u) => (u && storedMap[u]) ? storedMap[u] : (u || '')

  const coverImage = rawImages.length > 0 ? toStored(rawImages[0]) : ''
  const storedImages = rawImages.map(toStored)
  const storedDetail = rawDetail.map(toStored)

  // ---- 构建产品文档（结构与 createProduct 保持一致，便于 web-admin 编辑） ----
  const product = {
    name: title,
    subTitle: '',
    description: '',
    category,
    categoryId,
    categoryName,
    skuType: isMultiSku ? 'multi' : 'single',
    coverImage,
    coverUrl: coverImage,
    images: storedImages,
    detailImages: storedDetail,
    tags: [],
    isFeatured: false,
    sortOrder: 0,
    source: '1688',
    sourceOfferId: String(offerId),
    sourceUrl: sourceUrl || '',
    detailUrl: detailUrl || '',
    createdBy: auth.openid,
    status: 'draft',
    createdAt: db.serverDate(),
    updatedAt: db.serverDate(),
  }

  if (isMultiSku) {
    product.specGroups = (specGroups || []).map(g => ({
      name: g.name || '',
      values: Array.isArray(g.values) ? g.values : [],
    }))
    product.skus = skus.map(sku => {
      // retail 优先取 SKU 零售价；0/无效（1688 常以 0 占位）时回退 sku.price 或起批价
      const retail = safeNum(sku.retailPrice) || safeNum(sku.price) || base
      const ourPrice = Math.round(retail * 1.5)
      return {
        skuId: sku.skuId != null ? String(sku.skuId) : `sku_${String(offerId)}_${Math.random().toString(36).slice(2, 8)}`,
        specIds: sku.specIds || {},
        specText: sku.specText || '',
        price: ourPrice,
        originalPrice: retail,
        stock: safeNum(sku.stock),
        soldCount: 0,
        skuCode: sku.skuCode || `1688_${String(offerId)}_${String(sku.skuId != null ? sku.skuId : Math.random().toString(36).slice(2, 6))}`,
        image: toStored(sku.imageUrl || ''),
      }
    })
    product.price = product.skus.length > 0 ? product.skus[0].price : 0
    product.originalPrice = product.skus.length > 0 ? (product.skus[0].originalPrice || 0) : 0
    product.stock = product.skus.reduce((s, x) => s + x.stock, 0)
    product.totalStock = product.stock
    const skuPrices = product.skus.map(s => Number(s.price)).filter(p => Number.isFinite(p))
    product.minPrice = skuPrices.length ? Math.min(...skuPrices) : product.price
    product.maxPrice = skuPrices.length ? Math.max(...skuPrices) : product.price
    product.soldCount = 0
  } else {
    const ourPrice = Math.round(base * 1.5)
    product.price = ourPrice
    product.originalPrice = base
    product.stock = 0
    product.totalStock = 0
    product.minPrice = ourPrice
    product.maxPrice = ourPrice
    product.soldCount = 0
  }

  // ---- 去重：本人名下已导入过该 offerId 则覆盖更新 ----
  const existRes = await db.collection('products')
    .where({ sourceOfferId: String(offerId), createdBy: auth.openid })
    .get()
  const exist = existRes.data && existRes.data[0]

  let productId
  let created
  if (exist && exist._id) {
    const updateData = {
      name: product.name,
      subTitle: product.subTitle,
      description: product.description,
      category: product.category,
      categoryId: product.categoryId,
      categoryName: product.categoryName,
      skuType: product.skuType,
      coverImage: product.coverImage,
      coverUrl: product.coverUrl,
      images: product.images,
      detailImages: product.detailImages,
      sourceUrl: product.sourceUrl,
      detailUrl: product.detailUrl,
      specGroups: product.specGroups,
      skus: product.skus,
      price: product.price,
      originalPrice: product.originalPrice,
      stock: product.stock,
      totalStock: product.totalStock,
      minPrice: product.minPrice,
      maxPrice: product.maxPrice,
      updatedAt: db.serverDate(),
    }
    await db.collection('products').doc(exist._id).update({ data: updateData })
    productId = exist._id
    created = false
  } else {
    product._id = generateId('product', auth.openid || auth.adminId)
    const res = await db.collection('products').add({ data: product })
    productId = res._id
    created = true
  }

  const skuCount = isMultiSku ? product.skus.length : 1
  logger.info('import1688Product', { offerId, productId, created, skuCount })
  return handleSuccess({
    productId,
    created,
    category,
    categoryName,
    skuCount,
  }, created ? '导入成功（草稿）' : '同步成功（覆盖更新）')
}

// ===================== mantas 一键导入（action: importMantasProduct） =====================
// 入参（由浏览器插件在 mall.mantas.cn 已登录详情页抓取并转发）：
//   { mantasSkuId, title, sourceUrl, categoryPath, specGroups, skus, images, detailImages, basePrice, shippingFee, markup }
// 规则：
//   - 售价 = mantas 订货价 × markup（默认 1.5）
//   - SKU 编码 = MGY{订货价}Y{运费}HZ{序号}（每规格一个，序号从 1 递增；运费每次导入输入一次、整商品共用）
//   - 按 mantasSkuId 去重：已存在本人商品则覆盖更新
//   - 图片：data:URL 直接解码入库；http URL 服务端带 Referer 转存（失败保留原链）
async function importMantasProduct(event, context, auth) {
  const {
    mantasSkuId, title, sourceUrl, categoryPath,
    specGroups, skus, images, detailImages, basePrice, shippingFee, markup,
  } = event
  if (!mantasSkuId) { throw err('INVALID_PARAMS', '缺少 mantas 商品ID(mantasSkuId)') }
  if (!title) { throw err('INVALID_PARAMS', '缺少商品标题') }
  if (shippingFee === undefined || shippingFee === null || shippingFee === '') {
    throw err('INVALID_PARAMS', '缺少运费（导入时需输入）')
  }
  const ship = Number(shippingFee)
  if (!Number.isFinite(ship) || ship < 0) { throw err('INVALID_PARAMS', '运费必须为非负数字') }
  const mk = Number(markup) > 0 ? Number(markup) : 1.5
  const safeNum = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d }
  const base = safeNum(basePrice)

  // 分类匹配：取 categoryPath 末级名称，模糊匹配已有 categories（同 1688）
  let category = 'uncategorized'
  let categoryId = ''
  let categoryName = ''
  const pathSegs = String(categoryPath || '').split(/[>/／\s]+/).map(s => s.trim()).filter(Boolean)
  const lastSeg = pathSegs[pathSegs.length - 1] || ''
  if (lastSeg) {
    try {
      const cats = await db.collection('categories').limit(100).get()
      const list = (cats.data || []).map(c => ({ key: c.key || '', label: c.label || '', id: c._id }))
      const hit = list.find(c => c.label === lastSeg || c.key === lastSeg)
      if (hit) {
        category = hit.key || 'uncategorized'
        categoryId = hit.id || ''
        categoryName = hit.label || lastSeg
      } else {
        categoryName = lastSeg
      }
    } catch (e) {
      logger.warn('importMantasProduct.categoryMatch', { msg: e?.message })
      categoryName = lastSeg
    }
  }

  const isMultiSku = Array.isArray(skus) && skus.length > 0

  // 图片：合并去重后批量转存（data URL / fileID 透传，http URL 兜底转存）
  const imgOk = (u) => /^(https?:|data:image\/|cloud:\/\/)/.test(u || '')
  const rawImages = Array.isArray(images) ? images.filter(imgOk) : []
  const rawDetail = Array.isArray(detailImages) ? detailImages.filter(imgOk) : []
  const rawSkuImages = isMultiSku
    ? skus.map(s => s.image || s.imageUrl).filter(u => imgOk(u || ''))
    : []
  const allUrls = [...new Set([...rawImages, ...rawDetail, ...rawSkuImages])]
  let storedMap = {}
  try {
    const stored = await storeMantasImages(allUrls, 5)
    allUrls.forEach((u, i) => { storedMap[u] = stored[i] })
  } catch (e) {
    logger.warn('importMantasProduct.storeImagesFailed', { msg: e?.message })
  }
  const toStored = (u) => (u && storedMap[u]) ? storedMap[u] : (u || '')

  const coverImage = rawImages.length > 0 ? toStored(rawImages[0]) : ''
  const storedImages = rawImages.map(toStored)
  const storedDetail = rawDetail.map(toStored)

  // SKU 编码：MGY{订货价}Y{运费}HZ{序号}
  const buildSkuCode = (price, seq) => `MGY${price}Y${ship}HZ${seq}`

  const product = {
    name: title,
    subTitle: '',
    description: '',
    category,
    categoryId,
    categoryName,
    skuType: isMultiSku ? 'multi' : 'single',
    coverImage,
    coverUrl: coverImage,
    images: storedImages,
    detailImages: storedDetail,
    tags: [],
    isFeatured: false,
    sortOrder: 0,
    source: 'mantas',
    sourceSkuId: String(mantasSkuId),
    sourceUrl: sourceUrl || '',
    shippingFee: ship,
    markup: mk,
    createdBy: auth.openid || auth.adminId || '',
    status: 'draft',
    createdAt: db.serverDate(),
    updatedAt: db.serverDate(),
  }

  if (isMultiSku) {
    product.specGroups = (specGroups || []).map(g => ({
      name: g.name || '',
      values: Array.isArray(g.values) ? g.values : [],
    }))
    product.skus = skus.map((sku, idx) => {
      const seq = idx + 1
      const mantasPrice = safeNum(sku.price) || safeNum(sku.retailPrice) || safeNum(sku.originalPrice) || base
      const ourPrice = Math.round(mantasPrice * mk)
      return {
        skuId: sku.skuId != null ? String(sku.skuId) : `m_${String(mantasSkuId)}_${seq}`,
        specIds: sku.specIds || {},
        specText: sku.specText || '',
        price: ourPrice,
        originalPrice: mantasPrice,
        stock: safeNum(sku.stock),
        soldCount: 0,
        skuCode: buildSkuCode(mantasPrice, seq),
        image: toStored(sku.image || sku.imageUrl || ''),
      }
    })
    product.price = product.skus.length > 0 ? product.skus[0].price : 0
    product.originalPrice = product.skus.length > 0 ? (product.skus[0].originalPrice || 0) : 0
    product.stock = product.skus.reduce((s, x) => s + x.stock, 0)
    product.totalStock = product.stock
    const skuPrices = product.skus.map(s => Number(s.price)).filter(p => Number.isFinite(p))
    product.minPrice = skuPrices.length ? Math.min(...skuPrices) : product.price
    product.maxPrice = skuPrices.length ? Math.max(...skuPrices) : product.price
    product.soldCount = 0
  } else {
    const mantasPrice = safeNum(basePrice)
    const ourPrice = Math.round(mantasPrice * mk)
    product.price = ourPrice
    product.originalPrice = mantasPrice
    product.stock = 0
    product.totalStock = 0
    product.minPrice = ourPrice
    product.maxPrice = ourPrice
    product.soldCount = 0
    // 单规格也落一条 sku，保证 skuCode 与多规格一致
    product.skus = [{
      skuId: `m_${String(mantasSkuId)}_1`,
      specIds: {},
      specText: '',
      price: ourPrice,
      originalPrice: mantasPrice,
      stock: 0,
      soldCount: 0,
      skuCode: buildSkuCode(mantasPrice, 1),
      image: coverImage,
    }]
  }

  // 去重：本人名下已导入过该 mantasSkuId 则覆盖更新（web 登录时 openid 为空，用 adminId 归属）
  const owner = auth.openid || auth.adminId || ''
  const dedupWhere = owner
    ? { sourceSkuId: String(mantasSkuId), createdBy: owner }
    : { sourceSkuId: String(mantasSkuId) }
  const existRes = await db.collection('products').where(dedupWhere).get()
  const exist = existRes.data && existRes.data[0]

  let productId
  let created
  if (exist && exist._id) {
    const updateData = {
      name: product.name,
      subTitle: product.subTitle,
      description: product.description,
      category: product.category,
      categoryId: product.categoryId,
      categoryName: product.categoryName,
      skuType: product.skuType,
      coverImage: product.coverImage,
      coverUrl: product.coverUrl,
      images: product.images,
      detailImages: product.detailImages,
      sourceUrl: product.sourceUrl,
      shippingFee: product.shippingFee,
      markup: product.markup,
      specGroups: product.specGroups,
      skus: product.skus,
      price: product.price,
      originalPrice: product.originalPrice,
      stock: product.stock,
      totalStock: product.totalStock,
      minPrice: product.minPrice,
      maxPrice: product.maxPrice,
      updatedAt: db.serverDate(),
    }
    await db.collection('products').doc(exist._id).update({ data: updateData })
    productId = exist._id
    created = false
  } else {
    product._id = generateId('product', auth.openid || auth.adminId)
    const res = await db.collection('products').add({ data: product })
    productId = res._id
    created = true
  }

  const skuCount = product.skus.length
  logger.info('importMantasProduct', { mantasSkuId, productId, created, skuCount })
  return handleSuccess({
    productId,
    created,
    category,
    categoryName,
    skuCount,
  }, created ? '导入成功（草稿）' : '同步成功（覆盖更新）')
}

// 分张上传：插件在已登录页面把单张图转 dataURL 后，单独调本 action 转存 CloudBase 存储，
// 返回 fileID；最后 importMantasProduct 只收 fileID 列表 → 请求体极小，绕开网关 ~6MB payload 上限。
// 入参：{ image }（data:URL 或 http(s) URL，单张）；返回 { fileId }
async function uploadMantasImage(event, context, auth) {
  const { image } = event
  if (!image) { throw err('INVALID_PARAMS', '缺少图片(image)') }
  if (!/^(data:image\/|https?:)/.test(image)) { throw err('INVALID_PARAMS', '图片格式不支持（需 data:URL 或 http(s) URL）') }
  const fileId = await storeMantasImage(image)
  if (!fileId || fileId === image) {
    throw err('STORE_FAILED', '图片转存失败，请重试')
  }
  logger.info('uploadMantasImage', { fileId: String(fileId).slice(0, 60), ok: true })
  return handleSuccess({ fileId })
}

async function updateProduct(event, context, auth) {
  const { productId } = event
  if (!productId) {throw err('INVALID_PARAMS', '缺少商品ID')}
  if (event.price !== undefined && Number(event.price) < 0) {throw err('INVALID_PARAMS', '商品价格不能为负')}

  const existing = await db.collection('products').doc(productId).get()
  if (!existing.data) {throw err('PRODUCT_NOT_FOUND', '商品不存在')}
  if (!auth.isSuperAdmin && existing.data.createdBy !== auth.openid) {
    throw err('PERMISSION_DENIED', '无权操作他人资源')
  }

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
  if (!auth.isSuperAdmin && product.data.createdBy !== auth.openid) {
    throw err('PERMISSION_DENIED', '无权操作他人资源')
  }
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
  // 资源归属过滤：super_admin 可操作所有，其他角色仅可操作自己创建的商品
  const ownerFilter = auth.isSuperAdmin ? {} : { createdBy: auth.openid }
  const where = { _id: _.in(productIds), ...ownerFilter }

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
    await db.collection('products').where(where).remove()
    return handleSuccess(null, '批量删除成功')
  default:
    throw err('INVALID_PARAMS', '无效操作')
  }

  await db.collection('products').where(where).update({ data: updateData })
  return handleSuccess(null, '批量操作成功')
}

async function cloneProduct(event, context, auth) {
  const { productId } = event
  if (!productId) {throw err('INVALID_PARAMS', '缺少商品ID')}

  const source = await db.collection('products').doc(productId).get()
  if (!source.data) {throw err('PRODUCT_NOT_FOUND', '商品不存在')}
  if (!auth.isSuperAdmin && source.data.createdBy !== auth.openid) {
    throw err('PERMISSION_DENIED', '无权操作他人资源')
  }

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
  const { status, paymentStatus, page = 1, pageSize = 20, keyword, startDate, endDate } = event
  const where = { type: 'mall' }
  // H5: 与 mallService 对齐——单状态筛选时精确匹配，否则排除已删除单
  // 单状态筛选天然不会命中 deleted 单（deleted 单 status='deleted'），只有显式查 deleted 才放行
  if (status && status !== 'all' && status !== 'deleted') {
    where.status = status
  } else {
    where.status = _.neq('deleted')
  }
  if (paymentStatus) {where.paymentStatus = paymentStatus}
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
  if (keyword) {
    where.$or = [
      { orderNo: db.RegExp({ regexp: escapeRegExp(keyword), options: 'i' }) },
      { productName: db.RegExp({ regexp: escapeRegExp(keyword), options: 'i' }) },
      { ownerName: db.RegExp({ regexp: escapeRegExp(keyword), options: 'i' }) },
    ]
  }

  const result = await paginate(db, 'orders', {
    page, pageSize, where,
    orderBy: { field: 'createdAt', direction: 'desc' },
  })

  const list = result.list || []
  // 与 activity/feeding/hosting 对齐：缺失的 buyerNickName 走 users 表 join（按 ownerId），
  // 商城订单 ownerName 多为空字符串，receiverName 才能作为兜底。
  const enrichedList = await enrichBuyerFields(db, list)

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
    validateTransition(LOGISTICS_ORDER_TRANSITIONS, orderRes.data.status, newStatus)
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
  if (!expressCompany) {throw err('INVALID_PARAMS', '请选择快递公司')}

  const orderRes = await db.collection('orders').doc(orderId).get()
  if (!orderRes.data) {throw err('NOT_FOUND', '订单不存在')}
  if (orderRes.data.type !== 'mall') {throw err('BUSINESS_ERROR', '非商城订单')}

  try {
    validateTransition(LOGISTICS_ORDER_TRANSITIONS, orderRes.data.status, 'shipped')
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

  // 同步推送到微信「发货信息管理」，best-effort：失败只记日志，不阻断发货
  const transactionId = orderRes.data.wxTransactionId || orderRes.data.transactionId || ''
  if (transactionId) {
    try {
      const wxRes = await uploadShippingInfo({
        transactionId,
        merchantTradeNo: orderId,
        shippingItem: {
          expressCompany,
          expressNo,
          itemDesc: `${orderRes.data.productName || '商品'} ×${orderRes.data.quantity || 1}`,
        },
      })
      if (!wxRes.ok) {
        logger.warn('shipMallOrder.uploadShippingInfo.fail', {
          orderId, transactionId, expressNo, error: wxRes.error,
        })
      }
    } catch (e) {
      logger.warn('shipMallOrder.uploadShippingInfo.exception', {
        orderId, msg: (e && e.message) || String(e),
      })
    }

    // 调微信「物流查询组件」trace_waybill 拿 waybillToken 存到订单
    // 前端 logistics-card 调 plugin.openWaybillTracking({waybillToken}) 拉起原生物流详情页
    // best-effort：失败只记日志，不阻断发货（用户仍可看到快递单号）
    const openid = orderRes.data.ownerId || ''
    const receiverPhone = orderRes.data.receiverPhone || ''
    const productImage = orderRes.data.productImage || ''
    const productName = orderRes.data.productName || '商品'
    if (openid && receiverPhone) {
      try {
        const traceRes = await traceWaybill({
          openid,
          receiverPhone,
          waybillId: expressNo,
          transId: transactionId,
          orderDetailPath: `subpackages/profile/mall-order-detail/index?id=${orderId}`,
          goodsInfo: [{
            goodsName: productName,
            goodsImgUrl: productImage,
          }],
          deliveryId: expressCompany,
        })
        if (traceRes.ok && traceRes.waybillToken) {
          await db.collection('orders').doc(orderId).update({
            data: { waybillToken: traceRes.waybillToken, updatedAt: db.serverDate() },
          })
        } else {
          logger.warn('shipMallOrder.traceWaybill.fail', {
            orderId, transactionId, expressNo, error: traceRes.error,
          })
        }
      } catch (e) {
        logger.warn('shipMallOrder.traceWaybill.exception', {
          orderId, msg: (e && e.message) || String(e),
        })
      }
    } else {
      logger.warn('shipMallOrder.traceWaybill.skip', {
        orderId, hasOpenid: Boolean(openid), hasReceiverPhone: Boolean(receiverPhone),
      })
    }

    // 调微信「物流消息能力」follow_waybill 触发服务通知推送
    // 微信在「已揽件/派件中/已签收」三个关键节点主动给用户推送服务通知
    // best-effort：失败只记日志，不阻断发货（与 traceWaybill 容错策略一致）
    if (openid && receiverPhone) {
      try {
        const followRes = await followWaybill({
          openid,
          receiverPhone,
          waybillId: expressNo,
          transId: transactionId,
          orderDetailPath: `subpackages/profile/mall-order-detail/index?id=${orderId}`,
          goodsInfo: [{
            goodsName: productName,
            goodsImgUrl: productImage,
          }],
          deliveryId: expressCompany,
        })
        if (followRes.ok && followRes.waybillToken) {
          // followWaybillToken 与 traceWaybill 的 waybillToken 用途不同，单独存储备 query_follow_trace 用
          await db.collection('orders').doc(orderId).update({
            data: { followWaybillToken: followRes.waybillToken, updatedAt: db.serverDate() },
          })
        } else {
          logger.warn('shipMallOrder.followWaybill.fail', {
            orderId, transactionId, expressNo, error: followRes.error,
          })
        }
      } catch (e) {
        logger.warn('shipMallOrder.followWaybill.exception', {
          orderId, msg: (e && e.message) || String(e),
        })
      }
    }
  }

  return handleSuccess(null, '发货成功')
}

async function completeMallOrder(event, context, auth) {
  const { orderId } = event
  if (!orderId) {throw err('INVALID_PARAMS', '缺少订单ID')}

  const orderRes = await db.collection('orders').doc(orderId).get()
  if (!orderRes.data) {throw err('NOT_FOUND', '订单不存在')}

  try {
    validateTransition(LOGISTICS_ORDER_TRANSITIONS, orderRes.data.status, 'completed')
  } catch (e) {
    return handleError(e, e.message, ERROR_CODES.BUSINESS)
  }

  await db.collection('orders').doc(orderId).update({
    data: { status: 'completed', updatedAt: db.serverDate() },
  })

  await createCommissionRecord('mall', orderRes.data)

  return handleSuccess(null, '订单已完成')
}

/**
 * 查询商城订单物流轨迹（web-admin 后台用）。
 *
 * 数据流：
 *   1. 从 orders 表读订单的 waybillToken + ownerId
 *   2. 调微信 query_trace 接口拿运单状态
 *   3. 返回 { status, statusLabel, statusColor, waybillId, goodsInfo }
 *
 * 注意：
 *   - 历史订单（无 waybillToken）返回 code=1 提示「该订单未推送物流查询组件」
 *   - query_trace 不返回轨迹节点列表，只有当前状态（0-6）
 */
async function getLogisticsTrack(event, context, auth) {
  const { orderId } = event
  if (!orderId) {throw err('INVALID_PARAMS', '缺少订单ID')}

  const orderRes = await db.collection('orders').doc(orderId).get()
  if (!orderRes.data) {throw err('NOT_FOUND', '订单不存在')}

  const order = orderRes.data
  if (!order.waybillToken) {
    return handleSuccess({
      status: -1,
      statusLabel: '未推送查询组件',
      statusColor: '#909399',
      waybillId: order.expressNo || '',
      expressCompany: order.expressCompany || '',
      goodsInfo: [],
    }, '该订单未推送物流查询组件（历史订单或发货失败）')
  }

  const traceRes = await queryTrace({
    waybillToken: order.waybillToken,
    openid: order.ownerId || '',
  })

  if (!traceRes.ok) {
    logger.warn('getLogisticsTrack.queryTrace.fail', { orderId, error: traceRes.error })
    return handleSuccess({
      status: -1,
      statusLabel: '查询失败',
      statusColor: '#f56c6c',
      waybillId: order.expressNo || '',
      expressCompany: order.expressCompany || '',
      goodsInfo: [],
      error: traceRes.error,
    }, traceRes.error || '查询物流状态失败')
  }

  return handleSuccess({
    status: traceRes.status,
    statusLabel: traceRes.statusLabel,
    statusColor: traceRes.statusColor,
    waybillId: traceRes.waybillId || order.expressNo || '',
    expressCompany: order.expressCompany || '',
    goodsInfo: traceRes.goodsInfo || [],
  })
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

// 分类商品数精确统计：单次 get 上限 1000 条，必须分页扫全量，否则商品过千后计数偏小。
// 按 _id 升序 + skip 分页保证分页稳定；MAX_PAGES 为安全阀，防止异常情况下死循环。
async function getCategoryStats() {
  const PAGE_SIZE = 1000
  const MAX_PAGES = 100
  try {
    const stats = {}
    let page = 0
    let scanned = 0
    while (page < MAX_PAGES) {
      const res = await db.collection('products')
        .field({ category: true, categoryId: true })
        .orderBy('_id', 'asc')
        .skip(page * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .get()
      const rows = res.data || []
      for (const item of rows) {
        if (item.category) {
          stats[item.category] = (stats[item.category] || 0) + 1
        }
        if (item.categoryId) {
          stats[item.categoryId] = (stats[item.categoryId] || 0) + 1
        }
      }
      scanned += rows.length
      if (rows.length < PAGE_SIZE) break
      page++
    }
    logger.info('getCategoryStats', { scanned, page })
    return handleSuccess(stats, '获取成功')
  } catch (error) {
    logger.error('getCategoryStats', error)
    return handleSuccess({}, '获取成功')
  }
}

async function listCategories() {
  try {
    // M9 对齐 mallService：分页拉取直到拉完，避免分类膨胀时 limit(100) 静默截断
    const all = []
    const PAGE_SIZE = 100
    let page = 0
    while (true) {
      const res = await db.collection('categories')
        .orderBy('sortOrder', 'asc')
        .skip(page * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .get()
      const data = res.data || []
      all.push(...data)
      if (data.length < PAGE_SIZE) {break}
      page++
      if (page >= 10) {break}
    }
    return handleSuccess(all, '获取成功')
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
    // 同时检查一级分类（category）与子分类（categoryId），防止商品挂在子分类时误删一级分类
    const productCount = await db.collection('products')
      .where(_.or([{ category: categoryKey }, { categoryId: categoryKey }]))
      .count()
    if (productCount.total > 0) {
      throw err('CATEGORY_HAS_PRODUCTS', `该分类下有 ${productCount.total} 个商品，无法删除`)
    }
  }

  await db.collection('categories').doc(categoryId).remove()
  return handleSuccess(null, '删除成功')
}

module.exports = {
  getProductList, getProductDetail, createProduct, updateProduct, deleteProduct,
  batchUpdateProducts, cloneProduct, import1688Product, importMantasProduct, uploadMantasImage,
  getMallOrders, getMallOrderDetail, handleMallOrder, shipMallOrder, completeMallOrder,
  getLogisticsTrack,
  getProductStats, getCategoryStats,
  listCategories, createCategory, updateCategory, deleteCategory,
}
