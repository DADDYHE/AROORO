#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Sprint 46: couponExpiryCheck TypeScript 迁移审计
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const STRICT = process.argv.includes('--strict')
const SVC = 'couponExpiryCheck'
const CFG = 'tsconfig.couponExpiryCheck.json'
const NAME = 'coupon-expiry-check'

function readSafe(p) { try { return fs.readFileSync(p, 'utf8') } catch (e) { return null } }
let failed = 0
const checks = []
function check(name, ok, detail) {
  checks.push({ name, ok, detail })
  if (!ok) { failed++ }
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const code = readSafe(path.join(ROOT, 'cloudfunctions', SVC, 'index.ts'))
check(`${SVC}/index.ts 存在`, Boolean(code))

const tsconfig = readSafe(path.join(ROOT, CFG))
let includeOk = false
if (tsconfig) { try { includeOk = JSON.parse(tsconfig).include?.includes(`cloudfunctions/${SVC}/index.ts`) } catch (e) {} }
check(`${CFG} include 包含 index.ts`, includeOk)

const pkg = readSafe(path.join(ROOT, 'package.json'))
if (pkg) {
  try {
    const cfg = JSON.parse(pkg)
    check(`audit:s46-${NAME}-ts`, Boolean(cfg.scripts[`audit:s46-${NAME}-ts`]))
    check(`audit:s46-${NAME}-ts:strict`, Boolean(cfg.scripts[`audit:s46-${NAME}-ts:strict`]))
    check('audit:s46-batch-services-ts:strict 存在（统一 CI 入口）', Boolean(cfg.scripts['audit:s46-batch-services-ts:strict']))
    check('ci:check 包含 batch 入口', /(?:audit:s46-batch-services-ts:strict|audit:all:strict)/.test(cfg.scripts['ci:check'] || ''))
  } catch (e) {}
}

if (code) {
  check('Sprint 46', /Sprint\s*46/.test(code))
  check('main 入口', /export\s+async\s+function\s+main\b/.test(code))
  check('CouponStatus 4 值', /['"]unused['"]/.test(code) && /['"]locked['"]/.test(code) && /['"]used['"]/.test(code) && /['"]expired['"]/.test(code))
  check('UserCouponDoc', /UserCouponDoc/.test(code))
  check('COLLECTION = user_coupons', /COLLECTION\s*=\s*['"]user_coupons['"]/.test(code))
  check('TARGET_STATUS = unused', /TARGET_STATUS:.*=\s*['"]unused['"]/.test(code))
  check('NEW_STATUS = expired', /NEW_STATUS:.*=\s*['"]expired['"]/.test(code))
  check('where status=unused + endTime<now', /status:\s*TARGET_STATUS/.test(code) && /endTime:\s*_\.lt\(now\)/.test(code))
  check('update to expired', /status:\s*NEW_STATUS/.test(code))
  check('updatedCount 返回', /updatedCount:\s*totalUpdated/.test(code))
  // H1: 循环分批更新（每批 100 条，最多 20 轮）
  check('BATCH_LIMIT 常量', /BATCH_LIMIT\s*=\s*100/.test(code))
  check('MAX_ROUNDS 常量', /MAX_ROUNDS\s*=\s*20/.test(code))
  check('循环分批 update', /for\s*\(\s*let\s+round\s*=\s*0/.test(code) && /updated\s*<\s*BATCH_LIMIT/.test(code))
  // M1: locked 卡死券处理
  check('STUCK_LOCKED_STATUS 常量', /STUCK_LOCKED_STATUS.*=.*['"]locked['"]/.test(code))
  check('STUCK_LOCKED_DAYS = 7', /STUCK_LOCKED_DAYS\s*=\s*7/.test(code))
  check('M1 阶段 2 处理', /stuckThreshold/.test(code) && /stuckLockedUpdated/.test(code))
  check('M1 清理关联字段', /orderId:\s*['"]{2}/.test(code) && /orderType:\s*['"]{2}/.test(code))
  check('M1 卡死券告警', /coupon\.expiry\.stuck\.locked/.test(code))
  // M3: 接入告警
  check('recordAlert 接入', /require\(['"]\.\.\/common\/alert['"]\)/.test(code) && /recordAlert\(['"]critical['"]/.test(code))
  // L2: 并发保护
  check('L2 并发保护', /_isRunning/.test(code) && /if\s*\(\s*_isRunning\s*\)/.test(code))
  check('Runtime shim', /_mod\.exports\s*=\s*\{/.test(code))
  check('export default', /export\s+default\s+\{/.test(code))
}

check(`test/${NAME}-ts-migration.test.js 存在`, fs.existsSync(path.join(ROOT, 'test', `${NAME}-ts-migration.test.js`)))

if (STRICT) {
  try {
    execSync(`npx --yes -p typescript@5.4.5 tsc --noEmit -p ${CFG}`, { cwd: ROOT, stdio: 'pipe' })
    check(`tsc 严格通过（${SVC}）`, true)
  } catch (e) { check(`tsc 严格通过（${SVC}）`, false, e.message) }
  const js = readSafe(path.join(ROOT, 'cloudfunctions', SVC, 'index.js'))
  check('index.js eslint-disable', js && js.startsWith('/* eslint-disable'))
}

console.log()
console.log(`[${failed === 0 ? 'PASS' : 'FAIL'}] ${checks.length - failed}/${checks.length} 项通过`)
if (failed > 0) { process.exit(1) }
