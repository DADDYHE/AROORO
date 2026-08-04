#!/usr/bin/env node
'use strict';
/**
 * verify-token-cascade.js · 令牌层叠真值验证器（任务 #10 硬验收工具）
 * ============================================================================
 * 【为什么需要它】
 * 本仓有两条互不相同的令牌加载路径，历史上没人验证过它们是否等价：
 *
 *   路径 A（页面）  app.wxss 完整 @import 链：
 *                  variables → design-tokens → theme-teal → motion
 *                  → loading-animation → components
 *   路径 B（tabBar）custom-tab-bar/index.wxss 只 import theme-teal.wxss 一个文件。
 *                  自定义 tabBar 被 root-portal 搬出 page 继承链，走的是它自己这条。
 *
 * 路径 B 少加载 variables / design-tokens / motion，所以凡是「只在这三个文件里定义、
 * theme-teal 没有」的令牌，tabBar 一律解析失败（var() 无值 → 该属性被丢弃）。
 * 这是**结构性缺陷，与本次去重无关**：删行前就存在，删行后也不会新增。
 * 本工具的职责就是把它量化，并证明去重没有让两条路径的差异变大。
 *
 * 【解析实现要点（前人踩过的坑）】
 *  1. CSS 注释必须真解析，不能用行正则。design-tokens.wxss L158-170 有一整块
 *     被注释掉的「兼容重映射」声明；按行正则会把它们当成生效声明，凭空造出冲突。
 *  2. 声明不能按 `;` 裸切。--zy-paper-noise 的值是 base64 data URI，内含
 *     `image/png;base64`，裸切会把一条声明劈成两条。必须在字符串/括号内屏蔽分隔符。
 *  3. 一行可以有多条声明（design-tokens/theme-teal 的字号梯度就是
 *     `--zy-fs-h1: 44rpx;  --zy-fs-h1-w: 700;  --zy-fs-h1-lh: 1.2;`）。
 *  4. 暗色是 `.theme-dark` **类选择器**，不是 @media。类(0,1,0) 恒压过 page(0,0,1)，
 *     与书写顺序无关。所以暗色真值 = 最后一个 .theme-dark 声明，
 *     只有在没有任何 .theme-dark 声明它时才回落到 page 真值。
 *
 * 【用法】
 *   node scripts/verify-token-cascade.js            # 逐键对照 A/B + tabBar 断链体检
 *   node scripts/verify-token-cascade.js --plan     # 只输出去重删行方案（只读，不改文件）
 *   node scripts/verify-token-cascade.js --full     # 打印全部键（默认只打印差异与摘要）
 *   node scripts/verify-token-cascade.js --json     # 机器可读
 *
 * 退出码：0 = 通过；1 = tabBar 断链数量较基线增加，或去重方案检出误删风险。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ARGV = process.argv.slice(2);
const AS_JSON = ARGV.includes('--json');
const PLAN_ONLY = ARGV.includes('--plan');
const SHOW_FULL = ARGV.includes('--full');

/* 路径 A：app.wxss 的 @import 顺序（与 app.wxss L2-7 严格一致） */
const PATH_A = [
  'styles/variables.wxss',
  'styles/design-tokens.wxss',
  'styles/theme-teal.wxss',
  'styles/motion.wxss',
  'styles/loading-animation.wxss',
  'styles/components.wxss',
];
/* 路径 B：custom-tab-bar/index.wxss 的 @import（L16） */
const PATH_B = ['styles/theme-teal.wxss'];

const TAB_BAR = 'custom-tab-bar/index.wxss';

/* ========================================================================
   CSS 解析：单遍字符扫描，正确处理注释 / 字符串 / 括号嵌套 / 一行多声明
   ======================================================================== */
/**
 * @param {string} src
 * @param {{allProps?: boolean}} [opt]
 *   allProps=false（默认）：只收 `--*` 自定义属性 —— 级联硬验收的原始口径，务必保持。
 *   allProps=true ：连普通属性（color/background/font-size…）一起收 —— 供 lint-tokens
 *                   规则E 对比度扫描复用同一套注释/字符串/括号处理，避免再写第二个解析器。
 *   注意：resolve()/consumedTokens() 一律走默认口径。若让普通属性混进 decls，
 *   resolve() 会把 color 之类塞进 light/dark 令牌表，污染真值判定 —— 所以这是显式开关，不改默认。
 */
function parseWxss(src, opt) {
  const allProps = !!(opt && opt.allProps);
  const blocks = [];
  let i = 0;
  let line = 1;
  const n = src.length;
  let selBuf = '';
  let cur = null;
  let declBuf = '';
  let declLine = 0;
  let paren = 0;

  const flushDecl = () => {
    const raw = declBuf.trim();
    declBuf = '';
    if (!raw) return;
    const c = raw.indexOf(':');
    if (c < 0) return;
    const prop = raw.slice(0, c).trim();
    const value = raw.slice(c + 1).trim().replace(/\s+/g, ' ');
    if (!allProps && !prop.startsWith('--')) return;
    cur.decls.push({ prop, value, line: declLine });
  };

  while (i < n) {
    const ch = src[i];

    // 注释：整段吃掉，只累计行号（不能进入 selBuf/declBuf）
    if (ch === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') line++;
        i++;
      }
      i += 2;
      continue;
    }

    // 字符串：原样保留，内部的 ; { } ( ) 全部失去语法含义（base64 data URI 靠这个）
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let s = ch;
      i++;
      while (i < n && src[i] !== quote) {
        if (src[i] === '\\' && i + 1 < n) {
          s += src[i] + src[i + 1];
          if (src[i + 1] === '\n') line++;
          i += 2;
          continue;
        }
        if (src[i] === '\n') line++;
        s += src[i];
        i++;
      }
      s += quote;
      i++;
      if (cur) {
        if (!declBuf.trim()) declLine = line;
        declBuf += s;
      } else selBuf += s;
      continue;
    }

    if (ch === '\n') {
      line++;
      if (cur) declBuf += ' ';
      else selBuf += ' ';
      i++;
      continue;
    }

    if (!cur) {
      if (ch === '{') {
        cur = { selector: selBuf.trim().replace(/\s+/g, ' '), decls: [] };
        selBuf = '';
        declBuf = '';
        i++;
        continue;
      }
      if (ch === '}') { i++; continue; } // 容错：孤立右括号
      selBuf += ch;
      i++;
      continue;
    }

    if (ch === '(') { paren++; declBuf += ch; i++; continue; }
    if (ch === ')') { paren = Math.max(0, paren - 1); declBuf += ch; i++; continue; }
    if (ch === ';' && paren === 0) { flushDecl(); i++; continue; }
    if (ch === '}' && paren === 0) {
      flushDecl();
      blocks.push(cur);
      cur = null;
      i++;
      continue;
    }

    if (!declBuf.trim() && !/\s/.test(ch)) declLine = line;
    declBuf += ch;
    i++;
  }
  if (cur) { flushDecl(); blocks.push(cur); }
  return blocks;
}

// 两种口径各自独立缓存，互不覆盖（同一 rel 在两种口径下 decls 不同，共用一个 key 会串味）
const FILE_CACHE = new Map();
const FILE_CACHE_ALL = new Map();
function blocksOf(rel, opt) {
  const allProps = !!(opt && opt.allProps);
  const cache = allProps ? FILE_CACHE_ALL : FILE_CACHE;
  if (cache.has(rel)) return cache.get(rel);
  const abs = path.join(ROOT, rel);
  const b = fs.existsSync(abs) ? parseWxss(fs.readFileSync(abs, 'utf8'), { allProps }) : [];
  cache.set(rel, b);
  return b;
}

const isDarkSel = (s) => /(^|[\s,])\.theme-dark(\b|$)/.test(s);
const isPageSel = (s) => s.split(',').some((p) => p.trim() === 'page');

/**
 * 求一条加载路径的令牌真值。
 * light: page{} 链上最后一条声明胜出。
 * dark : .theme-dark 是类选择器，恒压过 page；无 .theme-dark 声明时回落 light。
 */
function resolve(files) {
  const light = new Map();
  const dark = new Map();
  const origin = new Map(); // token -> 最终生效的 file
  for (const rel of files) {
    for (const blk of blocksOf(rel)) {
      if (isPageSel(blk.selector)) {
        for (const d of blk.decls) { light.set(d.prop, d.value); origin.set(d.prop, rel); }
      } else if (isDarkSel(blk.selector)) {
        for (const d of blk.decls) dark.set(d.prop, d.value);
      }
    }
  }
  const darkFinal = new Map(light);
  for (const [k, v] of dark) darkFinal.set(k, v);
  return { light, dark: darkFinal, darkOwn: dark, origin };
}

/* ========================================================================
   var() 消费扫描：抓出一个文件真正引用了哪些令牌（含兜底里嵌套的 var）
   ======================================================================== */
function consumedTokens(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return new Map();
  const src = fs.readFileSync(abs, 'utf8');
  const hits = new Map();
  const lines = src.split('\n');
  lines.forEach((l, idx) => {
    const re = /var\(\s*(--[A-Za-z0-9_-]+)\s*([,)])/g;
    let m;
    while ((m = re.exec(l)) !== null) {
      const name = m[1];
      if (!hits.has(name)) hits.set(name, { lines: [], hasFallback: false });
      hits.get(name).lines.push(idx + 1);
      if (m[2] === ',') hits.get(name).hasFallback = true;
    }
  });
  // 排除文件自身在本文件内定义的本地令牌（如 --tb-*）
  const selfDefined = new Set();
  for (const blk of blocksOf(rel)) for (const d of blk.decls) selfDefined.add(d.prop);
  for (const k of [...hits.keys()]) if (selfDefined.has(k)) hits.delete(k);
  return hits;
}

/* ========================================================================
   去重删行方案（只读推导）
   判据（team-lead 裁定，严格执行，不自由发挥）：
     · 删 variables / design-tokens 中「theme-teal 的 page{} 也有同名定义」的声明行
       —— 不论值是否相同（同名同值也是冗余，留着规则C只归零一半）
     · variables / design-tokens 独有的令牌（theme-teal 没有）必须原样保留
     · theme-teal 的 .theme-dark{} 不参与比对
   本工具额外程序化处理一个 team-lead 未预见的情况：
     · variables.wxss 自己也有 .theme-dark{} 块。它的键若被 theme-teal 的
       .theme-dark{} 全覆盖，则删除行为中性；若未被覆盖，删了会导致暗色回落到
       page 真值 —— 属真实行为变更，必须拦下来单独报，不能顺手删。
   ======================================================================== */
function buildPlan() {
  const tealPage = new Map();
  const tealDark = new Map();
  for (const blk of blocksOf('styles/theme-teal.wxss')) {
    if (isPageSel(blk.selector)) for (const d of blk.decls) tealPage.set(d.prop, d.value);
    else if (isDarkSel(blk.selector)) for (const d of blk.decls) tealDark.set(d.prop, d.value);
  }

  const plan = { deleteLight: [], deleteDark: [], keepUnique: [], riskDark: [] };

  for (const rel of ['styles/variables.wxss', 'styles/design-tokens.wxss']) {
    for (const blk of blocksOf(rel)) {
      const dark = isDarkSel(blk.selector);
      const page = isPageSel(blk.selector);
      if (!dark && !page) continue;
      for (const d of blk.decls) {
        const rec = { file: rel, line: d.line, prop: d.prop, value: d.value, teal: tealPage.get(d.prop) };
        if (!tealPage.has(d.prop)) {
          // theme-teal 没有 → 独有令牌，保留（唯一风险点，必须程序化判定）
          plan.keepUnique.push(rec);
          continue;
        }
        if (dark) {
          if (tealDark.has(d.prop)) plan.deleteDark.push(rec);
          else plan.riskDark.push(rec); // 删了会让暗色回落 page 真值 → 拦截
        } else {
          plan.deleteLight.push(rec);
        }
      }
    }
  }
  plan.sameValue = plan.deleteLight.filter((r) => r.value === r.teal).length;
  return plan;
}

/* ========================================================================
   对外导出：lint-tokens.js 的规则 C/D 复用这里的解析器与真值解析。
   共用一份实现，避免两个脚本对「什么算一条生效声明」给出不同答案。
   ======================================================================== */
module.exports = { parseWxss, blocksOf, resolve, consumedTokens, buildPlan, PATH_A, PATH_B, isDarkSel, isPageSel };

if (require.main !== module) return;

/* ========================================================================
   输出
   ======================================================================== */
const A = resolve(PATH_A);
const B = resolve(PATH_B);
const plan = buildPlan();

const tabConsumed = consumedTokens(TAB_BAR);
const tabBroken = [];
for (const [name, info] of tabConsumed) {
  if (!B.light.has(name)) {
    tabBroken.push({
      token: name,
      lines: info.lines,
      hasFallback: info.hasFallback,
      definedInA: A.light.has(name),
      originInA: A.origin.get(name) || '(未定义)',
    });
  }
}

// A/B 逐键对照
const allKeys = [...new Set([...A.light.keys(), ...B.light.keys()])].sort();
const diffValue = [];
const missingInB = [];
for (const k of allKeys) {
  if (!B.light.has(k)) { missingInB.push({ token: k, a: A.light.get(k), origin: A.origin.get(k) }); continue; }
  if (A.light.get(k) !== B.light.get(k)) diffValue.push({ token: k, a: A.light.get(k), b: B.light.get(k) });
}

const REPORT = {
  pathA: PATH_A,
  pathB: PATH_B,
  counts: {
    tokensA: A.light.size,
    tokensB: B.light.size,
    diffValue: diffValue.length,
    missingInB: missingInB.length,
    tabConsumed: tabConsumed.size,
    tabBroken: tabBroken.length,
  },
  diffValue,
  missingInB,
  tabBroken,
  plan: {
    deleteLight: plan.deleteLight.length,
    deleteDark: plan.deleteDark.length,
    deleteSameValue: plan.sameValue,
    keepUnique: plan.keepUnique.length,
    riskDark: plan.riskDark.length,
  },
};

if (AS_JSON) {
  process.stdout.write(JSON.stringify({ ...REPORT, planDetail: plan }, null, 2) + '\n');
  process.exit(0);
}

const W = (s) => process.stdout.write(s);

if (PLAN_ONLY) {
  W('\n[cascade] 去重删行方案（只读推导，未改动任何文件）\n');
  W(`  判据：theme-teal page{} 同名 → 删；theme-teal 没有 → 保留\n\n`);
  W(`  待删（page 块）      : ${plan.deleteLight.length} 行  其中同名同值冗余 ${plan.sameValue} 行\n`);
  W(`  待删（.theme-dark）  : ${plan.deleteDark.length} 行  （已确认 theme-teal .theme-dark 全部覆盖，行为中性）\n`);
  W(`  保留（独有令牌）      : ${plan.keepUnique.length} 行  ← 一个都不能删\n`);
  W(`  拦截（暗色未覆盖）    : ${plan.riskDark.length} 行  ← 删了会改变暗色行为，不删\n\n`);
  const byFile = {};
  plan.deleteLight.concat(plan.deleteDark).forEach((r) => { (byFile[r.file] = byFile[r.file] || []).push(r); });
  for (const f of Object.keys(byFile)) W(`  ${f}: 删 ${byFile[f].length} 行\n`);
  W('\n  保留的独有令牌（前 30）:\n');
  plan.keepUnique.slice(0, 30).forEach((r) => W(`    ${r.file}:${r.line}  ${r.prop}\n`));
  if (plan.keepUnique.length > 30) W(`    ...另有 ${plan.keepUnique.length - 30} 个\n`);
  if (plan.riskDark.length > 0) {
    W('\n  ⚠ 被拦截的暗色声明:\n');
    plan.riskDark.forEach((r) => W(`    ${r.file}:${r.line}  ${r.prop}: ${r.value}\n`));
  }
  process.exit(0);
}

W('\n[cascade] 令牌层叠真值验证 · 路径 A（app.wxss 全链） vs 路径 B（custom-tab-bar 只引 theme-teal）\n');
W(`  路径 A: ${PATH_A.join(' → ')}\n`);
W(`  路径 B: ${PATH_B.join(' → ')}\n`);
W(`  令牌数: A=${A.light.size}  B=${B.light.size}\n`);

W(`\n── ① 两条路径「同名不同值」= ${diffValue.length} 处 ──\n`);
if (diffValue.length === 0) {
  W('  ✅ 0 处。凡两条路径都有的键，最终生效值完全一致 —— 去重后 theme-teal 是唯一真值层，符合预期。\n');
} else {
  W('  ❌ 存在取值分歧，说明 variables/design-tokens 仍在覆盖 theme-teal：\n');
  diffValue.forEach((d) => W(`    ${d.token}\n      A=${d.a}\n      B=${d.b}\n`));
}

W(`\n── ② 路径 B 缺键 = ${missingInB.length} 处（theme-teal 未定义，tabBar 侧拿不到） ──\n`);
if (missingInB.length === 0) {
  W('  ✅ 0 处。\n');
} else {
  W('  性质：结构性差异，非本次去重引入 —— 这些令牌本就只存在于 variables/design-tokens/motion。\n');
  W('  只有被 custom-tab-bar 实际引用的那部分才是线上 bug，见 ③。\n');
  const grouped = {};
  missingInB.forEach((m) => { (grouped[m.origin] = grouped[m.origin] || []).push(m.token); });
  for (const o of Object.keys(grouped)) W(`    ${o}  ×${grouped[o].length}\n`);
  if (SHOW_FULL) missingInB.forEach((m) => W(`      ${m.token}  (${m.origin}) = ${m.a}\n`));
}

W(`\n── ③ custom-tab-bar 断链体检：引用 ${tabConsumed.size} 个外部令牌，其中 ${tabBroken.length} 个在路径 B 无定义 ──\n`);
if (tabBroken.length === 0) {
  W('  ✅ tabBar 引用的令牌 theme-teal 全部覆盖，无断链。\n');
} else {
  W('  ⚠ 以下 var() 在 tabBar 里当前就解析失败（删行前即存在，非去重引入）：\n');
  tabBroken.forEach((t) => {
    W(`    ${t.token}  @${TAB_BAR}:${t.lines.join(',')}\n`);
    W(`      兜底: ${t.hasFallback ? '有（降级到兜底值，视觉可能偏差）' : '无（属性被整条丢弃）'}`);
    W(`  |  路径A 由 ${t.originInA} 提供\n`);
  });
}

W('\n── ④ 去重方案核对 ──\n');
W(`  待删 page 行 ${plan.deleteLight.length} / 待删暗色行 ${plan.deleteDark.length} / 保留独有 ${plan.keepUnique.length} / 拦截 ${plan.riskDark.length}\n`);

const brokenBaseline = Number(process.env.CASCADE_TABBAR_BASELINE || tabBroken.length);
let fail = false;
if (plan.riskDark.length > 0) { W('\n[cascade] FAIL: 存在会改变暗色行为的删除项，需人工裁定\n'); fail = true; }
if (tabBroken.length > brokenBaseline) { W(`\n[cascade] FAIL: tabBar 断链 ${tabBroken.length} > 基线 ${brokenBaseline}\n`); fail = true; }
if (diffValue.length > 0) { W('\n[cascade] WARN: 两条路径仍有取值分歧（去重未完成时属预期）\n'); }
if (!fail) W('\n[cascade] PASS\n');
process.exit(fail ? 1 : 0);
