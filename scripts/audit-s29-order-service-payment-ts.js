#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Sprint 29: orderService/payment TypeScript 迁移审计脚本
 *
 * 检查项：
 *   1. cloudfunctions/orderService/payment.ts 存在
 *   2. cloudfunctions/orderService/payment.d.ts 存在
 *   3. cloudfunctions/orderService/payment.js 存在（构建产物）
 *   4. tsconfig.orderService.json include 包含 payment.ts
 *   5. scripts/build-order-service.js 包含 payment.js
 *   6. package.json 注册 audit:s29-order-service-payment-ts + strict
 *   7. ci:check 包含 audit:s29-order-service-payment-ts:strict
 *   8. payment.ts 强类型化微信支付配置/请求/响应（WechatPayConfig / WechatPayJsapiRequest / WechatPayJsapiResponse / WechatPayNotifyHeaders / WechatPayNotifyBody / WechatPayOrderInfo）
 *   9. payment.ts 包含 2 个 handler（wechatPay / wechatPayNotify）
 *  10. payment.ts 使用 isBusinessError 类型守卫
 *  11. payment.ts 使用 catch (error: unknown) 模式
 *  12. payment.ts Runtime shim 修复 CommonJS 导出
 *  13. payment.ts 包含 @deprecated 标记
 *  14. payment.ts wechatPayNotify 返回 NotifyHttpResponse
 *  15. payment.ts 包含 withErrorHandling 包装（仅 wechatPay）
 *  16. payment.ts 包含 err() 工厂导入
 *  17. payment.ts 引用 WECHAT_PAY config
 *  18. payment.ts 包含解密函数（decryptAes256Gcm）
 *  19. stats.js 暂未迁移（Sprint 30 计划）
 *  20. jest 测试 order-service-payment-ts-migration.test.js 存在
 *  21-25. (strict) tsc --noEmit + .d.ts 2+ declare function + eslint-disable 头 + require 路径可解析 + shim 存在
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
const TS = path.join(ROOT, 'cloudfunctions', 'orderService', 'payment.ts')
const DTS = path.join(ROOT, 'cloudfunctions', 'orderService', 'payment.d.ts')
const JS = path.join(ROOT, 'cloudfunctions', 'orderService', 'payment.js')
check('payment.ts 存在', fs.existsSync(TS))
check('payment.d.ts 存在', fs.existsSync(DTS))
check('payment.js（构建产物）存在', fs.existsSync(JS))

const tsCode = readSafe(TS)
const dtsCode = readSafe(DTS)
const jsCode = readSafe(JS)

// 2. tsconfig.orderService.json 配置
const tsconfig = readSafe(path.join(ROOT, 'tsconfig.orderService.json'))
let tsconfigIncludeOk = false
if (tsconfig) {
  try {
    const cfg = JSON.parse(tsconfig)
    tsconfigIncludeOk = Array.isArray(cfg.include) && cfg.include.includes('cloudfunctions/orderService/payment.ts')
  } catch (e) {
    check('tsconfig.orderService.json 是合法 JSON', false, e.message)
  }
}
check('tsconfig.orderService.json include payment.ts', tsconfigIncludeOk)

// 3. build-order-service.js
const buildScript = readSafe(path.join(ROOT, 'scripts', 'build-order-service.js'))
check('scripts/build-order-service.js 存在', Boolean(buildScript))
check('build-order-service.js 包含 payment.js', /payment\.js/.test(buildScript || ''))

// 4. package.json 注册
const pkg = readSafe(path.join(ROOT, 'package.json'))
let pkgOk = false
if (pkg) {
  try {
    const cfg = JSON.parse(pkg)
    pkgOk = true
    check('package.json 注册 audit:s29-order-service-payment-ts', Boolean(cfg.scripts['audit:s29-order-service-payment-ts']))
    check('package.json 注册 audit:s29-order-service-payment-ts:strict', Boolean(cfg.scripts['audit:s29-order-service-payment-ts:strict']))
    check('package.json ci:check 包含 audit:s29-order-service-payment-ts:strict',
      /audit:s29-order-service-payment-ts:strict/.test(cfg.scripts['ci:check'] || ''))
  } catch (e) {
    check('package.json 是合法 JSON', false, e.message)
  }
}
check('package.json 解析正常', pkgOk)

// 5. payment.ts 内容
check('payment.ts 注释包含 "Sprint 29 迁移"', /Sprint\s*29/.test(tsCode || ''))
check('payment.ts 包含 @deprecated 标记', /@deprecated/.test(tsCode || ''))
check('payment.ts 强类型化 WechatPayConfig', /interface\s+WechatPayConfig\b/.test(tsCode || ''))
check('payment.ts 强类型化 WechatPayJsapiRequest', /interface\s+WechatPayJsapiRequest\b/.test(tsCode || ''))
check('payment.ts 强类型化 WechatPayJsapiResponse', /interface\s+WechatPayJsapiResponse\b/.test(tsCode || ''))
check('payment.ts 强类型化 WechatPayNotifyHeaders', /interface\s+WechatPayNotifyHeaders\b/.test(tsCode || ''))
check('payment.ts 强类型化 WechatPayNotifyBody', /interface\s+WechatPayNotifyBody\b/.test(tsCode || ''))
check('payment.ts 强类型化 WechatPayOrderInfo', /interface\s+WechatPayOrderInfo\b/.test(tsCode || ''))
check('payment.ts 强类型化 WechatPayClientParams', /interface\s+WechatPayClientParams\b/.test(tsCode || ''))
check('payment.ts 强类型化 WechatPayClientData', /interface\s+WechatPayClientData\b/.test(tsCode || ''))
check('payment.ts 强类型化 NotifyHttpResponse', /type\s+NotifyHttpResponse\b/.test(tsCode || ''))

check('payment.ts 包含 2 个 handler（export async function）',
  (tsCode?.match(/export\s+async\s+function\s+/g) || []).length >= 2)
check('payment.ts wechatPay 函数导出', /export\s+async\s+function\s+wechatPay\b/.test(tsCode || ''))
check('payment.ts wechatPayNotify 函数导出', /export\s+async\s+function\s+wechatPayNotify\b/.test(tsCode || ''))
check('payment.ts 使用 isBusinessError 类型守卫',
  /isBusinessError\(/.test(tsCode || ''))
check('payment.ts 使用 catch (error: unknown) 模式',
  /catch\s*\(\s*\w+\s*:\s*unknown\s*\)/.test(tsCode || ''))
check('payment.ts Runtime shim 修复 CommonJS 导出',
  /_mod\.exports\s*=\s*_handlers/.test(tsCode || ''))
check('payment.ts 包含 withErrorHandling 包装（仅 wechatPay）',
  /withErrorHandling\(wechatPay\)/.test(tsCode || ''))
check('payment.ts wechatPayNotify 不通过 withErrorHandling 包装',
  !/withErrorHandling\(wechatPayNotify\)/.test(tsCode || ''))
check('payment.ts 包含 err() 工厂导入',
  /require\(['"][^'"]*errors['"]\)/.test(tsCode || ''))
check('payment.ts 引用 WECHAT_PAY config',
  /WECHAT_PAY/.test(tsCode || ''))
check('payment.ts 包含解密函数（decryptAes256Gcm）',
  /function\s+decryptAes256Gcm\b/.test(tsCode || ''))
check('payment.ts 包含签名函数（rsaSign）',
  /function\s+rsaSign\b/.test(tsCode || ''))
check('payment.ts 包含 Authorization 函数',
  /function\s+generateAuthorization\b/.test(tsCode || ''))

// 6. stats.ts 状态（Sprint 30 已迁移）
const statsTs = path.join(ROOT, 'cloudfunctions', 'orderService', 'stats.ts')
check('stats.ts 已迁移（Sprint 30 完成）', fs.existsSync(statsTs))

// 7. 测试存在
const migrationTest = path.join(ROOT, 'test', 'order-service-payment-ts-migration.test.js')
check('测试 order-service-payment-ts-migration.test.js 存在', fs.existsSync(migrationTest))

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

  // 8.2 payment.d.ts 至少 2 处 export declare function
  if (dtsCode) {
    const matches = dtsCode.match(/export\s+declare\s+function/g) || []
    check(`payment.d.ts 含 2+ 处 export declare function（实际 ${matches.length}）`, matches.length >= 2)
  } else {
    check('payment.d.ts 含 2+ 处 export declare function', false, 'd.ts 文件不存在')
  }

  // 8.3 payment.js 头部含 eslint-disable 标记
  if (jsCode) {
    check('payment.js 头部包含 eslint-disable 标记（构建产物）', jsCode.startsWith('/* eslint-disable'))
  } else {
    check('payment.js 头部包含 eslint-disable 标记（构建产物）', false, 'js 文件不存在')
  }

  // 8.4 payment.js 包含 module.exports shim
  if (jsCode) {
    check('payment.js 包含 _mod.exports = _handlers shim',
      /_mod\.exports\s*=\s*_handlers/.test(jsCode))
  } else {
    check('payment.js 包含 _mod.exports = _handlers shim', false, 'js 文件不存在')
  }

  // 8.5 payment.js 导出 wechatPay + wechatPayNotify
  if (jsCode) {
    check('payment.js 导出 wechatPay',
      /exports\.wechatPay\s*=/.test(jsCode))
    check('payment.js 导出 wechatPayNotify',
      /exports\.wechatPayNotify\s*=/.test(jsCode))
  }
}

// 总结
console.log()
console.log(`[${failed === 0 ? 'PASS' : 'FAIL'}] ${checks.length - failed}/${checks.length} 项通过`)
if (failed > 0) { process.exit(1) }
