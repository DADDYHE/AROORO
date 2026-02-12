'use strict'
const cloud = require('wx-server-sdk')

// 初始化云开发环境
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

exports.main = async (event, context) => {
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error('查询超时，请稍后再试'))
    }, 5000) // 增加超时时间到5秒，减少超时导致的失败
  })

  try {
    // 获取用户信息
    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID
    console.log('用户openid:', openid)
    
    // 获取宠物ID
    const { petId } = event
    console.log('宠物ID:', petId)
    console.log('完整事件参数:', JSON.stringify(event, null, 2))
    
    if (!petId) {
      return {
        code: -1,
        message: '宠物ID不能为空'
      }
    }
    
    // 查询宠物详细信息，使用CloudBase数据库
    const pet = await Promise.race([
      (async () => {
        // 查询宠物信息，同时验证权限，只返回必要字段
        const db = cloud.database()
        const result = await db.collection('pets').where({
          _id: petId,
          ownerOpenid: openid,
          isActive: 1
        }).field({
          _id: true,
          name: true,
          type: true,
          breed: true,
          age: true,
          gender: true,
          avatarUrl: true,
          description: true,
          specialNeeds: true,
          isSterilized: true,
          isVaccinated: true,
          createdAt: true,
          updatedAt: true
        }).get()

        console.log('宠物详细信息查询结果:', result)

        if (!result || !result.data || result.data.length === 0) {
          return null
        }

        return result.data[0]
      })(),
      timeoutPromise
    ])
    console.log('宠物详细信息查询结果:', pet)

    if (!pet) {
      console.error('权限验证失败，用户openid:', openid)
      return {
        code: -1,
        message: '您没有权限访问该宠物信息'
      }
    }
    // 将TINYINT类型的布尔值转换为真正的Boolean类型
    if (pet.isSterilized !== undefined) {
      pet.isSterilized = Boolean(pet.isSterilized)
    }
    if (pet.isVaccinated !== undefined) {
      pet.isVaccinated = Boolean(pet.isVaccinated)
    }
    
    // 处理宠物头像，将云存储 fileID 转换为临时访问 URL
    if (pet.avatarUrl && pet.avatarUrl.startsWith('cloud://')) {
      try {
        console.log('获取宠物头像临时访问 URL，fileID:', pet.avatarUrl)
        const tempFileResult = await cloud.getTempFileURL({
          fileList: [pet.avatarUrl]
        })
        
        if (tempFileResult.fileList && tempFileResult.fileList[0] && tempFileResult.fileList[0].tempFileURL) {
          pet.avatarUrl = tempFileResult.fileList[0].tempFileURL
          console.log('宠物头像临时访问 URL 获取成功:', pet.avatarUrl)
        }
      } catch (error) {
        console.warn('获取宠物头像临时访问 URL 失败:', error)
      }
    }
    
    console.log('返回的宠物数据:', JSON.stringify(pet, null, 2))
    
    return {
      code: 0,
      message: '查询成功',
      data: pet
    }
  } catch (error) {
    console.error('查询宠物详细信息失败:', error)
    console.error('错误详情:', JSON.stringify(error, null, 2))
    console.error('错误堆栈:', error.stack)
    
    return {
      code: -1,
      message: '查询失败，请稍后重试',
      error: error.message,
      stack: error.stack
    }
  }
}
