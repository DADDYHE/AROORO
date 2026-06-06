#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Sprint 27: paymentService/commission TypeScript 迁移审计脚本
 *
 * 检查项：
 *   1. cloudfunctions/paymentService/services/commission.ts 存在
 *   2. cloudfunctions/paymentService/services/commission.d.ts 存在
 *   3. cloudfunctions/paymentService/services/commission.js 存在（构建产物）
 *   4. tsconfig.paymentService.json include 包含 commission.ts
 *   5. scripts/build-payment-service.js TARGETS 包含 commission.js
 *   6. package.json 注册 audit:s27-payment-commission-ts + strict
 *   7. ci:check 包含 audit:s27-payment-commission-ts:strict
 *   8. commission.ts 强类型化 4 个核心接口
 *   9. commission.ts 实现 best-effort 错误处理（catch unknown）
 *  10. commission.ts 引用 generateId 工具
 *  11. commission.ts 写入 tuan_commissions 集合
 *  12. pay.ts 使用解构风格 require commission（与原 .js 兼容）
 *  13. notify.ts 使用解构风格 require commission（Sprint 27 调整）
 *  14. 测试存在
 *  15. 严格模式：tsc --noEmit 无错误
 *  16. 严格模式：commission.d.ts 至少 1 处 export declare function
 *  17. 严格模式：commission.js 头部含 eslint-disable 标记
 *  18. 严格模式：commission.js 导出 createCommissionRecord
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
const TS = path.join(ROOT, 'cloudfunctions', 'paymentService', 'services', 'commission.ts')
const DTS = path.join(ROOT, 'cloudfunctions', 'paymentService', 'services', 'commission.d.ts')
const JS = path.join(ROOT, 'cloudfunctions', 'paymentService', 'services', 'commission.js')
check('commission.ts 存在', fs.existsSync(TS))
check('commission.d.ts 存在', fs.existsSync(DTS))
check('commission.js（构建产物）存在', fs.existsSync(JS))

const tsCode = readSafe(TS)
const dtsCode = readSafe(DTS)
const jsCode = readSafe(JS)

// 2. tsconfig.paymentService.json 配置
const tsconfig = readSafe(path.join(ROOT, 'tsconfig.paymentService.json'))
let tsconfigIncludeOk = false
if (tsconfig) {
  try {
    const cfg = JSON.parse(tsconfig)
    tsconfigIncludeOk = Array.isArray(cfg.include) && cfg.include.includes('cloudfunctions/paymentService/services/commission.ts')
  } catch (e) {
    check('tsconfig.paymentService.json 是合法 JSON', false, e.message)
  }
}
check('tsconfig.paymentService.json include commission.ts', tsconfigIncludeOk)

// 3. build-payment-service.js
const buildScript = readSafe(path.join(ROOT, 'scripts', 'build-payment-service.js'))
check('scripts/build-payment-service.js 存在', Boolean(buildScript))
check('build-payment-service.js TARGETS 包含 commission.js', /commission\.js/.test(buildScript || ''))

// 4. package.json 注册
const pkg = readSafe(path.join(ROOT, 'package.json'))
let pkgOk = false
if (pkg) {
  try {
    const cfg = JSON.parse(pkg)
    pkgOk = true
    check('package.json 注册 audit:s27-payment-commission-ts', Boolean(cfg.scripts['audit:s27-payment-commission-ts']))
    check('package.json 注册 audit:s27-payment-commission-ts:strict', Boolean(cfg.scripts['audit:s27-payment-commission-ts:strict']))
    check('package.json ci:check 包含 audit:s27-payment-commission-ts:strict', /audit:s27-payment-commission-ts:strict/.test(cfg.scripts['ci:check'] || ''))
  } catch (e) {
    check('package.json 是合法 JSON', false, e.message)
  }
}
check('package.json 解析正常', pkgOk)

// 5. commission.ts 内容
check('commission.ts 强类型化 CommissionOrderType', /export\s+type\s+CommissionOrderType\b/.test(tsCode || ''))
check('commission.ts 强类型化 CommissionOrderDoc', /export\s+interface\s+CommissionOrderDoc\b/.test(tsCode || ''))
check('commission.ts 强类型化 CommissionConfig', /export\s+interface\s+CommissionConfig\b/.test(tsCode || ''))
check('commission.ts 强类型化 CommissionRecordPayload', /export\s+interface\s+CommissionRecordPayload\b/.test(tsCode || ''))
check('commission.ts 包含 createCommissionRecord handler', /export\s+(async\s+)?function\s+createCommissionRecord\b/.test(tsCode || ''))
check('commission.ts 默认导出 createCommissionRecord', /export\s+default\s+createCommissionRecord/.test(tsCode || ''))
check('commission.ts 引用 generateId 工具', /generateId/.test(tsCode || ''))
check('commission.ts 写入 tuan_commissions 集合', /tuan_commissions/.test(tsCode || ''))
check('commission.ts 读取 system_config.commission_rates', /system_config.*commission_rates|commission_rates.*system_config/s.test(tsCode || ''))
check('commission.ts 幂等检查（orderId + inviterId）', /orderId[\s\S]{0,80}inviterId[\s\S]{0,80}count|count[\s\S]{0,80}orderId[\s\S]{0,80}inviterId/.test(tsCode || ''))
check('commission.ts 错误处理使用 catch (error: unknown)', /catch\s*\(\s*\w+\s*:\s*unknown\s*\)/.test(tsCode || ''))
check('commission.ts 注释包含 "Sprint 27"', /Sprint\s*27/.test(tsCode || ''))

// 6. pay.ts / notify.ts 使用解构风格 require commission
const payTs = readSafe(path.join(ROOT, 'cloudfunctions', 'paymentService', 'services', 'pay.ts'))
const notifyTs = readSafe(path.join(ROOT, 'cloudfunctions', 'paymentService', 'services', 'notify.ts'))
check('pay.ts 使用解构风格 require commission',
  /const\s*\{[^}]*createCommissionRecord[^}]*\}\s*=\s*require\(['"]\.\/commission['"]\)/.test(payTs || ''))
check('notify.ts 使用解构风格 require commission',
  /const\s*\{[^}]*createCommissionRecord[^}]*\}\s*=\s*require\(['"]\.\/commission['"]\)/.test(notifyTs || ''))

// 7. 测试存在
const migrationTest = path.join(ROOT, 'test', 'payment-service-commission-ts-migration.test.js')
check('测试 payment-service-commission-ts-migration.test.js 存在', fs.existsSync(migrationTest))

// 8. 严格模式
if (STRICT) {
  // 8.1 tsc --noEmit
  try {
    execSync('npx --yes -p typescript@5.4.5 tsc --noEmit -p tsconfig.paymentService.json', { cwd: ROOT, stdio: 'pipe' })
    check('tsc --noEmit 严格模式通过', true)
  } catch (e) {
    const msg = e.stderr ? e.stderr.toString().split('\n').slice(0, 5).join(' / ') : e.message
    check('tsc --noEmit 严格模式通过', false, msg)
  }

  // 8.2 commission.d.ts 至少 1 处 export declare function
  if (dtsCode) {
    const matches = dtsCode.match(/export\s+declare\s+function/g) || []
    check(`commission.d.ts 含 1+ 处 export declare function（实际 ${matches.length}）`, matches.length >= 1)
  } else {
    check('commission.d.ts 含 1+ 处 export declare function', false, 'd.ts 文件不存在')
  }

  // 8.3 commission.js 头部含 eslint-disable 标记
  if (jsCode) {
    check('commission.js 头部包含 eslint-disable 标记（构建产物）', jsCode.startsWith('/* eslint-disable'))
  } else {
    check('commission.js 头部包含 eslint-disable 标记（构建产物）', false, 'js 文件不存在')
  }

  // 8.4 commission.js 导出 createCommissionRecord
  if (jsCode) {
    check('commission.js 导出 createCommissionRecord',
      /exports\.(createCommissionRecord|default)/.test(jsCode))
    check('commission.js 引用 generateId 工具',
      /generateId/.test(jsCode))
  } else {
    check('commission.js 静态可解析', false, 'js 文件不存在')
  }
}

// 总结
console.log()
console.log(`[${failed === 0 ? 'PASS' : 'FAIL'}] ${checks.length - failed}/${checks.length} 项通过`)
if (failed > 0) { process.exit(1) }
