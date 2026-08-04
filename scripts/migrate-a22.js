#!/usr/bin/env node
/**
 * A-2-2 迁移脚本：spacing 旧代 var() 引用 → 新代 zy-* 引用
 * 规则：
 *  1. 只处理 var() 引用，不碰 theme-teal 定义层（A-3 删）
 *  2. 排除 miniprogram_npm / node_modules / web-admin / scripts / deliverables / dist
 *  3. 迁移时同步移除 fallback（新代令牌 theme-teal 全局有定义，不留失效兜底）
 *  4. 不迁移硬编码 padding/margin 数值（硬编码间距治理是独立课题）
 *  5. 映射依据 migration-map §3.1（A-1 补档后）
 */
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

// 迁移映射（migration-map §3.1，A-1 补档后）
// 动版档：xs 12→16 / md 32→40 / lg 48→40
// 同值档：xxxs 4 / xxs 8 / sm 20→sm2 20 / xl 64 / xxl 96 / xxxl 128 / xxxxxl 200→4xl 200
const SPACING_MAP = {
  xxxxs: null,        // 2rpx 零消费缺档 → 不映射（脚本不会命中）
  xxxs: '2xs',        // 4rpx 同值
  xxs: 'xs',          // 8rpx 同值
  xs: 'sm',           // 12→16 动版（更松 +4）
  sm: 'sm2',          // 20→20 同值（A-1 补档 sm2）
  md: 'lg',           // 32→40 动版（更松 +8）
  lg: 'lg',           // 48→40 动版（更紧凑 -8）
  xl: 'xl',           // 64 同值
  xxl: '2xl',         // 96 同值
  xxxl: '3xl',        // 128 同值
  xxxxl: null,        // 160rpx 零消费缺档 → 不映射
  xxxxxl: '4xl',      // 200→200 同值（A-1 补档 4xl）
};

// 目标目录（小程序侧，排除 web-admin）
const TARGET_DIRS = ['app.wxss', 'custom-tab-bar', 'components', 'pages', 'subpackages', 'styles'];
const EXCLUDE = new Set(['miniprogram_npm', 'node_modules', 'web-admin', 'dist', 'deliverables']);

function collectWxss() {
  const files = [];
  const walk = (p) => {
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (EXCLUDE.has(path.basename(p))) return;
      for (const e of fs.readdirSync(p)) walk(path.join(p, e));
    } else if (p.endsWith('.wxss') && path.basename(p) !== 'theme-teal.wxss') {
      files.push(p);
    }
  };
  for (const d of TARGET_DIRS) {
    const p = path.join(ROOT, d);
    if (fs.existsSync(p)) walk(p);
  }
  return files;
}

const files = collectWxss();
console.log(`待处理 wxss 文件数：${files.length}`);

// 预编译映射正则：按档名长度降序避免前缀误匹配（如 xxxxl 在 xl 前）
const tiers = Object.keys(SPACING_MAP).filter((t) => SPACING_MAP[t] !== null)
  .sort((a, b) => b.length - a.length);
const re = new RegExp(`var\\(--spacing-(${tiers.join('|')})(?:,\\s*[^)]*)?\\)`, 'g');

let total = 0, totalFiles = 0;
const perTier = {};

for (const f of files) {
  let src = fs.readFileSync(f, 'utf8');
  const orig = src;

  src = src.replace(re, (m, tier) => {
    total++;
    perTier[tier] = (perTier[tier] || 0) + 1;
    return `var(--zy-space-${SPACING_MAP[tier]})`;
  });

  if (src !== orig) {
    fs.writeFileSync(f, src, 'utf8');
    totalFiles++;
  }
}

console.log(`spacing 替换：${total} 处`);
console.log(`改动文件：${totalFiles} 个`);
console.log('分档统计：');
for (const [t, c] of Object.entries(perTier).sort((a, b) => b[1] - a[1])) {
  console.log(`  --spacing-${t} → --zy-space-${SPACING_MAP[t]} ×${c}`);
}
console.log('DONE');
