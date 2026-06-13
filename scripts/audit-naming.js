/**
 * 命名一致性审计脚本
 * 用法：node scripts/audit-naming.js
 * 退出码：0 通过，>0 警告数
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const TARGET_DIRS = [
  'cloudfunctions/common',
  'cloudfunctions/userService',
  'cloudfunctions/orderService',
  'services',
  'utils',
]
const SKIP_DIRS = new Set(['node_modules', 'miniprogram_npm', '__tests__', 'coverage', '.git'])
const SKIP_PATTERNS = [
  'out_trade_no',
  'transaction_id',
  'sign_type',
  'appid',
  'mchid',
  'notify_url',
  'refund_id',
  'openid', // _openid 是微信原生
  'grant_type',        // 微信 cgi-bin/token API query 参数
  'access_token',      // 微信 API 通用 query 参数
  // 业务字段（限流规则 key / 状态机字符串 / 外部 API 参数）：
  'mall_order',         // 限流规则 key
  'activity_apply',     // 限流规则 key
  'boarding_accept',    // 限流规则 key
  'in_progress',        // boarding 状态机字段
  'get_poi',            // 腾讯地图 API 参数
]
const FILE_EXT = '.js'

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) {return files}
  for (const entry of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) {continue}
    const full = path.join(dir, entry)
    const stat = fs.statSync(full)
    if (stat.isDirectory()) {walk(full, files)} else if (entry.endsWith(FILE_EXT)) {files.push(full)}
  }
  return files
}

const violations = []
for (const dir of TARGET_DIRS) {
  const abs = path.join(ROOT, dir)
  const files = walk(abs)
  for (const file of files) {
    const rel = path.relative(ROOT, file)
    const content = fs.readFileSync(file, 'utf8')
    const lines = content.split('\n')
    lines.forEach((line, idx) => {
      // 匹配：xxx_yyy:  或  xxx_yyy =
      const m = line.match(/\b([a-z]+(?:_[a-z]+)+)\s*[:=]/)
      if (!m) {return}
      const word = m[1]
      if (SKIP_PATTERNS.some(p => word.includes(p))) {return}
      // 排除注释
      const trimmed = line.trim()
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) {return}
      violations.push({ file: rel, line: idx + 1, snippet: line.trim(), word })
    })
  }
}

console.log('=== 命名一致性审计 ===')
console.log(`扫描目录：${TARGET_DIRS.join(', ')}`)
console.log(`潜在 snake_case 违规：${violations.length}`)

if (violations.length > 0) {
  console.log('\n前 20 条：')
  for (const v of violations.slice(0, 20)) {
    console.log(`  ${v.file}:${v.line}  [${v.word}]  ${v.snippet}`)
  }
  console.log('\n注：可能存在误报（如字符串、外部 API 字段），需人工 review。')
  console.log('完整报告见 docs/FIELD_DEDUPLICATION_REPORT.md')
}

process.exit(violations.length > 0 ? 1 : 0)
