/**
 * 业务异常模块部署完整性审计脚本
 *
 * 【Sprint 39】修复 Sprint 19 单源假设的部署不兼容问题
 *
 * 历史背景：
 *   - Sprint 19 引入 shim 模式：所有 service common/errors.js 都 re-export 顶级
 *     cloudfunctions/common/errors.js，理由是"跨 service class identity 稳定"
 *   - 实际部署时：shim 引用 require('../../common/errors.js') 在云端 require 失败
 *     （部署包只含 cloudfunctions/<serviceName>/，不含上级目录）
 *   - 跨 service 共享 class instance 在云函数架构下本就不可行
 *     （每个云函数独立进程，require 缓存隔离）
 *
 * 当前策略：
 *   - 所有 common/errors.js 副本统一为完整副本（由 sync:common 同步）
 *   - 审计改为：检查每个副本与顶级源文件内容一致（hash 相同）
 *   - 这才是云函数部署架构下"业务异常模块"应该有的形态
 *
 * 功能：
 *   1. 扫描 cloudfunctions/ 下所有 common/errors.js 文件
 *   2. 验证：每个副本必须与 cloudfunctions/common/errors.js 内容一致
 *   3. 验证：源文件本身必须包含 class BusinessError extends Error 定义
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
const crypto = require('crypto')

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

function md5(content) {
  return crypto.createHash('md5').update(content).digest('hex')
}

function checkCopy(filePath) {
  // Sprint 39: 副本应与 SINGLE_SOURCE 内容一致
  const content = fs.readFileSync(filePath, 'utf8')
  const sourceContent = fs.readFileSync(SINGLE_SOURCE, 'utf8')

  if (md5(content) !== md5(sourceContent)) {
    return { ok: false, reason: '副本与 cloudfunctions/common/errors.js 内容不一致' }
  }

  return { ok: true }
}

function checkSingleSource(filePath) {
  const content = fs.readFileSync(filePath, 'utf8')

  // 单源文件必须包含 class BusinessError extends Error
  if (!/class\s+BusinessError\s+extends\s+Error/.test(content)) {
    return { ok: false, reason: '单源文件缺少 class BusinessError extends Error 定义' }
  }

  return { ok: true }
}

function main() {
  console.log('🔍 Sprint 39: 业务异常模块部署完整性审计')
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

    const result = checkCopy(file)
    if (result.ok) {
      console.log(`  ✅ ${relative} (副本与单源一致)`)
    } else {
      console.log(`  ❌ ${relative}`)
      console.log(`     ${result.reason}`)
      hasViolation = true
    }
  }

  console.log(`\n${'='.repeat(60)}`)
  if (hasCritical) {
    console.log('🔴 严重错误: 单源文件不规范')
    process.exit(2)
  }
  if (hasViolation) {
    console.log('🟡 发现违规: 存在与单源不一致的 common/errors.js 副本')
    if (STRICT) {
      console.log('   (--strict 模式，CI 门禁 fail)')
      process.exit(1)
    } else {
      console.log('   (warning 模式，仅提示)')
      process.exit(0)
    }
  }
  console.log('🟢 通过: 所有 common/errors.js 副本与单源一致')
  process.exit(0)
}

main()
