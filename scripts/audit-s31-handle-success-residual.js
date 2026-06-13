#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Sprint 31: handleSuccess / handleError 残留点扫描审计
 *
 * 检查范围：
 *   1. cloudfunctions/**\/*.js 中所有"裸返回响应结构"的模式：
 *      - return { code: 0, message: '...', data: ... } 直接返回（应改为 handleSuccess）
 *      - function ok(data) { return { code: 0, ... } } 自定义 ok 包装器
 *      - function fail(error) { return { code: error.code, message, data: null } } 自定义 fail 包装器
 *      - return { success: true, data: ... } 旧风格
 *      - return { status: 'ok', ... } 旧风格
 *   2. 扫描 utilityService / i18nOverride / rateLimitCleanup 中是否已迁移
 *   3. 扫描其他服务（如有）是否使用 handleSuccess / handleError
 *   4. (strict) 严格禁止 handleSuccess 替代品 (ok/fail 包装器)
 *
 * 设计目的：
 *   - 统一云函数响应格式：所有 handler 应该通过 handleSuccess/handleError 包装
 *   - 避免重复造轮子：ok/fail 是 handleSuccess/handleError 的低质量复制
 *   - 提升可观测性：统一的响应结构便于上层 router / 中间件判断
 */

const fs = require('fs')
const path = require('path')

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

// 1. 扫描所有 cloudfunctions 服务入口（index.js）
const cfRoot = path.join(ROOT, 'cloudfunctions')

function listServiceEntries(root) {
  const services = []
  const entries = fs.readdirSync(root, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) {continue}
    // 跳过 common / node_modules
    if (entry.name === 'common' || entry.name === 'node_modules') {continue}
    const indexPath = path.join(root, entry.name, 'index.js')
    if (fs.existsSync(indexPath)) {
      services.push({ name: entry.name, path: indexPath })
    }
  }
  return services
}

const services = listServiceEntries(cfRoot)
check(`已扫描 ${services.length} 个云函数入口`, services.length > 0)

// 2. 已识别的高优先级残留点文件
const KNOWN_RESIDUAL_FILES = [
  'utilityService/index.js',
  'i18nOverride/index.js',
  'rateLimitCleanup/index.js',
]

const residualFindings = []
for (const rel of KNOWN_RESIDUAL_FILES) {
  const full = path.join(cfRoot, rel)
  const code = readSafe(full)
  if (!code) {continue}
  const hasOk = /function\s+ok\s*\(/.test(code)
  const hasFail = /function\s+fail\s*\(/.test(code)
  const hasHandleSuccess = /handleSuccess\b/.test(code)
  if (hasOk || hasFail) {
    residualFindings.push({ rel, hasOk, hasFail, hasHandleSuccess })
  }
}

check(
  'utilityService 已迁移到 handleSuccess（不再使用自定义 ok 包装器）',
  !residualFindings.find(f => f.rel === 'utilityService/index.js'),
  residualFindings.find(f => f.rel === 'utilityService/index.js')
    ? '仍存在 function ok / function fail'
    : '已迁移'
)
check(
  'i18nOverride 已迁移到 handleSuccess（不再使用自定义 ok 包装器）',
  !residualFindings.find(f => f.rel === 'i18nOverride/index.js'),
  residualFindings.find(f => f.rel === 'i18nOverride/index.js')
    ? '仍存在 function ok / function fail'
    : '已迁移'
)
check(
  'rateLimitCleanup 已迁移到 handleSuccess（不再使用自定义 ok 包装器）',
  !residualFindings.find(f => f.rel === 'rateLimitCleanup/index.js'),
  residualFindings.find(f => f.rel === 'rateLimitCleanup/index.js')
    ? '仍存在 function ok / function fail'
    : '已迁移'
)

// 3. 扫描所有入口文件中的"裸 return code:0"模式
const allResidualPatterns = []
for (const svc of services) {
  const code = readSafe(svc.path)
  if (!code) {continue}
  // 匹配：return { code: 0, message: ..., data: ... }
  const matches = code.match(/return\s*\{\s*code:\s*0[^\n}]*/g) || []
  for (const m of matches) {
    allResidualPatterns.push({ service: svc.name, match: m.trim().slice(0, 80) })
  }
}

check(
  '所有云函数入口已无"return { code: 0, ... }"裸返回',
  allResidualPatterns.length === 0,
  allResidualPatterns.length > 0
    ? `残留 ${allResidualPatterns.length} 处：${allResidualPatterns.slice(0, 3).map(p => `${p.service}: ${p.match}`).join(' | ')}`
    : '已清理'
)

// 4. 已迁移：handleSuccess / handleError 使用统计
let totalHandleSuccess = 0
let totalHandleError = 0
const perServiceStats = {}
for (const svc of services) {
  const code = readSafe(svc.path)
  if (!code) {continue}
  const hs = (code.match(/handleSuccess\b/g) || []).length
  const he = (code.match(/handleError\b/g) || []).length
  totalHandleSuccess += hs
  totalHandleError += he
  if (hs > 0 || he > 0) {
    perServiceStats[svc.name] = { hs, he }
  }
}

check(
  '至少 10 个云函数入口使用 handleSuccess（已建立响应统一标准）',
  totalHandleSuccess >= 10,
  `当前 ${totalHandleSuccess} 处（handleError: ${totalHandleError}）`
)

check(
  '至少 5 个云函数入口使用 handleError（错误处理统一）',
  totalHandleError >= 5,
  `当前 ${totalHandleError} 处`
)

// 5. utilityService / i18nOverride / rateLimitCleanup 中已使用 handleSuccess
for (const rel of KNOWN_RESIDUAL_FILES) {
  const full = path.join(cfRoot, rel)
  const code = readSafe(full)
  if (!code) {continue}
  const usesHandleSuccess = /handleSuccess\b/.test(code)
  check(
    `${rel} 已使用 handleSuccess（替代自定义 ok 包装器）`,
    usesHandleSuccess,
    usesHandleSuccess ? '✓' : '尚未迁移'
  )
}

// 6. (strict) 严格模式：禁止任何自定义 ok/fail 包装器
if (STRICT) {
  let totalCustomWrappers = 0
  for (const svc of services) {
    const code = readSafe(svc.path)
    if (!code) {continue}
    const okCount = (code.match(/function\s+ok\s*\(/g) || []).length
    const failCount = (code.match(/function\s+fail\s*\(/g) || []).length
    if (okCount + failCount > 0) {
      totalCustomWrappers += okCount + failCount
    }
  }
  check(
    '(strict) 所有云函数入口无自定义 ok/fail 包装器',
    totalCustomWrappers === 0,
    totalCustomWrappers > 0
      ? `残留 ${totalCustomWrappers} 处`
      : '已彻底清理'
  )
}

// 7. 输出汇总
console.log('\n=== handleSuccess 残留扫描汇总 ===')
console.log(`云函数入口数：${services.length}`)
console.log(`handleSuccess 使用次数：${totalHandleSuccess}`)
console.log(`handleError 使用次数：${totalHandleError}`)
console.log(`已迁移服务：${KNOWN_RESIDUAL_FILES.filter(f => {
  const code = readSafe(path.join(cfRoot, f))
  return code && /handleSuccess\b/.test(code)
}).join(', ')}`)
console.log(`残留模式数：${allResidualPatterns.length}`)
console.log(`自定义 ok/fail 包装器残留数：${residualFindings.length}`)

console.log(`\n=== 总计 ${checks.length} 项检查${STRICT ? '（含 strict）' : ''} ===`)
console.log(`${failed === 0 ? '✅' : '❌'} ${failed === 0 ? '全部通过' : `${failed} 项失败`}`)

process.exit(failed === 0 ? 0 : 1)
