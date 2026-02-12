const cloud = require('wx-server-sdk')

// 初始化 cloud
cloud.init({
  // API 调用都保持和云函数当前所在环境一致
  env: cloud.DYNAMIC_CURRENT_ENV
})

// 超时控制函数
const timeoutPromise = (ms, message) => {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(message || '请求超时'))
    }, ms)
  })
}

// 云函数入口函数
exports.main = async (event, context) => {
  try {
    console.log('更新寄养家庭接单状态 - 开始', event)

    // 使用 Promise.race 确保函数在2.5秒内完成
    const result = await Promise.race([
      (async () => {
        const wxContext = cloud.getWXContext()
        const openid = wxContext.OPENID

        const { isAcceptingOrders } = event

        // 更新寄养家庭配置
        const db = cloud.database()
        const updateResult = await db.collection('hostProfiles').where({
          openid: openid,
          isActive: 1
        }).update({
          data: {
            isAcceptingOrders: isAcceptingOrders,
            updatedAt: new Date()
          }
        })
        
        console.log('更新寄养家庭接单状态 - 成功', updateResult)

        return {
          code: 0,
          message: '更新成功',
          data: updateResult
        }
      })(),
      timeoutPromise(2500, '更新寄养家庭接单状态超时')
    ])

    return result

  } catch (error) {
    console.error('更新寄养家庭接单状态 - 失败', error)
    return {
      code: -1,
      message: error.message || '更新失败',
      data: null
    }
  }
}