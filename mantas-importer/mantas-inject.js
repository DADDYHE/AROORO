// ===================== AROORO mantas 商品页注入脚本（页面内浮层） =====================
// 在 mall.mantas.cn 的 /sku-detail/ 商品详情页注入：
//   1) 右下角常驻金色悬浮按钮「⬇ 导入到 AROORO」
//   2) 点击按钮 → 在页面内（shadow DOM 隔离）展开导入面板，无需依赖工具栏 popup
// 抓取/图片转换经 background.js 中转（MAIN world 注入），绕开 content script 直连 chrome.tabs 的不兼容。
(function () {
  if (window.__arooroMantasInjected) return
  window.__arooroMantasInjected = true
  if (!/mall\.mantas\.cn/.test(location.host)) return
  if (!/\/sku-detail\//.test(location.pathname)) return

  const GATEWAY = 'https://cloudbase-d7getcjqy33b13475.api.tcloudbasegateway.com/v1/functions/adminService'
  const API_KEY = 'Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6IjlkMWRjMzFlLWI0ZDAtNDQ4Yi1hNzZmLWIwY2M2M2Q4MTQ5OCJ9.eyJhdWQiOiJjbG91ZGJhc2UtZDdnZXRjanF5MzNiMTM0NzUiLCJleHAiOjI1MzQwMjMwMDc5OSwiaWF0IjoxNzgwOTk5MDMzLCJhdF9oYXNoIjoiU2hmSEowbS1SeDY3SEVKQmtZNzg4dyIsInByb2plY3RfaWQiOiJjbG91ZGJhc2UtZDdnZXRjanF5MzNiMTM0NzUiLCJtZXRhIjp7InBsYXRmb3JtIjoiQXBpS2V5In0sImFkbWluaXN0cmF0b3JfaWQiOiIyMDU1NTcxNDE5MDY3MTA1MjgyIiwidXNlcl90eXBlIjoiIiwiY2xpZW50X3R5cGUiOiJjbGllbnRfc2VydmVyIiwiaXNfc3lzdGVtX2FkbWluIjp0cnVlfQ.EcVybfuRUbA19CjPTzx8XLavv-SxDWRfZE5_ZDFnCwIpVk74JEtnYk2Vp4J3hoLZ3G_cCJAWrcRzqs_lrd4boDjDnHstgw59wMnCbjO162K76I9JsL0pQUiiRcFUNo09Nt2vR_tCP4Z64bX4blxPjlFufSweAp0YVBjPl9n-PivoSzLqeDuYSD7OfcPHQCv68XXguhW3hlz9wjdImaB9oaAotv51S4RjF9qbZa1LrvMT1qsDFyse7m-6rn1j5RxL10UOe9aGL_5Vu4de-5Kuz7vr4syLUZjYqv9rSMqDFfhCb4ZRY__M7OdODJ8d8jfupSAIO0pJ6bBI_LJmL-dgGQ'

  // ---------- content script 侧桥接（经 background service worker 中转） ----------
  // 抓取 / 图片转换由 background.js 在 MAIN world 执行（content script 直连 chrome.tabs 在部分环境不稳）。
  function scrape() {
    return new Promise((resolve) => {
      try { chrome.runtime.sendMessage({ type: 'mantas_scrape' }, (r) => resolve((r && r.result) || null)) }
      catch (e) { resolve(null) }
    })
  }
  function convertImages(urls) {
    return new Promise((resolve) => {
      try { chrome.runtime.sendMessage({ type: 'mantas_convert', urls }, (r) => resolve((r && r.result) || urls)) }
      catch (e) { resolve(urls) }
    })
  }
  // 分张上传：每张图单独调网关 uploadMantasImage 转存，返回 fileID 列表（绕开网关单请求体积上限，原图无损）
  function uploadImage(token, image) {
    return new Promise((resolve) => {
      try { chrome.runtime.sendMessage({ type: 'mantas_upload', token, image }, (r) => resolve((r && r.result) || null)) }
      catch (e) { resolve(null) }
    })
  }
  async function uploadImages(token, images) {
    const out = new Array(images.length)
    const failures = []
    let i = 0
    const workers = Array.from({ length: Math.min(3, images.length || 1) }, async () => {
      while (i < images.length) {
        const idx = i++
        const r = await uploadImage(token, images[idx])
        if (r && r.code === 0 && r.data && r.data.fileId) { out[idx] = r.data.fileId }
        else {
          out[idx] = ''
          failures.push((r && (r.message || (r.status ? 'HTTP ' + r.status : '未知错误'))) || '未知错误')
        }
      }
    })
    await Promise.all(workers)
    return { fileIds: out.filter(Boolean), failures }
  }

  // ---------- 页面内浮层 UI（shadow DOM 隔离） ----------
  const host = document.createElement('div')
  host.id = 'arooroMantasRoot'
  const shadow = host.attachShadow({ mode: 'open' })
  const escapeAttr = (s) => String(s == null ? '' : s).replace(/"/g, '&quot;')
  shadow.innerHTML = `
    <style>
      * { box-sizing: border-box; }
      .fab {
        position: fixed; right: 18px; bottom: 18px; z-index: 2147483647;
        padding: 11px 18px; background: #c9a24b; color: #fff;
        font: 600 14px/1 -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
        border-radius: 26px; box-shadow: 0 6px 18px rgba(31,58,31,.35);
        cursor: pointer; user-select: none; letter-spacing: .5px;
      }
      .fab:hover { background: #b8913f; }
      .panel {
        position: fixed; right: 18px; bottom: 70px; z-index: 2147483647;
        width: 360px; max-height: 78vh; overflow-y: auto;
        background: #f7f5ef; color: #1f3a1f; border: 1px solid #c9a24b;
        border-radius: 14px; box-shadow: 0 12px 40px rgba(31,58,31,.35);
        font: 13px/1.5 -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
        padding: 14px; display: none;
      }
      .panel.open { display: block; }
      .panel h3 { margin: 0 0 8px; font-size: 15px; color: #1f3a1f; display: flex; justify-content: space-between; align-items: center; }
      .panel .close { cursor: pointer; color: #888; font-weight: 400; font-size: 18px; line-height: 1; }
      .panel label { display: block; margin: 8px 0 2px; color: #555; font-size: 12px; }
      .panel input[type=text], .panel input[type=number] {
        width: 100%; padding: 6px 8px; border: 1px solid #d8cfb8; border-radius: 8px;
        background: #fff; color: #1f3a1f; font-size: 13px;
      }
      .panel .g2 { display: flex; gap: 6px; }
      .panel .g2 > * { flex: 1; min-width: 0; }
      .panel .sku { border: 1px solid #e3dcc6; border-radius: 10px; padding: 8px; margin: 6px 0; background: #fffdf8; }
      .panel .sku .top { display: flex; justify-content: space-between; align-items: center; }
      .panel .muted { color: #999; font-size: 11px; }
      .panel button { cursor: pointer; border: none; border-radius: 8px; font-size: 13px; }
      .panel .del { background: #f0e6d2; color: #a33; padding: 3px 8px; }
      .panel .row { display: flex; gap: 8px; margin-top: 10px; }
      .panel .row button { flex: 1; padding: 9px 0; }
      .panel .primary { background: #c9a24b; color: #fff; }
      .panel .ghost { background: #ece4d4; color: #1f3a1f; }
      .panel .add { background: #1f3a1f; color: #fff; padding: 6px 10px; }
      .panel .status { margin-top: 10px; padding: 8px; border-radius: 8px; font-size: 12px; white-space: pre-line; display: none; }
      .panel .status.ok { background: #e7f2e7; color: #1f5a1f; }
      .panel .status.err { background: #fbeaea; color: #a33; }
      .panel .status.warn { background: #fcf3df; color: #8a6d1f; }
      .panel .tip { color: #999; font-size: 11px; margin-top: 4px; }
      .panel input[type=checkbox] { vertical-align: middle; }
    </style>
    <div class="fab" id="arooroFab">⬇ 导入到 AROORO</div>
    <div class="panel" id="arooroPanel">
      <h3>导入 mantas 商品 <span class="close" id="arooroClose">×</span></h3>
      <label>商品标题</label>
      <input type="text" id="mTitle" placeholder="自动抓取，可改" />
      <label>商品ID（mantasSkuId）</label>
      <input type="text" id="mSkuId" placeholder="自动抓取" />
      <label>分类路径（面包屑）</label>
      <input type="text" id="mCat" placeholder="如 宠物食品 / 猫粮" />
      <label>运费（必填，元）</label>
      <input type="number" id="mShip" step="0.01" min="0" placeholder="如 8" />
      <label>加价倍数（默认 1.5）</label>
      <input type="number" id="mMarkup" step="0.1" min="0.1" value="1.5" />
      <label>规格（每个规格一个 SKU 码）</label>
      <div id="mSkus"></div>
      <button class="add" id="mAddSku" type="button">+ 添加规格</button>
      <label style="margin-top:10px;"><input type="checkbox" id="mUseImg" checked /> 导入抓取到的图片（主图 <span id="mImgCnt">0</span> · 详情 <span id="mDetailCnt">0</span> 张，登录态转存）</label>
      <label>手动 token（可选，留空则用后台自动镜像的登录态）</label>
      <input type="text" id="mToken" placeholder="粘贴 AROORO JWT" />
      <div class="row">
        <button class="ghost" id="mRescrape" type="button">重新抓取</button>
        <button class="primary" id="mImport" type="button">导入到商品库</button>
      </div>
      <div class="status" id="mStatus"></div>
      <div class="tip">SKU 编码格式：MGY{订货价}Y{运费}HZ{序号}（每个规格自动递增）</div>
    </div>`

  if (document.body) document.body.appendChild(host)
  else document.addEventListener('DOMContentLoaded', () => document.body && document.body.appendChild(host))

  const $ = (sel) => shadow.querySelector(sel)
  const panel = $('#arooroPanel')
  const fab = $('#arooroFab')
  const statusEl = $('#mStatus')
  let scrapedImages = []
  let scrapedDetailImages = []
  let currentUrl = location.href
  let multiTask = null
  // 多页编排：每个规格是独立 SKU 子页（价格随子页而来），需逐页跳转子页读各自真实价
  function getPageSkuId() { const m = location.pathname.match(/sku-detail\/(\d+)/); return m ? m[1] : null }
  function jumpTo(href) { const abs = href && /^https?:/.test(href) ? href : ('https://mall.mantas.cn' + (href || '')); location.href = abs }
  // 注意：多页任务必须跨 top-level 导航持久化。chrome.storage.session 在部分 Chrome 版本下
  // 跨整页跳转可能清空/不可见（content script 重新注入后读不到），故改用 chrome.storage.local，
  // 其跨导航/刷新必然持久；任务完成后 ssClear 清理，且带 createdAt 防跨商品误触发。
  function ssGet() { return new Promise((res) => { try { chrome.storage.local.get('mantasMultiSku', (o) => res((o && o.mantasMultiSku) || null)) } catch (e) { res(null) } }) }
  function ssSet(t) { return new Promise((res) => { try { chrome.storage.local.set({ mantasMultiSku: t }, () => res()) } catch (e) { res() } }) }
  function ssClear() { return new Promise((res) => { try { chrome.storage.local.remove('mantasMultiSku', () => res()) } catch (e) { res() } }) }

  function showStatus(msg, cls) { statusEl.textContent = msg; statusEl.className = 'status ' + (cls || ''); statusEl.style.display = 'block' }

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
    $('#mSkus').appendChild(wrap)
  }

  function fillForm(r) {
    if (!r) return
    if (r.mantasSkuId) $('#mSkuId').value = r.mantasSkuId
    if (r.title) $('#mTitle').value = r.title
    if (r.categoryPath) $('#mCat').value = r.categoryPath
    scrapedImages = Array.isArray(r.images) ? r.images : []
    scrapedDetailImages = Array.isArray(r.detailImages) ? r.detailImages : []
    $('#mImgCnt').textContent = scrapedImages.length
    const dc = $('#mDetailCnt'); if (dc) dc.textContent = scrapedDetailImages.length
    $('#mSkus').innerHTML = ''
    if (Array.isArray(r.skus) && r.skus.length) r.skus.forEach((s) => addSkuRow(s.specText, s.price, s.stock, s.image))
    else addSkuRow('', r.price != null ? r.price : '', 0, '')
  }

  async function doRescrape() {
    showStatus('正在抓取当前页面（等详情图懒加载）…', 'warn')
    await new Promise((res) => setTimeout(res, 1200))
    try {
    const r = await scrape()
    if (!r || !r.mantasSkuId) { showStatus('抓取完成，但未能识别商品ID，请手动补全。', 'warn'); return }
    // 续传保护：若当前页是已有多页任务的待抓子页（用户手动点了浮钮），继续收集而非重启 → 避免死循环跳转
    const existing = await ssGet()
    if (existing && !existing.done && existing.pending.some((p) => p.skuId === getPageSkuId())) {
      multiTask = existing
      await maybeAutoCollect()
      return
    }
    // 用户主动重新抓取 → 丢弃之前的跨页进度
    await ssClear(); multiTask = null
      const pageSku = getPageSkuId()
      const specs = (r.skus || []).map((s) => ({
        specText: s.specText,
        skuId: s.skuId || pageSku,
        href: s.href || null,
        price: (s.skuId || pageSku) === pageSku ? s.price : null,
        image: s.image || '',
      }))
      const others = specs.filter((s) => s.skuId && s.skuId !== pageSku)
      const base = { skuId: pageSku, title: r.title, images: r.images, detailImages: r.detailImages, categoryPath: r.categoryPath, sourceUrl: r.sourceUrl, specs }
      const collected = {}
      collected[pageSku] = { price: (specs.find((s) => s.skuId === pageSku) || {}).price, images: r.images, detailImages: r.detailImages }
      if (!others.length) {
        fillForm(r)
        showStatus('已抓取：' + (r.title || '') + '（' + specs.length + ' 个规格，主图 ' + scrapedImages.length + ' · 详情 ' + scrapedDetailImages.length + ' 张）', 'ok')
        return
      }
      // 多规格（价格不同）→ 启动逐页抓取各规格真实价
      multiTask = { base, pending: others.slice(), collected, done: false, createdAt: Date.now() }
      await ssSet(multiTask)
      showStatus('检测到 ' + (others.length + 1) + ' 个规格（价格不同），正在逐页抓取各规格真实价…（将自动跳转 ' + others.length + ' 个子页面）', 'warn')
      jumpTo(others[0].href)
    } catch (e) {
      showStatus('抓取失败：' + (e && e.message ? e.message : e), 'err')
    }
  }

  function buildMerged(task) {
    const skus = task.base.specs.map((s) => ({
      specText: s.specText,
      price: (task.collected[s.skuId] && task.collected[s.skuId].price != null) ? task.collected[s.skuId].price : s.price,
      stock: 0,
      image: (task.collected[s.skuId] && task.collected[s.skuId].images && task.collected[s.skuId].images[0]) || s.image || (task.base.images[0] || ''),
    }))
    return { mantasSkuId: task.base.skuId, title: task.base.title, categoryPath: task.base.categoryPath, images: task.base.images, detailImages: task.base.detailImages, skus }
  }

  // 多页自动收集：content script 注入时若 session 有未完成任务且当前页是待抓子页，自动抓取并跳转
  async function maybeAutoCollect() {
    let task = null
    try { task = await ssGet() } catch (e) {}
    if (!task) return
    // 过期任务清理（>5 分钟）：跨商品/异常残留，直接丢弃，避免误触发
    if (task.createdAt && Date.now() - task.createdAt > 5 * 60 * 1000) { await ssClear(); return }
    const pageSku = getPageSkuId()
    if (!pageSku) return
    if (task.done) {
      // 刷新/重入末页：回填汇总，不自动展开（等用户点 fab）
      multiTask = task
      const merged = buildMerged(task)
      scrapedImages = merged.images; scrapedDetailImages = merged.detailImages
      fillForm(merged)
      return
    }
    if (!task.pending.some((p) => p.skuId === pageSku)) return
    await new Promise((res) => setTimeout(res, 1800)) // 等 CSR 子页接口返回并渲染价格区
    try {
      const r = await scrape()
      const cur = (r && r.skus && r.skus.find((s) => s.skuId === pageSku)) || null
      const price = cur ? cur.price : (r ? r.price : null)
      task.collected[pageSku] = { price, images: r ? r.images : [], detailImages: r ? r.detailImages : [] }
      task.pending = task.pending.filter((x) => x.skuId !== pageSku)
      if (task.pending.length) {
        await ssSet(task)
        jumpTo(task.pending[0].href)
      } else {
        task.done = true
        await ssSet(task)
        multiTask = task
        const merged = buildMerged(task)
        scrapedImages = merged.images; scrapedDetailImages = merged.detailImages
        fillForm(merged)
        panel.classList.add('open')
        showStatus('已抓取全部 ' + merged.skus.length + ' 个规格，各自真实价已填入。\n商品主体：' + task.base.skuId + '\n可在本页（末页）直接点「导入到商品库」。', 'ok')
      }
    } catch (e) {
      showStatus('逐页抓取失败（' + pageSku + '）：' + (e && e.message ? e.message : e), 'err')
    }
  }

  async function doImport() {
    const btn = $('#mImport'); btn.disabled = true
    try {
      const token = (await chrome.storage.local.get('arooroToken')).arooroToken || $('#mToken').value.trim()
      if (!token) return showStatus('请先打开并登录 AROORO 后台（另一标签页），或在下方粘贴 token。', 'err')
      const shipping = parseFloat($('#mShip').value)
      if (!(shipping >= 0)) return showStatus('请填写运费（必填，非负数字）。', 'err')
      const markup = parseFloat($('#mMarkup').value) || 1.5
      const title = $('#mTitle').value.trim()
      const mantasSkuId = $('#mSkuId').value.trim()
      if (!title) return showStatus('请填写商品标题。', 'err')
      if (!mantasSkuId) return showStatus('请填写商品ID（mantasSkuId）。', 'err')
      const rows = Array.from($('#mSkus').querySelectorAll('.sku'))
      if (!rows.length) return showStatus('请至少添加一个规格。', 'err')
      const skus = rows.map((r, i) => ({
        skuId: 'm_' + mantasSkuId + '_' + (i + 1),
        specText: r.querySelector('.specText').value.trim(),
        price: parseFloat(r.querySelector('.price').value) || 0,
        stock: parseInt(r.querySelector('.stock').value) || 0,
        image: r.querySelector('.image').value.trim(),
      })).filter((s) => s.price > 0 || s.specText)
      if (!skus.length) return showStatus('请填写至少一个规格的订货价。', 'err')
      // 管理端多规格 UI 由 specGroups 驱动渲染（规格维度 + generateSkus 生成 SKU 列表）。
      // 抓取只拿到扁平 specText（如「2KG鸡肉」），需自动归一成单维度 specGroups，否则后台看不到规格/SKU。
      const specValues = [...new Set(skus.map((s) => s.specText).filter(Boolean))]
      const specGroups = specValues.length ? [{ name: '规格', values: specValues }] : []

      let images = []
      let detailImages = []
      if ($('#mUseImg').checked) {
        if (scrapedImages.length) {
          showStatus('正在转存主图（' + scrapedImages.length + ' 张，登录态）…', 'warn')
          let dataUrls = []
          try { dataUrls = await convertImages(scrapedImages) } catch (e) { dataUrls = scrapedImages }
          const up = await uploadImages(token, dataUrls)
          images = up.fileIds
          if (up.failures.length) showStatus('有 ' + up.failures.length + ' 张主图转存失败：' + up.failures.slice(0, 3).join('；') + '，继续导入…', 'warn')
        }
        if (scrapedDetailImages.length) {
          showStatus('正在转存详情图（' + scrapedDetailImages.length + ' 张，登录态）…', 'warn')
          let dUrls = []
          try { dUrls = await convertImages(scrapedDetailImages) } catch (e) { dUrls = scrapedDetailImages }
          const dup = await uploadImages(token, dUrls)
          detailImages = dup.fileIds
          if (dup.failures.length) showStatus('有 ' + dup.failures.length + ' 张详情图转存失败：' + dup.failures.slice(0, 3).join('；') + '，继续导入…', 'warn')
        }
      }

      const data = {
        mantasSkuId, title, sourceUrl: (multiTask && multiTask.base && multiTask.base.sourceUrl) || currentUrl,
        categoryPath: $('#mCat').value.trim(),
        specGroups, skus, images, detailImages,
        basePrice: skus[0] ? skus[0].price : 0,
        shippingFee: shipping, markup,
      }
      showStatus('正在导入…', 'warn')
      const r = await new Promise((resolve) => {
        try { chrome.runtime.sendMessage({ type: 'mantas_import', token, data }, (resp) => resolve(resp || {})) } catch (e) { resolve({ error: e && e.message ? e.message : String(e) }) }
      })
      if (r.error) return showStatus('请求异常：' + r.error, 'err')
      const json = r.result || {}
      if (json && json.code === 0) {
        const d = json.data || {}
        showStatus('导入成功（' + (d.created ? '新建草稿' : '覆盖更新') + '）\n商品ID: ' + d.productId + '\nSKU 数: ' + d.skuCount + '\n分类: ' + (d.categoryName || d.category || '-') + '\n编码示例: MGY{订货价}Y' + shipping + 'HZ1…', 'ok')
      } else {
        showStatus('导入失败：' + (json && json.message ? json.message : (json && json.status ? '网关 HTTP ' + json.status + (json.raw ? '：' + json.raw : '') : '网关未返回有效结果')), 'err')
      }
    } catch (e) {
      showStatus('请求异常：' + (e && e.message ? e.message : e), 'err')
    } finally {
      btn.disabled = false
    }
  }

  fab.addEventListener('click', () => {
    const open = panel.classList.toggle('open')
    if (open && !scrapedImages.length && !$('#mSkuId').value) doRescrape()
  })
  $('#arooroClose').addEventListener('click', () => panel.classList.remove('open'))
  $('#mAddSku').addEventListener('click', () => addSkuRow('', '', 0, ''))
  $('#mRescrape').addEventListener('click', doRescrape)
  $('#mImport').addEventListener('click', doImport)

  // SPA 路由兜底：若页面跳走再跳回，保证注入不丢
  const obs = window.MutationObserver && new MutationObserver(() => { if (!document.getElementById('arooroMantasRoot') && document.body) document.body.appendChild(host) })
  if (obs) obs.observe(document.documentElement, { childList: true, subtree: true })

  // 多页编排：注入时若 session 有未完成任务且当前页是待抓子页，自动抓取并跳转（不干扰用户手动操作）
  maybeAutoCollect()
})()
