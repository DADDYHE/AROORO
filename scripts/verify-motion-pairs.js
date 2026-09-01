// ================================================================
// scripts/verify-motion-pairs.js · 动效资产配对校验
// ----------------------------------------------------------------
// 用途：动效审查回归工具（配合 deliverables/motion-audit-2026-09-02.md）
//   1. 全量校验 wxml 的 hover-class ↔ wxss 定义是否配对
//   2. 扫描 wxml 内联 animation-delay 峰值（对照 stagger ≤560ms 铁律）
// 运行：node scripts/verify-motion-pairs.js（项目根目录）
// 已知豁免（人工复核过，非缺陷）：
//   - zy-action-sheet 动态三目 hover-class（!disabled && !loading 时切换）
//   - 内联 900ms（group-detail lux-cascade loading 循环相位，非一次性入场）
//   - wxss 内 animation-delay 大值（confirm 2000ms shimmer / pet 800ms dot 等循环相位）
// ================================================================

const fs = require('fs')
const path = require('path')
const ROOT = process.cwd()
const SKIP = ['node_modules', 'miniprogram_npm', 'dist']

function walk(dir, ext, out = []) {
  let ents
  try { ents = fs.readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of ents) {
    if (SKIP.includes(e.name)) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, ext, out)
    else if (e.name.endsWith(ext)) out.push(p)
  }
  return out
}

const wxmls = walk(ROOT, '.wxml')
const wxs = walk(ROOT, '.wxss')
const wxsText = wxs.map(p => fs.readFileSync(p, 'utf8')).join('\n')

// 1. hover-class ↔ wxss 定义配对
const hoverSet = new Map() // class -> [files]
for (const p of wxmls) {
  const t = fs.readFileSync(p, 'utf8')
  const re = /hover-class="([^"]+)"/g
  let m
  while ((m = re.exec(t))) {
    const cls = m[1]
    if (!hoverSet.has(cls)) hoverSet.set(cls, [])
    hoverSet.get(cls).push(p)
  }
}
let missing = []
for (const [cls, files] of hoverSet) {
  // 动态表达式（{{...}} / 三目 / 引号拼接）无法静态校验，跳过（人工复核）
  if (/\{\{/.test(cls) || /\?/.test(cls)) continue
  const tokens = cls.split(/\s+/).filter(Boolean)
  const found = tokens.some(tok =>
    new RegExp('\\.' + tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w-])').test(wxsText)
  )
  if (!found) missing.push({ cls, files: files.slice(0, 4) })
}
console.log('== hover-class 总数:', hoverSet.size, '==')
console.log('== 缺失定义:', missing.length, '==')
for (const m of missing) console.log('  MISSING:', m.cls, '<-', m.files.join(', '))

// 2. wxml 内联 animation-delay 峰值（stagger 铁律 ≤560ms）
let maxDelay = 0, maxInfo = null
for (const p of wxmls) {
  const t = fs.readFileSync(p, 'utf8')
  const re = /animation-delay\s*:\s*(\d+)ms/g
  let m
  while ((m = re.exec(t))) {
    const d = parseInt(m[1], 10)
    if (d > maxDelay) { maxDelay = d; maxInfo = { p, d } }
  }
}
console.log('== 内联 animation-delay 峰值:', maxDelay + 'ms', maxInfo ? '@' + path.relative(ROOT, maxInfo.p) : '')

// 退出码：缺失定义 > 0 视为失败（循环动画相位峰值仅提示不判失败）
process.exit(missing.length > 0 ? 1 : 0)
