const cloud = require('wx-server-sdk')

// 生成唯一ID的辅助函数
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2)
}

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
    console.log('添加收藏 - 开始')

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

    console.log('添加收藏 - 用户openid:', openid, '寄养家庭ID:', hostProfileId)

    // 使用 Promise.race 实现超时控制
    const result = await Promise.race([
      (async () => {
        const db = cloud.database()
        // 检查是否已经收藏过
        const existingFav = await db.collection('favorites').where({ 
          openid: openid, 
          hostProfileId: hostProfileId 
        }).get()
        console.log('检查是否已收藏:', existingFav)

        if (existingFav && existingFav.data && existingFav.data.length > 0) {
          return {
            code: -1,
            message: '已经收藏过该寄养家庭',
            data: null
          }
        }

        // 添加收藏
        const favoriteId = generateId()
        const insertResult = await db.collection('favorites').add({
          data: {
            _id: favoriteId,
            openid: openid,
            _openid: openid,
            hostProfileId: hostProfileId,
            createdAt: new Date()
          }
        })
        console.log('添加收藏 - 操作结果', insertResult)

        return {
          code: 0,
          message: '收藏成功',
          data: null
        }
      })(),
      timeoutPromise
    ])

    console.log('添加收藏 - 操作结果', result)

    return result;

  } catch (error) {
    console.error('添加收藏 - 失败', error)
    return {
      code: -1,
      message: error.message || '收藏失败',
      data: null
    }
  }
}