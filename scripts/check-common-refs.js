#!/usr/bin/env node
/**
 * Sprint 39: 检查每个云函数的 common 子目录是否完整覆盖 index.js 中的引用
 *
 * 目的：
 *   - 每个云函数都打包部署到云端，common/ 子目录是必需的本地依赖
 *   - 如果 index.js 引用了 './common/xxx' 但 common/xxx.js 缺失，云函数会启动失败
 *   - 此脚本扫描所有云函数入口，验证 require 引用与 common 子目录文件一一对应
 */
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..', 'cloudfunctions')
const dirs = fs.readdirSync(root).filter(d =>
  fs.statSync(path.join(root, d)).isDirectory() && d !== 'common' && d !== 'node_modules'
)

let totalMissing = 0
const summary = []

for (const d of dirs) {
  const dir = path.join(root, d)
  const indexJs = path.join(dir, 'index.js')
  if (!fs.existsSync(indexJs)) { continue }

  const content = fs.readFileSync(indexJs, 'utf8')
  // 收集所有 require('./common/...') 和 require('../common/...')
  const re = /require\(['"](?:\.\.?\/common\/)([^'"]+)['"]\)/g
  const reqs = new Set()
  let m
  while ((m = re.exec(content)) !== null) {
    const base = path.basename(m[1], '.js')
    reqs.add(base)
  }

  if (reqs.size === 0) { continue }

  const commonDir = path.join(dir, 'common')
  if (!fs.existsSync(commonDir)) {
    summary.push({ d, missing: [...reqs] })
    totalMissing += reqs.size
    continue
  }

  const have = new Set(fs.readdirSync(commonDir).map(f => path.basename(f, '.js')))
  const missing = []
  for (const r of reqs) {
    if (!have.has(r)) { missing.push(r) }
  }
  if (missing.length > 0) {
    summary.push({ d, missing })
    totalMissing += missing.length
  }
}

if (summary.length === 0) {
  console.log('[PASS] 所有云函数 common 引用都已满足')
  process.exit(0)
} else {
  console.log(`[FAIL] ${summary.length} 个云函数存在 missing common 引用：\n`)
  for (const s of summary) {
    console.log(`  ${s.d}:`)
    for (const m of s.missing) {
      console.log(`    - ${m}.js`)
    }
  }
  console.log(`\n总共 ${totalMissing} 个缺失文件`)
  process.exit(1)
}
