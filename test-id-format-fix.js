/**
 * ID格式修复测试
 * 用于验证修复后的ID生成逻辑是否正确
 */

// 导入统一ID生成器模块
const { generateIMUserId } = require('./utils/idGenerator')

// 测试数据
const testOpenId = 'oNIhl17JEstp_WtKcSq-EUKa93qk'
const testRoles = ['owner', 'host']

console.log('=== ID格式修复测试开始 ===')
console.log('测试OpenID:', testOpenId)

// 测试生成IM用户ID
testRoles.forEach(roleType => {
  console.log(`\n测试角色: ${roleType}`)
  
  const imUserId = generateIMUserId(roleType, testOpenId)
  console.log(`生成的IM用户ID: ${imUserId}`)
  console.log(`ID长度: ${imUserId.length}`)
  
  // 分析ID结构
  const parts = imUserId.split('_')
  console.log(`ID结构分析:`)
  console.log(`  前缀: ${parts[0]}`)
  console.log(`  哈希值: ${parts[1]}`)
  console.log(`  标识符: ${parts.slice(2).join('_')}`)
  console.log(`  标识符长度: ${parts.slice(2).join('_').length}`)
  
  // 验证格式
  const isValidFormat = parts.length >= 3 && 
                        parts[1].length === 8 && 
                        /^[a-zA-Z0-9]+$/.test(parts[1]) &&
                        /^[a-zA-Z0-9_]+$/.test(parts.slice(2).join('_'))
  
  console.log(`  格式验证: ${isValidFormat ? '✓ 有效' : '✗ 无效'}`)
})

console.log('\n=== ID格式修复测试完成 ===')
