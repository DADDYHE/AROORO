/**
 * 测试IM服务ID生成正确性
 * 验证格式1（prefix_hash_identifier）的ID生成逻辑
 * 确保寄养家庭使用"hst"前缀，宠物主人使用"own"前缀
 */

// 直接加载imUserIdValidator模块
const ImUserIdValidator = require('./utils/imUserIdValidator');

// 模拟wx对象
if (typeof wx === 'undefined') {
  global.wx = {};
}


/**
 * 测试用例
 */
const testCases = [
  {
    name: '宠物主人ID生成',
    roleType: 'owner',
    openid: 'oNIhl17JEstp_WtKcSq-EUKa93qk',
    expectedPrefix: 'own'
  },
  {
    name: '寄养家庭ID生成',
    roleType: 'host',
    openid: 'oNIhl17JEstp_WtKcSq-EUKa93qk',
    expectedPrefix: 'hst'
  },
  {
    name: '访客ID生成',
    roleType: 'guest',
    openid: 'oNIhl17JEstp_WtKcSq-EUKa93qk',
    expectedPrefix: 'gst'
  },
  {
    name: '不同openid的宠物主人ID生成',
    roleType: 'owner',
    openid: 'oABC123Defg_Hijk-LmnopQrs',
    expectedPrefix: 'own'
  },
  {
    name: '不同openid的寄养家庭ID生成',
    roleType: 'host',
    openid: 'oXYZ987Pqrs_Tuvw-XyzabCd',
    expectedPrefix: 'hst'
  }
];

/**
 * 运行测试
 */
function runTests() {
  console.log('开始测试IM服务ID生成...');
  console.log('====================================');
  
  let passedTests = 0;
  let totalTests = testCases.length;
  
  testCases.forEach((testCase, index) => {
    console.log(`\n测试 ${index + 1}: ${testCase.name}`);
    console.log(`角色类型: ${testCase.roleType}, OpenID: ${testCase.openid}`);
    
    try {
      // 生成格式1的ID
      const generatedId = ImUserIdValidator.generateFormat1UserID(testCase.openid, testCase.roleType);
      console.log(`生成的ID: ${generatedId}`);
      
      // 验证ID格式
      const validation = ImUserIdValidator.validateUserID(generatedId);
      console.log(`格式验证: ${validation.valid ? '通过' : '失败'}`);
      
      // 验证前缀
      const hasCorrectPrefix = generatedId.startsWith(`${testCase.expectedPrefix}_`);
      console.log(`前缀验证: ${hasCorrectPrefix ? '通过' : '失败'} (期望: ${testCase.expectedPrefix}_)`);
      
      // 验证ID结构（prefix_hash_identifier）
      const parts = generatedId.split('_');
      const hasCorrectStructure = parts.length >= 3;
      console.log(`结构验证: ${hasCorrectStructure ? '通过' : '失败'} (期望: prefix_hash_identifier)`);
      
      // 验证哈希部分长度（8位）
      const hashPart = parts[1];
      const hasCorrectHashLength = hashPart && hashPart.length === 8;
      console.log(`哈希长度验证: ${hasCorrectHashLength ? '通过' : '失败'} (期望: 8位)`);
      
      // 验证标识符部分
      const identifierPart = parts.slice(2).join('_');
      const hasIdentifier = identifierPart && identifierPart.length > 0;
      console.log(`标识符验证: ${hasIdentifier ? '通过' : '失败'}`);
      
      // 综合验证
      const allPassed = validation.valid && hasCorrectPrefix && hasCorrectStructure && hasCorrectHashLength && hasIdentifier;
      
      if (allPassed) {
        console.log('✓ 测试通过');
        passedTests++;
      } else {
        console.log('✗ 测试失败');
      }
      
    } catch (error) {
      console.error('测试执行失败:', error);
    }
    
    console.log('------------------------------------');
  });
  
  console.log(`\n测试完成: ${passedTests}/${totalTests} 通过`);
  
  if (passedTests === totalTests) {
    console.log('✓ 所有测试通过！IM服务ID生成逻辑正确。');
    process.exit(0);
  } else {
    console.log('✗ 部分测试失败，需要检查ID生成逻辑。');
    process.exit(1);
  }
}

// 运行测试
runTests();
