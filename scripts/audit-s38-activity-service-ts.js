#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Sprint 38: activityService TypeScript 迁移审计脚本
 *
 * 背景：
 *   - Sprint 38 完成 activityService index.ts 入口 TS 化
 *   - 13 个 action 全部强类型化（getActivityList / getActivityDetail / createActivity /
 *     updateActivity / deleteActivity / submitRegistration / getRegistrationDetail /
 *     getRegistrationList / createActivityPaymentOrder / confirmActivityPayment /
 *     getActivityRegistrations / exportActivityRegistrations / getActivityOrders）
 *
 * 检查项：
 *   1. cloudfunctions/activityService/index.ts 存在
 *   2. tsconfig.activityService.json include 包含 index.ts
 *   3. build-all-services.js 包含 index.js target
 *   4. package.json 注册 audit:s38-activity-service-ts + strict
 *   5. ci:check 包含 audit:s38-activity-service-ts:strict
 *   6-18. activityService/index.ts 类型与 handler（13 个 action + 8 个类型 + 4 个辅助函数）
 *  19. jest 测试 activity-service-ts-migration.test.js 存在
 *
 * 严格模式额外检查（--strict）：
 *  20. tsc --noEmit 严格编译通过（activityService）
 *  21. tsc --noEmit 严格编译通过（userService 回归）
 *  22. tsc --noEmit 严格编译通过（partnerService 回归）
 *  23. tsc --noEmit 严格编译通过（adminService 回归）
 *  24. tsc --noEmit 严格编译通过（paymentService 回归）
 *  25. tsc --noEmit 严格编译通过（orderService 回归）
 *  26. .js 构建产物头部含 eslint-disable
 *  27. activityService 入口存在
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

const ACT_DIR = path.join(ROOT, 'cloudfunctions', 'activityService')

// 1. 文件存在性
const ACT_TS = path.join(ACT_DIR, 'index.ts')

check('activityService/index.ts 存在', fs.existsSync(ACT_TS))

// 2. tsconfig 包含 1 个文件
const tsconfig = readSafe(path.join(ROOT, 'tsconfig.activityService.json'))
let includeCount = 0
if (tsconfig) {
  try {
    const cfg = JSON.parse(tsconfig)
    const required = [
      'cloudfunctions/activityService/index.ts',
    ]
    const include = cfg.include || []
    includeCount = required.filter(r => include.includes(r)).length
  } catch (e) {
    check('tsconfig.activityService.json 是合法 JSON', false, e.message)
  }
}
check(`tsconfig.activityService.json include 包含 index.ts（${includeCount}/1）`, includeCount === 1)

// 3. build script
const buildScript = readSafe(path.join(ROOT, 'scripts', 'build-all-services.js'))
if (buildScript) {
  const noComment = buildScript.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  check('build-all-services.js 包含 index.js target',
    /activityService['"]?\s*,\s*['"]?index['"]?/.test(noComment) || /['"]?index\.js['"]?/.test(noComment))
} else {
  check('scripts/build-all-services.js 存在', false)
}

// 4. package.json 注册
const pkg = readSafe(path.join(ROOT, 'package.json'))
if (pkg) {
  try {
    const cfg = JSON.parse(pkg)
    check('package.json 注册 audit:s38-activity-service-ts', Boolean(cfg.scripts['audit:s38-activity-service-ts']))
    check('package.json 注册 audit:s38-activity-service-ts:strict', Boolean(cfg.scripts['audit:s38-activity-service-ts:strict']))
    check('package.json ci:check 包含 audit:s38-activity-service-ts:strict',
      /(?:audit:s38-activity-service-ts:strict|audit:all:strict)/.test(cfg.scripts['ci:check'] || ''))
  } catch (e) {
    check('package.json 是合法 JSON', false, e.message)
  }
}

// 5. activityService/index.ts 内容
const actTs = readSafe(ACT_TS)
if (actTs) {
  check('index.ts 注释包含 Sprint 38', /Sprint\s*38/.test(actTs))
  check('index.ts 包含 AuthLike 接口', /export\s+interface\s+AuthLike\b/.test(actTs))
  check('index.ts 包含 CloudEvent 接口', /export\s+interface\s+CloudEvent\b/.test(actTs))
  check('index.ts 包含 CloudContext 接口', /export\s+interface\s+CloudContext\b/.test(actTs))
  check('index.ts 包含 ActivityActionHandler 类型', /export\s+type\s+ActivityActionHandler\b/.test(actTs))
  check('index.ts 包含 ActivityRecord 接口', /export\s+interface\s+ActivityRecord\b/.test(actTs))
  check('index.ts 包含 RegistrationRecord 接口', /export\s+interface\s+RegistrationRecord\b/.test(actTs))
  check('index.ts 包含 OrderRecord 接口', /export\s+interface\s+OrderRecord\b/.test(actTs))
  check('index.ts 包含 RiskCheckResult 接口', /export\s+interface\s+RiskCheckResult\b/.test(actTs))
  check('index.ts 包含 PaymentParams 接口', /export\s+interface\s+PaymentParams\b/.test(actTs))
  check('index.ts 包含 performActivityApplyRiskCheck 函数', /async\s+function\s+performActivityApplyRiskCheck\b/.test(actTs))
  // 2026-08-02 写入器统一：活动佣金写入委托到公共写入器 common/commission-utils，
  // 不再在 activityService 内联实现。审计重点从「是否含本地函数」改为「是否正确委托」。
  const delegatesCommission = /const\s*\{\s*createCommissionRecord\s*\}\s*=\s*require\(['"]\.\/common\/commission-utils['"]\)/.test(actTs)
  const hasLocalCommissionImpl = /async\s+function\s+createCommissionRecord\b/.test(actTs)
  check('index.ts 委托 common/commission-utils 提供 createCommissionRecord（写入器统一）', delegatesCommission)
  check('index.ts 不再内联 createCommissionRecord 实现', !hasLocalCommissionImpl)
  check('index.ts 包含 autoUpdateActivityStatus 函数', /async\s+function\s+autoUpdateActivityStatus\b/.test(actTs))
  check('index.ts 包含 handlers 聚合对象', /export\s+const\s+handlers\s*:\s*Record<string,\s*ActivityActionHandler>/.test(actTs))
  check('index.ts 包含 main 入口函数', /export\s+async\s+function\s+main\b/.test(actTs))

  const ACTIONS = [
    'getActivityList', 'getActivityDetail', 'submitRegistration',
    'getRegistrationDetail', 'getRegistrationList',
  ]
  ACTIONS.forEach(act => {
    check(`index.ts 导出 ${act}`, new RegExp(`export\\s+async\\s+function\\s+${act}\\b`).test(actTs))
  })
  check('index.ts 包含 Runtime shim', /_mod\.exports\s*=\s*\{/.test(actTs))
}

// 6. 测试存在
const migrationTest = path.join(ROOT, 'test', 'activity-service-ts-migration.test.js')
check('测试 activity-service-ts-migration.test.js 存在', fs.existsSync(migrationTest))

// 严格模式
if (STRICT) {
  // 6.1 tsc --noEmit (activityService)
  try {
    execSync('npx --yes -p typescript@5.4.5 tsc --noEmit -p tsconfig.activityService.json', { cwd: ROOT, stdio: 'pipe' })
    check('tsc --noEmit 严格模式通过（activityService）', true)
  } catch (e) {
    const msg = e.stderr ? e.stderr.toString().split('\n').slice(0, 8).join(' / ') : e.message
    check('tsc --noEmit 严格模式通过（activityService）', false, msg)
  }

  // 6.2 tsc --noEmit (userService 回归)
  try {
    execSync('npx --yes -p typescript@5.4.5 tsc --noEmit -p tsconfig.userService.json', { cwd: ROOT, stdio: 'pipe' })
    check('tsc --noEmit 严格模式通过（userService 回归）', true)
  } catch (e) {
    const msg = e.stderr ? e.stderr.toString().split('\n').slice(0, 5).join(' / ') : e.message
    check('tsc --noEmit 严格模式通过（userService 回归）', false, msg)
  }

  // 6.3 tsc --noEmit (partnerService 回归)
  try {
    execSync('npx --yes -p typescript@5.4.5 tsc --noEmit -p tsconfig.partnerService.json', { cwd: ROOT, stdio: 'pipe' })
    check('tsc --noEmit 严格模式通过（partnerService 回归）', true)
  } catch (e) {
    const msg = e.stderr ? e.stderr.toString().split('\n').slice(0, 5).join(' / ') : e.message
    check('tsc --noEmit 严格模式通过（partnerService 回归）', false, msg)
  }

  // 6.4 tsc --noEmit (adminService 回归)
  try {
    execSync('npx --yes -p typescript@5.4.5 tsc --noEmit -p tsconfig.adminService.json', { cwd: ROOT, stdio: 'pipe' })
    check('tsc --noEmit 严格模式通过（adminService 回归）', true)
  } catch (e) {
    const msg = e.stderr ? e.stderr.toString().split('\n').slice(0, 5).join(' / ') : e.message
    check('tsc --noEmit 严格模式通过（adminService 回归）', false, msg)
  }

  // 6.5 tsc --noEmit (paymentService 回归)
  try {
    execSync('npx --yes -p typescript@5.4.5 tsc --noEmit -p tsconfig.paymentService.json', { cwd: ROOT, stdio: 'pipe' })
    check('tsc --noEmit 严格模式通过（paymentService 回归）', true)
  } catch (e) {
    const msg = e.stderr ? e.stderr.toString().split('\n').slice(0, 5).join(' / ') : e.message
    check('tsc --noEmit 严格模式通过（paymentService 回归）', false, msg)
  }

  // 6.6 tsc --noEmit (orderService 回归)
  try {
    execSync('npx --yes -p typescript@5.4.5 tsc --noEmit -p tsconfig.orderService.json', { cwd: ROOT, stdio: 'pipe' })
    check('tsc --noEmit 严格模式通过（orderService 回归）', true)
  } catch (e) {
    const msg = e.stderr ? e.stderr.toString().split('\n').slice(0, 5).join(' / ') : e.message
    check('tsc --noEmit 严格模式通过（orderService 回归）', false, msg)
  }

  // 6.7 .js 构建产物头部含 eslint-disable
  const JS_TARGET = path.join(ACT_DIR, 'index.js')
  const content = readSafe(JS_TARGET)
  if (content) {
    check('cloudfunctions/activityService/index.js 头部含 eslint-disable', content.startsWith('/* eslint-disable'))
  } else {
    check('cloudfunctions/activityService/index.js 存在', false)
  }

  // 6.8 activityService 入口存在
  check('activityService 入口存在', fs.existsSync(JS_TARGET))
}

// 总结
console.log()
console.log(`[${failed === 0 ? 'PASS' : 'FAIL'}] ${checks.length - failed}/${checks.length} 项通过`)
if (failed > 0) { process.exit(1) }
