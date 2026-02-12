// 测试登录迁移后的页面功能
const fs = require('fs');
const path = require('path');

// 要测试的页面列表
const pagesToTest = [
  'pages/home/index.js',
  'pages/profile/index.js',
  'pages/messages/index.js',
  'pages/pet/detail.js',
  'pages/chooseIdentity/chooseIdentity.js',
  'subpackages/other/messages/chat/chat.js',
  'subpackages/host-register/step1.js'
];

// 测试结果
const testResults = [];

// 测试函数
function testPage(pagePath) {
  console.log(`\n测试页面: ${pagePath}`);
  
  try {
    const fullPath = path.join(__dirname, pagePath);
    const content = fs.readFileSync(fullPath, 'utf8');
    
    // 检查是否导入了标准登录模块
    const hasLoginModuleImport = content.includes("import loginModule from") || content.includes("const loginModule = require");
    
    // 检查是否使用了标准登录模块的方法
    const usesStandardLogin = content.includes("loginModule.login()") || 
                              content.includes("loginModule.isLoggedIn()") ||
                              content.includes("loginModule.checkLoginStatus()") ||
                              content.includes("app.globalData.loginManager") ||
                              content.includes("app.login()");
    
    // 检查是否使用了旧的Auth工具
    const usesOldAuth = content.includes("const Auth = require") || content.includes("import Auth from") ||
                       content.includes("Auth.isLoggedIn") || content.includes("Auth.login");
    
    // 检查是否移除了旧的登录实现
    const hasOldLoginImplementation = content.includes("wx.login(") && content.includes("wx.cloud.callFunction") && 
                                    (content.includes("name: 'login'"));
    
    // 确定测试状态：
    // 1. 如果直接导入并使用了标准登录模块，通过
    // 2. 如果通过app.globalData.loginManager使用标准登录功能，且没有使用旧的Auth工具或旧的登录实现，也通过
    const usesAppLoginManager = content.includes("app.globalData.loginManager") || content.includes("app.login()");
    const status = (hasLoginModuleImport && usesStandardLogin && !hasOldLoginImplementation && !usesOldAuth) ||
                  (usesAppLoginManager && !hasOldLoginImplementation && !usesOldAuth) ? 'PASS' : 'FAIL';
    
    const result = {
      page: pagePath,
      hasLoginModuleImport,
      usesStandardLogin,
      usesAppLoginManager,
      hasOldLoginImplementation,
      usesOldAuth,
      status
    };
    
    testResults.push(result);
    
    console.log(`导入标准登录模块: ${hasLoginModuleImport ? '✓' : '✗'}`);
    console.log(`使用标准登录方法: ${usesStandardLogin ? '✓' : '✗'}`);
    console.log(`使用App登录管理器: ${usesAppLoginManager ? '✓' : '✗'}`);
    console.log(`移除旧登录实现: ${!hasOldLoginImplementation ? '✓' : '✗'}`);
    console.log(`移除旧Auth工具: ${!usesOldAuth ? '✓' : '✗'}`);
    console.log(`测试结果: ${result.status}`);
    
  } catch (error) {
    console.error(`测试页面 ${pagePath} 时出错:`, error.message);
    testResults.push({
      page: pagePath,
      status: 'ERROR',
      error: error.message
    });
  }
}

// 运行测试
console.log('开始测试登录迁移后的页面...');
console.log('====================================');

pagesToTest.forEach(testPage);

// 生成测试报告
console.log('\n====================================');
console.log('测试报告');
console.log('====================================');

let passCount = 0;
let failCount = 0;
let errorCount = 0;

testResults.forEach(result => {
  if (result.status === 'PASS') passCount++;
  else if (result.status === 'FAIL') failCount++;
  else if (result.status === 'ERROR') errorCount++;
  
  console.log(`${result.page}: ${result.status}`);
  if (result.error) {
    console.log(`  错误: ${result.error}`);
  }
});

console.log('\n====================================');
console.log('测试总结');
console.log('====================================');
console.log(`通过: ${passCount}`);
console.log(`失败: ${failCount}`);
console.log(`错误: ${errorCount}`);
console.log(`总计: ${testResults.length}`);

if (failCount === 0 && errorCount === 0) {
  console.log('\n🎉 所有页面测试通过！登录迁移成功完成。');
} else {
  console.log('\n⚠️  部分页面测试失败，需要进一步检查和修复。');
}
