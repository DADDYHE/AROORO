const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const sourceFile = path.join(projectRoot, 'node_modules/@tencentcloud/chat-uikit-engine/index.js');
const targetFile = path.join(projectRoot, 'miniprogram_npm/@tencentcloud/chat-uikit-engine/index.cjs.js');

// 读取原始文件
let content = fs.readFileSync(sourceFile, 'utf-8');

// 转换 ES Module 为 CommonJS
content = content
  // 替换 import 语句
  .replace(/import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g, (match, varName, modulePath) => {
    return `const ${varName} = require('${modulePath}');`;
  })
  // 替换 export { ... } 语句
  .replace(/export\s*\{([^}]+)\}/g, (match, exports) => {
    const exportsList = exports.trim();
    const exportStatements = exportsList.split(',').map(exp => {
      const [localName, alias] = exp.trim().split(/\s+as\s+/);
      const exportedName = alias || localName;
      if (exportedName === 'default') {
        return `module.exports = ${localName};`;
      }
      return `module.exports.${exportedName} = ${localName};`;
    });
    return exportStatements.join('\n');
  })
  // 替换 export default 语句
  .replace(/export\s+default\s+(\w+)/g, 'module.exports = $1;')
  // 替换其他 export 语句
  .replace(/export\s+(const|let|var|function|class)\s+(\w+)/g, (match, keyword, name) => {
    return `${keyword} ${name}`;
  });

// 写入转换后的文件
fs.writeFileSync(targetFile, content, 'utf-8');

console.log('✅ Converted chat-uikit-engine to CommonJS');
console.log(`📝 Output: ${targetFile}`);
