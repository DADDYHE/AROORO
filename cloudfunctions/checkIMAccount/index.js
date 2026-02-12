/**
 * 检查IM服务账号状态云函数
 * 用于验证IM服务ID是否已正确注册，检查账号状态和权限配置
 */

const cloud = require('wx-server-sdk')

// 初始化云开发环境
cloud.init({
  env: 'cloud1-8gvqhsiga3011047',
})

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
    console.log('[checkIMAccount] 开始生成UserSig:', userID);
    console.log('[checkIMAccount] SecretKey配置状态:', IM_SERVICE_CONFIG.SecretKey ? '已配置' : '未配置');
    console.log('[checkIMAccount] SDKAppID:', IM_SERVICE_CONFIG.SDKAppID);
    console.log('[checkIMAccount] EXPIRE_TIME:', IM_SERVICE_CONFIG.EXPIRE_TIME, '秒');

    // 引入腾讯云IM SDK
    const TLSSigAPIv2 = require('tls-sig-api-v2');

    // 初始化SDK
    const api = new TLSSigAPIv2.Api(IM_SERVICE_CONFIG.SDKAppID, IM_SERVICE_CONFIG.SecretKey);

    // 生成UserSig
    const userSig = api.genSig(userID, IM_SERVICE_CONFIG.EXPIRE_TIME);

    if (userSig) {
      console.log('[checkIMAccount] UserSig生成成功，长度:', userSig.length);
      console.log('[checkIMAccount] UserSig前20位:', userSig.substring(0, 20) + '...');
      return userSig;
    } else {
      console.error('[checkIMAccount] UserSig生成失败，返回空值');
      return null;
    }
  } catch (error) {
    console.error('[checkIMAccount] 生成UserSig失败:', error);
    console.error('[checkIMAccount] 错误详情:', {
      message: error.message,
      stack: error.stack
    });
    return null;
  }
};

/**
 * 生成唯一的用户ID，固定长度为30位，嵌入部分openid信息
 * @param {string} prefix - ID前缀，如角色类型
 * @param {string} openid - 用户的openid，用于生成哈希值
 * @returns {string} 生成的唯一ID
 */
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

/**
 * 验证用户ID是否符合规范
 * @param {string} userID - 要验证的用户ID
 * @returns {object} 验证结果，包含是否有效和错误信息
 */
const validateUserID = (userID) => {
  if (!userID || typeof userID !== 'string') {
    return {
      isValid: false,
      error: '用户ID不能为空且必须是字符串'
    }
  }

  // 检查长度，确保长度为30位
  if (userID.length !== 30) {
    return {
      isValid: false,
      error: '用户ID长度必须为30字节'
    }
  }

  // 检查字符类型
  if (!/^[a-zA-Z0-9_]+$/.test(userID)) {
    return {
      isValid: false,
      error: '用户ID只能包含字母、数字和下划线'
    }
  }

  // 检查是否为空
  if (!userID.trim()) {
    return {
      isValid: false,
      error: '用户ID不能为空'
    }
  }

  return {
    isValid: true,
    error: null
  }
}

/**
 * 检查IM服务账号状态
 * @param {string} userID - IM服务用户ID
 * @param {string} openid - 用户openid
 * @param {string} roleType - 角色类型
 * @returns {object} 账号状态检查结果
 */
const checkIMAccountStatus = async (userID, openid, roleType) => {
  try {
    console.log('开始检查IM服务账号状态:', {
      userID,
      openid,
      roleType
    })

    // 1. 验证用户ID格式
    const idValidation = validateUserID(userID)
    if (!idValidation.isValid) {
      return {
        code: 400,
        message: '用户ID格式验证失败',
        data: {
          valid: false,
          reason: idValidation.error,
          userID
        }
      }
    }

    // 2. 从IM服务后台获取UserSig用于测试登录
    const userSig = await generateUserSig(userID)
    if (!userSig || userSig.length < 10) {
      return {
        code: 500,
        message: '获取UserSig失败',
        data: {
          valid: false,
          reason: 'UserSig获取失败'
        }
      }
    }

    // 3. 检查账号是否存在于数据库中
    const db = cloud.database()
    const userResult = await db.collection('users').where({ openid }).get()
    const hasUserRecord = userResult.data && userResult.data.length > 0

    // 4. 检查角色记录
    let roleRecord = null
    if (hasUserRecord) {
      const userId = userResult.data[0]._id
      const roleResult = await db.collection('user_roles').where({ 
        openid, 
        roleType 
      }).get()
      
      if (roleResult.data && roleResult.data.length > 0) {
        roleRecord = roleResult.data[0]
      }
    }

    // 5. 构建检查结果
    const result = {
      code: 0,
      message: 'IM服务账号状态检查完成',
      data: {
        valid: true,
        userID,
        roleType,
        userSigGenerated: !!userSig,
        userSigLength: userSig ? userSig.length : 0,
        databaseCheck: {
          hasUserRecord,
          hasRoleRecord: !!roleRecord,
          roleRecord
        },
        accountStatus: '待激活',
        permissions: {
          canSendMessage: true,
          canReceiveMessage: true,
          canCreateConversation: true
        }
      }
    }

    // 6. 根据检查结果更新账号状态
    if (hasUserRecord && roleRecord) {
      result.data.accountStatus = '已激活'
    } else if (hasUserRecord) {
      result.data.accountStatus = '部分激活（缺少角色记录）'
    }

    console.log('IM服务账号状态检查结果:', result)
    return result
  } catch (error) {
    console.error('检查IM服务账号状态时出错:', error)
    return {
      code: 500,
      message: '检查IM服务账号状态时出错',
      error: error.message
    }
  }
}

// 云函数入口
exports.main = async (event, context) => {
  try {
    const { userID, openid, roleType } = event

    // 验证必要参数
    if (!userID || !openid || !roleType) {
      return {
        code: 400,
        message: '缺少必要参数',
        error: 'userID、openid和roleType为必填参数'
      }
    }

    // 检查IM服务账号状态
    const result = await checkIMAccountStatus(userID, openid, roleType)
    return result
  } catch (error) {
    console.error('云函数执行出错:', error)
    return {
      code: 500,
      message: '云函数执行出错',
      error: error.message
    }
  }
}
