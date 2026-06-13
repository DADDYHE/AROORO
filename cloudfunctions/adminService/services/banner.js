const { handleSuccess, generateId } = require('../common/utils')
const { initCloud } = require('../common/utils')
const { createLogger } = require('../common/logger')
const { withErrorHandling, err } = require('../common/errors')

const { db, cloud } = initCloud()
const logger = createLogger('bannerService')

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
    if (imageUrl.startsWith('cloud://')) {
      updateData.imageUrl = imageUrl
    }
  }
  if (actionType !== undefined) {updateData.actionType = actionType}
  if (actionTarget !== undefined) {updateData.actionTarget = actionTarget}
  if (status !== undefined) {updateData.status = status}

  await db.collection('banners').doc(bannerId).update({ data: updateData })
  return handleSuccess(null, '更新成功')
})

const updateBannerStatus = withErrorHandling(async event => {
  const { bannerId, status } = event
  if (!bannerId || !status) {
    throw err('INVALID_PARAMS', '缺少必要参数')
  }

  await db.collection('banners').doc(bannerId).update({
    data: { status, updatedAt: db.serverDate() },
  })
  return handleSuccess(null, '更新成功')
})

const updateBannerSortOrder = withErrorHandling(async event => {
  const { orderList } = event
  if (!orderList || !Array.isArray(orderList)) {
    throw err('INVALID_PARAMS', '缺少排序数据')
  }

  const tasks = orderList.map(item =>
    db.collection('banners').doc(item.id).update({
      data: { sortOrder: item.sortOrder, updatedAt: db.serverDate() },
    })
  )
  await Promise.all(tasks)
  return handleSuccess(null, '排序更新成功')
})

const deleteBanner = withErrorHandling(async event => {
  const { bannerId } = event
  if (!bannerId) {
    throw err('INVALID_PARAMS', '缺少轮播图ID')
  }

  const existRes = await db.collection('banners').doc(bannerId).get()
  const banner = existRes.data
  if (banner && banner.imageUrl && banner.imageUrl.startsWith('cloud://')) {
    try {
      await cloud.deleteFile({ fileList: [banner.imageUrl] })
    } catch (e) {
      logger.error('deleteBanner:deleteFile', e)
    }
  }
  await db.collection('banners').doc(bannerId).remove()
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
