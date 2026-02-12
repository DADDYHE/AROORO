/**
 * 测试登录云函数ID处理
 * 验证修复后的登录云函数是否能够正确处理旧格式的ID
 */

// 模拟登录云函数的关键函数
const { generateId, normalizeUserID, validateUserID, processFrontendId } = require('./cloudfunctions/login/index.js')

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

console.log('=== 测试登录云函数ID处理 ===\n')

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
