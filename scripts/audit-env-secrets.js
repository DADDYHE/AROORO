/**
 * 环境凭据配置审计脚本
 *
 * 用途：防止 `config/env.secrets.js` 缺失或关键字段为空（会导致 wx.cloud.init
 *  被跳过，所有云函数调用报 "errCode: -501000 | Environment not found"）。
 *
 * 用法：node scripts/audit-env-secrets.js
 *       node scripts/audit-env-secrets.js --strict
 * 退出码：0 通过，1 失败
 *
 * 注意：此脚本不读取 env.secrets.js 实际值（保护凭据不泄露到日志），
 * 只验证文件存在 + 模块可正常 require + 关键字段非空。
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const SECRETS_FILE = path.join(ROOT, 'config', 'env.secrets.js')
const ENV_LOADER = path.join(ROOT, 'config', 'env.js')
const REQUIRED_FIELDS = ['envId', 'appId']

function fail(msg) {
  console.error(`[env-secrets] ✗ ${msg}`)
  return false
}

function ok(msg) {
  console.log(`[env-secrets] ✓ ${msg}`)
  return true
}

console.log('=== 环境凭据配置审计 ===')

// 1. 文件存在
if (!fs.existsSync(SECRETS_FILE)) {
  fail(`配置文件缺失: ${path.relative(ROOT, SECRETS_FILE)}`)
  console.error('  → 复制 config/env.secrets.js.example 并填入真实凭据')
  console.error('  → 参见 config/env.js DEFAULT_ENVIRONMENTS 注释中的字段说明')
  process.exit(1)
}
ok('env.secrets.js 文件存在')

// 2. env.js loader 存在
if (!fs.existsSync(ENV_LOADER)) {
  fail(`env loader 缺失: ${path.relative(ROOT, ENV_LOADER)}`)
  process.exit(1)
}

// 3. 模块可正常 require（验证 JS 语法 + 不抛运行时错）
let config
try {
  // 临时改 CWD 避免 require 路径问题
  const originalCwd = process.cwd()
  process.chdir(ROOT)
  delete require.cache[require.resolve(ENV_LOADER)]
  config = require(ENV_LOADER)
  process.chdir(originalCwd)
} catch (e) {
  fail(`env.js require 失败: ${e.message}`)
  console.error('  → 检查 env.secrets.js 是否有 JS 语法错误或循环依赖')
  process.exit(1)
}
ok('env.js 可正常 require')

// 4. 关键字段非空（不打印值，只检查 truthy）
let passed = true
for (const field of REQUIRED_FIELDS) {
  if (!config[field]) {
    fail(`关键字段为空: config.${field}`)
    console.error(`  → 在 config/env.secrets.js 中填入真实 ${field}`)
    passed = false
  } else {
    ok(`config.${field} 已设置（值不在日志中显示以保护凭据）`)
  }
}

if (!passed) {
  process.exit(1)
}

// 5. 当前环境检测（开发/预发/生产）
const currentEnv = process.env.NODE_ENV || 'development'
console.log(`\n当前环境: ${currentEnv}`)
if (currentEnv === 'production' && !config.envId.includes('prod')) {
  console.warn(
    `[env-secrets] ⚠ production 环境下 envId (${config.envId.length} 字符) 不含 "prod" 关键字，请人工确认是否正确`
  )
}

console.log('\n=== 审计通过 ===')
process.exit(0)
