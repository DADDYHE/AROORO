/* 零外观改变证明：改前/改后各自解析级联，逐条比对最终计算值 */
const fs = require('fs'), path = require('path');
const REAL = '/Users/yy/Documents/trae_projects/zuoyou';

function palette(tealFile, sel /* 'page' | 'dark' */) {
  const t = fs.readFileSync(tealFile, 'utf8');
  const pageBlk = t.slice(t.indexOf('page {'), t.indexOf('/* ===== 暗色模式'));
  const darkBlk = t.slice(t.indexOf('.theme-dark {'), t.indexOf('/* ===== 毛玻璃降级'));
  const g = {};
  const grab = b => { for (const m of b.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g))
    g[m[1]] = m[2].replace(/\/\*[\s\S]*?\*\//g, '').trim(); };
  grab(pageBlk);
  if (sel === 'dark') grab(darkBlk);   // 类选择器恒压过 page
  return g;
}
function locals(wxssFile) {
  const w = fs.readFileSync(wxssFile, 'utf8');
  const blk = w.slice(w.indexOf('.tab-bar {'), w.indexOf('@keyframes tabbar-fade-in'));
  const l = {};
  for (const m of blk.matchAll(/(--tb-[a-z0-9-]+)\s*:\s*([\s\S]*?);/g))
    l[m[1]] = m[2].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim();
  return l;
}
// 抓组件里每条声明实际写的表达式
function decls(wxssFile) {
  const w = fs.readFileSync(wxssFile, 'utf8');
  const pick = (marker, prop) => {
    const i = w.indexOf(marker); if (i < 0) return null;
    const end = w.indexOf('\n}', i);                 // 截到本规则闭合花括号
    const seg = w.slice(i, end < 0 ? i + 1200 : end);
    const m = seg.match(new RegExp('\\n\\s*' + prop + '\\s*:\\s*([^;]+);'));
    return m ? m[1].replace(/\s+/g, ' ').trim() : null;
  };
  return {
    '.splash-overlay background'      : pick('.splash-overlay {', 'background'),
    '.tab-bar background'             : pick('.tab-bar {', 'background'),
    '.tab-bar border-top'             : pick('.tab-bar {', 'border-top'),
    '.active::after background'       : pick('.tab-bar-item.active::after', 'background'),
    '.tab-bar-text color'             : pick('.tab-bar-text {', 'color'),
    '.active .tab-bar-text color'     : pick('.tab-bar-item.active .tab-bar-text', 'color'),
    '.center-button background'       : pick('.center-button {', 'background'),
    '.center-button box-shadow'       : pick('.center-button {', 'box-shadow'),
    '.center-button border'           : pick('.center-button {', 'border'),
    '.center-button::before bg'       : pick('.center-button::before', 'background'),
    '.center-button::after bg'        : pick('.center-button::after', 'background'),
    '.center-button-text color'       : pick('.center-button-text {', 'color'),
    '.center.active box-shadow'       : pick('.tab-bar-item-center.active .center-button', 'box-shadow'),
    '.center-button width'            : pick('.center-button {', 'width'),
    '.center-button margin-top'       : pick('.center-button {', 'margin-top'),
    '.center-button-icon width'       : pick('.center-button-icon {', 'width'),
  };
}
const resolve = (expr, scope) => {
  let v = expr, guard = 0;
  while (/var\(/.test(v) && guard++ < 12)
    v = v.replace(/var\(\s*(--[a-z0-9-]+)\s*(?:,([^()]*))?\)/g,
      (_, n, fb) => scope[n] !== undefined ? scope[n] : (fb !== undefined ? fb.trim() : '<<UNRESOLVED:' + n + '>>'));
  return v.replace(/\s+/g, ' ').trim();
};
const norm = s => String(s).replace(/\s+/g, '').replace(/,/g, ', ').toUpperCase();

for (const mode of ['page', 'dark']) {
  const before = { ...palette(path.join(REAL, 'styles/theme-teal.wxss'), mode),
                   ...locals(path.join(REAL, 'custom-tab-bar/index.wxss')) };
  const after  = { ...palette('/tmp/tbwork/mod/styles/theme-teal.wxss', mode),
                   ...locals('/tmp/tbwork/mod/custom-tab-bar/index.wxss') };
  const dB = decls(path.join(REAL, 'custom-tab-bar/index.wxss'));
  const dA = decls('/tmp/tbwork/mod/custom-tab-bar/index.wxss');

  console.log(`\n===== 级联模式: ${mode === 'page' ? '亮色 page{}（线上唯一可达）' : '.theme-dark（当前未挂载·潜在）'} =====`);
  let bad = 0, chg = [];
  for (const k of Object.keys(dB)) {
    const rb = resolve(dB[k], before), ra = resolve(dA[k], after);
    const ok = norm(rb) === norm(ra);
    if (!ok) { bad++; chg.push([k, rb, ra]); }
    if (/UNRESOLVED/.test(ra)) { bad++; console.log(`  !! 未解析 ${k}: ${ra}`); }
  }
  console.log(`  比对 ${Object.keys(dB).length} 条声明 → 差异 ${chg.length} 条`);
  chg.forEach(([k, b, a]) => console.log(`  [变化] ${k}\n     改前: ${b}\n     改后: ${a}`));
  if (!bad) console.log('  ✅ 全部一致，零外观改变成立');
}
