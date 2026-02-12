const cloud = require('wx-server-sdk')

// 初始化 cloud
cloud.init({
  // API 调用都保持和云函数当前所在环境一致
  env: cloud.DYNAMIC_CURRENT_ENV
})

// 云函数入口函数
exports.main = async (event, context) => {
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error('查询超时，请稍后再试'))
    }, 2500) // 设置 2.5 秒超时，留出缓冲时间
  })

  try {
    console.log('获取寄养家庭订单数据 - 开始', event)

    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID

    // 使用 CloudBase 云数据库查询订单
    const ordersResult = await Promise.race([
      (async () => {
        // 初始化数据库
        const db = cloud.database()
        
        // 直接根据 hostOpenid 查询订单
        const result = await db.collection('orders')
          .where({ hostOpenid: openid })
          .orderBy('createdAt', 'desc')
          .limit(100)
          .get()
        
        const orders = result.data
        console.log('获取寄养家庭订单数据 - 原始结果', orders)
        return orders
      })(),
      timeoutPromise
    ])
    
    // 过滤所需字段
    const filteredOrders = ordersResult.map(order => ({
      id: order._id || order.id,
      petId: order.petId,
      hostId: order.hostId,
      startDate: order.startDate,
      endDate: order.endDate,
      status: order.status,
      totalPrice: order.totalPrice,
      createdAt: order.createdAt
    }))

    console.log('获取寄养家庭订单数据 - 查询结果', filteredOrders)

    return {
      code: 0,
      message: '获取成功',
      data: filteredOrders
    }

  } catch (error) {
    console.error('获取寄养家庭订单数据 - 失败', error)
    return {
      code: -1,
      message: error.message || '获取失败',
      data: []
    }
  }
}