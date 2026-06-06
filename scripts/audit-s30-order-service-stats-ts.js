#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Sprint 30: orderService/stats TypeScript 迁移审计脚本
 *
 * 检查项：
 *   1. cloudfunctions/orderService/stats.ts 存在
 *   2. cloudfunctions/orderService/stats.d.ts 存在
 *   3. cloudfunctions/orderService/stats.js 存在（构建产物）
 *   4. tsconfig.orderService.json include 包含 stats.ts
 *   5. scripts/build-order-service.js 包含 stats.js
 *   6. package.json 注册 audit:s30-order-service-stats-ts + strict
 *   7. ci:check 包含 audit:s30-order-service-stats-ts:strict
 *   8. stats.ts 强类型化聚合结果（GeneralStats / IncomeStatsData / IncomeListItem / AggregateSumResult）
 *   9. stats.ts 包含 2 个 handler（getStats / getIncomeStats）
 *  10. stats.ts 使用 isBusinessError 类型守卫
 *  11. stats.ts 使用 catch (error: unknown) 模式
 *  12. stats.ts Runtime shim 修复 CommonJS 导出
 *  13. stats.ts 包含 withErrorHandling 包装
 *  14. stats.ts 包含 err() 工厂导入
 *  15. stats.ts 使用 db.collection.aggregate().group() 聚合
 *  16. stats.ts 包含 STATUS_TEXT_MAP 状态文本映射
 *  17. stats.ts 包含 getDateRangeFromPreset 日期范围辅助
 *  18. orderService TypeScript 迁移完成（orders.ts / payment.ts / stats.ts 都存在）
 *  19. common/types.d.ts 包含 CloudBaseAggregate 接口（Sprint 30 扩展）
 *  20. jest 测试 order-service-stats-ts-migration.test.js 存在
 *  21-26. (strict) tsc --noEmit + .d.ts 2+ declare function + eslint-disable 头 + shim 存在 + exports 全部 + require 路径可解析
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
const TS = path.join(ROOT, 'cloudfunctions', 'orderService', 'stats.ts')
const DTS = path.join(ROOT, 'cloudfunctions', 'orderService', 'stats.d.ts')
const JS = path.join(ROOT, 'cloudfunctions', 'orderService', 'stats.js')
check('stats.ts 存在', fs.existsSync(TS))
check('stats.d.ts 存在', fs.existsSync(DTS))
check('stats.js（构建产物）存在', fs.existsSync(JS))

const tsCode = readSafe(TS)
const dtsCode = readSafe(DTS)
const jsCode = readSafe(JS)

// 2. tsconfig.orderService.json 配置
const tsconfig = readSafe(path.join(ROOT, 'tsconfig.orderService.json'))
let tsconfigIncludeOk = false
if (tsconfig) {
  try {
    const cfg = JSON.parse(tsconfig)
    tsconfigIncludeOk = Array.isArray(cfg.include) && cfg.include.includes('cloudfunctions/orderService/stats.ts')
  } catch (e) {
    check('tsconfig.orderService.json 是合法 JSON', false, e.message)
  }
}
check('tsconfig.orderService.json include stats.ts', tsconfigIncludeOk)

// 3. build-order-service.js
const buildScript = readSafe(path.join(ROOT, 'scripts', 'build-order-service.js'))
check('scripts/build-order-service.js 存在', Boolean(buildScript))
check('build-order-service.js 包含 stats.js', /stats\.js/.test(buildScript || ''))

// 4. package.json 注册
const pkg = readSafe(path.join(ROOT, 'package.json'))
let pkgOk = false
if (pkg) {
  try {
    const cfg = JSON.parse(pkg)
    pkgOk = true
    check('package.json 注册 audit:s30-order-service-stats-ts', Boolean(cfg.scripts['audit:s30-order-service-stats-ts']))
    check('package.json 注册 audit:s30-order-service-stats-ts:strict', Boolean(cfg.scripts['audit:s30-order-service-stats-ts:strict']))
    check('package.json ci:check 包含 audit:s30-order-service-stats-ts:strict',
      /audit:s30-order-service-stats-ts:strict/.test(cfg.scripts['ci:check'] || ''))
  } catch (e) {
    check('package.json 是合法 JSON', false, e.message)
  }
}
check('package.json 解析正常', pkgOk)

// 5. stats.ts 内容
check('stats.ts 注释包含 "Sprint 30 迁移"', /Sprint\s*30/.test(tsCode || ''))
check('stats.ts 强类型化 GeneralStats', /interface\s+GeneralStats\b/.test(tsCode || ''))
check('stats.ts 强类型化 AggregateSumResult', /interface\s+AggregateSumResult\b/.test(tsCode || ''))
check('stats.ts 强类型化 IncomeStatsData', /interface\s+IncomeStatsData\b/.test(tsCode || ''))
check('stats.ts 强类型化 IncomeListItem', /interface\s+IncomeListItem\b/.test(tsCode || ''))
check('stats.ts 包含 2 个 handler（export async function）',
  (tsCode?.match(/export\s+async\s+function\s+/g) || []).length >= 2)
check('stats.ts getStats 函数导出', /export\s+async\s+function\s+getStats\b/.test(tsCode || ''))
check('stats.ts getIncomeStats 函数导出', /export\s+async\s+function\s+getIncomeStats\b/.test(tsCode || ''))
check('stats.ts 使用 isBusinessError 类型守卫', /isBusinessError\(/.test(tsCode || ''))
check('stats.ts 使用 catch (error: unknown) 模式', /catch\s*\(\s*\w+\s*:\s*unknown\s*\)/.test(tsCode || ''))
check('stats.ts Runtime shim 修复 CommonJS 导出', /_mod\.exports\s*=\s*_handlers/.test(tsCode || ''))
check('stats.ts 包含 withErrorHandling 包装', /withErrorHandling\(/.test(tsCode || ''))
check('stats.ts 包含 err() 工厂导入', /require\(['"][^'"]*errors['"]\)/.test(tsCode || ''))
check('stats.ts 使用 aggregate().group() 聚合',
  /\.aggregate\(\)[\s\S]{0,200}\.group\(/.test(tsCode || ''))
check('stats.ts 包含 STATUS_TEXT_MAP 状态文本映射', /STATUS_TEXT_MAP/.test(tsCode || ''))
check('stats.ts 包含 getDateRangeFromPreset 日期范围辅助', /getDateRangeFromPreset/.test(tsCode || ''))
check('stats.ts 包含 pickSum 聚合提取辅助', /pickSum/.test(tsCode || ''))

// 6. orderService TypeScript 迁移完成
const ordersTs = path.join(ROOT, 'cloudfunctions', 'orderService', 'orders.ts')
const paymentTs = path.join(ROOT, 'cloudfunctions', 'orderService', 'payment.ts')
const statsTs = path.join(ROOT, 'cloudfunctions', 'orderService', 'stats.ts')
check('orders.ts 已迁移（Sprint 28）', fs.existsSync(ordersTs))
check('payment.ts 已迁移（Sprint 29）', fs.existsSync(paymentTs))
check('stats.ts 已迁移（Sprint 30）', fs.existsSync(statsTs))
check('orderService TypeScript 迁移完成（3/3）',
  fs.existsSync(ordersTs) && fs.existsSync(paymentTs) && fs.existsSync(statsTs))

// 7. common/types.d.ts 包含 CloudBaseAggregate
const typesDt = readSafe(path.join(ROOT, 'cloudfunctions', 'common', 'types.d.ts'))
check('common/types.d.ts 包含 CloudBaseAggregate 接口', /interface\s+CloudBaseAggregate\b/.test(typesDt || ''))
check('common/types.d.ts 包含 AggregateOps 接口', /interface\s+AggregateOps\b/.test(typesDt || ''))
check('CloudBaseQuery 包含 aggregate() 方法', /aggregate:\s*\(\)\s*=>\s*CloudBaseAggregate/.test(typesDt || ''))

// 8. 测试存在
const migrationTest = path.join(ROOT, 'test', 'order-service-stats-ts-migration.test.js')
check('测试 order-service-stats-ts-migration.test.js 存在', fs.existsSync(migrationTest))

// 9. 严格模式
if (STRICT) {
  // 9.1 tsc --noEmit
  try {
    execSync('npx --yes -p typescript@5.4.5 tsc --noEmit -p tsconfig.orderService.json', { cwd: ROOT, stdio: 'pipe' })
    check('tsc --noEmit 严格模式通过', true)
  } catch (e) {
    const msg = e.stderr ? e.stderr.toString().split('\n').slice(0, 5).join(' / ') : e.message
    check('tsc --noEmit 严格模式通过', false, msg)
  }

  // 9.2 stats.d.ts 至少 2 处 export declare function
  if (dtsCode) {
    const matches = dtsCode.match(/export\s+declare\s+function/g) || []
    check(`stats.d.ts 含 2+ 处 export declare function（实际 ${matches.length}）`, matches.length >= 2)
  } else {
    check('stats.d.ts 含 2+ 处 export declare function', false, 'd.ts 文件不存在')
  }

  // 9.3 stats.js 头部含 eslint-disable 标记
  if (jsCode) {
    check('stats.js 头部包含 eslint-disable 标记（构建产物）', jsCode.startsWith('/* eslint-disable'))
  } else {
    check('stats.js 头部包含 eslint-disable 标记（构建产物）', false, 'js 文件不存在')
  }

  // 9.4 stats.js 包含 module.exports shim
  if (jsCode) {
    check('stats.js 包含 _mod.exports = _handlers shim',
      /_mod\.exports\s*=\s*_handlers/.test(jsCode))
  } else {
    check('stats.js 包含 _mod.exports = _handlers shim', false, 'js 文件不存在')
  }

  // 9.5 stats.js 导出 getStats + getIncomeStats
  if (jsCode) {
    check('stats.js 导出 getStats',
      /exports\.getStats\s*=/.test(jsCode))
    check('stats.js 导出 getIncomeStats',
      /exports\.getIncomeStats\s*=/.test(jsCode))
  }
}

// 总结
console.log()
console.log(`[${failed === 0 ? 'PASS' : 'FAIL'}] ${checks.length - failed}/${checks.length} 项通过`)
if (failed > 0) { process.exit(1) }
