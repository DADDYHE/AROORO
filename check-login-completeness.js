// 全面检查项目中未使用统一登录模块的文件
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
  'TUIKit',
  'cloudfunctions', // 已删除的云函数目录
  'functions' // 已删除的云函数目录
];

// 要检查的文件类型
const includeExts = ['.js', '.jsx', '.ts', '.tsx', '.wxs'];

// 检查结果
const results = {
  totalFiles: 0,
  checkedFiles: 0,
  filesWithLoginCode: [],
  filesUsingStandardLogin: [],
  filesUsingAppLoginManager: [],
  filesWithOldLogin: [],
  filesWithOldAuth: [],
  potentialIssues: []
};

// 登录相关的模式
const patterns = {
  // 标准登录模块使用
  standardLogin: /loginModule\.(login|isLoggedIn|checkLoginStatus|getUserInfo|getUserRole)/,
  appLoginManager: /app\.globalData\.loginManager|app\.login\(/,
  
  // 旧的登录实现
  wxLogin: /wx\.login\(/,
  cloudLogin: /wx\.cloud\.callFunction[\s\S]*?name:\s*['"]login['"]/,
  oldAuth: /const\s+Auth\s*=\s*require|import\s+Auth\s+from|Auth\.(isLoggedIn|login|canCreatePetProfile)/,
  
  // 其他登录相关代码
  userSig: /userSig/,
  openid: /openid/,
  code: /code:\s*res\.code/ // 微信登录code
};

// 遍历目录
function traverseDir(dir) {
  try {
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
  } catch (error) {
    console.error(`遍历目录 ${dir} 时出错:`, error.message);
  }
}

// 检查文件
function checkFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    results.checkedFiles++;
    
    // 检查是否包含登录相关代码
    const hasLoginCode = Object.values(patterns).some(pattern => pattern.test(content));
    
    if (hasLoginCode) {
      const relativePath = path.relative(__dirname, filePath);
      const fileResult = {
        file: relativePath,
        usesStandardLogin: patterns.standardLogin.test(content),
        usesAppLoginManager: patterns.appLoginManager.test(content),
        hasWxLogin: patterns.wxLogin.test(content),
        hasCloudLogin: patterns.cloudLogin.test(content),
        hasOldAuth: patterns.oldAuth.test(content),
        hasUserSig: patterns.userSig.test(content),
        hasOpenid: patterns.openid.test(content),
        hasCode: patterns.code.test(content)
      };
      
      results.filesWithLoginCode.push(fileResult);
      
      // 分类文件
      if (fileResult.usesStandardLogin) {
        results.filesUsingStandardLogin.push(fileResult);
      }
      if (fileResult.usesAppLoginManager) {
        results.filesUsingAppLoginManager.push(fileResult);
      }
      if (fileResult.hasWxLogin || fileResult.hasCloudLogin) {
        results.filesWithOldLogin.push(fileResult);
      }
      if (fileResult.hasOldAuth) {
        results.filesWithOldAuth.push(fileResult);
      }
      
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
  console.log('登录模块使用完整性检查报告');
  console.log('====================================');
  console.log(`总文件数: ${results.totalFiles}`);
  console.log(`检查文件数: ${results.checkedFiles}`);
  console.log(`包含登录相关代码的文件数: ${results.filesWithLoginCode.length}`);
  console.log(`使用标准登录模块的文件数: ${results.filesUsingStandardLogin.length}`);
  console.log(`使用App登录管理器的文件数: ${results.filesUsingAppLoginManager.length}`);
  console.log(`使用旧登录实现的文件数: ${results.filesWithOldLogin.length}`);
  console.log(`使用旧Auth工具的文件数: ${results.filesWithOldAuth.length}`);
  console.log(`潜在问题文件数: ${results.potentialIssues.length}`);
  
  if (results.potentialIssues.length > 0) {
    console.log('\n====================================');
    console.log('潜在问题文件（未使用统一登录模块）:');
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
    console.log('\n🎉 恭喜！未发现未使用统一登录模块的文件。');
  }
  
  if (results.filesUsingStandardLogin.length > 0) {
    console.log('\n====================================');
    console.log('使用标准登录模块的文件:');
    console.log('====================================');
    results.filesUsingStandardLogin.forEach(file => {
      console.log(`- ${file.file}`);
    });
  }
  
  if (results.filesUsingAppLoginManager.length > 0) {
    console.log('\n====================================');
    console.log('使用App登录管理器的文件:');
    console.log('====================================');
    results.filesUsingAppLoginManager.forEach(file => {
      console.log(`- ${file.file}`);
    });
  }
}

// 开始检查
console.log('开始全面检查项目中未使用统一登录模块的文件...');
console.log('====================================');

traverseDir(__dirname);
generateReport();
