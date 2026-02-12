const cloud = require('wx-server-sdk')

// 初始化 cloud
cloud.init({
  // API 调用都保持和云函数当前所在环境一致
  env: 'cloud1-8gvqhsiga3011047'
})

// 云函数入口函数
exports.main = async (event, context) => {
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error('查询超时，请稍后再试'))
    }, 2500) // 设置 2.5 秒超时，留出缓冲时间
  })

  const mainPromise = (async () => {
    try {
      console.log('获取寄养家庭配置 - 开始', event)

      const wxContext = cloud.getWXContext()
      const openid = wxContext.OPENID

      // 根据 openid 查询寄养家庭配置，返回所有必需字段
      const db = cloud.database()
      const result = await db.collection('hostProfiles').where({ 
        openid: openid,
        isActive: 1
      }).field({
        _id: true,
        openid: true,
        hostName: true,
        avatarUrl: true,
        name: true,
        basicInfo: true,
        experience: true,
        services: true,
        availability: true,
        houseInfo: true,
        petPreferences: true,
        pricing: true,
        createdAt: true,
        updatedAt: true,
        address: true,
        emergencyContactName: true,
        emergencyContactPhone: true,
        hasOtherPets: true,
        hasYard: true,
        healthCertificate: true,
        housingType: true,
        idCard: true,
        idCardBack: true,
        idCardFront: true,
        isAcceptingOrders: true,
        isActive: true,
        maxPets: true,
        nativePetInfo: true,
        petTypes: true,
        phone: true,
        pricePerDay: true,
        rating: true,
        realName: true,
        reviewCount: true,
        serviceTypes: true,
        status: true,
        description: true
      }).get()
      const hostProfile = result.data && result.data.length > 0 ? result.data[0] : null

      console.log('获取寄养家庭配置 - 查询结果', hostProfile)

      if (hostProfile) {
        console.log('数据库返回的寄养家庭原始数据:', hostProfile)
        console.log('hostProfile.realName:', hostProfile.realName)
        console.log('hostProfile.phone:', hostProfile.phone)
        console.log('hostProfile.address:', hostProfile.address)
        console.log('hostProfile.idCard:', hostProfile.idCard)
        console.log('hostProfile.housingType:', hostProfile.housingType)
        console.log('hostProfile.hasYard:', hostProfile.hasYard)
        console.log('hostProfile.maxPets:', hostProfile.maxPets)
        console.log('hostProfile.hasOtherPets:', hostProfile.hasOtherPets)
        console.log('hostProfile.nativePetInfo:', hostProfile.nativePetInfo)
        console.log('hostProfile.petTypes:', hostProfile.petTypes)
        console.log('hostProfile.pricePerDay:', hostProfile.pricePerDay)
        console.log('hostProfile.emergencyContactName:', hostProfile.emergencyContactName)
        console.log('hostProfile.emergencyContactPhone:', hostProfile.emergencyContactPhone)
        
        // 确保返回的数据结构是统一的扁平结构，兼容嵌套和扁平字段
        const processedData = {
          ...hostProfile,
          _id: hostProfile._id, // 使用云数据库的 _id 字段
          avatarUrl: hostProfile.avatarUrl || hostProfile.basicInfo?.avatarUrl || '',
          hostName: hostProfile.hostName || hostProfile.basicInfo?.hostName || hostProfile.name || hostProfile.basicInfo?.name || '未设置名称',
          realName: hostProfile.realName || hostProfile.basicInfo?.realName || '未填写',
          phone: hostProfile.phone || hostProfile.basicInfo?.phone || '未填写',
          idCard: hostProfile.idCard || hostProfile.basicInfo?.idCard || '未填写',
          address: hostProfile.address || hostProfile.basicInfo?.address || '未填写',
          housingType: hostProfile.housingType || hostProfile.basicInfo?.housingType || hostProfile.houseInfo?.type || '未填写',
          hasYard: hostProfile.hasYard || hostProfile.basicInfo?.hasYard || hostProfile.houseInfo?.hasYard || '未填写',
          maxPets: hostProfile.maxPets || hostProfile.basicInfo?.maxPets || '未填写',
          hasOtherPets: hostProfile.hasOtherPets || hostProfile.basicInfo?.hasOtherPets || '未填写',
          nativePetInfo: hostProfile.nativePetInfo || hostProfile.basicInfo?.nativePetInfo || '未填写',
          petTypes: hostProfile.petTypes || hostProfile.basicInfo?.petTypes || hostProfile.petPreferences?.types || '未填写',
          pricePerDay: hostProfile.pricePerDay || hostProfile.basicInfo?.pricePerDay || hostProfile.pricing?.daily || '未填写',
          emergencyContactName: hostProfile.emergencyContactName || hostProfile.basicInfo?.emergencyContactName || '未填写',
          emergencyContactPhone: hostProfile.emergencyContactPhone || hostProfile.basicInfo?.emergencyContactPhone || '未填写',
          description: hostProfile.description || hostProfile.basicInfo?.description || '我们是一个热爱宠物的家庭，提供安全舒适的寄养环境。'
        }
        
        // 不在云函数中转换fileID为临时URL，直接返回cloud:// fileID
        // 由前端负责转换为临时URL，这样可以避免存储过期的临时URL
        
        console.log('处理后的寄养家庭数据:', processedData)
        
        return {
          code: 0,
          message: '获取成功',
          data: processedData
        }
      } else {
        return {
          code: -1,
          message: '未找到寄养家庭配置',
          data: null
        }
      }

    } catch (error) {
      console.error('获取寄养家庭配置 - 失败', error)
      return {
        code: -1,
        message: error.message || '获取失败',
        data: null
      }
    }
  })()

  try {
    return await Promise.race([mainPromise, timeoutPromise])
  } catch (error) {
    console.error('查询超时或失败:', error)
    return {
      code: -1,
      message: '查询超时，请稍后再试',
      data: null
    }
  }
}
