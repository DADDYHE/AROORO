/**
 * 测试30位用户ID生成
 * 验证修改后的用户ID生成逻辑是否能够正确生成30位长度的用户ID
 */

// 导入测试所需的模块
const { generateId, normalizeUserID, validateUserID } = require('./cloudfunctions/common/modules/idGenerator.js');
const { generateFormat1UserID, validateUserID: validateUserIDFrontend } = require('./utils/imUserIdValidator.js');

// 测试用例
const testCases = [
  { prefix: 'owner', openid: 'oNIhl17JEstp_WtKcSq' },
  { prefix: 'host', openid: 'o1234567890abcdefghijklmn' },
  { prefix: 'guest', openid: 'oABCDEFGHIJKLMNOPQRSTUVWXYZ' },
  { prefix: 'owner', openid: 'o' + 'a'.repeat(30) }, // 长openid
  { prefix: '', openid: 'oNIhl17JEstp_WtKcSq' }, // 无前缀
];

// 测试云函数的ID生成
console.log('=== 测试云函数ID生成 ===\n');

testCases.forEach((testCase, index) => {
  console.log(`测试 ${index + 1}: prefix="${testCase.prefix}", openid="${testCase.openid}"`);
  
  const generatedId = generateId(testCase.prefix, testCase.openid);
  console.log(`生成的ID: ${generatedId}`);
  console.log(`长度: ${generatedId.length}`);
  console.log(`是否30位: ${generatedId.length === 30}`);
  
  const validation = validateUserID(generatedId);
  console.log(`验证结果: ${validation.isValid ? '通过' : '失败'}`);
  if (!validation.isValid) {
    console.log(`错误信息: ${validation.error}`);
  }
  
  const normalizedId = normalizeUserID(generatedId);
  console.log(`标准化后的ID: ${normalizedId}`);
  console.log(`标准化后长度: ${normalizedId.length}`);
  console.log('');
});

// 测试前端的ID生成
console.log('=== 测试前端ID生成 ===\n');

testCases.forEach((testCase, index) => {
  console.log(`测试 ${index + 1}: roleType="${testCase.prefix}", identifier="${testCase.openid}"`);
  
  try {
    const format1Id = generateFormat1UserID(testCase.openid, testCase.prefix || 'owner');
    console.log(`格式1生成的ID: ${format1Id}`);
    console.log(`长度: ${format1Id.length}`);
    console.log(`是否30位: ${format1Id.length === 30}`);
    
    const validation1 = validateUserIDFrontend(format1Id);
    console.log(`验证结果: ${validation1.valid ? '通过' : '失败'}`);
    if (!validation1.valid) {
      console.log(`错误信息: ${validation1.error}`);
    }
  } catch (error) {
    console.log(`生成失败: ${error.message}`);
  }
  
  console.log('');
});

// 测试边界情况
console.log('=== 测试边界情况 ===\n');

// 测试空前缀
console.log('测试空前缀:');
const emptyPrefixId = generateId('', 'oNIhl17JEstp_WtKcSq');
console.log(`生成的ID: ${emptyPrefixId}`);
console.log(`长度: ${emptyPrefixId.length}`);
console.log(`是否30位: ${emptyPrefixId.length === 30}`);
console.log('');

// 测试空openid
console.log('测试空openid:');
const emptyOpenidId = generateId('owner', '');
console.log(`生成的ID: ${emptyOpenidId}`);
console.log(`长度: ${emptyOpenidId.length}`);
console.log(`是否30位: ${emptyOpenidId.length === 30}`);
console.log('');

// 测试极长的openid
console.log('测试极长的openid:');
const longOpenid = 'o' + 'a'.repeat(100);
const longOpenidId = generateId('owner', longOpenid);
console.log(`生成的ID: ${longOpenidId}`);
console.log(`长度: ${longOpenidId.length}`);
console.log(`是否30位: ${longOpenidId.length === 30}`);
console.log('');

// 测试标准化功能
console.log('测试标准化功能:');
const testId = 'owner_12345678_abcdefghijklmnopqrstuvwxyz';
const normalizedTestId = normalizeUserID(testId);
console.log(`原始ID: ${testId}`);
console.log(`标准化后的ID: ${normalizedTestId}`);
console.log(`标准化后长度: ${normalizedTestId.length}`);
console.log('');

console.log('=== 测试完成 ===');
