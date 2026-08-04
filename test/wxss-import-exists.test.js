/**
 * WXSS @import 引用完整性检查
 *
 * 目标：验证所有 .wxss 文件中的 @import 语句引用的文件均存在于文件系统中。
 * 背景：dd3b271 提交删除了 styles/motion.wxss，但 app.wxss 仍保留 @import 引用，
 *       导致微信小程序编译失败（文件未找到）。
 */

const fs = require('fs')
const path = require('path')

const PROJECT_ROOT = path.resolve(__dirname, '..')

/** 递归收集指定目录下所有匹配 ext 的文件 */
function collectFiles(dir, ext, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      // 忽略 node_modules、.git、测试输出目录
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'coverage') continue
      collectFiles(fullPath, ext, files)
    } else if (entry.isFile() && entry.name.endsWith(ext)) {
      files.push(fullPath)
    }
  }
  return files
}

/** 从 WXSS 内容中提取所有 @import 引用的相对路径 */
function extractImports(content) {
  const imports = []
  // 匹配 @import './path/to/file.wxss'; 或 @import "./path/to/file.wxss";
  const regex = /@import\s+['"](.+?)['"]\s*;/g
  let match
  while ((match = regex.exec(content)) !== null) {
    imports.push(match[1])
  }
  return imports
}

describe('WXSS @import 引用完整性', () => {
  const wxssFiles = collectFiles(PROJECT_ROOT, '.wxss')

  test(`共扫描 ${wxssFiles.length} 个 .wxss 文件`, () => {
    expect(wxssFiles.length).toBeGreaterThan(0)
  })

  const brokenImports = []

  wxssFiles.forEach((filePath) => {
    const relPath = path.relative(PROJECT_ROOT, filePath)
    const content = fs.readFileSync(filePath, 'utf-8')
    const imports = extractImports(content)

    imports.forEach((importPath) => {
      // 忽略绝对路径（如 CDN 或云存储路径）
      if (importPath.startsWith('http') || importPath.startsWith('cloud://')) return

      // 解析相对于当前 wxss 文件的引用路径
      const resolved = path.resolve(path.dirname(filePath), importPath)
      if (!fs.existsSync(resolved)) {
        brokenImports.push({
          source: relPath,
          import: importPath,
          resolved: path.relative(PROJECT_ROOT, resolved),
        })
      }
    })
  })

  test('所有 @import 引用的文件必须存在', () => {
    if (brokenImports.length > 0) {
      const details = brokenImports
        .map((b) => `  ${b.source} → "${b.import}" (缺失: ${b.resolved})`)
        .join('\n')
      throw new Error(`发现 ${brokenImports.length} 处断裂的 @import 引用：\n${details}`)
    }
    expect(brokenImports.length).toBe(0)
  })
})
