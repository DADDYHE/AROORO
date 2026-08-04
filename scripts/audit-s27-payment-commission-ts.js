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
 *   5. scripts/build-all-services.js TARGETS 包含 commission.js
 *   6. package.json 注册 audit:s27-payment-commission-ts + strict
 *   7. ci:check 包含 audit:s27-payment-commission-ts:strict
 *   8. commission.ts 委托公共写入器 common/commission-utils（写入器统一后）
 *   9. commission.ts 不内联业务逻辑（不直接读 system_config / 写 commissions）
 *  10. 公共写入器强类型化 4 个核心接口 + best-effort 错误处理（catch unknown）
 *  11. 公共写入器写入 commissions 集合、确定性 _id 幂等、含 RATE_KEY_ALIASES（P0 护栏）
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

// 3. build-all-services.js
const buildScript = readSafe(path.join(ROOT, 'scripts', 'build-all-services.js'))
check('scripts/build-all-services.js 存在', Boolean(buildScript))
check('build-all-services.js TARGETS 包含 commission.js', /commission\.js/.test(buildScript || ''))

// 4. package.json 注册
const pkg = readSafe(path.join(ROOT, 'package.json'))
let pkgOk = false
if (pkg) {
  try {
    const cfg = JSON.parse(pkg)
    pkgOk = true
    check('package.json 注册 audit:s27-payment-commission-ts', Boolean(cfg.scripts['audit:s27-payment-commission-ts']))
    check('package.json 注册 audit:s27-payment-commission-ts:strict', Boolean(cfg.scripts['audit:s27-payment-commission-ts:strict']))
    check('package.json ci:check 包含 audit:s27-payment-commission-ts:strict', /(?:audit:s27-payment-commission-ts:strict|audit:all:strict)/.test(cfg.scripts['ci:check'] || ''))
  } catch (e) {
    check('package.json 是合法 JSON', false, e.message)
  }
}
check('package.json 解析正常', pkgOk)

// 5. commission.ts 内容
//
// 写入器统一后（见 cloudfunctions/common/commission-utils.ts）：
//   commission.ts 退化为「薄委托层」，仅保留对外调用契约
//   （pay.ts / notify.ts 的 require('./commission') 不变），
//   全部业务逻辑收敛到公共写入器。
// 因此本节拆成两段：
//   5a. 委托层契约：必须委托、且不得内联业务逻辑
//   5b. 公共写入器：原 Sprint 27 的强类型 / 业务保障在新位置继续成立
check('commission.ts 包含 createCommissionRecord handler', /export\s+(async\s+)?function\s+createCommissionRecord\b/.test(tsCode || ''))
check('commission.ts 默认导出 createCommissionRecord', /export\s+default\s+createCommissionRecord/.test(tsCode || ''))

// 5a. 委托层契约
check('commission.ts 委托公共写入器 common/commission-utils',
  /from\s*['"]\.\.\/common\/commission-utils['"]/.test(tsCode || ''))
check('commission.ts 再导出 cancelCommissionRecord',
  /cancelCommissionRecord/.test(tsCode || ''))
check('commission.ts 不内联业务逻辑（不直接读 system_config / 不直接写 commissions 集合）',
  !/collection\(\s*['"]system_config['"]\s*\)/.test(tsCode || '')
  && !/collection\(\s*['"]commissions['"]\s*\)/.test(tsCode || ''))

// 5b. 公共写入器（Single Source of Truth）
const SHARED = path.join(ROOT, 'cloudfunctions', 'common', 'commission-utils.ts')
const sharedCode = readSafe(SHARED)
check('公共写入器 common/commission-utils.ts 存在', Boolean(sharedCode))
check('公共写入器 强类型化 CommissionOrderType', /export\s+type\s+CommissionOrderType\b/.test(sharedCode || ''))
check('公共写入器 强类型化 CommissionOrderDoc', /export\s+interface\s+CommissionOrderDoc\b/.test(sharedCode || ''))
check('公共写入器 强类型化 CommissionConfig', /export\s+interface\s+CommissionConfig\b/.test(sharedCode || ''))
check('公共写入器 强类型化 CommissionRecordPayload', /export\s+interface\s+CommissionRecordPayload\b/.test(sharedCode || ''))
check('公共写入器 写入 commissions 集合', /collection\(\s*['"]commissions['"]\s*\)/.test(sharedCode || ''))
check('公共写入器 读取 system_config.commission_rates',
  /system_config[\s\S]{0,200}commission_rates|commission_rates[\s\S]{0,200}system_config/.test(sharedCode || ''))
check('公共写入器 幂等检查（orderId + inviterId）',
  /orderId[\s\S]{0,120}inviterId[\s\S]{0,120}count|count[\s\S]{0,120}orderId[\s\S]{0,120}inviterId/.test(sharedCode || ''))
check('公共写入器 确定性 _id 兜底幂等（buildCommissionId）',
  /export\s+function\s+buildCommissionId\b/.test(sharedCode || ''))
check('公共写入器 错误处理使用 catch (error: unknown)',
  /catch\s*\(\s*\w+\s*:\s*unknown\s*\)/.test(sharedCode || ''))
// P0 回归护栏：寄养费率键别名（boarding/hosting/order）必须存在，
// 否则线上 system_config 用 hosting 键时寄养佣金会静默归零。
check('公共写入器 含费率键别名表 RATE_KEY_ALIASES（P0 回归护栏）',
  /export\s+const\s+RATE_KEY_ALIASES\b/.test(sharedCode || '')
  && /hosting/.test(sharedCode || ''))
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
    // 写入器统一后，commission.js 应为委托产物而非本地实现
    check('commission.js 委托公共写入器 common/commission-utils',
      /require\(\s*['"]\.\.\/common\/commission-utils['"]\s*\)/.test(jsCode))
  } else {
    check('commission.js 静态可解析', false, 'js 文件不存在')
  }
}

// 总结
console.log()
console.log(`[${failed === 0 ? 'PASS' : 'FAIL'}] ${checks.length - failed}/${checks.length} 项通过`)
if (failed > 0) { process.exit(1) }
