/**
 * Sprint 23: 客户端 i18n 热覆盖
 *
 * 目标：
 *   - 启动 / onShow 时拉取云端 active 文案覆盖
 *   - 应用到 i18n.applyCustomOverrides
 *   - 让运营能在管理后台修改文案后，客户端下次拉取即生效
 *
 * 用法（在 app.js / 单页面）：
 *   const i18nHot = require('./utils/i18n-hot-update')
 *
 *   onLaunch() {
 *     // 拉取全量覆盖
 *     i18nHot.refresh({ locale: 'zh-CN' })
 *       .then(({ applied, count }) => console.log('hot update applied', applied, 'count:', count))
 *       .catch(e => console.warn('hot update failed', e))
 *   }
 *
 *   // 单页面 onShow 时拉取
 *   onShow() {
 *     i18nHot.refreshIfStale(10 * 60 * 1000) // 10 分钟内不重复拉
 *   }
 *
 * 降级：
 *   - 云函数未部署 / 集合不存在 → 静默忽略
 *   - 网络错误 → 静默忽略，使用本地字典
 *   - 拉取成功但 count=0 → 保留之前的覆盖（不清空）
 */

const i18n = require('./i18n')

const STORAGE_KEY_LAST_FETCH = 'app_i18n_hot_last_fetch'
const STORAGE_KEY_COUNT = 'app_i18n_hot_count'

let _cloud = null
try {
  _cloud = require('wx-server-sdk')
} catch (e) {
  // 测试环境 / 非小程序环境：直接降级
  _cloud = null
}

let _wxCloud = null
try {
  if (typeof wx !== 'undefined' && wx.cloud && typeof wx.cloud.callFunction === 'function') {
    _wxCloud = wx.cloud
  }
} catch (e) {
  _wxCloud = null
}

let _lastFetchAt = 0
let _inFlight = null

function _getWxCloud() {
  try {
    if (typeof wx !== 'undefined' && wx && wx.cloud && typeof wx.cloud.callFunction === 'function') {
      return wx.cloud
    }
  } catch (e) { /* ignore */ }
  return null
}

function _getStorage(key) {
  try {
    if (typeof wx !== 'undefined' && wx.getStorageSync) {return wx.getStorageSync(key)}
  } catch (e) { /* ignore */ }
  return null
}

function _setStorage(key, val) {
  try {
    if (typeof wx !== 'undefined' && wx.setStorageSync) {wx.setStorageSync(key, val)}
  } catch (e) { /* ignore */ }
}

/**
 * 拉取全量或指定 locale 的 active 覆盖，并应用到 i18n
 * @param {object} [opts]
 * @param {string} [opts.locale] - 默认使用 i18n.getLocale()
 * @param {boolean} [opts.force] - 强制刷新，忽略节流
 * @returns {Promise<{applied: boolean, count: number, overrides: object, error?: string}>}
 */
async function refresh(opts = {}) {
  const wxCloud = _getWxCloud()
  if (!wxCloud) {
    return { applied: false, count: 0, overrides: {}, error: 'no_wx_cloud' }
  }

  const locale = opts.locale || i18n.getLocale()
  if (_inFlight) {return _inFlight}

  _inFlight = (async () => {
    try {
      const res = await wxCloud.callFunction({
        name: 'i18nOverride',
        data: { action: 'fetchActive', locale },
      })
      const payload = res && res.result
      if (!payload || payload.code !== 0 || !payload.data) {
        return { applied: false, count: 0, overrides: {}, error: (payload && payload.message) || 'invalid_payload' }
      }
      const overrides = (payload.data && payload.data.overrides) || {}
      const count = (payload.data && payload.data.count) || Object.keys(overrides).length

      // 应用到 i18n
      i18n.applyCustomOverrides(overrides)
      _lastFetchAt = Date.now()
      _setStorage(STORAGE_KEY_LAST_FETCH, _lastFetchAt)
      _setStorage(STORAGE_KEY_COUNT, count)

      return { applied: true, count, overrides }
    } catch (e) {
      return { applied: false, count: 0, overrides: {}, error: (e && e.message) || (e && e.errMsg) || 'request_failed' }
    } finally {
      _inFlight = null
    }
  })()

  return _inFlight
}

/**
 * 节流刷新：距上次成功 refresh 超过 maxAgeMs 才再次拉取
 * @param {number} maxAgeMs - 默认 10 分钟
 */
async function refreshIfStale(maxAgeMs = 10 * 60 * 1000) {
  const now = Date.now()
  if (now - _lastFetchAt < maxAgeMs) {
    return { applied: false, count: 0, reason: 'fresh' }
  }
  return refresh()
}

/**
 * 启动时同步初始化（不阻塞 onLaunch）
 *  - 读 storage 中上次拉取时间
 *  - 如果超过 24 小时没有拉取，立刻异步拉取
 */
function bootstrapOnLaunch(opts = {}) {
  const last = _getStorage(STORAGE_KEY_LAST_FETCH) || 0
  _lastFetchAt = last
  const now = Date.now()
  if (now - last > (opts.maxAgeMs || 24 * 60 * 60 * 1000)) {
    // 异步触发，失败/超时都忽略
    refresh().catch(() => {})
  }
}

/**
 * 重置状态（测试用）
 */
function _reset() {
  _lastFetchAt = 0
  _inFlight = null
}

module.exports = {
  refresh,
  refreshIfStale,
  bootstrapOnLaunch,
  _reset,
  // 内部状态（测试用）
  _getLastFetchAt: () => _lastFetchAt,
}
