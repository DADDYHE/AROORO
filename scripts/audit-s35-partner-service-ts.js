#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Sprint 35: partnerService TypeScript 迁移审计
 *
 * 检查项：
 *   1. partnerService/index.ts / index.d.ts / index.js 物理文件存在
 *   2. tsconfig.partnerService.json 配置正确（strict / target ES2020 / module CommonJS / declaration）
 *   3. build-all-services.js 脚本使用 tsc -p tsconfig.partnerService.json
 *   4. index.ts 含公共类型（AuthLike / CloudEvent / CloudContext / PartnerActionHandler / PartnerPermission / PartnerHandlers）
 *   5. 3 个 services 子模块（application / wallet / referral）均存在
 *   6. 12 个 action 全部注册到 handlers 对象
 *   7. ACTION_PERMISSIONS 强类型化（Record<keyof PartnerHandlers, PartnerPermission>）
 *   8. checkPartnerPermission 函数存在
 *   9. package.json 注册 audit:s35-partner-service-ts
 *  10. package.json ci:check 包含 audit:s35-partner-service-ts:strict
 *
 * strict 模式额外检查：
 *   - tsc --noEmit 严格编译通过
 *   - main 函数已导出
 *   - Runtime shim 存在
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const STRICT = process.argv.includes('--strict')
const PARTNER_DIR = path.join(ROOT, 'cloudfunctions', 'partnerService')

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
check('cloudfunctions/partnerService/index.ts 存在', fs.existsSync(path.join(PARTNER_DIR, 'index.ts')))
check('cloudfunctions/partnerService/index.d.ts 存在', fs.existsSync(path.join(PARTNER_DIR, 'index.d.ts')))
check('cloudfunctions/partnerService/index.js 存在', fs.existsSync(path.join(PARTNER_DIR, 'index.js')))

// 2. tsconfig.partnerService.json
const tsconfig = readSafe(path.join(ROOT, 'tsconfig.partnerService.json'))
if (tsconfig) {
  try {
    const cfg = JSON.parse(tsconfig)
    check('tsconfig.partnerService.json 是合法 JSON', true)
    check('tsconfig.include 包含 cloudfunctions/partnerService/index.ts',
      Array.isArray(cfg.include) && cfg.include.includes('cloudfunctions/partnerService/index.ts'))
    check('tsconfig.compilerOptions.strict = true', cfg.compilerOptions && cfg.compilerOptions.strict === true)
    check('tsconfig.compilerOptions.target = ES2020', cfg.compilerOptions && cfg.compilerOptions.target === 'ES2020')
    check('tsconfig.compilerOptions.module = CommonJS', cfg.compilerOptions && cfg.compilerOptions.module === 'CommonJS')
    check('tsconfig.compilerOptions.declaration = true', cfg.compilerOptions && cfg.compilerOptions.declaration === true)
  } catch (e) {
    check('tsconfig.partnerService.json 是合法 JSON', false, e.message)
  }
} else {
  check('tsconfig.partnerService.json 存在', false)
}

// 3. build-all-services.js
const buildScript = readSafe(path.join(ROOT, 'scripts', 'build-all-services.js'))
if (buildScript) {
  const noComment = buildScript.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  check('build-all-services.js 使用 tsc -p tsconfig.partnerService.json',
    /tsconfig: ['"]tsconfig\.partnerService\.json['"]/.test(noComment))
  check('build-all-services.js TARGETS 含 index.js', /index\.js/.test(noComment))
} else {
  check('build-all-services.js 存在', false)
}

// 4. index.ts 类型定义
const indexTs = readSafe(path.join(PARTNER_DIR, 'index.ts'))
if (indexTs) {
  check('index.ts 注释含 "Sprint 35"', /Sprint\s*35/.test(indexTs))
  check('index.ts 含 AuthLike 接口', /export\s+interface\s+AuthLike\b/.test(indexTs))
  check('index.ts 含 CloudEvent 接口', /export\s+interface\s+CloudEvent\b/.test(indexTs))
  check('index.ts 含 CloudContext 接口', /export\s+interface\s+CloudContext\b/.test(indexTs))
  check('index.ts 含 PartnerActionHandler 类型', /export\s+type\s+PartnerActionHandler\b/.test(indexTs))
  check('index.ts 含 PartnerPermission 类型', /export\s+type\s+PartnerPermission\b/.test(indexTs))
  check('index.ts 含 PartnerHandlers 接口', /export\s+interface\s+PartnerHandlers\b/.test(indexTs))
  check('index.ts 强类型化 handlers (PartnerHandlers)', /export\s+const\s+handlers\s*:\s*PartnerHandlers\b/.test(indexTs))
  check('index.ts 强类型化 ACTION_PERMISSIONS (Record<keyof PartnerHandlers, PartnerPermission>)',
    /ACTION_PERMISSIONS\s*:\s*Record\s*<\s*keyof\s+PartnerHandlers\s*,\s*PartnerPermission\s*>/.test(indexTs))
  check('index.ts 含 checkPartnerPermission 函数', /async\s+function\s+checkPartnerPermission\b/.test(indexTs))
  check('index.ts 导出 main 函数', /export\s+const\s+main\s*[:=]/.test(indexTs))
  check('index.ts 含 Runtime shim (_mod.exports = ...)', /_mod\.exports\s*=\s*\{/.test(indexTs))
} else {
  check('index.ts 存在', false)
}

// 5. 3 个 services 子模块
const SERVICES = ['application', 'wallet', 'referral']
for (const svc of SERVICES) {
  check(`services/${svc}.js 存在`, fs.existsSync(path.join(PARTNER_DIR, 'services', `${svc}.js`)))
}
if (indexTs) {
  for (const svc of SERVICES) {
    check(`index.ts 引入 ./services/${svc}`, new RegExp(`require\\(['"]\\.\\/services\\/${svc}['"]\\)`).test(indexTs))
  }
}

// 6. 12 个 action 注册
const KEY_ACTIONS = [
  'submitApplication', 'getApplicationStatus', 'getMyPermissions',
  'getMyIncomeOverview', 'getMyIncomeDetails', 'getMyWallet', 'getMyWithdrawals', 'requestWithdrawal',
  'getReferralStats', 'getMyInvitedUsers', 'getReferralOrders', 'getReferralOrderStats',
]
if (indexTs) {
  for (const act of KEY_ACTIONS) {
    check(`action 注册: ${act}`, new RegExp(`\\b${act}\\s*:`).test(indexTs))
  }
}

// 7. package.json 注册
const pkg = readSafe(path.join(ROOT, 'package.json'))
if (pkg) {
  try {
    const cfg = JSON.parse(pkg)
    check('package.json 注册 audit:s35-partner-service-ts',
      Boolean(cfg.scripts['audit:s35-partner-service-ts']))
    check('package.json 注册 audit:s35-partner-service-ts:strict',
      Boolean(cfg.scripts['audit:s35-partner-service-ts:strict']))
    check('package.json ci:check 包含 audit:s35-partner-service-ts:strict',
      /(?:audit:s35-partner-service-ts:strict|audit:all:strict)/.test(cfg.scripts['ci:check'] || ''))
  } catch (e) {
    check('package.json 是合法 JSON', false, e.message)
  }
} else {
  check('package.json 存在', false)
}

// 8. 测试存在
check('测试 partner-service-ts-migration.test.js 存在',
  fs.existsSync(path.join(ROOT, 'test', 'partner-service-ts-migration.test.js')))

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
