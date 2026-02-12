const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 内部工具函数，避免外部依赖
const handleError = (error, customMessage = null) => {
  console.error('错误信息:', error.message)
  console.error('错误堆栈:', error.stack)
  
  return {
    code: 9999,
    message: customMessage || '获取用户信息失败',
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
    console.log('=== 获取用户信息开始 ===')
    console.log('event:', JSON.stringify(event, null, 2))
    
    const wxContext = cloud.getWXContext()
    const { OPENID } = wxContext
    
    // 优先使用 event 中的 openid，否则使用上下文的 OPENID
    const openid = event.openid || OPENID
    console.log('使用的 openid:', openid)
    
    if (!openid) {
      return handleError(new Error('缺少用户标识'), '获取用户信息失败')
    }
    
    // 1. 获取基础用户信息
    console.log('步骤1: 获取基础用户信息')
    let user = null
    try {
      const usersRes = await db.collection('users').where({ openid }).field({
        _id: true,
        openid: true,
        nickName: true,
        avatarUrl: true,
        gender: true,
        phone: true,
        birthday: true,
        email: true,
        address: true,
        createdAt: true,
        updatedAt: true
      }).limit(1).get()
      
      if (usersRes.data.length > 0) {
        user = usersRes.data[0]
        console.log('找到用户:', user._id)
      } else {
        console.log('未找到用户，返回空信息')
        return handleSuccess({}, '获取用户信息成功')
      }
    } catch (error) {
      console.error('获取基础用户信息失败:', error)
      throw error
    }
    
    // 2. 获取用户的所有角色和档案信息
    console.log('步骤2: 获取用户角色和档案信息')
    let roles = []
    let ownerProfile = null
    let hostProfile = null
    
    try {
      // 查询用户角色
      const rolesRes = await db.collection('user_roles').where({ openid }).get()
      roles = rolesRes.data
      
      // 根据角色查询对应的档案
      for (const role of roles) {
        if (role.roleType === 'owner' && role.profileId) {
          const profileRes = await db.collection('ownerProfiles').doc(role.profileId).get()
          ownerProfile = profileRes.data
        } else if (role.roleType === 'host' && role.profileId) {
          const profileRes = await db.collection('hostProfiles').doc(role.profileId).get()
          hostProfile = profileRes.data
        }
      }
    } catch (rolesError) {
      console.error('获取用户角色和档案信息失败:', rolesError)
      // 继续执行，角色和档案信息可选
    }
    
    // 3. 合并用户信息，优先级：ownerProfile > hostProfile > user
    console.log('步骤3: 合并用户信息')
    const mergedUserInfo = {
      ...user,
      ...hostProfile,
      ...ownerProfile
    }
    
    // 提取需要返回的字段
    const userInfo = {
      avatarUrl: mergedUserInfo.avatarUrl || '',
      nickName: mergedUserInfo.nickName || mergedUserInfo.ownerName || '',
      gender: mergedUserInfo.gender || '',
      phone: mergedUserInfo.phone || '',
      birthday: mergedUserInfo.birthday || '',
      email: mergedUserInfo.email || '',
      address: mergedUserInfo.address || ''
    }
    
    console.log('=== 获取用户信息完成 ===')
    return handleSuccess({ userInfo }, '获取用户信息成功')
  } catch (error) {
    return handleError(error, '获取用户信息失败')
  }
}