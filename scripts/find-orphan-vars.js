#!/usr/bin/env node
/* find-orphan-vars.js — 孤儿 CSS 变量检测
   定义：var(--x) 被使用，但 --x 在全仓任何 .wxss 中都无定义（含局部定义）。
   这类死引用会让属性落到 initial/inherit，造成无声视觉回归 ——
   典型案例：var(--zy-accent-gold, #C9A24B) 长期靠兜底渲染，令牌从未存在。
   判定精度：只报「全仓零定义」的，宁可漏报（跨文件父级定义/JS 动态注入）不可误报。 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const EXCLUDE_DIRS = new Set([
  'node_modules', 'miniprogram_npm', '.git', 'docs', 'docs-archive',
  'scripts', 'deliverables', 'dist',
]);

const defined = new Set();   // token 名 → 有定义
const used = new Map();      // token 名 → [{file, line}]
const DEF_RE = /(^|[;{\s])--[\w-]+\s*:/g;   // 定义处（含 --tb-* 局部令牌）
const USE_RE = /var\(\s*(--[\w-]+)/g;       // 使用处（含 var(--x, fallback)）

function walk(abs, rel) {
  let entries;
  try { entries = fs.readdirSync(abs, { withFileTypes: true }); } catch (e) { return; }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const childRel = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) {
      if (EXCLUDE_DIRS.has(e.name)) continue;
      if (childRel === 'web-admin/dist') continue;
      walk(path.join(abs, e.name), childRel);
    } else if (e.isFile() && /\.(wxss|wxml)$/.test(e.name)) {
      const isWxss = e.name.endsWith('.wxss');
      const lines = fs.readFileSync(path.join(abs, e.name), 'utf8').split('\n');
      let inComment = false; // 跨行块注释状态机：/* 开启后逐行持续到 */
      lines.forEach((line, i) => {
        let m, code = '';
        for (let j = 0; j < line.length; j++) {
          if (inComment) {
            const end = line.indexOf('*/', j);
            if (end === -1) { j = line.length; } else { inComment = false; j = end + 1; }
          } else {
            const start = line.indexOf('/*', j);
            if (start === -1) { code += line.slice(j); j = line.length; }
            else { code += line.slice(j, start); inComment = true; j = start + 1; }
          }
        }
        if (isWxss) {
          DEF_RE.lastIndex = 0;
          while ((m = DEF_RE.exec(code))) defined.add(m[0].replace(/^[;{\s]/, '').replace(/\s*:$/, '').slice(2));
        }
        USE_RE.lastIndex = 0;
        while ((m = USE_RE.exec(code))) {
          const name = m[1].slice(2);
          if (!used.has(name)) used.set(name, []);
          used.get(name).push(`${childRel}:${i + 1}`);
        }
      });
    }
  }
}

walk(ROOT, '');

let orphans = 0;
for (const [name, refs] of used) {
  if (!defined.has(name)) {
    orphans++;
    console.log(`ORPHAN  --${name}`);
    refs.slice(0, 5).forEach((r) => console.log(`        ${r}`));
    if (refs.length > 5) console.log(`        ...另有 ${refs.length - 5} 处`);
  }
}
console.log(orphans === 0
  ? '[orphan-vars] PASS: 全部 var() 引用均有定义'
  : `[orphan-vars] FAIL: ${orphans} 个孤儿令牌（全仓零定义）`);
process.exit(orphans === 0 ? 0 : 1);
