/**
 * 新ID生成算法单元测试
 * 测试在标准化30位ID中嵌入部分openid信息的功能
 */

// 模拟ID生成函数
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

// 测试用例
const testCases = [
  {
    name: '生成带前缀和openid的ID',
    prefix: 'owner',
    openid: 'oNIhl17JEstp_WtKcSq-EUKa93qk',
    expectedLength: 30
  },
  {
    name: '生成不带前缀但带openid的ID',
    prefix: '',
    openid: 'oNIhl17JEstp_WtKcSq-EUKa93qk',
    expectedLength: 30
  },
  {
    name: '生成带前缀但不带openid的ID',
    prefix: 'host',
    openid: '',
    expectedLength: 30
  },
  {
    name: '生成不带前缀和openid的ID',
    prefix: '',
    openid: '',
    expectedLength: 30
  }
]

// 运行测试
console.log('开始测试新ID生成算法...')
let passedTests = 0
let totalTests = 0

testCases.forEach(testCase => {
  console.log(`\n测试: ${testCase.name}`)
  console.log(`前缀: "${testCase.prefix}"`)
  console.log(`openid: "${testCase.openid}"`)
  
  // 生成ID
  const generatedId = generateId(testCase.prefix, testCase.openid)
  console.log(`生成的ID: ${generatedId}`)
  console.log(`ID长度: ${generatedId.length}`)
  
  // 测试长度
  totalTests++
  if (generatedId.length === testCase.expectedLength) {
    console.log('✓ 长度测试通过')
    passedTests++
  } else {
    console.log(`✗ 长度测试失败，期望 ${testCase.expectedLength} 位，实际 ${generatedId.length} 位`)
  }
  
  // 测试格式
  totalTests++
  const validFormat = /^[a-zA-Z0-9_]+$/.test(generatedId)
  if (validFormat) {
    console.log('✓ 格式测试通过')
    passedTests++
  } else {
    console.log('✗ 格式测试失败，ID包含无效字符')
  }
  
  // 测试前缀
  totalTests++
  if (testCase.prefix) {
    const hasPrefix = generatedId.startsWith(`${testCase.prefix}_`)
    if (hasPrefix) {
      console.log('✓ 前缀测试通过')
      passedTests++
    } else {
      console.log('✗ 前缀测试失败，ID不包含指定前缀')
    }
  } else {
    console.log('✓ 前缀测试通过（无前缀）')
    passedTests++
  }
})

// 测试相同openid生成的ID是否包含相同的openid哈希部分
console.log('\n测试: 相同openid生成的ID是否包含相同的openid哈希部分')
totalTests++
const testOpenid = 'oNIhl17JEstp_WtKcSq-EUKa93qk'
const id1 = generateId('owner', testOpenid)
const id2 = generateId('owner', testOpenid)
// 提取前8位openid哈希（去掉前缀）
const hash1 = id1.replace('owner_', '').substr(0, 8)
const hash2 = id2.replace('owner_', '').substr(0, 8)
if (hash1 === hash2) {
  console.log('✓ 相同openid哈希测试通过')
  passedTests++
} else {
  console.log('✗ 相同openid哈希测试失败')
  console.log(`ID1哈希: ${hash1}`)
  console.log(`ID2哈希: ${hash2}`)
}

// 测试不同openid生成的ID是否包含不同的openid哈希部分
console.log('\n测试: 不同openid生成的ID是否包含不同的openid哈希部分')
totalTests++
const testOpenid1 = 'oNIhl17JEstp_WtKcSq-EUKa93qk'
const testOpenid2 = 'oAnotherOpenid1234567890'
const id3 = generateId('owner', testOpenid1)
const id4 = generateId('owner', testOpenid2)
// 提取前8位openid哈希（去掉前缀）
const hash3 = id3.replace('owner_', '').substr(0, 8)
const hash4 = id4.replace('owner_', '').substr(0, 8)
if (hash3 !== hash4) {
  console.log('✓ 不同openid哈希测试通过')
  passedTests++
} else {
  console.log('✗ 不同openid哈希测试失败')
  console.log(`ID1哈希: ${hash3}`)
  console.log(`ID2哈希: ${hash4}`)
}

// 测试生成多个ID的唯一性
console.log('\n测试: 生成多个ID的唯一性')
totalTests++
const generatedIds = new Set()
const uniqueTestCount = 10
let allUnique = true

for (let i = 0; i < uniqueTestCount; i++) {
  const id = generateId('owner', `test_${i}`)
  if (generatedIds.has(id)) {
    allUnique = false
    console.log(`✗ 唯一性测试失败，ID重复: ${id}`)
    break
  }
  generatedIds.add(id)
}

if (allUnique) {
  console.log(`✓ 唯一性测试通过，生成了 ${uniqueTestCount} 个唯一ID`)
  passedTests++
}

// 打印测试结果
console.log('\n=====================')
console.log('测试结果')
console.log('=====================')
console.log(`通过测试: ${passedTests}/${totalTests}`)
console.log(`成功率: ${Math.round((passedTests / totalTests) * 100)}%`)

if (passedTests === totalTests) {
  console.log('\n🎉 所有测试通过！新ID生成算法验证成功')
} else {
  console.log('\n❌ 部分测试失败，需要检查算法实现')
}

console.log('\n测试完成')
