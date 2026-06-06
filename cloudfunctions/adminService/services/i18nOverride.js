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
 */
const { handleSuccess, generateId, initCloud } = require('../common/utils')
const { createLogger } = require('../common/logger')
const { withErrorHandling, err } = require('../common/errors')

const { db } = initCloud()
const logger = createLogger('i18nOverrideService')

const COLLECTION = 'i18n_overrides'
const SUPPORTED_LOCALES = ['zh-CN', 'en-US', 'ja-JP']
const ALLOWED_STATUS = ['active', 'disabled']

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
 */
const listI18nOverrides = withErrorHandling(async (event = {}) => {
  const { prefix, status, page = 1, pageSize = 50 } = event
  const filter = {}
  if (prefix && typeof prefix === 'string') {
    // 简单前缀匹配（云函数侧通过正则进行精确控制）
    filter.key = db.RegExp({ regexp: `^${prefix}`, options: 'i' })
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

  // 不存在 → 插入
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
  await db.collection(COLLECTION).add({ data: doc })
  return handleSuccess({ ...doc, action: 'created' }, '创建成功')
})

/**
 * 批量 upsert：用于一次性导入 / 翻译
 * 入参：{ items: [{ key, locale, value, status, note }, ...] }
 */
const batchUpsertI18nOverrides = withErrorHandling(async (event = {}, context, auth = {}) => {
  const { items } = event
  if (!Array.isArray(items) || items.length === 0) {
    throw err('INVALID_PARAMS', 'items 必须为非空数组', { type: typeof items })
  }
  if (items.length > 200) {
    throw err('INVALID_PARAMS', '单次最多 200 条', { length: items.length })
  }

  const operator = auth.openid || auth.adminId || 'unknown'
  const now = db.serverDate()
  const results = { created: 0, updated: 0, skipped: 0, errors: [] }

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
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
      } else {
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
      }
    } catch (e) {
      results.skipped++
      results.errors.push({ index: i, key: cleanKey, locale: cleanLocale, error: e.message })
    }
  }

  return handleSuccess(results, `批量完成：新建 ${results.created} 条 / 更新 ${results.updated} 条 / 跳过 ${results.skipped} 条`)
})

/**
 * 删除单条 override
 */
const deleteI18nOverride = withErrorHandling(async (event = {}) => {
  const { overrideId } = event
  if (!overrideId) {
    throw err('INVALID_PARAMS', '缺少 overrideId')
  }
  await db.collection(COLLECTION).doc(overrideId).remove()
  return handleSuccess({ _id: overrideId }, '删除成功')
})

/**
 * 拉取 active 的全部 override（供客户端热更新）
 * 入参：{ locale?: 'zh-CN' | 'en-US' | 'ja-JP' } - 不传则返回所有 locale
 *
 * 返回结构：{ overrides: { KEY: { 'en-US': 'New Text' } } }
 * 与 utils/i18n.js 的 applyCustomOverrides 入参直接对应
 */
const fetchActiveOverrides = withErrorHandling(async (event = {}) => {
  const { locale } = event
  const filter = { status: 'active' }
  if (locale && SUPPORTED_LOCALES.includes(locale)) {
    filter.locale = locale
  }

  // 单次最多 200 条；客户端首屏 / 启动时调用一次
  const res = await db.collection(COLLECTION)
    .where(filter)
    .limit(200)
    .get()

  const overrides = {}
  for (const doc of res.data || []) {
    if (!overrides[doc.key]) {overrides[doc.key] = {}}
    overrides[doc.key][doc.locale] = doc.value
  }

  return handleSuccess({ overrides, count: Object.keys(overrides).length, locale: locale || 'all' }, '获取成功')
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
  _logger: logger, // 仅供测试/调试使用
}
