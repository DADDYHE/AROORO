#!/usr/bin/env node
/* 精确列出规则 D 命中的 var(--x, 兜底≠真值) 行：复用 lint-tokens 的令牌索引逻辑 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const CASCADE = require('./verify-token-cascade.js');

const IMPORT_ORDER = [
  'styles/variables.wxss',
  'styles/design-tokens.wxss',
  'styles/theme-teal.wxss',
  'styles/motion.wxss',
  'styles/loading-animation.wxss',
  'styles/components.wxss',
];
const TOKEN_FINAL = new Map();
for (const rel of IMPORT_ORDER) {
  for (const blk of CASCADE.blocksOf(rel)) {
    if (!CASCADE.isPageSel(blk.selector)) continue;
    for (const d of blk.decls) TOKEN_FINAL.set(d.prop, d.value);
  }
}

const FALLBACK_FULL_RE = /var\(\s*(--[A-Za-z0-9_-]+)\s*,\s*((?:[^()]|\([^()]*\))*)\)/g;
const isCssColor = (v) => /^#([0-9a-fA-F]{3,8})$/.test(v) || /^rgba?\(/i.test(v);
const normColor = (v) => {
  v = v.toLowerCase().replace(/\s+/g, '');
  const m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v);
  if (m) return `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`;
  return v;
};

const files = process.argv.slice(2);
for (const f of files) {
  const lines = fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n');
  lines.forEach((line, i) => {
    FALLBACK_FULL_RE.lastIndex = 0;
    let m;
    while ((m = FALLBACK_FULL_RE.exec(line))) {
      const token = m[1], fb = m[2].trim();
      if (!isCssColor(fb) || !TOKEN_FINAL.has(token)) continue;
      const final = TOKEN_FINAL.get(token);
      if (isCssColor(final) && normColor(fb) !== normColor(final)) {
        console.log(`${f}:${i + 1}  ${token}  fallback=${fb}  真值=${final}`);
      }
    }
  });
}
