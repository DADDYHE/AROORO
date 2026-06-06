/**
 * 文件级重复审计脚本
 * 用法：node scripts/audit-duplication.js
 *
 * 策略：基于 md5 内容哈希，发现完全一致的文件对；
 *       部分重复（jscpd）需要安装 jscpd@^3 后使用 `npx jscpd cloudfunctions/ services/ --threshold 1`
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const TARGET_DIRS = ['cloudfunctions', 'services', 'subpackages', 'utils']

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) {return files}
  for (const entry of fs.readdirSync(dir)) {
    if (entry === 'node_modules') {continue}
    const full = path.join(dir, entry)
    const stat = fs.statSync(full)
    if (stat.isDirectory()) {walk(full, files)} else if (entry.endsWith('.js')) {files.push(full)}
  }
  return files
}

const KNOWN_DUPLICATES = [
  // Sprint 2 已归并：
  // - subpackages/booking/utils/OrderManager.js + subpackages/profile/utils/OrderManager.js
  //   → services/OrderManager.js
  // - subpackages/booking/utils/eventEmitter.js + subpackages/profile/utils/eventEmitter.js
  //   → utils/eventEmitter.js
  // - subpackages/booking/utils/addressUtils.js + subpackages/other/utils/addressUtils.js
  //   → utils/addressUtils.js
  ['utils/BookingDataService.js', 'subpackages/pet/BookingDataService.js'],
  // 云函数部署约束：每个 service 必须自带 common/ 目录，因此 crypto.js 重复
  // 属预期行为，不计入违规
  ['cloudfunctions/common/crypto.js', 'cloudfunctions/hostService/common/crypto.js'],
]

console.log('=== 重复文件审计 ===\n')

let issuesFound = 0
for (const [a, b] of KNOWN_DUPLICATES) {
  const pathA = path.join(ROOT, a)
  const pathB = path.join(ROOT, b)
  if (!fs.existsSync(pathA) || !fs.existsSync(pathB)) {
    console.log(`⏭  跳过（文件不存在）：${a} <-> ${b}`)
    continue
  }
  const contentA = fs.readFileSync(pathA)
  const contentB = fs.readFileSync(pathB)
  if (contentA.equals(contentB)) {
    console.log(`❌ 完全一致：${a} <-> ${b}`)
    issuesFound++
  } else {
    // 行级 hash 比较
    const linesA = contentA.toString().split('\n').map(l => l.trim()).filter(Boolean)
    const linesB = contentB.toString().split('\n').map(l => l.trim()).filter(Boolean)
    const common = linesA.filter(l => linesB.includes(l)).length
    const similarity = (common / Math.max(linesA.length, linesB.length)) * 100
    if (similarity > 80) {
      console.log(`⚠️  高度相似 (${similarity.toFixed(1)}%)：${a} <-> ${b}`)
      issuesFound++
    } else {
      console.log(`✅ 内容差异：${a} <-> ${b}  (相似度 ${similarity.toFixed(1)}%)`)
    }
  }
}

// 基于哈希的全仓扫描
console.log('\n=== 全仓哈希扫描（同名同 hash）===')
const hashMap = new Map()
for (const dir of TARGET_DIRS) {
  const abs = path.join(ROOT, dir)
  const files = walk(abs)
  for (const file of files) {
    const basename = path.basename(file)
    if (basename === 'index.js' || basename === 'config.json') {continue}
    const content = fs.readFileSync(file)
    const hash = require('crypto').createHash('md5').update(content).digest('hex')
    if (!hashMap.has(basename)) {hashMap.set(basename, new Map())}
    hashMap.get(basename).set(hash, (hashMap.get(basename).get(hash) || []).concat(path.relative(ROOT, file)))
  }
}

let extraDupes = 0
for (const [basename, hashes] of hashMap.entries()) {
  for (const [, files] of hashes.entries()) {
    if (files.length > 1) {
      console.log(`❌ 同名同内容：${basename}`)
      files.forEach(f => console.log(`     ${f}`))
      extraDupes++
    }
  }
}

console.log(`\n已知重复对违规：${issuesFound}`)
console.log(`全仓额外重复：${extraDupes}`)
console.log('目标：全部清零（W10 末）')
console.log('详细：docs/CODE_DUPLICATION_REPORT.md')

// Sprint 2 已归并 3 对：OrderManager / eventEmitter / addressUtils
const SPRINT2_MERGED = 3
console.log(`\nSprint 2 累计归并：${SPRINT2_MERGED} 对`)

process.exit(issuesFound + extraDupes > 0 ? 1 : 0)
