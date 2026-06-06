const { initCloud, handleSuccess, handleError, ERROR_CODES } = require('./common/utils')
const { createLogger } = require('./common/logger')
const { verifyAuth } = require('./common/auth-middleware')
const { err } = require('./common/errors')

const { cloud, db } = initCloud()
const logger = createLogger('favoriteService')
const _ = db.command

async function addFavorite(event, openid, dbInstance) {
  const { targetType, targetId } = event
  if (!targetType || !targetId) {
    throw err('INVALID_PARAMS', '缺少收藏目标信息')
  }

  const existing = await dbInstance.collection('favorites')
    .where({ ownerId: openid, targetType, targetId })
    .limit(1)
    .get()

  if (existing.data && existing.data.length > 0) {
    throw err('BUSINESS_ERROR', '已经收藏过了')
  }

  await dbInstance.collection('favorites').add({
    data: {
      ownerId: openid,
      targetType,
      targetId,
      createdAt: dbInstance.serverDate(),
    },
  })

  return handleSuccess(null, '收藏成功')
}

async function removeFavorite(event, openid, dbInstance) {
  const { targetType, targetId } = event
  if (!targetType || !targetId) {
    throw err('INVALID_PARAMS', '缺少收藏目标信息')
  }

  await dbInstance.collection('favorites')
    .where({ ownerId: openid, targetType, targetId })
    .remove()

  return handleSuccess(null, '取消收藏成功')
}

async function getFavorites(event, openid, dbInstance) {
  const { targetType, page = 1, pageSize = 20 } = event
  const where = { ownerId: openid }
  if (targetType) {where.targetType = targetType}

  const countRes = await dbInstance.collection('favorites').where(where).count()
  const listRes = await dbInstance.collection('favorites')
    .where(where)
    .orderBy('createdAt', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get()

  return handleSuccess({
    list: listRes.data,
    total: countRes.total,
    page,
    pageSize,
  })
}

const handlers = {
  add: addFavorite,
  remove: removeFavorite,
  list: getFavorites,
}

exports.main = async (event, context) => {
  const { action } = event

  try {
    const auth = await verifyAuth(event, { requireLogin: true })
    logger.info(action, { openid: auth.openid })

    if (!action || !handlers[action]) {
      throw err('INVALID_PARAMS', `未知的 action: ${action}`)
    }

    return await handlers[action](event, auth.openid, db)
  } catch (error) {
    logger.error(action, error)
    const code = error.code || ERROR_CODES.BUSINESS
    return handleError(error, error.message, code)
  }
}
