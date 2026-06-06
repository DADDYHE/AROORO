#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Sprint 26: paymentService/notify TypeScript 迁移审计脚本
 *
 * 检查项：
 *   1. cloudfunctions/paymentService/services/notify.ts 存在
 *   2. cloudfunctions/paymentService/services/notify.d.ts 存在
 *   3. cloudfunctions/paymentService/services/notify.js 存在（构建产物）
 *   4. tsconfig.paymentService.json include 包含 notify.ts
 *   5. scripts/build-payment-service.js TARGETS 包含 notify.js
 *   6. package.json 注册 audit:s26-payment-notify-ts + strict
 *   7. notify.ts 强类型化事件 / 头 / 资源 / 订单信息
 *   8. notify.ts 使用 HTTP 响应结构（{statusCode, body}）而非 withErrorHandling
 *   9. notify.ts 引用 err 工厂（参数校验时）
 *  10. notify.ts 实现签名验证（RSA-SHA256）
 *  11. notify.ts 实现 AES-256-GCM 解密
 *  12. notify.ts 触发 commission（commission.js 兼容接口）
 *  13. paymentService/index.js 继续 require './services/notify'（消费 .js 编译产物）
 *  14. 测试存在（jest 迁移测试 + 单元测试）
 *  15. 严格模式下：tsc --noEmit 无错误
 *  16. 严格模式下：notify.d.ts 至少 1 处 Promise<NotifyHttpResponse>
 *  17. 严格模式下：notify.js 头部含 eslint-disable 标记
 *  18. 严格模式下：notify.js require 路径在 cloudfunctions 内部可解析
 *  19. 严格模式下：notify.js 导出 paymentNotify
 *  20. 严格模式下：notify.ts 包含 trade_state === 'SUCCESS' 状态机分支
 *  21. 严格模式下：notify.ts 幂等保护（已 paid 直接返回）
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
const TS = path.join(ROOT, 'cloudfunctions', 'paymentService', 'services', 'notify.ts')
const DTS = path.join(ROOT, 'cloudfunctions', 'paymentService', 'services', 'notify.d.ts')
const JS = path.join(ROOT, 'cloudfunctions', 'paymentService', 'services', 'notify.js')
check('notify.ts 存在', fs.existsSync(TS))
check('notify.d.ts 存在', fs.existsSync(DTS))
check('notify.js（构建产物）存在', fs.existsSync(JS))

const tsCode = readSafe(TS)
const dtsCode = readSafe(DTS)
const jsCode = readSafe(JS)

// 2. tsconfig.paymentService.json 配置
const tsconfig = readSafe(path.join(ROOT, 'tsconfig.paymentService.json'))
let tsconfigIncludeOk = false
if (tsconfig) {
  try {
    const cfg = JSON.parse(tsconfig)
    tsconfigIncludeOk = Array.isArray(cfg.include) && cfg.include.includes('cloudfunctions/paymentService/services/notify.ts')
  } catch (e) {
    check('tsconfig.paymentService.json 是合法 JSON', false, e.message)
  }
}
check('tsconfig.paymentService.json include notify.ts', tsconfigIncludeOk)

// 3. build-payment-service.js
const buildScript = readSafe(path.join(ROOT, 'scripts', 'build-payment-service.js'))
check('scripts/build-payment-service.js 存在', Boolean(buildScript))
check('build-payment-service.js TARGETS 包含 notify.js', /notify\.js/.test(buildScript || ''))

// 4. package.json 注册
const pkg = readSafe(path.join(ROOT, 'package.json'))
let pkgOk = false
if (pkg) {
  try {
    const cfg = JSON.parse(pkg)
    pkgOk = true
    check('package.json 注册 audit:s26-payment-notify-ts', Boolean(cfg.scripts['audit:s26-payment-notify-ts']))
    check('package.json 注册 audit:s26-payment-notify-ts:strict', Boolean(cfg.scripts['audit:s26-payment-notify-ts:strict']))
    check('package.json ci:check 包含 audit:s26-payment-notify-ts:strict', /audit:s26-payment-notify-ts:strict/.test(cfg.scripts['ci:check'] || ''))
  } catch (e) {
    check('package.json 是合法 JSON', false, e.message)
  }
}
check('package.json 解析正常', pkgOk)

// 5. notify.ts 内容
check('notify.ts 包含 paymentNotify handler', /export\s+async\s+function\s+paymentNotify\b/.test(tsCode || ''))
check('notify.ts 强类型化 NotifyEvent', /interface\s+NotifyEvent\b/.test(tsCode || ''))
check('notify.ts 强类型化 NotifyHeaders', /interface\s+NotifyHeaders\b/.test(tsCode || ''))
check('notify.ts 强类型化 NotifyResource', /interface\s+NotifyResource\b/.test(tsCode || ''))
check('notify.ts 强类型化 NotifyOrderInfo', /interface\s+NotifyOrderInfo\b/.test(tsCode || ''))
check('notify.ts 定义 NotifyHttpResponse', /interface\s+NotifyHttpResponse\b/.test(tsCode || ''))
check('notify.ts 不使用 withErrorHandling（HTTP 响应需保留原结构）',
  !/import\s*\{[^}]*withErrorHandling[^}]*\}\s*from/.test(tsCode || '') &&
  !/withErrorHandling\s*[<(]/.test(tsCode || ''))
check('notify.ts 引用 err 工厂', /from\s+['"][^'"]*errors['"]/.test(tsCode || '') && /\berr\s*\(/.test(tsCode || ''))
check('notify.ts 实现 AES-256-GCM 解密', /decryptAes256Gcm/.test(tsCode || '') || /aes-256-gcm/.test(tsCode || ''))
check('notify.ts 实现 RSA-SHA256 签名验证', /SHA256withRSA/.test(tsCode || '') || /createVerify/.test(tsCode || ''))
check('notify.ts 包含 trade_state === SUCCESS 分支', /trade_state\s*===\s*['"]SUCCESS['"]/.test(tsCode || ''))
check('notify.ts 包含幂等保护（paymentStatus === paid）', /paymentStatus\s*===\s*['"]paid['"]/.test(tsCode || ''))
check('notify.ts 触发 commission 记录（commission.js 接口）', /require\(['"]\.\/commission['"]\)/.test(tsCode || ''))
check('notify.ts 使用解构风格 require commission（与 pay.ts 一致）',
  /const\s*\{[^}]*createCommissionRecord[^}]*\}\s*=\s*require\(['"]\.\/commission['"]\)/.test(tsCode || ''))
check('notify.ts 注释包含 "Sprint 26"', /Sprint\s*26/.test(tsCode || ''))

// 6. paymentService/index.js 兼容
const pmtIdx = readSafe(path.join(ROOT, 'cloudfunctions', 'paymentService', 'index.js'))
check('paymentService/index.js require ./services/notify', /require\(['"][^'"]*services\/notify['"]\)/.test(pmtIdx || ''))
check('paymentService/index.js 继续使用 notifyHandlers', /\.\.\.notifyHandlers/.test(pmtIdx || ''))
check('paymentService/index.js NO_AUTH_ACTIONS 包含 paymentNotify', /NO_AUTH_ACTIONS.*paymentNotify/s.test(pmtIdx || ''))

// 7. 测试存在
const migrationTest = path.join(ROOT, 'test', 'payment-service-notify-ts-migration.test.js')
check('测试 payment-service-notify-ts-migration.test.js 存在', fs.existsSync(migrationTest))

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

  // 8.2 notify.d.ts 至少 1 处 Promise<NotifyHttpResponse>
  if (dtsCode) {
    const matches = dtsCode.match(/Promise\s*<\s*NotifyHttpResponse\s*>/g) || []
    check(`notify.d.ts 含 1+ 处 Promise<NotifyHttpResponse>（实际 ${matches.length}）`, matches.length >= 1)
  } else {
    check('notify.d.ts 含 1+ 处 Promise<NotifyHttpResponse>', false, 'd.ts 文件不存在')
  }

  // 8.3 notify.js 头部含 eslint-disable 标记
  if (jsCode) {
    check('notify.js 头部包含 eslint-disable 标记（构建产物）', jsCode.startsWith('/* eslint-disable'))
  } else {
    check('notify.js 头部包含 eslint-disable 标记（构建产物）', false, 'js 文件不存在')
  }

  // 8.4 notify.js require 路径可解析
  if (jsCode) {
    const requireRelative = jsCode.match(/require\(['"]([^'"]+)['"]\)/g) || []
    check('notify.js 仅 require 内部 .js 文件 + 运行时模块',
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

    // 8.5 notify.js 包含 paymentNotify
    check('notify.js 包含 paymentNotify', /paymentNotify/.test(jsCode))
  } else {
    check('notify.js 静态可解析', false, 'js 文件不存在')
  }
}

// 总结
console.log()
console.log(`[${failed === 0 ? 'PASS' : 'FAIL'}] ${checks.length - failed}/${checks.length} 项通过`)
if (failed > 0) { process.exit(1) }
