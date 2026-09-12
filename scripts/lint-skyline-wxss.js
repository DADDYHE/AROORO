#!/usr/bin/env node
'use strict';
/**
 * lint-skyline-wxss.js — Skyline 渲染器兼容门控守卫
 * ----------------------------------------------------------------------------
 * 立项原因：`pages/home/index.wxss` 的 `max-width: none` 被 Skyline **整条丢弃**，
 * 导致基础规则的 `max-width: calc(50% - 24rpx)` 复活、宠物卡静默变半宽、**零运行时报错**
 * （2026-09-12 排查）。这类"不支持的属性/值 = 声明被静默忽略 → 上一条规则复活"的回归
 * 只能靠静态门控拦住，人眼和落地还原图都看不出来（Chrome 认的值 Skyline 未必认）。
 *
 * 判据来源：官方文档《Skyline 渲染引擎 / 支持与差异 / WXSS 样式》
 *   https://developers.weixin.qq.com/miniprogram/dev/framework/runtime/skyline/wxss.html
 * 关键几条（照抄文档，勿凭记忆改）：
 *   · min-width / min-height / max-width / max-height  **支持格式只有 `<length>`**
 *     —— 写 none / auto / unset / initial / inherit 会被丢弃（回落到默认值）。
 *     这就是 `max-width: none` 那条警告的性质：不是无害警告，是真实回归。
 *   · position 只支持 relative / absolute / fixed；文档明确写「sticky 可使用
 *     sticky-header/sticky-section 替代」→ **position: sticky 不生效**。
 *   · overflow 只支持 hidden / visible（scroll 不支持），且**不支持单独设置 overflow-x/y**。
 *   · display 只支持 none / flex / block（+ inline-flex）；**没有 BFC / Inline / Block 布局
 *     的 grid / table**，inline 布局仅限 text 组件内嵌套。
 *   · 选择器：**通配选择器 `*` 与属性选择器 `[attr]` 不支持**。
 *   · `<color>` 不支持 currentColor；`box-shadow` 不支持多值叠加；
 *     filter 不支持 drop-shadow；animation-fill-mode 不支持 backwards；
 *     `<length>` 不支持 em；font-size 不支持百分比。
 *
 * 分档（与 lint-tokens.js 同构）——**分档依据 = 失败的"静默程度"**：
 *   静默回归（声明被丢弃 → 上一条规则复活，无任何报错）→ BLOCK；
 *   功能失效但肉眼立刻可见（如 sticky 不吸顶）→ WARN，可排期。
 *   【规则 A · BLOCK】静默回归 / 规则整条不生效 —— 命中即 exit 1
 *     A1 min/max 尺寸写了非 length 值（none/auto/unset/initial/inherit/revert）
 *     A2 overflow 写了 auto / scroll / overlay（内容直接被裁且不报错）
 *     A3 display: inline / inline-block / grid / table
 *     A4 选择器含通配 `*`（该规则整体不生效）
 *     A5 选择器含属性选择器 `[attr]`（该规则整体不生效）
 *     A6 position: static（会退回 relative，且保留基础规则的 top/left/bottom 偏移）
 *   【规则 B · WARN】失效但可见 / 需人工分诊（--strict 下也阻断）
 *     B1 position: sticky（改为 sticky-header / sticky-section，需结构调整）
 *     B2 overflow-x / overflow-y（不支持单独设置；inert 兜底 vs 真需滚动，逐条分诊）
 *     B3 box-shadow 多值      B4 filter: drop-shadow
 *     B5 animation-fill-mode: backwards           B6 background 多图
 *     B7 font-size 百分比      B8 float / clear     B9 currentColor
 *   【规则 C · INFO】版本门槛 / 文档与实测矛盾，不阻断
 *     C1 :nth-child / :not / :only-child / :empty（需微信 8.0.49 / 8.0.50+）
 *     C2 em 单位（文档 <length> 表标 ×，但本项目 letter-spacing 全量在用且开发者工具
 *        从未就此报警 —— 结论未定，**不许机械替换**，见正文注释）
 *
 * 注意：`overflow: hidden / visible` 是**支持**的，不在 A2 范围内。
 * 全库 235 条 overflow 命中里 229 条是 hidden —— 属误报，第一版把整个 overflow
 * 都判成 BLOCK，会把真信号（5 条 overflow-y: auto）淹掉，已修。
 *
 * 实现要点（踩过的坑，勿简写）：
 *   · **必须先剥注释与字符串再扫**：本项目习惯在注释里写「Skyline 兼容：无 sticky /
 *     无 backdrop-filter」自述，不剥注释会满屏假阳性。剥注释时保留换行，否则行号全错。
 *   · 选择器/声明都要过：选择器取自 `{` 前的 prelude，声明取块内 `;` 分段。
 *   · 块内含 `{` 说明是容器（@media / @keyframes），其内层节点单独成项。
 *
 * 用法：
 *   node scripts/lint-skyline-wxss.js            # CI 默认：规则 A 阻断
 *   node scripts/lint-skyline-wxss.js --strict   # 收口：规则 B 也阻断
 *   node scripts/lint-skyline-wxss.js --json     # 机器可读
 * 退出码：0 = 通过；1 = 规则 A 命中，或 --strict 下规则 B 未清零。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ARGV = process.argv.slice(2);
const STRICT = ARGV.includes('--strict');
const JSON_OUT = ARGV.includes('--json');
const SHOW_INFO = ARGV.includes('--info');

const EXCLUDE_DIRS = new Set([
  'node_modules', 'miniprogram_npm', '.git', '.workbuddy',
  'dist',                  // 构建产物，扫它只会得到打包后的噪音
  'docs', 'docs-archive',  // 历史文档：含大量已废弃写法
  'deliverables',          // 设计交付稿，非运行时样式
  'preview',               // 落地还原用的 HTML/CSS 外壳，不是小程序样式
  'scripts', 'web-admin',  // 工具脚本 / 独立 Vue 后台（无 wxss）
]);

/* ============================== 注释 / 字符串剥离 ============================== */

/** 把注释与字符串字面量替换成等长空格（保留 \n），这样索引→行号仍然准确 */
function mask(css) {
  const out = css.split('');
  const n = css.length;
  const blank = (s, e) => { for (let k = s; k < e; k++) if (out[k] !== '\n') out[k] = ' '; };
  let i = 0;
  while (i < n) {
    if (css[i] === '/' && css[i + 1] === '*') {
      const close = css.indexOf('*/', i + 2);
      const end = close === -1 ? n : close + 2;
      blank(i, end); i = end; continue;
    }
    if (css[i] === '"' || css[i] === "'") {
      const q = css[i];
      let j = i + 1;
      while (j < n && css[j] !== q) { if (css[j] === '\\') j++; j++; }
      const end = Math.min(j + 1, n);
      blank(i, end); i = end; continue;
    }
    i++;
  }
  return out.join('');
}

/* ================================= 解析 ================================= */

/** 扫出所有 {prelude} 块；body 内含 `{` 的判为容器（@media/@keyframes），只取内层节点 */
function parseBlocks(masked) {
  const items = [];
  const stack = [];
  let seg = 0;
  for (let i = 0; i < masked.length; i++) {
    const c = masked[i];
    if (c === '{') {
      const parent = stack[stack.length - 1];
      stack.push({ sel: masked.slice(seg, i).trim(), selStart: seg, bodyStart: i + 1, parentAt: parent ? parent.sel : '' });
      seg = i + 1;
    } else if (c === '}') {
      const top = stack.pop();
      if (top) items.push({ sel: top.sel, selStart: top.selStart, bodyStart: top.bodyStart, bodyEnd: i, parentAt: top.parentAt });
      seg = i + 1;
    } else if (c === ';') {
      seg = i + 1;
    }
  }
  return items;
}

/** 一层拆顶层逗号（括号内不算），用于 box-shadow / background 多值判定 */
function topLevelSplit(v, sep) {
  const parts = [];
  let depth = 0, cur = '';
  for (const ch of v) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === sep && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
  }
  parts.push(cur);
  return parts.map((s) => s.trim()).filter(Boolean);
}

/* ================================= 规则表 ================================= */

const SIZE_PROPS = new Set(['min-width', 'min-height', 'max-width', 'max-height']);
const BAD_SIZE_KEYWORD = /^(none|auto|unset|initial|inherit|revert)$/i;

const findings = [];   // { rule, level, file, line, col, text, note }
const push = (rule, level, file, loc, text, note) =>
  findings.push({ rule, level, file, line: loc.line, col: loc.col, text, note });

function lineCol(masked, idx) {
  const upto = masked.slice(0, idx);
  const line = upto.split('\n').length;
  const col = idx - (upto.lastIndexOf('\n') + 1) + 1;
  return { line, col };
}

function lintSelector(file, masked, sel, selStart) {
  if (!sel || sel.startsWith('@')) return;
  const loc = lineCol(masked, selStart);
  const flat = sel.replace(/\s+/g, ' ').trim();

  if (/(^|[,>+~])\s*[*]/.test(flat)) {
    push('A4', 'BLOCK', file, loc, flat,
      '通配选择器 `*` 不支持（文档「选择器支持」表）→ 该规则整体不生效。展开成具体 tag/class。');
  }
  if (/\[[^\]]*\]/.test(flat)) {
    push('A5', 'BLOCK', file, loc, flat,
      '属性选择器 `[attr]` 不支持（文档「选择器支持」表）→ 该规则整体不生效，' +
      '选中态/禁用态会静默丢失。改用 class 显式标注（wxml 里补一个动态 class）。');
  }
  if (/:(nth-child|not|only-child|empty)\b/.test(flat)) {
    push('C1', 'INFO', file, loc, flat,
      '需微信 8.0.49 / 8.0.50+（Skyline 1.3.0 / 1.3.3）。低版本会整条不匹配，谨慎依赖。');
  }
}

function lintDecl(file, masked, prop, value, idx) {
  // ⚠ prop 必须 trim：声明是按 `;` 切出来的，前面带着换行与缩进（`\n  min-height`），
  //   不 trim 会让所有按属性名判定的规则集体静默失效（本脚本第一版就栽在这）。
  const p = prop.trim().toLowerCase();
  const v = value.trim();
  if (!v) return;
  const loc = lineCol(masked, idx);
  const raw = p + ': ' + v + ';';
  // `!important` 只是修饰，判定时先摘掉（否则 `overflow: visible !important` 会被当成非法值误报）
  const val = v.replace(/\s*!important\s*$/i, '').trim();

  if (SIZE_PROPS.has(p) && BAD_SIZE_KEYWORD.test(val)) {
    return push('A1', 'BLOCK', file, loc, raw,
      `${p} 只接受 <length>；关键字会在 Skyline 被整条丢弃 → **上一条规则的值复活**（静默回归）。` +
      '取消下限/上限请写合法长度：min-* → 0；max-* → 100%（width 已定宽时等价于取消上限）。' +
      '只为抵消「平台默认值」且没有基础规则可复活时，直接删掉该行（auto 本来就是默认值）。');
  }
  if (p === 'overflow' && !/^(hidden|visible)$/.test(val)) {
    return push('A2', 'BLOCK', file, loc, raw,
      'overflow 只支持 hidden / visible（auto / scroll / overlay 均不支持，滚动必须交给 scroll-view）。' +
      '本该滚动却写在这里 → Skyline 下内容直接被裁掉且不报错。');
  }
  if (p === 'display' && /^(inline|inline-block|grid|inline-grid|table)$/.test(val)) {
    return push('A3', 'BLOCK', file, loc, raw, 'display 只支持 none / flex / block（+ inline-flex）。');
  }
  if (p === 'position' && val === 'static') {
    return push('A6', 'BLOCK', file, loc, raw,
      'position: static 未在支持列表 → 会退回 relative，且**基础规则的 top/left/right/bottom 变成相对偏移**。' +
      '想把绝对定位的元素改成"回到正常流"，正确写法是 `position: relative`（不设偏移时与 static 等效）。');
  }
  if (p === 'position' && val === 'sticky') {
    return push('B1', 'WARN', file, loc, raw,
      'position 只支持 relative / absolute / fixed；文档明确 sticky 须用 sticky-header / sticky-section 替代' +
      '（且必须作为 scroll-view 的直接子节点）→ 需结构调整，不能只改这一行。');
  }
  if (p === 'overflow-x' || p === 'overflow-y') {
    return push('B2', 'WARN', file, loc, raw,
      '不支持单独设置 overflow-x / overflow-y。逐条分诊：' +
      '①「防横向溢出」的兜底 → 在本引擎是 inert，删掉或换成约束子元素宽度；' +
      '②「本该滚动」的容器 → 必须换成 scroll-view（Skyline 下内容会被裁）。');
  }
  if (p === 'float' || p === 'clear') {
    return push('B8', 'WARN', file, loc, raw, 'float / clear 不在支持列表。');
  }
  if (/currentColor/i.test(val)) {
    return push('B9', 'WARN', file, loc, raw, '<color> 不支持 currentColor。');
  }
  if (p === 'box-shadow' && topLevelSplit(val, ',').length > 1) {
    return push('B3', 'WARN', file, loc, raw, 'box-shadow 不支持多值叠加，只留一条（挑主投影）。');
  }
  if (p === 'filter' && /drop-shadow/i.test(val)) {
    return push('B4', 'WARN', file, loc, raw, 'filter 不支持 drop-shadow()。');
  }
  if (p === 'animation-fill-mode' && val === 'backwards') {
    return push('B5', 'WARN', file, loc, raw, 'animation-fill-mode 不支持 backwards（表现同 forwards）。');
  }
  if (/(^|[\s(,:])[\d.]+em(?![\w-])/.test(val)) {
    // 文档 <length> 表标 em ×，但本项目 letter-spacing 全量用 em（870+ 处，且是品牌字距的
    // 基础表达），而开发者工具从未就 letter-spacing 报过 Unsupported —— 文档与实测相互矛盾。
    // 在开发者工具实证（编译首页，看有无 `letter-spacing: 0.06em` 的 Unsupported 警告）之前
    // **不许批量改写**：em 是相对单位，换算成 px 必须逐个按该处 font-size 计算，改错会全站字距失衡。
    return push('C2', 'INFO', file, loc, raw,
      'em：文档标不支持，但本项目 letter-spacing 全量在用且从未报警（矛盾，待实证）。' +
      '若确认不支持，只能逐处按 font-size 换算成 px，不可机械替换。');
  }
  if ((p === 'background' || p === 'background-image') && topLevelSplit(val, ',').length > 1) {
    return push('B6', 'WARN', file, loc, raw,
      '不支持多张背景图（多值简写同样不可靠）→ 多层里通常只有第一层（或整条）生效。');
  }
  if (p === 'font-size' && /%/.test(val)) {
    return push('B7', 'WARN', file, loc, raw, 'font-size 不支持百分比。');
  }
  return undefined;
}

/* ================================ 遍历 ================================ */

const files = [];
(function walk(abs, rel) {
  let entries;
  try { entries = fs.readdirSync(abs, { withFileTypes: true }); } catch (e) { return; }
  for (const e of entries) {
    const childRel = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) {
      if (EXCLUDE_DIRS.has(e.name)) continue;
      walk(path.join(abs, e.name), childRel);
    } else if (e.name.toLowerCase().endsWith('.wxss')) {
      files.push(childRel);
    }
  }
})(ROOT, '');

for (const rel of files.sort()) {
  const masked = mask(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  for (const blk of parseBlocks(masked)) {
    lintSelector(rel, masked, blk.sel, blk.selStart);
    const body = masked.slice(blk.bodyStart, blk.bodyEnd);
    if (body.includes('{')) continue;           // 容器（@media / @keyframes）：内层已成独立项
    if (blk.sel.startsWith('@')) continue;      // @font-face 等无选择器可言
    let seg = 0;
    for (let i = 0; i <= body.length; i++) {
      if (i !== body.length && body[i] !== ';') continue;
      const decl = body.slice(seg, i);
      const colon = decl.indexOf(':');
      if (colon > 0 && !decl.includes('{')) {
        // ⚠ 声明文本以「上一行末尾的换行 + 缩进」开头，直接用 seg 定位会落到**上一行**
        //   （行号差 1，与开发者工具报 max-width 时的表现同源：那边报 1732、实际 1733）。
        //   跳过前导空白，让行列落在属性名第一个字符上。
        const lead = decl.match(/^\s*/)[0].length;
        lintDecl(rel, masked, decl.slice(0, colon), decl.slice(colon + 1), blk.bodyStart + seg + lead);
      }
      seg = i + 1;
    }
  }
}

/* ================================ 输出 ================================ */

const ORDER = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9', 'C1', 'C2'];
const TITLE = {
  A1: 'min/max 尺寸写了非 <length> 值（上一条规则会复活）',
  A2: 'overflow: auto / scroll / overlay',
  A3: 'display 值不支持',
  A4: '通配选择器 *（规则整体不生效）',
  A5: '属性选择器 [attr]（规则整体不生效）',
  A6: 'position: static（退回 relative 并保留偏移）',
  B1: 'position: sticky 不生效', B2: 'overflow-x / overflow-y 单独设置',
  B3: 'box-shadow 多值', B4: 'filter: drop-shadow',
  B5: 'animation-fill-mode: backwards', B6: '多张背景图',
  B7: 'font-size 百分比', B8: 'float / clear', B9: 'currentColor',
  C1: '伪类需要高版本微信', C2: 'em 单位（文档标不支持，实测矛盾，待实证）',
};

const blocks = ORDER.map((r) => ({ rule: r, items: findings.filter((f) => f.rule === r) })).filter((b) => b.items.length);
const nA = findings.filter((f) => f.level === 'BLOCK').length;
const nB = findings.filter((f) => f.level === 'WARN').length;
const nC = findings.filter((f) => f.level === 'INFO').length;

if (JSON_OUT) {
  console.log(JSON.stringify({ scanned: files.length, summary: { BLOCK: nA, WARN: nB, INFO: nC }, findings }, null, 2));
  process.exit(nA || (STRICT && nB) ? 1 : 0);
}

console.log('lint-skyline-wxss · 扫描 %d 个 wxss（Skyline 兼容门控）', files.length);
console.log('判据：https://developers.weixin.qq.com/miniprogram/dev/framework/runtime/skyline/wxss.html\n');
// INFO 量级大（em 870+ / 伪类 130+，多为全站性既有写法），默认只报计数，
// 否则一次几百行细节会把 BLOCK/WARN 的真信号淹掉。要看细节加 --info。
const show = (SHOW_INFO ? blocks : blocks.filter((b) => b.rule[0] !== 'C'));
if (!show.length) {
  console.log('PASS · 无命中（BLOCK %d / WARN %d / INFO %d）%s', nA, nB, nC, nC && !SHOW_INFO ? '（INFO 明细加 --info）' : '');
} else {
  for (const b of show) {
    console.log('── [%s] %s  (%d)', b.rule, TITLE[b.rule] || '', b.items.length);
    for (const f of b.items) {
      console.log('   %s:%d:%d  %s', f.file, f.line, f.col, f.text);
      if (f.note) console.log('      → %s', f.note);
    }
    console.log('');
  }
  console.log('小计  BLOCK %d / WARN %d / INFO %d%s', nA, nB, nC,
    nC && !SHOW_INFO ? '（INFO 明细加 --info）' : '');
}
const fail = nA > 0 || (STRICT && nB > 0);
console.log(fail ? (STRICT ? 'FAIL（--strict）' : 'FAIL（规则 A 未清零）') : 'PASS');
process.exit(fail ? 1 : 0);
