// 详细测试ID生成功能
const fs = require('fs');
const path = require('path');

// 读取并测试云函数的generateId函数
function testCloudFunctionGenerateId() {
  console.log('=== 测试云函数的generateId函数 ===');
  
  // 读取getUserIdentity云函数的代码
  const getUserIdentityPath = path.join(__dirname, 'cloudfunctions', 'getUserIdentity', 'index.js');
  const loginPath = path.join(__dirname, 'cloudfunctions', 'login', 'index.js');
  const idGeneratorPath = path.join(__dirname, 'utils', 'idGenerator.js');
  
  try {
    // 测试数据
    const openid = 'oNIhl17JEstp_WtKcSq-EUKa93qk';
    const correctId = 'own_05l4h598_oNIhl17JEstp_WtKc';
    
    console.log('测试数据:');
    console.log('OpenID:', openid);
    console.log('期望的正确ID:', correctId);
    console.log('');
    
    // 1. 测试云函数getUserIdentity的generateId
    console.log('1. 测试云函数getUserIdentity的generateId:');
    const getUserIdentityCode = fs.readFileSync(getUserIdentityPath, 'utf8');
    
    // 提取generateId函数
    const getUserIdentityGenerateIdMatch = getUserIdentityCode.match(/const generateId = \([^)]*\) => {[\s\S]*?^}/m);
    if (getUserIdentityGenerateIdMatch) {
      const getUserIdentityGenerateIdCode = getUserIdentityGenerateIdMatch[0];
      
      // 创建一个沙箱环境执行函数
      const getUserIdentitySandbox = {
        console: console
      };
      
      // 执行函数定义
      const getUserIdentityGenerateId = eval(`(function() { ${getUserIdentityGenerateIdCode}; return generateId; })()`);
      
      // 测试生成ID
      const getUserIdentityResult = getUserIdentityGenerateId('owner', openid);
      console.log('  生成的ID:', getUserIdentityResult);
      console.log('  是否正确:', getUserIdentityResult === correctId ? '✓' : '✗');
      console.log('');
    }
    
    // 2. 测试云函数login的generateId
    console.log('2. 测试云函数login的generateId:');
    const loginCode = fs.readFileSync(loginPath, 'utf8');
    
    // 提取generateId函数
    const loginGenerateIdMatch = loginCode.match(/const generateId = \([^)]*\) => {[\s\S]*?^}/m);
    if (loginGenerateIdMatch) {
      const loginGenerateIdCode = loginGenerateIdMatch[0];
      
      // 创建一个沙箱环境执行函数
      const loginSandbox = {
        console: console
      };
      
      // 执行函数定义
      const loginGenerateId = eval(`(function() { ${loginGenerateIdCode}; return generateId; })()`);
      
      // 测试生成ID
      const loginResult = loginGenerateId('owner', openid);
      console.log('  生成的ID:', loginResult);
      console.log('  是否正确:', loginResult === correctId ? '✓' : '✗');
      console.log('');
    }
    
    // 3. 测试前端idGenerator的generateFormat1Id
    console.log('3. 测试前端idGenerator的generateFormat1Id:');
    const idGeneratorCode = fs.readFileSync(idGeneratorPath, 'utf8');
    
    // 提取generateFormat1Id函数
    const idGeneratorGenerateFormat1IdMatch = idGeneratorCode.match(/function generateFormat1Id\([^)]*\) {[\s\S]*?^}/m);
    if (idGeneratorGenerateFormat1IdMatch) {
      const idGeneratorGenerateFormat1IdCode = idGeneratorGenerateFormat1IdMatch[0];
      
      // 创建一个沙箱环境执行函数
      const idGeneratorSandbox = {
        console: console
      };
      
      // 执行函数定义
      const idGeneratorGenerateFormat1Id = eval(`(function() { ${idGeneratorGenerateFormat1IdCode}; return generateFormat1Id; })()`);
      
      // 测试生成ID
      const idGeneratorResult = idGeneratorGenerateFormat1Id('owner', openid);
      console.log('  生成的ID:', idGeneratorResult);
      console.log('  是否正确:', idGeneratorResult === correctId ? '✓' : '✗');
      console.log('');
    }
    
    // 4. 测试不同参数的情况
    console.log('4. 测试不同参数的情况:');
    const testCases = [
      { prefix: 'owner', openid: 'oNIhl17JEstp_WtKcSq-EUKa93qk', expected: 'own_05l4h598_oNIhl17JEstp_WtKc' },
      { prefix: 'host', openid: 'oNIhl17JEstp_WtKcSq-EUKa93qk', expected: 'hst_05l4h598_oNIhl17JEstp_WtKc' },
      { prefix: 'guest', openid: 'oNIhl17JEstp_WtKcSq-EUKa93qk', expected: 'guest_05l4h598_oNIhl17JEstp_WtKcSq_EUKa93qk' }
    ];
    
    testCases.forEach((testCase, index) => {
      console.log(`  测试用例 ${index + 1}:`);
      console.log(`    Prefix: ${testCase.prefix}`);
      console.log(`    OpenID: ${testCase.openid}`);
      
      // 读取并测试getUserIdentity的generateId
      const getUserIdentityGenerateIdMatch = getUserIdentityCode.match(/const generateId = \([^)]*\) => {[\s\S]*?^}/m);
      if (getUserIdentityGenerateIdMatch) {
        const getUserIdentityGenerateIdCode = getUserIdentityGenerateIdMatch[0];
        const getUserIdentityGenerateId = eval(`(function() { ${getUserIdentityGenerateIdCode}; return generateId; })()`);
        const result = getUserIdentityGenerateId(testCase.prefix, testCase.openid);
        console.log(`    生成的ID: ${result}`);
        console.log(`    是否正确: ${result === testCase.expected ? '✓' : '✗'}`);
      }
      console.log('');
    });
    
  } catch (error) {
    console.error('测试过程中出现错误:', error);
  }
}

// 运行测试
testCloudFunctionGenerateId();
console.log('=== 测试完成 ===');
