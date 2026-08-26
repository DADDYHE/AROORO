#!/usr/bin/env node
/* add-micro.js v3 — 为「微交互缺口」页注入 transition + 按压态（hover-class 驱动）
 * 用法：
 *   node scripts/add-micro.js --dry    预览（不写盘）
 *   node scripts/add-micro.js --apply  写盘
 *
 * 铁律（沿用 common.wxss 已验证范式）：
 *   ① 带入场动画（animation 且非 infinite，即 forwards 入场）的整卡，transform 被锁死，
 *      press 只能走 background / border / box-shadow，绝不可注入 transform 过渡或 scale。
 *   ② 叶子级可点元素（无入场）才允许 transform + scale(0.97) 按压。
 *   ③ press 要真正生效，wxml 元素必须有 hover-class（Skyline 无 :active）。
 *
 * 统一按压机制（兼容三种既有写法，避免引入第二套）：
 *   - 类已有 `.X.pressed`（JS 风格，常为死 CSS）→ hover-class="X pressed" 让死规则复活；
 *   - 类已有 `.X--pressed`（hover 风格）→ hover-class="X--pressed"；
 *   - 两者皆无 → 新增 `.X--pressed`（按 ①② 分支）+ hover-class="X--pressed"。
 * 过渡对「全部可点 class」注入（按 ①② 分支），确保审计微交互缺口闭合。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const APPLY = process.argv.includes('--apply');
const DRY = process.argv.includes('--dry') || !APPLY;

const TARGETS = [
  'subpackages/booking/host-list-all',
  'subpackages/booking/host-detail',
  'subpackages/profile/login/index',
  'subpackages/profile/notification/list',
  'subpackages/profile/order-stats/index',
  'subpackages/profile/mall-order-detail/index',
  'subpackages/profile/order-detail/index',
  'subpackages/feeding/order-status',
  'subpackages/partner/withdrawal/index',
];

const PRESS_RE = /(btn|button|action|tap|card|item|row|tab|tag|chip|cell|option|wrapper|contact|entry)/i;

function findWxss(base) {
  for (const f of [`${base}.wxss`, `${base}/index.wxss`]) {
    if (fs.existsSync(path.join(ROOT, f))) return path.join(ROOT, f);
  }
  return null;
}
function findWxml(base) {
  for (const f of [`${base}.wxml`, `${base}/index.wxml`]) {
    if (fs.existsSync(path.join(ROOT, f))) return path.join(ROOT, f);
  }
  return null;
}

function tappableElements(wxml) {
  const els = [];
  const tagRe = /<[a-zA-Z][^>]*?(?:bindtap|catchtap|bind:tap)=[^>]*?>/g;
  let m;
  while ((m = tagRe.exec(wxml))) {
    const tag = m[0];
    const cm = tag.match(/class="([^"]*)"/);
    const classes = cm ? cm[1].split(/\s+/).filter(Boolean) : [];
    els.push({ tag, classes });
  }
  return els;
}

function ruleBlock(wxss, cls) {
  const re = new RegExp('\\.' + cls.replace(/[-]/g, '\\-') + '\\s*\\{[^}]*\\}', 'g');
  const mm = re.exec(wxss);
  return mm ? mm[0] : null;
}

function hasEntrance(wxss, cls) {
  const block = ruleBlock(wxss, cls);
  if (!block) return false;
  if (!/animation\s*:/.test(block) && !/animation-name\s*:/.test(block)) return false;
  if (/infinite/.test(block)) return false;
  return true;
}

function pressMechanism(wxss, cls) {
  if (new RegExp('\\.' + cls.replace(/[-]/g, '\\-') + '\\.pressed\\s*\\{').test(wxss)) return 'js';
  if (new RegExp('\\.' + cls.replace(/[-]/g, '\\-') + '--pressed\\s*\\{').test(wxss)) return 'css';
  return 'none';
}

function ensureTransition(wxss, classes, entranceSet) {
  let out = wxss;
  const added = [];
  for (const cls of classes) {
    if (!/^[a-zA-Z_][\w-]*$/.test(cls)) continue;
    const re = new RegExp('\\.' + cls.replace(/[-]/g, '\\-') + '\\s*\\{', 'g');
    if (!re.test(out)) continue;
    re.lastIndex = 0;
    const block = ruleBlock(out, cls);
    if (block && /transition\s*:/.test(block)) continue;
    const trans = entranceSet.has(cls)
      ? 'transition: background-color 180ms ease, border-color 180ms ease, box-shadow 180ms ease;'
      : 'transition: transform 160ms ease, opacity 160ms ease;';
    out = out.replace(re, (mm) => `${mm}\n  ${trans}`);
    added.push(cls);
  }
  return { out, added };
}

function appendPressed(wxss, needNew) {
  const present = new Set();
  const re = /([\w-]+)--pressed\s*\{/g;
  let m;
  while ((m = re.exec(wxss))) present.add(m[1]);
  const lines = ['', '/* ── 微交互：按压态（hover-class 复用，详见 app.wxss 约定）── */'];
  let any = false;
  for (const { cls, entrance } of needNew) {
    if (present.has(cls)) continue;
    if (entrance) {
      lines.push(
        `.${cls}--pressed {\n` +
        '  background-color: var(--primary-wash, #F2F5EC);\n' +
        '  border-color: var(--lux-hairline-green, rgba(31, 58, 31, 0.12));\n' +
        '  box-shadow: var(--shadow-glow-primary-xs, 0 4rpx 16rpx rgba(31, 58, 31, 0.10));\n' +
        '}'
      );
    } else {
      lines.push(`.${cls}--pressed { transform: scale(0.97); opacity: 0.92; }`);
    }
    any = true;
  }
  return any ? wxss + lines.join('\n') + '\n' : wxss;
}

function injectHoverClass(wxml, map) {
  // map: className -> hoverClass string
  const parts = wxml.split(/(<[^>]+>)/g);
  let changed = false;
  for (let i = 0; i < parts.length; i++) {
    const tag = parts[i];
    if (!tag.startsWith('<')) continue;
    if (!/(?:bindtap|catchtap|bind:tap)=/.test(tag)) continue;
    if (/hover-class=/.test(tag)) continue;
    const cm = tag.match(/class="([^"]*)"/);
    if (!cm) continue;
    const classes = cm[1].split(/\s+/).filter(Boolean);
    const pressClass = classes.find((c) => map.has(c));
    if (!pressClass) continue;
    const insert = ` hover-class="${map.get(pressClass)}" hover-stay-time="80"`;
    parts[i] = tag.replace(/>$/, `${insert}>`);
    changed = true;
  }
  return { wxml: parts.join(''), changed };
}

let totalTrans = 0;
let totalHover = 0;
const report = [];

for (const base of TARGETS) {
  const wxssPath = findWxss(base);
  const wxmlPath = findWxml(base);
  if (!wxssPath || !wxmlPath) {
    report.push(`⚠️ 跳过 ${base}（缺 wxss/wxml）`);
    continue;
  }
  const wxml0 = fs.readFileSync(wxmlPath, 'utf8');
  const before = fs.readFileSync(wxssPath, 'utf8');

  const els = tappableElements(wxml0);
  if (!els.length) {
    report.push(`• ${base}：无 tap 元素，跳过`);
    continue;
  }

  const allClasses = new Set();
  els.forEach((e) => e.classes.forEach((c) => allClasses.add(c)));
  const entranceSet = new Set();
  for (const c of allClasses) if (hasEntrance(before, c)) entranceSet.add(c);

  const { out: afterTrans, added } = ensureTransition(before, allClasses, entranceSet);

  // 为每个可点元素确定按压机制与 hover-class
  const hoverMap = new Map(); // className -> hoverClass
  const needNew = []; // { cls, entrance }
  const addedNew = new Set(); // 防止同 class 因多元素重复进入 needNew（否则 --pressed 会被追加多次）
  for (const el of els) {
    const pressClass = el.classes.find((c) => PRESS_RE.test(c));
    if (!pressClass) continue;
    const mech = pressMechanism(afterTrans, pressClass);
    let hoverClass;
    if (mech === 'js') hoverClass = `${pressClass} pressed`;
    else if (mech === 'css') hoverClass = `${pressClass}--pressed`;
    else {
      hoverClass = `${pressClass}--pressed`;
      if (!addedNew.has(pressClass)) {
        addedNew.add(pressClass);
        needNew.push({ cls: pressClass, entrance: entranceSet.has(pressClass) });
      }
    }
    hoverMap.set(pressClass, hoverClass);
  }

  const afterPressed = appendPressed(afterTrans, needNew);
  const { wxml: wxml1, changed: hoverChanged } = injectHoverClass(wxml0, hoverMap);

  const wxssChanged = afterPressed !== before;
  if (wxssChanged && APPLY) fs.writeFileSync(wxssPath, afterPressed, 'utf8');
  if (hoverChanged && APPLY) fs.writeFileSync(wxmlPath, wxml1, 'utf8');
  if (wxssChanged) totalTrans += added.length;
  if (hoverChanged) totalHover += 1;

  const hoverSummary = [...hoverMap.entries()].map(([k, v]) => `${k}→${v}`).join(', ');
  report.push(
    `✅ ${base}：过渡类=${added.length}（入场整卡=${[...entranceSet].filter((c) => PRESS_RE.test(c)).join(',') || '无'}）；` +
    `hover 映射=[${hoverSummary}]；写盘=${hoverChanged ? '是' : '否/已有'}`
  );
}

console.log(report.join('\n'));
console.log(
  `\n模式：${APPLY ? 'APPLY（已写盘）' : 'DRY（预览）'}  注入过渡类数=${totalTrans}  wxml hover 改动页数=${totalHover}`
);
