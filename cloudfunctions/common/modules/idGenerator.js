/**
 * ID生成器模块
 * 用于生成符合腾讯云IM服务要求的用户ID
 * 确保ID生成逻辑的一致性和规范性
 */

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
 * 标准化用户ID，确保符合腾讯云IM服务要求
 * @param {string} rawID - 原始ID
 * @returns {string} 标准化后的ID
 */
const normalizeUserID = (rawID) => {
  if (!rawID) {
    // 生成默认ID，确保长度为30位
    return generateId('guest')
  }

  let normalizedID = rawID

  // 移除开头的特殊字符
  if (normalizedID.startsWith('_') || normalizedID.startsWith('-')) {
    normalizedID = normalizedID.substring(1)
  }

  // 确保只包含允许的字符（字母、数字和下划线）
  normalizedID = normalizedID.replace(/[^a-zA-Z0-9_]/g, '')

  // 如果处理后的ID为空，生成默认ID
  if (!normalizedID) {
    return generateId('user')
  }

  // 确保长度为30位
  if (normalizedID.length !== 30) {
    // 生成新的ID，保持前缀
    const prefixMatch = normalizedID.match(/^([a-zA-Z0-9_]+)_/)
    const prefix = prefixMatch ? prefixMatch[1] : 'user'
    return generateId(prefix)
  }

  return normalizedID
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
 * 生成并验证用户ID
 * @param {string} prefix - ID前缀
 * @returns {object} 包含生成的ID和验证结果
 */
const generateAndValidateId = (prefix = '') => {
  const generatedId = generateId(prefix)
  const validation = validateUserID(generatedId)
  
  return {
    id: generatedId,
    ...validation
  }
}

/**
 * 处理前端传递的用户ID
 * @param {string} imUserID - 前端传递的用户ID
 * @param {string} fallbackID - 回退ID
 * @returns {object} 处理结果，包含标准化后的ID和验证结果
 */
const processFrontendId = (imUserID, fallbackID) => {
  // 记录前端传递的ID
  console.log('前端传递的imUserID:', imUserID)
  
  // 验证前端传递的ID
  if (imUserID) {
    const validation = validateUserID(imUserID)
    if (validation.isValid) {
      console.log('前端传递的imUserID验证通过')
      const normalizedID = normalizeUserID(imUserID)
      return {
        id: normalizedID,
        isValid: true,
        source: 'frontend'
      }
    } else {
      console.warn('前端传递的imUserID验证失败:', validation.error)
      // 使用回退ID
      const normalizedFallbackID = normalizeUserID(fallbackID)
      return {
        id: normalizedFallbackID,
        isValid: false,
        error: validation.error,
        source: 'fallback'
      }
    }
  } else {
    // 前端未传递ID，使用回退ID
    console.log('前端未传递imUserID，使用回退ID')
    const normalizedFallbackID = normalizeUserID(fallbackID)
    return {
      id: normalizedFallbackID,
      isValid: true,
      source: 'fallback'
    }
  }
}

// 导出模块
module.exports = {
  generateId,
  normalizeUserID,
  validateUserID,
  generateAndValidateId,
  processFrontendId
}
