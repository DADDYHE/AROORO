#!/usr/bin/env node
/**
 * normalize-stagger.js · 把各页 nth-child 入场 stagger 收敛到中央节奏
 *
 * 中央节奏（与 motion.wxss 的 .zy-enter--d1..d8 一致）：
 *   d1=80 d2=140 d3=200 d4=260 d5=320 d6=380 d7=440 d8=500  （60ms 步进，封顶 500ms）
 *
 * 只处理「入场」stagger，识别方式（双保险，避免误伤循环动画相位）：
 *   1. 同文件中该选择器的基类 animation-name 属于入场 keyframe 白名单
 *   2. 且选择器名不含 loading / dot / shimmer / shine / skeleton / pulse / spin
 *
 * 用法：node scripts/normalize-stagger.js [--apply] [--page <子串>]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const pi = args.indexOf('--page');
const PAGE_FILTER = pi >= 0 ? args[pi + 1] : null;

const RHYTHM = [80, 140, 200, 260, 320, 380, 440, 500];
const ENTER_KF = /^zy-(fade-in|fade-in-up|fade-in-up-sm|fade-in-up-lg|fade-in-down|fade-in-down-sm|scale-in|scale-in-soft|scale-in-up|hero-settle|footer-rise|slide-in-right|popup-reveal|popup-reveal-soft|overlay-in)$/;
const EXCLUDE_SEL = /(loading|dot|shimmer|shine|skeleton|pulse|spin|ring|wave)/i;

const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
const targets = [...app.pages];
for (const sp of app.subPackages || []) {
  for (const p of sp.pages) targets.push(`${sp.root}/${p}`);
  if (fs.existsSync(path.join(ROOT, sp.root, 'common.wxss'))) targets.push(`${sp.root}/common`);
}

let filesChanged = 0, rulesChanged = 0;
const report = [];

for (const route of targets) {
  if (PAGE_FILTER && !route.includes(PAGE_FILTER)) continue;
  const file = path.join(ROOT, `${route}.wxss`);
  if (!fs.existsSync(file)) continue;
  const orig = fs.readFileSync(file, 'utf8');

  // 建立「基础选择器 → animation-name」索引
  const baseAnim = new Map();
  for (const m of orig.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const nm = m[2].match(/animation-name\s*:\s*([A-Za-z0-9_-]+)/);
    if (!nm) continue;
    for (const c of m[1].matchAll(/\.([A-Za-z0-9_-]+)/g)) {
      if (!baseAnim.has(c[1])) baseAnim.set(c[1], nm[1]);
    }
  }

  const changes = [];
  const css = orig.replace(
    /(\.[A-Za-z0-9_-]+)(:nth-child\(\s*(\d+)\s*\))(\s*\{[^{}]*animation-delay\s*:\s*)([0-9.]+m?s)/g,
    (whole, cls, nthPart, nStr, mid, oldVal) => {
      const clsName = cls.slice(1);
      if (EXCLUDE_SEL.test(clsName)) return whole;
      const kf = baseAnim.get(clsName);
      if (!kf || !ENTER_KF.test(kf)) return whole;
      const n = parseInt(nStr, 10);
      const want = RHYTHM[Math.min(n, RHYTHM.length) - 1];
      const newVal = `${want}ms`;
      if (newVal === oldVal) return whole;
      changes.push(`${clsName}:nth-child(${n})  ${oldVal} → ${newVal}`);
      return cls + nthPart + mid + newVal;
    }
  );

  if (css === orig) continue;
  filesChanged++;
  rulesChanged += changes.length;
  report.push({ route, changes });
  if (APPLY) fs.writeFileSync(file, css, 'utf8');
}

for (const r of report) {
  console.log(`\n${r.route}`);
  r.changes.forEach((c) => console.log(`  ${c}`));
}
console.log(`\n${'='.repeat(56)}`);
console.log(APPLY ? '已落盘' : 'DRY-RUN（加 --apply 生效）');
console.log(`  文件 ${filesChanged} / 规则 ${rulesChanged}`);
console.log('');
