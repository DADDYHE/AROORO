/**
 * ID生成器验证测试
 * 用于验证统一ID生成模块的功能是否正常
 */

// 导入统一ID生成器模块
const { generateIMUserId, generateFormat1UserId, validateUserId } = require('./utils/idGenerator')

// 模拟测试数据
const testData = [
  {
    roleType: 'owner',
    openid: 'oNIhl17JEstp_WtKcSq-EUKa93qk',
    description: '主人身份，正常openid'
  },
  {
    roleType: 'host',
    openid: 'oNIhl17JEstp_WtKcSq-EUKa93qk',
    description: '寄养家庭身份，正常openid'
  },
  {
    roleType: 'owner',
    openid: '',
    description: '主人身份，空openid'
  },
  {
    roleType: 'host',
    openid: '',
    description: '寄养家庭身份，空openid'
  }
]

console.log('=== ID生成器验证测试开始 ===')

// 测试生成IM用户ID
testData.forEach((testCase, index) => {
  console.log(`\n测试 ${index + 1}: ${testCase.description}`)
  console.log(`角色类型: ${testCase.roleType}`)
  console.log(`OpenID: ${testCase.openid || '(空)'}`)
  
  const imUserId = generateIMUserId(testCase.roleType, testCase.openid)
  console.log(`生成的IM用户ID: ${imUserId}`)
  console.log(`ID长度: ${imUserId.length}`)
  
  const validation = validateUserId(imUserId)
  console.log(`验证结果: ${validation.valid ? '✓ 有效' : '✗ 无效'}`)
  if (!validation.valid) {
    console.log(`验证错误: ${validation.message}`)
  }
})

// 测试生成格式1用户ID
console.log('\n=== 测试格式1用户ID生成 ===')
const prefixes = ['ownerprofile', 'hostprofile', 'user_role', 'pet']
const testOpenid = 'oNIhl17JEstp_WtKcSq-EUKa93qk'

prefixes.forEach(prefix => {
  const format1Id = generateFormat1UserId(prefix, testOpenid)
  console.log(`前缀: ${prefix}`)
  console.log(`生成的ID: ${format1Id}`)
  console.log(`ID长度: ${format1Id.length}`)
  
  const validation = validateUserId(format1Id)
  console.log(`验证结果: ${validation.valid ? '✓ 有效' : '✗ 无效'}`)
  console.log('---')
})

console.log('\n=== ID生成器验证测试完成 ===')
