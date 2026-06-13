#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Sprint 51: 寄养接单风控（防商家账号被盗批量接单）审计
 *
 * 检查目标：
 *   1. cloudfunctions/common/risk-control.{ts,js,d.ts} 三件套存在
 *   2. BOARDING_ACCEPT_CONFIG 配置存在
 *   3. detectBoardingAcceptRisk 主入口存在
 *   4. 4 个子检测函数存在（detectAcceptBurst / detectAbnormalHour /
 *      detectLargeAcceptAmount / detectNewPartnerLargeAccept）
 *   5. rate-limit-config.ts 包含 boarding_accept 业务类型
 *   6. orderService/orders.ts handleBoardingOrder confirm 分支调用 detectBoardingAcceptRisk
 *   7. orderService/orders.ts handleBoardingOrder 配合 withRateLimit(type='boarding_accept')
 *   8. 测试 common-risk-control-boarding-accept.test.js 存在
 *   9. (strict) tsc 严格模式编译通过
 *
 * 退出码：0 = 全部通过，1 = 至少 1 项不通过
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const STRICT = process.argv.includes('--strict')

function readSafe(p) {
  try { return fs.readFileSync(p, 'utf8') } catch (e) { return null }
}

let failed = 0
const checks = []

function check(name, ok, detail) {
  checks.push({ name, ok, detail })
  if (!ok) { failed++ }
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

// 1. risk-control 文件三件套
const RC_TS = path.join(ROOT, 'cloudfunctions', 'common', 'risk-control.ts')
const RC_JS = path.join(ROOT, 'cloudfunctions', 'common', 'risk-control.js')
const RC_DTS = path.join(ROOT, 'cloudfunctions', 'common', 'risk-control.d.ts')
check('risk-control.ts 存在', fs.existsSync(RC_TS))
check('risk-control.js（构建产物）存在', fs.existsSync(RC_JS))
check('risk-control.d.ts 存在', fs.existsSync(RC_DTS))

const rcTs = readSafe(RC_TS)
const rcJs = readSafe(RC_JS)

// 2. BOARDING_ACCEPT_CONFIG
check(
  'risk-control.ts 导出 BOARDING_ACCEPT_CONFIG',
  rcTs && /export\s+const\s+BOARDING_ACCEPT_CONFIG\s*=/.test(rcTs)
)
check(
  'BOARDING_ACCEPT_CONFIG 含 ACCEPT_BURST_WINDOW_MS',
  rcTs && /BOARDING_ACCEPT_CONFIG[\s\S]{0,200}ACCEPT_BURST_WINDOW_MS/.test(rcTs)
)
check(
  'BOARDING_ACCEPT_CONFIG 含 ABNORMAL_HOUR_START / END',
  rcTs && /ABNORMAL_HOUR_START\s*:/.test(rcTs) && /ABNORMAL_HOUR_END\s*:/.test(rcTs)
)
check(
  'BOARDING_ACCEPT_CONFIG 含 LARGE_ACCEPT_FEN / HUGE_ACCEPT_FEN',
  rcTs && /LARGE_ACCEPT_FEN\s*:/.test(rcTs) && /HUGE_ACCEPT_FEN\s*:/.test(rcTs)
)
check(
  'BOARDING_ACCEPT_CONFIG 含 NEW_PARTNER_LARGE_FEN / NEW_PARTNER_WINDOW_MS',
  rcTs && /NEW_PARTNER_LARGE_FEN\s*:/.test(rcTs) && /NEW_PARTNER_WINDOW_MS\s*:/.test(rcTs)
)

// 3. detectBoardingAcceptRisk 主入口
check(
  'risk-control.ts 导出 detectBoardingAcceptRisk 主入口',
  rcTs && /export\s+async\s+function\s+detectBoardingAcceptRisk\s*\(/.test(rcTs)
)
check(
  'risk-control.ts 导出 DetectBoardingAcceptRiskInput 接口',
  rcTs && /export\s+interface\s+DetectBoardingAcceptRiskInput\b/.test(rcTs)
)

// 4. 4 个子检测函数
const SUB_FUNCS = [
  'detectAcceptBurst',
  'detectAbnormalHour',
  'detectLargeAcceptAmount',
  'detectNewPartnerLargeAccept',
]
for (const fn of SUB_FUNCS) {
  check(
    `risk-control.ts 导出 ${fn}`,
    rcTs && new RegExp(`export\\s+function\\s+${fn}\\s*\\(`).test(rcTs)
  )
}

// 5. rate-limit-config.ts boarding_accept 业务类型
const CFG_TS = path.join(ROOT, 'cloudfunctions', 'common', 'rate-limit-config.ts')
const cfgTs = readSafe(CFG_TS)
check('rate-limit-config.ts 存在', fs.existsSync(CFG_TS))
check(
  "rate-limit-config.ts KnownBusinessType 包含 'boarding_accept'",
  cfgTs && /KnownBusinessType[\s\S]{0,500}'boarding_accept'/.test(cfgTs)
)
check(
  "rate-limit-config.ts BUSINESS_TYPE_DEFAULT_CONFIG 含 'boarding_accept'",
  cfgTs && /boarding_accept\s*:\s*Object\.freeze\(\{[\s\S]{0,300}perUserPerMinute/.test(cfgTs)
)
check(
  "boarding_accept 默认值 perUserPerMinute ≤ 5（严格）",
  cfgTs && /boarding_accept\s*:[\s\S]{0,200}perUserPerMinute\s*:\s*[1-5]\b/.test(cfgTs)
)
check(
  "boarding_accept 默认值 perUserPerTargetPerMinute ≥ 1 且 ≤ 3",
  cfgTs && /boarding_accept\s*:[\s\S]{0,300}perUserPerTargetPerMinute\s*:\s*[1-3]\b/.test(cfgTs)
)

// 6. orderService/orders.ts handleBoardingOrder confirm 分支调用风控
const ORDERS_TS = path.join(ROOT, 'cloudfunctions', 'orderService', 'orders.ts')
const ORDERS_JS = path.join(ROOT, 'cloudfunctions', 'orderService', 'orders.js')
const ordersTs = readSafe(ORDERS_TS)
const ordersJs = readSafe(ORDERS_JS)
check('orderService/orders.ts 存在', fs.existsSync(ORDERS_TS))
check('orderService/orders.js（构建产物）存在', fs.existsSync(ORDERS_JS))
check(
  'orderService/orders.ts 引用 detectBoardingAcceptRisk',
  ordersTs && /detectBoardingAcceptRisk\b/.test(ordersTs)
)
check(
  'orderService/orders.ts handleBoardingOrder 含 confirm 分支',
  ordersTs && /handleBoardingOrder[\s\S]{0,2000}operation\s*===\s*['"]confirm['"]/.test(ordersTs)
)
check(
  'orderService/orders.ts confirm 分支调用 detectBoardingAcceptRisk',
  ordersTs && /operation\s*===\s*['"]confirm['"][\s\S]{0,1500}detectBoardingAcceptRisk\s*\(/.test(ordersTs)
)

// 7. withRateLimit(type='boarding_accept')
check(
  "orderService/orders.ts handleBoardingOrder 使用 withRateLimit(type='boarding_accept')",
  ordersTs && /withRateLimit\s*\(\s*\{[^}]*type\s*:\s*['"]boarding_accept['"]/.test(ordersTs)
)
check(
  'orderService/orders.ts handleBoardingOrder 处理 RISK_REJECT 错误',
  ordersTs && /RISK_REJECT/.test(ordersTs)
)
check(
  'orderService/orders.ts handleBoardingOrder 对 review 设置 pendingReview',
  ordersTs && /action['"]?\s*\)?\s*===\s*['"]review['"][\s\S]{0,300}pendingReview\s*=\s*true/.test(ordersTs)
)
check(
  'orderService/orders.ts handleBoardingOrder 写回 pendingReview 字段',
  ordersTs && /pendingReview\s*:\s*pendingReview\s*\|\|/.test(ordersTs)
)

// 8. 测试存在
const testFile = path.join(ROOT, 'test', 'common-risk-control-boarding-accept.test.js')
check('测试 common-risk-control-boarding-accept.test.js 存在', fs.existsSync(testFile))
if (fs.existsSync(testFile)) {
  const testCode = readSafe(testFile) || ''
  check(
    '测试覆盖 detectAcceptBurst',
    /detectAcceptBurst/.test(testCode)
  )
  check(
    '测试覆盖 detectAbnormalHour',
    /detectAbnormalHour/.test(testCode)
  )
  check(
    '测试覆盖 detectLargeAcceptAmount',
    /detectLargeAcceptAmount/.test(testCode)
  )
  check(
    '测试覆盖 detectNewPartnerLargeAccept',
    /detectNewPartnerLargeAccept/.test(testCode)
  )
  check(
    '测试覆盖 detectBoardingAcceptRisk 主入口',
    /detectBoardingAcceptRisk/.test(testCode)
  )
  check(
    '测试使用 BOARDING_ACCEPT_CONFIG',
    /BOARDING_ACCEPT_CONFIG/.test(testCode)
  )
  // 测试用例数
  const testCount = (testCode.match(/\btest\s*\(/g) || []).length
  check(`测试用例数 ≥ 10（当前 ${testCount}）`, testCount >= 10)
}

// 9. 构建产物包含 detectBoardingAcceptRisk
if (rcJs) {
  check(
    'risk-control.js（构建产物）含 detectBoardingAcceptRisk',
    /detectBoardingAcceptRisk/.test(rcJs)
  )
  check(
    'risk-control.js（构建产物）含 BOARDING_ACCEPT_CONFIG',
    /BOARDING_ACCEPT_CONFIG/.test(rcJs)
  )
}
if (ordersJs) {
  check(
    'orders.js（构建产物）含 detectBoardingAcceptRisk 调用',
    /detectBoardingAcceptRisk/.test(ordersJs)
  )
  check(
    "orders.js（构建产物）含 type='boarding_accept'",
    /['"]boarding_accept['"]/.test(ordersJs)
  )
}

// 10. (strict) tsc 编译
if (STRICT) {
  const tsconfigFiles = [
    'tsconfig.common.json',
    'tsconfig.orderService.json',
  ]
  for (const cfg of tsconfigFiles) {
    const cfgPath = path.join(ROOT, cfg)
    if (!fs.existsSync(cfgPath)) {
      check(`(strict) ${cfg} 存在`, false)
      continue
    }
    try {
      execSync(`npx --yes -p typescript@5.4.5 tsc --noEmit -p ${cfg}`, { cwd: ROOT, stdio: 'pipe' })
      check(`(strict) tsc --noEmit -p ${cfg} 通过`, true)
    } catch (e) {
      const msg = e.stderr ? e.stderr.toString().split('\n').slice(0, 5).join(' / ') : e.message
      check(`(strict) tsc --noEmit -p ${cfg} 通过`, false, msg)
    }
  }
}

// 11. (strict) handleBoardingOrder 风险检查的兜底日志
if (STRICT) {
  check(
    '(strict) handleBoardingOrder 风险检查失败时记录 warn 日志',
    ordersTs && /handleBoardingOrder\.risk_control_error/.test(ordersTs)
  )
  check(
    '(strict) handleBoardingOrder 风险命中 reject 时记录 warn 日志',
    ordersTs && /handleBoardingOrder\.risk_reject/.test(ordersTs)
  )
  check(
    '(strict) handleBoardingOrder 风险命中 review 时记录 info 日志',
    ordersTs && /handleBoardingOrder\.risk_pending/.test(ordersTs)
  )
}

// 输出汇总
console.log('\n=== Sprint 51 寄养接单风控审计汇总 ===')
console.log('检测项覆盖：')
console.log(`  - detectBoardingAcceptRisk: ${/detectBoardingAcceptRisk/.test(rcTs || '') ? '✓' : '✗'}`)
console.log(`  - BOARDING_ACCEPT_CONFIG: ${/BOARDING_ACCEPT_CONFIG/.test(rcTs || '') ? '✓' : '✗'}`)
console.log(`  - rate-limit-config boarding_accept: ${cfgTs && /boarding_accept/.test(cfgTs) ? '✓' : '✗'}`)
console.log(`  - orders.ts confirm 风控: ${ordersTs && /detectBoardingAcceptRisk/.test(ordersTs) ? '✓' : '✗'}`)

console.log(`\n=== 总计 ${checks.length} 项检查${STRICT ? '（含 strict）' : ''} ===`)
console.log(`${failed === 0 ? '✅' : '❌'} ${failed === 0 ? '全部通过' : `${failed} 项失败`}`)

process.exit(failed === 0 ? 0 : 1)
