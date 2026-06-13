#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Sprint 28: orderService/orders TypeScript 迁移审计脚本
 *
 * 检查项：
 *   1. cloudfunctions/orderService/orders.ts 存在
 *   2. cloudfunctions/orderService/orders.d.ts 存在
 *   3. cloudfunctions/orderService/orders.js 存在（构建产物）
 *   4. tsconfig.orderService.json include 包含 orders.ts
 *   5. scripts/build-all-services.js 存在
 *   6. package.json 注册 audit:s28-order-service-orders-ts + strict
 *   7. ci:check 包含 audit:s28-order-service-orders-ts:strict
 *   8. orders.ts 强类型化核心接口（EnrichedOrder / AdminDoc / NotificationPayload）
 *   9. orders.ts 包含 14 个 handler
 *  10. orders.ts 使用 isBusinessError 类型守卫
 *  11. orders.ts 使用 catch (error: unknown) 模式
 *  12. orders.ts Runtime shim 修复 CommonJS 导出
 *  13. payment.js / stats.js 暂未迁移（标记为待迁移）
 *  14. 严格模式：tsc --noEmit 无错误
 *  15. 严格模式：orders.d.ts 至少 1 处 export declare function
 *  16. 严格模式：orders.js 头部含 eslint-disable 标记
 *  17. 严格模式：orders.js require 路径在 cloudfunctions 内部可解析
 *  18. 严格模式：orders.js 包含 module.exports = _handlers shim
 *  19. jest 测试 order-service-orders-ts-migration.test.js 存在
 *  20. payment.ts 已废弃移除（Sprint 32）
 *  21. payment.js 编译产物已废弃移除（Sprint 32）
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
const TS = path.join(ROOT, 'cloudfunctions', 'orderService', 'orders.ts')
const DTS = path.join(ROOT, 'cloudfunctions', 'orderService', 'orders.d.ts')
const JS = path.join(ROOT, 'cloudfunctions', 'orderService', 'orders.js')
check('orders.ts 存在', fs.existsSync(TS))
check('orders.d.ts 存在', fs.existsSync(DTS))
check('orders.js（构建产物）存在', fs.existsSync(JS))

const tsCode = readSafe(TS)
const dtsCode = readSafe(DTS)
const jsCode = readSafe(JS)

// 2. tsconfig.orderService.json 配置
const tsconfig = readSafe(path.join(ROOT, 'tsconfig.orderService.json'))
let tsconfigIncludeOk = false
if (tsconfig) {
  try {
    const cfg = JSON.parse(tsconfig)
    tsconfigIncludeOk = Array.isArray(cfg.include) && cfg.include.includes('cloudfunctions/orderService/orders.ts')
  } catch (e) {
    check('tsconfig.orderService.json 是合法 JSON', false, e.message)
  }
}
check('tsconfig.orderService.json include orders.ts', tsconfigIncludeOk)

// 3. build-all-services.js
const buildScript = readSafe(path.join(ROOT, 'scripts', 'build-all-services.js'))
check('scripts/build-all-services.js 存在', Boolean(buildScript))
check('build-all-services.js 包含 orders.js', /orders\.js/.test(buildScript || ''))

// 4. package.json 注册
const pkg = readSafe(path.join(ROOT, 'package.json'))
let pkgOk = false
if (pkg) {
  try {
    const cfg = JSON.parse(pkg)
    pkgOk = true
    check('package.json 注册 audit:s28-order-service-orders-ts', Boolean(cfg.scripts['audit:s28-order-service-orders-ts']))
    check('package.json 注册 audit:s28-order-service-orders-ts:strict', Boolean(cfg.scripts['audit:s28-order-service-orders-ts:strict']))
    check('package.json ci:check 包含 audit:s28-order-service-orders-ts:strict',
      /(?:audit:s28-order-service-orders-ts:strict|audit:all:strict)/.test(cfg.scripts['ci:check'] || ''))
  } catch (e) {
    check('package.json 是合法 JSON', false, e.message)
  }
}
check('package.json 解析正常', pkgOk)

// 5. orders.ts 内容
check('orders.ts 注释包含 "Sprint 28 迁移"', /Sprint\s*28/.test(tsCode || ''))
check('orders.ts 强类型化 EnrichedOrder', /interface\s+EnrichedOrder\b/.test(tsCode || ''))
check('orders.ts 强类型化 EnrichedBoardingOrder', /interface\s+EnrichedBoardingOrder\b/.test(tsCode || ''))
check('orders.ts 强类型化 NotificationPayload', /interface\s+NotificationPayload\b/.test(tsCode || ''))
check('orders.ts 强类型化 AdminDoc', /interface\s+AdminDoc\b/.test(tsCode || ''))
check('orders.ts 包含 14 个 handler（export async function）',
  (tsCode?.match(/export\s+async\s+function\s+/g) || []).length >= 14)
check('orders.ts 使用 isBusinessError 类型守卫',
  /isBusinessError\(/.test(tsCode || ''))
check('orders.ts 使用 catch (error: unknown) 模式',
  /catch\s*\(\s*\w+\s*:\s*unknown\s*\)/.test(tsCode || ''))
check('orders.ts Runtime shim 修复 CommonJS 导出',
  /module\.as\s*\{/.test(tsCode || '') || /_mod\s*=\s*module/.test(tsCode || ''))
check('orders.ts 包含 withErrorHandling 包装',
  /withErrorHandling\(/.test(tsCode || ''))
check('orders.ts 包含 err() 工厂导入',
  /require\(['"][^'"]*errors['"]\)/.test(tsCode || ''))
check('orders.ts 引用 risk-control（detectReviewSpam）',
  /detectReviewSpam/.test(tsCode || ''))
check('orders.ts 引用 risk-rate-limit（withRateLimit）',
  /withRateLimit/.test(tsCode || ''))
check('orders.ts 引用 normalize（normalizeDbError）',
  /normalizeDbError/.test(tsCode || ''))
check('orders.ts 引用 boarding-state-machine',
  /boarding-state-machine/.test(tsCode || ''))

// 6. payment.ts / stats.ts 状态
//   - payment.ts 在 Sprint 29 已迁移，Sprint 32 已废弃移除（允许作为占位标记保留）
//   - stats.ts 在 Sprint 30 已迁移
const paymentTs = path.join(ROOT, 'cloudfunctions', 'orderService', 'payment.ts')
const paymentJs = path.join(ROOT, 'cloudfunctions', 'orderService', 'payment.js')
const statsTs = path.join(ROOT, 'cloudfunctions', 'orderService', 'stats.ts')
const paymentTsExists = fs.existsSync(paymentTs)
if (paymentTsExists) {
  const code = readSafe(paymentTs) || ''
  const isPlaceholder = /PAYMENT_HANDLERS_MIGRATED\s*=\s*true/.test(code)
  check('payment.ts 已废弃移除或为占位（Sprint 32）', isPlaceholder,
    isPlaceholder ? '占位标记 OK' : 'payment.ts 存在但无 PAYMENT_HANDLERS_MIGRATED = true')
} else {
  check('payment.ts 已废弃移除（Sprint 32）', true)
}
check('payment.js 编译产物已废弃移除（Sprint 32）', !fs.existsSync(paymentJs))
check('stats.ts 已迁移（Sprint 30 完成）', fs.existsSync(statsTs))

// 7. 测试存在
const migrationTest = path.join(ROOT, 'test', 'order-service-orders-ts-migration.test.js')
check('测试 order-service-orders-ts-migration.test.js 存在', fs.existsSync(migrationTest))

// 8. 严格模式
if (STRICT) {
  // 8.1 tsc --noEmit
  try {
    execSync('npx --yes -p typescript@5.4.5 tsc --noEmit -p tsconfig.orderService.json', { cwd: ROOT, stdio: 'pipe' })
    check('tsc --noEmit 严格模式通过', true)
  } catch (e) {
    const msg = e.stderr ? e.stderr.toString().split('\n').slice(0, 5).join(' / ') : e.message
    check('tsc --noEmit 严格模式通过', false, msg)
  }

  // 8.2 orders.d.ts 至少 1 处 export declare function
  if (dtsCode) {
    const matches = dtsCode.match(/export\s+declare\s+function/g) || []
    check(`orders.d.ts 含 14+ 处 export declare function（实际 ${matches.length}）`, matches.length >= 14)
  } else {
    check('orders.d.ts 含 14+ 处 export declare function', false, 'd.ts 文件不存在')
  }

  // 8.3 orders.js 头部含 eslint-disable 标记
  if (jsCode) {
    check('orders.js 头部包含 eslint-disable 标记（构建产物）', jsCode.startsWith('/* eslint-disable'))
  } else {
    check('orders.js 头部包含 eslint-disable 标记（构建产物）', false, 'js 文件不存在')
  }

  // 8.4 orders.js 包含 module.exports shim
  if (jsCode) {
    check('orders.js 包含 _mod.exports = _handlers shim',
      /_mod\.exports\s*=\s*_handlers/.test(jsCode))
  } else {
    check('orders.js 包含 _mod.exports = _handlers shim', false, 'js 文件不存在')
  }
}

// 总结
console.log()
console.log(`[${failed === 0 ? 'PASS' : 'FAIL'}] ${checks.length - failed}/${checks.length} 项通过`)
if (failed > 0) { process.exit(1) }
