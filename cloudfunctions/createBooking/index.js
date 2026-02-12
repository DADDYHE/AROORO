const cloud = require('wx-server-sdk')
const moment = require('moment')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

exports.main = async (event, context) => {
  // 设置超时控制，确保在2.5秒内完成
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('查询超时')), 2500)
  })

  const mainPromise = (async () => {
    try {
      // 从事件中获取订单数据
      const { 
        userId, 
        hostId, 
        hostProfileId, 
        startDate, 
        endDate, 
        days, 
        petIds, 
        requirements, 
        basicPrice, 
        discount, 
        totalPrice,
        ownerOpenid,
        hostOpenid
      } = event
      
      // 验证必要的参数
      if (!userId || !startDate || !endDate || !petIds || !ownerOpenid || !hostOpenid) {
        return {
          code: -1,
          message: '缺少必要参数'
        }
      }
      
      // 格式化日期
      const formattedStartDate = moment(startDate).format('YYYY-MM-DD')
      const formattedEndDate = moment(endDate).format('YYYY-MM-DD')
      
      // 计算天数
      const duration = days || moment(endDate).diff(moment(startDate), 'days') + 1
      
      // 生成唯一订单ID
      function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2)
      }
      
      // 创建订单
      const orderData = {
        _id: generateId(),
        ownerId: userId,
        hostId: hostId,
        hostProfileId: hostProfileId,
        petIds: petIds,
        startDate: formattedStartDate,
        endDate: formattedEndDate,
        duration: duration,
        totalPrice: totalPrice,
        status: 'pending', // pending: 待确认, confirmed: 已确认, completed: 已完成, canceled: 已取消
        requirements: requirements,
        ownerOpenid: ownerOpenid,
        hostOpenid: hostOpenid,
        createdAt: new Date(),
        updatedAt: new Date()
      }
      
      // 插入到数据库
      const db = cloud.database()
      const result = await db.collection('orders').add({
        data: orderData
      })
      
      return {
        code: 0,
        message: '创建订单成功',
        data: {
          bookingId: result._id
        }
      }
    } catch (error) {
      console.error('创建订单失败:', error)
      return {
        code: -1,
        message: '创建订单失败',
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