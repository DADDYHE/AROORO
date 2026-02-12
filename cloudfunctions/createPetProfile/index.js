'use strict'
const cloud = require('wx-server-sdk')

// 初始化云开发环境
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

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
  
  // 组合ID: prefix_hash_identifier
  let userId = `${shortPrefix}_${openidHash}_${cleanIdentifier}`
  
  // 确保只包含允许的字符（字母、数字、下划线）
  userId = userId.replace(/[^a-zA-Z0-9_]/g, '')
  
  // 确保长度不超过32位
  const MAX_USER_ID_LENGTH = 32
  if (userId.length > MAX_USER_ID_LENGTH) {
    // 如果长度超过，截取标识符部分
    const maxIdentifierLength = MAX_USER_ID_LENGTH - shortPrefix.length - 1 - 8 - 1 // prefix + _ + hash + _
    const identifierPart = userId.split('_').slice(2).join('_')
    const truncatedIdentifier = identifierPart.slice(0, maxIdentifierLength)
    userId = `${shortPrefix}_${openidHash}_${truncatedIdentifier}`
  }

  console.log('[createPetProfile] 生成格式1 userID:', {
    originalPrefix: prefix,
    shortPrefix: shortPrefix,
    hash: openidHash,
    identifier: cleanIdentifier,
    result: userId,
    length: userId.length
  })

  return userId
}

exports.main = async (event, context) => {
  // 设置超时控制，确保在2.5秒内完成
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('查询超时')), 2500)
  })

  const mainPromise = (async () => {
    try {
      // 获取用户信息
      const wxContext = cloud.getWXContext()
      const openid = wxContext.OPENID
      console.log('用户openid:', openid)
      if (!openid) {
        return {
          code: -1,
          message: '用户未登录'
        }
      }

      // 打印完整的事件数据，用于调试
      console.log('接收到的所有数据:', event)

      // 解构参数
      const {
        name,
        type,
        age,
        weight,
        breed,
        isSterilized,
        isVaccinated,
        healthStatus,
        allergies,
        specialNeeds,
        dietaryHabit,
        exerciseNeed,
        sleepingHabit,
        socialBehavior,
        emergencyContactName,
        emergencyContactPhone,
        emergencyContactRelation,
        emergencyContactNote,
        avatarUrl
      } = event

      // 基本验证
      if (!name || !type || !age) {
        return {
          code: -1,
          message: '缺少必要信息'
        }
      }

      // 准备宠物数据
      const petDataToInsert = {
        _id: generateId('pet', openid),
        // 基本信息
        name: name,
        type: type,
        age: Number(age),
        weight: weight ? Number(weight) : null,
        breed: breed || '',
        // 健康状况
        isSterilized: isSterilized === 'true' ? true : false,
        isVaccinated: isVaccinated === 'true' ? true : false,
        healthStatus: healthStatus || '',
        allergies: allergies || '',
        specialNeeds: specialNeeds || '',
        // 生活习惯
        dietaryHabit: dietaryHabit || '',
        exerciseNeed: exerciseNeed || '',
        sleepingHabit: sleepingHabit || '',
        socialBehavior: socialBehavior || '',
        // 紧急联系人
        emergencyContactName: emergencyContactName || '',
        emergencyContactPhone: emergencyContactPhone || '',
        emergencyContactRelation: emergencyContactRelation || '',
        emergencyContactNote: emergencyContactNote || '',
        // 头像
        avatarUrl: avatarUrl || '',
        // 系统字段
        ownerOpenid: openid,
        _openid: openid, // 设置 _openid 字段，确保安全规则生效
        createdAt: new Date(),
        updatedAt: new Date(),
        isActive: 1
      }
      console.log('将要插入的宠物数据:', petDataToInsert)
      
      // 创建宠物档案
      const db = cloud.database()
      const result = await db.collection('pets').add({
        data: petDataToInsert
      })
      
      console.log('宠物档案创建成功，结果:', result)
      
      // 查询刚创建的宠物档案详情
      const newPetResult = await db.collection('pets').where({ _id: petDataToInsert._id }).get()
      console.log('查询到的新创建宠物数据:', newPetResult)
      
      const petData = newPetResult.data[0]

      // 处理宠物头像，将云存储 fileID 转换为临时访问 URL
      if (petData.avatarUrl && petData.avatarUrl.startsWith('cloud://')) {
        try {
          console.log('获取宠物头像临时访问 URL，fileID:', petData.avatarUrl)
          const tempFileResult = await cloud.getTempFileURL({
            fileList: [petData.avatarUrl]
          })
          
          if (tempFileResult.fileList && tempFileResult.fileList[0] && tempFileResult.fileList[0].tempFileURL) {
            petData.avatarUrl = tempFileResult.fileList[0].tempFileURL
            console.log('宠物头像临时访问 URL 获取成功:', petData.avatarUrl)
          } else {
            console.warn('获取宠物头像临时访问 URL 失败，设置默认头像')
            petData.avatarUrl = '/images/default-pet-avatar.png'
          }
        } catch (error) {
          console.warn('获取宠物头像临时访问 URL 失败:', error)
          petData.avatarUrl = '/images/default-pet-avatar.png'
        }
      } else if (!petData.avatarUrl || petData.avatarUrl === '') {
        // 如果没有头像URL或为空，设置默认头像
        petData.avatarUrl = '/images/default-avatar.svg'
      }

      // 将布尔值转换为真正的Boolean类型
      if (petData.isSterilized !== undefined) {
        petData.isSterilized = Boolean(petData.isSterilized)
      }
      if (petData.isVaccinated !== undefined) {
        petData.isVaccinated = Boolean(petData.isVaccinated)
      }

      return {
        code: 0,
        message: '创建成功',
        data: {
          id: petData._id,
          pet: petData
        }
      }
    } catch (error) {
      console.error('创建宠物档案失败:', error)
      console.error('错误详情:', JSON.stringify(error, null, 2))
      return {
        code: -1,
        message: '创建失败，请稍后重试'
      }
    }
  })()

  try {
    return await Promise.race([mainPromise, timeoutPromise])
  } catch (error) {
    console.error('查询超时或失败:', error)
    return {
      code: -1,
      message: '查询超时，请稍后再试'
    }
  }
}
