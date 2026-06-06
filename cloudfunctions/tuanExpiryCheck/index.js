const cloud = require('wx-server-sdk')
const { createLogger } = require('../common/logger')
// Sprint 31: 统一使用 handleSuccess / handleError
const { handleSuccess, handleError } = require('../common/utils')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const logger = createLogger('tuanExpiryCheck')

exports.main = async (event, context) => {
  logger.info('start')

  const now = new Date()

  try {
    const res = await db.collection('tuan_deals')
      .where({
        status: _.in(['published', 'active']),
        endTime: _.lt(now),
      })
      .update({
        data: {
          status: 'ended',
          updatedAt: db.serverDate(),
        },
      })

    logger.info('done', { updated: res.stats.updated })
    return handleSuccess({ updatedCount: res.stats.updated }, '团购过期检查完成')
  } catch (error) {
    logger.error('main', error)
    return handleError(error, '团购过期检查失败')
  }
}
