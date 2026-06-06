/**
 * 空 catch 块审计脚本
 * 用法：node scripts/audit-empty-catch.js
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const TARGET_DIRS = ['cloudfunctions', 'services', 'subpackages', 'utils']
const PATTERN = /} catch\s*\([^)]*\)\s*\{\s*\}/g

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

const findings = []
for (const dir of TARGET_DIRS) {
  const abs = path.join(ROOT, dir)
  const files = walk(abs)
  for (const file of files) {
    const rel = path.relative(ROOT, file)
    const content = fs.readFileSync(file, 'utf8')
    const lines = content.split('\n')
    lines.forEach((line, idx) => {
      if (PATTERN.test(line)) {
        findings.push({ file: rel, line: idx + 1, snippet: line.trim() })
      }
    })
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
