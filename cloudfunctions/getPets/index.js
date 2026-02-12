'use strict'
const cloud = require('wx-server-sdk')

// 初始化云开发环境
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

// 云函数入口函数
exports.main = async (event, context) => {
  // 设置超时控制，确保在2.5秒内完成
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('查询超时')), 2500)
  })

  const mainPromise = (async () => {
    try {
      // 从event或wxContext中获取openid
      let openid = event.openid
      console.log('从event获取的openid:', openid)
      
      // 如果event中没有openid，从wxContext中获取
      if (!openid) {
        const wxContext = cloud.getWXContext()
        openid = wxContext.OPENID
        console.log('从wxContext获取的openid:', openid)
      }
      
      // 检查openid是否存在
      if (!openid) {
        console.error('openid 不存在:', event)
        return {
          code: -1,
          message: '用户信息不完整，请重新登录'
        }
      }
      
      // 只查询当前用户的宠物档案，减少查询量和执行时间
      console.log('开始查询宠物档案，openid:', openid)
      let userPets = []
      try {
        const db = cloud.database()
        const result = await db.collection('pets').where({ 
          ownerOpenid: openid,
          isActive: 1
        }).field({
          _id: true,
          name: true,
          type: true,
          age: true,
          breed: true,
          avatarUrl: true,
          createdAt: true
        }).get()
        userPets = result.data
        console.log('当前用户的宠物档案:', userPets)
      } catch (dbError) {
        console.error('数据库查询失败:', dbError)
        return {
          code: -1,
          message: '数据库查询失败，请稍后重试',
          error: dbError.message
        }
      }

      // 处理宠物头像，将云存储 fileID 转换为临时访问 URL
      const processedUserPets = []
      for (const pet of userPets) {
        const processedPet = { ...pet }
        if (processedPet.avatarUrl && processedPet.avatarUrl.startsWith('cloud://')) {
          try {
            console.log('获取宠物头像临时访问 URL，fileID:', processedPet.avatarUrl)
            const tempFileResult = await cloud.getTempFileURL({
              fileList: [processedPet.avatarUrl]
            })
            
            if (tempFileResult.fileList && tempFileResult.fileList[0] && tempFileResult.fileList[0].tempFileURL) {
              processedPet.avatarUrl = tempFileResult.fileList[0].tempFileURL
              console.log('宠物头像临时访问 URL 获取成功:', processedPet.avatarUrl)
            } else {
              console.warn('获取宠物头像临时访问 URL 失败，设置默认头像')
              processedPet.avatarUrl = '/images/default-avatar.svg'
            }
          } catch (error) {
            console.warn('获取宠物头像临时访问 URL 失败:', error)
            processedPet.avatarUrl = '/images/default-avatar.svg'
          }
        } else if (!processedPet.avatarUrl || processedPet.avatarUrl === '') {
          // 如果没有头像URL或为空，设置默认头像
          processedPet.avatarUrl = '/images/default-avatar.svg'
        }
        processedUserPets.push(processedPet)
      }
      
      return {
        code: 0,
        message: '查询成功',
        data: {
          allPets: [], // 暂时返回空数组，减少查询时间
          userPets: processedUserPets
        }
      }
    } catch (error) {
      console.error('查询宠物档案失败:', error)
      return {
        code: -1,
        message: '查询失败，请稍后重试'
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