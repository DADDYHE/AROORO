// ===================== AROORO mantas 后台中转（service worker） =====================
// content script 直接调 chrome.tabs / chrome.scripting / 跨域 fetch 在部分环境不稳定：
//   - chrome.tabs 为 undefined → 抓取失败
//   - content script 直连跨域 fetch（带自定义头）→ 触发 CORS 预检被网关挡 → Failed to fetch
// 改由 background 中转：background 始终拥有完整 chrome.* 权限与 host_permissions，最稳。
// 抓取/图片转换/导入逻辑与 popup.js、mantas-inject.js 同源（自包含，不能引用本文件其它作用域）。
const GATEWAY = 'https://cloudbase-d7getcjqy33b13475.api.tcloudbasegateway.com/v1/functions/adminService'
const API_KEY = 'Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6IjlkMWRjMzFlLWI0ZDAtNDQ4Yi1hNzZmLWIwY2M2M2Q4MTQ5OCJ9.eyJhdWQiOiJjbG91ZGJhc2UtZDdnZXRjanF5MzNiMTM0NzUiLCJleHAiOjI1MzQwMjMwMDc5OSwiaWF0IjoxNzgwOTk5MDMzLCJhdF9oYXNoIjoiU2hmSEowbS1SeDY3SEVKQmtZNzg4dyIsInByb2plY3RfaWQiOiJjbG91ZGJhc2UtZDdnZXRjanF5MzNiMTM0NzUiLCJtZXRhIjp7InBsYXRmb3JtIjoiQXBpS2V5In0sImFkbWluaXN0cmF0b3JfaWQiOiIyMDU1NTcxNDE5MDY3MTA1MjgyIiwidXNlcl90eXBlIjoiIiwiY2xpZW50X3R5cGUiOiJjbGllbnRfc2VydmVyIiwiaXNfc3lzdGVtX2FkbWluIjp0cnVlfQ.EcVybfuRUbA19CjPTzx8XLavv-SxDWRfZE5_ZDFnCwIpVk74JEtnYk2Vp4J3hoLZ3G_cCJAWrcRzqs_lrd4boDjDnHstgw59wMnCbjO162K76I9JsL0pQUiiRcFUNo09Nt2vR_tCP4Z64bX4blxPjlFufSweAp0YVBjPl9n-PivoSzLqeDuYSD7OfcPHQCv68XXguhW3hlz9wjdImaB9oaAotv51S4RjF9qbZa1LrvMT1qsDFyse7m-6rn1j5RxL10UOe9aGL_5Vu4de-5Kuz7vr4syLUZjYqv9rSMqDFfhCb4ZRY__M7OdODJ8d8jfupSAIO0pJ6bBI_LJmL-dgGQ'

// ⚠️ CloudBase 网关对带 Origin 头的跨域请求一律 403（空 body）。
// Chrome 扩展 background/popup 的 fetch 会自动带 Origin: chrome-extension://<id>，
// 用 declarativeNetRequest 移除网关请求的 Origin 头（扩展官方支持的请求头修改能力）。
// 关键：必须用 initiatorDomains 限定只作用于【扩展自身】请求，否则会连带移除 web-admin
// 等网页预检 OPTIONS 的 Origin → 网关不返回 Access-Control-Allow-Origin → 网页 CORS 预检失败。
if (chrome.declarativeNetRequest && chrome.declarativeNetRequest.updateDynamicRules) {
  chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [1],
    addRules: [{
      id: 1,
      priority: 1,
      action: { type: 'modifyHeaders', requestHeaders: [{ header: 'origin', operation: 'remove' }] },
      condition: { urlFilter: 'api.tcloudbasegateway.com', resourceTypes: ['xmlhttprequest'], initiatorDomains: [chrome.runtime.id] },
    }],
  })
}

async function scrapeMantasProduct() {
  const result = { mantasSkuId: '', title: '', price: null, skus: [], images: [], specGroups: [], categoryPath: '', sourceUrl: location.href, detailImages: [] }
  const mm = location.pathname.match(/sku-detail\/(\d+)/)
  if (mm) result.mantasSkuId = mm[1]
  // 标题提取：mantas 商品页 h1 / document.title 都是站点名「订货商城」，需多源兜底取真实商品名
  const pickTitle = () => {
    const NOISE_T = /订货商城|请先登录|获取报价|原价|建议零售价|供应商|起订量|限购数量|选择规格|请选择|库存|首页|全部分类|分类/
    const add = (t) => { t = (t || '').replace(/\s+/g, ' ').trim(); return (t && t.length >= 3 && t.length <= 80 && !NOISE_T.test(t)) ? t : null }
    const cands = []
    const crumb = document.querySelector('[class*="breadcrumb" i],[class*="crumb" i]')
    if (crumb) { const links = crumb.querySelectorAll('a,span'); if (links.length) { const last = add(links[links.length - 1].textContent); if (last) cands.push({ t: last, w: 5 }) } }
    const og = document.querySelector('meta[property="og:title"], meta[name="twitter:title"]'); if (og) { const t = add(og.getAttribute('content')); if (t) cands.push({ t, w: 4 }) }
    document.querySelectorAll('[class*="productName" i],[class*="goodsName" i],[class*="productTitle" i],[class*="goodsTitle" i],[class*="skuName" i],[class*="name" i]').forEach((el) => {
      const cls = el.className || ''
      if (/specName|normalInfoTitle|propertiesRowTitle|firstName|lastName|username|nickname|breadcrumb/i.test(cls)) return
      if (el.querySelector('*') && !/name/i.test(cls)) return // name 类容器允许取整段（mantas 真标题 class=name___xxx）
      const t = add(el.textContent); if (t) cands.push({ t, w: 6 })
    })
    document.querySelectorAll('h1,h2,h3').forEach((el) => { const t = add(el.textContent); if (t) cands.push({ t, w: 2 }) })
    document.querySelectorAll('[class*="title" i],[class*="name" i],[class*="product" i],[class*="goods" i],[class*="subject" i]').forEach((el) => {
      if (el.querySelector('*')) return
      const cls = el.className || ''
      if (/specName|normalInfoTitle|propertiesRowTitle|breadcrumb/i.test(cls)) return
      const r = el.getBoundingClientRect(); if (r.top > 600) return
      const t = add(el.textContent); if (t) cands.push({ t, w: 3 })
    })
    const dt = add(document.title.replace(/[|_\-].*$/, '').trim()); if (dt) cands.push({ t: dt, w: 1 })
    if (!cands.length) return ''
    cands.sort((a, b) => b.w - a.w || b.t.length - a.t.length)
    return cands[0].t
  }
  result.title = pickTitle() || document.title.replace(/[|_\\-].*$/, '').trim()
  const seen = new Set()
  const norm = (u) => { try { return new URL(u, location.href).href } catch (e) { return '' } }
  // 噪声黑名单：7moor/qimo 客服挂件、logo、版权、二维码、icon、占位、svg、base64、导航页脚等
  const NOISE = /7moor|qimo|kefu|webchat|customer|invite|agentLogo|copyright|police|chatBtn|icon-home|mini-app|qrCode|table-header|screenmin|dragbar|headerimg|svg\+xml|;base64|base64|logo|icon|avatar|btn|spacer|banner|footer|header|nav|crumb|breadcrumb|ad(?![a-f0-9])|advert|ads/i
  const isNoise = (abs, img) => {
    if (!abs) return true
    if (abs.indexOf('data:') === 0) return true
    if (/\.svg(\?|$)/i.test(abs.split('?')[0])) return true
    const cls = String(img.className || '')
    const pcls = String((img.parentElement && img.parentElement.className) || '')
    return NOISE.test(abs) || NOISE.test(cls) || NOISE.test(pcls)
  }
  const push = (u, img) => {
    if (!u) return null
    const abs = norm(u)
    if (!abs || seen.has(abs) || isNoise(abs, img)) return null
    seen.add(abs); return abs
  }
  const collect = (sel) => {
    const out = []
    document.querySelectorAll(sel).forEach((z) => z.querySelectorAll('img').forEach((img) => {
      const raw = img.currentSrc || img.src || img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-original') || img.getAttribute('data-lazy-src') || ''
      const a = push(raw, img)
      if (a) out.push(a)
    }))
    return out
  }
  // 主图：主图轮播/缩略图组/大图区（真实 class：imgContainer / group / demo）
  let main = collect('[class*="imgContainer" i], [class*="group" i] [class*="imgContainer" i], [class*="demo" i], [class*="preview" i], [class*="zoom" i]')
  if (!main.length) {
    // 回退：mantas 商品主图 CDN 带 interlace 参数
    document.querySelectorAll('img').forEach((img) => {
      const u = img.currentSrc || img.src || ''
      if (/interlace/i.test(u)) { const a = push(u, img); if (a) main.push(a) }
    })
  }
  const og = document.querySelector('meta[property="og:image"]')
  if (og) { const a = push(og.getAttribute('content'), { className: '', parentElement: null }); if (a && main.indexOf(a) === -1) main.unshift(a) }
  // 详情长图：商品描述区（body / detail / description）
  const detail = collect('[class*="body" i], [class*="detail" i], [class*="description" i]')
  result.images = main
  result.detailImages = detail
  const prices = []
  document.querySelectorAll('*').forEach((el) => {
    if (el.children.length === 0) {
      const t = (el.textContent || '').trim()
      const pm = t.match(/[¥￥]\s*([\d,]+(?:\.\d+)?)/)
      if (pm) { const n = parseFloat(pm[1].replace(/,/g, '')); if (Number.isFinite(n) && n > 0) prices.push(n) }
    }
  })
  if (prices.length) result.price = Math.min.apply(null, prices)
  // 收集真规格选项（specName 叶子）；norm/attr/select 是参数块/属性/Tab，会误抓标题栏文字
  const specEls = []
  const SPEC_BAD = /(原价|建议零售价|供应商|起订量|限购|选择规格|请选择|￥|¥|：|:|包邮|运费|发货|库存|销量|保质期|品牌|产地|规格参数|参数|详情|图片|宠物)/
  const pushSpec = (t, el) => {
    t = (t || '').trim()
    if (!t || t.length < 2 || t.length > 30) return
    if (SPEC_BAD.test(t)) return
    if (/^[\d.,%]+$/.test(t)) return
    // 找外层 <a> 取 href / skuId（规格选项是链接，href 含 sku-detail/{id}，用于多页编排跳转）
    let a = el
    while (a && a.tagName !== 'A' && a !== document.body) a = a.parentElement
    const href = a && a.tagName === 'A' ? a.getAttribute('href') : null
    const skuId = href ? (href.match(/sku-detail\/(\d+)/) || [])[1] : null
    if (specEls.findIndex((x) => x.txt === t) === -1) specEls.push({ txt: t, el, href, skuId })
  }
  document.querySelectorAll('[class*="sku" i], [class*="spec" i]').forEach((box) => {
    const leaves = box.querySelectorAll('button,li,a,span,div,[role="button"]')
    const targets = leaves.length ? leaves : [box]
    targets.forEach((el) => {
      if (el !== box && el.querySelector('*')) return // 只要叶子选项，跳过带子节点的容器
      const t = (el.textContent || '').trim()
      const m = t.match(/(?:选择规格|请选择|规格)[:：]?(.{1,30})/)
      if (m && m[1]) pushSpec(m[1], el)
      else pushSpec(t, el)
    })
  })
  // 价格：当前页只渲染当前 SKU 的价（价格随子页而来，非 in-place 联动）；单页先填当前页 DOM 价，多页编排时按各子页真实价覆盖 collected[skuId]。
  const readPriceNow = () => {
    const zones = document.querySelectorAll('[class*="price" i],[class*="cur" i],[class*="sale" i],[class*="amount" i]')
    const cands = []
    zones.forEach((z) => {
      const t = (z.textContent || '').replace(/\s+/g, '')
      const pm = t.match(/[¥￥]\s*([\d,]+(?:\.\d+)?)/)
      if (pm) { const n = parseFloat(pm[1].replace(/,/g, '')); if (Number.isFinite(n) && n > 0 && n < 1e7) cands.push(n) }
    })
    if (cands.length) return Math.min.apply(null, cands)
    const ps = []
    document.querySelectorAll('*').forEach((el) => {
      if (el.children.length === 0) {
        const t = (el.textContent || '').trim()
        const pm = t.match(/[¥￥]\s*([\d,]+(?:\.\d+)?)/)
        if (pm) { const n = parseFloat(pm[1].replace(/,/g, '')); if (Number.isFinite(n) && n > 0 && n < 1e7) ps.push(n) }
      }
    })
    return ps.length ? Math.min.apply(null, ps) : null
  }
  const pageSku = (location.pathname.match(/sku-detail\/(\d+)/) || [])[1]
  // 规格选项缩略图：选项常自带 <img>（缩略图）表示自身图；取不到则回退主图第一张
  const specImgOf = (el) => {
    if (!el) return ''
    const img = el.querySelector('img')
    if (img) {
      const u = img.currentSrc || img.src || img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-original') || ''
      const a = push(u, img)
      if (a) return a
    }
    return ''
  }
  const skuSpecs = specEls.map((s) => ({
    specText: s.txt,
    skuId: s.skuId || pageSku || null,
    href: s.href || null,
    price: readPriceNow(),
    stock: 0,
    image: specImgOf(s.el) || (result.images[0] || ''),
  }))
  result.skus = skuSpecs
  const crumb = []
  document.querySelectorAll('.breadcrumb a, [class*="breadcrumb" i] a, .crumbs a, .nav-crumbs a').forEach((a) => { const t = (a.textContent || '').trim(); if (t) crumb.push(t) })
  if (crumb.length) result.categoryPath = crumb.join(' / ')
  return result
}

async function fetchImagesAsData(urls) {
  const out = []
  for (const u of urls.slice(0, 12)) {
    try {
      const r = await fetch(u, { credentials: 'include', mode: 'cors' })
      if (!r.ok) { out.push(u); continue }
      const blob = await r.blob()
      if (blob.size < 200) { out.push(u); continue }
      const dataUrl = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res(u); fr.readAsDataURL(blob) })
      out.push(dataUrl || u)
    } catch (e) { out.push(u) }
  }
  return out
}

// 单张转存：调网关 uploadMantasImage action，返回 CloudBase 存储 fileId（请求体单张，绕开网关 ~6MB payload 上限）
async function uploadOneImage(token, image) {
  const resp = await fetch(GATEWAY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: API_KEY, 'X-User-Token': token },
    body: JSON.stringify({ action: 'uploadMantasImage', data: { image }, accessToken: token }),
  })
  const txt = await resp.text()
  try { return JSON.parse(txt) } catch (e) { return { code: -1, status: resp.status, message: '网关 HTTP ' + resp.status + '（响应非 JSON）', raw: txt.slice(0, 200) } }
}

async function importMantasProduct(token, data) {
  const resp = await fetch(GATEWAY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: API_KEY, 'X-User-Token': token },
    body: JSON.stringify({ action: 'importMantasProduct', data, accessToken: token }),
  })
  const txt = await resp.text()
  try { return JSON.parse(txt) } catch (e) { return { code: -1, status: resp.status, message: '网关 HTTP ' + resp.status + '（响应非 JSON）', raw: txt.slice(0, 200) } }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'mantas_scrape' || msg.type === 'mantas_convert') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0]
      if (!tab) { sendResponse({ error: 'no active tab' }); return }
      const opts = msg.type === 'mantas_scrape'
        ? { target: { tabId: tab.id }, world: 'MAIN', func: scrapeMantasProduct }
        : { target: { tabId: tab.id }, world: 'MAIN', func: fetchImagesAsData, args: [msg.urls || []] }
      chrome.scripting.executeScript(opts, (res) => {
        if (chrome.runtime.lastError) { sendResponse({ error: chrome.runtime.lastError.message }); return }
        sendResponse({ result: res && res[0] && res[0].result })
      })
    })
    return true
  }
  if (msg.type === 'mantas_import') {
    importMantasProduct(msg.token, msg.data)
      .then((json) => sendResponse({ result: json }))
      .catch((e) => sendResponse({ error: e && e.message ? e.message : String(e) }))
    return true
  }
  if (msg.type === 'mantas_upload') {
    uploadOneImage(msg.token, msg.image)
      .then((json) => sendResponse({ result: json }))
      .catch((e) => sendResponse({ error: e && e.message ? e.message : String(e) }))
    return true
  }
  return false
})
