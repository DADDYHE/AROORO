#!/usr/bin/env node
/* page-qa.js — 页面静态 QA：WXML ↔ JS/JSON 一致性
   校验三件事（页面能渲染不白屏的关键链路）：
   1. wxml 中的事件处理器（bind / catch / mut-bind / capture-bind 系列）在 js 中有对应方法
   2. wxml 中的自定义组件标签在 json usingComponents 中已注册
   3. 注册了但 wxml 未使用的组件（信息级） */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

// 全局组件注册（app.json usingComponents 对所有页面生效）
const APP_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
const GLOBAL_COMPONENTS = new Set(Object.keys(APP_JSON.usingComponents || {}));

/* 解析页面 js 的 behaviors 链：提取 require 的 behavior 文件并合并其方法名。
   覆盖 behaviors: [A, B] 字面量形态（本项目全部为此形态）。 */
function behaviorMethods(jsSrc, pageDir, seen = new Set()) {
  const methods = new Set();
  const bm = /behaviors:\s*\[([^\]]+)\]/.exec(jsSrc);
  if (!bm) return methods;
  for (const raw of bm[1].split(',')) {
    const name = raw.trim();
    if (!name) continue;
    // 从 require 语句反查文件路径（支持 const X = require(..) 与 const { X } = require(..) 两种形态）
    const req = new RegExp(`(?:const|let|var)\\s*\\{?\\s*${name}\\s*\\}?\\s*=\\s*require\\(\\s*['"]([^'"]+)['"]\\s*\\)`).exec(jsSrc);
    if (!req) continue;
    const bPath = path.resolve(pageDir, req[1]);
    if (seen.has(bPath)) continue;
    seen.add(bPath);
    let bSrc = '';
    try { bSrc = fs.readFileSync(bPath + (bPath.endsWith('.js') ? '' : '.js'), 'utf8'); } catch (e) { continue; }
    // 对象方法名：method( / method: / method =
    for (const mm of bSrc.matchAll(/(?:^|[,{\s])([A-Za-z_$][\w$]*)\s*[:(=]/g)) {
      const n = mm[1];
      if (!['require', 'module', 'exports', 'const', 'let', 'var', 'Behavior', 'if', 'for', 'while', 'switch', 'return', 'typeof', 'function'].includes(n)) methods.add(n);
    }
    // 递归 behavior 的 behaviors
    for (const deep of behaviorMethods(bSrc, path.dirname(bPath), seen)) methods.add(deep);
  }
  return methods;
}

const pages = [
  ['subpackages/activity/register', 'subpackages/activity/register'],
  ['subpackages/profile/order-detail/index', 'subpackages/profile/order-detail/index'],
  ['subpackages/profile/mall-order-detail/index', 'subpackages/profile/mall-order-detail/index'],
  ['pages/group-detail/index', 'pages/group-detail/index'],
];

// 微信内置标签（不做组件注册校验的白名单）
const BUILTIN = new Set(['view', 'text', 'image', 'input', 'textarea', 'button', 'scroll-view',
  'swiper', 'swiper-item', 'navigator', 'block', 'template', 'import', 'include', 'wxs',
  'form', 'checkbox', 'radio', 'switch', 'slider', 'picker', 'picker-view', 'picker-view-column',
  'progress', 'rich-text', 'video', 'camera', 'live-player', 'live-pusher', 'map', 'canvas',
  'web-view', 'ad', 'official-account', 'open-data', 'navigation-bar', 'page-meta',
  'root-portal', 'page-container', 'share-element', 'functional-page-navigator', 'movable-view',
  'movable-area', 'cover-view', 'cover-image', 'editor', 'label', 'icon', 'inneraudio', 'audio', 'match-media', 'keyboard-accessory', 'slot', 'component', 'custom-wrapper', 'page']);

const EVT_RE = /(?:bind|catch|mut-bind|capture-bind|capture-catch)[:]?[\w-]+\s*=\s*"([\w.]+)"/g;
const TAG_RE = /<([a-z][\w-]*)/g;

let fail = 0;
for (const [wxmlBase] of pages) {
  const wxml = fs.readFileSync(path.join(ROOT, wxmlBase + '.wxml'), 'utf8');
  const js = fs.readFileSync(path.join(ROOT, wxmlBase + '.js'), 'utf8');
  const json = JSON.parse(fs.readFileSync(path.join(ROOT, wxmlBase + '.json'), 'utf8'));
  const behaviorSet = behaviorMethods(js, path.dirname(path.join(ROOT, wxmlBase)));
  const issues = [];

  // 1. 事件处理器存在性（页面 js 本体 ∪ behaviors 注入 ∪ 生命周期）
  let m;
  EVT_RE.lastIndex = 0;
  const handlers = new Set();
  while ((m = EVT_RE.exec(wxml))) {
    const h = m[1].split('.')[0]; // onFoo.bar → onFoo（触发语句）
    handlers.add(h);
  }
  for (const h of handlers) {
    const declared = new RegExp(`(?:^|[\\s,{])${h}\\s*[:(=]`).test(js) || behaviorSet.has(h);
    if (!declared && !/^(onLoad|onShow|onHide|onUnload|onReady|onPullDownRefresh|onReachBottom|onShareAppMessage|onPageScroll|onResize|onTabItemTap)$/.test(h)) {
      issues.push(`handler 缺失: "${h}" 在 js 与 behaviors 中均未定义`);
    }
  }

  // 2. 组件标签注册校验（页面 json ∪ app.json 全局）
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
  // 反向：页面级注册但未使用的（信息级，不算失败；全局注册不适用此检查）
  const pageRegs = new Set(Object.keys(json.usingComponents || {}));
  for (const r of pageRegs) {
    const tag1 = r, tag2 = r.replace(/-([a-z])/g, (s, c) => c.toUpperCase());
    if (!tags.has(tag1) && !tags.has(tag2) && wxml.indexOf(`<${tag1}`) === -1 && wxml.indexOf(`<${tag2}`) === -1) {
      issues.push(`INFO 注册未使用: "${r}"`);
    }
  }

  if (issues.length) { fail += issues.filter(i => !i.startsWith('INFO')).length; console.log(`✖ ${wxmlBase}`); issues.forEach(i => console.log('   ' + i)); }
  else console.log(`✓ ${wxmlBase}`);
}
console.log(fail === 0 ? '\n[page-qa] PASS' : `\n[page-qa] FAIL: ${fail} 个确定性缺失`);
process.exit(fail === 0 ? 0 : 1);
