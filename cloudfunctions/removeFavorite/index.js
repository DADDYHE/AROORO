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
      reject(new Error('操作超时，请稍后再试'))
    }, 2500) // 设置 2.5 秒超时，留出缓冲时间
  })

  try {
    console.log('取消收藏 - 开始')

    // 从上下文获取用户 openid
    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID
    const { hostProfileId } = event

    if (!openid || !hostProfileId) {
      return {
        code: -1,
        message: '缺少参数',
        data: null
      }
    }

    console.log('取消收藏 - 用户openid:', openid, '寄养家庭ID:', hostProfileId)

    // 使用 Promise.race 实现超时控制
    const result = await Promise.race([
      (async () => {
        const db = cloud.database()
        // 删除收藏
        const deleteResult = await db.collection('favorites').where({ 
          openid: openid, 
          hostProfileId: hostProfileId 
        }).remove()
        console.log('取消收藏 - 操作结果', deleteResult)

        return {
          code: 0,
          message: '取消收藏成功',
          data: null
        }
      })(),
      timeoutPromise
    ])

    console.log('取消收藏 - 操作结果', result)

    return result;

  } catch (error) {
    console.error('取消收藏 - 失败', error)
    return {
      code: -1,
      message: error.message || '取消收藏失败',
      data: null
    }
  }
}