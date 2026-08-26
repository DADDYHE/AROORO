#!/usr/bin/env node
/**
 * recycle-keyframes.js · 把各页私有 @keyframes 回收到中央 motion.wxss
 *
 * 做什么：
 *   1. 把页面 wxss 里 `animation-name: <本地名>` 重定向到中央 zy-* keyframe
 *   2. 顺手统一该规则的 animation-duration / timing-function 到设计令牌字面值
 *      （Skyline 铁律：animation 简写内不用 CSS 变量，故写字面值）
 *   3. 删除页面里已无引用的本地 @keyframes 定义块
 *
 * 不做什么（刻意保守）：
 *   · 不改 wxml（语义类名原样保留）→ 零布局/逻辑回归风险
 *   · 不动 animation-delay（各页 stagger 节奏留给 P1.5 单独收敛）
 *   · 不动 iteration-count / fill-mode
 *
 * 用法：
 *   node scripts/recycle-keyframes.js            # dry-run，只打印 diff 摘要
 *   node scripts/recycle-keyframes.js --apply     # 落盘
 *   node scripts/recycle-keyframes.js --page mall # 只处理路由含 mall 的页面
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const pi = args.indexOf('--page');
const PAGE_FILTER = pi >= 0 ? args[pi + 1] : null;

/* ============ 映射表 ============
   value: [中央keyframe, 统一时长ms, 统一缓动]
   缓动语义：silk = 位移/缩放类（更柔）；luxury = 纯透明度类（更利落）
   时长语义：420 列表项 / 480 内容卡与下落 / 600 页面级与 hero / 环境类保留原值
   ============================== */
const EASE_SILK = 'cubic-bezier(0.16, 1, 0.3, 1)';
const EASE_LUXURY = 'cubic-bezier(0.19, 1, 0.22, 1)';
const EASE_INOUT = 'ease-in-out';
const EASE_LINEAR = 'linear';

const MAP = {
  // —— 入场：上浮（36 页，五档幅度统一为 28rpx）
  fadeInUp: ['zy-fade-in-up', 480, EASE_SILK],
  'rise-fade-in': ['zy-fade-in-up', 480, EASE_SILK],
  'rise-fade-in-short': ['zy-fade-in-up-sm', 420, EASE_LUXURY],

  // —— 入场：纯淡入
  fadeIn: ['zy-fade-in', 420, EASE_LUXURY],

  // —— 入场：下落
  fadeInDown: ['zy-fade-in-down', 480, EASE_SILK],
  'topbar-fade': ['zy-fade-in-down-sm', 320, EASE_LUXURY],

  // —— 入场：缩放
  scaleIn: ['zy-scale-in-soft', 480, EASE_SILK],
  'scale-fade-in': ['zy-scale-in-soft', 480, EASE_SILK],
  heroFadeIn: ['zy-hero-settle', 800, EASE_SILK],

  // —— 入场：底部升起（幅度 100%，中央已有同形）
  slideInUp: ['zy-footer-rise', 480, EASE_SILK],

  // —— 弹窗
  modalFadeIn: ['zy-overlay-in', 320, EASE_LUXURY],
  modalContentIn: ['zy-popup-reveal', 420, EASE_SILK],

  // —— 退场
  'splash-fade-out': ['zy-fade-out', 280, 'cubic-bezier(0.4, 0, 1, 1)'],

  // —— 环境/加载（保留原时长语义，只统一 keyframe）
  spin: ['zy-spin', null, EASE_LINEAR],
  pulse: ['zy-pulse-soft', null, EASE_INOUT],
  dotPulse: ['zy-dot-pulse', null, EASE_INOUT],
  subtleShine: ['zy-shimmer-sweep', null, EASE_LINEAR],
  'aurora-breathe': ['zy-breathe-aura', null, EASE_INOUT],
};

/* ============ 页面清单 ============ */
const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
const routes = [...app.pages];
for (const sp of app.subPackages || []) for (const p of sp.pages) routes.push(`${sp.root}/${p}`);
// 分包共享样式也是回收目标（partner/pet 的 common.wxss 各自定义了 fadeInUp/fadeIn）
const extraTargets = [];
for (const sp of app.subPackages || []) {
  const c = path.join(ROOT, sp.root, 'common.wxss');
  if (fs.existsSync(c)) extraTargets.push(`${sp.root}/common`);
}
routes.push(...extraTargets);

/* ============ 单文件处理 ============ */
function processFile(file, route) {
  const orig = fs.readFileSync(file, 'utf8');
  let css = orig;
  const log = { route, renamed: [], durChanged: 0, easeChanged: 0, kfRemoved: [], skipped: [] };

  // ---- step 1：animation-name 重定向 + 同块时长/缓动统一 ----
  // 逐个规则块处理（选择器 { 声明 }）
  css = css.replace(/([^{}]*)\{([^{}]*)\}/g, (whole, sel, body) => {
    if (sel.includes('@keyframes')) return whole; // keyframes 头，跳过
    const nm = body.match(/animation-name\s*:\s*([A-Za-z0-9_-]+)/);
    if (!nm) return whole;
    const local = nm[1];
    if (!MAP[local]) {
      if (!local.startsWith('zy-')) log.skipped.push(local);
      return whole;
    }
    const [central, dur, ease] = MAP[local];
    let nb = body.replace(
      /animation-name\s*:\s*[A-Za-z0-9_-]+/,
      `animation-name: ${central}`
    );
    log.renamed.push(`${local}→${central}`);

    if (dur != null) {
      if (/animation-duration\s*:/.test(nb)) {
        nb = nb.replace(/animation-duration\s*:\s*[^;}]+/, `animation-duration: ${dur}ms`);
      } else {
        nb = nb.replace(
          `animation-name: ${central}`,
          `animation-name: ${central};\n  animation-duration: ${dur}ms`
        );
      }
      log.durChanged++;
    }
    if (ease != null) {
      if (/animation-timing-function\s*:/.test(nb)) {
        nb = nb.replace(/animation-timing-function\s*:\s*[^;}]+/, `animation-timing-function: ${ease}`);
      } else {
        nb = nb.replace(
          /(animation-name: [A-Za-z0-9_-]+;?)/,
          `$1\n  animation-timing-function: ${ease};`
        );
      }
      log.easeChanged++;
    }
    return sel + '{' + nb + '}';
  });

  // ---- step 2：处理 animation 简写（必须在删 keyframes 之前，否则会被判定为"仍被引用"）----
  css = css.replace(
    /animation\s*:\s*([A-Za-z0-9_-]+)([^;}]*)/g,
    (whole, name, rest) => {
      if (!MAP[name]) return whole;
      const [central] = MAP[name];
      log.renamed.push(`${name}→${central}(简写)`);
      return `animation: ${central}${rest}`;
    }
  );

  // ---- step 3：删除已无引用的本地 @keyframes 块 ----
  const kfRe = /(?:\/\*[^*]*\*\/\s*)?@keyframes\s+([A-Za-z0-9_-]+)\s*\{(?:[^{}]|\{[^{}]*\})*\}\s*/g;
  css = css.replace(kfRe, (block, name) => {
    if (!MAP[name]) return block;          // 不在映射表内 → 保留
    if (name.startsWith('zy-')) return block;
    // 该文件里是否还有别处引用它？
    const stillUsed =
      new RegExp(`animation-name\\s*:\\s*${name}\\b`).test(css) ||
      new RegExp(`animation\\s*:\\s*${name}\\b`).test(css);
    if (stillUsed) { log.skipped.push(`${name}(仍被引用)`); return block; }
    log.kfRemoved.push(name);
    return '';
  });

  const changed = css !== orig;
  if (changed && APPLY) fs.writeFileSync(file, css, 'utf8');
  return { changed, log, before: orig.length, after: css.length };
}

/* ============ 主流程 ============ */
let files = 0, totalRenamed = 0, totalKf = 0, bytesSaved = 0;
const skippedNames = new Set();

for (const route of routes) {
  if (PAGE_FILTER && !route.includes(PAGE_FILTER)) continue;
  const file = path.join(ROOT, `${route}.wxss`);
  if (!fs.existsSync(file)) continue;
  const { changed, log, before, after } = processFile(file, route);
  if (!changed) continue;
  files++;
  totalRenamed += log.renamed.length;
  totalKf += log.kfRemoved.length;
  bytesSaved += before - after;
  log.skipped.forEach((s) => skippedNames.add(s));
  console.log(`\n${route}`);
  if (log.renamed.length) {
    const uniq = [...new Set(log.renamed)];
    console.log(`  重定向 ${log.renamed.length} 处：${uniq.join(', ')}`);
  }
  if (log.kfRemoved.length) console.log(`  删除本地 keyframes：${log.kfRemoved.join(', ')}`);
  console.log(`  时长统一 ${log.durChanged} 处 / 缓动统一 ${log.easeChanged} 处`);
}

console.log(`\n${'='.repeat(60)}`);
console.log(`${APPLY ? '已落盘' : 'DRY-RUN（未写入，加 --apply 生效）'}`);
console.log(`  涉及文件        ${files}`);
console.log(`  animation 重定向 ${totalRenamed} 处`);
console.log(`  删除本地 keyframes ${totalKf} 个`);
console.log(`  wxss 净减        ${bytesSaved} 字节`);
if (skippedNames.size) {
  console.log(`\n  ⚠️ 未映射的 animation-name（保持原样，需人工确认）：`);
  console.log(`     ${[...skippedNames].join(', ')}`);
}
console.log('');
