/**
 * i18nOverride 服务（Sprint 23 新增）
 *
 * 目标：
 *   - 提供 i18n 文案热覆盖的云端读写能力
 *   - 集合：i18n_overrides（按 key + locale 维度）
 *   - 文档结构：{ _id, key, locale, value, status, createdBy, updatedBy, createdAt, updatedAt, note }
 *   - 支持 status='active' / 'disabled'，客户端只会拉 active 的 key
 *   - 支持单条 upsert / 批量 upsert / 单条删除
 *
 * 与 utils/i18n.js 的衔接：
 *   - 客户端在 onShow 拉取 active override 列表
 *   - 调用 applyCustomOverrides({ KEY: { 'en-US': 'New Text' } })
 *   - 实现「运营改文案后端生效，客户端下次启动 / 拉取时即时刷新」
 *
 * 数据库索引（运维需在 i18n_overrides 集合上创建）：
 *   1. { key: 1, locale: 1 }                  - 唯一索引，保证 upsert 幂等（H3/H4 修复前置条件）
 *   2. { status: 1, locale: 1, updatedAt: -1 } - 覆盖 fetchActiveOverrides / listI18nOverrides 查询
 */
const { handleSuccess, generateId, initCloud, escapeRegExp } = require('../common/utils')
const { createLogger } = require('../common/logger')
const { withErrorHandling, err } = require('../common/errors')

const { db } = initCloud()
const logger = createLogger('i18nOverrideService')

const COLLECTION = 'i18n_overrides'
const SUPPORTED_LOCALES = ['zh-CN', 'en-US', 'ja-JP']
const ALLOWED_STATUS = ['active', 'disabled']

// M5：批量 upsert 的并发上限，避免串行耗时与过多连接
const BATCH_CONCURRENCY = 6
// M5：单批 upsert 上限
const BATCH_MAX_ITEMS = 200
// M6：aggregate / 全量扫描的安全上限
const SCAN_LIMIT = 2000

// aggregate 命令对象（与 orderService/stats.js 一致的 CloudBase 用法）
const _ = db.command
const $ = _.aggregate || { sum: () => 0 }

/**
 * 判断是否为重复键错误（并发下其他请求已插入相同 (key, locale)）
 * -502001：cloud sdk 集合/文档已存在
 * 兼容文案：duplicate key / already exists
 */
function isDuplicateKeyError(e) {
  if (!e || typeof e !== 'object') { return false }
  const msg = (e.message || '').toLowerCase()
  return e.errCode === -502001 || /duplicate|already.*exist/i.test(msg)
}

/**
 * 简单的有限并发执行器
 * @param {Array<() => Promise<T>>} tasks
 * @param {number} concurrency
 * @returns {Promise<Array<T>>} 按 tasks 顺序返回结果
 */
async function runWithConcurrency(tasks, concurrency) {
  const results = new Array(tasks.length)
  let cursor = 0
  async function worker() {
    while (cursor < tasks.length) {
      const idx = cursor++
      results[idx] = await tasks[idx]()
    }
  }
  const workers = []
  for (let i = 0; i < Math.min(concurrency, tasks.length); i++) {
    workers.push(worker())
  }
  await Promise.all(workers)
  return results
}

function sanitizeKey(key) {
  if (typeof key !== 'string') {return ''}
  return key.trim()
}

function sanitizeLocale(locale) {
  if (typeof locale !== 'string') {return ''}
  return locale.trim()
}

/**
 * 列出所有 override（支持分页 / 按 key 前缀过滤 / 仅 active）
 *
 * M7：i18n key 通常为常量标识符，正则匹配改为大小写敏感，
 *     以提升索引利用率并避免误匹配。
 */
const listI18nOverrides = withErrorHandling(async (event = {}) => {
  const { prefix, status, page = 1, pageSize = 50 } = event
  const filter = {}
  if (prefix && typeof prefix === 'string') {
    // 大小写敏感（i18n key 一般为常量）
    filter.key = db.RegExp({ regexp: `^${escapeRegExp(prefix)}` })
  }
  if (status && ALLOWED_STATUS.includes(status)) {
    filter.status = status
  }

  const safePage = Math.max(1, parseInt(page, 10) || 1)
  const safeSize = Math.min(200, Math.max(1, parseInt(pageSize, 10) || 50))

  const countRes = await db.collection(COLLECTION).where(filter).count()
  const total = countRes.total || 0

  const listRes = await db.collection(COLLECTION)
    .where(filter)
    .orderBy('updatedAt', 'desc')
    .skip((safePage - 1) * safeSize)
    .limit(safeSize)
    .get()

  return handleSuccess(
    { list: listRes.data || [], total, page: safePage, pageSize: safeSize },
    '获取成功'
  )
})

/**
 * 获取某个 key 的所有 locale 覆盖（供运营后台编辑多语言）
 */
const getI18nOverride = withErrorHandling(async (event = {}) => {
  const { key } = event
  const cleanKey = sanitizeKey(key)
  if (!cleanKey) {
    throw err('INVALID_PARAMS', '缺少 key', { key })
  }

  const res = await db.collection(COLLECTION)
    .where({ key: cleanKey })
    .limit(SUPPORTED_LOCALES.length)
    .get()

  return handleSuccess(
    { key: cleanKey, items: res.data || [] },
    '获取成功'
  )
})

/**
 * 单条 upsert：按 (key, locale) 唯一
 * - 已存在：更新 value / status / updatedBy / updatedAt
 * - 不存在：插入新文档
 *
 * H3/H4：依赖 (key, locale) 唯一索引；并发下若 add 撞键，降级为 update 保证幂等。
 *
 * @param {object} event
 * @param {object} context
 * @param {object} auth - { openid, adminId }
 */
const upsertI18nOverride = withErrorHandling(async (event = {}, context, auth = {}) => {
  const { key, locale, value, status = 'active', note } = event
  const cleanKey = sanitizeKey(key)
  const cleanLocale = sanitizeLocale(locale)

  if (!cleanKey) {
    throw err('INVALID_PARAMS', '缺少 key', { key })
  }
  if (!SUPPORTED_LOCALES.includes(cleanLocale)) {
    throw err('INVALID_PARAMS', '不支持的 locale', { locale: cleanLocale, supported: SUPPORTED_LOCALES })
  }
  if (typeof value !== 'string') {
    throw err('INVALID_PARAMS', 'value 必须为字符串', { type: typeof value })
  }
  if (!ALLOWED_STATUS.includes(status)) {
    throw err('INVALID_PARAMS', '不支持的 status', { status, allowed: ALLOWED_STATUS })
  }
  if (value.length > 2000) {
    throw err('INVALID_PARAMS', 'value 长度超过 2000 字符', { length: value.length })
  }

  const operator = auth.openid || auth.adminId || 'unknown'
  const now = db.serverDate()

  // 查询是否已存在 (key, locale)
  const existRes = await db.collection(COLLECTION)
    .where({ key: cleanKey, locale: cleanLocale })
    .limit(1)
    .get()

  if (existRes.data && existRes.data.length > 0) {
    const docId = existRes.data[0]._id
    const updateData = {
      value,
      status,
      updatedBy: operator,
      updatedAt: now,
    }
    if (note !== undefined) {updateData.note = String(note).slice(0, 500)}
    await db.collection(COLLECTION).doc(docId).update({ data: updateData })
    return handleSuccess({ _id: docId, key: cleanKey, locale: cleanLocale, action: 'updated' }, '更新成功')
  }

  // 不存在 → 插入；并发下若另一请求已插入相同 (key, locale)，降级为 update
  const doc = {
    _id: generateId('i18n', operator),
    key: cleanKey,
    locale: cleanLocale,
    value,
    status,
    note: note ? String(note).slice(0, 500) : '',
    createdBy: operator,
    updatedBy: operator,
    createdAt: now,
    updatedAt: now,
  }
  try {
    await db.collection(COLLECTION).add({ data: doc })
    return handleSuccess({ ...doc, action: 'created' }, '创建成功')
  } catch (addErr) {
    if (!isDuplicateKeyError(addErr)) { throw addErr }
    // H3/H4：并发下另一请求已创建，降级为 update
    logger.info('upsert.duplicate_fallback', { key: cleanKey, locale: cleanLocale })
    const fallbackRes = await db.collection(COLLECTION)
      .where({ key: cleanKey, locale: cleanLocale })
      .limit(1)
      .get()
    if (!fallbackRes.data || fallbackRes.data.length === 0) {
      // 极端：报重复键但又查不到，抛出避免静默错误
      throw err('DB_ERROR', 'upsert 重复键降级失败：未找到已有文档', { key: cleanKey, locale: cleanLocale })
    }
    const docId = fallbackRes.data[0]._id
    const updateData = {
      value,
      status,
      updatedBy: operator,
      updatedAt: now,
    }
    if (note !== undefined) {updateData.note = String(note).slice(0, 500)}
    await db.collection(COLLECTION).doc(docId).update({ data: updateData })
    return handleSuccess({ _id: docId, key: cleanKey, locale: cleanLocale, action: 'updated' }, '更新成功（并发降级）')
  }
})

/**
 * 批量 upsert：用于一次性导入 / 翻译
 * 入参：{ items: [{ key, locale, value, status, note }, ...] }
 *
 * M5：使用有限并发（BATCH_CONCURRENCY=6）替代串行 await，
 *     200 条数据耗时显著降低，避免触发云函数超时。
 *
 * @param {object} event
 * @param {object} context
 * @param {object} auth
 */
const batchUpsertI18nOverrides = withErrorHandling(async (event = {}, context, auth = {}) => {
  const { items } = event
  if (!Array.isArray(items) || items.length === 0) {
    throw err('INVALID_PARAMS', 'items 必须为非空数组', { type: typeof items })
  }
  if (items.length > BATCH_MAX_ITEMS) {
    throw err('INVALID_PARAMS', `单次最多 ${BATCH_MAX_ITEMS} 条`, { length: items.length })
  }

  const operator = auth.openid || auth.adminId || 'unknown'
  const now = db.serverDate()
  const results = { created: 0, updated: 0, skipped: 0, errors: [] }

  // 单条处理函数（含 H3/H4 重复键降级）
  async function processOne(item, i) {
    const cleanKey = sanitizeKey(item && item.key)
    const cleanLocale = sanitizeLocale(item && item.locale)
    try {
      if (!cleanKey) {throw new Error('missing key')}
      if (!SUPPORTED_LOCALES.includes(cleanLocale)) {throw new Error('invalid locale')}
      if (typeof item.value !== 'string') {throw new Error('value must be string')}
      if (item.value.length > 2000) {throw new Error('value too long')}

      const status = ALLOWED_STATUS.includes(item.status) ? item.status : 'active'
      const note = item.note ? String(item.note).slice(0, 500) : ''

      const existRes = await db.collection(COLLECTION)
        .where({ key: cleanKey, locale: cleanLocale })
        .limit(1)
        .get()

      if (existRes.data && existRes.data.length > 0) {
        const docId = existRes.data[0]._id
        await db.collection(COLLECTION).doc(docId).update({
          data: { value: item.value, status, note, updatedBy: operator, updatedAt: now },
        })
        results.updated++
        return
      }

      // 不存在 → 插入；并发下若另一请求已插入相同 (key, locale)，降级为 update
      try {
        await db.collection(COLLECTION).add({
          data: {
            _id: generateId('i18n', operator),
            key: cleanKey,
            locale: cleanLocale,
            value: item.value,
            status,
            note,
            createdBy: operator,
            updatedBy: operator,
            createdAt: now,
            updatedAt: now,
          },
        })
        results.created++
      } catch (addErr) {
        if (!isDuplicateKeyError(addErr)) { throw addErr }
        // H3/H4：并发下另一请求已创建，降级为 update
        logger.info('batchUpsert.duplicate_fallback', { index: i, key: cleanKey, locale: cleanLocale })
        const fallbackRes = await db.collection(COLLECTION)
          .where({ key: cleanKey, locale: cleanLocale })
          .limit(1)
          .get()
        if (!fallbackRes.data || fallbackRes.data.length === 0) {
          throw new Error('duplicate key but doc not found')
        }
        const docId = fallbackRes.data[0]._id
        await db.collection(COLLECTION).doc(docId).update({
          data: { value: item.value, status, note, updatedBy: operator, updatedAt: now },
        })
        results.updated++
      }
    } catch (e) {
      results.skipped++
      // L9：保留完整 stack 信息，便于排查
      results.errors.push({
        index: i,
        key: cleanKey,
        locale: cleanLocale,
        error: e.message,
        stack: e.stack,
      })
    }
  }

  // 构造任务列表，有限并发执行
  const tasks = items.map((item, i) => () => processOne(item, i))
  await runWithConcurrency(tasks, BATCH_CONCURRENCY)

  return handleSuccess(results, `批量完成：新建 ${results.created} 条 / 更新 ${results.updated} 条 / 跳过 ${results.skipped} 条`)
})

/**
 * 删除单条 override
 *
 * L6：物理删除保留，但通过 logger 记录审计日志（含操作人、目标文档）。
 */
const deleteI18nOverride = withErrorHandling(async (event = {}, context, auth = {}) => {
  const { overrideId } = event
  if (!overrideId) {
    throw err('INVALID_PARAMS', '缺少 overrideId')
  }
  const operator = auth.openid || auth.adminId || 'unknown'
  // L6：审计日志
  logger.info('delete.override', { overrideId, operator })
  await db.collection(COLLECTION).doc(overrideId).remove()
  return handleSuccess({ _id: overrideId }, '删除成功')
})

/**
 * 拉取 active 的全部 override（供客户端热更新）
 * 入参：{ locale?: 'zh-CN' | 'en-US' | 'ja-JP' } - 不传则返回所有 locale
 *
 * 返回结构：{ overrides: { KEY: { 'en-US': 'New Text' } }, count, keyCount, entryCount }
 * 与 utils/i18n.js 的 applyCustomOverrides 入参直接对应
 *
 * M4：此函数与 i18nOverride 云函数的 fetchActive 行为保持一致。
 *     admin 后台若需直接调用云函数，可改为 require('i18nOverride').fetchActive；
 *     当前保留独立实现是为避免 adminService ↔ i18nOverride 的循环依赖。
 */
const fetchActiveOverrides = withErrorHandling(async (event = {}) => {
  const { locale } = event
  // M2：与 i18nOverride 云函数 fetchActive 保持一致——非法 locale 抛错而非静默降级
  if (locale !== undefined && typeof locale !== 'string') {
    throw err('INVALID_PARAMS', 'locale 必须为字符串', { type: typeof locale })
  }
  if (typeof locale === 'string' && locale && !SUPPORTED_LOCALES.includes(locale)) {
    throw err('INVALID_PARAMS', '不支持的 locale', { locale, supported: SUPPORTED_LOCALES })
  }
  const filter = { status: 'active' }
  if (locale) {
    filter.locale = locale
  }

  // 单次最多 SCAN_LIMIT 条；客户端首屏 / 启动时调用一次
  const res = await db.collection(COLLECTION)
    .where(filter)
    .limit(SCAN_LIMIT)
    .get()

  const overrides = {}
  let entryCount = 0
  for (const doc of res.data || []) {
    if (!doc || !doc.key || !doc.locale) { continue }
    if (!overrides[doc.key]) {overrides[doc.key] = {}}
    overrides[doc.key][doc.locale] = doc.value
    entryCount++
  }
  const keyCount = Object.keys(overrides).length

  return handleSuccess({
    overrides,
    count: keyCount, // 兼容旧字段
    keyCount,
    entryCount,
    locale: locale || 'all',
  }, '获取成功')
})

/**
 * 切换 status（active <-> disabled）
 */
const toggleI18nOverrideStatus = withErrorHandling(async (event = {}, context, auth = {}) => {
  const { overrideId, status } = event
  if (!overrideId) {
    throw err('INVALID_PARAMS', '缺少 overrideId')
  }
  if (!ALLOWED_STATUS.includes(status)) {
    throw err('INVALID_PARAMS', '不支持的 status', { status, allowed: ALLOWED_STATUS })
  }

  const operator = auth.openid || auth.adminId || 'unknown'
  await db.collection(COLLECTION).doc(overrideId).update({
    data: { status, updatedBy: operator, updatedAt: db.serverDate() },
  })

  return handleSuccess({ _id: overrideId, status }, '状态已更新')
})

/**
 * Sprint 53: 导出全量 override 为 JSON（运营下载/迁移用）
 *
 * 入参：{ locale?: string, status?: string }
 * 返回：{ items: [{ key, locale, value, status, note, updatedAt, updatedBy }], count, exportedAt }
 *
 * 客户端使用：
 *   const res = await AdminService.exportI18nOverrides({})
 *   // res.data.items 即为可下载的 JSON 数组
 */
const exportI18nOverrides = withErrorHandling(async (event = {}) => {
  const { locale, status, limit = 1000 } = event
  const filter = {}
  if (locale && SUPPORTED_LOCALES.includes(locale)) { filter.locale = locale }
  if (status && ALLOWED_STATUS.includes(status)) { filter.status = status }

  const safeLimit = Math.min(2000, Math.max(1, parseInt(limit, 10) || 1000))

  const res = await db.collection(COLLECTION)
    .where(filter)
    .orderBy('key', 'asc')
    .limit(safeLimit)
    .get()

  const items = (res.data || []).map(d => ({
    key: d.key,
    locale: d.locale,
    value: d.value,
    status: d.status,
    note: d.note || '',
    updatedAt: d.updatedAt,
    updatedBy: d.updatedBy || '',
  }))

  return handleSuccess({
    items,
    count: items.length,
    exportedAt: db.serverDate(),
  }, `导出 ${items.length} 条`)
})

/**
 * Sprint 53: 找出缺失翻译的 key
 *
 * 算法：
 *   1. 拉取全量（active + disabled）override，按 key 分组
 *   2. 每个 key 已知 locale 集合 = 出现过该 key 的 locale
 *   3. 对 SUPPORTED_LOCALES 中未出现的 locale 标记为 missing
 *   4. 返回按 key 排序的 missing 列表
 *
 * 入参：{ baseLocale?: string }  // 用于显示参照文案（默认 zh-CN）
 * 返回：{ baseLocale, missingByLocale, totalMissing, totalKeys, truncated }
 *
 * M6：当文档数超过 SCAN_LIMIT 时返回 truncated=true，避免静默截断导致统计失真。
 *     全量扫描统计建议改用 aggregate group 管道（见 getI18nOverrideStats）。
 */
const findMissingTranslations = withErrorHandling(async (event = {}) => {
  const baseLocale = SUPPORTED_LOCALES.includes(event.baseLocale) ? event.baseLocale : 'zh-CN'

  const res = await db.collection(COLLECTION)
    .where({})
    .limit(SCAN_LIMIT)
    .get()

  const docs = res.data || []
  const truncated = docs.length >= SCAN_LIMIT

  // 按 key 分组
  const keyToLocales = {}
  for (const d of docs) {
    if (!d || !d.key || !d.locale) { continue }
    if (!keyToLocales[d.key]) { keyToLocales[d.key] = new Set() }
    keyToLocales[d.key].add(d.locale)
  }

  const totalKeys = Object.keys(keyToLocales).length
  const missingByLocale = {}
  for (const loc of SUPPORTED_LOCALES) { missingByLocale[loc] = [] }

  for (const [key, locales] of Object.entries(keyToLocales)) {
    for (const loc of SUPPORTED_LOCALES) {
      if (!locales.has(loc)) {
        missingByLocale[loc].push({
          key,
          availableIn: Array.from(locales),
        })
      }
    }
  }

  const totalMissing = Object.values(missingByLocale).reduce((acc, arr) => acc + arr.length, 0)

  return handleSuccess({
    baseLocale,
    totalKeys,
    totalMissing,
    missingByLocale,
    truncated,
  }, `扫描 ${totalKeys} 个 key，发现 ${totalMissing} 处缺失${truncated ? '（结果已截断，请使用 aggregate 或分页扫描）' : ''}`)
})

/**
 * Sprint 53: 统计 i18n 覆盖概览
 *
 * 入参：无
 * 返回：{ totalDocs, activeDocs, disabledDocs, uniqueKeys, byLocale, byStatus, lastUpdatedAt }
 *
 * M6：使用 aggregate 管道在数据库侧完成分组统计，
 *     避免 limit(2000) 静默截断导致统计结果失真。
 */
const getI18nOverrideStats = withErrorHandling(async () => {
  // 1. 按 status 分组计数
  const statusAgg = await db.collection(COLLECTION)
    .aggregate()
    .group({
      _id: '$status',
      count: $.sum(1),
    })
    .end()

  const byStatus = { active: 0, disabled: 0, other: 0 }
  let totalDocs = 0
  for (const item of (statusAgg.list || [])) {
    const cnt = item.count || 0
    totalDocs += cnt
    if (item._id === 'active') { byStatus.active = cnt }
    else if (item._id === 'disabled') { byStatus.disabled = cnt }
    else { byStatus.other += cnt }
  }

  // 2. 按 locale 分组计数
  const localeAgg = await db.collection(COLLECTION)
    .aggregate()
    .group({
      _id: '$locale',
      count: $.sum(1),
    })
    .end()

  const byLocale = {}
  for (const item of (localeAgg.list || [])) {
    if (item._id) { byLocale[item._id] = item.count || 0 }
  }

  // 3. 按 key 分组计数（同时得到 uniqueKeys）
  const keyAgg = await db.collection(COLLECTION)
    .aggregate()
    .group({
      _id: '$key',
      count: $.sum(1),
    })
    .end()

  const byKey = {}
  for (const item of (keyAgg.list || [])) {
    if (item._id) { byKey[item._id] = item.count || 0 }
  }

  // 4. 最近 updatedAt（取 max）
  const lastAgg = await db.collection(COLLECTION)
    .aggregate()
    .sort({ updatedAt: -1 })
    .limit(1)
    .end()

  const lastUpdatedAt = (lastAgg.list && lastAgg.list[0] && lastAgg.list[0].updatedAt) || null

  return handleSuccess({
    totalDocs,
    activeDocs: byStatus.active,
    disabledDocs: byStatus.disabled,
    uniqueKeys: Object.keys(byKey).length,
    byKey,
    byLocale,
    byStatus,
    lastUpdatedAt,
  }, '统计完成')
})

/**
 * 初始化 i18n_overrides 集合与索引
 *
 * 由于 CloudBase 在集合不存在时 createIndex 会报错，本函数采用如下策略：
 *   1. 尝试 createIndex
 *   2. 若报"集合不存在"（-502001 / DATABASE_COLLECTION_NOT_EXIST），
 *      先 add 一条占位文档触发集合自动创建，再重试 createIndex，最后删除占位文档
 *   3. 若报"索引已存在"，标记为 exists，不视为错误
 *
 * 权限：仅 super_admin 可调用（在 adminService/index.ts 中声明）
 *
 * 返回：{ results: [{ indexName, status, message? }], collectionCreated }
 */
const initI18nOverrideIndexes = withErrorHandling(async () => {
  const indexes = [
    {
      indexName: 'idx_key_locale_unique',
      keys: [
        { Name: 'key', Direction: '1' },
        { Name: 'locale', Direction: '1' },
      ],
      unique: true,
    },
    {
      indexName: 'idx_status_locale_updatedAt',
      keys: [
        { Name: 'status', Direction: '1' },
        { Name: 'locale', Direction: '1' },
        { Name: 'updatedAt', Direction: '-1' },
      ],
      unique: false,
    },
  ]

  const results = []
  let collectionCreated = false

  /**
   * 确保 i18n_overrides 集合存在：
   * CloudBase 集合在第一次写入文档时自动创建，因此 add 一条占位文档即可
   */
  async function ensureCollectionExists() {
    const placeholderId = generateId('i18n_init', 'system')
    try {
      await db.collection(COLLECTION).add({
        data: {
          _id: placeholderId,
          key: '__init_placeholder__',
          locale: 'zh-CN',
          value: '',
          status: 'disabled',
          note: 'init placeholder, will be removed',
          createdBy: 'system',
          createdAt: db.serverDate(),
          updatedAt: db.serverDate(),
        },
      })
      collectionCreated = true
      // 立即删除占位文档（集合已创建）
      try {
        await db.collection(COLLECTION).doc(placeholderId).remove()
      } catch (_e) {
        // 删除失败不阻塞，占位文档不影响业务（status=disabled 不会被 fetchActive 拉到）
        logger.warn('initI18nOverrideIndexes.placeholder_remove_failed', { placeholderId })
      }
    } catch (e) {
      // 集合已存在时 add 会成功（不影响）；其他错误（如权限）抛出
      // -502001 在此处也可能表示集合已存在但 _id 冲突，忽略
      if (!isDuplicateKeyError(e)) {
        throw e
      }
    }
  }

  for (const idx of indexes) {
    try {
      try {
        await db.collection(COLLECTION).createIndex({
          index: { keys: idx.keys },
          name: idx.indexName,
          ...(idx.unique ? { unique: true } : {}),
        })
        results.push({ indexName: idx.indexName, status: 'ok' })
      } catch (e) {
        // 集合不存在：先创建集合再重试
        const msg = (e && e.message) || ''
        const errCode = e && e.errCode
        const collectionMissing =
          errCode === -502001 ||
          errCode === -501019 ||
          /collection.*(not.*exist|does.*not.*exist)|DATABASE_COLLECTION_NOT_EXIST/i.test(msg)

        if (!collectionMissing) {
          // 非集合缺失错误：可能是"索引已存在"或其他
          if (/already.*exist|index.*exist/i.test(msg)) {
            results.push({ indexName: idx.indexName, status: 'exists' })
          } else {
            results.push({ indexName: idx.indexName, status: 'error', message: msg })
          }
          continue
        }

        // 集合不存在 → 创建集合 → 重试
        logger.info('initI18nOverrideIndexes.creating_collection', { indexName: idx.indexName })
        await ensureCollectionExists()

        // 重试 createIndex
        await db.collection(COLLECTION).createIndex({
          index: { keys: idx.keys },
          name: idx.indexName,
          ...(idx.unique ? { unique: true } : {}),
        })
        results.push({ indexName: idx.indexName, status: 'ok' })
      }
    } catch (e) {
      const msg = (e && e.message) || ''
      if (/already.*exist|index.*exist/i.test(msg)) {
        results.push({ indexName: idx.indexName, status: 'exists' })
      } else {
        results.push({ indexName: idx.indexName, status: 'error', message: msg })
      }
    }
  }

  return handleSuccess(
    { results, collectionCreated },
    `索引初始化完成：${results.filter(r => r.status === 'ok').length} 创建 / ${results.filter(r => r.status === 'exists').length} 已存在 / ${results.filter(r => r.status === 'error').length} 失败${collectionCreated ? '（集合已自动创建）' : ''}`
  )
})

module.exports = {
  COLLECTION,
  SUPPORTED_LOCALES,
  listI18nOverrides,
  getI18nOverride,
  upsertI18nOverride,
  batchUpsertI18nOverrides,
  deleteI18nOverride,
  fetchActiveOverrides,
  toggleI18nOverrideStatus,
  exportI18nOverrides,
  findMissingTranslations,
  getI18nOverrideStats,
  initI18nOverrideIndexes,
  _logger: logger, // 仅供测试/调试使用
}
