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
    console.log('获取用户收藏列表 - 开始')

    // 从上下文获取用户 openid
    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID

    if (!openid) {
      return {
        code: -1,
        message: '缺少用户openid',
        data: null
      }
    }

    // 使用 Promise.race 实现超时控制
    const db = cloud.database()
    const favoritesResult = await Promise.race([
      db.collection('favorites').where({ openid: openid }).get(),
      timeoutPromise
    ])

    const favorites = favoritesResult.data
    console.log('获取用户收藏列表 - 查询结果', favorites)

    // 如果没有收藏，返回空数组
    if (!favorites || favorites.length === 0) {
      return {
        code: 0,
        message: '获取成功',
        data: []
      }
    }

    // 获取所有收藏的寄养家庭ID
    const hostIds = favorites.map(fav => fav.hostProfileId)
    console.log('获取到的寄养家庭ID:', hostIds)

    // 查询所有相关寄养家庭的详细信息
    let hosts = []
    if (hostIds.length > 0) {
      const hostsResult = await db.collection('hostProfiles').where({
        _id: db.command.in(hostIds),
        status: 'approved'
      }).get()
      hosts = hostsResult.data
      console.log('查询到的寄养家庭信息:', hosts)
    }

    // 构建寄养家庭ID到信息的映射
    const hostMap = {}
    hosts.forEach(host => {
      hostMap[host._id] = host
    })

    // 合并收藏信息和寄养家庭信息
    const result = favorites.map(fav => {
      const host = hostMap[fav.hostProfileId] || {}
      return {
        ...fav,
        ...host,
        hostProfileId: fav.hostProfileId
      }
    })

    // 确保每个寄养家庭都有 isAcceptingOrders 字段，并处理头像 URL
    const data = await Promise.all(result.map(async (host) => {
      const processedHost = {
        ...host,
        isAcceptingOrders: host.isAcceptingOrders !== undefined ? host.isAcceptingOrders : true,
        avatarUrl: host.avatarUrl // 将字段名统一为 avatarUrl，与其他接口一致
      }
      
      // 处理寄养家庭头像，将云存储 fileID 转换为临时访问 URL
      if (processedHost.avatarUrl && processedHost.avatarUrl.startsWith('cloud://')) {
        try {
          console.log('获取寄养家庭头像临时访问 URL，fileID:', processedHost.avatarUrl)
          const tempFileResult = await cloud.getTempFileURL({
            fileList: [processedHost.avatarUrl]
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
    console.error('获取用户收藏列表 - 失败', error)
    return {
      code: -1,
      message: error.message || '获取失败',
      data: null
    }
  }
}