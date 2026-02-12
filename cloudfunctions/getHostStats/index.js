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
    }, 2000) // 设置更严格的超时时间
  })

  try {
    console.log('获取寄养家庭统计数据 - 开始', event)

    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID

    // 使用 CloudBase 云数据库获取统计数据
    const stats = await Promise.race([
      (async () => {
        // 初始化数据库
        const db = cloud.database()
        
        // 查询寄养家庭的订单统计数据
        const orderResult = await db.collection('orders')
          .where({ hostOpenid: openid })
          .get()
        
        const orders = orderResult.data
        console.log('订单统计查询结果:', orders)
        
        // 计算统计数据
        const totalOrders = orders.length
        const completedOrders = orders.filter(order => order.status === 'completed').length
        const pendingOrders = orders.filter(order => order.status === 'pending').length
        
        // 计算取消率
        const cancellationRate = totalOrders > 0 ? ((totalOrders - completedOrders) / totalOrders * 100).toFixed(2) : '0.00'
        
        return {
          totalOrders: totalOrders,
          completedOrders: completedOrders,
          pendingOrders: pendingOrders,
          cancellationRate: cancellationRate
        }
      })(),
      timeoutPromise
    ])

    console.log('获取寄养家庭统计数据 - 返回结果', stats)

    return {
      code: 0,
      message: '获取成功',
      data: stats
    }

  } catch (error) {
    console.error('获取寄养家庭统计数据 - 失败', error)
    return {
      code: -1,
      message: error.message || '获取失败',
      data: null
    }
  }
}