'use strict'
const cloud = require('wx-server-sdk')

// 初始化云开发环境
cloud.init({
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

exports.main = async (event, context) => {
  try {
    // 使用 Promise.race 确保函数在2.5秒内完成
    const result = await Promise.race([
      (async () => {
        // 获取用户信息
        const wxContext = cloud.getWXContext()
        const openid = wxContext.OPENID
        console.log('用户openid:', openid)
        
        // 获取宠物ID和更新数据
        const { petId, updateData } = event
        console.log('宠物ID:', petId)
        console.log('更新数据:', updateData)
        
        if (!petId) {
          return {
            code: -1,
            message: '宠物ID不能为空'
          }
        }
        
        if (!updateData || Object.keys(updateData).length === 0) {
          return {
            code: -1,
            message: '没有需要更新的数据'
          }
        }
        
        // 使用CloudBase数据库查询和更新
        const db = cloud.database()
        
        // 检查宠物是否存在且属于当前用户
        const petResult = await db.collection('pets').where({ 
          _id: petId,
          ownerOpenid: openid,
          isActive: 1
        }).get()
        
        console.log('宠物查询结果:', petResult)
        
        if (!petResult || !petResult.data || petResult.data.length === 0) {
          return {
            code: -1,
            message: '更新失败，宠物不存在或您没有权限'
          }
        }
        
        // 构建更新数据
        const updateFields = {
          ...updateData,
          updatedAt: new Date()
        }
        
        console.log('构建的更新数据:', updateFields)
        
        // 执行更新
        const updateResult = await db.collection('pets').doc(petId).update({
          data: updateFields
        })
        
        console.log('更新结果:', updateResult)
        
        if (updateResult.stats.updated === 0) {
          return {
            code: -1,
            message: '更新失败，宠物不存在或您没有权限'
          }
        }
        
        return {
          code: 0,
          message: '更新成功'
        }
      })(),
      timeoutPromise(2500, '更新宠物信息超时')
    ])
    
    return result
  } catch (error) {
    console.error('更新宠物信息失败:', error)
    return {
      code: -1,
      message: error.message || '更新失败，请稍后重试'
    }
  }
}
