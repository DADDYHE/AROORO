const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const { roleType, profileData } = event
  const wxContext = cloud.getWXContext()
  const { OPENID } = wxContext

  // 1. 获取当前用户
  const userRes = await db.collection('users').where({ openid: OPENID }).get()
  const user = userRes.data[0]

  // 2. 检查是否已拥有该身份
  const existRoleRes = await db.collection('user_roles').where({ 
    userId: user._id, 
    roleType: roleType 
  }).get()
  if (existRoleRes.data.length > 0) {
    return { code: -1, message: 'already have this role' }
  }

  // 3. 创建身份档案
  let profileId = ''
  // 确保profileData包含必要的字段
  const commonProfileData = {
    ...profileData,
    openid: OPENID,
    userId: user._id,
    createTime: new Date(),
    updatedAt: new Date()
  }
  if (roleType === 'owner') {
    const addRes = await db.collection('ownerProfiles').add({ data: commonProfileData })
    profileId = addRes._id
  } else if (roleType === 'host') {
    const addRes = await db.collection('hostProfiles').add({ data: commonProfileData })
    profileId = addRes._id
  }

  // 4. 创建身份角色记录，默认非活跃
  const newRole = {
    userId: user._id,
    openid: OPENID,
    roleType,
    profileId,
    isActive: false, // 新身份默认不激活
    createTime: new Date(),
    updatedAt: new Date()
  }
  await db.collection('user_roles').add({ data: newRole })

  return { code: 1, message: 'create success', role: newRole }
}