#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Sprint 31: TypeScript 迁移覆盖率指标
 *
 * 目标：
 *   1. 统计 cloudfunctions 下所有 .ts / .js 源文件（排除 .d.ts / node_modules / package.json / config.json）
 *   2. 按目录分组（common / orderService / paymentService 等）计算迁移率
 *   3. 输出每个服务的 .ts / .js 文件清单
 *   4. (strict) 总体迁移率 >= 50%，核心服务（orderService / paymentService）>= 100%
 *   5. 输出 JSON 报告（coverage/ts-coverage.json）供 CI 消费
 *
 * 退出码：
 *   0 = 全部通过
 *   1 = 至少 1 项不通过
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const STRICT = process.argv.includes('--strict')
const CF_ROOT = path.join(ROOT, 'cloudfunctions')

let failed = 0
const checks = []

function check(name, ok, detail) {
  checks.push({ name, ok, detail })
  if (!ok) {failed++}
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

function listDir(dir, ext) {
  if (!fs.existsSync(dir)) {return []}
  return fs.readdirSync(dir)
    .filter(f => f.endsWith(ext))
    .filter(f => f !== 'package.json' && f !== 'config.json')
    .map(f => path.join(dir, f))
}

function walkDir(dir) {
  // 递归收集所有源文件（.ts 优先于 .js，.js + .d.ts 视为已迁移的产物）
  // 返回 modules 数组：{ name, hasTs, hasJs, isMigrated, hasDeclaration }
  const results = []
  if (!fs.existsSync(dir)) {return results}
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name === 'node_modules') {continue}
    if (entry.name === 'miniprogram_npm') {continue}
    if (entry.name === 'modules') {continue}
    if (entry.name === 'test') {continue}
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const relPath = path.relative(CF_ROOT, full)
      // 跳过各服务下的 legacy 内嵌 common 副本（utilityService/common / orderService/common 等）
      // 只保留 cloudfunctions/common 这个规范目录
      if (relPath.match(/^[^/]+\/common$/) && relPath !== 'common') {continue}
      results.push(...walkDir(full))
    } else if (entry.isFile()) {
      if (entry.name === 'package.json' || entry.name === 'config.json') {continue}
      if (entry.name.endsWith('.d.ts') || entry.name.endsWith('.d.js')) {continue}
      if (entry.name.endsWith('.ts')) {
        const baseName = entry.name.slice(0, -3)
        // 检查是否已存在同名模块（.js 已被添加）
        const existing = results.find(m => m.name === baseName && m.dir === dir)
        if (existing) {
          // .js 先添加，.ts 后到 → 标记为已迁移
          existing.hasTs = true
          existing.isMigrated = true
        } else {
          results.push({ name: baseName, dir, hasTs: true, hasJs: false, isMigrated: true })
        }
      } else if (entry.name.endsWith('.js')) {
        const baseName = entry.name.slice(0, -3)
        const existing = results.find(m => m.name === baseName && m.dir === dir)
        if (existing) {
          existing.hasJs = true
        } else {
          results.push({ name: baseName, dir, hasTs: false, hasJs: true, isMigrated: false })
        }
      }
    }
  }
  return results
}

// 1. 全局统计（按模块计：.ts 源文件 vs 独立 .js 文件）
const all = walkDir(CF_ROOT)
const migratedModules = all.filter(m => m.isMigrated)
const unmigratedModules = all.filter(m => !m.isMigrated)
const total = all.length
const totalTs = migratedModules.length
const totalJs = unmigratedModules.length
const overallRate = total === 0 ? 0 : Math.round((totalTs / total) * 10000) / 100

check(
  `cloudfunctions 源模块总数：${total}（.ts: ${totalTs}，独立 .js: ${totalJs}）`,
  total > 0,
  `总迁移率：${overallRate}%`
)

check(
  '总迁移率 >= 20%',
  overallRate >= 20,
  `当前：${overallRate}%`
)

// 2. 按目录分组
const SERVICE_DIRS = fs.readdirSync(CF_ROOT, { withFileTypes: true })
  .filter(d => d.isDirectory() && d.name !== 'node_modules')
  .map(d => d.name)

const perDirStats = {}
for (const dirName of SERVICE_DIRS) {
  const fullDir = path.join(CF_ROOT, dirName)
  const modules = walkDir(fullDir)
  const ts = modules.filter(m => m.isMigrated)
  const js = modules.filter(m => !m.isMigrated)
  const allCount = modules.length
  const rate = allCount === 0 ? 0 : Math.round((ts.length / allCount) * 10000) / 100
  perDirStats[dirName] = {
    migrated: ts.length,
    unmigrated: js.length,
    total: allCount,
    rate,
    migratedFiles: ts,
    unmigratedFiles: js,
  }
}

console.log('\n=== 按目录迁移率（按模块计） ===')
for (const [name, stats] of Object.entries(perDirStats)) {
  const bar = '█'.repeat(Math.round(stats.rate / 5)) + '░'.repeat(20 - Math.round(stats.rate / 5))
  console.log(`  ${name.padEnd(20)} ${stats.migrated}/${stats.total} = ${String(stats.rate).padStart(6)}%  [${bar}]`)
}

// 3. 核心服务（迁移完成度要求高）
const CORE_SERVICES = ['orderService', 'paymentService', 'common']
for (const svc of CORE_SERVICES) {
  if (!perDirStats[svc]) {continue}
  const stats = perDirStats[svc]
  const rate = stats.rate
  check(
    `核心服务 ${svc} 迁移率 >= 50%`,
    rate >= 50,
    `当前：${rate}%（${stats.migrated}/${stats.total}）`
  )
}

// 4. 列出已迁移的 .ts 文件清单
console.log('\n=== 已迁移 .ts 模块清单 ===')
migratedModules.sort((a, b) => path.relative(ROOT, path.join(a.dir, `${a.name}.ts`))
  .localeCompare(path.relative(ROOT, path.join(b.dir, `${b.name}.ts`)))).forEach(m => {
  const rel = path.relative(ROOT, path.join(m.dir, `${m.name}.ts`))
  console.log(`  ✓ ${rel}`)
})

// 5. 列出未迁移的 .js 文件清单（核心服务）
console.log('\n=== 未迁移模块清单（核心服务） ===')
for (const svc of CORE_SERVICES) {
  if (!perDirStats[svc]) {continue}
  if (perDirStats[svc].unmigratedFiles.length === 0) {continue}
  console.log(`  [${svc}]`)
  perDirStats[svc].unmigratedFiles.sort((a, b) => a.name.localeCompare(b.name)).forEach(m => {
    const rel = path.relative(ROOT, path.join(m.dir, `${m.name}.js`))
    console.log(`    ✗ ${rel}`)
  })
}

// 6. 列出未迁移的 .js 文件清单（非核心服务）
console.log('\n=== 未迁移模块清单（非核心服务） ===')
for (const svc of SERVICE_DIRS) {
  if (CORE_SERVICES.includes(svc)) {continue}
  if (!perDirStats[svc]) {continue}
  if (perDirStats[svc].unmigratedFiles.length === 0) {continue}
  console.log(`  [${svc}]`)
  perDirStats[svc].unmigratedFiles.sort((a, b) => a.name.localeCompare(b.name)).forEach(m => {
    const rel = path.relative(ROOT, path.join(m.dir, `${m.name}.js`))
    console.log(`    ${rel}`)
  })
}

// 7. (strict) 总迁移率 >= 25%
if (STRICT) {
  check(
    '(strict) 总迁移率 >= 25%',
    overallRate >= 25,
    `当前：${overallRate}%`
  )

  // 列出仍在 common 目录下未迁移的 .js
  const commonUnmigrated = perDirStats.common ? perDirStats.common.unmigratedFiles : []
  check(
    '(strict) common 目录独立 .js 模块 <= 8 个',
    commonUnmigrated.length <= 8,
    commonUnmigrated.length > 0 ? `残留 ${commonUnmigrated.length} 个` : '✓'
  )
}

// 8. 输出 JSON 报告
const reportPath = path.join(ROOT, 'coverage', 'ts-coverage.json')
const report = {
  generatedAt: new Date().toISOString(),
  summary: {
    totalModules: total,
    migratedModules: totalTs,
    unmigratedModules: totalJs,
    migrationRate: overallRate,
  },
  perService: Object.fromEntries(
    Object.entries(perDirStats).map(([name, stats]) => [
      name,
      {
        migrated: stats.migrated,
        unmigrated: stats.unmigrated,
        total: stats.total,
        rate: stats.rate,
      },
    ])
  ),
  coreServices: CORE_SERVICES.reduce((acc, svc) => {
    if (perDirStats[svc]) {
      acc[svc] = perDirStats[svc].rate
    }
    return acc
  }, {}),
}

fs.mkdirSync(path.dirname(reportPath), { recursive: true })
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
console.log(`\n=== 报告已写入：${path.relative(ROOT, reportPath)} ===`)

console.log(`\n=== 总计 ${checks.length} 项检查${STRICT ? '（含 strict）' : ''} ===`)
console.log(`${failed === 0 ? '✅' : '❌'} ${failed === 0 ? '全部通过' : `${failed} 项失败`}`)

process.exit(failed === 0 ? 0 : 1)
