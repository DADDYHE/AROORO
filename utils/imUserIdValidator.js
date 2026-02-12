/**
 * IM userID 验证和规范化工具
 *
 * 功能：
 * 1. 验证 userID 格式是否符合规范
 * 2. 规范化 userID 为标准格式
 * 3. 提供清晰的错误提示
 * 4. 自动处理特殊字符转换
 * 5. 实现 ID 生命周期管理（缓存、版本控制、冲突处理）
 */

/**
 * IM userID 规范
 * - 格式：{roleType}_{identifier}
 * - roleType: owner, host, guest
 * - identifier: openid（通常以 'o' 开头）或哈希值
 * - 最大长度：30 字节
 * - 不允许字符：@、+、-、=、:、空格
 *
 * 短角色前缀（用于节省空间）：
 * - owner → own
 * - host → hst
 * - guest → gst
 */
const IM_USER_ID_REGEX = /^(owner|host|guest|own|hst|gst)_[a-zA-Z0-9_-]+$/

/**
 * 允许的最大长度（腾讯云 IM 限制）
 */
const MAX_USER_ID_LENGTH = 30

/**
 * 特殊字符映射表：自动转换为下划线
 */
const SPECIAL_CHAR_MAP = {
  '@': '_',
  '+': '_',
  '-': '_',
  '=': '_',
  ':': '_',
  ' ': '_',
  '.': '_',
}

/**
 * 用户角色类型
 */
const ROLE_TYPES = ['owner', 'host', 'guest']

/**
 * 角色类型映射（短版本用于节省空间）
 */
const ROLE_TYPE_MAPPING = {
  'owner': 'own',
  'host': 'hst',
  'guest': 'gst'
}

/**
 * 反向映射（短版本到完整版本）
 */
const SHORT_ROLE_TYPE_MAPPING = {
  'own': 'owner',
  'hst': 'host',
  'gst': 'guest'
}

/**
 * ID 缓存管理
 */
const ID_CACHE = {
  // 缓存结构: { key: { id: string, timestamp: number, roleType: string, identifier: string } }
  cache: {},
  maxSize: 1000,
  ttl: 24 * 60 * 60 * 1000, // 24小时过期
  
  /**
   * 生成缓存键
   * @param {string} identifier - 用户标识符
   * @param {string} roleType - 角色类型
   * @returns {string} 缓存键
   */
  generateKey(identifier, roleType) {
    return `${roleType}_${identifier}`
  },
  
  /**
   * 获取缓存的 ID
   * @param {string} identifier - 用户标识符
   * @param {string} roleType - 角色类型
   * @returns {string|null} 缓存的 ID
   */
  get(identifier, roleType) {
    const key = this.generateKey(identifier, roleType)
    const cached = this.cache[key]
    
    if (cached) {
      // 检查是否过期
      if (Date.now() - cached.timestamp < this.ttl) {
        console.log('[ImUserIdValidator] 从缓存获取 ID:', cached.id)
        return cached.id
      } else {
        // 过期，删除
        delete this.cache[key]
        console.log('[ImUserIdValidator] 缓存 ID 过期:', key)
      }
    }
    
    return null
  },
  
  /**
   * 设置缓存的 ID
   * @param {string} identifier - 用户标识符
   * @param {string} roleType - 角色类型
   * @param {string} id - 生成的 ID
   */
  set(identifier, roleType, id) {
    const key = this.generateKey(identifier, roleType)
    
    // 检查缓存大小
    if (Object.keys(this.cache).length >= this.maxSize) {
      // 删除最旧的缓存
      this._cleanup()
    }
    
    this.cache[key] = {
      id: id,
      timestamp: Date.now(),
      roleType: roleType,
      identifier: identifier
    }
    
    console.log('[ImUserIdValidator] 缓存 ID:', id, 'key:', key)
  },
  
  /**
   * 删除缓存的 ID
   * @param {string} identifier - 用户标识符
   * @param {string} roleType - 角色类型
   */
  delete(identifier, roleType) {
    const key = this.generateKey(identifier, roleType)
    delete this.cache[key]
    console.log('[ImUserIdValidator] 删除缓存 ID:', key)
  },
  
  /**
   * 清理过期的缓存
   * @private
   */
  _cleanup() {
    const now = Date.now()
    let cleaned = 0
    
    for (const key in this.cache) {
      if (now - this.cache[key].timestamp >= this.ttl) {
        delete this.cache[key]
        cleaned++
      }
    }
    
    // 如果清理后还是满的，删除最旧的
    if (Object.keys(this.cache).length >= this.maxSize) {
      const keys = Object.keys(this.cache).sort((a, b) => 
        this.cache[a].timestamp - this.cache[b].timestamp
      )
      
      const toDelete = keys.slice(0, Math.floor(this.maxSize * 0.2))
      toDelete.forEach(key => delete this.cache[key])
      cleaned += toDelete.length
    }
    
    console.log('[ImUserIdValidator] 清理缓存，删除过期项:', cleaned)
  },
  
  /**
   * 清空缓存
   */
  clear() {
    this.cache = {}
    console.log('[ImUserIdValidator] 清空缓存')
  },
  
  /**
   * 获取缓存状态
   * @returns {object} 缓存状态
   */
  getStatus() {
    const now = Date.now()
    const total = Object.keys(this.cache).length
    const expired = Object.values(this.cache).filter(item => 
      now - item.timestamp >= this.ttl
    ).length
    
    return {
      total: total,
      expired: expired,
      valid: total - expired,
      maxSize: this.maxSize,
      ttl: this.ttl
    }
  }
}

/**
 * ID 版本管理
 */
const ID_VERSION = {
  current: '1.0',
  
  /**
   * 验证 ID 版本
   * @param {string} id - 用户 ID
   * @returns {object} 版本信息
   */
  validateVersion(id) {
    // 简单的版本检测，基于格式
    const parts = id.split('_')
    
    if (parts.length === 3 && parts[0].length === 3 && parts[1].length === 8) {
      // 格式1: prefix_hash_identifier
      return {
        version: '1.0',
        format: 'format1',
        valid: true
      }
    } else {
      return {
        version: 'unknown',
        format: 'legacy',
        valid: false
      }
    }
  },
  
  /**
   * 获取版本兼容性信息
   * @param {string} version - 版本号
   * @returns {object} 兼容性信息
   */
  getCompatibility(version) {
    return {
      '1.0': {
        compatible: true,
        features: ['format1', 'cache', 'validation']
      },
      'unknown': {
        compatible: false,
        features: []
      }
    }[version] || {
      compatible: false,
      features: []
    }
  }
}

/**
 * ID 冲突处理
 */
const ID_CONFLICT = {
  /**
   * 检测 ID 冲突
   * @param {string} id - 用户 ID
   * @param {string} existingId - 已存在的 ID
   * @returns {boolean} 是否冲突
   */
  detect(id, existingId) {
    return id === existingId
  },
  
  /**
   * 解决 ID 冲突
   * @param {string} identifier - 用户标识符
   * @param {string} roleType - 角色类型
   * @returns {string} 新的 ID
   */
  resolve(identifier, roleType) {
    console.log('[ImUserIdValidator] 解决 ID 冲突，重新生成 ID')
    
    // 使用短角色前缀
    const shortRoleType = ROLE_TYPE_MAPPING[roleType] || roleType
    const prefix = shortRoleType
    
    // 生成8位哈希值
    let hash = ''
    if (identifier) {
      let hashValue = 0
      for (let i = 0; i < identifier.length; i++) {
        const char = identifier.charCodeAt(i)
        hashValue = ((hashValue << 5) - hashValue) + char
        hashValue = hashValue & hashValue
      }
      hash = Math.abs(hashValue).toString(36).padStart(8, '0').substr(0, 8)
    } else {
      hash = Math.random().toString(36).substr(2, 8).padEnd(8, '0').substr(0, 8)
    }
    
    // 处理标识符中的特殊字符
    let cleanIdentifier = identifier
    Object.keys(SPECIAL_CHAR_MAP).forEach(char => {
      cleanIdentifier = cleanIdentifier.split(char).join(SPECIAL_CHAR_MAP[char])
    })
    
    // 计算最大标识符长度
    const maxIdentifierLength = MAX_USER_ID_LENGTH - prefix.length - 1 - 8 - 1 - 4 // 额外减去4位随机后缀
    
    // 确保标识符部分不超过最大长度
    if (cleanIdentifier.length > maxIdentifierLength) {
      cleanIdentifier = cleanIdentifier.slice(0, maxIdentifierLength)
    }
    
    // 生成随机后缀
    const randomSuffix = Math.random().toString(36).substr(2, 4)
    
    // 组合ID: prefix_hash_identifier_random
    let newId = `${prefix}_${hash}_${cleanIdentifier}${randomSuffix}`
    
    // 确保只包含允许的字符
    newId = newId.replace(/[^a-zA-Z0-9_]/g, '')
    
    // 确保长度不超过限制
    if (newId.length > MAX_USER_ID_LENGTH) {
      newId = newId.slice(0, MAX_USER_ID_LENGTH)
    }
    
    console.log('[ImUserIdValidator] 冲突解决，新 ID:', newId)
    return newId
  },
  
  /**
   * 验证 ID 唯一性
   * @param {string} id - 用户 ID
   * @returns {boolean} 是否唯一
   */
  validateUniqueness(id) {
    console.log('[ImUserIdValidator] 验证 ID 唯一性:', id)
    
    // 增强的唯一性验证
    // 1. 检查 ID 格式是否正确
    if (!id || typeof id !== 'string' || id.length === 0) {
      console.warn('[ImUserIdValidator] 验证 ID 唯一性失败：ID 格式不正确')
      return false
    }
    
    // 2. 检查 ID 是否包含敏感信息
    const sensitivePatterns = [
      'admin', 'root', 'system', 'test', 'demo',
      'owner_', 'host_', 'guest_' // 避免使用完整角色前缀
    ]
    
    for (const pattern of sensitivePatterns) {
      if (id.toLowerCase().includes(pattern)) {
        console.warn('[ImUserIdValidator] 验证 ID 唯一性失败：ID 包含敏感信息')
        return false
      }
    }
    
    // 3. 检查 ID 长度是否符合要求
    if (id.length < 8 || id.length > MAX_USER_ID_LENGTH) {
      console.warn('[ImUserIdValidator] 验证 ID 唯一性失败：ID 长度不符合要求')
      return false
    }
    
    // 4. 检查 ID 是否包含连续重复字符
    if (/([a-zA-Z0-9])\1{4,}/.test(id)) {
      console.warn('[ImUserIdValidator] 验证 ID 唯一性失败：ID 包含过多连续重复字符')
      return false
    }
    
    // 5. 检查 ID 是否过于简单（全数字或全字母）
    if (/^\d+$/.test(id) || /^[a-zA-Z]+$/.test(id)) {
      console.warn('[ImUserIdValidator] 验证 ID 唯一性失败：ID 过于简单')
      return false
    }
    
    // 在实际应用中，这里应该调用后端 API 验证
    // 这里简单模拟，假设所有生成的 ID 都是唯一的
    return true
  }
}

/**
 * 验证 userID 是否符合 IM 规范
 * @param {string} userID - 待验证的 userID
 * @returns {Object} { valid: boolean, error?: string }
 */
function validateUserID(userID) {
  if (!userID || typeof userID !== 'string') {
    return {
      valid: false,
      error: 'userID 不能为空'
    }
  }

  // 检查长度
  if (userID.length < 8 || userID.length > MAX_USER_ID_LENGTH) {
    return {
      valid: false,
      error: `userID 长度不符合要求（8-${MAX_USER_ID_LENGTH} 字符）`
    }
  }

  // 检查格式
  if (!IM_USER_ID_REGEX.test(userID)) {
    // 检查是否有特殊字符
    const hasInvalidChars = /[ @+\-=:]/.test(userID)
    if (hasInvalidChars) {
      return {
        valid: false,
        error: 'userID 包含非法字符（@、+、-、=、:、空格）'
      }
    }

    // 检查是否有下划线分隔
    const parts = userID.split('_')
    if (parts.length < 2) {
      return {
        valid: false,
        error: 'userID 格式不正确，应为 roleType_identifier 格式（如 owner_openid）'
      }
    }

    // 检查 roleType 是否有效（支持完整和短版本）
    const roleType = parts[0]
    const isRoleTypeValid = ROLE_TYPES.includes(roleType) || Object.keys(SHORT_ROLE_TYPE_MAPPING).includes(roleType)
    if (!isRoleTypeValid) {
      return {
        valid: false,
        error: `无效的角色类型：${roleType}，应为 owner、host 或 guest`
      }
    }

    return {
      valid: false,
      error: 'userID 格式不符合规范'
    }
  }

  // 增强的安全性验证
  // 1. 检查 ID 是否包含敏感信息
  const sensitivePatterns = [
    'admin', 'root', 'system', 'test', 'demo'
  ]
  
  for (const pattern of sensitivePatterns) {
    if (userID.toLowerCase().includes(pattern)) {
      return {
        valid: false,
        error: 'userID 包含敏感信息'
      }
    }
  }

  // 2. 检查 ID 是否包含连续重复字符
  if (/([a-zA-Z0-9])\1{4,}/.test(userID)) {
    return {
      valid: false,
      error: 'userID 包含过多连续重复字符'
    }
  }

  // 3. 检查 ID 是否过于简单（全数字或全字母）
  if (/^\d+$/.test(userID) || /^[a-zA-Z]+$/.test(userID)) {
    return {
      valid: false,
      error: 'userID 过于简单'
    }
  }

  return { valid: true }
}

/**
 * 规范化 userID 为标准格式
 * @param {string} identifier - 用户标识符（openid 或 _id）
 * @param {string} roleType - 角色类型（owner/host/guest）
 * @returns {string} 规范化后的 userID
 */
function normalizeUserID(identifier, roleType) {
  if (!identifier || !roleType) {
    throw new Error('identifier 和 roleType 不能为空')
  }

  // 验证 roleType
  if (!ROLE_TYPES.includes(roleType)) {
    throw new Error(`无效的 roleType：${roleType}`)
  }

  // 移除已存在的 roleType 前缀（避免重复）
  let cleanIdentifier = identifier
  ROLE_TYPES.forEach(role => {
    const prefix = `${role}_`
    if (cleanIdentifier.startsWith(prefix)) {
      cleanIdentifier = cleanIdentifier.slice(prefix.length)
    }
  })

  // 转换特殊字符为下划线
  Object.keys(SPECIAL_CHAR_MAP).forEach(char => {
    cleanIdentifier = cleanIdentifier.split(char).join(SPECIAL_CHAR_MAP[char])
  })

  // 截断超长部分（保留 roleType 和分隔符）
  const maxLengthForIdentifier = MAX_USER_ID_LENGTH - roleType.length - 1
  if (cleanIdentifier.length > maxLengthForIdentifier) {
    cleanIdentifier = cleanIdentifier.slice(0, maxLengthForIdentifier)
  }

  return `${roleType}_${cleanIdentifier}`
}

/**
 * 从用户信息生成 IM userID
 * @param {Object} userInfo - 用户信息对象
 * @param {string} userInfo.openid - 用户 openid
 * @param {string} userInfo._id - 用户 MongoDB _id（备选）
 * @param {string} [userInfo.role] - 用户角色（可选）
 * @returns {string} IM userID
 */
function generateUserIDFromUserInfo(userInfo) {
  if (!userInfo) {
    throw new Error('userInfo 不能为空')
  }

  const roleType = userInfo.role || 'owner'
  const identifier = userInfo.openid || userInfo._id

  if (!identifier) {
    throw new Error('用户信息中缺少 openid 或 _id')
  }

  return normalizeUserID(identifier, roleType)
}

/**
 * 生成格式1的用户ID（prefix_hash_identifier）
 * @param {string} identifier - 用户标识符（openid 或 _id）
 * @param {string} roleType - 角色类型（owner/host/guest）
 * @returns {string} 生成的用户ID
 */
function generateFormat1UserID(identifier, roleType) {
  if (!identifier || !roleType) {
    throw new Error('identifier 和 roleType 不能为空')
  }

  if (!ROLE_TYPES.includes(roleType)) {
    throw new Error(`无效的 roleType：${roleType}`)
  }

  // 尝试从缓存获取
  const cachedId = ID_CACHE.get(identifier, roleType)
  if (cachedId) {
    console.log('[ImUserIdValidator] 从缓存获取格式1 userID:', cachedId)
    return cachedId
  }

  // 使用短角色前缀
  const shortRoleType = ROLE_TYPE_MAPPING[roleType] || roleType
  const prefix = shortRoleType
  
  // 生成8位哈希值
  let hash = ''
  if (identifier) {
    // 优化的哈希生成算法，使用更高效的 DJB2 哈希算法
    let hashValue = 5381
    for (let i = 0; i < identifier.length; i++) {
      const char = identifier.charCodeAt(i)
      // hash = hash * 33 + char
      hashValue = ((hashValue << 5) + hashValue) + char
    }
    // 将哈希值转换为36进制，并确保长度为8位
    hash = Math.abs(hashValue).toString(36).padStart(8, '0').slice(-8)
  } else {
    // 增强安全性的随机字符串生成
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let randomStr = ''
    for (let i = 0; i < 8; i++) {
      // 使用更安全的随机数生成方法
      // 结合时间戳和Math.random()提高随机性
      const randomIndex = Math.floor((Date.now() + Math.random() * 1000000) % chars.length)
      randomStr += chars.charAt(randomIndex)
    }
    hash = randomStr
  }
  
  // 处理标识符中的特殊字符
  let cleanIdentifier = identifier
  Object.keys(SPECIAL_CHAR_MAP).forEach(char => {
    cleanIdentifier = cleanIdentifier.split(char).join(SPECIAL_CHAR_MAP[char])
  })
  
  // 计算最大标识符长度
  const maxIdentifierLength = MAX_USER_ID_LENGTH - prefix.length - 1 - 8 - 1 // prefix + _ + hash + _
  console.log('[ImUserIdValidator] 最大标识符长度:', maxIdentifierLength)
  
  // 确保标识符部分不超过最大长度
  if (cleanIdentifier.length > maxIdentifierLength) {
    console.log('[ImUserIdValidator] 标识符过长，需要截断:', {
      originalLength: cleanIdentifier.length,
      maxLength: maxIdentifierLength,
      original: cleanIdentifier,
      truncated: cleanIdentifier.slice(0, maxIdentifierLength)
    })
    cleanIdentifier = cleanIdentifier.slice(0, maxIdentifierLength)
  }
  
  // 组合ID: prefix_hash_identifier
  let userID = `${prefix}_${hash}_${cleanIdentifier}`
  
  // 确保只包含允许的字符（字母、数字、下划线）
  userID = userID.replace(/[^a-zA-Z0-9_]/g, '')
  
  // 最终长度检查
  if (userID.length > MAX_USER_ID_LENGTH) {
    // 如果仍然超过，再次截取
    userID = userID.slice(0, MAX_USER_ID_LENGTH)
  }

  // 验证唯一性
  if (!ID_CONFLICT.validateUniqueness(userID)) {
    // 冲突处理
    userID = ID_CONFLICT.resolve(identifier, roleType)
  }

  // 缓存生成的ID
  ID_CACHE.set(identifier, roleType, userID)

  console.log('[ImUserIdValidator] 生成格式1 userID:', {
    original: `${roleType}_${identifier}`,
    prefix: prefix,
    hash: hash,
    identifier: cleanIdentifier,
    result: userID,
    length: userID.length,
    fromCache: false
  })

  return userID
}



/**
 * 验证并自动修复 userID
 * @param {string} userID - 待验证/修复的 userID
 * @param {Object} [options] - 修复选项
 * @param {string} [options.defaultRoleType] - 默认角色类型
 * @returns {Object} { valid: boolean, userID?: string, error?: string, fixed?: boolean }
 */
function validateAndFixUserID(userID, options = {}) {
  const { defaultRoleType = 'owner' } = options

  // 首先尝试直接验证
  const validation = validateUserID(userID)
  if (validation.valid) {
    return { valid: true, userID, fixed: false }
  }

  // 如果验证失败，尝试修复
  try {
    // 检查是否是 MongoDB _id 格式（包含字母、数字、下划线等）
    if (/^[a-z0-9_]{24}$/i.test(userID)) {
      // 这可能是 MongoDB _id，无法自动修复
      return {
        valid: false,
        error: '检测到 MongoDB _id 格式，IM 需要使用 openid 生成 userID',
        suggestion: `请使用 ${defaultRoleType}_{openid} 格式`
      }
    }

    // 尝试提取 roleType 和 identifier
    let roleType = defaultRoleType
    let identifier = userID

    const parts = userID.split('_')
    if (parts.length >= 2 && ROLE_TYPES.includes(parts[0])) {
      roleType = parts[0]
      identifier = parts.slice(1).join('_')
    }

    // 尝试规范化
    const normalized = normalizeUserID(identifier, roleType)

    // 验证规范化后的结果
    const revalidation = validateUserID(normalized)
    if (revalidation.valid) {
      return {
        valid: true,
        userID: normalized,
        fixed: true,
        original: userID
      }
    }

    return {
      valid: false,
      error: '无法自动修复 userID',
      suggestion: '请使用 roleType_openid 格式（如 owner_oNIhl17JEstp_WtKcSq-EUKa93qk）'
    }
  } catch (error) {
    return {
      valid: false,
      error: `修复 userID 时出错：${error.message}`
    }
  }
}

/**
 * 显示 userID 验证错误提示
 * @param {Object} validationResult - validateUserID 或 validateAndFixUserID 的返回结果
 */
function showUserIDError(validationResult) {
  if (!validationResult || validationResult.valid) {
    return
  }

  const messages = {
    'userID 不能为空': '获取用户信息失败，请重新登录',
    'userID 长度超过限制': '用户标识过长，请联系客服',
    'userID 包含非法字符': '用户标识包含非法字符，无法发送消息',
    'userID 格式不正确': '用户信息格式错误，请联系客服',
    '无效的角色类型': '用户角色错误，请重新登录',
  }

  const message = messages[validationResult.error] || validationResult.error || '用户信息验证失败'

  wx.showToast({
    title: message,
    icon: 'none',
    duration: 3000
  })

  console.error('[IMUserIDValidator] 验证失败:', validationResult)
}

module.exports = {
  validateUserID,
  normalizeUserID,
  generateUserIDFromUserInfo,
  generateFormat1UserID,
  validateAndFixUserID,
  showUserIDError,
  ROLE_TYPES,
  MAX_USER_ID_LENGTH,
  ROLE_TYPE_MAPPING,
  SHORT_ROLE_TYPE_MAPPING,
  // 新增：ID生命周期管理
  ID_CACHE,
  ID_VERSION,
  ID_CONFLICT
}
