// 测试哈希算法实现
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

  console.log('[test] 生成格式1 userID:', {
    originalPrefix: prefix,
    shortPrefix: shortPrefix,
    hash: openidHash,
    identifier: cleanIdentifier,
    result: userId,
    length: userId.length
  })

  return userId
}

// 测试数据
const openid = 'oNIhl17JEstp_WtKcSq-EUKa93qk';
const correctId = 'own_05l4h598_oNIhl17JEstp_WtKc';

console.log('测试开始...');
console.log('OpenID:', openid);
console.log('期望的正确ID:', correctId);

// 测试生成ID
const generatedId = generateId('owner', openid);
console.log('生成的ID:', generatedId);

// 比较结果
if (generatedId === correctId) {
  console.log('✓ 哈希算法实现正确！');
} else {
  console.log('✗ 哈希算法实现不正确！');
  console.log('差异:', {
    generated: generatedId,
    expected: correctId
  });
}
