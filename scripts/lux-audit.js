#!/usr/bin/env node
/* ================================================================
   lux-audit.js · A+B 版式覆盖审计（2026-09-09 全站升级方案）
   ------------------------------------------------------------
   1. 逐页判定 B 板落地：transparent navbar + hero（lux-hero / 页面私有
      hero 类 / 画廊 hero）→ 未落地页输出 WARN 清单
   2. 逐页扫浅底行线违规：页面 wxss 用 var(--hairline)（8% 墨，
      印在奶油纸上 ≈1.07:1 等于没画）→ 输出 PAPER-LINE 违规清单
   3. 特例页白名单（splash/home/map-view/search/i18n-override/login）
   用法：node scripts/lux-audit.js [--strict]
     默认观测模式 exit 0；--strict 时存在未落地页或行线违规则 exit 1。
   ================================================================ */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'))

// 特例页白名单：① 无 B 板语义页（splash/home/map-view/search/i18n-override/login）
// ② A-票据页：订单/商城订单详情，方案规定走纯 A「纸上卷宗」版式（不加深绿 hero）
const EXEMPT = new Set([
  'pages/splash/index',
  'pages/home/index',
  'subpackages/activity/map-view',
  'subpackages/search/index',
  'subpackages/partner/i18n-override/index',
  'subpackages/profile/login/index',
  'subpackages/profile/order-detail/index',
  'subpackages/profile/mall-order-detail/index',
])

const pages = [
  ...app.pages,
  ...(app.subPackages || app.subpackages || []).flatMap(s =>
    s.pages.map(p => s.root.replace(/\/$/, '') + '/' + p)
  ),
]

const read = p => {
  try { return fs.readFileSync(path.join(ROOT, p), 'utf8') } catch { return '' }
}

const noB = []
const badLine = []
const badHero = []

// 深绿 hero 指纹（B 板真身，防「transparent navbar + 纸面标题」漏网——
// pet/detail、feeding/service-detail 曾因此假通过）：
//   wxml: lux-hero（含 --compact）/ ds-hero（DOSSIER）/ scrim 画廊（B2，
//         hero-top-scrim 全站语法 + gallery-top-scrim 画廊页前缀变体）
//   wxss: 页级深绿底覆盖 --lux-green-grad
const HERO_RX = /class="lux-hero|class="ds-hero|(hero|gallery)-top-scrim|hero-cover|--lux-green-grad/

for (const page of pages) {
  if (EXEMPT.has(page)) continue
  const wxml = read(page + '.wxml')
  const wxss = read(page + '.wxss')
  const both = wxml + wxss

  // B 板判定：transparent navbar = B 板指纹；且必须命中深绿 hero 指纹之一
  const navOK = /<zy-navbar[^>]*transparent/.test(wxml)
  if (!navOK) {
    noB.push(page)
  } else if (!HERO_RX.test(both)) {
    badHero.push(page)
  }

  // 浅底行线违规：页面 wxss 出现 var(--hairline)（8% 墨）或
  // var(--lux-hairline)（6% 墨，更隐形）。先剥离 /* */ 注释，
  // 否则铁律注释里的字样会造成永久误报。
  const wxssCode = wxss.replace(/\/\*[\s\S]*?\*\//g, '')
  if (/var\(--(lux-)?hairline\)/.test(wxssCode)) badLine.push(page)
}

console.log(`[lux-audit] 页面总数 ${pages.length}（特例豁免 ${EXEMPT.size}）`)

if (noB.length) {
  console.log(`\n[WARN] B 板未落地 ${noB.length} 页：`)
  noB.forEach(p => console.log('  -', p))
} else {
  console.log('[lux-audit] B 板覆盖：全部豁免外页面已落地 ✅')
}

if (badHero.length) {
  console.log(`\n[HERO-CHECK] transparent navbar 但无深绿 hero 指纹 ${badHero.length} 页（疑似纸面标题，cream 导航图标不可见）：`)
  badHero.forEach(p => console.log('  -', p))
} else {
  console.log('[lux-audit] hero 校验：transparent 页全部命中深绿 hero 指纹 ✅')
}

if (badLine.length) {
  console.log(`\n[PAPER-LINE] 浅底行线用 var(--hairline)/var(--lux-hairline) ${badLine.length} 页（应改 rgba(26,26,23,0.14)）：`)
  badLine.forEach(p => console.log('  -', p))
} else {
  console.log('[lux-audit] 浅底行线：0 处违规 ✅')
}

const strict = process.argv.includes('--strict')
if (strict && (noB.length || badLine.length || badHero.length)) {
  console.log('\n[lux-audit] --strict：存在未完成项 → FAIL')
  process.exit(1)
}
console.log('\n[lux-audit] PASS（观测模式）')
