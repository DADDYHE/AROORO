const { handleSuccess, generateId } = require('../common/utils')
const { initCloud } = require('../common/utils')
const { createLogger } = require('../common/logger')
const { withErrorHandling, err } = require('../common/errors')

const { db, cloud } = initCloud()
const logger = createLogger('bannerService')

/**
 * P2 修复：banner 变更后联动清除用户端缓存（utilityService.getBanners 5 分钟内存缓存），
 *   避免运营改动后首页最长延迟 5 分钟生效。best-effort，失败仅记日志。
 */
async function clearUserBannerCache() {
  try {
    await cloud.callFunction({
      name: 'utilityService',
      data: { action: 'clearBannersCache' },
    })
  } catch (e) {
    logger.warn('clearUserBannerCache.failed', { msg: e?.message || String(e) })
  }
}

const getBannerList = withErrorHandling(async () => {
  const result = await db.collection('banners')
    .orderBy('sortOrder', 'asc')
    .orderBy('createdAt', 'desc')
    .get()
  const list = result.data || []
  return handleSuccess({ list }, '获取成功')
})

const getBannerDetail = withErrorHandling(async event => {
  const { bannerId } = event
  if (!bannerId) {
    throw err('INVALID_PARAMS', '缺少轮播图ID')
  }
  const result = await db.collection('banners').doc(bannerId).get()
  if (!result.data) {
    throw err('BANNER_NOT_FOUND', '轮播图不存在', { bannerId })
  }
  return handleSuccess(result.data, '获取成功')
})

const createBanner = withErrorHandling(async (event, context, auth) => {
  const { title, subtitle, tag, ctaText, imageUrl, actionType, actionTarget, status } = event
  if (!title || !imageUrl) {
    throw err('INVALID_PARAMS', '标题和图片为必填项')
  }

  const countResult = await db.collection('banners').count()
  const sortOrder = countResult.total || 0

  const banner = {
    title,
    subtitle: subtitle || '',
    tag: tag || '',
    ctaText: ctaText || '',
    imageUrl,
    actionType: actionType || 'boarding',
    actionTarget: actionTarget || '',
    status: status || 'active',
    sortOrder,
    createdBy: auth.openid,
    createdAt: db.serverDate(),
    updatedAt: db.serverDate(),
  }

  banner._id = generateId('banner', auth.openid || auth.adminId)
  const result = await db.collection('banners').add({ data: banner })
  await clearUserBannerCache()
  return handleSuccess({ _id: result._id, ...banner }, '创建成功')
})

const updateBanner = withErrorHandling(async event => {
  const { bannerId, title, subtitle, tag, ctaText, imageUrl, actionType, actionTarget, status } = event
  if (!bannerId) {
    throw err('INVALID_PARAMS', '缺少轮播图ID')
  }

  const existRes = await db.collection('banners').doc(bannerId).get()
  if (!existRes.data) {
    throw err('BANNER_NOT_FOUND', '轮播图不存在', { bannerId })
  }

  const updateData = {
    updatedAt: db.serverDate(),
  }
  if (title !== undefined) {updateData.title = title}
  if (subtitle !== undefined) {updateData.subtitle = subtitle}
  if (tag !== undefined) {updateData.tag = tag}
  if (ctaText !== undefined) {updateData.ctaText = ctaText}
  if (imageUrl !== undefined) {
    // P2 修复：允许 cloud:// / http(s):// / 相对路径；非法格式直接报错（原实现静默忽略 http 图片）
    if (typeof imageUrl !== 'string' || !/^(cloud:\/\/|https?:\/\/|\/)/.test(imageUrl)) {
      throw err('INVALID_PARAMS', '图片链接格式无效（支持 cloud://、http(s):// 或相对路径）')
    }
    updateData.imageUrl = imageUrl
  }
  if (actionType !== undefined) {updateData.actionType = actionType}
  if (actionTarget !== undefined) {updateData.actionTarget = actionTarget}
  if (status !== undefined) {updateData.status = status}

  await db.collection('banners').doc(bannerId).update({ data: updateData })
  await clearUserBannerCache()
  return handleSuccess(null, '更新成功')
})

const updateBannerStatus = withErrorHandling(async event => {
  const { bannerId, status } = event
  if (!bannerId || !status) {
    throw err('INVALID_PARAMS', '缺少必要参数')
  }
  // P3 修复：状态白名单校验
  if (!['active', 'inactive'].includes(status)) {
    throw err('INVALID_PARAMS', `无效的状态值：${status}`)
  }

  await db.collection('banners').doc(bannerId).update({
    data: { status, updatedAt: db.serverDate() },
  })
  await clearUserBannerCache()
  return handleSuccess(null, '更新成功')
})

const updateBannerSortOrder = withErrorHandling(async event => {
  const { orderList } = event
  if (!orderList || !Array.isArray(orderList)) {
    throw err('INVALID_PARAMS', '缺少排序数据')
  }
  // P3 修复：校验每一项必须包含 id 与数字 sortOrder
  for (const item of orderList) {
    if (!item || typeof item.id !== 'string' || !item.id) {
      throw err('INVALID_PARAMS', '排序数据格式错误')
    }
    const sortOrder = Number(item.sortOrder)
    if (!Number.isFinite(sortOrder) || sortOrder < 0) {
      throw err('INVALID_PARAMS', '排序值必须为非负数字')
    }
  }

  const tasks = orderList.map(item => {
    const sortOrder = Number(item.sortOrder)
    return db.collection('banners').doc(item.id).update({
      data: { sortOrder, updatedAt: db.serverDate() },
    })
  })
  await Promise.all(tasks)
  await clearUserBannerCache()
  return handleSuccess(null, '排序更新成功')
})

const deleteBanner = withErrorHandling(async event => {
  const { bannerId } = event
  if (!bannerId) {
    throw err('INVALID_PARAMS', '缺少轮播图ID')
  }

  const existRes = await db.collection('banners').doc(bannerId).get()
  const banner = existRes.data
  if (!banner) {
    throw err('BANNER_NOT_FOUND', '轮播图不存在', { bannerId })
  }
  // P3 修复：先删记录成功后再清理云文件，避免记录删除失败时文件已被删
  await db.collection('banners').doc(bannerId).remove()
  if (banner && banner.imageUrl && banner.imageUrl.startsWith('cloud://')) {
    try {
      await cloud.deleteFile({ fileList: [banner.imageUrl] })
    } catch (e) {
      logger.error('deleteBanner:deleteFile', e)
    }
  }
  await clearUserBannerCache()
  return handleSuccess(null, '删除成功')
})

const resolveCloudUrls = withErrorHandling(async event => {
  const { urls } = event
  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return handleSuccess({}, '无URL需要转换')
  }

  const BATCH_SIZE = 50
  const result = {}
  for (let i = 0; i < urls.length; i += BATCH_SIZE) {
    const chunk = urls.slice(i, i + BATCH_SIZE)
    try {
      const tmpResult = await cloud.getTempFileURL({ fileList: chunk })
      for (const f of tmpResult.fileList || []) {
        if (f.tempFileURL) {
          result[f.fileID] = f.tempFileURL
        }
      }
    } catch (e) {
      logger.error('resolveCloudUrls:batch', e)
    }
  }
  return handleSuccess(result, '转换成功')
})

module.exports = {
  getBannerList,
  getBannerDetail,
  createBanner,
  updateBanner,
  updateBannerStatus,
  updateBannerSortOrder,
  deleteBanner,
  resolveCloudUrls,
}
