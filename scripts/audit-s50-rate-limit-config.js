#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Sprint 50: 限流配置中心审计
 *
 * 检查目标：
 *   1. common/rate-limit-config.{ts,js,d.ts} 三件套存在
 *   2. common/rate-limit-bootstrap.{ts,js,d.ts} 三件套存在
 *   3. risk-rate-limit.ts 集成配置中心（getRateLimitConfig）
 *   4. BUSINESS_TYPE_DEFAULT_CONFIG 包含 6 个业务类型
 *   5. tsconfig.common.json include 两个新文件
 *   6. scripts/build-all-services.js TARGETS 含两个新文件
 *   7. 所有云函数入口使用 bootstrapRateLimit 或 initGlobalRateLimitFromDb
 *   8. (strict) 配置中心覆盖率：6 个业务类型全部有差异化配置
 *
 * 退出码：0 = 全部通过，1 = 至少 1 项不通过
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const STRICT = process.argv.includes('--strict')

function readSafe(p) {
  try { return fs.readFileSync(p, 'utf8') } catch (e) { return null }
}

let failed = 0
const checks = []

function check(name, ok, detail) {
  checks.push({ name, ok, detail })
  if (!ok) {failed++}
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

// 1. rate-limit-config 文件存在性
const CFG_TS = path.join(ROOT, 'cloudfunctions', 'common', 'rate-limit-config.ts')
const CFG_JS = path.join(ROOT, 'cloudfunctions', 'common', 'rate-limit-config.js')
const CFG_DTS = path.join(ROOT, 'cloudfunctions', 'common', 'rate-limit-config.d.ts')
check('rate-limit-config.ts 存在', fs.existsSync(CFG_TS))
check('rate-limit-config.js（构建产物）存在', fs.existsSync(CFG_JS))
check('rate-limit-config.d.ts 存在', fs.existsSync(CFG_DTS))

// 2. rate-limit-bootstrap 文件存在性
const BST_TS = path.join(ROOT, 'cloudfunctions', 'common', 'rate-limit-bootstrap.ts')
const BST_JS = path.join(ROOT, 'cloudfunctions', 'common', 'rate-limit-bootstrap.js')
const BST_DTS = path.join(ROOT, 'cloudfunctions', 'common', 'rate-limit-bootstrap.d.ts')
check('rate-limit-bootstrap.ts 存在', fs.existsSync(BST_TS))
check('rate-limit-bootstrap.js（构建产物）存在', fs.existsSync(BST_JS))
check('rate-limit-bootstrap.d.ts 存在', fs.existsSync(BST_DTS))

// 3. risk-rate-limit.ts 集成配置中心
const rrlTs = readSafe(path.join(ROOT, 'cloudfunctions', 'common', 'risk-rate-limit.ts'))
check('risk-rate-limit.ts 引用 getRateLimitConfig', /getRateLimitConfig\b/.test(rrlTs || ''))
check('risk-rate-limit.ts 引用 getRateLimitConfigSync', /getRateLimitConfigSync\b/.test(rrlTs || ''))
check('risk-rate-limit.ts 引用 rate-limit-config', /from\s+['"]\.\/rate-limit-config['"]/.test(rrlTs || ''))

// 4. BUSINESS_TYPE_DEFAULT_CONFIG 完整性
const cfgTs = readSafe(CFG_TS)
const REQUIRED_TYPES = ['order', 'payment', 'refund', 'evaluation', 'mall_order', 'activity_apply']
for (const t of REQUIRED_TYPES) {
  check(
    `BUSINESS_TYPE_DEFAULT_CONFIG['${t}'] 存在`,
    cfgTs && new RegExp(`${t}\\s*:[\\s\\S]{0,200}perUserPerMinute`).test(cfgTs)
  )
}

// 5. tsconfig.common.json include
const tsConfig = JSON.parse(readSafe(path.join(ROOT, 'tsconfig.common.json')) || '{}')
check(
  'tsconfig.common.json include rate-limit-config.ts',
  tsConfig.include && tsConfig.include.includes('cloudfunctions/common/rate-limit-config.ts')
)
check(
  'tsconfig.common.json include rate-limit-bootstrap.ts',
  tsConfig.include && tsConfig.include.includes('cloudfunctions/common/rate-limit-bootstrap.ts')
)

// 6. scripts/build-all-services.js TARGETS
const buildCommon = readSafe(path.join(ROOT, 'scripts', 'build-all-services.js'))
check(
  'scripts/build-all-services.js TARGETS 含 rate-limit-config.js',
  buildCommon && /rate-limit-config\.js/.test(buildCommon)
)
check(
  'scripts/build-all-services.js TARGETS 含 rate-limit-bootstrap.js',
  buildCommon && /rate-limit-bootstrap\.js/.test(buildCommon)
)

// 7. 云函数入口 bootstrap 覆盖率
const SERVICES_WITH_RATELIMIT = [
  { name: 'orderService', index: 'orderService/index.js' },
  { name: 'paymentService', index: 'paymentService/index.js' },
  { name: 'activityService', index: 'activityService/index.js' },
  { name: 'mallService', index: 'mallService/index.js' },
  { name: 'rateLimitCleanup', index: 'rateLimitCleanup/index.js' },
]

const bootstrapServices = []
for (const svc of SERVICES_WITH_RATELIMIT) {
  const code = readSafe(path.join(ROOT, 'cloudfunctions', svc.index))
  const usesBootstrap = code && /bootstrapRateLimit\s*\(/.test(code)
  const usesLegacy = code && /initGlobalRateLimitFromDb\s*\(/.test(code)
  if (usesBootstrap) {bootstrapServices.push(svc.name)}
  check(
    `${svc.name}/index.js 注入限流（bootstrapRateLimit 或 initGlobalRateLimitFromDb）`,
    Boolean(usesBootstrap || usesLegacy),
    usesBootstrap ? '使用 bootstrapRateLimit' : (usesLegacy ? '使用 initGlobalRateLimitFromDb' : '未注入')
  )
}

check(
  `使用 bootstrapRateLimit 的服务数（${bootstrapServices.length}/${SERVICES_WITH_RATELIMIT.length}）`,
  bootstrapServices.length >= 4,
  `当前：${bootstrapServices.join(', ') || '无'}`
)

// 8. (strict) 6 个业务类型全部有差异化配置
if (STRICT) {
  let allConfigFound = true
  for (const t of REQUIRED_TYPES) {
    if (!cfgTs || !new RegExp(`${t}\\s*:[\\s\\S]{0,200}perUserPerMinute`).test(cfgTs)) {
      allConfigFound = false
    }
  }
  check('(strict) 6 个业务类型全部有差异化配置', allConfigFound, allConfigFound ? '✓' : '✗')

  // strict: 所有服务都使用 bootstrapRateLimit（不再使用 legacy initGlobalRateLimitFromDb）
  const allUsingBootstrap = SERVICES_WITH_RATELIMIT.every(svc => {
    const code = readSafe(path.join(ROOT, 'cloudfunctions', svc.index))
    return code && /bootstrapRateLimit\s*\(/.test(code)
  })
  check(
    '(strict) 所有限流服务使用 bootstrapRateLimit（统一入口）',
    allUsingBootstrap,
    allUsingBootstrap ? '✓' : '✗'
  )
}

// 输出汇总
console.log('\n=== Sprint 50 限流配置中心审计汇总 ===')
console.log(`注入限流服务数：${SERVICES_WITH_RATELIMIT.length}`)
console.log(`使用 bootstrapRateLimit 服务数：${bootstrapServices.length}`)
console.log('业务类型配置覆盖：')
for (const t of REQUIRED_TYPES) {
  const hasConfig = cfgTs && new RegExp(`${t}\\s*:`).test(cfgTs)
  console.log(`  - ${t}: ${hasConfig ? '✓' : '✗'}`)
}

console.log(`\n=== 总计 ${checks.length} 项检查${STRICT ? '（含 strict）' : ''} ===`)
console.log(`${failed === 0 ? '✅' : '❌'} ${failed === 0 ? '全部通过' : `${failed} 项失败`}`)

process.exit(failed === 0 ? 0 : 1)
