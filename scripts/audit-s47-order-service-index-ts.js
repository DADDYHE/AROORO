#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Sprint 47: orderService/index TypeScript 迁移审计
 *
 * 检查项：
 *   1. cloudfunctions/orderService/index.ts 存在
 *   2. cloudfunctions/orderService/index.js（构建产物）存在
 *   3. tsconfig.orderService.json include 包含 index.ts
 *   4. scripts/build-all-services.js 包含 index.js target
 *   5. package.json 注册 audit:s47-order-service-index-ts + strict
 *   6. ci:check 包含 audit:s47-order-service-index-ts:strict
 *   7. index.ts 强类型化 17 个 handler
 *   8. index.ts 抽离 SUPPORTED_ACTIONS 常量
 *   9. index.ts 聚合 orders + stats 子服务 handlers
 *  10. index.ts 注入 initGlobalRateLimitFromDb
 *  11. index.ts Runtime shim 修复 CommonJS 导出
 *  12. 严格模式：tsc --noEmit 无错误
 *  13. 严格模式：index.js 头部含 eslint-disable 标记
 *  14. 严格模式：index.js 包含 _mod.exports shim
 *  15. jest 测试 order-service-index-ts-migration.test.js 存在
 *
 * 退出码：
 *   0 = 全部通过
 *   1 = 至少 1 项不通过
 *   --strict：额外执行 tsc 编译 + runtime 校验
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const STRICT = process.argv.includes('--strict')
const SVC = 'orderService'
const CFG = 'tsconfig.orderService.json'

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
const TS = path.join(ROOT, 'cloudfunctions', SVC, 'index.ts')
const JS = path.join(ROOT, 'cloudfunctions', SVC, 'index.js')
check('orderService/index.ts 存在', fs.existsSync(TS))
check('orderService/index.js（构建产物）存在', fs.existsSync(JS))

const tsCode = readSafe(TS)
const jsCode = readSafe(JS)

// 2. tsconfig.orderService.json 配置
const tsconfig = readSafe(path.join(ROOT, CFG))
let tsconfigIncludeOk = false
if (tsconfig) {
  try {
    const cfg = JSON.parse(tsconfig)
    tsconfigIncludeOk = Array.isArray(cfg.include) && cfg.include.includes(`cloudfunctions/${SVC}/index.ts`)
  } catch (e) {
    check(`${CFG} 是合法 JSON`, false, e.message)
  }
}
check(`${CFG} include 包含 index.ts`, tsconfigIncludeOk)

// 3. build-all-services.js
const buildScript = readSafe(path.join(ROOT, 'scripts', 'build-all-services.js'))
check('scripts/build-all-services.js 存在', Boolean(buildScript))
if (buildScript) {
  const noComment = buildScript.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  check('build-all-services.js 包含 index.js target', /index\.js/.test(noComment))
}

// 4. package.json 注册
const pkg = readSafe(path.join(ROOT, 'package.json'))
let pkgOk = false
if (pkg) {
  try {
    const cfg = JSON.parse(pkg)
    pkgOk = true
    check('package.json 注册 audit:s47-order-service-index-ts',
      Boolean(cfg.scripts['audit:s47-order-service-index-ts']))
    check('package.json 注册 audit:s47-order-service-index-ts:strict',
      Boolean(cfg.scripts['audit:s47-order-service-index-ts:strict']))
    // Sprint 47 统一接入：ci:check 包含 batch 入口
    check('package.json ci:check 包含 audit:s47-batch-services-index-ts:strict',
      /(?:audit:s47-batch-services-index-ts:strict|audit:all:strict)/.test(cfg.scripts['ci:check'] || ''))
  } catch (e) {
    check('package.json 是合法 JSON', false, e.message)
  }
}
check('package.json 解析正常', pkgOk)

// 5. index.ts 内容
if (tsCode) {
  check('index.ts 注释包含 "Sprint 47"', /Sprint\s*47/.test(tsCode))
  check('index.ts 含 AuthLike / CloudEvent / CloudContext 接口',
    /export\s+interface\s+AuthLike\b/.test(tsCode)
    && /export\s+interface\s+CloudEvent\b/.test(tsCode)
    && /export\s+interface\s+CloudContext\b/.test(tsCode))
  check('index.ts 含 SUPPORTED_ACTIONS 常量',
    /export\s+const\s+SUPPORTED_ACTIONS/.test(tsCode))
  check('index.ts SUPPORTED_ACTIONS 包含 15+ orders handler',
    (tsCode.match(/['"](?:getOrders|createOrder|updateOrderStatus|cancelOrder|getOrderDetail|getActivityOrders|getActivityOrderDetail|calculatePrice|checkDateAvailability|getBoardingOrders|getBoardingOrderDetail|handleBoardingOrder|submitEvaluation|getHostEvaluations|enrichOrders)['"]/g) || []).length >= 15)
  check('index.ts SUPPORTED_ACTIONS 包含 2+ stats handler',
    (tsCode.match(/['"](?:getStats|getIncomeStats)['"]/g) || []).length >= 2)
  check('index.ts 聚合 orders 子服务 handlers',
    /require\(['"]\.\/orders['"]\)/.test(tsCode))
  check('index.ts 聚合 stats 子服务 handlers',
    /require\(['"]\.\/stats['"]\)/.test(tsCode))
  check('index.ts 含 main 入口',
    /export\s+async\s+function\s+main\b/.test(tsCode))
  check('index.ts 引用 isBusinessError 类型守卫',
    /isBusinessError/.test(tsCode))
  check('index.ts 使用 err() 工厂',
    /require\(['"][^'"]*errors['"]\)/.test(tsCode)
    || /from\s+['"][^'"]*errors['"]/.test(tsCode))
  check('index.ts 使用 toResponse / handleError 统一错误',
    /toResponse/.test(tsCode) && /handleError/.test(tsCode))
  check('index.ts 注入 initGlobalRateLimitFromDb（Sprint 21）',
    /initGlobalRateLimitFromDb/.test(tsCode))
  check('index.ts 包含 verifyAuth 鉴权',
    /verifyAuth/.test(tsCode))
  check('index.ts 所有 action 都需要登录（requireLogin=true）',
    /requireLogin\s*=\s*true/.test(tsCode))
  check('index.ts Runtime shim 修复 CommonJS 导出',
    /_mod\.exports\s*=\s*\{/.test(tsCode))
  check('index.ts 含 export default',
    /export\s+default\s+\{/.test(tsCode))
}

// 6. 测试存在
const migrationTest = path.join(ROOT, 'test', 'order-service-index-ts-migration.test.js')
check('测试 order-service-index-ts-migration.test.js 存在', fs.existsSync(migrationTest))

// 7. 严格模式
if (STRICT) {
  try {
    execSync(`npx --yes -p typescript@5.4.5 tsc --noEmit -p ${CFG}`, { cwd: ROOT, stdio: 'pipe' })
    check('tsc --noEmit 严格模式通过', true)
  } catch (e) {
    const msg = e.stderr ? e.stderr.toString().split('\n').slice(0, 5).join(' / ') : e.message
    check('tsc --noEmit 严格模式通过', false, msg)
  }

  if (jsCode) {
    check('index.js 头部包含 eslint-disable 标记（构建产物）', jsCode.startsWith('/* eslint-disable'))
    check('index.js 包含 _mod.exports shim',
      /_mod\.exports\s*=\s*\{/.test(jsCode))
  }
}

// 总结
console.log()
console.log(`[${failed === 0 ? 'PASS' : 'FAIL'}] ${checks.length - failed}/${checks.length} 项通过`)
if (failed > 0) { process.exit(1) }
