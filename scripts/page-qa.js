#!/usr/bin/env node
/* page-qa.js — 页面静态 QA：WXML ↔ JS/JSON 一致性（全站扫描）
   校验五件事（页面能渲染不白屏的关键链路）：
   1. wxml 中的事件处理器（bind / catch / mut-bind / capture-* 系列）在 js 或 behaviors 中有对应方法
   2. wxml 中的自定义组件标签在 json usingComponents 或 app.json 全局注册中已声明
   3. 注册了但 wxml 未使用的组件（信息级）
   4. behaviors 数组引用的标识符：require 必须出现在 Page( 之前（否则运行时 ReferenceError）
   5. require 的 behavior / 组件文件必须真实存在（路径可解析）

   历史盲区修复（2026-09-10）：旧版只校验硬编码的 4 个页面，导致批量接入时
   4 个页面 behavior require 落到 Page() 之后（线上报 authGateBehavior is not defined）未被拦截。
   现改为从 app.json 枚举全站页面。 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const APP_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
const GLOBAL_COMPONENTS = new Set(Object.keys(APP_JSON.usingComponents || {}));

const PAGES = [
  ...(APP_JSON.pages || []),
  ...(APP_JSON.subPackages || []).flatMap(sp =>
    (sp.pages || []).map(p => `${(sp.root || '').replace(/\/$/, '')}/${p}`)
  ),
];

/* 解析页面 js 的 behaviors 链：提取 require 的 behavior 文件并合并其方法名。 */
function behaviorMethods(jsSrc, pageDir, seen = new Set()) {
  const methods = new Set();
  const bm = /behaviors:\s*\[([^\]]+)\]/.exec(jsSrc);
  if (!bm) return methods;
  for (const raw of bm[1].split(',')) {
    const name = raw.trim();
    if (!name) continue;
    const req = new RegExp(`(?:const|let|var)\\s*\\{?\\s*${name}\\s*\\}?\\s*=\\s*require\\(\\s*['"]([^'"]+)['"]\\s*\\)`).exec(jsSrc);
    if (!req) continue;
    const bPath = path.resolve(pageDir, req[1]);
    if (seen.has(bPath)) continue;
    seen.add(bPath);
    let bSrc = '';
    try { bSrc = fs.readFileSync(bPath + (bPath.endsWith('.js') ? '' : '.js'), 'utf8'); } catch (e) { continue; }
    for (const mm of bSrc.matchAll(/(?:^|[,{\s])([A-Za-z_$][\w$]*)\s*[:(=]/g)) {
      const n = mm[1];
      if (!['require', 'module', 'exports', 'const', 'let', 'var', 'Behavior', 'if', 'for', 'while', 'switch', 'return', 'typeof', 'function'].includes(n)) methods.add(n);
    }
    for (const deep of behaviorMethods(bSrc, path.dirname(bPath), seen)) methods.add(deep);
  }
  return methods;
}

const BUILTIN = new Set(['view', 'text', 'image', 'input', 'textarea', 'button', 'scroll-view',
  'swiper', 'swiper-item', 'navigator', 'block', 'template', 'import', 'include', 'wxs',
  'form', 'checkbox', 'checkbox-group', 'radio', 'radio-group', 'switch', 'slider', 'picker', 'picker-view', 'picker-view-column',
  'progress', 'rich-text', 'video', 'camera', 'live-player', 'live-pusher', 'map', 'canvas',
  'web-view', 'ad', 'official-account', 'open-data', 'navigation-bar', 'page-meta',
  'root-portal', 'page-container', 'share-element', 'functional-page-navigator', 'movable-view',
  'movable-area', 'cover-view', 'cover-image', 'editor', 'label', 'icon', 'inneraudio', 'audio', 'match-media', 'keyboard-accessory', 'slot', 'component', 'custom-wrapper', 'page']);

const EVT_RE = /(?:bind|catch|mut-bind|capture-bind|capture-catch)[:]?[\w-]+\s*=\s*"([\w.]+)"/g;
const TAG_RE = /<([a-z][\w-]*)/g;

let fail = 0;
const warned = [];

for (const base of PAGES) {
  const wxmlPath = path.join(ROOT, base + '.wxml');
  if (!fs.existsSync(wxmlPath)) continue;
  const jsPath = path.join(ROOT, base + '.js');
  const jsonPath = path.join(ROOT, base + '.json');
  const wxml = fs.readFileSync(wxmlPath, 'utf8');
  const js = fs.existsSync(jsPath) ? fs.readFileSync(jsPath, 'utf8') : '';
  let json = { usingComponents: {} };
  try { json = JSON.parse(fs.readFileSync(jsonPath, 'utf8')); } catch (e) { /* 无 json 视为无页面级组件 */ }
  const pageDir = path.dirname(wxmlPath);
  const behaviorSet = behaviorMethods(js, pageDir);
  const issues = [];

  // 1. 事件处理器存在性
  let m;
  EVT_RE.lastIndex = 0;
  const handlers = new Set();
  while ((m = EVT_RE.exec(wxml))) {
    const h = m[1].split('.')[0];
    if (/^[A-Za-z_$][\w$]*$/.test(h) && !['true', 'false', 'null', 'undefined'].includes(h)) handlers.add(h); // 排除字面量/保留字
  }
  for (const h of handlers) {
    const declared = new RegExp(`(?:^|[\\s,{])${h}\\s*[:(=]`).test(js) || behaviorSet.has(h);
    if (!declared && !/^(onLoad|onShow|onHide|onUnload|onReady|onPullDownRefresh|onReachBottom|onShareAppMessage|onShareTimeline|onPageScroll|onResize|onTabItemTap)$/.test(h)) {
      issues.push(`handler 缺失: "${h}" 在 js 与 behaviors 中均未定义`);
    }
  }

  // 2. 组件标签注册校验
  const regs = new Set([...Object.keys(json.usingComponents || {}), ...GLOBAL_COMPONENTS]);
  TAG_RE.lastIndex = 0;
  const tags = new Set();
  while ((m = TAG_RE.exec(wxml))) tags.add(m[1]);
  for (const tag of tags) {
    if (BUILTIN.has(tag) || tag.startsWith('wx-')) continue;
    const snake = tag.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
    const camel = snake.replace(/-([a-z])/g, (s, c) => c.toUpperCase());
    if (!regs.has(tag) && !regs.has(snake) && !regs.has(camel)) {
      issues.push(`组件未注册: <${tag}> 不在 usingComponents`);
    }
  }

  // 3. behaviors 引用：require 必须在 Page( 之前 + 文件必须存在
  const bm = /behaviors:\s*\[([^\]]+)\]/.exec(js);
  if (bm) {
    const pageIdx = js.indexOf('Page(');
    for (const raw of bm[1].split(',')) {
      const name = raw.trim();
      if (!name) continue;
      const reqRe = new RegExp(`(?:const|let|var)\\s*\\{?\\s*${name}\\s*\\}?\\s*=\\s*require\\(\\s*['"]([^'"]+)['"]\\s*\\)`);
      const req = reqRe.exec(js);
      if (!req) {
        issues.push(`behavior 未 require: "${name}"（behaviors 数组引用但文件中无对应 require）`);
        continue;
      }
      if (pageIdx >= 0 && req.index > pageIdx) {
        issues.push(`behavior require 位置错误: "${name}" 的 require 出现在 Page() 之后 → 运行时 ReferenceError`);
      }
      const target = path.resolve(pageDir, req[1]);
      const exists = fs.existsSync(target) || fs.existsSync(target + '.js');
      if (!exists) issues.push(`behavior 文件不存在: "${name}" → ${req[1]}`);
    }
  }

  // 4. 反向：页面级注册但未使用（信息级）
  for (const r of Object.keys(json.usingComponents || {})) {
    const tag1 = r, tag2 = r.replace(/-([a-z])/g, (s, c) => c.toUpperCase());
    if (!tags.has(tag1) && !tags.has(tag2) && wxml.indexOf(`<${tag1}`) === -1 && wxml.indexOf(`<${tag2}`) === -1) {
      issues.push(`INFO 注册未使用: "${r}"`);
    }
  }

  const real = issues.filter(i => !i.startsWith('INFO'));
  if (real.length) {
    fail += real.length;
    console.log(`✖ ${base}`);
    issues.forEach(i => console.log('   ' + i));
  } else if (issues.length) {
    warned.push(base);
  }
}

console.log(`[page-qa] 扫描页面 ${PAGES.length} 个${warned.length ? `（${warned.length} 个仅含 INFO）` : ''}`);
console.log(fail === 0 ? '[page-qa] PASS' : `[page-qa] FAIL: ${fail} 个确定性缺失`);
process.exit(fail === 0 ? 0 : 1);
