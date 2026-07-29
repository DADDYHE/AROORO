#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Sprint 34: userService TypeScript 迁移审计
 *
 * 检查项：
 *   1. userService/index.ts / index.d.ts / index.js 物理文件存在
 *   2. tsconfig.userService.json 配置正确（strict / declaration / target ES2020 / module CommonJS）
 *   3. build-all-services.js 脚本存在并使用 tsc 编译
 *   4. index.ts 含 5 个公共类型（AuthLike / CloudEvent / CloudContext / UserActionHandler / UserHandlers）
 *   5. 4 个 services 子模块（auth/notifications/referral/addresses）均存在
 *   6. 20 个 action 全部注册到 handlers 对象
 *   7. package.json 注册 audit:s34-user-service-ts
 *   8. package.json ci:check 包含 audit:s34-user-service-ts:strict
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
const USER_DIR = path.join(ROOT, 'cloudfunctions', 'userService')

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
check('cloudfunctions/userService/index.ts 存在', fs.existsSync(path.join(USER_DIR, 'index.ts')))
check('cloudfunctions/userService/index.d.ts 存在', fs.existsSync(path.join(USER_DIR, 'index.d.ts')))
check('cloudfunctions/userService/index.js 存在', fs.existsSync(path.join(USER_DIR, 'index.js')))

// 2. tsconfig.userService.json
const tsconfig = readSafe(path.join(ROOT, 'tsconfig.userService.json'))
if (tsconfig) {
  try {
    const cfg = JSON.parse(tsconfig)
    check('tsconfig.userService.json 是合法 JSON', true)
    check('tsconfig.include 包含 cloudfunctions/userService/index.ts',
      Array.isArray(cfg.include) && cfg.include.includes('cloudfunctions/userService/index.ts'))
    check('tsconfig.compilerOptions.strict = true', cfg.compilerOptions && cfg.compilerOptions.strict === true)
    check('tsconfig.compilerOptions.target = ES2020', cfg.compilerOptions && cfg.compilerOptions.target === 'ES2020')
    check('tsconfig.compilerOptions.module = CommonJS', cfg.compilerOptions && cfg.compilerOptions.module === 'CommonJS')
    check('tsconfig.compilerOptions.declaration = true', cfg.compilerOptions && cfg.compilerOptions.declaration === true)
  } catch (e) {
    check('tsconfig.userService.json 是合法 JSON', false, e.message)
  }
} else {
  check('tsconfig.userService.json 存在', false)
}

// 3. build-all-services.js
const buildScript = readSafe(path.join(ROOT, 'scripts', 'build-all-services.js'))
if (buildScript) {
  const noComment = buildScript.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  check('build-all-services.js 使用 tsc -p tsconfig.userService.json',
    /tsconfig: ['"]tsconfig\.userService\.json['"]/.test(noComment))
  check('build-all-services.js TARGETS 含 index.js', /index\.js/.test(noComment))
} else {
  check('build-all-services.js 存在', false)
}

// 4. index.ts 类型定义
const indexTs = readSafe(path.join(USER_DIR, 'index.ts'))
if (indexTs) {
  check('index.ts 注释含 "Sprint 34"', /Sprint\s*34/.test(indexTs))
  check('index.ts 从 common/types 引入 AuthLike', /import\s+type\s*\{[^}]*AuthLike[^}]*\}\s*from\s*['"]\.\/common\/types['"]/.test(indexTs))
  check('index.ts 从 common/types 引入 CloudEvent', /import\s+type\s*\{[^}]*CloudEvent[^}]*\}\s*from\s*['"]\.\/common\/types['"]/.test(indexTs))
  check('index.ts 从 common/types 引入 CloudContext', /import\s+type\s*\{[^}]*CloudContext[^}]*\}\s*from\s*['"]\.\/common\/types['"]/.test(indexTs))
  check('index.ts 含 UserActionHandler 类型', /export\s+type\s+UserActionHandler\b/.test(indexTs))
  check('index.ts 含 UserHandlers 接口', /export\s+interface\s+UserHandlers\b/.test(indexTs))
  check('index.ts 强类型化 handlers 聚合对象', /export\s+const\s+handlers\s*[:=]/.test(indexTs))
  check('index.ts 含 NO_AUTH_ACTIONS 集合', /NO_AUTH_ACTIONS/.test(indexTs))
  check('index.ts 导出 main 函数', /export\s+const\s+main\s*[:=]/.test(indexTs))
  check('index.ts 含 Runtime shim (_mod.exports = ...)', /_mod\.exports\s*=\s*\{/.test(indexTs))
} else {
  check('index.ts 存在', false)
}

// 5. 4 个 services 子模块
const SERVICES = ['auth', 'notifications', 'referral', 'addresses']
for (const svc of SERVICES) {
  check(`services/${svc}.js 存在`, fs.existsSync(path.join(USER_DIR, `${svc}.js`)))
}
if (indexTs) {
  for (const svc of SERVICES) {
    check(`index.ts 引入 ./${svc}`, new RegExp(`require\\(['"]\\.\\/${svc}['"]\\)`).test(indexTs))
  }
}

// 6. 20 个 action 注册
const KEY_ACTIONS = [
  'login', 'getIdentity', 'syncIdentity', 'check', 'update',
  'phone', 'all', 'getConfig', 'checkAdminStatus',
  'getNotificationList', 'markNotificationRead', 'markAllNotificationsRead', 'getNotificationDetail',
  'getReferralStats', 'getInvitedUsers',
  'addressList', 'addressAdd', 'addressUpdate', 'addressRemove', 'addressSetDefault',
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
    check('package.json 注册 audit:s34-user-service-ts',
      Boolean(cfg.scripts['audit:s34-user-service-ts']))
    check('package.json 注册 audit:s34-user-service-ts:strict',
      Boolean(cfg.scripts['audit:s34-user-service-ts:strict']))
    check('package.json ci:check 包含 audit:s34-user-service-ts:strict',
      /(?:audit:s34-user-service-ts:strict|audit:all:strict)/.test(cfg.scripts['ci:check'] || ''))
  } catch (e) {
    check('package.json 是合法 JSON', false, e.message)
  }
} else {
  check('package.json 存在', false)
}

// 8. 测试存在
check('测试 user-service-ts-migration.test.js 存在',
  fs.existsSync(path.join(ROOT, 'test', 'user-service-ts-migration.test.js')))

// 严格模式
if (STRICT) {
  try {
    execSync('npx --yes -p typescript@5.4.5 tsc --noEmit -p tsconfig.userService.json', { cwd: ROOT, stdio: 'pipe' })
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
