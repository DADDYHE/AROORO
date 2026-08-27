// ===================== AROORO mantas 导入插件（popup 逻辑） =====================
// 网关（与 web-admin 一致）：函数读取 body.accessToken 作为用户身份；
// Authorization 携带 CloudBase API Key 用于通过网关鉴权层。
const GATEWAY = 'https://cloudbase-d7getcjqy33b13475.api.tcloudbasegateway.com/v1/functions/adminService'
const API_KEY = 'Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6IjlkMWRjMzFlLWI0ZDAtNDQ4Yi1hNzZmLWIwY2M2M2Q4MTQ5OCJ9.eyJhdWQiOiJjbG91ZGJhc2UtZDdnZXRjanF5MzNiMTM0NzUiLCJleHAiOjI1MzQwMjMwMDc5OSwiaWF0IjoxNzgwOTk5MDMzLCJhdF9oYXNoIjoiU2hmSEowbS1SeDY3SEVKQmtZNzg4dyIsInByb2plY3RfaWQiOiJjbG91ZGJhc2UtZDdnZXRjanF5MzNiMTM0NzUiLCJtZXRhIjp7InBsYXRmb3JtIjoiQXBpS2V5In0sImFkbWluaXN0cmF0b3JfaWQiOiIyMDU1NTcxNDE5MDY3MTA1MjgyIiwidXNlcl90eXBlIjoiIiwiY2xpZW50X3R5cGUiOiJjbGllbnRfc2VydmVyIiwiaXNfc3lzdGVtX2FkbWluIjp0cnVlfQ.EcVybfuRUbA19CjPTzx8XLavv-SxDWRfZE5_ZDFnCwIpVk74JEtnYk2Vp4J3hoLZ3G_cCJAWrcRzqs_lrd4boDjDnHstgw59wMnCbjO162K76I9JsL0pQUiiRcFUNo09Nt2vR_tCP4Z64bX4blxPjlFufSweAp0YVBjPl9n-PivoSzLqeDuYSD7OfcPHQCv68XXguhW3hlz9wjdImaB9oaAotv51S4RjF9qbZa1LrvMT1qsDFyse7m-6rn1j5RxL10UOe9aGL_5Vu4de-5Kuz7vr4syLUZjYqv9rSMqDFfhCb4ZRY__M7OdODJ8d8jfupSAIO0pJ6bBI_LJmL-dgGQ'

// ---- 以下两个函数会被 chrome.scripting.executeScript 注入到 mantas 页面（MAIN world）执行 ----
// 注意：它们不能引用本文件其它作用域变量，必须自包含。

// 抓取商品页（在已登录页面内运行，可读 DOM / 全局变量，带登录态）
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

  // 价格：收集叶子节点里的 ¥数字，取最小作为起价（近似）
  const prices = []
  document.querySelectorAll('*').forEach((el) => {
    if (el.children.length === 0) {
      const t = (el.textContent || '').trim()
      const pm = t.match(/[¥￥]\s*([\d,]+(?:\.\d+)?)/)
      if (pm) { const n = parseFloat(pm[1].replace(/,/g, '')); if (Number.isFinite(n) && n > 0) prices.push(n) }
    }
  })
  if (prices.length) result.price = Math.min.apply(null, prices)

  // 规格 / SKU 候选（类名含 sku/spec/norm/attr/select 的元素文本，过滤参数描述/价格/提示语）
  // 收集真规格选项（specName 叶子）；norm/attr/select 是参数块/属性/Tab，会误抓标题栏文字
  const specEls = []
  const SPEC_BAD = /(原价|建议零售价|供应商|起订量|限购|选择规格|请选择|￥|¥|：|:|包邮|运费|发货|库存|销量|保质期|品牌|产地|规格参数|参数|详情|图片|宠物)/
  const pushSpec = (t, el) => {
    t = (t || '').trim()
    if (!t || t.length < 2 || t.length > 30) return
    if (SPEC_BAD.test(t)) return
    if (/^[\d.,%]+$/.test(t)) return
    if (specEls.findIndex((x) => x.txt === t) === -1) specEls.push({ txt: t, el })
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
  // 逐个点选规格读真实价（选项无 data-price、无内联 JSON，价格随选中态联动，只能点选后读价格区）
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
  // 安全点击：派发冒泡 click 触发 React 合成事件更新选中态/价格；捕获阶段 preventDefault 阻止 <a href> 原生跳转
  // （规格选项是链接，原生 .click() 会整页跳转 → content script 销毁 → 浮层关闭，必须阻止默认导航）
  const safeClick = (el) => {
    const stop = (e) => { e.preventDefault() }
    el.addEventListener('click', stop, true)
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    el.removeEventListener('click', stop, true)
  }
  const skuSpecs = []
  if (specEls.length) {
    const first = specEls[0].el
    for (const s of specEls) {
      if (s.el !== first) {
        try { safeClick(s.el) } catch (e) {}
        await new Promise((r) => setTimeout(r, 300)) // 等价格区联动更新
      }
      skuSpecs.push({ specText: s.txt, price: readPriceNow(), stock: 0, image: '' })
    }
    try { safeClick(first) } catch (e) {} // 恢复初始选中态
  }
  result.skus = skuSpecs

  // 面包屑 → 分类路径
  const crumb = []
  document.querySelectorAll('.breadcrumb a, [class*="breadcrumb" i] a, .crumbs a, .nav-crumbs a').forEach((a) => { const t = (a.textContent || '').trim(); if (t) crumb.push(t) })
  if (crumb.length) result.categoryPath = crumb.join(' / ')

  return result
}

// 把图片 URL 转为 data URL（在已登录页面内 fetch，带 cookie，最可靠）
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

// ===================== popup 侧逻辑 =====================
let currentTabId = null
let currentUrl = ''
let scrapedImages = []
let scrapedDetailImages = []

const $ = (id) => document.getElementById(id)
function showStatus(msg, cls) {
  const s = $('status'); s.textContent = msg; s.className = cls || ''; s.style.display = 'block'
}

function addSkuRow(specText, price, stock, image) {
  const wrap = document.createElement('div')
  wrap.className = 'sku'
  wrap.innerHTML = `
    <div class="top"><span class="muted">规格</span><button type="button" class="del">删除</button></div>
    <input type="text" class="specText" placeholder="规格名，如 0.25ml/15mg" value="${escapeAttr(specText || '')}" />
    <div class="g2">
      <input type="number" class="price" step="0.01" min="0" placeholder="订货价" value="${price != null ? price : ''}" />
      <input type="number" class="stock" step="1" min="0" placeholder="库存" value="${stock || 0}" />
      <input type="text" class="image" placeholder="图片URL" value="${escapeAttr(image || '')}" />
    </div>`
  wrap.querySelector('.del').addEventListener('click', () => wrap.remove())
  $('skus').appendChild(wrap)
}
function escapeAttr(s) { return String(s || '').replace(/"/g, '&quot;') }

function fillForm(r) {
  if (!r) return
  if (r.mantasSkuId) $('mantasSkuId').value = r.mantasSkuId
  if (r.title) $('title').value = r.title
  if (r.categoryPath) $('categoryPath').value = r.categoryPath
  scrapedImages = Array.isArray(r.images) ? r.images : []
  scrapedDetailImages = Array.isArray(r.detailImages) ? r.detailImages : []
  $('imgCount').textContent = scrapedImages.length
  if ($('detailCount')) $('detailCount').textContent = scrapedDetailImages.length
  $('skus').innerHTML = ''
  if (Array.isArray(r.skus) && r.skus.length) {
    r.skus.forEach((s) => addSkuRow(s.specText, s.price, s.stock, s.image))
  } else {
    addSkuRow('', r.price != null ? r.price : '', 0, '')
  }
}

async function rescrape() {
  if (!currentTabId) return showStatus('当前不是 mantas 商品页，无法抓取。', 'err')
  try {
    const r = await chrome.scripting.executeScript({ target: { tabId: currentTabId }, world: 'MAIN', func: scrapeMantasProduct })
    fillForm(r && r[0] && r[0].result)
    showStatus('已重新抓取当前页面。', 'ok')
  } catch (e) {
    showStatus('抓取失败：' + (e && e.message ? e.message : e), 'err')
  }
}

async function doImport() {
  const btn = $('import'); btn.disabled = true
  try {
    const token = (await chrome.storage.local.get('arooroToken')).arooroToken || $('manualToken').value.trim()
    if (!token) return showStatus('请先打开并登录 AROORO 后台（另一标签页），或在下方粘贴 token。', 'err')

    const shipping = parseFloat($('shipping').value)
    if (!(shipping >= 0)) return showStatus('请填写运费（必填，非负数字）。', 'err')
    const markup = parseFloat($('markup').value) || 1.5
    const title = $('title').value.trim()
    const mantasSkuId = $('mantasSkuId').value.trim()
    if (!title) return showStatus('请填写商品标题。', 'err')
    if (!mantasSkuId) return showStatus('请填写商品ID（mantasSkuId）。', 'err')

    const rows = Array.from(document.querySelectorAll('#skus .sku'))
    if (!rows.length) return showStatus('请至少添加一个规格。', 'err')
    const skus = rows.map((r, i) => ({
      skuId: 'm_' + mantasSkuId + '_' + (i + 1),
      specText: r.querySelector('.specText').value.trim(),
      price: parseFloat(r.querySelector('.price').value) || 0,
      stock: parseInt(r.querySelector('.stock').value) || 0,
      image: r.querySelector('.image').value.trim(),
    })).filter((s) => s.price > 0 || s.specText)
    if (!skus.length) return showStatus('请填写至少一个规格的订货价。', 'err')

    let images = []
    let detailImages = []
    if ($('useImages').checked && scrapedImages.length && currentTabId) {
      try {
        const conv = await chrome.scripting.executeScript({ target: { tabId: currentTabId }, world: 'MAIN', func: fetchImagesAsData, args: [scrapedImages] })
        images = (conv && conv[0] && conv[0].result) || scrapedImages
      } catch (e) { images = scrapedImages }
      try {
        const conv2 = await chrome.scripting.executeScript({ target: { tabId: currentTabId }, world: 'MAIN', func: fetchImagesAsData, args: [scrapedDetailImages] })
        detailImages = (conv2 && conv2[0] && conv2[0].result) || scrapedDetailImages
      } catch (e) { detailImages = scrapedDetailImages }
    }

    const data = {
      mantasSkuId,
      title,
      sourceUrl: currentUrl,
      categoryPath: $('categoryPath').value.trim(),
      specGroups: [],
      skus,
      images,
      detailImages,
      basePrice: skus[0] ? skus[0].price : 0,
      shippingFee: shipping,
      markup,
    }

    showStatus('正在导入…', 'warn')
    const resp = await fetch(GATEWAY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: API_KEY, 'X-User-Token': token },
      body: JSON.stringify({ action: 'importMantasProduct', data, accessToken: token }),
    })
    const json = await resp.json().catch(() => ({}))
    if (json && json.code === 0) {
      const d = json.data || {}
      showStatus(`导入成功（${d.created ? '新建草稿' : '覆盖更新'}）\n商品ID: ${d.productId}\nSKU 数: ${d.skuCount}\n分类: ${d.categoryName || d.category || '-'}\n编码示例: MGY{订货价}Y${shipping}HZ1…`, 'ok')
    } else {
      showStatus('导入失败：' + (json && json.message ? json.message : ('HTTP ' + resp.status)), 'err')
    }
  } catch (e) {
    showStatus('请求异常：' + (e && e.message ? e.message : e), 'err')
  } finally {
    btn.disabled = false
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  const isMantas = tab && tab.url && tab.url.indexOf('mall.mantas.cn') !== -1
  currentTabId = tab ? tab.id : null
  currentUrl = tab && tab.url ? tab.url : ''
  $('addSku').addEventListener('click', () => addSkuRow('', '', 0, ''))
  $('rescrape').addEventListener('click', rescrape)
  $('import').addEventListener('click', doImport)
  if (isMantas) {
    // 延迟 1s 等详情图懒加载完成，避免自动 scrape 时 currentSrc 为空导致漏抓详情图
    setTimeout(async () => {
      try {
        const r = await chrome.scripting.executeScript({ target: { tabId: currentTabId }, world: 'MAIN', func: scrapeMantasProduct })
        fillForm(r && r[0] && r[0].result)
      } catch (e) {
        showStatus('自动抓取失败，可手动填写后导入：' + (e && e.message ? e.message : e), 'warn')
      }
    }, 1000)
  } else {
    // 非 mantas 页也允许手动填写导入
    addSkuRow('', '', 0, '')
    showStatus('当前不是 mantas 商品页，可手动填写后导入。', 'warn')
  }
})
