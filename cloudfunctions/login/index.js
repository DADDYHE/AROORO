const cloud = require('wx-server-sdk')

// 初始化云开发环境
cloud.init({
  env: 'cloud1-8gvqhsiga3011047'
})
const db = cloud.database()

// IM服务配置
const IM_SERVICE_CONFIG = {
  // 使用腾讯云IM SDK生成UserSig
  SDKAppID: 1600123494,
  SecretKey: process.env.IM_SECRET_KEY || '1e4ec15902de6aab54e350e3394b116dd9fd18866ffc79eeb1a210029b314523',
  EXPIRE_TIME: 24 * 3600, // 24小时
};

/**
 * 使用腾讯云IM SDK生成UserSig
 * @param {string} userID - IM用户ID
 * @returns {Promise<string|null>} UserSig或null
 */
const generateUserSig = async (userID) => {
  try {
    console.log('[login] 开始生成UserSig:', userID);
    console.log('[login] SecretKey配置状态:', IM_SERVICE_CONFIG.SecretKey ? '已配置' : '未配置');
    console.log('[login] SDKAppID:', IM_SERVICE_CONFIG.SDKAppID);
    console.log('[login] EXPIRE_TIME:', IM_SERVICE_CONFIG.EXPIRE_TIME, '秒');

    // 引入腾讯云IM SDK
    const TLSSigAPIv2 = require('tls-sig-api-v2');

    // 初始化SDK
    const api = new TLSSigAPIv2.Api(IM_SERVICE_CONFIG.SDKAppID, IM_SERVICE_CONFIG.SecretKey);

    // 生成UserSig
    const userSig = api.genSig(userID, IM_SERVICE_CONFIG.EXPIRE_TIME);

    if (userSig) {
      console.log('[login] UserSig生成成功，长度:', userSig.length);
      console.log('[login] UserSig前20位:', userSig.substring(0, 20) + '...');
      return userSig;
    } else {
      console.error('[login] UserSig生成失败，返回空值');
      return null;
    }
  } catch (error) {
    console.error('[login] 生成UserSig失败:', error);
    console.error('[login] 错误详情:', {
      message: error.message,
      stack: error.stack
    });
    return null;
  }
};

/**
 * 本地ID生成函数
 * @param {string} prefix - ID前缀，如角色类型
 * @param {string} openid - 用户的openid
 * @returns {string} 生成的ID
 */
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
    // 使用djb2哈希算法生成openid的8位哈希值
    let hash = 5381
    for (let i = 0; i < openid.length; i++) {
      const char = openid.charCodeAt(i)
      hash = ((hash << 5) + hash) + char // hash * 33 + char
    }
    // 将哈希值转换为36进制，并确保长度为8位
    openidHash = Math.abs(hash).toString(36).padStart(8, '0').substr(0, 8)
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
  
  return userId
}

const handleError = (error, customMessage = null) => {
  console.error('错误信息:', error.message)
  console.error('错误堆栈:', error.stack)
  
  return {
    code: 9999,
    message: customMessage || '登录失败',
    error: error.message
  }
}

const handleSuccess = (data = null, message = null) => {
  return {
    code: 0,
    message: message || '登录成功',
    data: data
  }
}

exports.main = async (event, context) => {
  try {
    console.log('=== 登录云函数开始 ===')
    console.log('event:', JSON.stringify(event, null, 2))
    console.log('context:', JSON.stringify(context, null, 2))

    // 新增：检查是否是身份选择请求（集成 CentralIdentityManager）
    if (event.selectRole) {
      console.log('=== 身份选择模式 ===')
      const { openid, roleType, userId } = event
      console.log('[selectRole] 接收到的参数:', { openid, roleType, userId })

      if (!openid || !roleType) {
        console.error('[selectRole] 缺少必要参数')
        return {
          code: 9999,
          message: '身份选择缺少必要参数',
          error: 'openid和roleType不能为空'
        }
      }

      // 验证角色类型
      if (!['owner', 'host'].includes(roleType)) {
        console.error('[selectRole] 无效的角色类型:', roleType)
        return {
          code: 9999,
          message: '无效的角色类型',
          error: `角色类型必须是 owner 或 host，收到: ${roleType}`
        }
      }

      try {
        // 1. 获取用户
        let user = null
        const usersRes = await db.collection('users').where({ openid }).limit(1).get()
        if (usersRes.data.length === 0) {
          console.error('[selectRole] 用户不存在')
          return {
            code: 9999,
            message: '用户不存在',
            error: '请先完成基础登录'
          }
        }
        user = usersRes.data[0]
        console.log('[selectRole] 找到用户:', user._id)

        // 2. 检查目标角色是否存在
        let targetRole = null
        const rolesRes = await db.collection('user_roles').where({
          userId: user._id,
          roleType: roleType
        }).get()

        if (rolesRes.data.length === 0) {
          console.error('[selectRole] 用户没有该角色:', roleType)
          return {
            code: 9999,
            message: `您尚未创建${roleType === 'owner' ? '宠物主人' : '寄养家庭'}身份`,
            error: '角色不存在'
          }
        }
        targetRole = rolesRes.data[0]
        console.log('[selectRole] 找到目标角色:', targetRole._id)

        // 3. 获取对应的详细档案
        let profile = null
        const profileCollection = roleType === 'owner' ? 'ownerProfiles' : 'hostProfiles'
        try {
          const profileRes = await db.collection(profileCollection).doc(targetRole.profileId).get()
          profile = profileRes.data
          console.log('[selectRole] 找到档案:', profile._id)
        } catch (profileError) {
          console.error('[selectRole] 获取档案失败:', profileError)
          return {
            code: 9999,
            message: '获取档案失败',
            error: profileError.message
          }
        }

        // 4. 更新当前活跃状态
        // 先将所有角色的 isActive 设为 false
        await db.collection('user_roles').where({ userId: user._id }).update({
          data: { isActive: false }
        })
        // 将目标角色的 isActive 设为 true
        await db.collection('user_roles').doc(targetRole._id).update({
          data: { isActive: true, updatedAt: new Date() }
        })
        console.log('[selectRole] 已更新活跃状态')

        // 5. 生成对应的 UserSig
        const imUserID = event.imUserID || generateId(roleType, openid)
        console.log('[selectRole] 生成IM用户ID:', imUserID)
        const userSig = await generateUserSig(imUserID)

        if (!userSig) {
          console.error('[selectRole] 生成UserSig失败')
          return {
            code: 9999,
            message: '生成UserSig失败',
            error: 'IM服务错误'
          }
        }

        console.log('[selectRole] UserSig生成成功，长度:', userSig.length)

        // 6. 返回完整的身份信息
        return {
          code: 0,
          message: '身份选择成功',
          data: {
            user: user,
            roles: [targetRole],
            currentRole: targetRole,
            currentProfile: profile,
            userSig: userSig,
            imUserID: imUserID,
            timestamp: Date.now()
          }
        }
      } catch (error) {
        console.error('[selectRole] 处理失败:', error)
        return {
          code: 9999,
          message: '身份选择失败',
          error: error.message
        }
      }
    }

    // 检查是否只是刷新UserSig
    if (event.refreshUserSig) {
      console.log('=== 刷新UserSig模式 ===')
      const { openid, roleType, imUserID } = event
      console.log('[refreshUserSig] 接收到的参数:', { openid, roleType, imUserID })

      if (!openid || !roleType) {
        console.error('[refreshUserSig] 缺少必要参数')
        return {
          code: 9999,
          message: '刷新UserSig缺少必要参数',
          error: 'openid和roleType不能为空'
        }
      }

      // 使用传入的IM用户ID或生成新的
      const targetImUserID = imUserID || generateId(roleType, openid)
      console.log('[refreshUserSig] 目标IM用户ID:', targetImUserID)
      console.log('[refreshUserSig] 使用的SDKAppID:', IM_SERVICE_CONFIG.SDKAppID)
      console.log('[refreshUserSig] UserSig过期时间:', IM_SERVICE_CONFIG.EXPIRE_TIME, '秒')

      // 从IM服务后台获取UserSig
      const userSig = await generateUserSig(targetImUserID)
      if (!userSig) {
        console.error('[refreshUserSig] UserSig获取失败')
        return {
          code: 9999,
          message: '获取UserSig失败',
          error: 'IM服务返回null或错误'
        }
      }

      console.log('[refreshUserSig] UserSig获取成功，长度:', userSig.length)
      return {
        code: 0,
        message: 'UserSig刷新成功',
        data: {
          userSig: userSig,
          imUserID: targetImUserID
        }
      }
    }

    // 检查是否是创建角色请求
    if (event.createRole) {
      console.log('=== 创建角色模式 ===')
      const { roleType, roleInfo } = event
      console.log('[createRole] 接收到的参数:', { roleType, roleInfo })

      if (!roleType) {
        console.error('[createRole] 缺少必要参数')
        return {
          code: 9999,
          message: '创建角色缺少必要参数',
          error: 'roleType不能为空'
        }
      }

      // 获取微信上下文
      const wxContext = cloud.getWXContext()
      const { OPENID } = wxContext
      console.log('微信上下文:', { OPENID })

      // 获取或创建基础用户
      let user = null
      try {
        const usersRes = await db.collection('users').where({ openid: OPENID }).limit(1).get()
        if (usersRes.data.length === 0) {
          const userData = { openid: OPENID, createdAt: new Date() }
          const addRes = await db.collection('users').add({ data: userData })
          user = { _id: addRes._id, ...userData }
        } else {
          user = usersRes.data[0]
        }
      } catch (usersError) {
        console.error('获取或创建用户失败:', usersError)
        throw usersError
      }

      // 检查角色是否已存在
      let existingRoles = []
      try {
        const rolesRes = await db.collection('user_roles').where({ userId: user._id, roleType }).get()
        existingRoles = rolesRes.data
      } catch (rolesError) {
        console.error('检查角色是否存在失败:', rolesError)
      }

      if (existingRoles.length > 0) {
        console.error('角色已存在:', roleType)
        return {
          code: 9999,
          message: '角色已存在',
          error: `您已经有${roleType === 'owner' ? '宠物主人' : '寄养家庭'}身份`
        }
      }

      // 创建角色对应的档案
      let newProfile = null
      let profileCollection = roleType === 'owner' ? 'ownerProfiles' : 'hostProfiles'
      let profileId = generateId(`${roleType}profile`, OPENID)

      try {
        // 构建档案数据
        const profileData = {
          _id: profileId,
          openid: OPENID,
          userId: user._id,
          createdAt: new Date(),
          updatedAt: new Date()
        }

        // 根据角色类型添加特定字段
        if (roleType === 'owner') {
          profileData.ownerName = user.nickName || '未设置名称'
          profileData.avatarUrl = roleInfo.avatarUrl || ''
          profileData.realName = roleInfo.realName || ''
          profileData.phone = roleInfo.phone || ''
          profileData.address = roleInfo.address || ''
          profileData.petPreferences = roleInfo.petPreferences || ''
        } else if (roleType === 'host') {
          profileData.hostName = user.nickName || '未设置名称'
          profileData.avatarUrl = roleInfo.avatarUrl || ''
          profileData.realName = roleInfo.realName || ''
          profileData.phone = roleInfo.phone || ''
          profileData.homeAddress = roleInfo.homeAddress || ''
          profileData.serviceDescription = roleInfo.serviceDescription || ''
          profileData.certificationPhotos = roleInfo.certificationPhotos || []
          profileData.isVerified = roleInfo.isVerified || false
        }

        // 创建档案
        const addProfileRes = await db.collection(profileCollection).add({ data: profileData })
        console.log('创建档案成功:', addProfileRes)
        newProfile = profileData
      } catch (profileError) {
        console.error('创建档案失败:', profileError)
        throw profileError
      }

      // 创建角色记录
      let newRole = null
      try {
        const roleData = {
          _id: generateId('user_role', OPENID),
          userId: user._id,
          openid: OPENID,
          roleType,
          profileId: newProfile._id,
          isActive: false, // 新角色默认不激活
          createdAt: new Date()
        }

        const addRoleRes = await db.collection('user_roles').add({ data: roleData })
        console.log('创建角色记录成功:', addRoleRes)
        newRole = roleData
      } catch (roleError) {
        console.error('创建角色记录失败:', roleError)
        throw roleError
      }

      // 获取更新后的角色列表
      let updatedRoles = []
      try {
        const rolesRes = await db.collection('user_roles').where({ userId: user._id }).get()
        updatedRoles = rolesRes.data
      } catch (rolesError) {
        console.error('获取更新后的角色列表失败:', rolesError)
        updatedRoles = []
      }

      console.log('角色创建成功:', roleType)
      return {
        code: 0,
        message: '角色创建成功',
        data: {
          roles: updatedRoles,
          newRole: newRole,
          newProfile: newProfile
        }
      }
    }

    // 获取微信上下文
    const wxContext = cloud.getWXContext()
    const { OPENID, APPID, UNIONID } = wxContext
    console.log('微信上下文:', {
      OPENID,
      APPID,
      UNIONID: UNIONID || '未获取到'
    })

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
        // 创建默认的ownerProfile
        console.log('创建默认的ownerProfile...')
        
        // 创建默认的ownerProfile
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
        
        // 创建默认的user_role记录
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
    
    // 检查activeRole是否已经包含profile信息
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
              hostName: '寄养家庭',
              avatarUrl: '',
              createdAt: new Date(),
              updatedAt: new Date()
            }
          }
        }
      }
    }
    console.log('获取档案成功，profile:', JSON.stringify(profile, null, 2))

    // 构建用户信息对象
    let imUserID = event.imUserID || generateId(activeRole.roleType, OPENID)
    
    // 验证并标准化IM用户ID
    if (imUserID) {
      console.log('[login] 使用前端传递的IM用户ID:', imUserID)
    } else {
      console.log('[login] 生成新的IM用户ID:', imUserID)
    }
    
    const userInfo = {
      ...user,
      role: activeRole.roleType,
      userID: imUserID,
      avatarUrl: profile.avatarUrl || user.avatarUrl || '',
      nickName: activeRole.roleType === 'host' ? (profile.hostName || user.nickName || '') : (profile.ownerName || user.nickName || ''),
      profile: profile
    }

    console.log('构建的用户信息:', JSON.stringify(userInfo, null, 2))

    // 从IM服务后台获取UserSig
    const userSig = await generateUserSig(imUserID)
    console.log('[login] 获取的UserSig:', userSig ? '已获取' : '获取失败')
    console.log('[login] 获取UserSig使用的IM用户ID:', imUserID)

    // 返回登录成功结果
    const result = {
      userInfo: userInfo,
      roles: roles,
      currentRole: activeRole,
      currentProfile: profile,
      wxContext: wxContext,
      userSig: userSig
    }

    console.log('=== 登录云函数结束 ===')
    return handleSuccess(result, '登录成功')
  } catch (error) {
    console.error('登录云函数执行失败:', error)
    return handleError(error, '登录失败')
  }
}

