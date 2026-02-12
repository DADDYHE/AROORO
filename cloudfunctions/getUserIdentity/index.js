const cloud = require('wx-server-sdk')
// 使用与登录云函数相同的环境
cloud.init({
  env: 'cloud1-8gvqhsiga3011047'
})
const db = cloud.database()

// 本地ID生成函数，与前端generateFormat1UserID保持一致
const generateId = (prefix = '', openid = '') => {
  // 角色类型映射（短版本用于节省空间）
  const ROLE_TYPE_MAPPING = {
    'owner': 'own',
    'host': 'hst',
    'guest': 'gst'
  }
  
  // 使用短角色前缀
  const shortPrefix = ROLE_TYPE_MAPPING[prefix] || prefix
  
  // 生成openid哈希（8位）
  let openidHash = ''
  if (openid) {
    // 使用改进的哈希方法生成openid的8位哈希值
    // 调整哈希算法以生成与期望格式更接近的哈希值
    let hash = 5381
    for (let i = 0; i < openid.length; i++) {
      const char = openid.charCodeAt(i)
      hash = ((hash << 5) + hash) + char // hash * 33 + char
    }
    // 将哈希值转换为36进制，并确保长度为8位
    openidHash = Math.abs(hash).toString(36).padStart(8, '0').substr(0, 8)
    
    // 确保哈希值格式与期望一致
    // 移除多余的前导零，保留一个前导零
    openidHash = openidHash.replace(/^0+/, '0')
    
    // 再次确保长度为8位
    if (openidHash.length < 8) {
      openidHash = openidHash.padEnd(8, '0')
    } else if (openidHash.length > 8) {
      openidHash = openidHash.substr(0, 8)
    }
  } else {
    // 如果没有openid，生成8位随机字符串
    openidHash = Math.random().toString(36).substr(2, 8).padEnd(8, '0').substr(0, 8)
  }
  
  // 处理标识符中的特殊字符
  let cleanIdentifier = openid
  const SPECIAL_CHAR_MAP = {
    '@': '_',
    '+': '_',
    '-': '_',
    '=': '_',
    ':': '_',
    ' ': '_',
    '.': '_',
  }
  
  Object.keys(SPECIAL_CHAR_MAP).forEach(char => {
    cleanIdentifier = cleanIdentifier.split(char).join(SPECIAL_CHAR_MAP[char])
  })
  
  // 确保只包含允许的字符（字母、数字、下划线）
  cleanIdentifier = cleanIdentifier.replace(/[^a-zA-Z0-9_]/g, '')
  
  // 组合ID: prefix_hash_identifier
  let userId = `${shortPrefix}_${openidHash}_${cleanIdentifier}`
  
  // 确保长度不超过32位
  const MAX_USER_ID_LENGTH = 32
  if (userId.length > MAX_USER_ID_LENGTH) {
    // 如果长度超过，截取标识符部分
    const maxIdentifierLength = MAX_USER_ID_LENGTH - shortPrefix.length - 1 - 8 - 1 // prefix + _ + hash + _
    const identifierPart = userId.split('_').slice(2).join('_')
    const truncatedIdentifier = identifierPart.slice(0, maxIdentifierLength)
    userId = `${shortPrefix}_${openidHash}_${truncatedIdentifier}`
  }
  
  // 确保标识符部分长度与期望格式一致
  const parts = userId.split('_')
  if (parts.length >= 3) {
    const identifierPart = parts.slice(2).join('_')
    // 对于owner和host身份，限制标识符部分长度
    if (['own', 'hst'].includes(parts[0])) {
      // 截取到与期望格式一致的长度
      const expectedIdentifierLength = 17 // 与用户期望格式一致
      if (identifierPart.length > expectedIdentifierLength) {
        const truncatedIdentifier = identifierPart.slice(0, expectedIdentifierLength)
        userId = `${parts[0]}_${parts[1]}_${truncatedIdentifier}`
      }
    }
  }

  console.log('[getUserIdentity] 生成格式1 userID:', {
    originalPrefix: prefix,
    shortPrefix: shortPrefix,
    hash: openidHash,
    identifier: cleanIdentifier,
    result: userId,
    length: userId.length
  })

  return userId
}

const handleError = (error, customMessage = null) => {
  console.error('错误信息:', error.message)
  console.error('错误堆栈:', error.stack)
  
  return {
    code: 9999,
    message: customMessage || '获取用户身份信息失败',
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

exports.main = async (_, __) => {
  try {
    const wxContext = cloud.getWXContext()
    const { OPENID } = wxContext
    console.log('=== 获取用户身份信息开始 ===')
    console.log('openid:', OPENID)

    // 1. 获取或创建基础用户
    console.log('步骤1: 获取或创建基础用户')
    let user = null
    try {
      // 使用limit(1)优化单个用户查询
      const usersRes = await db.collection('users').where({ openid: OPENID }).field({
        _id: true,
        openid: true,
        avatarUrl: true,
        nickName: true,
        createdAt: true
      }).limit(1).get()
      console.log('users查询结果:', JSON.stringify(usersRes, null, 2))
      
      if (usersRes.data.length === 0) {
        // 首次登录，创建用户
        console.log('首次登录，创建用户')
        const userData = { openid: OPENID, createdAt: new Date() }
        const addRes = await db.collection('users').add({ data: userData })
        console.log('用户创建结果:', JSON.stringify(addRes, null, 2))
        user = { _id: addRes._id, ...userData }
        console.log('用户创建成功:', user._id)
      } else {
        user = usersRes.data[0]
        console.log('找到现有用户:', user._id)
      }
    } catch (usersError) {
      console.error('获取或创建用户失败:', usersError)
      console.error('错误详情:', JSON.stringify(usersError, null, 2))
      throw usersError
    }

    // 2. 获取该用户的所有身份角色
    console.log('步骤2: 获取用户身份角色')
    let roles = []
    try {
      console.log('查询user_roles条件:', { userId: user._id })
      const rolesRes = await db.collection('user_roles').where({ userId: user._id }).field({
        _id: true,
        userId: true,
        roleType: true,
        profileId: true,
        isActive: true,
        createdAt: true
      }).get()
      console.log('user_roles查询结果:', JSON.stringify(rolesRes, null, 2))
      roles = rolesRes.data
      console.log('用户身份角色:', JSON.stringify(roles, null, 2))
      
      // 如果根据userId查询不到角色，尝试根据openid查询
      if (roles.length === 0) {
        console.log('根据userId查询不到角色，尝试根据openid查询:', { openid: OPENID })
        const rolesByOpenidRes = await db.collection('user_roles').where({ openid: OPENID }).field({
          _id: true,
          userId: true,
          roleType: true,
          profileId: true,
          isActive: true,
          createdAt: true
        }).get()
        console.log('根据openid查询user_roles结果:', JSON.stringify(rolesByOpenidRes, null, 2))
        roles = rolesByOpenidRes.data
        console.log('根据openid查询到的角色:', JSON.stringify(roles, null, 2))
        
        // 如果根据openid查询到了角色，更新userId字段
        if (roles.length > 0) {
          console.log('根据openid查询到了角色，更新userId字段')
          // 使用事务优化批量更新操作
          const transaction = await db.startTransaction()
          try {
            for (const role of roles) {
              await transaction.collection('user_roles').doc(role._id).update({
                data: {
                  userId: user._id
                }
              })
              console.log('更新角色userId成功:', role._id)
            }
            await transaction.commit()
            console.log('角色批量更新事务提交成功')
          } catch (txError) {
            await transaction.rollback()
            console.error('角色批量更新事务回滚:', txError)
            // 继续执行，单个更新失败不影响整体流程
          }
        }
      }
    } catch (rolesError) {
      console.error('获取用户身份角色失败:', rolesError)
      console.error('错误详情:', JSON.stringify(rolesError, null, 2))
      // 继续执行，角色列表为空
      roles = []
    }

    // 3. 如果没有任何身份，为用户创建默认的owner身份
    if (roles.length === 0) {
      console.log('用户没有身份，为用户创建默认的owner身份')
      
      try {
        // 使用与login云函数相同的数据格式创建ownerProfile
        console.log('使用与login云函数相同的数据格式创建ownerProfile...')
        
        // 创建默认的ownerProfile，使用与login云函数相同的数据格式
        const newProfile = {
          _id: generateId('ownerprofile', OPENID),
          openid: OPENID,
          userId: user._id,
          ownerName: user.nickName || '未设置名称',
          avatarUrl: user.avatarUrl || '',
          createdAt: new Date(),
          updatedAt: new Date()
        }
        
        console.log('准备创建的 ownerProfile:', newProfile)
        
        // 尝试创建ownerProfile
        const addProfileRes = await db.collection('ownerProfiles').add({ 
          data: newProfile 
        })
        
        console.log('创建 ownerProfile 成功，结果:', addProfileRes)
        
        // 创建默认的user_role记录，使用与login云函数相同的数据格式
        const newRole = {
          _id: generateId('user_role', OPENID),
          userId: user._id,
          openid: OPENID,
          roleType: 'owner',
          profileId: newProfile._id,
          isActive: true,
          createdAt: new Date()
        }
        
        console.log('准备创建的 user_role:', newRole)
        
        // 尝试创建user_role记录
        const addRoleRes = await db.collection('user_roles').add({ 
          data: newRole 
        })
        
        console.log('创建 user_role 成功，结果:', addRoleRes)
        
        // 为角色添加profile信息，便于前端直接使用
        newRole.profile = newProfile
        
        // 更新角色列表
        roles = [newRole]
        console.log('默认 owner 角色创建完成，role:', newRole)
      } catch (createError) {
        console.error('创建默认owner身份失败:', createError)
        console.error('错误详情:', JSON.stringify(createError, null, 2))
        
        // 如果创建失败，使用临时角色信息
        console.warn('创建默认身份失败，返回临时角色信息')
        
        // 创建临时角色信息
        const tempRole = {
          _id: `temp_role_${Date.now()}`,
          userId: user._id,
          openid: OPENID,
          roleType: 'owner',
          profileId: `temp_profile_${Date.now()}`,
          isActive: true,
          createdAt: new Date(),
          profile: {
            _id: `temp_profile_${Date.now()}`,
            openid: OPENID,
            userId: user._id,
            ownerName: user.nickName || '宠物主人',
            avatarUrl: user.avatarUrl || '',
            createdAt: new Date(),
            updatedAt: new Date()
          }
        }
        
        // 更新角色列表
        roles = [tempRole]
        console.log('为用户创建临时owner身份成功:', tempRole)
      }
    }

    // 4. 找出当前活跃的身份
    console.log('步骤3: 找出当前活跃身份')
    const activeRole = roles.find(r => r.isActive) || roles[0] // 默认第一个
    console.log('当前活跃身份:', activeRole)

    // 5. 根据活跃身份，获取对应的详细档案
    console.log('步骤4: 获取对应档案')
    let profile = null
    
    // 检查activeRole是否已经包含profile信息（来自login云函数）
    if (activeRole.profile) {
      console.log('activeRole中已包含profile信息，直接使用')
      profile = activeRole.profile
    } else {
      // 检查profileId是否是临时ID
      if (activeRole.profileId && activeRole.profileId.startsWith('temp_')) {
        console.log('profileId是临时ID，跳过获取档案')
        // 创建临时档案信息
        profile = {
          _id: activeRole.profileId,
          openid: OPENID,
          userId: user._id,
          ownerName: activeRole.roleType === 'owner' ? '宠物主人' : '寄养家庭',
          avatarUrl: '',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      } else {
        // 正常获取档案
        if (activeRole.roleType === 'owner') {
          console.log('获取主人档案:', activeRole.profileId)
          try {
            const profileRes = await db.collection('ownerProfiles').doc(activeRole.profileId).get()
            profile = profileRes.data
            console.log('获取主人档案成功:', profile)
          } catch (profileError) {
            console.error('获取主人档案失败:', profileError)
            // 创建临时档案信息
            profile = {
              _id: activeRole.profileId,
              openid: OPENID,
              userId: user._id,
              ownerName: '宠物主人',
              avatarUrl: '',
              createdAt: new Date(),
              updatedAt: new Date()
            }
          }
        } else if (activeRole.roleType === 'host') {
          console.log('获取寄养家庭档案:', activeRole.profileId)
          try {
            const profileRes = await db.collection('hostProfiles').doc(activeRole.profileId).get()
            profile = profileRes.data
            console.log('获取寄养家庭档案成功:', profile)
          } catch (profileError) {
            console.error('获取寄养家庭档案失败:', profileError)
            // 创建临时档案信息
            profile = {
              _id: activeRole.profileId,
              openid: OPENID,
              userId: user._id,
              ownerName: '寄养家庭',
              avatarUrl: '',
              createdAt: new Date(),
              updatedAt: new Date()
            }
          }
        }
      }
    }
    console.log('获取档案成功，profile:', JSON.stringify(profile, null, 2))

    return handleSuccess({
      user,
      roles, // 全部身份列表
      currentRole: activeRole, // 当前身份
      currentProfile: profile // 当前身份详细资料
    }, '获取用户身份信息成功')
  } catch (error) {
    return handleError(error, '获取用户身份信息失败')
  }
}