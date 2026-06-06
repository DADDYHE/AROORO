const { handleSuccess, ERROR_CODES, initCloud } = require('../common/utils')
const { createLogger } = require('../common/logger')
const { err, withErrorHandling } = require('../common/errors')
const { ORDER_TYPES, ORDER_TYPE_NAMES } = require('../constants')

const logger = createLogger('adminService.commissionConfig')

const getCommissionConfig = withErrorHandling(async (event, context, auth) => {
  const { db } = initCloud()
  let config = {}
  try {
    const res = await db.collection('system_config').doc('commission_rates').get()
    config = res.data || {}
  } catch (e) {
    logger.warn('getCommissionConfig.system_config', { code: e.errCode, msg: e.message })
  }
  const rates = {}
  ORDER_TYPES.forEach(type => {
    rates[type] = config[type] !== undefined ? config[type] : 0
  })
  return handleSuccess({ rates, updatedAt: config.updatedAt, updatedBy: config.updatedBy })
})

const updateCommissionConfig = withErrorHandling(async (event, context, auth) => {
  const { db } = initCloud()
  const { rates } = event
  if (!rates || typeof rates !== 'object') {throw err('INVALID_PARAMS', '配置格式错误')}

  const data = { updatedBy: auth.openid, updatedAt: new Date() }
  const submittedTypes = Object.keys(rates)
  for (const type of submittedTypes) {
    if (!ORDER_TYPES.includes(type)) {continue}
    const rate = Number(rates[type])
    if (isNaN(rate) || rate < 0 || rate > 100) {throw err('INVALID_PARAMS', `${ORDER_TYPE_NAMES[type]}分佣比例须在0-100之间`)}
    data[type] = rate
  }

  if (Object.keys(data).length <= 2) {throw err('INVALID_PARAMS', '没有需要更新的字段')}

  await db.collection('system_config').doc('commission_rates').set({ data })
  return handleSuccess(data)
})

module.exports = {
  getCommissionConfig,
  updateCommissionConfig,
}
