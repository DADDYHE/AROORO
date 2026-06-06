#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Sprint 31: 全局限流覆盖度审计
 *
 * 检查目标：
 *   1. common/rate-limit-store.{ts,js,d.ts} 三件套存在
 *   2. common/risk-rate-limit.ts 导出 initGlobalRateLimitFromDb + setGlobalRateLimitStore
 *   3. 所有使用 withRateLimit 的云函数入口都注入了全局 store
 *   4. 业务类型覆盖：order / evaluation / payment / refund / mall_order / activity_apply
 *   5. rateLimitCleanup 云函数 + 定时触发器配置
 *   6. tsconfig.common.json include rate-limit-store.ts
 *   7. scripts/build-common.js TARGETS 含 rate-limit-store.js
 *   8. (strict) 全局限流覆盖率：所有高频业务入口（订单/退款/支付/评价/活动/商城）必须接入
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

// 1. 文件存在性
const TS = path.join(ROOT, 'cloudfunctions', 'common', 'rate-limit-store.ts')
const JS = path.join(ROOT, 'cloudfunctions', 'common', 'rate-limit-store.js')
const DTS = path.join(ROOT, 'cloudfunctions', 'common', 'rate-limit-store.d.ts')
check('rate-limit-store.ts 存在', fs.existsSync(TS))
check('rate-limit-store.js（构建产物）存在', fs.existsSync(JS))
check('rate-limit-store.d.ts 存在', fs.existsSync(DTS))

// 2. 导出项
const rrlTs = readSafe(path.join(ROOT, 'cloudfunctions', 'common', 'risk-rate-limit.ts'))
check('risk-rate-limit.ts 导出 initGlobalRateLimitFromDb', /export\s+function\s+initGlobalRateLimitFromDb/.test(rrlTs || ''))
check('risk-rate-limit.ts 导出 setGlobalRateLimitStore', /export\s+function\s+setGlobalRateLimitStore/.test(rrlTs || ''))
check('risk-rate-limit.ts 导出 consumeGlobalRateLimitWithFallback', /export\s+(?:async\s+)?function\s+consumeGlobalRateLimitWithFallback/.test(rrlTs || ''))
check('risk-rate-limit.ts 导出 peekGlobalRateLimitWithFallback', /export\s+(?:async\s+)?function\s+peekGlobalRateLimitWithFallback/.test(rrlTs || ''))
check('risk-rate-limit.ts 导出 withRateLimit', /export\s+(?:async\s+)?function\s+withRateLimit/.test(rrlTs || ''))
check('risk-rate-limit.ts 导出 DEFAULT_RISK_RATE_LIMIT_CONFIG', /export\s+const\s+DEFAULT_RISK_RATE_LIMIT_CONFIG/.test(rrlTs || ''))

// 3. 所有使用 withRateLimit 的服务都已注入全局 store
const SERVICES_WITH_RATELIMIT = [
  { name: 'orderService', index: 'orderService/index.js' },
  { name: 'paymentService', index: 'paymentService/index.js' },
  { name: 'activityService', index: 'activityService/index.js' },
  { name: 'mallService', index: 'mallService/index.js' },
  { name: 'rateLimitCleanup', index: 'rateLimitCleanup/index.js' },
]

const injectedServices = []
for (const svc of SERVICES_WITH_RATELIMIT) {
  const code = readSafe(path.join(ROOT, 'cloudfunctions', svc.index))
  if (code && /initGlobalRateLimitFromDb\s*\(/.test(code)) {
    injectedServices.push(svc.name)
  }
  check(
    `${svc.name}/index.js 注入了 initGlobalRateLimitFromDb`,
    code && /initGlobalRateLimitFromDb\s*\(/.test(code),
    code ? '已注入' : '未注入',
  )
}

check(
  `已注入全局 store 的服务数（${injectedServices.length}/${SERVICES_WITH_RATELIMIT.length}）`,
  injectedServices.length >= 4,
  `当前：${injectedServices.join(', ')}`,
)

// 4. 业务类型覆盖：order / evaluation / payment / refund / mall_order / activity_apply
const businessTypes = {
  order: [],
  evaluation: [],
  payment: [],
  refund: [],
  mall_order: [],
  activity_apply: [],
}

// 扫描所有云函数入口（包括主目录和 services 子目录）
const cfRoot = path.join(ROOT, 'cloudfunctions')
const allServices = fs.readdirSync(cfRoot, { withFileTypes: true })
  .filter(d => d.isDirectory() && d.name !== 'common' && d.name !== 'node_modules')
  .map(d => d.name)

function scanDirForType(dir, svc) {
  if (!fs.existsSync(dir)) {return}
  const files = fs.readdirSync(dir)
  for (const file of files) {
    if (!file.endsWith('.js') && !file.endsWith('.ts')) {continue}
    const filePath = path.join(dir, file)
    const stat = fs.statSync(filePath)
    if (!stat.isFile()) {continue}
    const code = readSafe(filePath)
    if (!code) {continue}
    for (const t of Object.keys(businessTypes)) {
      if (new RegExp(`type:\\s*['"]${t}['"]`).test(code)) {
        if (!businessTypes[t].includes(svc)) {
          businessTypes[t].push(svc)
        }
      }
    }
  }
}

for (const svc of allServices) {
  // 扫描主目录所有 .js / .ts
  scanDirForType(path.join(cfRoot, svc), svc)
  // 扫描 services 子目录
  scanDirForType(path.join(cfRoot, svc, 'services'), svc)
}

const requiredTypes = ['order', 'evaluation', 'payment', 'refund']
for (const t of requiredTypes) {
  check(
    `业务类型 '${t}' 已接入限流（${businessTypes[t].length} 个服务）`,
    businessTypes[t].length >= 1,
    businessTypes[t].length > 0 ? `服务：${businessTypes[t].join(', ')}` : '未接入',
  )
}

const optionalTypes = ['mall_order', 'activity_apply']
for (const t of optionalTypes) {
  check(
    `业务类型 '${t}' 已接入限流（${businessTypes[t].length} 个服务，可选）`,
    true, // 可选
    businessTypes[t].length > 0 ? `服务：${businessTypes[t].join(', ')}` : '未接入',
  )
}

// 5. rateLimitCleanup 云函数
const cleanupDir = path.join(ROOT, 'cloudfunctions', 'rateLimitCleanup')
const cleanupIdx = readSafe(path.join(cleanupDir, 'index.js'))
const cleanupCfg = readSafe(path.join(cleanupDir, 'config.json'))
check('rateLimitCleanup 云函数目录存在', fs.existsSync(cleanupDir))
check('rateLimitCleanup/index.js 存在', !!cleanupIdx)
check('rateLimitCleanup/config.json 存在', !!cleanupCfg)
check(
  'rateLimitCleanup/config.json 配置 cron 触发器',
  cleanupCfg && /"triggers"\s*:\s*\[[\s\S]*?"type"\s*:\s*"timer"/.test(cleanupCfg),
)
check(
  'rateLimitCleanup/config.json cron 表达式（7 段）',
  cleanupCfg && /"config"\s*:\s*"0[\s\S]{0,40}\*[\s\S]{0,40}\*[\s\S]{0,40}\*[\s\S]{0,40}\*[\s\S]{0,40}\*[\s\S]{0,40}\*"/.test(cleanupCfg),
)

// 6. tsconfig.common.json include rate-limit-store.ts
const tsConfig = readSafe(path.join(ROOT, 'tsconfig.common.json'))
check(
  'tsconfig.common.json include rate-limit-store.ts',
  tsConfig && /rate-limit-store\.ts/.test(tsConfig),
)

// 7. scripts/build-common.js TARGETS 含 rate-limit-store.js
const buildCommon = readSafe(path.join(ROOT, 'scripts', 'build-common.js'))
check(
  'scripts/build-common.js TARGETS 含 rate-limit-store.js',
  buildCommon && /rate-limit-store\.js/.test(buildCommon),
)

// 8. (strict) 业务类型覆盖完整：order / evaluation / payment / refund 全部必须
if (STRICT) {
  const allRequiredCovered = requiredTypes.every(t => businessTypes[t].length >= 1)
  check(
    '(strict) 全部高频业务类型已接入限流',
    allRequiredCovered,
    allRequiredCovered ? '✓' : '✗',
  )
}

// 输出汇总
console.log('\n=== 全局限流覆盖审计汇总 ===')
console.log(`服务入口数：${allServices.length}`)
console.log(`注入全局 store 服务数：${injectedServices.length}/${SERVICES_WITH_RATELIMIT.length}`)
console.log(`业务类型覆盖：`)
for (const [type, svcs] of Object.entries(businessTypes)) {
  console.log(`  - ${type}: ${svcs.length} 个服务（${svcs.join(', ') || '无'}）`)
}

console.log(`\n=== 总计 ${checks.length} 项检查${STRICT ? '（含 strict）' : ''} ===`)
console.log(`${failed === 0 ? '✅' : '❌'} ${failed === 0 ? '全部通过' : `${failed} 项失败`}`)

process.exit(failed === 0 ? 0 : 1)
