/**
 * Audit 聚合器
 *
 * 用途：替代 ci:check 中的 50+ 行 audit 巨链。
 * 用法：
 *   node scripts/audit-all.js
 *   node scripts/audit-all.js --strict
 *   node scripts/audit-all.js --strict --bail
 *
 * --strict：对支持 --strict 的脚本透传参数（其他脚本跳过）
 * --bail：任一失败立即停止
 *
 * 退出码：0 全部通过，1 有失败
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SCRIPTS_DIR = path.join(ROOT, 'scripts');

const args = process.argv.slice(2);
const STRICT = args.includes('--strict');
const BAIL = args.includes('--bail');

// 排除自身
const SELF = 'audit-all.js';

// 优先跑的（顺序：项目级 → s22 → s23 → s24..s47）
const PRIORITY_ORDER = [
  /^audit-(naming|env-secrets|empty-catch|duplication|error-codes|errors-singleton|global-rate-limit|common-refs)\.js$/,
  /^audit-s22-.*\.js$/,
  /^audit-s23-.*\.js$/,
  /^audit-s2[4-7]-.*\.js$/,
  /^audit-s3[0-2]-.*\.js$/,
  /^audit-s3[3-9]-.*\.js$/,
  /^audit-s4[0-9]-.*\.js$/,
  /^audit-s47-.*\.js$/,
];

const auditFiles = fs.readdirSync(SCRIPTS_DIR)
  .filter(f => /^audit-.*\.js$/.test(f) && f !== SELF)
  .sort((a, b) => {
    // 按 PRIORITY_ORDER 的子模式优先级排序（保持稳定）
    for (const re of PRIORITY_ORDER) {
      const aMatch = re.test(a) ? 0 : 1;
      const bMatch = re.test(b) ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;
    }
    return a.localeCompare(b);
  });

let pass = 0;
let fail = 0;
let skipped = 0;
const failures = [];
const start = Date.now();

for (const file of auditFiles) {
  const scriptPath = path.join(SCRIPTS_DIR, file);
  const cmdArgs = [scriptPath];

  if (STRICT) {
    // 启发式：脚本源码中是否出现 '--strict' 字面
    const content = fs.readFileSync(scriptPath, 'utf8');
    if (content.includes('--strict') || content.includes("'--strict'") || content.includes('"--strict"')) {
      cmdArgs.push('--strict');
    } else {
      skipped++;
      console.log(`\n⏭  ${file} (no --strict support, skipped)`);
      continue;
    }
  }

  console.log(`\n===== ${file} =====`);
  const result = spawnSync('node', cmdArgs, { stdio: 'inherit', cwd: ROOT });

  if (result.status === 0) {
    pass++;
  } else {
    fail++;
    failures.push(file);
    if (BAIL) break;
  }
}

const elapsed = ((Date.now() - start) / 1000).toFixed(1);
console.log(`\n${'='.repeat(60)}`);
console.log(`[audit-all] 完成（${elapsed}s）${STRICT ? ' [STRICT]' : ''}`);
console.log(`  ✅ pass:    ${pass}`);
console.log(`  ❌ fail:    ${fail}`);
console.log(`  ⏭  skipped: ${skipped}`);
console.log(`  total:      ${auditFiles.length}`);
if (failures.length > 0) {
  console.log(`\n失败清单：`);
  failures.forEach(f => console.log(`  - ${f}`));
}
process.exit(fail > 0 ? 1 : 0);
