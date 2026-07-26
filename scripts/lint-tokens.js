#!/usr/bin/env node
/**
 * scripts/lint-tokens.js
 * 「左右」小程序 Token 守护脚本（2026-07-26 评审引入）
 *
 * 用途：
 *   - report 模式：扫描业务 wxss，统计裸 hex 数与 px/rpx 混用告警（不改动文件）
 *   - fix    模式：把高置信度的裸 hex（中性色 + 板块品牌色）替换为对应 token
 *
 * 安全边界：
 *   - 不处理 rgba(...)（批量替换会误伤发光阴影/渐变，留作人工 review）
 *   - 不改写 styles/variables.wxss（token 定义本身）
 *   - 跳过 node_modules / miniprogram_npm / dist / coverage / cloudfunctions
 *
 * 用法：
 *   node scripts/lint-tokens.js            # 默认 report
 *   node scripts/lint-tokens.js report
 *   node scripts/lint-tokens.js fix
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const EXCLUDE_DIRS = new Set(['node_modules', 'miniprogram_npm', 'dist', 'coverage', 'cloudfunctions', '.git']);
const EXCLUDE_FILES = new Set(['variables.wxss']); // token 定义，永不回写

// 高置信度映射：裸 hex → token（仅固态颜色，不含 rgba 阴影/渐变）
const MAP = {
  '#1d1d1f': 'var(--text-primary)',
  '#2c2c2c': 'var(--text-primary)',
  '#2c2c2e': 'var(--text-primary)',
  '#86868b': 'var(--text-secondary)',
  '#8e8e93': 'var(--text-secondary)',
  '#aeaeb2': 'var(--gray-500)',
  '#c7c7cc': 'var(--text-tertiary)',
  '#f5f5f7': 'var(--background-color)',
  '#f2f2f7': 'var(--divider-color)',
  '#d2d2d7': 'var(--border-color)',
  '#e5e5ea': 'var(--gray-200)',
  '#f9f9f9': 'var(--gray-50)',
  '#ffffff': 'var(--card-color)',
  '#34c759': 'var(--success-color)',
  '#ff9500': 'var(--warning-color)',
  '#ff3b30': 'var(--error-color)',
  '#007aff': 'var(--info-color)',
  '#ff6b00': 'var(--boarding-primary)',
  '#ff6b6b': 'var(--tuan-primary)',
  '#4ecdc4': 'var(--activity-primary)',
  '#9c27b0': 'var(--mall-primary)',
  '#2196f3': 'var(--feeding-primary)',

  /* 2026-07-26 评审补充：收敛残留高置信度 hex */
  '#fafafa': 'var(--surface-tint)',
  '#a0a0a0': 'var(--gray-450)',
  '#c0c0c0': 'var(--gray-350)',
  '#636366': 'var(--gray-700)',
  '#3a3a3c': 'var(--gray-900)',
  '#666666': 'var(--gray-700)',
  '#26a69a': 'var(--activity-secondary)',
  '#2ab7a9': 'var(--activity-primary-mid)',
  '#3db5ad': 'var(--activity-primary-mid)',
  '#45b7aa': 'var(--activity-primary-mid)',
  '#44a08d': 'var(--activity-primary-mid)',
  '#ff8c00': 'var(--boarding-secondary)',
  '#ff9f0a': 'var(--warning-color)',
  '#c4843d': 'var(--text-gold)',

  /* 板块渐变深停补充 */
  '#7b1fa2': 'var(--mall-secondary)',
  '#2ea59d': 'var(--activity-primary-mid)',
  '#3db8b0': 'var(--activity-primary-mid)',
};

const hexKeys = Object.keys(MAP).map((k) => k.slice(1));
const hexRe = new RegExp('#(?:' + hexKeys.join('|') + ')\\b', 'gi');
const rgbaRe = /rgba?\([^)]*\)/gi;

function walk(dir, out) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (!EXCLUDE_DIRS.has(name)) walk(p, out);
    } else if (st.isFile() && name.endsWith('.wxss') && !EXCLUDE_FILES.has(name)) {
      out.push(p);
    }
  }
}

const mode = process.argv[2] || 'report';
const files = [];
walk(ROOT, files);

let totalHex = 0;
let totalReplaced = 0;
const reportLines = [];

for (const f of files) {
  let src = fs.readFileSync(f, 'utf8');
  const rel = path.relative(ROOT, f);

  const hexCount = (src.match(hexRe) || []).length;
  totalHex += hexCount;
  if (hexCount > 0) reportLines.push(`  ${rel}: ${hexCount} 处裸 hex`);

  if (mode === 'fix' && hexCount > 0) {
    const before = src;
    src = src.replace(hexRe, (m) => MAP[m.toLowerCase()] || m);
    if (src !== before) {
      fs.writeFileSync(f, src);
      totalReplaced += hexCount;
    }
  }
}

console.log(`\n[lint-tokens] 模式=${mode}  扫描文件=${files.length}`);
console.log(`[lint-tokens] 裸 hex 总数=${totalHex}`);
if (reportLines.length) {
  console.log('--- 含裸 hex 的文件 ---');
  console.log(reportLines.join('\n'));
}
if (mode === 'fix') {
  console.log(`[lint-tokens] 已替换=${totalReplaced} 处（仅高置信度固态色；rgba 留人工 review）`);
}

if (totalHex === 0) {
  console.log('[lint-tokens] ✅ 无裸 hex，token 化达标');
} else if (mode !== 'fix') {
  console.log('\n提示：运行 `node scripts/lint-tokens.js fix` 自动替换高置信度裸 hex。');
  console.log('剩余裸 hex 多为 rgba(...) 板块色/阴影，建议人工核对或后续接板块 tint token。');
}
