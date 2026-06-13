#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Sprint 21: 全局限流接入审计脚本
 *
 * 检查项：
 *   1. cloudfunctions/common/rate-limit-store.{ts,js,d.ts} 存在
 *   2. cloudfunctions/common/risk-rate-limit.ts 中导出 initGlobalRateLimitFromDb
 *   3. 所有使用 withRateLimit 的云函数入口都调用了 initGlobalRateLimitFromDb
 *   4. rateLimitCleanup 云函数 + 定时触发器配置存在
 *   5. tsconfig.common.json include rate-limit-store.ts
 *   6. scripts/build-all-services.js TARGETS 含 rate-limit-store.js
 *
 * 退出码：
 *   0 = 全部通过
 *   1 = 至少 1 项不通过
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')

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
const TS = path.join(ROOT, 'cloudfunctions', 'common', 'rate-limit-store.ts')
const JS = path.join(ROOT, 'cloudfunctions', 'common', 'rate-limit-store.js')
const DTS = path.join(ROOT, 'cloudfunctions', 'common', 'rate-limit-store.d.ts')
check('rate-limit-store.ts 存在', fs.existsSync(TS))
check('rate-limit-store.js 存在', fs.existsSync(JS))
check('rate-limit-store.d.ts 存在', fs.existsSync(DTS))

// 2. 导出 initGlobalRateLimitFromDb
const rrlTs = readSafe(path.join(ROOT, 'cloudfunctions', 'common', 'risk-rate-limit.ts'))
check(
  'risk-rate-limit.ts 导出 initGlobalRateLimitFromDb',
  /export\s+function\s+initGlobalRateLimitFromDb/.test(rrlTs || '')
)
check(
  'risk-rate-limit.ts 导出 setGlobalRateLimitStore',
  /export\s+function\s+setGlobalRateLimitStore/.test(rrlTs || '')
)
check(
  'risk-rate-limit.ts 导出 consumeGlobalRateLimitWithFallback',
  /export\s+async\s+function\s+consumeGlobalRateLimitWithFallback/.test(rrlTs || '')
)

// 3. 检查 withRateLimit 的云函数入口是否都注入了全局 store
//   - orderService/index.js
//   - paymentService/index.js
const orderIdx = readSafe(path.join(ROOT, 'cloudfunctions', 'orderService', 'index.js'))
const paymentIdx = readSafe(path.join(ROOT, 'cloudfunctions', 'paymentService', 'index.js'))
check(
  'orderService/index.js 调用 initGlobalRateLimitFromDb (或 bootstrapRateLimit)',
  /(?:initGlobalRateLimitFromDb|bootstrapRateLimit)\s*\(/.test(orderIdx || '')
)
check(
  'paymentService/index.js 调用 initGlobalRateLimitFromDb (或 bootstrapRateLimit)',
  /(?:initGlobalRateLimitFromDb|bootstrapRateLimit)\s*\(/.test(paymentIdx || '')
)

// 4. rateLimitCleanup 云函数
const cleanupDir = path.join(ROOT, 'cloudfunctions', 'rateLimitCleanup')
const cleanupIdx = readSafe(path.join(cleanupDir, 'index.js'))
const cleanupCfg = readSafe(path.join(cleanupDir, 'config.json'))
const cleanupPkg = readSafe(path.join(cleanupDir, 'package.json'))
check('rateLimitCleanup 云函数目录存在', fs.existsSync(cleanupDir))
check('rateLimitCleanup/index.js 存在', Boolean(cleanupIdx))
check('rateLimitCleanup/config.json 存在', Boolean(cleanupCfg))
if (cleanupCfg) {
  try {
    const cfg = JSON.parse(cleanupCfg)
    check('rateLimitCleanup 包含 timer 触发器', Array.isArray(cfg.triggers) && cfg.triggers.some(t => t.type === 'timer'))
  } catch (e) {
    check('rateLimitCleanup/config.json 是合法 JSON', false, e.message)
  }
}
check('rateLimitCleanup/package.json 存在', Boolean(cleanupPkg))
check('rateLimitCleanup/index.js 注入全局限流', /initGlobalRateLimitFromDb/.test(cleanupIdx || ''))
check('rateLimitCleanup/index.js 调用 cleanupExpiredRateLimits', /cleanupExpiredRateLimits/.test(cleanupIdx || ''))

// 5. tsconfig.common.json include rate-limit-store.ts
const tsconfig = readSafe(path.join(ROOT, 'tsconfig.common.json'))
if (tsconfig) {
  try {
    const cfg = JSON.parse(tsconfig)
    check('tsconfig.common.json include rate-limit-store.ts', cfg.include && cfg.include.includes('cloudfunctions/common/rate-limit-store.ts'))
  } catch (e) {
    check('tsconfig.common.json 是合法 JSON', false, e.message)
  }
}

// 6. build-all-services.js TARGETS (Sprint 48 合并后)
const buildJs = readSafe(path.join(ROOT, 'scripts', 'build-all-services.js'))
check('build-all-services.js TARGETS 含 rate-limit-store.js', /rate-limit-store\.js/.test(buildJs || ''))

// 总结
console.log()
console.log(`[${failed === 0 ? 'PASS' : 'FAIL'}] ${checks.length - failed}/${checks.length} 项通过`)
if (failed > 0) {process.exit(1)}
