/**
 * i18nOverride 云函数（Sprint 23）
 *
 * 目标：
 *   - 客户端匿名拉取 active 文案覆盖
 *   - 与 utils/i18n.js 的 applyCustomOverrides / loadFromCdn 衔接
 *   - 不暴露写入接口（写入由 adminService 接管，需要 partner 权限）
 *
 * 调用：
 *   wx.cloud.callFunction({
 *     name: 'i18nOverride',
 *     data: { action: 'fetchActive', locale: 'en-US' }  // locale 可选
 *   })
 *
 * 返回：{ code, message, data: { overrides: { KEY: { 'en-US': 'New Text' } } } }
 */
const { createLogger } = require('../common/logger')
// Sprint 31: 统一使用 handleSuccess / handleError 替代自定义 ok/fail
const { handleSuccess, handleError } = require('../common/utils')

let cloudbase
try {
  cloudbase = require('wx-server-sdk')
  cloudbase.init({ env: cloudbase.DYNAMIC_CURRENT_ENV })
} catch (e) {
  // 单元测试环境没有 wx-server-sdk，给出降级
  cloudbase = null
}

const logger = createLogger('i18nOverride')

const COLLECTION = 'i18n_overrides'
const SUPPORTED_LOCALES = ['zh-CN', 'en-US', 'ja-JP']

async function fetchActive(event = {}) {
  if (!cloudbase) {
    return handleError(new Error('cloudbase sdk unavailable'), 'cloudbase sdk unavailable', 5001)
  }
  const { locale } = event
  const db = cloudbase.database()

  const filter = { status: 'active' }
  if (locale && SUPPORTED_LOCALES.includes(locale)) {
    filter.locale = locale
  }

  let data = []
  try {
    const res = await db.collection(COLLECTION)
      .where(filter)
      .limit(200)
      .get()
    data = res.data || []
  } catch (e) {
    // 集合不存在：返回空覆盖（兼容未初始化场景）
    logger.warn('fetchActive.collection_missing_or_error', e && e.message)
    return handleSuccess({ overrides: {}, count: 0, locale: locale || 'all' }, '获取成功（空覆盖）')
  }

  const overrides = {}
  for (const doc of data) {
    if (!doc || !doc.key || !doc.locale) {continue}
    if (!overrides[doc.key]) {overrides[doc.key] = {}}
    overrides[doc.key][doc.locale] = doc.value
  }

  return handleSuccess({ overrides, count: Object.keys(overrides).length, locale: locale || 'all' }, '获取成功')
}

const handlers = {
  fetchActive,
  // 兼容别名（与 adminService 命名对齐）
  fetchActiveOverrides: fetchActive,
}

exports.main = async event => {
  try {
    const { action } = event || {}
    if (!action || !handlers[action]) {
      return handleError(new Error(`未知 action: ${action || '<empty>'}`), `未知 action: ${action || '<empty>'}`, 4001)
    }
    const result = await handlers[action](event)
    if (result && typeof result === 'object' && 'code' in result) {return result}
    return handleSuccess(result, '操作成功')
  } catch (e) {
    logger.error('main', e)
    return handleError(e, e && e.message ? e.message : 'unknown error', e && e.code ? e.code : 5001)
  }
}
