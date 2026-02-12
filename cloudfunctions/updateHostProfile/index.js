const cloud = require('wx-server-sdk')

// 初始化 cloud
cloud.init({
  // API 调用都保持和云函数当前所在环境一致
  env: cloud.DYNAMIC_CURRENT_ENV
})

// 云函数入口函数
exports.main = async (event, context) => {
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error('查询超时，请稍后再试'))
    }, 2500) // 设置 2.5 秒超时，留出缓冲时间
  })

  try {
    console.log('更新寄养家庭配置 - 开始', event)

    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID
    const db = cloud.database()

    const { 
      updateType,
      basicInfo,
      environmentInfo,
      serviceInfo,
      certificationInfo,
      description,
      photos,
      videos
    } = event

    // 检查是否已经有寄养家庭配置
    const existingHostProfileResult = await db.collection('hostProfiles').where({
      openid: openid
    }).get()

    if (!existingHostProfileResult || !existingHostProfileResult.data || existingHostProfileResult.data.length === 0) {
      return {
        code: -1,
        message: '您尚未创建寄养家庭配置'
      }
    }

    // 构建更新数据
    const updateData = {
      updatedAt: new Date()
    }

    // 根据更新类型构建更新数据
    if (updateType === 'basicInfo') {
      // 更新扁平结构的基本信息，直接从event中获取字段
      const basicFields = ['avatarUrl', 'hostName', 'realName', 'phone', 'idCard', 'address', 
                          'pricePerDay', 'emergencyContactName', 'emergencyContactPhone',
                          'housingType', 'hasYard', 'maxPets', 'hasOtherPets', 
                          'nativePetInfo', 'petTypes', 'idCardFront', 'idCardBack', 
                          'healthCertificate'];
      
      basicFields.forEach(field => {
        if (event[field] !== undefined && event[field] !== null) {
          updateData[field] = event[field]
        }
      });
      
      // 确保名称字段一致性，同时保存hostName和name字段
      if (event.hostName !== undefined && event.hostName !== null) {
        updateData.name = event.hostName
      }
    } else if (updateType === 'description') {
      if (description !== undefined && description !== null) {
        updateData.description = description
      }
      if (event.avatarUrl !== undefined && event.avatarUrl !== null) {
        updateData.avatarUrl = event.avatarUrl
      }
    } else if (photos) {
      updateData.photos = photos
    } else if (videos) {
      updateData.videos = videos
    } else {
      // 其他更新类型可以在这里添加
      Object.keys(event).forEach(key => {
        if (key !== 'updateType') {
          updateData[key] = event[key]
        }
      })
    }

    console.log('准备更新的数据:', updateData)

    // 更新寄养家庭配置
    if (Object.keys(updateData).length > 1) { // 至少有一个字段需要更新
      const updateResult = await db.collection('hostProfiles').where({
        openid: openid
      }).update({
        data: updateData
      })
      
      console.log('更新寄养家庭配置 - 结果', updateResult)
    }

    console.log('更新寄养家庭配置 - 成功')

    return {
      code: 0,
      message: '更新成功'
    }

  } catch (error) {
    console.error('更新寄养家庭配置 - 失败', error)
    return {
      code: -1,
      message: error.message || '更新失败'
    }
  }
}
