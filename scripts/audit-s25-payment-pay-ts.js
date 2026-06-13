#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Sprint 25: paymentService/pay TypeScript 迁移审计脚本
 *
 * 检查项：
 *   1. cloudfunctions/paymentService/services/pay.ts 存在
 *   2. cloudfunctions/paymentService/services/pay.d.ts 存在
 *   3. cloudfunctions/paymentService/services/pay.js 存在（构建产物）
 *   4. tsconfig.paymentService.json include 包含 pay.ts
 *   5. scripts/build-all-services.js TARGETS 包含 pay.js
 *   6. package.json 注册 audit:s25-payment-pay-ts + strict
 *   7. pay.ts 包含 4 个 handler：createPayment / queryPayment / closePayment / confirmPayment
 *   8. pay.ts 使用 WrappedHandler 强类型化
 *   9. pay.ts 引用 withRateLimit
 *  10. pay.ts 引用 CloudBaseDB 类型
 *  11. pay.ts 不再调用 handleSuccess（已迁移为 withErrorHandling）
 *  12. paymentService/index.js 继续 require './services/pay'
 *  13. 单元测试：payment-order-rate-limit.test.js 存在
 *  14. 迁移测试：payment-service-pay-ts-migration.test.js 存在
 *  15. 严格模式下：tsc --noEmit 无错误
 *  16. 严格模式下：pay.d.ts 至少 4 处 WrappedHandler<T>
 *  17. 严格模式下：pay.js 头部含 eslint-disable 标记
 *  18. 严格模式下：pay.js require 路径在 cloudfunctions 内部可解析
 *  19. 严格模式下：pay.js 导出全部 4 个 handler
 *
 * 退出码：
 *   0 = 全部通过
 *   1 = 至少 1 项不通过
 *  --strict：额外执行 tsc 编译 + runtime 校验
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
const TS = path.join(ROOT, 'cloudfunctions', 'paymentService', 'services', 'pay.ts')
const DTS = path.join(ROOT, 'cloudfunctions', 'paymentService', 'services', 'pay.d.ts')
const JS = path.join(ROOT, 'cloudfunctions', 'paymentService', 'services', 'pay.js')
check('pay.ts 存在', fs.existsSync(TS))
check('pay.d.ts 存在', fs.existsSync(DTS))
check('pay.js（构建产物）存在', fs.existsSync(JS))

const tsCode = readSafe(TS)
const dtsCode = readSafe(DTS)
const jsCode = readSafe(JS)

// 2. tsconfig.paymentService.json 配置
const tsconfig = readSafe(path.join(ROOT, 'tsconfig.paymentService.json'))
let tsconfigIncludeOk = false
if (tsconfig) {
  try {
    const cfg = JSON.parse(tsconfig)
    tsconfigIncludeOk = Array.isArray(cfg.include) && cfg.include.includes('cloudfunctions/paymentService/services/pay.ts')
  } catch (e) {
    check('tsconfig.paymentService.json 是合法 JSON', false, e.message)
  }
}
check('tsconfig.paymentService.json include pay.ts', tsconfigIncludeOk)

// 3. build-all-services.js
const buildScript = readSafe(path.join(ROOT, 'scripts', 'build-all-services.js'))
check('scripts/build-all-services.js 存在', Boolean(buildScript))
check('build-all-services.js TARGETS 包含 pay.js', /pay\.js/.test(buildScript || ''))

// 4. package.json 注册
const pkg = readSafe(path.join(ROOT, 'package.json'))
let pkgOk = false
if (pkg) {
  try {
    const cfg = JSON.parse(pkg)
    pkgOk = true
    check('package.json 注册 audit:s25-payment-pay-ts', Boolean(cfg.scripts['audit:s25-payment-pay-ts']))
    check('package.json 注册 audit:s25-payment-pay-ts:strict', Boolean(cfg.scripts['audit:s25-payment-pay-ts:strict']))
    check('package.json ci:check 包含 audit:s25-payment-pay-ts:strict', /(?:audit:s25-payment-pay-ts:strict|audit:all:strict)/.test(cfg.scripts['ci:check'] || ''))
  } catch (e) {
    check('package.json 是合法 JSON', false, e.message)
  }
}
check('package.json 解析正常', pkgOk)

// 5. pay.ts 内容
check('pay.ts 包含 createPayment handler', /export\s+const\s+createPayment\b/.test(tsCode || ''))
check('pay.ts 包含 queryPayment handler', /export\s+const\s+queryPayment\b/.test(tsCode || ''))
check('pay.ts 包含 closePayment handler', /export\s+const\s+closePayment\b/.test(tsCode || ''))
check('pay.ts 包含 confirmPayment handler', /export\s+const\s+confirmPayment\b/.test(tsCode || ''))
check('pay.ts 使用 withErrorHandling 包装', /withErrorHandling\s*</.test(tsCode || ''))
check('pay.ts 使用 WrappedHandler 强类型', /WrappedHandler\s*</.test(tsCode || ''))
check('pay.ts 引用 err 工厂', /from\s+['"][^'"]*errors['"]/.test(tsCode || '') && /\berr\s*\(/.test(tsCode || ''))
check('pay.ts 引用 isBusinessError 类型守卫', /isBusinessError/.test(tsCode || ''))
check('pay.ts 引用 withRateLimit', /withRateLimit/.test(tsCode || ''))
check('pay.ts 引用 CloudBaseDB 类型', /CloudBaseDB/.test(tsCode || ''))
check('pay.ts 注释包含 "Sprint 25"', /Sprint\s*25/.test(tsCode || ''))

// 6. paymentService/index.js 兼容
const pmtIdx = readSafe(path.join(ROOT, 'cloudfunctions', 'paymentService', 'index.js'))
check('paymentService/index.js require ./services/pay', /require\(['"][^'"]*services\/pay['"]\)/.test(pmtIdx || ''))

// 7. 测试存在
const rateLimitTest = path.join(ROOT, 'test', 'payment-order-rate-limit.test.js')
const migrationTest = path.join(ROOT, 'test', 'payment-service-pay-ts-migration.test.js')
check('测试 payment-order-rate-limit.test.js 存在', fs.existsSync(rateLimitTest))
check('测试 payment-service-pay-ts-migration.test.js 存在', fs.existsSync(migrationTest))

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

  // 8.2 pay.d.ts 至少 4 处 WrappedHandler<T>
  if (dtsCode) {
    const matches = dtsCode.match(/WrappedHandler\s*</g) || []
    check(`pay.d.ts 含 4+ 处 WrappedHandler<T>（实际 ${matches.length}）`, matches.length >= 4)
  } else {
    check('pay.d.ts 含 4+ 处 WrappedHandler<T>', false, 'd.ts 文件不存在')
  }

  // 8.3 pay.js 头部含 eslint-disable 标记
  if (jsCode) {
    check('pay.js 头部包含 eslint-disable 标记（构建产物）', jsCode.startsWith('/* eslint-disable'))
  } else {
    check('pay.js 头部包含 eslint-disable 标记（构建产物）', false, 'js 文件不存在')
  }

  // 8.4 pay.js require 路径可解析
  if (jsCode) {
    const requireRelative = jsCode.match(/require\(['"]([^'"]+)['"]\)/g) || []
    check('pay.js 仅 require 内部 .js 文件 + 运行时模块',
      requireRelative.every(r => {
        const m = r.match(/require\(['"]([^'"]+)['"]\)/)
        if (!m) { return true }
        const p = m[1]
        if (p.startsWith('.') || p.startsWith('/')) {
          const abs = path.resolve(ROOT, 'cloudfunctions/paymentService/services', p)
          if (fs.existsSync(abs) || fs.existsSync(`${abs}.js`)) { return true }
          if (p.startsWith('../')) {
            const alt = path.resolve(ROOT, 'cloudfunctions', p.replace(/^\.\.\//, ''))
            if (fs.existsSync(alt) || fs.existsSync(`${alt}.js`)) { return true }
          }
          return false
        }
        return true
      })
    )

    // 8.5 pay.js 包含全部 4 个 handler
    check('pay.js 包含 createPayment', /createPayment/.test(jsCode))
    check('pay.js 包含 queryPayment', /queryPayment/.test(jsCode))
    check('pay.js 包含 closePayment', /closePayment/.test(jsCode))
    check('pay.js 包含 confirmPayment', /confirmPayment/.test(jsCode))
  } else {
    check('pay.js 静态可解析', false, 'js 文件不存在')
  }

  // 8.6 pay.ts 不再调用 handleSuccess
  check('pay.ts 不再调用 handleSuccess（已迁移为 withErrorHandling）', !/\bhandleSuccess\s*\(/.test(tsCode || ''))
}

// 总结
console.log()
console.log(`[${failed === 0 ? 'PASS' : 'FAIL'}] ${checks.length - failed}/${checks.length} 项通过`)
if (failed > 0) { process.exit(1) }
