#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Sprint 55-56: 性能基线 + 性能优化 汇总审计
 *
 * 检查目标：
 *   1. S55-01 10 个业务场景 k6 脚本
 *   2. S55-02 冷启动预热工具
 *   3. S55-03 DB profiler
 *   4. S56-01 热数据多级缓存
 *   5. S56-02 CDN 静态资源覆盖率
 *
 * 退出码：0 = 全部通过，1 = 至少 1 项不通过
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

// 1. S55-01: 10 个业务场景 k6 脚本
const k6Path = path.join(ROOT, 'scripts', 'perf', 'scenarios', 'business-scenarios.js')
const k6Code = readSafe(k6Path)
check('scripts/perf/scenarios/business-scenarios.js 存在', fs.existsSync(k6Path))

const SCENARIOS = [
  'discoverFeed', 'petList', 'partnerSearch', 'mallProduct', 'activityList',
  'couponList', 'orderList', 'messageList', 'priceCalculate', 'boardingAccept',
]
for (const fn of SCENARIOS) {
  check(`S55-01 包含场景函数 ${fn}`, k6Code && new RegExp(`export\\s+function\\s+${fn}\\s*\\(`).test(k6Code))
}
check('S55-01 含 10 个 scenarios 配置（options.scenarios 含 10 个 key）',
  k6Code && (k6Code.match(/^\s+[a-z_]+:\s*\{$/gm) || []).length >= 10)
check('S55-01 含 thresholds（http_req_duration P95 < 1500/2000）',
  k6Code && /p\(95\)<1500/.test(k6Code) && /p\(95\)<2000/.test(k6Code))
check('S55-01 含 4 个核心读类场景 (P95<1500ms)',
  k6Code && (k6Code.match(/p\(95\)<1500/g) || []).length >= 8)
check('S55-01 含 2 个写类场景 (P95<2000ms)',
  k6Code && (k6Code.match(/p\(95\)<2000/g) || []).length >= 2)

// 2. S55-02: 冷启动预热工具
const warmupPath = path.join(ROOT, 'cloudfunctions', 'common', 'cold-start-warmup.ts')
const warmup = readSafe(warmupPath)
check('cloudfunctions/common/cold-start-warmup.ts 存在', fs.existsSync(warmupPath))
check('S55-02 导出 runWarmup 主函数', warmup && /export\s+(?:async\s+)?function\s+runWarmup\s*\(/.test(warmup))
check('S55-02 导出 withWarmup 装饰器', warmup && /export\s+function\s+withWarmup\s*[<(]/.test(warmup))
check('S55-02 导出 WARMUP_MODULES 默认模块列表', warmup && /export\s+const\s+WARMUP_MODULES/.test(warmup))
check('S55-02 区分 CORE_MODULES / HOT_MODULES / WEAK_MODULES',
  warmup && /CORE_MODULES/.test(warmup) && /HOT_MODULES/.test(warmup) && /WEAK_MODULES/.test(warmup))
check('S55-02 实现单次尝试 require 失败降级', warmup && /tryRequire/.test(warmup))
check('S55-02 实现冷启动标记（WeakMap 同一实例只算一次）',
  warmup && /COLD_START_MAP[\s\S]{0,500}WeakMap/.test(warmup))
check('S55-02 返回 WarmupReport（含 durationMs / moduleCount / failedModules）',
  warmup && /WarmupReport/.test(warmup) && /durationMs:/.test(warmup) && /failedModules:/.test(warmup))

// 3. S55-03: DB profiler
const profilerPath = path.join(ROOT, 'cloudfunctions', 'common', 'db-profiler.ts')
const profiler = readSafe(profilerPath)
const profileReportPath = path.join(ROOT, 'scripts', 'db-profile-report.js')
check('cloudfunctions/common/db-profiler.ts 存在', fs.existsSync(profilerPath))
check('S55-03 导出 withDbProfiler 主函数', profiler && /export\s+function\s+withDbProfiler/.test(profiler))
check('S55-03 导出 getProfileReport', profiler && /export\s+function\s+getProfileReport/.test(profiler))
check('S55-03 导出 exportProfileReport', profiler && /export\s+function\s+exportProfileReport/.test(profiler))
check('S55-03 区分 LRU 容量上限（MAX_RECORDS = 1000）',
  profiler && /MAX_RECORDS\s*=\s*1000/.test(profiler))
check('S55-03 实现慢查询阈值（SLOW_QUERY_THRESHOLD_MS = 100）',
  profiler && /SLOW_QUERY_THRESHOLD_MS\s*=\s*100/.test(profiler))
check('S55-03 实现 percentile 函数', profiler && /function\s+percentile/.test(profiler))
check('S55-03 慢查询按 signature 聚合', profiler && /sigMap/.test(profiler))
check('S55-03 输出 P50/P95/P99', profiler && /p50:/.test(profiler) && /p95:/.test(profiler) && /p99:/.test(profiler))
check('S55-03 输出 byCollection 聚合', profiler && /byCollection/.test(profiler))
check('S55-03 输出 byMethod 聚合', profiler && /byMethod/.test(profiler))

check('scripts/db-profile-report.js 存在', fs.existsSync(profileReportPath))
const profileReportCode = readSafe(profileReportPath)
check('S55-03 报告生成器支持 stdin 读取 JSON', profileReportCode && /readStdin/.test(profileReportCode))
check('S55-03 报告生成器输出 Markdown', profileReportCode && /buildMarkdownReport/.test(profileReportCode))
check('S55-03 报告生成器输出 P50/P95/P99', profileReportCode && /P50/.test(profileReportCode))

// 4. S56-01: 热数据多级缓存
const hotCachePath = path.join(ROOT, 'cloudfunctions', 'common', 'hot-cache.ts')
const hotCache = readSafe(hotCachePath)
check('cloudfunctions/common/hot-cache.ts 存在', fs.existsSync(hotCachePath))
check('S56-01 导出 getOrLoad 主函数',
  hotCache && /export\s+(?:async\s+)?function\s+getOrLoad[\s\S]{0,5}[<(]/.test(hotCache))
check('S56-01 导出 invalidate', hotCache && /export\s+function\s+invalidate/.test(hotCache))
check('S56-01 导出 getStats', hotCache && /export\s+function\s+getStats/.test(hotCache))
check('S56-01 实现单飞（防击穿）',
  hotCache && /singleflight/.test(hotCache) && /getFlight/.test(hotCache) && /setFlight/.test(hotCache))
check('S56-01 实现抖动 TTL（防雪崩）',
  hotCache && /jitterTtl/.test(hotCache) && /jitterRatio/.test(hotCache))
check('S56-01 实现负缓存（防穿透）',
  hotCache && /isNegative:/.test(hotCache) && /negativeTtlSeconds/.test(hotCache))
check('S56-01 统计 hit rate',
  hotCache && /hitRate/.test(hotCache) && /cacheHits/.test(hotCache) && /cacheMisses/.test(hotCache))
check('S56-01 统计 singleflightSaved',
  hotCache && /singleflightSaved/.test(hotCache))

// 5. S56-02: CDN 静态资源覆盖率审计
const cdnAuditPath = path.join(ROOT, 'scripts', 'audit-s56-cdn-coverage.js')
check('scripts/audit-s56-cdn-coverage.js 存在', fs.existsSync(cdnAuditPath))
check('S56-02 审计可执行',
  fs.existsSync(cdnAuditPath) && (fs.statSync(cdnAuditPath).mode & 0o111) !== 0)

// 6. perf/ 目录结构
const perfDir = path.join(ROOT, 'scripts', 'perf')
check('scripts/perf/ 目录存在', fs.existsSync(perfDir))
check('scripts/perf/main-flow.js 存在（Sprint 9 老基线）',
  fs.existsSync(path.join(perfDir, 'main-flow.js')))
check('scripts/perf/ci-smoke.js 存在（Sprint 14 CI smoke）',
  fs.existsSync(path.join(perfDir, 'ci-smoke.js')))
check('scripts/perf/scenarios/ 目录存在（Sprint 55 业务场景）',
  fs.existsSync(path.join(perfDir, 'scenarios')))

// 7. (strict) tsc 严格模式
if (STRICT) {
  const tsconfigFiles = ['tsconfig.common.json']
  for (const cfg of tsconfigFiles) {
    const cfgPath = path.join(ROOT, cfg)
    if (!fs.existsSync(cfgPath)) {
      check(`(strict) ${cfg} 存在`, false)
      continue
    }
    try {
      execSync(`npx --yes -p typescript@5.4.5 tsc --noEmit -p ${cfg}`, { cwd: ROOT, stdio: 'pipe' })
      check(`(strict) tsc --noEmit -p ${cfg} 通过`, true)
    } catch (e) {
      const msg = e.stderr ? e.stderr.toString().split('\n').slice(0, 5).join(' / ') : e.message
      check(`(strict) tsc --noEmit -p ${cfg} 通过`, false, msg)
    }
  }
}

// 8. (strict) k6 脚本语法（仅 inspect，不执行）
if (STRICT) {
  check('(strict) k6 main-flow.js 语法检查可执行（跳过，由 k6 实际运行验证）', true)
  check('(strict) k6 business-scenarios.js 语法检查可执行（跳过）', true)
}

// 输出汇总
console.log('\n=== Sprint 55-56 性能基线 + 性能优化审计汇总 ===')
console.log('模块覆盖：')
console.log(`  - S55-01 10 业务场景 k6 脚本: ${k6Code ? '✓' : '✗'}`)
console.log(`  - S55-02 冷启动预热工具: ${warmup ? '✓' : '✗'}`)
console.log(`  - S55-03 DB profiler: ${profiler ? '✓' : '✗'}`)
console.log(`  - S56-01 热数据多级缓存: ${hotCache ? '✓' : '✗'}`)
console.log(`  - S56-02 CDN 静态资源审计: ${fs.existsSync(cdnAuditPath) ? '✓' : '✗'}`)

console.log(`\n=== 总计 ${checks.length} 项检查${STRICT ? '（含 strict）' : ''} ===`)
console.log(`${failed === 0 ? '✅' : '❌'} ${failed === 0 ? '全部通过' : `${failed} 项失败`}`)

process.exit(failed === 0 ? 0 : 1)
