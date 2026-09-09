#!/usr/bin/env node
/* WXML 标签平衡校验：检查开始/结束标签是否配对（自闭合与空元素跳过） */
const fs = require('fs');
const path = require('path');

const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: node wxml-balance-check.js <wxml...>');
  process.exit(2);
}

const VOID = new Set(['input', 'image', 'import', 'include', 'wxs']);
let allOk = true;

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  // 去注释
  const clean = src.replace(/<!--[\s\S]*?-->/g, '');
  const stack = [];
  const re = /<(\/)?([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)?(\/)?>/g;
  let m, err = null;
  while ((m = re.exec(clean))) {
    const close = m[1], tag = m[2], self = m[4];
    if (self || VOID.has(tag)) continue;
    if (close) {
      const top = stack.pop();
      if (top !== tag) { err = `mismatch </${tag}> (expect ${top})`; break; }
    } else stack.push(tag);
  }
  if (!err && stack.length) err = `unclosed: ${stack.join(',')}`;
  if (err) { allOk = false; console.log(`FAIL ${path.basename(f)}: ${err}`); }
  else console.log(`PASS ${f}`);
}
process.exit(allOk ? 0 : 1);
