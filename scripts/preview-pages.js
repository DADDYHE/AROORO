#!/usr/bin/env node
/* preview-pages.js — 逐页自动化预览：reLaunch 遍历全部页面并截图
   依赖：miniprogram-automator（NODE_PATH 指向其安装目录）
   用法: NODE_PATH=/path/to/node_modules node scripts/preview-pages.js */
const automator = require('miniprogram-automator');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PREVIEW_PORT || 9420;
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '.preview-shots');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

// 全部页面（绝对路径，/ 开头）；前 8 为主包
const PAGES = [
  // ---- 主包 ----
  'pages/home/index',
  'pages/splash/index',
  'pages/service/index',
  'pages/quick-register/index',
  'pages/profile/index',
  'pages/group-detail/index',          // ⭐升级页
  'pages/boarding/index',
  'pages/discover/index',
  // ---- booking ----
  'subpackages/booking/pet-select',
  'subpackages/booking/confirm',
  'subpackages/booking/host-detail',
  'subpackages/booking/invitation-fill/index',
  // ---- pet ----
  'subpackages/pet/create-step1',
  'subpackages/pet/list',
  'subpackages/pet/detail',
  'subpackages/pet/update-profile',
  // ---- profile ----
  'subpackages/profile/login/index',
  'subpackages/profile/edit/index',
  'subpackages/profile/about/about',
  'subpackages/profile/privacy/privacy',
  'subpackages/profile/agreement/agreement',
  'subpackages/profile/notification/list',
  'subpackages/profile/notification/detail',
  'subpackages/profile/referral/index',
  'subpackages/profile/order-stats/index',
  'subpackages/profile/mall-order-detail/index', // ⭐升级页
  'subpackages/profile/order-detail/index',      // ⭐升级页
  // ---- activity ----
  'subpackages/activity/list',
  'subpackages/activity/detail',
  'subpackages/activity/register',   // ⭐升级页
  'subpackages/activity/friend',
  'subpackages/activity/my-registered',
  'subpackages/activity/map-view',
  'subpackages/activity/payment',
  // ---- mall ----
  'subpackages/mall/product-list',
  'subpackages/mall/product-detail',
  'subpackages/mall/order-confirm',
  'subpackages/mall/cart',
  // ---- feeding ----
  'subpackages/feeding/service-detail',
  'subpackages/feeding/confirm-service',
  'subpackages/feeding/order-status',
  // ---- other ----
  'subpackages/other/favorites/index',
  'subpackages/other/album/index',
  'subpackages/other/video-list/index',
  'subpackages/other/address/index',
  // ---- coupon ----
  'subpackages/coupon/my-coupons',
  'subpackages/coupon/claim-center',
  // ---- partner ----
  'subpackages/partner/home/index',
  'subpackages/partner/activity-list/index',
  'subpackages/partner/activity-create/index',
  'subpackages/partner/activity-detail/index',
  'subpackages/partner/hosting-profile/index',
  'subpackages/partner/hosting-profile-edit/index',
  'subpackages/partner/feeding/index',
  'subpackages/partner/income/index',
  'subpackages/partner/service-income/index',
  'subpackages/partner/application/index',
  'subpackages/partner/referral/index',
  'subpackages/partner/withdrawal/index',
  'subpackages/partner/i18n-override/index',
  'subpackages/partner/invitation-create/index',
  'subpackages/partner/invitation-list/index',
  // ---- search ----
  'subpackages/search/index',
];

function dumpErr(e) {
  try {
    if (typeof e === 'object') {
      const o = {};
      for (const k of Object.getOwnPropertyNames(e)) o[k] = e[k];
      return JSON.stringify(o);
    }
    return String(e);
  } catch (_) { return String(e); }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const safe = (s) => s.replace(/[^\w]/g, '_');

// 单页调试：ONE_PAGE=路径 时只跑该页并打印详细错误 + 页面 console
const ONLY = process.env.ONE_PAGE;

function bucket(p) {
  if (p.includes('partner')) return 'partner';
  if (p.includes('/profile/')) return 'profile';
  if (p.includes('/activity/')) return 'activity';
  if (p.includes('/booking/')) return 'booking';
  if (p.includes('/mall/')) return 'mall';
  if (p.includes('/feeding/')) return 'feeding';
  if (p.includes('/pet/')) return 'pet';
  if (p.includes('/other/')) return 'other';
  if (p.startsWith('pages/')) return 'main';
  return 'misc';
}

async function renderPage(mini, p, idx) {
  const r = { p, ok: false, screenshot: null, error: null, pagePath: null };
  try {
    await mini.reLaunch({ url: '/' + p });
    await sleep(1100);
    const page = await mini.currentPage();
    r.pagePath = page ? page.path : null;
    const file = path.join(OUT, `${String(idx).padStart(2, '0')}_${bucket(p)}_${safe(p.split('/').pop())}.png`);
    await page.screenshot({ path: file });
    r.screenshot = file;
    r.ok = true;
  } catch (e) {
    r.error = dumpErr(e);
  }
  return r;
}

async function main() {
  const mini = await automator.connect({ wsEndpoint: `ws://localhost:${PORT}` });
  console.log('[connect] ok');
  // 页面 console 捕获（辅助定位 JS 异常）
  if (typeof mini.on === 'function') {
    mini.on('console', (msg) => console.log('[console]', dumpErr(msg)));
  }
  // 捕获页面未捕获异常的真实对象（automator 默认混淆为 [object Object]）
  if (typeof mini.hook === 'function') {
    mini.hook('onThrow', (err) => { console.log('[THROW]', dumpErr(err && err.stack ? err : { message: String(err), stack: err && err.stack })); });
  }
  const pages = ONLY ? [ONLY] : PAGES;
  console.log('[pages]', pages.length, ONLY ? '(single: ' + ONLY + ')' : '(all 63)');
  const report = [];
  for (let i = 0; i < pages.length; i++) {
    const r = await renderPage(mini, pages[i], i + 1);
    report.push(r);
    console.log(`[${r.ok ? 'OK ' : 'ERR'}] ${r.p}${r.error ? ' :: ' + r.error : ''}${r.screenshot ? ' :: ' + r.screenshot : ''}`);
  }
  fs.writeFileSync(path.join(OUT, '_report.json'), JSON.stringify(report, null, 2));
  console.log(`\n[done] success=${report.filter(x => x.ok).length}/${report.length}`);
  console.log('\n升级页逐一确认:');
  ['pages/group-detail/index', 'subpackages/profile/mall-order-detail/index',
   'subpackages/profile/order-detail/index', 'subpackages/activity/register']
    .forEach(p => { const r = report.find(x => x.p === p); console.log(`  ${p} → ${r.ok ? 'OK  ' + r.screenshot : 'ERR ' + r.error}`); });
  try { /* 保持会话不断，便于复查截图 */ } catch (e) {}
}
main().catch(e => { console.error('[fatal]', e.message); process.exit(1); });