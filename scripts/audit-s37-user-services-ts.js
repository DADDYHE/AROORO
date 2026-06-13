#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Sprint 37: userService 4 个 services/* TypeScript 迁移审计脚本
 *
 * 背景：
 *   - Sprint 34 完成 userService 入口（index.ts）TS 化
 *   - Sprint 37 完成 4 个 services 子模块 TS 化（auth / notifications / referral / addresses）
 *   - 20 个 action 全部强类型化（9+4+2+5）
 *
 * 注意：
 *   - userService 4 个 service 文件位于顶层（不是 services/ 子目录）
 *   - 文件命名：auth.ts / notifications.ts / referral.ts / addresses.ts
 *
 * 检查项：
 *   1. cloudfunctions/userService/auth.ts 存在
 *   2. cloudfunctions/userService/notifications.ts 存在
 *   3. cloudfunctions/userService/referral.ts 存在
 *   4. cloudfunctions/userService/addresses.ts 存在
 *   5. tsconfig.userService.json include 包含全部 5 个文件
 *   6. build-all-services.js 包含全部 5 个 .js target
 *   7. package.json 注册 audit:s37-user-services-ts + strict
 *   8. ci:check 包含 audit:s37-user-services-ts:strict
 *   9-23. auth.ts 类型与 handler（9 个 action + 8 个类型）
 *  24-32. notifications.ts 类型与 handler（4 个 action + 5 个类型）
 *  33-43. referral.ts 类型与 handler（2 个 action + 5 个类型 + sumOrderTotal）
 *  44-54. addresses.ts 类型与 handler（5 个 action + 5 个类型 + filterAddressFields）
 *  55. jest 测试 user-services-ts-migration.test.js 存在
 *
 * 严格模式额外检查（--strict）：
 *  56. tsc --noEmit 严格编译通过（userService）
 *  57. tsc --noEmit 严格编译通过（partnerService 回归）
 *  58. tsc --noEmit 严格编译通过（adminService 回归）
 *  59. tsc --noEmit 严格编译通过（paymentService 回归）
 *  60. tsc --noEmit 严格编译通过（orderService 回归）
 *  61-65. 5 个 .js 构建产物头部含 eslint-disable
 *  66. userService 入口 + 4 个 services 子模块全部存在
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

const USER_DIR = path.join(ROOT, 'cloudfunctions', 'userService')

// 1. 文件存在性
const AUTH_TS = path.join(USER_DIR, 'auth.ts')
const NOTI_TS = path.join(USER_DIR, 'notifications.ts')
const REF_TS = path.join(USER_DIR, 'referral.ts')
const ADD_TS = path.join(USER_DIR, 'addresses.ts')

check('auth.ts 存在', fs.existsSync(AUTH_TS))
check('notifications.ts 存在', fs.existsSync(NOTI_TS))
check('referral.ts 存在', fs.existsSync(REF_TS))
check('addresses.ts 存在', fs.existsSync(ADD_TS))

// 2. tsconfig 包含 5 个文件
const tsconfig = readSafe(path.join(ROOT, 'tsconfig.userService.json'))
let includeCount = 0
if (tsconfig) {
  try {
    const cfg = JSON.parse(tsconfig)
    const required = [
      'cloudfunctions/userService/index.ts',
      'cloudfunctions/userService/auth.ts',
      'cloudfunctions/userService/notifications.ts',
      'cloudfunctions/userService/referral.ts',
      'cloudfunctions/userService/addresses.ts',
    ]
    const include = cfg.include || []
    includeCount = required.filter(r => include.includes(r)).length
  } catch (e) {
    check('tsconfig.userService.json 是合法 JSON', false, e.message)
  }
}
check(`tsconfig.userService.json include 包含全部 5 个文件（${includeCount}/5）`, includeCount === 5)

// 3. build script
const buildScript = readSafe(path.join(ROOT, 'scripts', 'build-all-services.js'))
if (buildScript) {
  const noComment = buildScript.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  check('build-all-services.js 包含 auth.js target', /auth\.js/.test(noComment))
  check('build-all-services.js 包含 notifications.js target', /notifications\.js/.test(noComment))
  check('build-all-services.js 包含 referral.js target', /referral\.js/.test(noComment))
  check('build-all-services.js 包含 addresses.js target', /addresses\.js/.test(noComment))
  check('build-all-services.js 包含 index.js target',
    /userService['"]?\s*,\s*['"]?index['"]?/.test(noComment) || /['"]?index\.js['"]?/.test(noComment))
} else {
  check('scripts/build-all-services.js 存在', false)
}

// 4. package.json 注册
const pkg = readSafe(path.join(ROOT, 'package.json'))
if (pkg) {
  try {
    const cfg = JSON.parse(pkg)
    check('package.json 注册 audit:s37-user-services-ts', Boolean(cfg.scripts['audit:s37-user-services-ts']))
    check('package.json 注册 audit:s37-user-services-ts:strict', Boolean(cfg.scripts['audit:s37-user-services-ts:strict']))
    check('package.json ci:check 包含 audit:s37-user-services-ts:strict',
      /(?:audit:s37-user-services-ts:strict|audit:all:strict)/.test(cfg.scripts['ci:check'] || ''))
  } catch (e) {
    check('package.json 是合法 JSON', false, e.message)
  }
}

// 5. auth.ts 内容
const authTs = readSafe(AUTH_TS)
if (authTs) {
  check('auth.ts 注释包含 Sprint 37', /Sprint\s*37/.test(authTs))
  check('auth.ts 包含 AuthHandler 类型', /export\s+type\s+AuthHandler\b/.test(authTs))
  check('auth.ts 包含 UserRecord 接口', /export\s+interface\s+UserRecord\b/.test(authTs))
  check('auth.ts 包含 UserPublicView 接口', /export\s+interface\s+UserPublicView\b/.test(authTs))
  check('auth.ts 包含 AdminRecord 接口', /export\s+interface\s+AdminRecord\b/.test(authTs))
  check('auth.ts 包含 LoginResult 接口', /export\s+interface\s+LoginResult\b/.test(authTs))
  check('auth.ts 包含 IdentityResult 接口', /export\s+interface\s+IdentityResult\b/.test(authTs))
  check('auth.ts 包含 CheckResult 接口', /export\s+interface\s+CheckResult\b/.test(authTs))
  check('auth.ts 包含 AllUserInfoResult 接口', /export\s+interface\s+AllUserInfoResult\b/.test(authTs))
  const ACTIONS = ['login', 'getIdentity', 'syncIdentity', 'checkUserInfo', 'updateUserInfo', 'getPhoneNumber', 'getAllUserInfo', 'getConfig', 'checkAdminStatus']
  ACTIONS.forEach(act => {
    check(`auth.ts 导出 ${act}`, new RegExp(`export\\s+async\\s+function\\s+${act}\\b`).test(authTs))
  })
  check('auth.ts 包含 Runtime shim', /_mod\.exports\s*=\s*\{/.test(authTs))
}

// 6. notifications.ts 内容
const notiTs = readSafe(NOTI_TS)
if (notiTs) {
  check('notifications.ts 注释包含 Sprint 37', /Sprint\s*37/.test(notiTs))
  check('notifications.ts 包含 NotificationHandler 类型', /export\s+type\s+NotificationHandler\b/.test(notiTs))
  check('notifications.ts 包含 NotificationRecord 接口', /export\s+interface\s+NotificationRecord\b/.test(notiTs))
  check('notifications.ts 包含 NotificationListResult 接口', /export\s+interface\s+NotificationListResult\b/.test(notiTs))
  const ACTIONS = ['getNotificationList', 'markNotificationRead', 'markAllNotificationsRead', 'getNotificationDetail']
  ACTIONS.forEach(act => {
    check(`notifications.ts 导出 ${act}`, new RegExp(`export\\s+async\\s+function\\s+${act}\\b`).test(notiTs))
  })
  check('notifications.ts 包含 Runtime shim', /_mod\.exports\s*=\s*\{/.test(notiTs))
}

// 7. referral.ts 内容
const refTs = readSafe(REF_TS)
if (refTs) {
  check('referral.ts 注释包含 Sprint 37', /Sprint\s*37/.test(refTs))
  check('referral.ts 包含 ReferralHandler 类型', /export\s+type\s+ReferralHandler\b/.test(refTs))
  check('referral.ts 包含 UserRecord 接口', /export\s+interface\s+UserRecord\b/.test(refTs))
  check('referral.ts 包含 InvitedUserView 接口', /export\s+interface\s+InvitedUserView\b/.test(refTs))
  check('referral.ts 包含 ReferralStatsResult 接口', /export\s+interface\s+ReferralStatsResult\b/.test(refTs))
  check('referral.ts 包含 InvitedUsersResult 接口', /export\s+interface\s+InvitedUsersResult\b/.test(refTs))
  check('referral.ts 包含 sumOrderTotal 函数（强类型化）', /function\s+sumOrderTotal\s*\(\s*orders\s*:\s*OrderLike\s*\[\s*\]\s*\)/.test(refTs))
  const ACTIONS = ['getReferralStats', 'getInvitedUsers']
  ACTIONS.forEach(act => {
    check(`referral.ts 导出 ${act}`, new RegExp(`export\\s+async\\s+function\\s+${act}\\b`).test(refTs))
  })
  check('referral.ts 包含 Runtime shim', /_mod\.exports\s*=\s*\{/.test(refTs))
}

// 8. addresses.ts 内容
const addTs = readSafe(ADD_TS)
if (addTs) {
  check('addresses.ts 注释包含 Sprint 37', /Sprint\s*37/.test(addTs))
  check('addresses.ts 包含 AddressHandler 类型', /export\s+type\s+AddressHandler\b/.test(addTs))
  check('addresses.ts 包含 AddressInput 接口', /export\s+interface\s+AddressInput\b/.test(addTs))
  check('addresses.ts 包含 AddressRecord 接口', /export\s+interface\s+AddressRecord\b/.test(addTs))
  check('addresses.ts 包含 filterAddressFields 函数（强类型化）',
    /function\s+filterAddressFields\s*\(\s*data\s*:\s*AddressInput\s*\)/.test(addTs))
  const ACTIONS = ['list', 'add', 'update', 'remove', 'setDefault']
  ACTIONS.forEach(act => {
    check(`addresses.ts 导出 ${act}`, new RegExp(`export\\s+async\\s+function\\s+${act}\\b`).test(addTs))
  })
  check('addresses.ts 包含 Runtime shim', /_mod\.exports\s*=\s*\{/.test(addTs))
}

// 9. 测试存在
const migrationTest = path.join(ROOT, 'test', 'user-services-ts-migration.test.js')
check('测试 user-services-ts-migration.test.js 存在', fs.existsSync(migrationTest))

// 严格模式
if (STRICT) {
  // 9.1 tsc --noEmit (userService)
  try {
    execSync('npx --yes -p typescript@5.4.5 tsc --noEmit -p tsconfig.userService.json', { cwd: ROOT, stdio: 'pipe' })
    check('tsc --noEmit 严格模式通过（userService）', true)
  } catch (e) {
    const msg = e.stderr ? e.stderr.toString().split('\n').slice(0, 8).join(' / ') : e.message
    check('tsc --noEmit 严格模式通过（userService）', false, msg)
  }

  // 9.2 tsc --noEmit (partnerService 回归)
  try {
    execSync('npx --yes -p typescript@5.4.5 tsc --noEmit -p tsconfig.partnerService.json', { cwd: ROOT, stdio: 'pipe' })
    check('tsc --noEmit 严格模式通过（partnerService 回归）', true)
  } catch (e) {
    const msg = e.stderr ? e.stderr.toString().split('\n').slice(0, 5).join(' / ') : e.message
    check('tsc --noEmit 严格模式通过（partnerService 回归）', false, msg)
  }

  // 9.3 tsc --noEmit (adminService 回归)
  try {
    execSync('npx --yes -p typescript@5.4.5 tsc --noEmit -p tsconfig.adminService.json', { cwd: ROOT, stdio: 'pipe' })
    check('tsc --noEmit 严格模式通过（adminService 回归）', true)
  } catch (e) {
    const msg = e.stderr ? e.stderr.toString().split('\n').slice(0, 5).join(' / ') : e.message
    check('tsc --noEmit 严格模式通过（adminService 回归）', false, msg)
  }

  // 9.4 tsc --noEmit (paymentService 回归)
  try {
    execSync('npx --yes -p typescript@5.4.5 tsc --noEmit -p tsconfig.paymentService.json', { cwd: ROOT, stdio: 'pipe' })
    check('tsc --noEmit 严格模式通过（paymentService 回归）', true)
  } catch (e) {
    const msg = e.stderr ? e.stderr.toString().split('\n').slice(0, 5).join(' / ') : e.message
    check('tsc --noEmit 严格模式通过（paymentService 回归）', false, msg)
  }

  // 9.5 tsc --noEmit (orderService 回归)
  try {
    execSync('npx --yes -p typescript@5.4.5 tsc --noEmit -p tsconfig.orderService.json', { cwd: ROOT, stdio: 'pipe' })
    check('tsc --noEmit 严格模式通过（orderService 回归）', true)
  } catch (e) {
    const msg = e.stderr ? e.stderr.toString().split('\n').slice(0, 5).join(' / ') : e.message
    check('tsc --noEmit 严格模式通过（orderService 回归）', false, msg)
  }

  // 9.6 5 个 .js 构建产物头部含 eslint-disable
  const JS_TARGETS = [
    path.join(USER_DIR, 'index.js'),
    path.join(USER_DIR, 'auth.js'),
    path.join(USER_DIR, 'notifications.js'),
    path.join(USER_DIR, 'referral.js'),
    path.join(USER_DIR, 'addresses.js'),
  ]
  JS_TARGETS.forEach(target => {
    const content = readSafe(target)
    if (content) {
      const rel = path.relative(ROOT, target)
      check(`${rel} 头部含 eslint-disable`, content.startsWith('/* eslint-disable'))
    } else {
      check(`${path.relative(ROOT, target)} 存在`, false)
    }
  })

  // 9.7 userService 入口 + 4 个 services 子模块全部存在
  const missing = []
  JS_TARGETS.forEach(p => {
    if (!fs.existsSync(p)) { missing.push(path.basename(p)) }
  })
  check(`userService 入口 + 4 个 services 子模块全部存在（缺失：${missing.join(', ') || '无'}）`, missing.length === 0)
}

// 总结
console.log()
console.log(`[${failed === 0 ? 'PASS' : 'FAIL'}] ${checks.length - failed}/${checks.length} 项通过`)
if (failed > 0) { process.exit(1) }
