/**
 * 空 catch 块审计脚本
 * 用法：node scripts/audit-empty-catch.js
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const TARGET_DIRS = ['cloudfunctions', 'services', 'subpackages', 'utils']
// 找到所有 } catch (...) { 块并做 brace matching，判断块体是否真的空
const CATCH_RE = /}\s*catch\s*\(([^)]*)\)\s*\{/g
// Sprint 22 设计：cloudfunctions/*/common/ 是部署约束下的有意副本，
// 与 cloudfunctions/common/ 内容相同，因此其中的空 catch 不算违规
const isCommonCopy = (relativePath) => /\/common\/[^/]+\.js$/.test(relativePath)

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) {return files}
  for (const entry of fs.readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '__tests__') {continue}
    const full = path.join(dir, entry)
    const stat = fs.statSync(full)
    if (stat.isDirectory()) {walk(full, files)} else if (entry.endsWith('.js')) {files.push(full)}
  }
  return files
}

function findEmptyCatchBodies(content) {
  const emptyLines = []
  CATCH_RE.lastIndex = 0
  let m
  while ((m = CATCH_RE.exec(content)) !== null) {
    const blockStart = m.index + m[0].length  // 紧跟 {
    let depth = 1
    let i = blockStart
    while (i < content.length && depth > 0) {
      const ch = content[i]
      if (ch === '{') {depth++}
      else if (ch === '}') {depth--}
      i++
    }
    if (depth !== 0) {continue}  // 语法异常，跳过
    const body = content.slice(blockStart, i - 1)
    // 仅去除空白后判断是否真的空（保留注释视为「有意忽略」）
    const stripped = body.replace(/\s+/g, '')
    if (stripped.length === 0) {
      const lineNum = content.slice(0, m.index).split('\n').length
      emptyLines.push({ line: lineNum, snippet: m[0].trim() })
    }
  }
  return emptyLines
}

const findings = []
for (const dir of TARGET_DIRS) {
  const abs = path.join(ROOT, dir)
  const files = walk(abs)
  for (const file of files) {
    const rel = path.relative(ROOT, file)
    if (isCommonCopy(rel)) {continue}
    const content = fs.readFileSync(file, 'utf8')
    const empty = findEmptyCatchBodies(content)
    for (const e of empty) {
      findings.push({ file: rel, line: e.line, snippet: e.snippet })
    }
  }
}

console.log('=== 空 Catch 块审计 ===')
console.log(`扫描目录：${TARGET_DIRS.join(', ')}`)
console.log(`空 catch 块数量：${findings.length}`)

// 按文件聚合
const byFile = {}
for (const f of findings) {
  byFile[f.file] = (byFile[f.file] || 0) + 1
}
const sorted = Object.entries(byFile).sort((a, b) => b[1] - a[1])

console.log('\nTop 10 文件：')
for (const [file, count] of sorted.slice(0, 10)) {
  console.log(`  ${count.toString().padStart(3)}  ${file}`)
}

if (findings.length > 0) {
  console.log('\n详细清单见 docs/EMPTY_CATCH_AUDIT.md')
  console.log('目标：W6 末全部清零')
}

process.exit(findings.length > 0 ? 1 : 0)
