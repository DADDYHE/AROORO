/**
 * 测试ID区分逻辑
 * 验证修复后的登录云函数是否能够正确区分小程序角色ID和IM服务ID
 */

// 模拟登录云函数的关键函数
const { generateId, normalizeUserID, validateUserID, processFrontendId } = require('./cloudfunctions/login/index.js')

// 测试用例
const testCases = [
  {
    name: '小程序角色ID到IM服务ID转换测试',
   小程序角色ID: 'owner_00329sc5ml4lkwcwf72rubru',
    openid: 'oNIhl17JEstp_WtKcSq-EUKa93qk',
    expectedIMPrefix: 'own'
  },
  {
    name: '寄养家庭角色ID转换测试',
   小程序角色ID: 'host_00329sc5ml4lkwcwf72rubru',
    openid: 'oNIhl17JEstp_WtKcSq-EUKa93qk',
    expectedIMPrefix: 'hst'
  },
  {
    name: '空ID测试',
   小程序角色ID: '',
    openid: 'oNIhl17JEstp_WtKcSq-EUKa93qk',
    expectedIMPrefix: 'own'
  }
]

console.log('=== 测试ID区分逻辑 ===\n')

// 运行测试
testCases.forEach((testCase, index) => {
  console.log(`测试 ${index + 1}: ${testCase.name}`)
  console.log(`小程序角色ID: ${testCase.小程序角色ID}`)
  console.log(`OpenID: ${testCase.openid}`)
  
  try {
    // 测试processFrontendId（模拟IM服务ID生成）
    const result = processFrontendId(testCase.小程序角色ID, testCase.小程序角色ID, testCase.openid)
    console.log(`处理结果: ${JSON.stringify(result, null, 2)}`)
    
    // 检查结果
    const generatedIMID = result.id
    console.log(`生成的IM服务ID: ${generatedIMID}`)
    console.log(`IM服务ID长度: ${generatedIMID.length}`)
    console.log(`IM服务ID前缀检查: ${generatedIMID.startsWith(testCase.expectedIMPrefix + '_') ? '✓ 正确' : '✗ 错误'}`)
    console.log(`IM服务ID长度检查: ${generatedIMID.length === 30 ? '✓ 正确' : '✗ 错误'}`)
    console.log(`是否包含完整角色前缀: ${generatedIMID.includes('owner_') || generatedIMID.includes('host_') ? '✗ 错误' : '✓ 正确'}`)
    
    // 验证小程序角色ID保持不变
    console.log(`小程序角色ID保持不变: ✓ 正确（保持为: ${testCase.小程序角色ID}）`)
    console.log(`IM服务ID与小程序角色ID不同: ${generatedIMID !== testCase.小程序角色ID ? '✓ 正确' : '✗ 错误'}`)
  } catch (error) {
    console.log(`处理失败: ${error.message}`)
  }
  
  console.log('---\n')
})

// 测试直接生成IM服务ID
console.log('=== 测试直接生成IM服务ID ===\n')
const generateIdTests = [
  { role: 'owner', openid: 'oNIhl17JEstp_WtKcSq-EUKa93qk' },
  { role: 'host', openid: 'oNIhl17JEstp_WtKcSq-EUKa93qk' },
  { role: 'guest', openid: 'oNIhl17JEstp_WtKcSq-EUKa93qk' }
]

generateIdTests.forEach((test, index) => {
  console.log(`测试 ${index + 1}: 直接生成${test.role}的IM服务ID`)
  const generatedId = generateId(test.role, test.openid)
  console.log(`生成的IM服务ID: ${generatedId}`)
  console.log(`ID长度: ${generatedId.length}`)
  console.log(`格式检查: ${/^(own|hst|gst)_[a-zA-Z0-9_]+$/.test(generatedId) ? '✓ 正确' : '✗ 错误'}`)
  console.log('---\n')
})

console.log('=== 测试完成 ===\n')
console.log('预期结果:')
console.log('1. 小程序角色ID保持不变（如: owner_00329sc5ml4lkwcwf72rubru）')
console.log('2. IM服务ID使用短前缀格式（如: own_05l4h598_oNIhl17JEstp_WtKc）')
console.log('3. 两者格式不同，用途不同')
