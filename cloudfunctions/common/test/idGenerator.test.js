/**
 * ID生成器单元测试
 * 确保ID生成逻辑的一致性和正确性
 */

const idGenerator = require('../modules/idGenerator')
const { generateId, normalizeUserID, validateUserID, processFrontendId } = idGenerator

// 测试生成ID
console.log('=== 测试生成ID ===')
try {
  // 测试带前缀的ID生成
  const idWithPrefix = generateId('owner')
  console.log('带前缀的ID:', idWithPrefix)
  console.log('带前缀的ID长度:', idWithPrefix.length)
  console.log('带前缀的ID是否符合规范:', validateUserID(idWithPrefix).isValid)
  
  // 测试不带前缀的ID生成
  const idWithoutPrefix = generateId()
  console.log('不带前缀的ID:', idWithoutPrefix)
  console.log('不带前缀的ID长度:', idWithoutPrefix.length)
  console.log('不带前缀的ID是否符合规范:', validateUserID(idWithoutPrefix).isValid)
  
  // 测试多次生成的ID是否唯一
  const ids = []
  for (let i = 0; i < 10; i++) {
    ids.push(generateId('test'))
  }
  const uniqueIds = [...new Set(ids)]
  console.log('生成10个ID，唯一ID数量:', uniqueIds.length)
  console.log('ID唯一性测试:', uniqueIds.length === 10 ? '通过' : '失败')
  
} catch (error) {
  console.error('生成ID测试失败:', error)
}

// 测试标准化ID
console.log('\n=== 测试标准化ID ===')
try {
  // 测试正常ID
  const normalId = 'owner_1234567890abcdef'
  const normalizedNormalId = normalizeUserID(normalId)
  console.log('正常ID标准化结果:', normalizedNormalId)
  console.log('正常ID标准化后是否符合规范:', validateUserID(normalizedNormalId).isValid)
  
  // 测试超长ID
  const longId = 'owner_1234567890abcdefghijklmnopqrstuvwxyz1234567890'
  const normalizedLongId = normalizeUserID(longId)
  console.log('超长ID标准化结果:', normalizedLongId)
  console.log('超长ID标准化后长度:', normalizedLongId.length)
  console.log('超长ID标准化后是否符合规范:', validateUserID(normalizedLongId).isValid)
  
  // 测试包含特殊字符的ID
  const specialCharId = 'owner_123-456@789'
  const normalizedSpecialCharId = normalizeUserID(specialCharId)
  console.log('包含特殊字符的ID标准化结果:', normalizedSpecialCharId)
  console.log('包含特殊字符的ID标准化后是否符合规范:', validateUserID(normalizedSpecialCharId).isValid)
  
  // 测试空ID
  const emptyId = ''
  const normalizedEmptyId = normalizeUserID(emptyId)
  console.log('空ID标准化结果:', normalizedEmptyId)
  console.log('空ID标准化后是否符合规范:', validateUserID(normalizedEmptyId).isValid)
  
  // 测试null ID
  const nullId = null
  const normalizedNullId = normalizeUserID(nullId)
  console.log('null ID标准化结果:', normalizedNullId)
  console.log('null ID标准化后是否符合规范:', validateUserID(normalizedNullId).isValid)
  
} catch (error) {
  console.error('标准化ID测试失败:', error)
}

// 测试验证ID
console.log('\n=== 测试验证ID ===')
try {
  // 测试有效的ID（30位）
  const validId = generateId('owner')
  const validIdValidation = validateUserID(validId)
  console.log('有效ID验证结果:', validIdValidation)
  
  // 测试无效的ID（长度不足）
  const invalidShortId = 'owner_1234567890'
  const invalidShortIdValidation = validateUserID(invalidShortId)
  console.log('长度不足ID验证结果:', invalidShortIdValidation)
  
  // 测试无效的ID（超长）
  const invalidLongId = 'owner_1234567890abcdefghijklmnopqrstuvwxyz1234567890'
  const invalidLongIdValidation = validateUserID(invalidLongId)
  console.log('超长ID验证结果:', invalidLongIdValidation)
  
  // 测试无效的ID（包含特殊字符）
  const invalidSpecialCharId = 'owner_123-456@789'
  const invalidSpecialCharIdValidation = validateUserID(invalidSpecialCharId)
  console.log('包含特殊字符的ID验证结果:', invalidSpecialCharIdValidation)
  
  // 测试无效的ID（空）
  const invalidEmptyId = ''
  const invalidEmptyIdValidation = validateUserID(invalidEmptyId)
  console.log('空ID验证结果:', invalidEmptyIdValidation)
  
  // 测试无效的ID（非字符串）
  const invalidNonStringId = 123456
  const invalidNonStringIdValidation = validateUserID(invalidNonStringId)
  console.log('非字符串ID验证结果:', invalidNonStringIdValidation)
  
} catch (error) {
  console.error('验证ID测试失败:', error)
}

// 测试处理前端传递的ID
console.log('\n=== 测试处理前端传递的ID ===')
try {
  // 测试有效前端ID（30位）
  const validFrontendId = generateId('owner')
  const validFrontendIdResult = processFrontendId(validFrontendId, 'fallback_123')
  console.log('有效前端ID处理结果:', validFrontendIdResult)
  
  // 测试无效前端ID（长度不足）
  const invalidFrontendId = 'owner_1234567890abcdef'
  const invalidFrontendIdResult = processFrontendId(invalidFrontendId, 'fallback_123')
  console.log('无效前端ID处理结果:', invalidFrontendIdResult)
  
  // 测试空前端ID
  const emptyFrontendId = ''
  const emptyFrontendIdResult = processFrontendId(emptyFrontendId, 'fallback_123')
  console.log('空前端ID处理结果:', emptyFrontendIdResult)
  
  // 测试null前端ID
  const nullFrontendId = null
  const nullFrontendIdResult = processFrontendId(nullFrontendId, 'fallback_123')
  console.log('null前端ID处理结果:', nullFrontendIdResult)
  
} catch (error) {
  console.error('处理前端ID测试失败:', error)
}

console.log('\n=== 所有测试完成 ===')
