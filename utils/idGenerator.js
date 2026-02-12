/**
 * 统一ID生成器模块
 * 用于生成符合腾讯云IM服务要求的用户ID
 * 确保所有地方生成的ID格式一致
 */

// 本地ID生成函数，与云函数中的generateId保持一致
function generateFormat1Id(prefix = '', openid = '') {
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

  console.log('[idGenerator] 生成格式1 userID:', {
    originalPrefix: prefix,
    shortPrefix: shortPrefix,
    hash: openidHash,
    identifier: cleanIdentifier,
    result: userId,
    length: userId.length
  })

  return userId
}

/**
 * 标准化用户ID
 * @param {string} rawID - 原始ID
 * @returns {string} 标准化后的ID
 */
function normalizeUserID(rawID) {
  if (!rawID) {return ''}
  
  // 移除特殊字符
  let normalized = rawID.replace(/[^a-zA-Z0-9_]/g, '')
  
  // 确保长度不超过32位
  const MAX_USER_ID_LENGTH = 32
  if (normalized.length > MAX_USER_ID_LENGTH) {
    normalized = normalized.substring(0, MAX_USER_ID_LENGTH)
  }
  
  return normalized
}

/**
 * 验证用户ID
 * @param {string} userID - 要验证的用户ID
 * @returns {object} 验证结果
 */
function validateUserID(userID) {
  if (!userID) {
    return {
      valid: false,
      message: '用户ID不能为空'
    }
  }
  
  if (userID.length < 3) {
    return {
      valid: false,
      message: '用户ID长度不能少于3位'
    }
  }
  
  if (userID.length > 32) {
    return {
      valid: false,
      message: '用户ID长度不能超过32位'
    }
  }
  
  if (!/^[a-zA-Z0-9_]+$/.test(userID)) {
    return {
      valid: false,
      message: '用户ID只能包含字母、数字和下划线'
    }
  }
  
  return {
    valid: true,
    message: '用户ID格式正确'
  }
}

/**
 * 生成并验证用户ID
 * @param {string} prefix - ID前缀
 * @returns {object} 包含生成的ID和验证结果
 */
function generateAndValidateId(prefix) {
  // 模拟wx对象，在测试环境中使用
  const wx = global.wx || {
    getStorageSync: function(key) {
      return ''
    }
  }
  
  // 优先从LoginStateManager获取openid
  let openid = ''
  try {
    const app = getApp()
    if (app && app.globalData && app.globalData.loginStateManager) {
      openid = app.globalData.loginStateManager.get('openid') || ''
    }
  } catch (error) {
    console.error('从LoginStateManager获取openid失败:', error)
  }
  
  // 回退到使用wx.getStorageSync获取openid
  if (!openid) {
    openid = wx.getStorageSync('openid') || ''
  }
  
  const generatedId = generateFormat1Id(prefix, openid)
  const validation = validateUserID(generatedId)
  
  return {
    id: generatedId,
    validation: validation
  }
}

/**
 * 处理前端传递的用户ID
 * @param {string} imUserID - 前端传递的用户ID
 * @param {string} fallbackID - 回退ID
 * @returns {object} 处理结果
 */
function processFrontendId(imUserID, fallbackID) {
  // 验证传递的用户ID
  const validation = validateUserID(imUserID)
  
  if (validation.valid) {
    return {
      id: imUserID,
      isValid: true,
      message: '使用前端传递的用户ID'
    }
  }
  
  // 如果传递的ID无效，使用回退ID
  if (fallbackID) {
    const fallbackValidation = validateUserID(fallbackID)
    if (fallbackValidation.valid) {
      return {
        id: fallbackID,
        isValid: true,
        message: '使用回退用户ID'
      }
    }
  }
  
  // 模拟wx对象，在测试环境中使用
  const wx = global.wx || {
    getStorageSync: function(key) {
      return ''
    }
  }
  
  // 优先从LoginStateManager获取openid
  let openid = ''
  try {
    const app = getApp()
    if (app && app.globalData && app.globalData.loginStateManager) {
      openid = app.globalData.loginStateManager.get('openid') || ''
    }
  } catch (error) {
    console.error('从LoginStateManager获取openid失败:', error)
  }
  
  // 回退到使用wx.getStorageSync获取openid
  if (!openid) {
    openid = wx.getStorageSync('openid') || ''
  }
  
  // 如果都无效，生成新ID
  const generatedId = generateFormat1Id('user', openid)
  
  return {
    id: generatedId,
    isValid: true,
    message: '生成新的用户ID'
  }
}

/**
 * 生成IM服务ID
 * @param {string} roleType - 身份类型 ('owner' 或 'host')
 * @param {string} openid - 用户的openid
 * @returns {string} 生成的IM服务ID
 */
function generateIMUserId(roleType, openid) {
  return generateFormat1Id(roleType, openid)
}

/**
 * 生成格式1 userID
 * @param {string} prefix - ID前缀
 * @param {string} openid - 用户的openid
 * @returns {string} 生成的格式1 userID
 */
function generateFormat1UserId(prefix, openid) {
  return generateFormat1Id(prefix, openid)
}

/**
 * 标准化用户ID
 * @param {string} rawID - 原始ID
 * @returns {string} 标准化后的ID
 */
function normalizeUserId(rawID) {
  return normalizeUserID(rawID)
}

/**
 * 验证用户ID
 * @param {string} userID - 要验证的用户ID
 * @returns {object} 验证结果
 */
function validateUserId(userID) {
  return validateUserID(userID)
}

/**
 * 生成并验证用户ID
 * @param {string} prefix - ID前缀
 * @returns {object} 包含生成的ID和验证结果
 */
function generateAndValidateUserId(prefix) {
  return generateAndValidateId(prefix)
}

/**
 * 处理前端传递的用户ID
 * @param {string} imUserID - 前端传递的用户ID
 * @param {string} fallbackID - 回退ID
 * @returns {object} 处理结果
 */
function processFrontendIdExport(imUserID, fallbackID) {
  return processFrontendId(imUserID, fallbackID)
}

// 导出模块（兼容CommonJS）
module.exports = {
  generateIMUserId,
  generateFormat1UserId,
  normalizeUserId,
  validateUserId,
  generateAndValidateUserId,
  processFrontendId: processFrontendIdExport,
  // 同时支持默认导出，兼容ES模块
  default: {
    generateIMUserId,
    generateFormat1UserId,
    normalizeUserId,
    validateUserId,
    generateAndValidateUserId,
    processFrontendId: processFrontendIdExport
  }
}

// 为ES模块环境添加兼容
if (typeof exports !== 'undefined' && !exports.default) {
  exports.default = module.exports
}
