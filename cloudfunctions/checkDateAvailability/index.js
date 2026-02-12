const cloud = require('wx-server-sdk')
const moment = require('moment')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

exports.main = async (event, context) => {
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error('查询超时，请稍后再试'))
    }, 2500) // 设置 2.5 秒超时，留出缓冲时间
  })

  const mainPromise = (async () => {
    try {
      const { date, hostId } = event
      
      if (!date || !hostId) {
        return {
          code: -1,
          message: '缺少日期或寄养家庭ID参数'
        }
      }
      
      // 格式化日期
      const formattedDate = moment(date).format('YYYY-MM-DD')
      
      // 查询该日期是否已被预订
      const db = cloud.database()
      const conflictingOrders = await db.collection('orders').where({
        hostOpenid: hostId,
        status: db.command.neq('cancelled'),
        startDate: db.command.lte(formattedDate),
        endDate: db.command.gte(formattedDate)
      }).get()
      
      const isAvailable = conflictingOrders.data.length === 0
      
      return {
        code: 0,
        message: '查询成功',
        data: {
          isAvailable: isAvailable
        }
      }
    } catch (error) {
      console.error('检查日期可用性失败:', error)
      return {
        code: -1,
        message: '查询失败',
        error: error.message
      }
    }
  })()

  try {
    return await Promise.race([mainPromise, timeoutPromise])
  } catch (error) {
    console.error('查询超时或失败:', error)
    return {
      code: -1,
      message: '查询超时，请稍后再试'
    }
  }
}