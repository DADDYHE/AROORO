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
    console.log('获取所有寄养家庭列表 - 开始')

    // 初始化数据库
    const db = cloud.database()

    // 使用 Promise.race 实现超时控制
    const result = await Promise.race([
      db.collection('hostProfiles').where({ 
        status: db.command.in(['approved', 'pending']) 
      }).get(),
      timeoutPromise
    ])

    console.log('获取所有寄养家庭列表 - 查询结果', result)

    // 确保每个寄养家庭都有 isAcceptingOrders 字段，并处理头像 URL
    const data = await Promise.all(result.data.map(async (host) => {
      const processedHost = {
        ...host,
        isAcceptingOrders: host.isAcceptingOrders !== undefined ? host.isAcceptingOrders : true
      }
      
      // 处理寄养家庭头像，将云存储 fileID 转换为临时访问 URL
      if (processedHost.avatarUrl && processedHost.avatarUrl.startsWith('cloud://')) {
        try {
          console.log('获取寄养家庭头像临时访问 URL，fileID:', processedHost.avatarUrl)
          const tempFileResult = await cloud.getTempFileURL({
            fileList: [processedHost.avatarUrl],
            config: {
              env: cloud.DYNAMIC_CURRENT_ENV
            }
          })
          
          if (tempFileResult.fileList && tempFileResult.fileList[0] && tempFileResult.fileList[0].tempFileURL) {
            processedHost.avatarUrl = tempFileResult.fileList[0].tempFileURL
            console.log('寄养家庭头像临时访问 URL 获取成功:', processedHost.avatarUrl)
} else {
          console.warn('获取寄养家庭头像临时访问 URL 失败，设置默认头像')
          processedHost.avatarUrl = '/images/default-avatar.svg'
          }
        } catch (error) {
          console.warn('获取寄养家庭头像临时访问 URL 失败:', error)
          processedHost.avatarUrl = '/images/default-avatar.svg'
        }
      } else if (!processedHost.avatarUrl || processedHost.avatarUrl === '') {
        // 如果没有头像URL或为空，设置默认头像
        processedHost.avatarUrl = '/images/default-avatar.svg'
      }
      
      return processedHost
    }))

    return {
      code: 0,
      message: '获取成功',
      data: data
    }

  } catch (error) {
    console.error('获取所有寄养家庭列表 - 失败', error)
    return {
      code: -1,
      message: error.message || '获取失败',
      data: null
    }
  }
}
