'use strict'
const cloud = require('wx-server-sdk')

// 初始化云开发环境
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

exports.main = async (event, context) => {
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error('删除超时，请稍后再试'))
    }, 2500) // 设置 2.5 秒超时，留出缓冲时间
  })

  const mainPromise = (async () => {
    try {
      // 获取用户信息
      const wxContext = cloud.getWXContext()
      const openid = wxContext.OPENID
      console.log('用户openid:', openid)
      
      // 获取宠物ID
      const { petId } = event
      console.log('宠物ID:', petId)
      
      if (!petId) {
        return {
          code: -1,
          message: '宠物ID不能为空'
        }
      }
      
      // 执行删除（软删除，将 isActive 设为 0）
      const db = cloud.database()
      const deleteResult = await db.collection('pets').where({
        _id: petId,
        ownerOpenid: openid
      }).update({
        data: {
          isActive: 0,
          updatedAt: new Date()
        }
      })
      
      console.log('删除结果:', deleteResult)
      
      if (!deleteResult || deleteResult.stats.updated === 0) {
        return {
          code: -1,
          message: '删除失败，宠物不存在或您没有权限'
        }
      }
      
      return {
        code: 0,
        message: '删除成功'
      }
    } catch (error) {
      console.error('删除宠物信息失败:', error)
      return {
        code: -1,
        message: '删除失败，请稍后重试'
      }
    }
  })()

  try {
    return await Promise.race([mainPromise, timeoutPromise])
  } catch (error) {
    console.error('删除超时或失败:', error)
    return {
      code: -1,
      message: '删除超时，请稍后再试'
    }
  }
}
