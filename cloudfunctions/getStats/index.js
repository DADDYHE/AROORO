const cloud = require('wx-server-sdk')

// 初始化 cloud
cloud.init({
  // 使用固定的环境ID
  env: 'cloud1-8gvqhsiga3011047'
})

// 获取统计数据云函数
exports.main = async (event, context) => {
  try {
    console.log('收到查询统计数据请求，参数:', event)
    
    const { userId, userRole } = event

    // 参数验证
    if (!userId) {
      console.error('缺少用户ID参数')
      return {
        code: -1,
        message: '缺少用户ID参数'
      }
    }

    // 初始化统计数据
    const stats = {
      bookingCount: 0,
      totalSpent: 0,
      totalIncome: 0,
      avgRating: 0
    }

    // 获取云数据库实例
    const db = cloud.database()

    // 根据用户角色查询不同的统计数据
    if (userRole === 'owner') {
      // 宠物主人：查询订单数量和总消费
      try {
        const ordersResult = await db.collection('orders')
          .where({ ownerId: userId })
          .get()
        
        if (ordersResult && ordersResult.data && ordersResult.data.length > 0) {
          stats.bookingCount = ordersResult.data.length
          stats.totalSpent = ordersResult.data.reduce((sum, order) => {
            return sum + (order.totalPrice || 0)
          }, 0)
        }
      } catch (error) {
        console.error('查询订单统计失败:', error)
      }
    } else if (userRole === 'host') {
      // 寄养家庭：查询订单数量、总收入和平均评分
      try {
        const ordersResult = await db.collection('orders')
          .where({ 
            hostId: userId,
            status: 'completed'
          })
          .get()
        
        if (ordersResult && ordersResult.data && ordersResult.data.length > 0) {
          stats.bookingCount = ordersResult.data.length
          stats.totalIncome = ordersResult.data.reduce((sum, order) => {
            return sum + (order.totalPrice || 0)
          }, 0)
          
          // 计算平均评分
          const ratings = ordersResult.data.map(order => order.rating || 0).filter(rating => rating > 0)
          if (ratings.length > 0) {
            stats.avgRating = ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
          }
        }
      } catch (error) {
        console.error('查询寄养家庭订单统计失败:', error)
      }
    }

    console.log('返回简化后的统计数据:', stats)

    return {
      code: 0,
      message: '查询成功',
      stats: stats
    }
  } catch (error) {
    console.error('获取统计数据失败:', error)
    return {
      code: -1,
      message: '服务器内部错误',
      error: error.message
    }
  }
}
