#!/usr/bin/env node
/* dedupe-pressed.js — 清理 add-micro v3 因「按元素收集 needNew」导致同 class 被重复追加的
 *   .X--pressed 规则（保留每个 class 的首次出现，删除后续重复）。
 * 仅处理 --pressed（hover 风格），不触碰 .X.pressed（JS 风格）。
 * 用法：node scripts/dedupe-pressed.js [--apply]
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const APPLY = process.argv.includes('--apply');
const DRY = !APPLY;

const TARGETS = [
  'subpackages/booking/host-list-all',
  'subpackages/booking/host-detail',
  'subpackages/profile/login/index',
  'subpackages/profile/notification/list',
  'subpackages/profile/order-stats/index',
  'subpackages/profile/mall-order-detail/index',
  'subpackages/profile/order-detail/index',
  'subpackages/feeding/order-status',
  'subpackages/partner/withdrawal/index',
  'subpackages/profile/referral/index',
].map((b) => path.join(ROOT, b + '.wxss'));

/** 找出所有 .X--pressed { ... } 规则区间（括号深度配平） */
function findPressedRules(s) {
  const rules = [];
  const re = /\.([\w-]+)--pressed\s*\{/g;
  let m;
  while ((m = re.exec(s))) {
    const cls = m[1];
    const open = s.indexOf('{', m.index);
    let depth = 0;
    let end = -1;
    for (let j = open; j < s.length; j++) {
      if (s[j] === '{') depth++;
      else if (s[j] === '}') { depth--; if (depth === 0) { end = j; break; } }
    }
    if (end >= 0) rules.push({ cls, start: m.index, end: end + 1 });
  }
  return rules;
}

let totalRemoved = 0;
const report = [];
for (const file of TARGETS) {
  if (!fs.existsSync(file)) continue;
  const s = fs.readFileSync(file, 'utf8');
  const rules = findPressedRules(s);
  const seen = new Set();
  const remove = [];
  for (const r of rules) {
    if (seen.has(r.cls)) remove.push(r);
    else seen.add(r.cls);
  }
  if (!remove.length) continue;
  // 从后往前删，避免偏移
  let out = s;
  for (const r of remove.slice().sort((a, b) => b.start - a.start)) {
    out = out.slice(0, r.start) + out.slice(r.end);
  }
  if (APPLY) fs.writeFileSync(file, out, 'utf8');
  totalRemoved += remove.length;
  report.push(`✅ ${path.relative(ROOT, file)}：删除重复 --pressed ${remove.length} 条（保留 ${seen.size} 类）`);
}

console.log(report.length ? report.join('\n') : '（无重复需清理）');
console.log(`\n模式：${APPLY ? 'APPLY（已写盘）' : 'DRY（预览）'}  共删除重复规则=${totalRemoved}`);
