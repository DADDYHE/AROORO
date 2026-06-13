#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * 数据库性能 Profile 报告生成器（Sprint 55-03）
 *
 * 输入：db-profiler.ts 导出的 JSON 报告
 * 输出：人类可读的文本报告 + Markdown 表格
 *
 * 用法：
 *   # 1. 在云函数中启用 profiler
 *   #    const db = withDbProfiler(originalDb)
 *   # 2. 业务侧调用后导出
 *   #    const report = exportProfileReport()
 *   #    await db.collection('profile_reports').add({ data: { content: report } })
 *
 *   # 3. 本地拉取并生成报告
 *   node scripts/db-profile-report.js <path-to-json>
 *
 *   # 4. 或者 stdin 方式
 *   cat profile.json | node scripts/db-profile-report.js
 *
 * 输出：
 *   - stdout: 文本摘要
 *   - docs/perf/db-profile-latest.md: Markdown 报告
 */

const fs = require('fs')
const path = require('path')

function readStdin() {
  return new Promise(resolve => {
    let data = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', chunk => { data += chunk })
    process.stdin.on('end', () => resolve(data))
  })
}

async function main() {
  const inputArg = process.argv[2]
  let raw
  if (inputArg) {
    raw = fs.readFileSync(inputArg, 'utf8')
  } else if (!process.stdin.isTTY) {
    raw = await readStdin()
  } else {
    console.error('用法: node db-profile-report.js <profile.json>')
    console.error('       cat profile.json | node db-profile-report.js')
    process.exit(1)
  }

  let report
  try {
    report = JSON.parse(raw)
  } catch (e) {
    console.error('JSON 解析失败:', e.message)
    process.exit(1)
  }

  // 打印文本摘要
  printTextSummary(report)

  // 写入 Markdown 报告
  const mdPath = path.resolve(__dirname, '..', 'docs', 'perf', 'db-profile-latest.md')
  fs.mkdirSync(path.dirname(mdPath), { recursive: true })
  fs.writeFileSync(mdPath, buildMarkdownReport(report), 'utf8')
  console.log(`\n📄 Markdown 报告已写入: ${path.relative(process.cwd(), mdPath)}`)
}

function printTextSummary(r) {
  console.log('========== DB 性能 Profile 报告 ==========')
  console.log(`窗口: ${Math.round(r.windowMs / 1000)}s（自 ${new Date(r.startedAt).toISOString()}）`)
  console.log(`总查询数: ${r.totalQueries} | 总耗时: ${r.totalDurationMs}ms`)
  console.log(`P50/P95/P99: ${r.p50}/${r.p95}/${r.p99} ms`)
  console.log(`慢查询阈值: 100ms | 命中数: ${r.slowQueries.length}`)

  if (r.slowQueries.length > 0) {
    console.log('\n--- 慢查询 Top 10 ---')
    console.log('  signature'.padEnd(40) + 'max(ms)'.padStart(8) + 'count'.padStart(8) + 'avgDocs'.padStart(10))
    r.slowQueries.slice(0, 10).forEach(s => {
      console.log(
        `  ${s.signature.padEnd(40)}${String(s.durationMs).padStart(8)}${String(s.count).padStart(8)}${String(s.avgDocCount).padStart(10)}`
      )
    })
  }

  console.log('\n--- 按 collection 聚合 ---')
  console.log('  collection'.padEnd(20) + 'count'.padStart(8) + 'avg(ms)'.padStart(10) + 'p95(ms)'.padStart(10) + 'slow'.padStart(8))
  Object.entries(r.byCollection)
    .sort((a, b) => b[1].count - a[1].count)
    .forEach(([c, s]) => {
      console.log(
        `  ${c.padEnd(20)}${String(s.count).padStart(8)}${String(s.avgDurationMs).padStart(10)}${String(s.p95DurationMs).padStart(10)}${String(s.slowCount).padStart(8)}`
      )
    })
}

function buildMarkdownReport(r) {
  const lines = []
  lines.push('# DB 性能 Profile 报告')
  lines.push('')
  lines.push(`> 生成时间: ${new Date().toISOString()}`)
  lines.push(`> 分析窗口: ${Math.round(r.windowMs / 1000)}s（自 ${new Date(r.startedAt).toISOString()}）`)
  lines.push('')
  lines.push('## 总览')
  lines.push('')
  lines.push('| 指标 | 值 |')
  lines.push('| --- | --- |')
  lines.push(`| 总查询数 | ${r.totalQueries} |`)
  lines.push(`| 总耗时 | ${r.totalDurationMs}ms |`)
  lines.push(`| P50 | ${r.p50}ms |`)
  lines.push(`| P95 | ${r.p95}ms |`)
  lines.push(`| P99 | ${r.p99}ms |`)
  lines.push(`| 慢查询数 (≥100ms) | ${r.slowQueries.length} |`)
  lines.push('')

  if (r.slowQueries.length > 0) {
    lines.push('## 慢查询 Top 20')
    lines.push('')
    lines.push('| Signature | Max (ms) | Count | Avg Docs |')
    lines.push('| --- | ---: | ---: | ---: |')
    r.slowQueries.slice(0, 20).forEach(s => {
      lines.push(`| ${s.signature} | ${s.durationMs} | ${s.count} | ${s.avgDocCount} |`)
    })
    lines.push('')
  }

  lines.push('## 按 Collection 聚合')
  lines.push('')
  lines.push('| Collection | Count | Avg (ms) | P95 (ms) | Slow Count |')
  lines.push('| --- | ---: | ---: | ---: | ---: |')
  Object.entries(r.byCollection)
    .sort((a, b) => b[1].count - a[1].count)
    .forEach(([c, s]) => {
      lines.push(`| ${c} | ${s.count} | ${s.avgDurationMs} | ${s.p95DurationMs} | ${s.slowCount} |`)
    })
  lines.push('')

  lines.push('## 按 Method 聚合')
  lines.push('')
  lines.push('| Method | Count | Avg (ms) |')
  lines.push('| --- | ---: | ---: |')
  Object.entries(r.byMethod)
    .sort((a, b) => b[1].count - a[1].count)
    .forEach(([m, s]) => {
      lines.push(`| ${m} | ${s.count} | ${s.avgDurationMs} |`)
    })
  lines.push('')

  return lines.join('\n')
}

main().catch(e => {
  console.error('生成报告失败:', e)
  process.exit(1)
})
