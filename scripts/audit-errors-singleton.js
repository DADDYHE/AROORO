/**
 * 业务异常模块单源审计脚本
 *
 * 【Sprint 19】BusinessError 跨模块一致性系统化
 *
 * 功能：
 *   1. 扫描 cloudfunctions/ 下所有 common/errors.js 文件
 *   2. 验证：除 cloudfunctions/common/errors.js 之外，其他都必须是 re-export shim
 *   3. 验证：shim 必须指向 cloudfunctions/common/errors.js 单源
 *   4. 验证：非 shim 文件不得出现 `class BusinessError` / `class.*extends.*Error` 等定义
 *   5. 验证：shim 路径深度正确（每个 service 都需要 ../../common/errors）
 *
 * 用法：
 *   node scripts/audit-errors-singleton.js          # 普通模式（warning）
 *   node scripts/audit-errors-singleton.js --strict # 严格模式（CI 门禁）
 *   --strict：发现违规时返回非 0 退出码
 *
 * 退出码：
 *   0 - 通过
 *   1 - 发现违规（--strict 模式）
 *   2 - 严重错误（如 cloudfunctions/common/errors.js 自身不规范）
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..', 'cloudfunctions')
const SINGLE_SOURCE = path.join(ROOT, 'common', 'errors.js')
const STRICT = process.argv.includes('--strict')

let hasViolation = false
let hasCritical = false

function* walkDirs(dir) {
  yield dir
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) {continue}
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      yield* walkDirs(full)
    }
  }
}

function findErrorsFiles() {
  const results = []
  for (const dir of walkDirs(ROOT)) {
    const candidate = path.join(dir, 'common', 'errors.js')
    if (fs.existsSync(candidate)) {
      results.push(candidate)
    }
  }
  return results
}

function checkShim(filePath) {
  const content = fs.readFileSync(filePath, 'utf8')
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean)

  // 必须包含 module.exports = require('...')
  const exportLine = lines.find(l => l.startsWith('module.exports'))
  if (!exportLine) {
    return { ok: false, reason: '缺少 module.exports 语句' }
  }

  // 解析 require 路径
  const match = exportLine.match(/require\(['"]([^'"]+)['"]\)/)
  if (!match) {
    return { ok: false, reason: `module.exports 未使用 require: ${exportLine}` }
  }

  const requirePath = match[1]

  // 验证路径解析是否指向 SINGLE_SOURCE
  const resolved = path.resolve(path.dirname(filePath), requirePath)
  const resolvedJs = resolved.endsWith('.js') ? resolved : `${resolved}.js`
  if (resolvedJs !== SINGLE_SOURCE) {
    return {
      ok: false,
      reason: `require 路径 ${requirePath} 解析到 ${resolvedJs}，期望 ${SINGLE_SOURCE}`,
    }
  }

  // 验证内容中不包含 class BusinessError 定义
  if (/class\s+BusinessError\s+extends/.test(content)) {
    return { ok: false, reason: '不允许在 shim 中定义 class BusinessError' }
  }

  return { ok: true, requirePath }
}

function checkSingleSource(filePath) {
  const content = fs.readFileSync(filePath, 'utf8')

  // 单源文件必须包含 class BusinessError extends Error
  if (!/class\s+BusinessError\s+extends\s+Error/.test(content)) {
    return { ok: false, reason: '单源文件缺少 class BusinessError extends Error 定义' }
  }

  // 单源文件不应有 module.exports = require(...)
  if (/module\.exports\s*=\s*require/.test(content)) {
    return { ok: false, reason: '单源文件不应是 re-export shim' }
  }

  return { ok: true }
}

function main() {
  console.log('🔍 Sprint 19: BusinessError 单源审计')
  console.log(`   根目录: ${ROOT}`)
  console.log(`   单源文件: ${SINGLE_SOURCE}`)
  console.log(`   模式: ${STRICT ? 'strict' : 'warning'}\n`)

  // 1. 验证单源文件本身
  console.log('▶ 步骤 1: 验证单源文件')
  const sourceResult = checkSingleSource(SINGLE_SOURCE)
  if (!sourceResult.ok) {
    console.log(`  ❌ 严重错误: ${SINGLE_SOURCE}`)
    console.log(`     ${sourceResult.reason}`)
    hasCritical = true
  } else {
    console.log('  ✅ 单源文件合规')
  }

  // 2. 扫描所有 errors.js
  console.log('\n▶ 步骤 2: 扫描所有 common/errors.js')
  const allFiles = findErrorsFiles()
  console.log(`  发现 ${allFiles.length} 个 common/errors.js\n`)

  for (const file of allFiles) {
    const relative = path.relative(ROOT, file)
    if (file === SINGLE_SOURCE) {
      console.log(`  ⭐ ${relative} (单源)`)
      continue
    }

    const result = checkShim(file)
    if (result.ok) {
      console.log(`  ✅ ${relative} (shim → ${result.requirePath})`)
    } else {
      console.log(`  ❌ ${relative}`)
      console.log(`     ${result.reason}`)
      hasViolation = true
    }
  }

  console.log('\n' + '='.repeat(60))
  if (hasCritical) {
    console.log('🔴 严重错误: 单源文件不规范')
    process.exit(2)
  }
  if (hasViolation) {
    console.log('🟡 发现违规: 存在非 shim 的 common/errors.js')
    if (STRICT) {
      console.log('   (--strict 模式，CI 门禁 fail)')
      process.exit(1)
    } else {
      console.log('   (warning 模式，仅提示)')
      process.exit(0)
    }
  }
  console.log('🟢 通过: 所有 common/errors.js 都是合规 shim')
  process.exit(0)
}

main()
