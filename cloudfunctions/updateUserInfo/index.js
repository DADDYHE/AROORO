const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 内部工具函数，避免外部依赖
const handleError = (error, customMessage = null) => {
  console.error('错误信息:', error.message)
  console.error('错误堆栈:', error.stack)
  
  return {
    code: 9999,
    message: customMessage || '更新用户信息失败',
    error: error.message
  }
}

const handleSuccess = (data = null, message = null) => {
  return {
    code: 0,
    message: message || '操作成功',
    data: data
  }
}

exports.main = async (event, _) => {
  try {
    console.log('=== 更新用户信息开始 ===')
    console.log('event:', JSON.stringify(event, null, 2))
    
    const wxContext = cloud.getWXContext()
    const { OPENID } = wxContext
    
    const { openid, userInfo } = event
    
    // 优先使用 event 中的 openid，否则使用上下文的 OPENID
    const targetOpenid = openid || OPENID
    console.log('使用的 openid:', targetOpenid)
    
    if (!targetOpenid) {
      return handleError(new Error('缺少用户标识'), '更新用户信息失败')
    }
    
    if (!userInfo || typeof userInfo !== 'object') {
      return handleError(new Error('缺少用户信息'), '更新用户信息失败')
    }
    
    const updateData = {
      ...userInfo,
      updatedAt: new Date()
    }
    
    // 1. 更新基础用户信息
    console.log('步骤1: 更新基础用户信息')
    try {
      await db.collection('users').where({ openid: targetOpenid }).update({
        data: updateData
      })
      console.log('基础用户信息更新成功')
    } catch (error) {
      console.error('更新基础用户信息失败:', error)
      // 继续执行，尝试更新档案信息
    }
    
    // 2. 获取用户角色，更新对应档案
    console.log('步骤2: 获取用户角色并更新对应档案')
    let roles = []
    
    try {
      const rolesRes = await db.collection('user_roles').where({ openid: targetOpenid }).get()
      roles = rolesRes.data
      
      for (const role of roles) {
        if (role.roleType === 'owner' && role.profileId) {
          console.log('更新主人档案:', role.profileId)
          await db.collection('ownerProfiles').doc(role.profileId).update({
            data: updateData
          })
          console.log('主人档案更新成功')
        } else if (role.roleType === 'host' && role.profileId) {
          console.log('更新寄养家庭档案:', role.profileId)
          await db.collection('hostProfiles').doc(role.profileId).update({
            data: updateData
          })
          console.log('寄养家庭档案更新成功')
        }
      }
    } catch (rolesError) {
      console.error('更新用户档案失败:', rolesError)
      // 继续执行，不影响基础信息更新
    }
    
    console.log('=== 更新用户信息完成 ===')
    return handleSuccess({ openid: targetOpenid }, '更新用户信息成功')
  } catch (error) {
    return handleError(error, '更新用户信息失败')
  }
}