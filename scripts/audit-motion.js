#!/usr/bin/env node
/**
 * audit-motion.js · 逐页动效审计（keyframe 溯源版）
 *
 * 为什么不能用布尔 grep：
 *   ① 页面可能用 app.wxss 全局 @import 进来的 zy-* 类（grep 页面 wxss 会漏）
 *   ② 分包页面可能用 subpackages/<pkg>/common.wxss 的共享类
 *   ③ 类定义在 A 文件、使用在 B 页面
 * 为什么不能按类名猜：
 *   页面常把 fadeInUp 挂在 .section-card / .hero 这类语义类上，
 *   靠类名正则判「是不是入场」会大面积漏判 → 必须溯源到 animation-name 指向的 keyframe。
 *
 * 判定链：wxml 用到的 class → 该 class 的 animation-name → keyframe 分类（入场/环境/加载）
 *
 * 用法：node scripts/audit-motion.js [--json] [--gap] [--page <route 子串>]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const OUT_JSON = args.includes('--json');
const ONLY_GAP = args.includes('--gap');
const pageIdx = args.indexOf('--page');
const PAGE_FILTER = pageIdx >= 0 ? args[pageIdx + 1] : null;

/* ---------- keyframe 语义分类（按名字，keyframe 名是稳定语义源） ---------- */
const KF_ENTER = /(fade-?in|slide-?in|scale-?in|reveal|rise|enter|drop-?in|zoom-?in|pop-?in|footer-rise|divider-grow|badge-pop|topbar-fade|hero)/i;
const KF_AMBIENT = /(breath|breathe|aurora|glow|halo|shimmer|pulse|shine|float|twinkle|sweep)/i;
const KF_LOADING = /(spin|rotate|skeleton|loading|dot|wave|bounce|progress)/i;
const KF_EXIT = /(out|exit|leave|dismiss|collapse)/i;

/* 弹窗层选择器：这一层的 reveal 不算「页面入场」——
   页面主体可能完全没有入场，却因为一个 modal 动画被误判为已覆盖 */
const POPUP_SEL = /(modal|popup|sheet|mask|overlay|dialog|toast|drawer|actionsheet|zy-popup)/i;

function classifyKf(name) {
  if (KF_EXIT.test(name) && !KF_ENTER.test(name)) return 'exit';
  if (KF_ENTER.test(name)) return 'enter';
  if (KF_AMBIENT.test(name)) return 'ambient';
  if (KF_LOADING.test(name)) return 'loading';
  return 'other';
}

/* ---------- 页面清单 ---------- */
function collectPages() {
  const appJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
  const pages = (appJson.pages || []).map((p) => ({ route: p, pkg: '(main)' }));
  for (const sp of appJson.subPackages || appJson.subpackages || []) {
    for (const p of sp.pages || []) {
      pages.push({ route: `${sp.root}/${p}`.replace(/\/+/g, '/'), pkg: sp.root });
    }
  }
  return pages;
}

/* ---------- 文件读取 & @import 展开 ---------- */
const readCache = new Map();
function readFileSafe(f) {
  if (readCache.has(f)) return readCache.get(f);
  let c = null;
  try { c = fs.readFileSync(f, 'utf8'); } catch (_) { c = null; }
  readCache.set(f, c);
  return c;
}

/** 展开 wxss（含 @import 链）；返回 { css, files:[] } */
function expandWxss(file, seen = new Set()) {
  const abs = path.resolve(file);
  if (seen.has(abs)) return { css: '', files: [] };
  seen.add(abs);
  const src = readFileSafe(abs);
  if (src == null) return { css: '', files: [] };
  let css = src;
  const files = [abs];
  const dir = path.dirname(abs);
  const re = /@import\s+["']([^"']+)["']\s*;/g;
  let m;
  while ((m = re.exec(src))) {
    const target = m[1];
    const resolved = target.startsWith('/') ? path.join(ROOT, target) : path.resolve(dir, target);
    const sub = expandWxss(resolved, seen);
    css += '\n' + sub.css;
    files.push(...sub.files);
  }
  return { css, files };
}

/* ---------- 从 css 文本提取「类 → 动效」映射 ---------- */
/**
 * @returns {{ classes: Map<string,{anims:Set<string>,trans:boolean}>, keyframes: Set<string> }}
 */
function extractMotion(css) {
  const classes = new Map();
  const keyframes = new Set();

  let km;
  const kre = /@keyframes\s+([A-Za-z0-9_-]+)/g;
  while ((km = kre.exec(css))) keyframes.add(km[1]);

  // 去掉 @keyframes 块体（含内部 0%/100% 嵌套），避免干扰选择器扫描
  const stripped = css.replace(/@keyframes\s+[A-Za-z0-9_-]+\s*\{(?:[^{}]|\{[^{}]*\})*\}/g, '');

  const bre = /([^{}]+)\{([^{}]*)\}/g;
  let b;
  while ((b = bre.exec(stripped))) {
    const sel = b[1];
    const body = b[2];

    // 收集本块声明的 animation-name（展开式 + 简写）
    const anims = new Set();
    let am;
    const nameRe = /animation-name\s*:\s*([^;}]+)/g;
    while ((am = nameRe.exec(body))) {
      for (const n of am[1].split(',')) {
        const v = n.trim();
        if (v && v !== 'none') anims.add(v);
      }
    }
    // 简写：animation: <name> <time> ...  取第一个非时间/非缓动 token
    const shortRe = /(^|[;{\s])animation\s*:\s*([^;}]+)/g;
    while ((am = shortRe.exec(body))) {
      for (const seg of am[2].split(',')) {
        const toks = seg.trim().split(/\s+/);
        for (const t of toks) {
          if (/^\d/.test(t) || /^(ease|linear|infinite|forwards|both|alternate|normal|reverse|none|backwards|cubic-bezier|steps)/.test(t)) continue;
          if (/^(ease-in|ease-out|ease-in-out)$/.test(t)) continue;
          if (t.startsWith('var(') || t.startsWith('cubic-bezier')) continue;
          anims.add(t);
          break;
        }
      }
    }

    const hasTrans = /(^|[;{\s])transition(-property|-duration|-timing-function)?\s*:/.test(body) &&
      !/transition[^:]*:\s*none/.test(body);

    if (anims.size === 0 && !hasTrans) continue;

    const inPopupLayer = POPUP_SEL.test(sel);
    const cre = /\.([A-Za-z0-9_-]+)/g;
    let c;
    while ((c = cre.exec(sel))) {
      const cls = c[1];
      if (!classes.has(cls)) classes.set(cls, { anims: new Set(), pageAnims: new Set(), trans: false });
      const rec = classes.get(cls);
      for (const a of anims) {
        rec.anims.add(a);
        if (!inPopupLayer) rec.pageAnims.add(a);
      }
      if (hasTrans) rec.trans = true;
    }
  }
  return { classes, keyframes };
}

/* ---------- wxml 类名使用扫描 ---------- */
function extractUsedClasses(wxml) {
  const used = new Set();
  let m;
  const re = /class\s*=\s*"([^"]*)"/g;
  while ((m = re.exec(wxml))) {
    const tokens = m[1]
      .replace(/\{\{([^}]*)\}\}/g, (_, expr) => ' ' + expr.replace(/[^A-Za-z0-9_'"\- ]/g, ' ') + ' ')
      .replace(/['"]/g, ' ')
      .split(/\s+/);
    for (const t of tokens) if (t && /^[A-Za-z][A-Za-z0-9_-]*$/.test(t)) used.add(t);
  }
  const hre = /hover-class\s*=\s*"([^"]*)"/g;
  while ((m = hre.exec(wxml))) {
    for (const t of m[1].split(/\s+/)) if (t && t !== 'none') used.add(t);
  }
  return used;
}

function mergeClasses(target, src) {
  for (const [k, v] of src) {
    if (!target.has(k)) target.set(k, { anims: new Set(), pageAnims: new Set(), trans: false });
    const rec = target.get(k);
    for (const a of v.anims) rec.anims.add(a);
    for (const a of v.pageAnims || []) rec.pageAnims.add(a);
    if (v.trans) rec.trans = true;
  }
  return target;
}

/* ---------- 主流程 ---------- */
const globalExp = expandWxss(path.join(ROOT, 'app.wxss'));
const globalMotion = extractMotion(globalExp.css);

const pkgCommonCache = new Map();
function pkgCommon(pkgRoot) {
  if (pkgRoot === '(main)') return null;
  if (pkgCommonCache.has(pkgRoot)) return pkgCommonCache.get(pkgRoot);
  const f = path.join(ROOT, pkgRoot, 'common.wxss');
  const r = fs.existsSync(f) ? extractMotion(expandWxss(f).css) : null;
  pkgCommonCache.set(pkgRoot, r);
  return r;
}

const rows = [];
for (const { route, pkg } of collectPages()) {
  if (PAGE_FILTER && !route.includes(PAGE_FILTER)) continue;

  const wxml = readFileSafe(path.join(ROOT, `${route}.wxml`));
  if (wxml == null) { rows.push({ route, pkg, missing: true }); continue; }

  const wxssPath = path.join(ROOT, `${route}.wxss`);
  const hasWxss = fs.existsSync(wxssPath);
  // 页面自身文件（不含 import）——用于识别「页面私有 keyframes」回收目标
  const ownCss = hasWxss ? (readFileSafe(wxssPath) || '') : '';
  const ownMotion = extractMotion(ownCss);
  // 页面可用全集（页面 + 其 import 链）
  const pageExp = hasWxss ? expandWxss(wxssPath) : { css: '' };
  const pageMotion = extractMotion(pageExp.css);

  const avail = mergeClasses(new Map(), globalMotion.classes);
  const common = pkgCommon(pkg);
  if (common) mergeClasses(avail, common.classes);
  mergeClasses(avail, pageMotion.classes);

  const allKf = new Set([...globalMotion.keyframes, ...pageMotion.keyframes]);
  if (common) for (const k of common.keyframes) allKf.add(k);

  const used = extractUsedClasses(wxml);
  const enterCls = [];
  const ambientCls = [];
  const loadingCls = [];
  const microCls = [];
  const centralEnter = [];
  const popupOnlyEnter = [];

  for (const c of used) {
    const rec = avail.get(c);
    if (!rec) continue;
    if (rec.trans) microCls.push(c);
    for (const a of rec.anims) {
      const kind = classifyKf(a);
      if (kind === 'enter') {
        // 弹窗层的 reveal 不计入「页面入场」
        if (!rec.pageAnims.has(a)) { popupOnlyEnter.push(`${c}→${a}`); continue; }
        enterCls.push(`${c}→${a}`);
        if (a.startsWith('zy-')) centralEnter.push(c);
      } else if (kind === 'ambient') ambientCls.push(`${c}→${a}`);
      else if (kind === 'loading') loadingCls.push(`${c}→${a}`);
    }
  }

  // 页面私有 keyframes（自身 wxss 直写、且中央未提供同名）
  const ownKf = [...ownMotion.keyframes];
  const dupKf = ownKf.filter((k) => globalMotion.keyframes.has(k));
  const recycleKf = ownKf.filter((k) => classifyKf(k) === 'enter');

  rows.push({
    route, pkg,
    enter: enterCls.length > 0,
    enterCls,
    micro: microCls.length > 0,
    microCount: microCls.length,
    ambient: ambientCls.length > 0,
    ambientCls,
    loading: loadingCls.length > 0,
    usesCentral: centralEnter.length > 0,
    ownKeyframes: ownKf,
    ownEnterKeyframes: recycleKf,
    dupKeyframes: dupKf,
  });
}

/* ---------- 输出 ---------- */
if (OUT_JSON) { console.log(JSON.stringify(rows, null, 2)); process.exit(0); }

const f = (b) => (b ? '✅' : '❌');
const shown = ONLY_GAP ? rows.filter((r) => r.missing || !r.enter || !r.micro) : rows;

console.log('\n逐页动效矩阵（keyframe 溯源版）');
console.log('入场 微交互 氛围 加载 中央 | 私有kf | 页面');
console.log('-'.repeat(80));
for (const r of shown) {
  if (r.missing) { console.log(` --   --    --   --   --  |      | ${r.route}  ⚠️ wxml 缺失`); continue; }
  console.log(
    ` ${f(r.enter)}   ${f(r.micro)}    ${f(r.ambient)}   ${f(r.loading)}   ${f(r.usesCentral)}  | ` +
    `${String(r.ownKeyframes.length).padStart(2)}   | ${r.route}`
  );
}

const live = rows.filter((r) => !r.missing);
const noEnter = live.filter((r) => !r.enter);
const noMicro = live.filter((r) => !r.micro);
const localEnter = live.filter((r) => r.ownEnterKeyframes.length > 0);
const notCentral = live.filter((r) => r.enter && !r.usesCentral);
const kfTotal = live.reduce((s, r) => s + r.ownKeyframes.length, 0);
const enterKfTotal = live.reduce((s, r) => s + r.ownEnterKeyframes.length, 0);

console.log('\n汇总');
console.log(`  页面总数              ${live.length}`);
console.log(`  入场缺口              ${noEnter.length}`);
console.log(`  微交互缺口            ${noMicro.length}`);
console.log(`  有入场但未用中央类    ${notCentral.length}`);
console.log(`  页面私有 keyframes    ${kfTotal} 个（其中入场类 ${enterKfTotal} 个，分布 ${localEnter.length} 页）`);
console.log(`  氛围/呼吸已生效页     ${live.filter((r) => r.ambient).length}`);

if (noEnter.length) { console.log('\n【入场缺口】'); noEnter.forEach((r) => console.log(`  - ${r.route}`)); }
if (noMicro.length) { console.log('\n【微交互缺口】'); noMicro.forEach((r) => console.log(`  - ${r.route}`)); }
if (notCentral.length) {
  console.log('\n【有入场但走本地 keyframe（回收目标）】');
  notCentral.forEach((r) => console.log(`  - ${r.route}  用到：${r.enterCls.join(', ')}`));
}
console.log('');
