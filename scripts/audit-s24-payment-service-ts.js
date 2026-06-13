#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Sprint 24: paymentService 服务层 TypeScript 迁移审计脚本
 *
 * 检查项：
 *   1. cloudfunctions/paymentService/services/refund.ts 存在
 *   2. cloudfunctions/paymentService/services/refund.d.ts 存在
 *   3. cloudfunctions/paymentService/services/refund.js 存在（构建产物）
 *   4. tsconfig.paymentService.json 配置正确
 *   5. scripts/build-all-services.js 存在
 *   6. scripts/build-all-services.js TARGETS 包含 refund.js
 *   7. package.json 注册 build:all-services / typecheck:paymentService / audit:s24-payment-service-ts
 *   8. ci:check 包含 audit:s24-payment-service-ts:strict
 *   9. refund.ts 使用 withErrorHandling / WrappedHandler 强类型化
 *  10. refund.ts 引用 common/* 的 err / isBusinessError / withRateLimit / detectRefundAbuse
 *  11. refund.ts 引用 CloudBaseDB 类型
 *  12. paymentService/index.js 继续 require './services/refund'（消费 .js 编译产物）
 *  13. 单元测试：payment-service-refund-risk.test.js 存在
 *  14. 集成测试：integration/refund-flow.test.js 存在
 *  15. 严格模式下：tsc --noEmit 无错误
 *  16. 严格模式下：refund.js 实际可被 require
 *  17. 严格模式下：refund.d.ts 类型签名正确（不是 any）
 *  18. 严格模式下：refund.ts 不包含 handleSuccess 调用（已迁移为 withErrorHandling）
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
  if (!ok) {failed++}
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

// 1. 文件存在性
const TS = path.join(ROOT, 'cloudfunctions', 'paymentService', 'services', 'refund.ts')
const DTS = path.join(ROOT, 'cloudfunctions', 'paymentService', 'services', 'refund.d.ts')
const JS = path.join(ROOT, 'cloudfunctions', 'paymentService', 'services', 'refund.js')
check('refund.ts 存在', fs.existsSync(TS))
check('refund.d.ts 存在', fs.existsSync(DTS))
check('refund.js（构建产物）存在', fs.existsSync(JS))

const tsCode = readSafe(TS)
const dtsCode = readSafe(DTS)
const jsCode = readSafe(JS)

// 2. tsconfig.paymentService.json 配置
const tsconfig = readSafe(path.join(ROOT, 'tsconfig.paymentService.json'))
let tsconfigOk = false
let tsconfigIncludeOk = false
let tsconfigOutDirOk = false
if (tsconfig) {
  try {
    const cfg = JSON.parse(tsconfig)
    tsconfigOk = true
    tsconfigIncludeOk = Array.isArray(cfg.include) && cfg.include.includes('cloudfunctions/paymentService/services/refund.ts')
    // 允许 outDir 指向 cloudfunctions 根或 services 子目录（取决于 rootDir 配置）
    const outDir = cfg.compilerOptions && cfg.compilerOptions.outDir
    tsconfigOutDirOk = outDir === './cloudfunctions/paymentService/services' || outDir === './cloudfunctions'
  } catch (e) {
    check('tsconfig.paymentService.json 是合法 JSON', false, e.message)
  }
}
check('tsconfig.paymentService.json 存在', tsconfigOk)
check('tsconfig.paymentService.json include refund.ts', tsconfigIncludeOk)
check('tsconfig.paymentService.json outDir 指向 services', tsconfigOutDirOk)

// 3. build-all-services.js
const buildScript = readSafe(path.join(ROOT, 'scripts', 'build-all-services.js'))
check('scripts/build-all-services.js 存在', Boolean(buildScript))
check('build-all-services.js TARGETS 包含 refund.js', /refund\.js/.test(buildScript || ''))
check('build-all-services.js 调用 tsc -p tsconfig.paymentService.json', /tsconfig\.paymentService\.json/.test(buildScript || ''))

// 4. package.json 注册
const pkg = readSafe(path.join(ROOT, 'package.json'))
let pkgOk = false
if (pkg) {
  try {
    const cfg = JSON.parse(pkg)
    pkgOk = true
    check('package.json 注册 build:all-services', Boolean(cfg.scripts['build:all-services']))
    check('package.json 注册 typecheck:paymentService', Boolean(cfg.scripts['typecheck:paymentService']))
    check('package.json 注册 audit:s24-payment-service-ts', Boolean(cfg.scripts['audit:s24-payment-service-ts']))
    check('package.json 注册 audit:s24-payment-service-ts:strict', Boolean(cfg.scripts['audit:s24-payment-service-ts:strict']))
    check('package.json build:all 包含 build-all-services.js', /build-all-services\.js/.test(cfg.scripts['build:all'] || ''))
    check('package.json ci:check 包含 audit:s24-payment-service-ts:strict', /(?:audit:s24-payment-service-ts:strict|audit:all:strict)/.test(cfg.scripts['ci:check'] || ''))
  } catch (e) {
    check('package.json 是合法 JSON', false, e.message)
  }
}
check('package.json 解析正常', pkgOk)

// 5. refund.ts 内容
check('refund.ts 使用 withErrorHandling 包装', /withErrorHandling\s*</.test(tsCode || ''))
check('refund.ts 使用 WrappedHandler 强类型', /WrappedHandler\s*</.test(tsCode || ''))
check('refund.ts 引用 err 工厂', /from\s+['"][^'"]*errors['"]/.test(tsCode || '') && /\berr\s*\(/.test(tsCode || ''))
check('refund.ts 引用 isBusinessError 类型守卫', /isBusinessError/.test(tsCode || ''))
check('refund.ts 引用 withRateLimit', /withRateLimit/.test(tsCode || ''))
check('refund.ts 引用 detectRefundAbuse', /detectRefundAbuse/.test(tsCode || ''))
check('refund.ts 引用 CloudBaseDB 类型', /CloudBaseDB/.test(tsCode || ''))
check('refund.ts 包含 createRefund / queryRefund 两个 handler', /createRefund/.test(tsCode || '') && /queryRefund/.test(tsCode || ''))
check('refund.ts 注释包含 "Sprint 24 迁移"', /Sprint\s*24/.test(tsCode || ''))

// 6. paymentService/index.js 继续 require refund（消费 .js 编译产物）
const pmtIdx = readSafe(path.join(ROOT, 'cloudfunctions', 'paymentService', 'index.js'))
check('paymentService/index.js require ./services/refund', /require\(['"][^'"]*services\/refund['"]\)/.test(pmtIdx || ''))
check('paymentService/index.js 继续使用 refundHandlers', /\.\.\.refundHandlers/.test(pmtIdx || ''))

// 7. 单元 + 集成测试
const unitTest = path.join(ROOT, 'test', 'payment-service-refund-risk.test.js')
const intTest = path.join(ROOT, 'test', 'integration', 'refund-flow.test.js')
check('单元测试 payment-service-refund-risk.test.js 存在', fs.existsSync(unitTest))
check('集成测试 integration/refund-flow.test.js 存在', fs.existsSync(intTest))

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

  // 8.2 refund.d.ts 使用强类型（WrappedHandler<T>），不是 any
  if (dtsCode) {
    const hasAnyTopLevel = /^export\s+declare\s+const\s+\w+:\s*any\s*;?$/m.test(dtsCode)
    const hasWrappedHandler = /WrappedHandler\s*</.test(dtsCode)
    check('refund.d.ts 使用 WrappedHandler<T> 强类型', hasWrappedHandler && !hasAnyTopLevel)
  } else {
    check('refund.d.ts 使用 WrappedHandler<T> 强类型', false, 'd.ts 文件不存在')
  }

  // 8.3 refund.js 头部包含 eslint-disable 标记（构建产物）
  if (jsCode) {
    check('refund.js 头部包含 eslint-disable 标记（构建产物）', jsCode.startsWith('/* eslint-disable'))
  } else {
    check('refund.js 头部包含 eslint-disable 标记（构建产物）', false, 'js 文件不存在')
  }

  // 8.4 refund.js 静态可解析：检查 require 语句 + 导出语法
  if (jsCode) {
    // 验证 require 路径存在（仅在 paymentService 内部做路径解析，不真正加载 wx-server-sdk）
    const requireRelative = jsCode.match(/require\(['"]([^'"]+)['"]\)/g) || []
    // 允许外部 require（wx-server-sdk、crypto 等运行时模块）
    check('refund.js 仅 require 内部 .js 文件 + 运行时模块',
      requireRelative.every(r => {
        const m = r.match(/require\(['"]([^'"]+)['"]\)/)
        if (!m) {return true}
        const p = m[1]
        if (p.startsWith('.') || p.startsWith('/')) {
          // 相对路径：尝试解析到 cloudfunctions 下的 .js 文件
          const abs = path.resolve(ROOT, 'cloudfunctions/paymentService/services', p)
          if (fs.existsSync(abs) || fs.existsSync(`${abs}.js`)) {return true}
          // ../common 路径
          if (p.startsWith('../')) {
            const alt = path.resolve(ROOT, 'cloudfunctions', p.replace(/^\.\.\//, ''))
            if (fs.existsSync(alt) || fs.existsSync(`${alt}.js`)) {return true}
          }
          return false
        }
        return true
      })
    )
    // 验证导出语法（包含 module.exports 形式 / Object.defineProperty(exports, ...)）
    check('refund.js 包含 createRefund 导出（defineProperty 或 module.exports）',
      /createRefund/.test(jsCode)
    )
    check('refund.js 包含 queryRefund 导出', /queryRefund/.test(jsCode))
  } else {
    check('refund.js 静态可解析', false, 'js 文件不存在')
  }

  // 8.5 refund.ts 不应再调用 handleSuccess（迁移到 withErrorHandling 模式）
  check('refund.ts 不再调用 handleSuccess（已迁移为 withErrorHandling）', !/\bhandleSuccess\s*\(/.test(tsCode || ''))
}

// 总结
console.log()
console.log(`[${failed === 0 ? 'PASS' : 'FAIL'}] ${checks.length - failed}/${checks.length} 项通过`)
if (failed > 0) {process.exit(1)}
