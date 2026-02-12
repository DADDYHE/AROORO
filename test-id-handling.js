/**
 * 测试ID处理逻辑
 * 验证修复后的ID处理是否能够正确转换旧格式ID
 */

// 模拟generateId函数
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
  
  // 确保长度不超过30位
  const MAX_USER_ID_LENGTH = 30
  if (userId.length > MAX_USER_ID_LENGTH) {
    // 如果长度超过，截取标识符部分
    const maxIdentifierLength = MAX_USER_ID_LENGTH - shortPrefix.length - 1 - 8 - 1 // prefix + _ + hash + _
    const identifierPart = userId.split('_').slice(2).join('_')
    const truncatedIdentifier = identifierPart.slice(0, maxIdentifierLength)
    userId = `${shortPrefix}_${openidHash}_${truncatedIdentifier}`
  }
  
  // 最终确保长度为30位，防止任何情况下的长度错误
  if (userId.length > MAX_USER_ID_LENGTH) {
    userId = userId.substring(0, MAX_USER_ID_LENGTH)
  }

  return userId
}

// 模拟normalizeUserID函数
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
    let prefix = prefixMatch ? prefixMatch[1] : 'user'
    
    // 映射完整角色前缀到短前缀
    const ROLE_TYPE_MAPPING = {
      'owner': 'own',
      'host': 'hst',
      'guest': 'gst'
    }
    
    if (ROLE_TYPE_MAPPING[prefix]) {
      prefix = ROLE_TYPE_MAPPING[prefix]
    }
    
    return generateId(prefix)
  }

  return normalizedID
}

// 模拟validateUserID函数
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

// 模拟processFrontendId函数
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

// 测试用例
const testCases = [
  {
    name: '旧格式owner ID测试',
    imUserID: 'owner_00329sc5ml4lkwcwf72rubru',
    fallbackID: 'owner_00329sc5ml4lkwcwf72rubru',
    expectedPrefix: 'own'
  },
  {
    name: '旧格式host ID测试',
    imUserID: 'host_00329sc5ml4lkwcwf72rubru',
    fallbackID: 'host_00329sc5ml4lkwcwf72rubru',
    expectedPrefix: 'hst'
  },
  {
    name: '新格式ID测试',
    imUserID: 'own_05l4h598_oNIhl17JEstp_WtKc',
    fallbackID: 'own_05l4h598_oNIhl17JEstp_WtKc',
    expectedPrefix: 'own'
  },
  {
    name: '空ID测试',
    imUserID: '',
    fallbackID: 'owner_00329sc5ml4lkwcwf72rubru',
    expectedPrefix: 'own'
  }
]

console.log('=== 测试ID处理逻辑 ===\n')

// 运行测试
testCases.forEach((testCase, index) => {
  console.log(`测试 ${index + 1}: ${testCase.name}`)
  console.log(`输入imUserID: ${testCase.imUserID}`)
  console.log(`输入fallbackID: ${testCase.fallbackID}`)
  
  try {
    // 测试processFrontendId
    const result = processFrontendId(testCase.imUserID, testCase.fallbackID)
    console.log(`处理结果: ${JSON.stringify(result, null, 2)}`)
    
    // 检查结果
    const generatedId = result.id
    console.log(`生成的ID: ${generatedId}`)
    console.log(`ID长度: ${generatedId.length}`)
    console.log(`前缀检查: ${generatedId.startsWith(testCase.expectedPrefix + '_') ? '✓ 正确' : '✗ 错误'}`)
    console.log(`长度检查: ${generatedId.length === 30 ? '✓ 正确' : '✗ 错误'}`)
    console.log(`是否包含owner_前缀: ${generatedId.includes('owner_') ? '✗ 错误' : '✓ 正确'}`)
    console.log(`是否包含host_前缀: ${generatedId.includes('host_') ? '✗ 错误' : '✓ 正确'}`)
  } catch (error) {
    console.log(`处理失败: ${error.message}`)
  }
  
  console.log('---\n')
})

// 测试generateId函数
console.log('=== 测试generateId函数 ===\n')
const generateIdTests = [
  { role: 'owner', openid: 'oNIhl17JEstp_WtKcSq-EUKa93qk' },
  { role: 'host', openid: 'oNIhl17JEstp_WtKcSq-EUKa93qk' },
  { role: 'guest', openid: 'oNIhl17JEstp_WtKcSq-EUKa93qk' }
]

generateIdTests.forEach((test, index) => {
  console.log(`测试 ${index + 1}: 生成${test.role}ID`)
  const generatedId = generateId(test.role, test.openid)
  console.log(`生成的ID: ${generatedId}`)
  console.log(`ID长度: ${generatedId.length}`)
  console.log(`格式检查: ${/^(own|hst|gst)_[a-zA-Z0-9_]+$/.test(generatedId) ? '✓ 正确' : '✗ 错误'}`)
  console.log('---\n')
})

console.log('=== 测试完成 ===\n')
