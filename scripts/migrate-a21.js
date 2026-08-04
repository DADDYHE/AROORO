#!/usr/bin/env node
/**
 * A-2-1 迁移脚本：radius/font-size 旧代 var() 引用 → 新代 zy-* 引用
 * 规则：
 *  1. 只处理 var() 引用，不碰 theme-teal 定义层（A-3 删）
 *  2. 排除 miniprogram_npm / node_modules / web-admin / scripts / deliverables
 *  3. 迁移时同步移除 fallback（新代令牌 theme-teal 全局有定义，不留失效兜底；
 *     9999rpx 兜底绝不允许残留 —— 删旧代后会退回胶囊形）
 *  4. 只迁 radius/font-size；spacing 留给 A-2-2
 */
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

// 迁移映射（迁移映射表 §3.2 / §3.3）
const RADIUS_MAP = {
  xs: 'xs', sm: 'sm', md: 'md', lg: 'lg', xl: 'xl',
  '2xl': '2xl', '3xl': '3xl', '4xl': '4xl',
  full: 'pill', pill: 'pill',          // full→pill 语义改名（值同为 12rpx）
};
const FS_MAP = {
  xxxl: 'display', xxl: 'h1', xl: 'h2', lg: 'h3',
  md: 'body', sm: 'md', xs: 'xs-lg', xxs: '2xs',  // A-1 补档后同值映射
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
      // 排除 theme-teal：它是定义层，旧代定义由 A-3 删除；此处只迁消费层
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

let totalR = 0, totalF = 0, totalFiles = 0;

for (const f of files) {
  let src = fs.readFileSync(f, 'utf8');
  const orig = src;

  // radius：var(--border-radius-{tier}[, fallback]) → var(--zy-radius-{mapped})
  src = src.replace(/var\(--border-radius-(xs|sm|md|lg|xl|2xl|3xl|4xl|full|pill)(?:,\s*[^)]*)?\)/g, (m, tier) => {
    totalR++;
    return `var(--zy-radius-${RADIUS_MAP[tier]})`;
  });

  // font-size：var(--font-size-{tier}[, fallback]) → var(--zy-fs-{mapped})
  // 注意顺序：xxxl/xxl/xxs 必须在 xl/xs 之前匹配（正则交替已按长度降序）
  src = src.replace(/var\(--font-size-(xxxl|xxl|xxs|xl|lg|md|sm|xs)(?:,\s*[^)]*)?\)/g, (m, tier) => {
    totalF++;
    return `var(--zy-fs-${FS_MAP[tier]})`;
  });

  if (src !== orig) {
    fs.writeFileSync(f, src, 'utf8');
    totalFiles++;
  }
}

console.log(`radius 替换：${totalR} 处`);
console.log(`font-size 替换：${totalF} 处`);
console.log(`改动文件：${totalFiles} 个`);
console.log('DONE');
