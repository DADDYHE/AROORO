/**
 * 错误码使用情况提取与校验脚本
 *
 * 功能：
 *   1. 扫描 cloudfunctions/ 下所有 throw err('CODE', ...) 调用，提取已使用错误码
 *   2. 与 cloudfunctions/common/errors.js 的 BusinessErrors 注册表对比
 *   3. 输出：使用但未注册（warning）、注册但未使用（info）
 *
 * 用法：
 *   node scripts/audit-error-codes.js [--strict]
 *   --strict：发现未注册错误码时返回非 0 退出码（CI 用）
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..', 'cloudfunctions')
const ERRORS_FILE = path.join(ROOT, 'common', 'errors.js')
const STRICT = process.argv.includes('--strict')

function loadRegisteredCodes() {
  const content = fs.readFileSync(ERRORS_FILE, 'utf8')
  const codeRe = /^\s*([A-Z][A-Z0-9_]+):\s*\{\s*code:/gm
  const codes = new Set()
  let m
  while ((m = codeRe.exec(content)) !== null) {
    codes.add(m[1])
  }
  return codes
}

function* walkJsFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) {continue}
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      yield* walkJsFiles(full)
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      yield full
    }
  }
}

function extractUsedCodes(filePath) {
  const content = fs.readFileSync(filePath, 'utf8')
  const matches = []
  // 匹配 throw err('CODE', ...) / throw err("CODE", ...) / throw err(`CODE`, ...)
  // 以及 return err('CODE', ...) / const x = err('CODE', ...) —— 后两类表示该错误码在本文件
  // 有明确的产出点；通过 throw 一层即可被 withErrorHandling 包装。
  const re = /(?:throw|return|=)\s+err\(\s*['"`]([A-Z][A-Z0-9_]+)['"`]/g
  let m
  while ((m = re.exec(content)) !== null) {
    matches.push({ code: m[1], line: content.slice(0, m.index).split('\n').length, file: filePath })
  }
  return matches
}

const registered = loadRegisteredCodes()
console.log(`注册表共 ${registered.size} 个错误码`)

const usedSet = new Map() // code -> [{file, line}, ...]
for (const file of walkJsFiles(ROOT)) {
  for (const { code, line, file: f } of extractUsedCodes(file)) {
    if (!usedSet.has(code)) {usedSet.set(code, [])}
    usedSet.get(code).push({ file: path.relative(ROOT, f), line })
  }
}

console.log(`\n=== 业务中已使用的错误码 (${usedSet.size}) ===`)
for (const [code, uses] of [...usedSet.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const reg = registered.has(code) ? '✓' : '✗'
  console.log(`${reg} ${code} (${uses.length} 处)`)
}

const unregistered = [...usedSet.keys()].filter(c => !registered.has(c))
const unused = [...registered].filter(c => !usedSet.has(c))

console.log(`\n=== 未注册但已使用 (${unregistered.length}) ===`)
if (unregistered.length === 0) {
  console.log('  (无)')
} else {
  for (const c of unregistered) {
    console.log(`  ✗ ${c}`)
    for (const u of usedSet.get(c)) {
      console.log(`      → ${u.file}:${u.line}`)
    }
  }
}

console.log(`\n=== 已注册但暂未使用 (${unused.length}) ===`)
if (unused.length === 0) {
  console.log('  (无)')
} else {
  for (const c of unused) {
    console.log(`  - ${c}`)
  }
}

if (STRICT && unregistered.length > 0) {
  console.error(`\n[FAIL] --strict 模式下存在 ${unregistered.length} 个未注册错误码`)
  process.exit(1)
}

// 默认导出为 error-code-map.json
const mapFile = path.join(__dirname, '..', 'docs', 'error-code-map.json')
const map = {
  generatedAt: new Date().toISOString(),
  total: registered.size,
  usedCount: usedSet.size,
  codes: Object.fromEntries(
    [...registered].sort().map(c => [
      c,
      {
        registered: true,
        used: usedSet.has(c),
        usageCount: (usedSet.get(c) || []).length,
      },
    ])
  ),
}
fs.writeFileSync(mapFile, JSON.stringify(map, null, 2))
console.log(`\n[MAP] 已生成错误码对照表: ${path.relative(process.cwd(), mapFile)}`)

console.log(`\n[DONE] 错误码审计完成`)
