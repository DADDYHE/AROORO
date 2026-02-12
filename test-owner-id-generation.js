// test-owner-id-generation.js
// 测试宠物主人IM服务ID生成的一致性

const ImUserIdValidator = require('./utils/imUserIdValidator')
const { imSingleton } = require('./utils/imSingleton')

// 重写generateHashBasedUserID函数为generateFormat1UserID
ImUserIdValidator.generateHashBasedUserID = ImUserIdValidator.generateFormat1UserID

// 测试用的openid
const testOpenids = [
  'oNIhl17JEstp_WtKcSq-EUKa93qk',
  'oABC123XYZ789-test-openid',
  'oTest1234567890123456789'
]

// 测试角色类型
const testRole = 'owner'

console.log('=== 宠物主人IM服务ID生成测试 ===\n')

// 测试1: 基本的ID生成测试
console.log('1. 基本ID生成测试:')
testOpenids.forEach((openid, index) => {
  try {
    const generatedId = ImUserIdValidator.generateHashBasedUserID(openid, testRole)
    console.log(`  ${index + 1}. OpenID: ${openid}`)
    console.log(`     生成的ID: ${generatedId}`)
    console.log(`     ID长度: ${generatedId.length}`)
    console.log(`     ID格式: ${generatedId.startsWith('own_') ? '✓ 正确' : '✗ 错误'}`)
    console.log(`     符合30字符要求: ${generatedId.length === 30 ? '✓ 是' : '✗ 否'}`)
    console.log()
  } catch (error) {
    console.error(`  ${index + 1}. 生成失败:`, error.message)
    console.log()
  }
})

// 测试2: ID唯一性测试
console.log('2. ID唯一性测试:')
const generatedIds = new Set()
let hasDuplicate = false

testOpenids.forEach(openid => {
  try {
    const generatedId = ImUserIdValidator.generateHashBasedUserID(openid, testRole)
    if (generatedIds.has(generatedId)) {
      console.log(`  ✗ 发现重复ID: ${generatedId}`)
      hasDuplicate = true
    } else {
      generatedIds.add(generatedId)
    }
  } catch (error) {
    console.error(`  生成失败:`, error.message)
  }
})

if (!hasDuplicate) {
  console.log('  ✓ 所有生成的ID都是唯一的')
} else {
  console.log('  ✗ 存在重复的ID')
}
console.log()

// 测试3: MessageService风格ID生成测试
console.log('3. MessageService风格ID生成测试:')
try {
  // 模拟MessageService中的ID生成逻辑
  const testOpenid = testOpenids[0]
  
  // 测试MessageService风格的ID生成
  let userId = ''
  try {
    userId = ImUserIdValidator.generateHashBasedUserID(testOpenid, testRole)
    console.log(`  ✓ MessageService风格ID生成成功: ${userId}`)
  } catch (error) {
    userId = `${testRole}_${testOpenid}`
    console.log(`  ⚠ MessageService备用ID生成: ${userId}`)
  }
  
} catch (error) {
  console.error(`  ✗ MessageService风格测试失败:`, error.message)
}
console.log()

// 测试4: 与IMSingleton集成测试
console.log('4. IMSingleton集成测试:')
try {
  // 测试imSingleton的normalizeUserID方法
  const testUserID = `${testRole}_${testOpenids[0]}`
  const normalizedId = imSingleton.normalizeUserID(testUserID)
  console.log(`  原始ID: ${testUserID}`)
  console.log(`  标准化后: ${normalizedId}`)
  console.log(`  标准化结果: ${normalizedId.length === 30 ? '✓ 符合要求' : '✗ 不符合要求'}`)
  console.log(`  格式正确: ${normalizedId.startsWith('own_') ? '✓ 是' : '✗ 否'}`)
} catch (error) {
  console.error(`  ✗ IMSingleton集成测试失败:`, error.message)
}
console.log()

// 测试5: 验证ID格式细节
console.log('5. ID格式细节验证:')
try {
  const testOpenid = testOpenids[0]
  const generatedId = ImUserIdValidator.generateHashBasedUserID(testOpenid, testRole)
  
  console.log(`  生成的ID: ${generatedId}`)
  
  // 验证前缀
  const hasPrefix = generatedId.startsWith('own_')
  console.log(`  包含正确前缀: ${hasPrefix ? '✓ 是' : '✗ 否'}`)
  
  // 验证长度
  const hasCorrectLength = generatedId.length === 30
  console.log(`  长度正确(30字符): ${hasCorrectLength ? '✓ 是' : '✗ 否'}`)
  
  // 验证字符集
  const hasValidChars = /^[a-zA-Z0-9_]+$/.test(generatedId)
  console.log(`  只包含字母数字下划线: ${hasValidChars ? '✓ 是' : '✗ 否'}`)
  
  // 验证结构
  const parts = generatedId.split('_')
  const hasStructure = parts.length === 2
  console.log(`  包含前缀和内容部分: ${hasStructure ? '✓ 是' : '✗ 否'}`)
  
} catch (error) {
  console.error(`  ✗ 格式验证失败:`, error.message)
}
console.log()

// 测试6: 边界情况测试
console.log('6. 边界情况测试:')

// 测试空openid
try {
  const emptyId = ImUserIdValidator.generateHashBasedUserID('', testRole)
  console.log(`  空openid测试: ${emptyId ? '✓ 成功' : '✗ 失败'}`)
} catch (error) {
  console.log(`  空openid测试: ✗ 抛出异常: ${error.message}`)
}

// 测试过长openid
const longOpenid = 'o' + 'a'.repeat(50)
try {
  const longId = ImUserIdValidator.generateHashBasedUserID(longOpenid, testRole)
  console.log(`  过长openid测试: ${longId.length === 30 ? '✓ 长度正确' : '✗ 长度错误'}`)
} catch (error) {
  console.log(`  过长openid测试: ✗ 抛出异常: ${error.message}`)
}

console.log()
console.log('=== 测试完成 ===')
console.log('所有测试都应该通过，确保宠物主人IM服务ID生成的一致性。')
console.log('生成的ID格式应该为: own_xxxxxxxxxxxxxxxxxxxxxxxxxx (30字符)')
