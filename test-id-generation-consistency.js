// 测试前端和后端ID生成一致性
const ImUserIdValidator = require('./utils/imUserIdValidator.js')

// 模拟后端的generateId函数
function backendGenerateId(prefix = '', openid = '') {
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

  return userId
}

// 测试数据
const testCases = [
  {
    prefix: 'owner',
    openid: 'oNIhl17JEstp_WtKcSq-EUKa93qk',
    description: '宠物主人身份'
  },
  {
    prefix: 'host',
    openid: 'oNIhl145nrucUDLOpPo',
    description: '寄养家庭身份'
  },
  {
    prefix: 'guest',
    openid: 'oNIhl1234567890abcdef',
    description: '访客身份'
  }
]

console.log('=== 测试前端和后端ID生成一致性 ===')

testCases.forEach((testCase, index) => {
  console.log(`\n测试 ${index + 1}: ${testCase.description}`)
  console.log(`前缀: ${testCase.prefix}`)
  console.log(`OpenID: ${testCase.openid}`)
  
  // 前端生成
  const frontendId = ImUserIdValidator.generateFormat1UserID(testCase.openid, testCase.prefix)
  console.log(`前端生成的ID: ${frontendId}`)
  
  // 后端生成
  const backendId = backendGenerateId(testCase.prefix, testCase.openid)
  console.log(`后端生成的ID: ${backendId}`)
  
  // 比较
  const isConsistent = frontendId === backendId
  console.log(`一致性: ${isConsistent ? '✅ 一致' : '❌ 不一致'}`)
  
  // 验证格式
  const frontendValid = /^(own|hst|gst)_[a-zA-Z0-9_]+$/.test(frontendId)
  const backendValid = /^(own|hst|gst)_[a-zA-Z0-9_]+$/.test(backendId)
  console.log(`前端格式验证: ${frontendValid ? '✅ 有效' : '❌ 无效'}`)
  console.log(`后端格式验证: ${backendValid ? '✅ 有效' : '❌ 无效'}`)
  
  // 验证长度
  console.log(`前端ID长度: ${frontendId.length}`)
  console.log(`后端ID长度: ${backendId.length}`)
  console.log(`长度是否合规: ${frontendId.length <= 32 && backendId.length <= 32 ? '✅ 合规' : '❌ 超长'}`)
})

console.log('\n=== 测试完成 ===')
