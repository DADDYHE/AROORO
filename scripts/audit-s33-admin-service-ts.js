#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Sprint 33: adminService/index.ts + constants.ts TypeScript 迁移审计脚本
 *
 * 背景：
 *   - adminService 是云函数入口，处理 16 类业务模块的统一调度
 *   - 16 个 services/*.js 子模块仍为 CommonJS（Sprint 34+ 逐个迁移）
 *   - 本次 Sprint 33 仅迁移入口（index.ts）与常量（constants.ts）
 *
 * 检查项：
 *   1. cloudfunctions/adminService/index.ts 存在
 *   2. cloudfunctions/adminService/index.d.ts 存在
 *   3. cloudfunctions/adminService/index.js 存在（构建产物）
 *   4. cloudfunctions/adminService/constants.ts 存在
 *   5. cloudfunctions/adminService/constants.d.ts 存在
 *   6. cloudfunctions/adminService/constants.js 存在
 *   7. tsconfig.adminService.json 存在
 *   8. tsconfig.adminService.json include 包含 index.ts + constants.ts
 *   9. scripts/build-all-services.js 存在
 *  10. build-all-services.js 包含 index.js + constants.js target
 *  11. package.json 注册 audit:s33-admin-service-ts + strict
 *  12. ci:check 包含 audit:s33-admin-service-ts:strict
 *  13. index.ts 强类型化 ACTION_PERMISSIONS
 *  14. index.ts 包含 AuthLike 接口
 *  15. index.ts 包含 CloudEvent 接口
 *  16. index.ts 包含 CloudContext 接口
 *  17. index.ts 包含 HttpInfo 接口
 *  18. index.ts 包含 JwtDecodedToken 接口
 *  19. index.ts 包含 EnrichmentResult 接口
 *  20. index.ts 包含 CorsHeaders 接口
 *  21. index.ts 包含 HttpResponse 接口
 *  22. index.ts 导出 PermissionLevel 类型
 *  23. index.ts 导出 ActionHandler 类型
 *  24. index.ts 导出 main 函数
 *  25. index.ts 导出 handlers 聚合对象
 *  26. index.ts CommonJS 导出兼容（export { main as default }）
 *  27. constants.ts 使用 as const 派生 OrderTypeKey
 *  28. constants.ts 包含 ORDER_TYPES / ORDER_TYPE_NAMES
 *  29. constants.ts Runtime shim 修复 CommonJS 导出
 *  30. jest 测试 admin-service-ts-migration.test.js 存在
 *
 * 严格模式额外检查（--strict）：
 *  31. tsc --noEmit 严格编译通过（adminService）
 *  32. tsc --noEmit 严格编译通过（paymentService）
 *  33. tsc --noEmit 严格编译通过（orderService）
 *  34. index.js 头部含 eslint-disable 标记
 *  35. constants.js 头部含 eslint-disable 标记
 *  36. index.js 导出 main 函数
 *  37. constants.js 导出 ORDER_TYPES
 *  38. cloudfunctions/adminService/services/*.js 仍存在（无服务被破坏）
 *  39. adminService 16 个 services 子模块全部存在
 *  40. index.ts 引入全部 16 个 services 子模块
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

// 1. 文件存在性
const ADMIN_DIR = path.join(ROOT, 'cloudfunctions', 'adminService')
const INDEX_TS = path.join(ADMIN_DIR, 'index.ts')
const INDEX_DTS = path.join(ADMIN_DIR, 'index.d.ts')
const INDEX_JS = path.join(ADMIN_DIR, 'index.js')
const CONSTANTS_TS = path.join(ADMIN_DIR, 'constants.ts')
const CONSTANTS_DTS = path.join(ADMIN_DIR, 'constants.d.ts')
const CONSTANTS_JS = path.join(ADMIN_DIR, 'constants.js')

check('index.ts 存在', fs.existsSync(INDEX_TS))
check('index.d.ts 存在', fs.existsSync(INDEX_DTS))
check('index.js（构建产物）存在', fs.existsSync(INDEX_JS))
check('constants.ts 存在', fs.existsSync(CONSTANTS_TS))
check('constants.d.ts 存在', fs.existsSync(CONSTANTS_DTS))
check('constants.js（构建产物）存在', fs.existsSync(CONSTANTS_JS))

const indexTs = readSafe(INDEX_TS)
const indexDts = readSafe(INDEX_DTS)
const indexJs = readSafe(INDEX_JS)
const constantsTs = readSafe(CONSTANTS_TS)

// 2. tsconfig.adminService.json
const tsconfig = readSafe(path.join(ROOT, 'tsconfig.adminService.json'))
let tsconfigIncludeOk = false
if (tsconfig) {
  try {
    const cfg = JSON.parse(tsconfig)
    tsconfigIncludeOk = Array.isArray(cfg.include)
      && cfg.include.includes('cloudfunctions/adminService/index.ts')
      && cfg.include.includes('cloudfunctions/adminService/constants.ts')
  } catch (e) {
    check('tsconfig.adminService.json 是合法 JSON', false, e.message)
  }
}
check('tsconfig.adminService.json include index.ts + constants.ts', tsconfigIncludeOk)

// 3. build script
const buildScript = readSafe(path.join(ROOT, 'scripts', 'build-all-services.js'))
check('scripts/build-all-services.js 存在', Boolean(buildScript))
if (buildScript) {
  const noComment = buildScript.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  check('build-all-services.js 包含 index.js target', /adminService['"]\s*,\s*['"]index\.js['"]/.test(noComment) || /index\.js/.test(noComment))
  check('build-all-services.js 包含 constants.js target', /constants\.js/.test(noComment))
}

// 4. package.json 注册
const pkg = readSafe(path.join(ROOT, 'package.json'))
let pkgOk = false
if (pkg) {
  try {
    const cfg = JSON.parse(pkg)
    pkgOk = true
    check('package.json 注册 audit:s33-admin-service-ts', Boolean(cfg.scripts['audit:s33-admin-service-ts']))
    check('package.json 注册 audit:s33-admin-service-ts:strict', Boolean(cfg.scripts['audit:s33-admin-service-ts:strict']))
    check('package.json ci:check 包含 audit:s33-admin-service-ts:strict',
      /(?:audit:s33-admin-service-ts:strict|audit:all:strict)/.test(cfg.scripts['ci:check'] || ''))
  } catch (e) {
    check('package.json 是合法 JSON', false, e.message)
  }
}
check('package.json 解析正常', pkgOk)

// 5. index.ts 内容
check('index.ts 注释包含 "Sprint 33"', /Sprint\s*33/.test(indexTs || ''))
check('index.ts 强类型化 ACTION_PERMISSIONS', /const\s+ACTION_PERMISSIONS\s*:\s*Record\s*<\s*string\s*,\s*PermissionLevel\s*>/.test(indexTs || ''))
check('index.ts 包含 AuthLike 接口', /export\s+interface\s+AuthLike\b/.test(indexTs || ''))
check('index.ts 包含 CloudEvent 接口', /export\s+interface\s+CloudEvent\b/.test(indexTs || ''))
check('index.ts 包含 CloudContext 接口', /export\s+interface\s+CloudContext\b/.test(indexTs || ''))
check('index.ts 包含 HttpInfo 接口', /export\s+interface\s+HttpInfo\b/.test(indexTs || ''))
check('index.ts 包含 JwtDecodedToken 接口', /export\s+interface\s+JwtDecodedToken\b/.test(indexTs || ''))
check('index.ts 包含 EnrichmentResult 接口', /export\s+interface\s+EnrichmentResult\b/.test(indexTs || ''))
check('index.ts 包含 CorsHeaders 接口', /export\s+interface\s+CorsHeaders\b/.test(indexTs || ''))
check('index.ts 包含 HttpResponse 接口', /export\s+interface\s+HttpResponse\b/.test(indexTs || ''))
check('index.ts 导出 PermissionLevel 类型', /export\s+type\s+PermissionLevel\b/.test(indexTs || ''))
check('index.ts 导出 ActionHandler 类型', /export\s+type\s+ActionHandler\b/.test(indexTs || ''))
check('index.ts 导出 main 函数', /export\s+const\s+main\s*[:=]/.test(indexTs || ''))
check('index.ts 导出 handlers 聚合对象', /export\s+const\s+handlers\s*[:=]/.test(indexTs || ''))
// index.ts 已重构为通过 `exports.main`（编译产物）暴露 main，
// 并以 `export { main as default }` 保持 ESM/CJS 双兼容；
// 不再重新赋值 module.exports（避免 runtime 加载 userFunction 时 main.toString() 返回 undefined）
check('index.ts CommonJS 导出兼容（export { main as default }）',
  /export\s*\{\s*main\s+as\s+default\s*\}/.test(indexTs || ''))

// 6. constants.ts 内容
check('constants.ts 注释包含 "Sprint 33"', /Sprint\s*33/.test(constantsTs || ''))
check('constants.ts 使用 as const 派生 OrderTypeKey', /as\s+const/.test(constantsTs || ''))
check('constants.ts 包含 ORDER_TYPES 常量', /export\s+const\s+ORDER_TYPES\s*[:=]/.test(constantsTs || ''))
check('constants.ts 包含 ORDER_TYPE_NAMES 常量', /export\s+const\s+ORDER_TYPE_NAMES\s*[:=]/.test(constantsTs || ''))
check('constants.ts 强类型化 OrderTypeKey', /export\s+type\s+OrderTypeKey\b/.test(constantsTs || ''))
check('constants.ts Runtime shim 修复 CommonJS 导出',
  /_mod\.exports\s*=\s*\{/.test(constantsTs || ''))

// 7. 测试存在
const migrationTest = path.join(ROOT, 'test', 'admin-service-ts-migration.test.js')
check('测试 admin-service-ts-migration.test.js 存在', fs.existsSync(migrationTest))

// 8. 严格模式
if (STRICT) {
  // 8.1 tsc --noEmit
  try {
    execSync('npx --yes -p typescript@5.4.5 tsc --noEmit -p tsconfig.adminService.json', { cwd: ROOT, stdio: 'pipe' })
    check('tsc --noEmit 严格模式通过（adminService）', true)
  } catch (e) {
    const msg = e.stderr ? e.stderr.toString().split('\n').slice(0, 8).join(' / ') : e.message
    check('tsc --noEmit 严格模式通过（adminService）', false, msg)
  }

  // 8.2 paymentService tsc --noEmit（回归）
  try {
    execSync('npx --yes -p typescript@5.4.5 tsc --noEmit -p tsconfig.paymentService.json', { cwd: ROOT, stdio: 'pipe' })
    check('tsc --noEmit 严格模式通过（paymentService 回归）', true)
  } catch (e) {
    const msg = e.stderr ? e.stderr.toString().split('\n').slice(0, 5).join(' / ') : e.message
    check('tsc --noEmit 严格模式通过（paymentService 回归）', false, msg)
  }

  // 8.3 orderService tsc --noEmit（回归）
  try {
    execSync('npx --yes -p typescript@5.4.5 tsc --noEmit -p tsconfig.orderService.json', { cwd: ROOT, stdio: 'pipe' })
    check('tsc --noEmit 严格模式通过（orderService 回归）', true)
  } catch (e) {
    const msg = e.stderr ? e.stderr.toString().split('\n').slice(0, 5).join(' / ') : e.message
    check('tsc --noEmit 严格模式通过（orderService 回归）', false, msg)
  }

  // 8.4 index.js 头部含 eslint-disable
  if (indexJs) {
    check('index.js 头部包含 eslint-disable 标记（构建产物）',
      indexJs.startsWith('/* eslint-disable'))
  } else {
    check('index.js 头部包含 eslint-disable 标记（构建产物）', false, 'js 文件不存在')
  }

  // 8.5 constants.js 头部含 eslint-disable
  const constantsJs = readSafe(CONSTANTS_JS)
  if (constantsJs) {
    check('constants.js 头部包含 eslint-disable 标记（构建产物）',
      constantsJs.startsWith('/* eslint-disable'))
  } else {
    check('constants.js 头部包含 eslint-disable 标记（构建产物）', false, 'js 文件不存在')
  }

  // 8.6 index.js 导出 main
  if (indexJs) {
    check('index.js 导出 main 函数',
      /exports\.main\s*=/.test(indexJs) || /main:\s*main/.test(indexJs) || /module\.exports\s*=\s*\{/.test(indexJs))
  } else {
    check('index.js 导出 main 函数', false, 'js 文件不存在')
  }

  // 8.7 constants.js 导出 ORDER_TYPES
  if (constantsJs) {
    check('constants.js 导出 ORDER_TYPES',
      /ORDER_TYPES/.test(constantsJs))
  } else {
    check('constants.js 导出 ORDER_TYPES', false, 'js 文件不存在')
  }

  // 8.8 adminService services 模块检查（16 个 handler + 1 个 utility）
  //   - 16 个 handler service 被 index.ts require
  //   - 1 个 utility service（stateMachine）被其他 service 引用，index.ts 不直接 require
  //   - 注：原 commission service 已并入 commissionConfig（后者在 handler 列表且被 index.ts require）
  const EXPECTED_HANDLER_SERVICES = [
    'activity', 'adminManagement', 'application', 'auth', 'banner',
    'coupon', 'feeding', 'hosting', 'i18nOverride', 'mall',
    'tuan', 'upload', 'user', 'wallet', 'stats',
    'commissionConfig',
  ]
  const EXPECTED_UTILITY_SERVICES = ['stateMachine']
  const EXPECTED_ALL_SERVICES = [...EXPECTED_HANDLER_SERVICES, ...EXPECTED_UTILITY_SERVICES]
  const missing = []
  for (const svc of EXPECTED_ALL_SERVICES) {
    const jsPath = path.join(ADMIN_DIR, 'services', `${svc}.js`)
    if (!fs.existsSync(jsPath)) {
      missing.push(svc)
    }
  }
  check(`adminService 17 services 模块全部存在（缺失：${missing.join(', ') || '无'}）`, missing.length === 0)

  // 8.9 index.ts 引入全部 16 handler services（不引入 utility services）
  if (indexTs) {
    const serviceRequires = (indexTs.match(/require\(['"]\.\/services\/[a-zA-Z0-9]+['"]\)/g) || []).map(s =>
      s.match(/\/([a-zA-Z0-9]+)['"]/)[1]
    )
    const uniqueServices = [...new Set(serviceRequires)]
    const allHandlerRequired = EXPECTED_HANDLER_SERVICES.every(svc => uniqueServices.includes(svc))
    check(`index.ts 引入全部 16 handler services（实际 ${uniqueServices.length} 个）`, allHandlerRequired)
  }
}

// 总结
console.log()
console.log(`[${failed === 0 ? 'PASS' : 'FAIL'}] ${checks.length - failed}/${checks.length} 项通过`)
if (failed > 0) { process.exit(1) }
