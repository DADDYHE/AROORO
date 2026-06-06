#!/usr/bin/env node
/**
 * codemod: 为使用 throw err(...) 但未 require errors 的文件补 import
 *
 * 检测规则：
 *   1. 文件中包含 `err(` 或 `throw err(` 调用
 *   2. 文件中未包含 `require(...'errors'...)` 或 `from ... 'errors'`
 *   3. 文件位于 cloudfunctions/<service>/ 下
 *   4. 在 require 列表中插入 const { err, ... } = require('./common/errors') 或 '../common/errors'
 */

const fs = require('fs')
const path = require('path')

const ROOT = process.env.CODEMOD_ROOT
  ? path.resolve(process.env.CODEMOD_ROOT)
  : path.join(__dirname, '..', 'cloudfunctions')

function isServiceFile(file) {
  return file.endsWith('.js') && !file.includes('/common/') && !file.includes('/node_modules/')
}

function findAllJsFiles(dir) {
  const results = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...findAllJsFiles(fullPath))
    } else if (isServiceFile(fullPath)) {
      results.push(fullPath)
    }
  }
  return results
}

function usesErr(content) {
  // 匹配 err(、throw err(、: err(、(err(... 等
  return /\berr\s*\(/.test(content)
}

function hasErrorsImport(content) {
  return /require\(['"][^'"]*common\/errors['"]\)/.test(content)
    || /from\s+['"][^'"]*common\/errors['"]/.test(content)
    || /require\(['"]\.\/errors['"]\)/.test(content)
}

function hasErrNamedImport(content) {
  // 检查是否已经 import 了 err（可能是 require 解构中）
  return /\{\s*[^}]*\berr\b[^}]*\}\s*=\s*require\(['"][^'"]*errors['"]\)/.test(content)
}

function addImport(file) {
  const content = fs.readFileSync(file, 'utf8')
  if (!usesErr(content)) return false
  if (hasErrorsImport(content) && hasErrNamedImport(content)) return false
  if (hasErrorsImport(content)) {
    // 已经 import 了 errors 但没 import err：直接补到 require 解构里
    return injectErrIntoExistingImport(file, content)
  }
  // 没有 import：插入到 require 列表中
  return insertNewImport(file, content)
}

function injectErrIntoExistingImport(file, content) {
  // 找到 const { ... } = require('...errors') 的解构，向其中加入 err
  const regex = /const\s+\{([^}]*)\}\s*=\s*require\((['"])([^'"]*common\/errors)\2\)/
  const newContent = content.replace(regex, (m, namedImports, _q, importPath) => {
    const items = namedImports.split(',').map(s => s.trim()).filter(Boolean)
    if (items.includes('err')) return m
    // 把 err 放第一个（最常用）
    const newItems = ['err', ...items.filter(i => i !== 'err')]
    return `const { ${newItems.join(', ')} } = require('${importPath}')`
  })
  if (newContent === content) return false
  fs.writeFileSync(file, newContent)
  return true
}

function insertNewImport(file, content) {
  // 找到 require('./common/utils') 那一行，在它前面插入 require('./common/errors')
  const relPath = file.includes(path.join('adminService', 'services'))
    ? "'../common/errors'"
    : "'./common/errors'"

  const importLine = `const { err } = require(${relPath})\n`

  // 找第一个 require(...) 行
  const requireRegex = /^(const\s+.*=\s*require\([^)]+\)\s*$)/m
  const match = content.match(requireRegex)
  if (match) {
    const newContent = content.replace(requireRegex, importLine + match[1])
    fs.writeFileSync(file, newContent)
    return true
  }

  // 兜底：插到文件开头
  fs.writeFileSync(file, importLine + content)
  return true
}

let total = 0
let added = 0
for (const file of findAllJsFiles(ROOT)) {
  total++
  if (addImport(file)) {
    added++
    console.log(`+ ${path.relative(process.cwd(), file)}`)
  }
}
console.log(`\n扫描：${total} 个文件；新增/修改 import：${added} 个`)
