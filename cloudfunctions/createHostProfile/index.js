const cloud = require('wx-server-sdk')

// 初始化 cloud
cloud.init({
  // API 调用都保持和云函数当前所在环境一致
  env: cloud.DYNAMIC_CURRENT_ENV
})

// 本地ID生成函数，避免依赖外部模块，嵌入部分openid信息
const generateId = (prefix = '', openid = '') => {
  // 计算前缀长度
  const prefixLength = prefix ? (prefix.length + 1) : 0 // +1 for the underscore
  
  // 生成openid哈希（8位）
  let openidHash = ''
  if (openid) {
    // 使用简单的哈希方法生成openid的8位哈希值
    let hash = 0
    for (let i = 0; i < openid.length; i++) {
      const char = openid.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // 转换为32位整数
    }
    // 将哈希值转换为36进制，并确保长度为8位
    openidHash = Math.abs(hash).toString(36).padStart(8, '0').substr(0, 8)
  } else {
    // 如果没有openid，生成8位随机字符串
    openidHash = Math.random().toString(36).substr(2, 8).padEnd(8, '0').substr(0, 8)
  }
  
  // 生成时间戳（8位）
  const timestamp = Date.now().toString(36).padStart(8, '0').substr(0, 8)
  
  // 计算需要的随机字符串长度
  const randomPartLength = 30 - prefixLength - 8 - 8 // 8位openid哈希 + 8位时间戳
  
  // 生成随机字符串
  let random = ''
  while (random.length < randomPartLength) {
    random += Math.random().toString(36).substr(2, randomPartLength - random.length)
  }
  random = random.substring(0, randomPartLength)
  
  // 组合ID
  let userId = prefix ? `${prefix}_${openidHash}${timestamp}${random}` : `${openidHash}${timestamp}${random}`
  
  // 确保只包含允许的字符（字母、数字、下划线）
  userId = userId.replace(/[^a-zA-Z0-9_]/g, '')
  
  // 最终确保长度为30位
  if (userId.length < 30) {
    // 如果长度不足，添加随机字符
    const paddingLength = 30 - userId.length
    const padding = Math.random().toString(36).substr(2, paddingLength)
    userId += padding
  } else if (userId.length > 30) {
    // 如果长度超过，截取到30位
    userId = userId.substring(0, 30)
  }
  
  return userId
}

// 云函数入口函数
exports.main = async (event, context) => {
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error('创建超时，请稍后再试'))
    }, 2500) // 设置 2.5 秒超时，留出缓冲时间
  })

  try {
    console.log('创建寄养家庭配置 - 开始', event)

    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID
    const db = cloud.database()

    // 兼容两种数据结构：直接接受前端发送的扁平化数据
    // 检查event中是否有基本信息嵌套结构，如果有则使用嵌套结构，否则使用扁平化结构
    let hostName, realName, phone, idCard, address, housingType, hasYard, maxPets, hasOtherPets, nativePetInfo, petTypes, serviceTypes, pricePerDay, description, idCardFront, idCardBack, healthCertificate, emergencyContactName, emergencyContactPhone, avatarUrl

    // 检查是否有嵌套的数据结构
    if (event.basicInfo) {
      hostName = event.basicInfo.name
      realName = event.basicInfo.realName
      phone = event.basicInfo.phone
      idCard = event.basicInfo.idCard
      address = event.basicInfo.address
      avatarUrl = event.basicInfo.avatarUrl || event.basicInfo.avatarUrl // 兼容老版本字段
    } else {
      // 使用扁平化数据结构
      hostName = event.hostName
      realName = event.realName
      phone = event.phone
      idCard = event.idCard
      address = event.address
      avatarUrl = event.avatarUrl || event.avatarUrl // 兼容老版本字段
    }

    // 处理其他字段
    housingType = event.housingType || (event.environmentInfo?.housingType || '')
    hasYard = event.hasYard || (event.environmentInfo?.hasYard || '')
    maxPets = event.maxPets || (event.environmentInfo?.maxPets || '')
    hasOtherPets = event.hasOtherPets || (event.environmentInfo?.hasOtherPets || '')
    nativePetInfo = event.nativePetInfo || (event.environmentInfo?.nativePetInfo || '')
    petTypes = event.petTypes || (event.environmentInfo?.petTypes || '')
    serviceTypes = event.serviceTypes || (event.serviceInfo?.serviceTypes || [])
    pricePerDay = event.pricePerDay || (event.serviceInfo?.pricePerDay || '')
    description = event.description || (event.serviceInfo?.description || '')
    idCardFront = event.idCardFront || (event.certificationInfo?.idCardFront || '')
    idCardBack = event.idCardBack || (event.certificationInfo?.idCardBack || '')
    healthCertificate = event.healthCertificate || (event.certificationInfo?.healthCertificate || '')
    emergencyContactName = event.emergencyContactName || (event.certificationInfo?.emergencyContactName || '')
    emergencyContactPhone = event.emergencyContactPhone || (event.certificationInfo?.emergencyContactPhone || '')

    // 验证必填字段
    if (!hostName) {
      console.error('寄养家庭名称未填写:', hostName)
      return {
        code: -1,
        message: '请填写寄养家庭名称'
      }
    }

    // 检查是否已经有寄养家庭配置
    const existingHostProfiles = await db.collection('hostProfiles').where({ 
      openid: openid,
      isActive: 1
    }).get()
    
    const existingHostProfile = existingHostProfiles && existingHostProfiles.data && existingHostProfiles.data.length > 0 ? existingHostProfiles.data[0] : null

    if (existingHostProfile) {
      return {
        code: -1,
        message: '您已经创建过寄养家庭配置'
      }
    }

    // 创建寄养家庭配置
    const hostProfileData = {
      _id: generateId('hostprofile', openid),
      openid: openid,
      avatarUrl: avatarUrl || '',
      hostName: hostName,
      realName: realName,
      phone: phone,
      idCard: idCard,
      address: address,
      housingType: housingType,
      hasYard: hasYard,
      maxPets: maxPets,
      hasOtherPets: hasOtherPets,
      nativePetInfo: nativePetInfo,
      petTypes: petTypes,
      serviceTypes: serviceTypes, // 直接存储数组
      pricePerDay: pricePerDay,
      description: description,
      idCardFront: idCardFront,
      idCardBack: idCardBack,
      healthCertificate: healthCertificate,
      emergencyContactName: emergencyContactName,
      emergencyContactPhone: emergencyContactPhone,
      status: 'pending', // 待审核
      rating: 5.0, // 默认评分
      reviewCount: 0, // 默认评论数
      isAcceptingOrders: true, // 默认接受订单
      isActive: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    }

    console.log('准备插入数据库的数据:', hostProfileData)

    // 插入到CloudBase数据库
    const result = await db.collection('hostProfiles').add({
      data: hostProfileData
    })

    console.log('创建寄养家庭配置 - 成功', result)

    // 更新用户信息，设置角色为 host
    await db.collection('users').where({ openid: openid }).update({
      data: {
        role: 'host',
        updatedAt: new Date()
      }
    })

    // 创建用户角色记录
    const userRolesResult = await db.collection('user_roles').where({ openid: openid, roleType: 'host' }).get()
    if (userRolesResult.data.length === 0) {
      // 获取用户ID
      let userId = null
      const usersResult = await db.collection('users').where({ openid: openid }).field({ _id: true }).get()
      if (usersResult.data.length > 0) {
        userId = usersResult.data[0]._id
      }

      // 创建user_roles记录
      await db.collection('user_roles').add({
        data: {
          _id: generateId('user_role', openid),
          userId: userId,
          openid: openid,
          roleType: 'host',
          profileId: hostProfileData._id,
          isActive: false, // 默认非活跃，需要用户切换
          createdAt: new Date()
        }
      })
      console.log('创建user_roles记录 - 成功')
    } else {
      console.log('user_roles记录已存在，跳过创建')
    }

    // 注意：不将 cloud:// fileID 转换为临时URL，直接返回原始 fileID
    // 前端会在需要显示时调用 getTempFileURL 获取临时URL
    return {
      code: 0,
      message: '创建成功',
      data: {
        _id: hostProfileData._id,
        ...hostProfileData,
        id: hostProfileData._id,
        serviceTypes: serviceTypes // 返回原始数组
      }
    }

  } catch (error) {
    console.error('创建寄养家庭配置 - 失败', error)
    return {
      code: -1,
      message: error.message || '创建失败'
    }
  }
}
