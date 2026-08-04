/* tabBar 三方对照审计：theme-teal 定义 × design-tokens.json × 全仓 var() 消费 */
const fs = require('fs');
const path = require('path');
const ROOT = '/Users/yy/Documents/trae_projects/zuoyou';

// ---------- 1) theme-teal 定义（含行号） ----------
const tealPath = path.join(ROOT, 'styles/theme-teal.wxss');
const tealLines = fs.readFileSync(tealPath, 'utf8').split('\n');
const defs = {};           // name -> {value, line}
tealLines.forEach((ln, i) => {
  const m = ln.match(/^\s*(--zy-tabbar-[a-z0-9-]+|--zy-shadow-fab)\s*:\s*([^;]+);/);
  if (m) defs[m[1]] = { value: m[2].replace(/\/\*[\s\S]*?\*\//g, '').trim(), line: i + 1 };
});

// ---------- 2) 全仓 var() 消费扫描 ----------
const SKIP = new Set(['node_modules', 'miniprogram_npm', '.git', 'coverage', 'dist', 'deliverables', 'docs-archive']);
const EXT = new Set(['.wxss', '.wxml', '.js', '.json', '.ts', '.wxs', '.css', '.html']);
const uses = {};           // token -> [ 'file:line' ]
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (!EXT.has(path.extname(e.name))) continue;
    const rel = path.relative(ROOT, p);
    fs.readFileSync(p, 'utf8').split('\n').forEach((ln, i) => {
      for (const m of ln.matchAll(/var\(\s*(--zy-tabbar-[a-z0-9-]+|--zy-shadow-fab)\s*[,)]/g)) {
        (uses[m[1]] ||= []).push(`${rel}:${i + 1}`);
      }
    });
  }
}
walk(ROOT);

// ---------- 3) design-tokens.json ----------
const J = JSON.parse(fs.readFileSync(path.join(ROOT, 'design-tokens.json'), 'utf8'));
const jmap = {
  '--zy-tabbar-height': ['tabBar.height', J.tabBar?.height],
  '--zy-tabbar-safe-bottom': ['tabBar.safeBottom', J.tabBar?.safeBottom],
  '--zy-tabbar-total-height': ['tabBar.totalHeight', J.tabBar?.totalHeight],
  '--zy-tabbar-bg': ['tabBar.bg', J.tabBar?.bg],
  '--zy-tabbar-bg-glass': ['tabBar.bgGlass', J.tabBar?.bgGlass],
  '--zy-tabbar-blur': ['tabBar.blur', J.tabBar?.blur],
  '--zy-tabbar-border-top': ['tabBar.borderTop', J.tabBar?.borderTop],
  '--zy-tabbar-item-active': ['tabBar.itemActive', J.tabBar?.itemActive],
  '--zy-tabbar-item-inactive': ['tabBar.itemInactive', J.tabBar?.itemInactive],
  '--zy-tabbar-item-active-bg': ['tabBar.itemActiveBg', J.tabBar?.itemActiveBg],
  '--zy-tabbar-icon-size': ['tabBar.iconSize', J.tabBar?.iconSize],
  '--zy-tabbar-label-size': ['tabBar.labelSize', J.tabBar?.labelSize],
  '--zy-tabbar-label-weight': ['tabBar.labelWeight', J.tabBar?.labelWeight],
  '--zy-tabbar-label-weight-active': ['tabBar.labelWeightActive', J.tabBar?.labelWeightActive],
  '--zy-tabbar-center-d': ['tabBar.center.diameter', J.tabBar?.center?.diameter],
  '--zy-tabbar-center-protrusion': ['tabBar.center.protrusion', J.tabBar?.center?.protrusion],
  '--zy-tabbar-center-bottom': ['tabBar.center.bottom', J.tabBar?.center?.bottom],
  '--zy-tabbar-center-icon-size': ['tabBar.center.iconSize', J.tabBar?.center?.iconSize],
  '--zy-tabbar-center-grad': ['tabBar.center.gradient', J.tabBar?.center?.gradient],
  '--zy-tabbar-center-icon': ['tabBar.center.iconColor', J.tabBar?.center?.iconColor],
  '--zy-tabbar-center-shadow': ['tabBar.center.shadow', J.tabBar?.center?.shadow],
  '--zy-shadow-fab': ['shadow.fab', J.shadow?.fab],
};

const names = Object.keys(defs);
console.log(`theme-teal 中 --zy-tabbar-* 定义数: ${names.filter(n => n.startsWith('--zy-tabbar-')).length}`);
console.log(`(另含转引令牌 --zy-shadow-fab: ${names.includes('--zy-shadow-fab')})`);

const alive = [], dead = [];
for (const n of names) {
  // 排除 theme-teal 自身内部转引（--zy-shadow-fab: var(--zy-tabbar-center-shadow)）
  const ext = (uses[n] || []).filter(u => !u.startsWith('styles/theme-teal.wxss'));
  (ext.length ? alive : dead).push(n);
}
console.log(`\n实际被组件/页面消费(活): ${alive.length}`);
alive.forEach(n => console.log(`  ${n}  <- ${(uses[n] || []).filter(u => !u.startsWith('styles/theme-teal.wxss')).join(', ')}`));
console.log(`\n零消费(死规格): ${dead.length}`);
dead.forEach(n => console.log(`  ${n} = ${defs[n].value}`));

// ---------- 4) 值分歧对照 ----------
const norm = s => String(s).replace(/\s+/g, '').replace(/,/g, ', ').toUpperCase();
console.log('\n=== theme-teal vs design-tokens.json 值比对 ===');
let diff = 0;
for (const n of names) {
  const [jp, jv] = jmap[n] || ['未收录', undefined];
  if (jv === undefined) { console.log(`  [JSON未收录] ${n}`); continue; }
  const same = norm(defs[n].value) === norm(jv);
  if (!same) { diff++; console.log(`  [分歧] ${n}\n     teal(L${defs[n].line}): ${defs[n].value}\n     json(${jp}): ${jv}`); }
}
console.log(`两份规格间分歧数: ${diff}（0 = 规格自洽，但不代表与渲染一致）`);
