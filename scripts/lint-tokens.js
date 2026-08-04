#!/usr/bin/env node
'use strict';
/**
 * lint-tokens.js — 设计令牌门控守卫（二期：野金 BLOCK + 旧坐标系分桶 WARN）
 * ----------------------------------------------------------------------------
 * 【规则 A · BLOCK】野金家族（一期成果，已全绿，勿动）
 *   奢华视觉系统（一支金 #C9A24B）落地后，禁止任何野金残留于生产代码。
 *   - #C9A96E（旧香槟金漂移值，十进制 rgba(201,169,110)）
 *   - #B8893A（amber 野金，十进制 rgba(184,138,58)）
 *   - #D4A858（旧领券金，十进制 rgba(212,168,88)）
 *   命中 → exit 1（无条件）。
 *
 * 【规则 B · WARN】旧坐标系（橄榄绿 / teal / 旧深蓝）
 *   AROORO 由「橄榄绿 PETLUX」迁移至「深森林绿 Haute-Luxury」后的历史色值。
 *   这些值分两种性质，严重度完全不同，必须分桶，不可一刀切：
 *
 *   桶① 令牌定义层·已被 theme-teal 覆盖 → INFO（活雷，非泄漏）
 *       位于 styles/variables.wxss、styles/design-tokens.wxss 的自定义属性
 *       定义行。app.wxss 的 @import 顺序（variables → design-tokens → theme-teal）
 *       保证 theme-teal 最后加载并覆盖，故线上渲染正确。
 *       风险：一旦 @import 顺序被改动，整站瞬间回退橄榄绿。
 *
 *   桶② 真实泄漏·小程序 → WARN（--strict 下 exit 1）
 *       页面/组件里绕过令牌直接硬编码旧色。又分两个子形态：
 *         · raw      裸硬编码（color:#4F5E35 / app.json selectedColor / svg stroke）
 *                    —— 令牌层怎么改都不生效，必然错，优先级最高
 *         · fallback var(--x, #4F5E35) 兜底值
 *                    —— 令牌存在时不生效，仅在令牌缺失时暴露；属"二级雷"
 *
 *   桶③ 跨产品面·web-admin → INFO（默认不计入 --strict）
 *       web-admin 是独立 Vue 后台（Element Plus + echarts），非 AROORO 小程序，
 *       其 #4ECDC4 多为图表调色板。是否纳入奢华体系需产品决策，故单列不阻断。
 *
 * 【规则 C · INFO】同名令牌跨文件取值冲突（治本：暴露 桶①/桶②c 的根因）
 *   扫 styles/*.wxss（按 app.wxss @import 顺序）所有 `--x: value` 定义，
 *   同名不同值即冲突，并标注"最终生效 = @import 顺序最后声明者"。
 *   根因：variables.wxss 整份是旧橄榄坐标系，与 theme-teal 有 108 处同名冲突
 *   （跨全部 styles/*.wxss 合计 173 处），仅靠 theme-teal 最后声明胜出才维持运行时
 *   正确。本规则一次性把这批雷全暴露。默认 INFO（不阻断）；待任务 #10 去重后应收敛为 0。
 *   注：theme-teal 的暗色是 `.theme-dark { }` 类选择器（非 @media），其中的重定义
 *   属正常主题分支，建索引时跳过；否则会把 7 个暗色令牌误判为冲突，并连带让规则 D
 *   把真值解析成暗色态而爆出大量假阳性（实测桶② 会从 49 虚增到 292）。
 *
 * 【规则 D · WARN】兜底值与令牌真值一致性（治本：替代旧色黑名单）
 *   `var(--x, FALLBACK)` 中的 FALLBACK 若 ≠ `--x` 的最终生效值（按 @import 顺序解析），
 *   即判为陈旧兜底。比规则 B 的"旧坐标系 hex 黑名单"更严：不依赖维护黑名单，
 *   任何"兜底写错/没跟上真值"都会命中（含非橄榄的旧值）。
 *   与规则 B 桶②c 同源，但结构性更强；--strict 下计入 桶② 阻断。
 *
 * 校验维度：hex 六位 + 十进制 rgb()/rgba() 三通道，含注释文本，不跳过。
 * 覆盖：.js / .wxml / .wxss / .json / .svg / .css / .vue
 * 排除：node_modules / miniprogram_npm / .git / docs / docs-archive / scripts / dist
 *      （dist 为 .gitignore 的构建产物，扫描它只会产生噪音）
 *
 * 用法：
 *   node scripts/lint-tokens.js            # CI 默认：仅规则 A 阻断
 *   node scripts/lint-tokens.js --strict   # 收口：桶② 也阻断
 *   node scripts/lint-tokens.js --json     # 输出机器可读 JSON（供报告生成）
 *
 * 退出码：0 = 通过；1 = 规则 A 命中，或 --strict 下桶② 未清零。
 * 输出：全缓冲 + 退出钩子内 fs.writeSync 同步落盘，管道（`| tee` / CI 日志采集 / `| head`）
 *      下不会因 exit 1 截断正文 —— 守卫最需要日志的恰恰是失败那一次。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ARGV = process.argv.slice(2);
const STRICT = ARGV.includes('--strict');
const AS_JSON = ARGV.includes('--json');

/* ========== 规则 A：野金家族（BLOCK，勿动） ========== */
const WILD_HEX = new Set(['#C9A96E', '#B8893A', '#D4A858']);
const WILD_RGB = new Set(['201,169,110', '184,138,58', '212,168,88']);

/* ========== 规则 B：旧坐标系 ========== */
// 橄榄绿系（PETLUX 旧主色）/ teal 系（更早的青绿）/ 旧深蓝
const LEGACY_HEX = new Map([
  ['#4F5E35', '橄榄绿·旧主锚点'],
  ['#3A4626', '深橄榄·旧按下态'],
  ['#2AB7A9', 'teal·旧活动渐变深停'],
  ['#3DB5AD', 'teal·旧变体'],
  ['#45B7AA', 'teal·旧变体'],
  ['#44A08D', 'teal·旧变体'],
  ['#4ECDC4', 'teal·旧品牌青'],
  ['#0A1128', '旧深蓝'],
  /* ---- #13 追加：板块渐变端点（旧橄榄/陶土色族的插值产物，故不在原名单内） ----
     这批不是「又发现几个漏网色号」，是黑名单机制的固有短板：旧坐标是一整个色族，
     只要有人调过明度/饱和度、或色值是渐变端点插值出来的，就必然落在枚举之外。
     色相实测：陶土 H16-21° / 橄榄 H81-95°，与品牌金 H38-44°、品牌绿 H120° 干净分开。
     根治靠守卫三期的 HSL 色相带 WARN 规则，本条只负责把「已知的」钉死为 BLOCK。 */
  ['#C08060', '陶土·旧寄养渐变浅停'],
  ['#D49E80', '陶土·旧寄养渐变深停'],
  ['#B07560', '陶土·旧团购渐变浅停'],
  ['#C99480', '陶土·旧团购渐变深停'],
  ['#7A8C5A', '橄榄·旧活动渐变浅停'],
  ['#9AAB7A', '橄榄·旧活动渐变深停'],
  ['#7C9468', '橄榄·旧喂养渐变浅停'],
  ['#9AB488', '橄榄·旧喂养渐变深停'],
  /* 旧墨黑：与新墨黑 #1A1A17 同为低饱和（S9%/S6%），色相判据必然放行，
     只有精确枚举能分辨 —— 这也是三期中性档要配「精确梯白名单」的原因。 */
  ['#2A2823', '旧墨黑·已迁移至 #1A1A17'],
]);
const LEGACY_RGB = new Map([
  ['79,94,53', '橄榄绿·旧主锚点'],
  ['58,70,38', '深橄榄·旧按下态'],
  ['42,183,169', 'teal·旧活动渐变深停'],
  ['61,181,173', 'teal·旧变体'],
  ['69,183,170', 'teal·旧变体'],
  ['68,160,141', 'teal·旧变体'],
  ['78,205,196', 'teal·旧品牌青'],
  ['10,17,40', '旧深蓝'],
  /* #13 追加，与 LEGACY_HEX 一一对应（十进制 rgba() 写法同样要拦） */
  ['192,128,96', '陶土·旧寄养渐变浅停'],
  ['212,158,128', '陶土·旧寄养渐变深停'],
  ['176,117,96', '陶土·旧团购渐变浅停'],
  ['201,148,128', '陶土·旧团购渐变深停'],
  ['122,140,90', '橄榄·旧活动渐变浅停'],
  ['154,171,122', '橄榄·旧活动渐变深停'],
  ['124,148,104', '橄榄·旧喂养渐变浅停'],
  ['154,180,136', '橄榄·旧喂养渐变深停'],
  ['42,40,35', '旧墨黑·已迁移至 #1A1A17'],
]);

// 规范金：允许出现在「令牌定义处」，硬编码在业务样式里则 WARN（不阻断）
const CANON_HEX = new Set(['#C9A24B', '#1F3A1F', '#ECE4D4']);
// 令牌真源文件（规范色的唯一合法落点）
const TOKEN_FILES = new Set([
  'styles/variables.wxss',
  'styles/theme-teal.wxss',
  'styles/design-tokens.wxss',
  'design-tokens.json',
]);
// 桶① 判定：旧坐标「合法沉睡」的令牌定义层（theme-teal 会覆盖它们）
const LEGACY_TOKEN_LAYER = new Set([
  'styles/variables.wxss',
  'styles/design-tokens.wxss',
  'styles/theme-teal.wxss',
]);
// 桶③ 判定：跨产品面前缀
const CROSS_PRODUCT_PREFIX = 'web-admin/';
// 规格真相源（非运行时：不参与渲染，但错了会误导后续所有实现）
const SPEC_FILES = new Set(['design-tokens.json']);

/**
 * 规格源「文档字段」豁免（②b-doc）
 *
 * 背景：design-tokens.json 里 `_` 前缀键是结构化文档字段（_source、_status、_conflict 系列、
 * _fabNote 等），用来锚定真相源、记录取证。要讲清「什么被废弃了」就必然要引用废弃色值，例如
 * _source 里那句「旧 rgba(42,40,35,*)（#2A2823）已废弃」。而 #2A2823 正在黑名单里
 * → 桶②b 判定为 BLOCK 会 exit 1，红的却是一句完全正确的文档。
 *
 * 判据只看键名结构，不看内容特征（不做「含中文就放行」这类启发式——内容判据必然某天误伤）。
 * 边界严格锁死在 SPEC_FILES 内：wxss 的块注释不适用，因为注释与真实声明同处一个语法层，
 * 放开等于给「先注释掉」开实质豁免；json 的 `_` 前缀键位置明确、可枚举，才够格开这个口子。
 *
 * 降级 ≠ 忽略：命中仍然解析、仍然计数、仍然单列打印，只是不参与 exit code。
 * 这样万一有人把真实令牌值误写进 `_` 键，或文档引用的废弃值本身写错，依然看得见。
 *
 * 行级判据成立的前提：JSON 字符串不能含未转义换行，故 "键": "值" 必在同一物理行。
 * 唯一例外是 `"_k":` 换行后才写值的排版，用 pendingDocKey 兜住。
 */
const SPEC_DOC_KEY_RE = /^\s*"(_[A-Za-z0-9_]+)"\s*:/;
const SPEC_DOC_KEY_ONLY_RE = /^\s*"(_[A-Za-z0-9_]+)"\s*:\s*$/;

// 自定义属性定义行（`--xx: value`）——本地令牌声明合法，如 custom-tab-bar 的 --tb-*
const CUSTOM_PROP_DEF_RE = /(^|[;{\s])--[\w-]+\s*:/;
// var(--token, <fallback>) 兜底形态
const VAR_FALLBACK_RE = /var\(\s*--[\w-]+\s*,/;

const SCAN_EXT = new Set(['.js', '.wxml', '.wxss', '.json', '.svg', '.css', '.vue']);
const EXCLUDE_DIRS = new Set([
  'node_modules', 'miniprogram_npm', '.git',
  'docs', 'docs-archive', 'scripts',
  'dist', // .gitignore 的构建产物：扫描它只会得到打包后的噪音
]);
// 相对路径级忽略：目录名不足以表达意图时用这个（比按名忽略更精确，也更好读）
// web-admin/dist 是 Vite 构建产物，里面的 hex 全是打包后压缩产物，报出来无法修
const EXCLUDE_REL_PATHS = new Set([
  'web-admin/dist',
]);

const HEX_RE = /#([0-9a-fA-F]{6})\b/g;
const RGB_RE = /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/g;
// 行首自定义属性名（用于判定「这一行在定义哪个令牌」）
const PROP_NAME_RE = /^\s*(--[\w-]+)\s*:/;

/* ---- theme-teal 覆盖面：桶① 之所以"安全"完全依赖它，必须实测而非假设 ---- */
const THEME_TEAL = 'styles/theme-teal.wxss';
function loadThemeTealProps() {
  const s = new Set();
  try {
    const txt = fs.readFileSync(path.join(ROOT, THEME_TEAL), 'utf8');
    txt.split('\n').forEach((l) => {
      const m = PROP_NAME_RE.exec(l);
      if (m) s.add(m[1]);
    });
  } catch (e) { /* 缺文件则视为零覆盖，后续全部升级为未覆盖 */ }
  return s;
}
const TEAL_PROPS = loadThemeTealProps();

/* ---- 令牌真值索引：规则 C（跨文件冲突）+ 规则 D（兜底一致性）共享 ---- */
// app.wxss 的 @import 顺序（权威，来自 app.wxss L2-7）：后者覆盖前者
const IMPORT_ORDER = [
  'styles/variables.wxss',
  'styles/design-tokens.wxss',
  'styles/theme-teal.wxss',
  'styles/motion.wxss',
  'styles/loading-animation.wxss',
  'styles/components.wxss',
];
/**
 * 令牌索引改用 verify-token-cascade.js 的 CSS 解析器（共用一份实现）。
 * 原先这里是按行正则，踩过三个坑，都会直接污染规则 C/D 的判定：
 *   1. 注释不识别 —— design-tokens.wxss L155-170 有一整块被注释掉的「兼容重映射」，
 *      按行正则会把它当成 11 条生效声明，凭空造出冲突（例如 --card-color 两边同为
 *      #FFFFFF 本不冲突，被注释里的 var(--zy-surface) 顶成"冲突"）。
 *   2. 一行多声明只取第一条 —— `--zy-fs-h1: 44rpx; --zy-fs-h1-w: 700; --zy-fs-h1-lh: 1.2;`
 *      会漏掉后两条，字号梯度令牌大面积失踪。
 *   3. 值里含分号 —— --zy-paper-noise 是 base64 data URI，含 `image/png;base64`。
 * 现在由单遍字符扫描器统一处理注释/字符串/括号，三个坑一并消除。
 */
const CASCADE = require('./verify-token-cascade.js');
const TOKEN_DEFS = new Map();  // name -> [{file, value}]（按 @import 顺序）
const TOKEN_FINAL = new Map(); // name -> 最终生效值（浅色态，最后声明者胜出）
let VT_CONFLICTS = 0;          // variables.wxss ↔ theme-teal.wxss 同名不同值计数
(function buildTokenIndex() {
  for (const rel of IMPORT_ORDER) {
    for (const blk of CASCADE.blocksOf(rel)) {
      // 暗色是 .theme-dark 类选择器，属主题分支而非重复声明；真值取浅色态
      if (!CASCADE.isPageSel(blk.selector)) continue;
      for (const d of blk.decls) {
        if (!TOKEN_DEFS.has(d.prop)) TOKEN_DEFS.set(d.prop, []);
        TOKEN_DEFS.get(d.prop).push({ file: rel, value: d.value });
        TOKEN_FINAL.set(d.prop, d.value);
      }
    }
  }
  for (const [, arr] of TOKEN_DEFS) {
    const v = arr.find((d) => d.file === 'styles/variables.wxss');
    const t = arr.find((d) => d.file === 'styles/theme-teal.wxss');
    if (v && t && v.value !== t.value) VT_CONFLICTS++;
  }
})();

const FALLBACK_FULL_RE = /var\(\s*(--[A-Za-z0-9_-]+)\s*,\s*((?:[^()]|\([^()]*\))*)\)/;
function parseFallback(line) {
  const m = FALLBACK_FULL_RE.exec(line);
  if (!m) return null;
  return { token: m[1], value: m[2].trim() };
}
function isCssColor(v) {
  return /^#([0-9a-fA-F]{3,8})$/.test(v) || /^rgba?\(/i.test(v);
}
function normColor(v) {
  v = v.toLowerCase().replace(/\s+/g, '');
  // 3 位 hex 展开为 6 位（#fff ≡ #ffffff），避免 shorthand 误判为不一致
  const m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v);
  if (m) return `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`;
  return v;
}

const R = {
  wildHits: [],      // 规则 A · BLOCK
  canonWarns: [],    // 规范色硬编码（一期既有 WARN）
  legacyInfo: [],    // 桶①a 令牌定义层·已被 theme-teal 覆盖
  legacyUncov: [],   // 桶①b 令牌定义层·未被覆盖（真陷阱）
  legacyLeak: [],    // 桶② 真实泄漏·小程序
  legacyDoc: [],     // 桶②b-doc 规格源 `_` 前缀文档字段（INFO·计数但不阻断，见 SPEC_DOC_KEY_RE）
  legacyCross: [],   // 桶③ 跨产品面 web-admin
  tokenConflicts: [],// 规则 C 同名令牌跨文件取值冲突
  contrast: [],      // 规则 E · 文字/底色对比度（保守版：只观测，不阻断）
};

/* ========== 规则 E：文字色 × 底色 对比度（WCAG 2.1 相对亮度）==========
 * 保守版设计约束（team-lead 指定「只观测不阻断」），三条自我限制：
 *  1) 只看「同一条 CSS 规则内同时写了 color 与 background/background-color」的情形。
 *     跨规则继承、wxml 行内 style、js 动态赋色一律不猜 —— 猜出来的对比度是假数据。
 *  2) 底色取渐变的第一个色停。渐变上的文字实际对比度沿途变化，取首停是保守近似，
 *     故只作 INFO 提示，不作判据依据。
 *  3) 任何一侧解析不出确定颜色（var 链断裂、currentColor、transparent）就跳过，不报。
 * 阈值用 WCAG AA：正文 4.5:1。字号≥36rpx(18px) 视为大字，用 3.0:1。
 * 输出永远是 INFO，不参与 exit code —— 误报一次就会让人不信任整个守卫。
 */
const WCAG_AA_NORMAL = 4.5;
const WCAG_AA_LARGE = 3.0;

function srgbToLin(c) {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
function relLuminance(rgb) {
  const [r, g, b] = rgb.map(srgbToLin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrastRatio(rgb1, rgb2) {
  const l1 = relLuminance(rgb1); const l2 = relLuminance(rgb2);
  const hi = Math.max(l1, l2); const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}
/** 解析颜色字面量 → [r,g,b]；解析不出返回 null（宁可漏报不可误报） */
function parseColorLiteral(v) {
  if (!v) return null;
  const s = String(v).trim();
  let m = /^#([0-9a-fA-F]{6})\b/.exec(s);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  m = /^#([0-9a-fA-F]{3})\b/.exec(s);
  if (m) return [...m[1]].map((c) => parseInt(c + c, 16));
  m = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+)\s*)?\)/.exec(s);
  if (m) {
    // 半透明无法在不知道下层底色的前提下算准 → 跳过，不猜
    if (m[4] !== undefined && parseFloat(m[4]) < 0.95) return null;
    return [1, 2, 3].map((i) => parseInt(m[i], 10));
  }
  return null;
}

function classifyLegacy(relPosix, line, isPropDef) {
  if (relPosix.startsWith(CROSS_PRODUCT_PREFIX)) return 'cross';
  if (LEGACY_TOKEN_LAYER.has(relPosix) && isPropDef) {
    // theme-teal 自身的定义行不需要被谁覆盖
    if (relPosix === THEME_TEAL) return 'info';
    const m = PROP_NAME_RE.exec(line);
    // 实测该令牌是否真的被 theme-teal 重定义；未覆盖 = 旧色会真实生效
    return m && TEAL_PROPS.has(m[1]) ? 'info' : 'uncov';
  }
  return 'leak';
}

function scanFile(abs, rel) {
  let content;
  try {
    content = fs.readFileSync(abs, 'utf8');
  } catch (e) {
    return;
  }
  const relPosix = rel.split(path.sep).join('/');
  const isTokenSource = TOKEN_FILES.has(relPosix);
  // 仅样式层可用 var()：.svg/.js/.json 只能硬编码，不纳入规范色 WARN
  const warnableExt = /\.(wxss|css)$/i.test(relPosix);

  const isSpec = SPEC_FILES.has(relPosix);
  let pendingDocKey = null; // 上一行是「只有 _ 键、值换行写」时，本行仍算文档字段

  content.split('\n').forEach((line, idx) => {
    const no = idx + 1;
    const isPropDef = CUSTOM_PROP_DEF_RE.test(line);
    const isFallback = VAR_FALLBACK_RE.test(line);
    let m;

    // ②b-doc 判据：仅 SPEC_FILES 内、且行首为 "_xxx": 结构化文档键
    let docKey = null;
    if (isSpec) {
      const dm = SPEC_DOC_KEY_RE.exec(line);
      if (dm) docKey = dm[1];
      else if (pendingDocKey) docKey = pendingDocKey;
      pendingDocKey = SPEC_DOC_KEY_ONLY_RE.test(line) ? (dm ? dm[1] : null) : null;
    }
    const specForm = isSpec ? (docKey ? 'spec-doc' : 'spec') : 'raw';
    /** spec-doc 分流到独立桶：可见、计数，但不进 legacyLeak → 不参与 exit code */
    const route = (rec, bucket) => {
      if (bucket === 'info') R.legacyInfo.push(rec);
      else if (bucket === 'uncov') R.legacyUncov.push(rec);
      else if (bucket === 'cross') R.legacyCross.push(rec);
      else if (rec.form === 'spec-doc') R.legacyDoc.push(rec);
      else R.legacyLeak.push(rec);
    };

    HEX_RE.lastIndex = 0;
    while ((m = HEX_RE.exec(line)) !== null) {
      const hex = ('#' + m[1]).toUpperCase();
      if (WILD_HEX.has(hex)) {
        R.wildHits.push({ rel: relPosix, line: no, text: hex });
      } else if (LEGACY_HEX.has(hex)) {
        if (isFallback) {
          // 兜底行的旧坐标交由规则 D 按"兜底≠真值"统一判定，避免与 legacyLeak 双重计数
        } else {
          const rec = {
            rel: relPosix, line: no, text: hex,
            note: LEGACY_HEX.get(hex),
            form: specForm, docKey,
          };
          route(rec, classifyLegacy(relPosix, line, isPropDef));
        }
      } else if (CANON_HEX.has(hex) && warnableExt && !isTokenSource && !isPropDef) {
        R.canonWarns.push({ rel: relPosix, line: no, text: hex });
      }
    }

    RGB_RE.lastIndex = 0;
    while ((m = RGB_RE.exec(line)) !== null) {
      const key = `${m[1]},${m[2]},${m[3]}`;
      if (WILD_RGB.has(key)) {
        R.wildHits.push({ rel: relPosix, line: no, text: `rgb(${key})` });
      } else if (LEGACY_RGB.has(key)) {
        if (isFallback) {
          // 兜底行交由规则 D 判定（见下方）
        } else {
          const rec = {
            rel: relPosix, line: no, text: `rgb(${key})`,
            note: LEGACY_RGB.get(key),
            form: specForm, docKey,
          };
          route(rec, classifyLegacy(relPosix, line, isPropDef));
        }
      }
    }

    /* ---- 规则 D：兜底值 vs 令牌真值一致性（仅兜底行，治本式检测）---- */
    if (isFallback) {
      const fb = parseFallback(line);
      if (fb && TOKEN_FINAL.has(fb.token) && isCssColor(fb.value)) {
        const finalVal = TOKEN_FINAL.get(fb.token);
        if (isCssColor(finalVal) && normColor(fb.value) !== normColor(finalVal)) {
          R.legacyLeak.push({
            rel: relPosix, line: no, text: fb.value,
            note: `兜底≠真值(${finalVal})`, form: 'fallback', token: fb.token,
          });
        }
      }
    }
  });
}

function walk(abs, rel) {
  let entries;
  try {
    entries = fs.readdirSync(abs, { withFileTypes: true });
  } catch (e) {
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    if (e.isDirectory()) {
      if (EXCLUDE_DIRS.has(e.name)) continue;
      const childRel = path.join(rel, e.name).split(path.sep).join('/');
      if (EXCLUDE_REL_PATHS.has(childRel)) continue;
      walk(path.join(abs, e.name), path.join(rel, e.name));
    } else if (e.isFile()) {
      if (!SCAN_EXT.has(path.extname(e.name).toLowerCase())) continue;
      scanFile(path.join(abs, e.name), path.join(rel, e.name));
    }
  }
}

walk(ROOT, '');

/* ========== 规则 C：同名令牌跨文件取值冲突（治本，暴露 桶①/桶②c 根因）============ */
for (const [name, arr] of TOKEN_DEFS) {
  const distinct = new Set(arr.map((d) => d.value));
  if (distinct.size > 1) R.tokenConflicts.push({ name, defs: arr, final: TOKEN_FINAL.get(name) });
}

/* ========== 规则 E：同规则内 color × background 对比度（INFO，不阻断）========== */
(function scanContrast() {
  /** 把值里的 var(--x) 递归解析到字面量；解析不动就返回原值 */
  function deref(val, depth = 0) {
    if (depth > 8 || !val) return val;
    const m = /var\(\s*(--[\w-]+)\s*(?:,([\s\S]*))?\)/.exec(val);
    if (!m) return val;
    const tokenVal = TOKEN_FINAL.get(m[1]);
    if (tokenVal !== undefined) return deref(tokenVal.trim(), depth + 1);
    if (m[2] !== undefined) return deref(m[2].trim(), depth + 1); // 退到兜底值
    return null;
  }
  /** 底色：纯色直接用；渐变取第一个色停（保守近似，只作 INFO） */
  function bgColorOf(raw) {
    const v = deref(raw);
    if (!v) return null;
    const direct = parseColorLiteral(v);
    if (direct) return { rgb: direct, approx: false };
    if (/gradient\(/i.test(v)) {
      const stops = v.match(/#[0-9a-fA-F]{3,6}\b|rgba?\([^)]*\)/g) || [];
      for (const s of stops) {
        const c = parseColorLiteral(deref(s) || s);
        if (c) return { rgb: c, approx: true };
      }
    }
    return null;
  }

  const CANDIDATE_EXT = /\.wxss$/i;
  const files = [];
  (function collect(abs, rel) {
    let es; try { es = fs.readdirSync(abs, { withFileTypes: true }); } catch (e) { return; }
    for (const e of es) {
      if (e.name.startsWith('.')) continue;
      const a = path.join(abs, e.name);
      const r = (rel ? rel + '/' : '') + e.name;
      if (e.isDirectory()) {
        if (EXCLUDE_DIRS.has(e.name) || EXCLUDE_REL_PATHS.has(r)) continue;
        collect(a, r);
      } else if (CANDIDATE_EXT.test(e.name)) files.push({ abs: a, rel: r });
    }
  })(ROOT, '');

  for (const f of files) {
    let blocks;
    // allProps:true —— 默认口径只收 --* 自定义属性，规则E 要的是 color/background/font-size
    try { blocks = CASCADE.blocksOf(f.rel, { allProps: true }); } catch (e) { continue; }
    for (const blk of blocks) {
      let fg = null; let bg = null; let fontPx = null;
      for (const d of blk.decls) {
        if (d.prop === 'color') fg = d.value;
        else if (d.prop === 'background' || d.prop === 'background-color') bg = d.value;
        else if (d.prop === 'font-size') {
          const m = /([\d.]+)\s*(rpx|px)/.exec(d.value);
          if (m) fontPx = m[2] === 'rpx' ? parseFloat(m[1]) / 2 : parseFloat(m[1]);
        }
      }
      if (!fg || !bg) continue;                    // 只看同规则内成对出现的
      const fgv = deref(fg);
      const fgRgb = fgv ? parseColorLiteral(fgv) : null;
      const bgRes = bgColorOf(bg);
      if (!fgRgb || !bgRes) continue;              // 任一侧不确定就跳过，不猜
      const ratio = contrastRatio(fgRgb, bgRes.rgb);
      const large = fontPx !== null && fontPx >= 18;
      const need = large ? WCAG_AA_LARGE : WCAG_AA_NORMAL;
      if (ratio >= need) continue;
      R.contrast.push({
        rel: f.rel, selector: blk.selector.trim().replace(/\s+/g, ' ').slice(0, 60),
        ratio: Math.round(ratio * 100) / 100, need, approx: bgRes.approx,
        fg: fgv.trim().slice(0, 28), bg: String(deref(bg) || bg).trim().slice(0, 40),
      });
    }
  }
})();

/* ========== 输出 ========== */
/**
 * 输出通道：全缓冲 + fs.writeSync 落盘。
 * 原因：Node 在 stdout 为「管道」时（CI 里 `node scripts/lint-tokens.js --strict | tee lint.log`、
 * GitHub Actions 采集日志、`| tail` 等）写入是异步的，而脚本末尾的 process.exit(1) 会直接掐断
 * 未 flush 的缓冲 → 报错时正文全丢，只剩最后一行 FAIL。守卫最需要日志的场景恰恰是失败时，
 * 所以这里改为进程退出钩子里同步 flush，保证任何退出路径（含 exit 1）输出都完整。
 */
const OUT_CHUNKS = [];
const out = { write: (s) => OUT_CHUNKS.push(s) };
function flushOut() {
  if (OUT_CHUNKS.length === 0) return;
  const buf = Buffer.from(OUT_CHUNKS.join(''), 'utf8');
  OUT_CHUNKS.length = 0;
  let off = 0;
  while (off < buf.length) {
    try {
      off += fs.writeSync(1, buf, off, buf.length - off);
    } catch (e) {
      if (e.code === 'EAGAIN') continue; // 管道满，重试
      if (e.code === 'EPIPE') return; // 下游已关闭（如 | head），静默退出
      throw e;
    }
  }
}
process.on('exit', flushOut);
// stderr 前先把 stdout 正文 flush 掉，保证终端里「正文在前、FAIL 在后」的阅读顺序
function errOut(s) {
  flushOut();
  try {
    fs.writeSync(2, Buffer.from(s, 'utf8'));
  } catch (e) {
    if (e.code !== 'EPIPE') throw e;
  }
}

if (AS_JSON) {
  out.write(JSON.stringify(R, null, 2) + '\n');
  process.exit(R.wildHits.length > 0 || (STRICT && R.legacyLeak.length > 0) ? 1 : 0);
}

const fmt = (r) => `  ${r.rel}:${r.line}  ${r.text}${r.note ? `  — ${r.note}` : ''}${r.form === 'fallback' ? '  [var 兜底]' : ''}`;

// 规范色硬编码（既有 WARN）
if (R.canonWarns.length > 0) {
  out.write(`\n[lint-tokens] WARN: ${R.canonWarns.length} 处规范色硬编码（应改 var(--token)，不阻断）\n`);
  R.canonWarns.slice(0, 40).forEach((w) => out.write(`  ${w.rel}:${w.line}  ${w.text}\n`));
  if (R.canonWarns.length > 40) out.write(`  ...另有 ${R.canonWarns.length - 40} 处\n`);
}

// 桶① INFO
if (R.legacyInfo.length > 0) {
  out.write(`\n[lint-tokens] INFO 桶①: ${R.legacyInfo.length} 处旧坐标位于令牌定义层（已被 theme-teal 覆盖，线上渲染正确）\n`);
  out.write(`  性质：活雷，非泄漏。风险点 = app.wxss 的 @import 顺序一旦改动即全站回退橄榄绿。\n`);
  R.legacyInfo.forEach((r) => out.write(fmt(r) + '\n'));
}

// 桶①b 未覆盖陷阱（最危险：theme-teal 没兜底，旧色若被引用会真实渲染）
if (R.legacyUncov.length > 0) {
  out.write(`\n[lint-tokens] ⚠ 桶①b 未覆盖陷阱: ${R.legacyUncov.length} 处令牌定义层旧坐标「未被 theme-teal 覆盖」\n`);
  out.write(`  性质：与桶①不同，这里 theme-teal 没有兜底重定义 → 一旦被引用会真实渲染为橄榄绿/teal，是活雷中的活雷。\n`);
  out.write(`  建议：改源值为新坐标（#1F3A1F 系），或在 theme-teal 补一行覆盖；切勿长期裸奔。\n`);
  R.legacyUncov.forEach((r) => out.write(fmt(r) + '\n'));
}

// 规则 C 同名令牌跨文件取值冲突
if (R.tokenConflicts.length > 0) {
  const base = (f) => f.split('/').pop();
  const shown = (c) => `  ${c.name}  ${c.defs.map((d) => `${base(d.file)}=${d.value}`).join('  ')}`;
  // 布局/字形级冲突（非纯色，@import 顺序一旦变动会瞬间错位，优先级最高）
  const layout = R.tokenConflicts.filter((c) =>
    /^(--border-radius|--font-stack|.*-radius-)/.test(c.name) ||
    /(serif|sans-serif)/.test(c.defs.map((d) => d.value).join(' ')));
  out.write(`\n[lint-tokens] INFO 规则C: ${R.tokenConflicts.length} 个同名令牌跨 styles/*.wxss 取值冲突（运行时 theme-teal 最后声明故正确，但 variables.wxss 整份是旧坐标系，属定时炸弹）\n`);
  out.write(`  根因：variables.wxss 与 theme-teal.wxss 同名不同值 ${VT_CONFLICTS} 处；最终生效 = @import 顺序最后声明者（见每行末）。去重见任务 #10。\n`);
  if (layout.length) {
    out.write(`  ⚠ 布局/字形级冲突（非纯色，改顺序会瞬间错位）: ${layout.length} 处\n`);
    layout.slice(0, 12).forEach((c) => out.write(`    ${c.name}: ${c.defs.map((d) => `${base(d.file)}=${d.value}`).join(' / ')}\n`));
  }
  R.tokenConflicts.slice(0, 30).forEach((c) => out.write(shown(c) + '\n'));
  if (R.tokenConflicts.length > 30) out.write(`  ...另有 ${R.tokenConflicts.length - 30} 处（任务 #10 全量清单）\n`);
}

// 桶③ 跨产品面
if (R.legacyCross.length > 0) {
  out.write(`\n[lint-tokens] INFO 桶③: ${R.legacyCross.length} 处旧坐标位于 web-admin（独立 Vue 后台，非小程序）\n`);
  out.write(`  性质：多为 echarts 图表调色板；是否纳入奢华体系待产品决策，默认不阻断。\n`);
  R.legacyCross.forEach((r) => out.write(fmt(r) + '\n'));
}

// 桶② 真实泄漏
if (R.legacyLeak.length > 0) {
  const raw = R.legacyLeak.filter((r) => r.form === 'raw');
  const fb = R.legacyLeak.filter((r) => r.form === 'fallback');
  const spec = R.legacyLeak.filter((r) => r.form === 'spec');
  const tag = STRICT ? 'FAIL' : 'WARN';
  out.write(`\n[lint-tokens] ${tag} 桶②: ${R.legacyLeak.length} 处旧坐标真实泄漏 — 运行时裸码 ${raw.length} / var 兜底 ${fb.length} / 规格源 ${spec.length}\n`);
  if (raw.length) {
    out.write(`  ── ②a 运行时裸硬编码（令牌层改不动它，必然错，最高优先级）──\n`);
    raw.forEach((r) => out.write(fmt(r) + '\n'));
  }
  if (spec.length) {
    out.write(`  ── ②b 规格真相源 design-tokens.json（不渲染，但会误导后续实现）──\n`);
    out.write(`     注：accent 金family 已同步为 #C9A24B，primary 绿family 仍停留旧橄榄坐标 → 半迁移状态\n`);
    const lines = [...new Set(spec.map((r) => r.line))].sort((a, b) => a - b);
    out.write(`     design-tokens.json 命中行: ${lines.join(', ')}\n`);
  }
  if (fb.length) {
    out.write(`  ── ②c var(--x, 兜底≠真值) 兜底（规则 D：兜底值与令牌最终生效值不一致，二级雷）──\n`);
    const byFile = new Map();
    fb.forEach((r) => byFile.set(r.rel, (byFile.get(r.rel) || 0) + 1));
    [...byFile.entries()].sort((a, b) => b[1] - a[1])
      .forEach(([f, n]) => out.write(`  ${f}  ×${n}\n`));
  }
}

// 桶②b-doc 规格源文档字段（降级为 INFO：可见、计数，但不参与 exit code）
if (R.legacyDoc.length > 0) {
  out.write(`\n[lint-tokens] INFO 桶②b-doc: ${R.legacyDoc.length} 处旧坐标位于 design-tokens.json 的 \`_\` 前缀文档字段\n`);
  out.write(`  性质：说明性引用（记录"什么被废弃了"），非规格值本身 → 降级不阻断。判据为键名结构 /^\\s*"_[A-Za-z0-9_]+"\\s*:/，不看内容。\n`);
  out.write(`  仍打印的理由：若有人把真实令牌值误写进 \`_\` 键、或文档引用的废弃值本身写错，这里是唯一能看见的地方。静默 = 后门。\n`);
  R.legacyDoc.forEach((r) => out.write(`  ${r.rel}:${r.line}  ${r.text}  ← "${r.docKey}" 说明性引用（${r.note}）\n`));
}

// 规则 E 对比度（保守版：只观测、不阻断 —— 本段不含任何 process.exit / STRICT 分支）
if (R.contrast.length > 0) {
  const sure = R.contrast.filter((c) => !c.approx);
  const appr = R.contrast.filter((c) => c.approx);
  out.write(`\n[lint-tokens] INFO 规则E: ${R.contrast.length} 处「同规则内 color × background」对比度低于 WCAG AA — 确定 ${sure.length} / 渐变近似 ${appr.length}\n`);
  out.write(`  口径：只扫同一条规则里同时写了 color 与 background(-color) 的块；var() 递归解析到字面量（解析不动/半透明则跳过，不猜）。\n`);
  out.write(`  阈值：正文 ${WCAG_AA_NORMAL}:1；font-size ≥36rpx(18px) 按大字号 ${WCAG_AA_LARGE}:1。渐变底色取第一个色停作近似，标 [近似]。\n`);
  out.write(`  性质：观测项，不阻断、不参与 exit code。命中不等于线上一定不合格（真实底色可能来自父级/图片），仅供 #14 白字底色硬约束取样。\n`);
  const order = [...sure, ...appr].sort((a, b) => a.ratio - b.ratio);
  order.slice(0, 30).forEach((c) => out.write(
    `  ${c.rel}  {${c.selector}}  ${c.ratio}:1 < ${c.need}:1  fg=${c.fg} bg=${c.bg}${c.approx ? '  [近似]' : ''}\n`));
  if (order.length > 30) out.write(`  ...另有 ${order.length - 30} 处（--json 看全量）\n`);
}

// 规则 A 终裁
if (R.wildHits.length > 0) {
  errOut(`\n[lint-tokens] FAIL: 发现 ${R.wildHits.length} 处野金残留（#C9A96E/#B8893A/#D4A858，含 hex 与十进制 rgba）\n`);
  R.wildHits.forEach((h) => errOut(`  ${h.rel}:${h.line}  ${h.text}\n`));
  process.exit(1);
}

out.write(`\n[lint-tokens] 规则A PASS: 野金残留 = 0（hex + 十进制 rgba 三通道，含注释文本）\n`);
out.write(`[lint-tokens] 规则B 汇总: 桶①令牌层·已覆盖 ${R.legacyInfo.length} / 桶①b·未覆盖 ${R.legacyUncov.length} / 桶②泄漏 ${R.legacyLeak.length} / 桶②b-doc 规格源文档字段 ${R.legacyDoc.length}（不阻断）/ 桶③跨产品 ${R.legacyCross.length}\n`);
out.write(`[lint-tokens] 规则C 汇总: 同名令牌跨文件冲突 ${R.tokenConflicts.length}（其中 variables↔theme-teal ${VT_CONFLICTS}）→ 去重见任务 #10\n`);
out.write(`[lint-tokens] 规则E 汇总: 对比度不足 ${R.contrast.length}（确定 ${R.contrast.filter((c) => !c.approx).length} / 渐变近似 ${R.contrast.filter((c) => c.approx).length}）· 观测项不阻断\n`);

if (STRICT && R.legacyLeak.length > 0) {
  errOut(`\n[lint-tokens] STRICT FAIL: 桶② 旧坐标泄漏 ${R.legacyLeak.length} 处未清零\n`);
  process.exit(1);
}
out.write(`[lint-tokens] ${STRICT ? 'STRICT ' : ''}PASS\n`);
process.exit(0);
