// 全面检查项目中未统一使用登录模块的地方
const fs = require('fs');
const path = require('path');

// 要排除的目录
const excludeDirs = [
  'node_modules',
  'miniprogram_npm',
  '.git',
  'dist',
  'build',
  'TUI-Messages', // 第三方组件库
  'TUIKit'
];

// 要检查的文件类型
const includeExts = ['.js', '.jsx', '.ts', '.tsx', '.wxs'];

// 检查结果
const results = {
  totalFiles: 0,
  checkedFiles: 0,
  filesWithLoginCode: [],
  potentialIssues: []
};

// 登录相关的模式
const loginPatterns = {
  // 标准登录模块使用
  standardLogin: /loginModule\.(login|isLoggedIn|checkLoginStatus)/,
  appLoginManager: /app\.globalData\.loginManager|app\.login\(/,
  
  // 旧的登录实现
  wxLogin: /wx\.login\(/,
  cloudLogin: /wx\.cloud\.callFunction[\s\S]*?name:\s*['"]login['"]/,
  oldAuth: /const\s+Auth\s*=\s*require|import\s+Auth|Auth\.(isLoggedIn|login)/,
  
  // 其他登录相关代码
  userSig: /userSig/,
  openid: /openid/,
  code: /code:\s*res\.code/ // 微信登录code
};

// 遍历目录
function traverseDir(dir) {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    
    // 检查是否是目录且需要排除
    if (stat.isDirectory()) {
      if (!excludeDirs.includes(file)) {
        traverseDir(fullPath);
      }
      continue;
    }
    
    // 检查是否是需要包含的文件类型
    if (includeExts.some(ext => file.endsWith(ext))) {
      results.totalFiles++;
      checkFile(fullPath);
    }
  }
}

// 检查文件
function checkFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    results.checkedFiles++;
    
    // 检查是否包含登录相关代码
    const hasLoginCode = Object.values(loginPatterns).some(pattern => pattern.test(content));
    
    if (hasLoginCode) {
      const relativePath = path.relative(__dirname, filePath);
      const fileResult = {
        file: relativePath,
        usesStandardLogin: loginPatterns.standardLogin.test(content),
        usesAppLoginManager: loginPatterns.appLoginManager.test(content),
        hasWxLogin: loginPatterns.wxLogin.test(content),
        hasCloudLogin: loginPatterns.cloudLogin.test(content),
        hasOldAuth: loginPatterns.oldAuth.test(content),
        hasUserSig: loginPatterns.userSig.test(content),
        hasOpenid: loginPatterns.openid.test(content),
        hasCode: loginPatterns.code.test(content)
      };
      
      results.filesWithLoginCode.push(fileResult);
      
      // 检查是否存在潜在问题（使用了旧的登录实现但没有使用标准登录模块）
      if ((fileResult.hasWxLogin || fileResult.hasCloudLogin || fileResult.hasOldAuth) && 
          !fileResult.usesStandardLogin && !fileResult.usesAppLoginManager) {
        results.potentialIssues.push(fileResult);
      }
    }
  } catch (error) {
    console.error(`检查文件 ${filePath} 时出错:`, error.message);
  }
}

// 生成报告
function generateReport() {
  console.log('\n====================================');
  console.log('登录模块统一使用检查报告');
  console.log('====================================');
  console.log(`总文件数: ${results.totalFiles}`);
  console.log(`检查文件数: ${results.checkedFiles}`);
  console.log(`包含登录相关代码的文件数: ${results.filesWithLoginCode.length}`);
  console.log(`潜在问题文件数: ${results.potentialIssues.length}`);
  
  if (results.potentialIssues.length > 0) {
    console.log('\n====================================');
    console.log('潜在问题文件（可能未使用标准登录模块）:');
    console.log('====================================');
    
    results.potentialIssues.forEach((issue, index) => {
      console.log(`\n${index + 1}. ${issue.file}`);
      console.log(`   - 使用标准登录模块: ${issue.usesStandardLogin ? '✓' : '✗'}`);
      console.log(`   - 使用App登录管理器: ${issue.usesAppLoginManager ? '✓' : '✗'}`);
      console.log(`   - 包含wx.login: ${issue.hasWxLogin ? '✓' : '✗'}`);
      console.log(`   - 包含登录云函数调用: ${issue.hasCloudLogin ? '✓' : '✗'}`);
      console.log(`   - 包含旧Auth工具: ${issue.hasOldAuth ? '✓' : '✗'}`);
    });
  } else {
    console.log('\n🎉 恭喜！未发现未统一使用登录模块的地方。');
  }
  
  if (results.filesWithLoginCode.length > 0) {
    console.log('\n====================================');
    console.log('包含登录相关代码的文件:');
    console.log('====================================');
    
    results.filesWithLoginCode.forEach(file => {
      console.log(`\n${file.file}`);
      console.log(`   - 使用标准登录模块: ${file.usesStandardLogin ? '✓' : '✗'}`);
      console.log(`   - 使用App登录管理器: ${file.usesAppLoginManager ? '✓' : '✗'}`);
    });
  }
}

// 开始检查
console.log('开始检查项目中未统一使用登录模块的地方...');
console.log('====================================');

traverseDir(__dirname);
generateReport();
