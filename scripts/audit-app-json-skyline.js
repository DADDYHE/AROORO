#!/usr/bin/env node
'use strict';
/**
 * audit-app-json-skyline.js — app.json 的 Skyline / glass-easel 配置门控
 * ----------------------------------------------------------------------------
 * 立项原因（2026-09-12 真机日志）：
 *   `invalid app.json window["glassEaselWebview"]`
 * 本仓把 `glassEaselWebview: true` 写进了 `app.json` 的 **`window`** 里。它是一对顶层键
 * `{ componentFramework: "glass-easel", glassEaselWebview: true }`（官方《组件框架 /
 * 迁移到 glass-easel》）。放错层级的后果是**该配置静默失效**：devtools 只吐一行
 * `invalid app.json ...`，不报错、不中断编译，而 WebView 回退环境会继续按灰度策略随机
 * 选 exparser / glass-easel 运行时 —— 正好是这条配置要消除的分叉。
 *
 * 判据：官方文档 https://developers.weixin.qq.com/miniprogram/dev/framework/custom-component/glass-easel/migration
 *   · 配置块原文（**顶层**）：{ "componentFramework": "glass-easel", "glassEaselWebview": true }
 *   · "只推荐**同时使用**上述两个配置项，不要单独使用其中一个配置项"
 *   · "对于使用 Skyline 渲染引擎的页面，建议也加上 glassEaselWebview 配置项，
 *      以便在不支持 Skyline 的环境下也统一使用 glass-easel 作为组件框架运行时"
 *
 * 规则：
 *   【R1 · BLOCK】Skyline / glass-easel 相关键出现在 `window` 里
 *     被包含的键：glassEaselWebview / componentFramework / renderer / rendererOptions /
 *                lazyCodeLoading / disableScroll
 *     `window` 的合法键是窗口外观类（navigationStyle / backgroundColor / …），渲染器与
 *     组件框架配置一律属于**顶层**。放进去 = 一行日志 + 静默失效。
 *   【R2 · WARN】`componentFramework: "glass-easel"` 已开，但**全局（app.json 或任一页面 json）均无 `glassEaselWebview`**
 *     文档明确"不要单独使用其中一个"（只在 WebView 回退引擎下才有实际差别）。
 *     ⚠ 实测（基础库 3.17.2）：`glassEaselWebview` 放 **app.json 顶层或 window 都会 invalid**，只能放**页面 json**（devtools 提示"页面配置优先"与文档"app.json 全局开启"在该基础库矛盾，以实测为准）。故 R2 看全局是否至少一处配了。
 *   【R3 · WARN】`renderer: "skyline"` 但缺 `lazyCodeLoading: "requiredComponents"`
 *     按需注入是 Skyline 启动耗时的基本盘；缺失时每个页面都会注入全量组件。
 *   【R4 · WARN】页面级 JSON 里出现 `rendererOptions.skyline.disableABTest` 之外的
 *     `renderer` 覆写却与全局不一致 —— 暂不实现，留位（避免凭记忆写白名单造成误报）。
 *
 * 用法：
 *   node scripts/audit-app-json-skyline.js              # 校验 app.json 与全部页面/组件 json
 *   node scripts/audit-app-json-skyline.js --strict     # 规则 B 也阻断
 *   node scripts/audit-app-json-skyline.js --json       # 机器可读
 *   node scripts/audit-app-json-skyline.js <path>       # 只校验指定 json（自测用）
 * 退出码：0 通过；1 = 有 BLOCK，或 --strict 下有 WARN。
 *
 * 命名刻意用 `audit-` 前缀：`scripts/audit-all.js` 按 `/^audit-.*\.js$/` 自动收集，
 * 挂上即可进 CI，不需要改聚合器。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ARGV = process.argv.slice(2);
const STRICT = ARGV.includes('--strict');
const JSON_OUT = ARGV.includes('--json');
const EXPLICIT = ARGV.find((a) => !a.startsWith('--'));

// `window` 里一旦出现这些键 → 必 BLOCK（它们属于 app.json / page.json 的顶层）
const RENDER_KEYS = [
  'glassEaselWebview', 'componentFramework', 'renderer', 'rendererOptions',
  'lazyCodeLoading', 'disableScroll',
];

const findings = [];
const add = (rule, level, file, msg) => findings.push({ rule, level, file, msg });
let anyGlassEaselWebview = false; // 全局是否至少有一处配了 glassEaselWebview:true
let appObj = null;                // 缓存 app.json 解析结果，供循环后 R2 全局判定

/** 严格 JSON 解析；失败即 BLOCK（app.json 是严格 JSON，不接受注释） */
function parseJson(file, abs) {
  const raw = fs.readFileSync(abs, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (e) {
    add('R0', 'BLOCK', file, '不是合法的严格 JSON（' + e.message + '）—— app.json / 页面 json 不允许注释。');
    return null;
  }
}

function checkAppJson(file, obj) {
  // R1：渲染/组件框架配置被错放进 window
  for (const k of RENDER_KEYS) {
    if (obj.window && Object.prototype.hasOwnProperty.call(obj.window, k)) {
      add('R1', 'BLOCK', file,
        `window["${k}"] 会被判 invalid 而**静默失效**（devtools 只给一行日志）。` +
        `该类键必须写在 JSON 顶层，与 componentFramework 同层。`);
    }
  }
  // R3（R2 改为循环后全局判定，见下方「R2 全局判定」）
  if (obj.renderer === 'skyline' && obj.lazyCodeLoading !== 'requiredComponents') {
    add('R3', 'WARN', file,
      'renderer: "skyline" 但 lazyCodeLoading 不是 "requiredComponents"，按需注入未开满。');
  }
}

/* ------------------------------- 收集 ------------------------------- */
// 只扫小程序自身的 JSON：app.json + 页面/组件目录。刻意**不从仓库根递归**——
// 根目录混着 tsconfig.json / .prettierrc 之类工具链配置（常允许注释），
// 一起扫会拿 R0 报一堆与小程序无关的假阳性。
const SCAN_DIRS = ['pages', 'subpackages', 'components', 'custom-tab-bar'];
const targets = [];
if (EXPLICIT) {
  targets.push({ rel: EXPLICIT, abs: path.resolve(ROOT, EXPLICIT) });
} else {
  targets.push({ rel: 'app.json', abs: path.join(ROOT, 'app.json') });
  for (const d of SCAN_DIRS) {
    (function walk(abs, rel) {
      let entries;
      try { entries = fs.readdirSync(abs, { withFileTypes: true }); } catch (e) { return; }
      for (const e of entries) {
        const r = rel ? rel + '/' + e.name : e.name;
        if (e.isDirectory()) {
          if (e.name === 'node_modules') continue;
          walk(path.join(abs, e.name), r);
        } else if (e.name.endsWith('.json')) {
          targets.push({ rel: r, abs: path.join(abs, e.name) });
        }
      }
    })(path.join(ROOT, d), d);
  }
}

/* ------------------------------- 校验 ------------------------------- */
for (const t of targets) {
  if (!fs.existsSync(t.abs)) continue;
  const obj = parseJson(t.rel, t.abs);
  if (!obj) continue;
  if (t.rel === 'app.json') { appObj = obj; checkAppJson(t.rel, obj); }
  if (obj.glassEaselWebview === true) anyGlassEaselWebview = true;
  // 页面/组件 json：同样查 window 误放（页面 json 合法键与 app.json 的 window 一致）
  else for (const k of RENDER_KEYS) {
    if (obj.window && Object.prototype.hasOwnProperty.call(obj.window, k)) {
      add('R1', 'BLOCK', t.rel, `window["${k}"] 会被判 invalid 而静默失效，请移到该 json 顶层。`);
    }
  }
}

/* ------------------------------- R2 全局判定 ------------------------------- */
// 基础库 3.17.2 实测三连（2026-09-12）：app.json 顶层 / app.json window / 页面 json 放
// glassEaselWebview 都会被校验器判 invalid。其中**页面级是知情决策**（DADDY 2026-09-12 拍板：
// 全站页面 json 配置，用每页一条 invalid 日志换取 Skyline「未配置」提示静音），记 INFO 豁免；
// 但 **app.json 里出现仍属配置错误**（该文件层面无意义且必 invalid），保持 WARN。
if (appObj && (appObj.glassEaselWebview !== undefined)) {
  add('R2', 'WARN', 'app.json',
    'app.json 出现 glassEaselWebview（顶层/window 均必 invalid 且无意义）——页面级配置才是知情豁免位置，请从 app.json 移除。');
} else if (anyGlassEaselWebview) {
  const n = targets.filter((t) => {
    try { return JSON.parse(fs.readFileSync(t.abs, 'utf8')).glassEaselWebview === true; } catch (e) { return false; }
  }).length;
  add('R2', 'INFO', 'glassEaselWebview',
    `页面级 glassEaselWebview ×${n}（知情豁免）：基础库 3.17.2 会每页打一条 invalid page.json 日志，属预期噪音；` +
    '换来 Skyline「未配置」提示静音。微信修复校验器后可整体 revert。');
}

/* ------------------------------- 输出 ------------------------------- */
const nB = findings.filter((f) => f.level === 'BLOCK').length;
const nW = findings.filter((f) => f.level === 'WARN').length;

if (JSON_OUT) {
  console.log(JSON.stringify({ scanned: targets.length, summary: { BLOCK: nB, WARN: nW }, findings }, null, 2));
  process.exit(nB || (STRICT && nW) ? 1 : 0);
}

console.log('audit-app-json-skyline · 扫描 %d 个 json', targets.length);
if (!findings.length) {
  console.log('PASS · Skyline / glass-easel 配置位置与配对均正确（BLOCK 0 / WARN 0）');
} else {
  for (const f of findings) console.log('  [%s · %s] %s\n      → %s', f.rule, f.level, f.file, f.msg);
  console.log('小计 BLOCK %d / WARN %d', nB, nW);
}
const fail = nB > 0 || (STRICT && nW > 0);
console.log(fail ? (STRICT ? 'FAIL（--strict）' : 'FAIL（规则 R1/R0 未清零）') : 'PASS');
process.exit(fail ? 1 : 0);
