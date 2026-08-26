#!/usr/bin/env node
/* add-breathe.js — 为空状态图标注入「纯光呼吸」（品牌/氛围面，opacity-only 最克制）
 * 用法：
 *   node scripts/add-breathe.js --dry
 *   node scripts/add-breathe.js --apply
 * 设计铁律（见 motion.wxss P3 注释）：
 *   - 仅品牌/氛围面；空状态图标用 zy-breathe-glow（不改缩放，避免位移）
 *   - 复用中央 .zy-breathe-glow 工具类（已在 motion.wxss 完整定义）
 *   - 一屏内空状态为单例，无需相位错开
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const APPLY = process.argv.includes('--apply');
const DRY = process.argv.includes('--dry') || !APPLY;

// 扫描全部页面 wxss（主包 + 分包）
function collectWxss() {
  const out = [];
  function walk(dir) {
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const e of ents) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name.startsWith('.') && e.name !== '.workbuddy') continue;
        walk(p);
      } else if (e.name.endsWith('.wxss')) {
        out.push(p);
      }
    }
  }
  walk(path.join(ROOT, 'pages'));
  walk(path.join(ROOT, 'subpackages'));
  return out;
}

function injectBreathe(wxss, cls) {
  const re = new RegExp('\\.(' + cls.replace(/[-]/g, '\\-') + ')\\s*\\{');
  if (!re.test(wxss)) return { out: wxss, changed: false };
  // 该规则已含 animation 则跳过
  const block = wxss.match(new RegExp('\\.' + cls.replace(/[-]/g, '\\-') + '\\s*\\{[^}]*\\}'));
  if (block && /animation\s*:/.test(block[0])) return { out: wxss, changed: false };
  const next = wxss.replace(re, (mm) => `${mm}\n  animation: zy-breathe-glow 4000ms ease-in-out infinite;`);
  return { out: next, changed: next !== wxss };
}

let count = 0;
const report = [];
for (const file of collectWxss()) {
  let src = fs.readFileSync(file, 'utf8');
  // 优先 .empty-icon，退化到 .empty-icon--svg
  let r = injectBreathe(src, 'empty-icon');
  if (!r.changed) r = injectBreathe(r.out, 'empty-icon--svg');
  if (r.changed) {
    if (APPLY) fs.writeFileSync(file, r.out, 'utf8');
    count += 1;
    report.push(`✅ ${path.relative(ROOT, file)}`);
  }
}

console.log(report.length ? report.join('\n') : '（无空状态图标需处理）');
console.log(`\n模式：${APPLY ? 'APPLY（已写盘）' : 'DRY（预览）'}  注入空状态呼吸页数=${count}`);
