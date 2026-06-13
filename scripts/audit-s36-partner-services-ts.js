#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Sprint 36: partnerService/services/* TypeScript 迁移审计
 *
 * 检查项：
 *   1. services/application.ts / .d.ts / .js、referral.ts / .d.ts / .js、wallet.ts / .d.ts / .js 物理文件存在
 *   2. application.ts 修复 pre-existing 路径错误（require('../common/errors')）
 *   3. tsconfig.partnerService.json include 含 4 个文件（index + 3 services）
 *   4. build-all-services.js TARGETS 含 4 个 target（index.js / application.js / referral.js / wallet.js）
 *   5. application.ts 类型与 handler（ApplicationRecord / AdminRecord / SubmitApplicationEvent / ApplicationHandler / submitApplication / getApplicationStatus / getMyPermissions）
 *   6. referral.ts 类型与 handler（ReferralHandler / InvitedUser / CommissionItem / countAndSum + 4 个 action）
 *   7. wallet.ts 类型与 handler（WalletRecord / CommissionItem / OrderAggregate / IncomeOverview / IncomeDetailItem / WalletHandler / sumOrders / sumCommissions + 5 个 action）
 *   8. 12 个 action 全部强类型化（Sprint 36 注释）
 *   9. package.json 注册 audit:s36-partner-services-ts
 *  10. package.json ci:check 包含 audit:s36-partner-services-ts:strict
 *
 * strict 模式额外检查：
 *   - tsc --noEmit 严格编译通过
 *   - Runtime shim 存在（_mod.exports = {...}）
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const STRICT = process.argv.includes('--strict')
const PARTNER_DIR = path.join(ROOT, 'cloudfunctions', 'partnerService')
const SERVICES_DIR = path.join(PARTNER_DIR, 'services')

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

// 1. 物理文件存在
for (const f of ['application.ts', 'application.d.ts', 'application.js',
  'referral.ts', 'referral.d.ts', 'referral.js',
  'wallet.ts', 'wallet.d.ts', 'wallet.js']) {
  check(`services/${f} 存在`, fs.existsSync(path.join(SERVICES_DIR, f)))
}

// 2. application.ts 修复 pre-existing 路径错误
const appTs = readSafe(path.join(SERVICES_DIR, 'application.ts'))
if (appTs) {
  check('application.ts 使用正确相对路径 require(\'../common/errors\')',
    /require\(['"]\.\.\/common\/errors['"]\)/.test(appTs))
  check('application.ts 不含错误的 require(\'./common/errors\')',
    !/require\(['"]\.\/common\/errors['"]\)/.test(appTs))
} else {
  check('application.ts 存在', false)
}

// 3. tsconfig.partnerService.json
const tsconfig = readSafe(path.join(ROOT, 'tsconfig.partnerService.json'))
const REQUIRED_INCLUDE = [
  'cloudfunctions/partnerService/index.ts',
  'cloudfunctions/partnerService/services/application.ts',
  'cloudfunctions/partnerService/services/referral.ts',
  'cloudfunctions/partnerService/services/wallet.ts',
]
if (tsconfig) {
  try {
    const cfg = JSON.parse(tsconfig)
    for (const inc of REQUIRED_INCLUDE) {
      check(`tsconfig.include 包含 ${inc}`, Array.isArray(cfg.include) && cfg.include.includes(inc))
    }
  } catch (e) {
    check('tsconfig.partnerService.json 是合法 JSON', false, e.message)
  }
} else {
  check('tsconfig.partnerService.json 存在', false)
}

// 4. build-all-services.js
const buildScript = readSafe(path.join(ROOT, 'scripts', 'build-all-services.js'))
if (buildScript) {
  const noComment = buildScript.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  check('build-all-services.js 使用 tsc -p tsconfig.partnerService.json',
    /tsconfig: ['"]tsconfig\.partnerService\.json['"]/.test(noComment))
  for (const t of ['index.js', 'application.js', 'referral.js', 'wallet.js']) {
    check(`build 脚本包含 target: ${t}`, new RegExp(`['"]?${t.replace('.', '\\.')}['"]?`).test(noComment))
  }
} else {
  check('build-all-services.js 存在', false)
}

// 5. application.ts 类型与 handler
if (appTs) {
  check('application.ts 注释含 "Sprint 36"', /Sprint\s*36/.test(appTs))
  check('application.ts 含 ApplicationRecord 接口', /export\s+interface\s+ApplicationRecord\b/.test(appTs))
  check('application.ts 含 AdminRecord 接口', /export\s+interface\s+AdminRecord\b/.test(appTs))
  check('application.ts 含 SubmitApplicationEvent 接口', /export\s+interface\s+SubmitApplicationEvent\b/.test(appTs))
  check('application.ts 含 ApplicationHandler 类型', /export\s+type\s+ApplicationHandler\b/.test(appTs))
  check('application.ts 导出 submitApplication', /export\s+async\s+function\s+submitApplication\b/.test(appTs))
  check('application.ts 导出 getApplicationStatus', /export\s+async\s+function\s+getApplicationStatus\b/.test(appTs))
  check('application.ts 导出 getMyPermissions', /export\s+async\s+function\s+getMyPermissions\b/.test(appTs))
  check('application.ts 含 Runtime shim (_mod.exports = ...)', /_mod\.exports\s*=\s*\{/.test(appTs))
  check('application.ts 使用 Partial<AdminRecord>', /Partial<AdminRecord>/.test(appTs))
}

// 6. referral.ts 类型与 handler
const refTs = readSafe(path.join(SERVICES_DIR, 'referral.ts'))
if (refTs) {
  check('referral.ts 注释含 "Sprint 36"', /Sprint\s*36/.test(refTs))
  check('referral.ts 含 ReferralHandler 类型', /export\s+type\s+ReferralHandler\b/.test(refTs))
  check('referral.ts 含 InvitedUser 接口', /export\s+interface\s+InvitedUser\b/.test(refTs))
  check('referral.ts 含 CommissionItem 接口', /export\s+interface\s+CommissionItem\b/.test(refTs))
  check('referral.ts 含 countAndSum 函数 (强类型化)',
    /function\s+countAndSum\s*\(\s*res\s*:\s*DbQueryResult\s*\)/.test(refTs))
  for (const a of ['getReferralStats', 'getMyInvitedUsers', 'getReferralOrders', 'getReferralOrderStats']) {
    check(`referral.ts 导出 ${a}`, new RegExp(`export\\s+async\\s+function\\s+${a}\\b`).test(refTs))
  }
}

// 7. wallet.ts 类型与 handler
const walTs = readSafe(path.join(SERVICES_DIR, 'wallet.ts'))
if (walTs) {
  check('wallet.ts 注释含 "Sprint 36"', /Sprint\s*36/.test(walTs))
  check('wallet.ts 含 WalletRecord 接口', /export\s+interface\s+WalletRecord\b/.test(walTs))
  check('wallet.ts 含 CommissionItem 接口', /export\s+interface\s+CommissionItem\b/.test(walTs))
  check('wallet.ts 含 OrderAggregate 接口', /export\s+interface\s+OrderAggregate\b/.test(walTs))
  check('wallet.ts 含 IncomeOverview 接口', /export\s+interface\s+IncomeOverview\b/.test(walTs))
  check('wallet.ts 含 IncomeDetailItem 接口', /export\s+interface\s+IncomeDetailItem\b/.test(walTs))
  check('wallet.ts 含 WalletHandler 类型', /export\s+type\s+WalletHandler\b/.test(walTs))
  check('wallet.ts 含 sumOrders 函数', /function\s+sumOrders\s*\(/.test(walTs))
  check('wallet.ts 含 sumCommissions 函数', /function\s+sumCommissions\s*\(/.test(walTs))
  for (const a of ['getMyIncomeOverview', 'getMyIncomeDetails', 'getMyWallet', 'getMyWithdrawals', 'requestWithdrawal']) {
    check(`wallet.ts 导出 ${a}`, new RegExp(`export\\s+async\\s+function\\s+${a}\\b`).test(walTs))
  }
  check('wallet.ts 含 Runtime shim (_mod.exports = ...)', /_mod\.exports\s*=\s*\{/.test(walTs))
}

// 8. package.json 注册
const pkg = readSafe(path.join(ROOT, 'package.json'))
if (pkg) {
  try {
    const cfg = JSON.parse(pkg)
    check('package.json 注册 audit:s36-partner-services-ts',
      Boolean(cfg.scripts['audit:s36-partner-services-ts']))
    check('package.json 注册 audit:s36-partner-services-ts:strict',
      Boolean(cfg.scripts['audit:s36-partner-services-ts:strict']))
    check('package.json ci:check 包含 audit:s36-partner-services-ts:strict',
      /(?:audit:s36-partner-services-ts:strict|audit:all:strict)/.test(cfg.scripts['ci:check'] || ''))
  } catch (e) {
    check('package.json 是合法 JSON', false, e.message)
  }
} else {
  check('package.json 存在', false)
}

// 9. 测试存在
check('测试 partner-services-ts-migration.test.js 存在',
  fs.existsSync(path.join(ROOT, 'test', 'partner-services-ts-migration.test.js')))

// 严格模式
if (STRICT) {
  try {
    execSync('npx --yes -p typescript@5.4.5 tsc --noEmit -p tsconfig.partnerService.json', { cwd: ROOT, stdio: 'pipe' })
    check('tsc --noEmit 严格模式通过', true)
  } catch (e) {
    const msg = e.stderr ? e.stderr.toString().split('\n').slice(0, 5).join(' / ') : e.message
    check('tsc --noEmit 严格模式通过', false, msg)
  }
}

// 总结
console.log()
console.log(`[${failed === 0 ? 'PASS' : 'FAIL'}] ${checks.length - failed}/${checks.length} 项通过`)
if (failed > 0) { process.exit(1) }
