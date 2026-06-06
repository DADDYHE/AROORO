/**
 * Sprint 17: 页面级 i18n 助手
 *
 * 目标：
 *   - 让 Page() 内部直接用 t(KEY) / showToast(KEY) / showError(err)
 *   - 自动适配当前 locale（来自 app.globalData.locale）
 *   - 减少重复样板：toast: t('KEY') → showToast: t(KEY)
 *
 * 用法：
 *   const pageI18n = require('../../utils/page-i18n')
 *
 *   Page({
 *     ...pageI18n.mixin(),  // 注入 toast() / error() / $t() 快捷方法
 *     onSubmit() {
 *       this.toast('OPERATION_SUCCESS')  // 替代 wx.showToast({ title: t('OPERATION_SUCCESS') })
 *       this.error('NETWORK_ERROR')       // 替代 wx.showToast({ title: t('NETWORK_ERROR'), icon: 'none' })
 *     }
 *   })
 *
 *   // 或者非 mixin 模式
 *   const { toast, error, $t } = pageI18n.create(getApp())
 *   toast('OPERATION_SUCCESS')
 *
 * 设计取舍：
 *   - mixin 自动把 t 注入到 data，wxml 可以直接 {{ t.OPERATION_SUCCESS }}
 *   - toast() 默认 icon: 'success'，error() 默认 icon: 'none'
 *   - 缺翻译时不抛错，原 key 作为兜底
 */

const i18n = require('./i18n')

const DEFAULT_LOCALES = ['zh-CN', 'en-US', 'ja-JP']

/**
 * 把 i18n 字典扁平化到 data 上（wxml 友好）
 */
function buildTMap(locale) {
  const t = {}
  // 错误码
  for (const code of Object.keys(i18n.ERROR_I18N)) {
    t[code] = i18n.getErrorMessage(code, locale)
  }
  // 业务文案
  for (const key of Object.keys(i18n.BIZ_I18N)) {
    if (t[key] === undefined) {
      t[key] = i18n.t(key, locale)
    }
  }
  return t
}

/**
 * 创建页面级 i18n 实例
 *
 * @param {object} app - getApp() 返回值
 * @returns {object} { t, getLocale, setLocale, showToast, showError, bindTData }
 */
function create(app) {
  const getLocale = () => (app && app.globalData && app.globalData.locale) || i18n.getLocale()
  const setLocale = loc => {
    i18n.setLocale(loc)
    if (app && app.globalData) {app.globalData.locale = loc}
  }
  const t = key => i18n.t(key, getLocale())
  const getErrorMessage = code => i18n.getErrorMessage(code, getLocale())
  const showToast = (key, opts = {}) => {
    wx.showToast({
      title: t(key),
      icon: 'success',
      duration: 2000,
      ...opts,
    })
  }
  const showError = (key, opts = {}) => {
    wx.showToast({
      title: t(key),
      icon: 'none',
      duration: 2000,
      ...opts,
    })
  }
  /**
   * 生成 wxml 可用的 t map
   *  - setData({ t: bindTData() })
   */
  const bindTData = () => buildTMap(getLocale())
  return { t, getErrorMessage, getLocale, setLocale, showToast, showError, bindTData, i18n }
}

/**
 * 页面 mixin（推荐用法）
 *
 * 用法：
 *   const pageI18n = require('../../utils/page-i18n')
 *   Page({
 *     ...pageI18n.mixin(),
 *     onLoad() {
 *       this.toast('OPERATION_SUCCESS')
 *       this.setData({ t: this.$t() })
 *     }
 *   })
 */
function mixin() {
  return {
    data: {
      t: buildTMap(i18n.getLocale()),
    },
    onLoad() {
      // 自动更新 t map（locale 可能在 app 启动后变化）
      try {
        const app = typeof getApp === 'function' ? getApp() : null
        const locale = (app && app.globalData && app.globalData.locale) || i18n.getLocale()
        this.setData({ t: buildTMap(locale) })
      } catch (e) {
        // 兜底：使用模块初始化时的 locale
      }
    },
    /**
     * 业务文案翻译
     */
    $t(key) { return i18n.t(key, this._getLocale()) },
    /**
     * 错误码 → 文案
     */
    $em(code) { return i18n.getErrorMessage(code, this._getLocale()) },
    /**
     * 显示成功 toast（默认 icon: success）
     * @param {string|Function} keyOrFn - 业务常量 key，或返回文案的函数
     * @param {object} [opts] - 透传到 wx.showToast 的其他参数
     */
    toast(keyOrFn, opts = {}) {
      const title = typeof keyOrFn === 'function' ? keyOrFn() : this.$t(keyOrFn)
      wx.showToast({
        title,
        icon: 'success',
        duration: 2000,
        ...opts,
      })
    },
    /**
     * 显示错误 toast（默认 icon: none）
     * @param {string|Function} keyOrFn - 业务常量 key，或返回文案的函数
     * @param {object} [opts] - 透传到 wx.showToast 的其他参数
     */
    error(keyOrFn, opts = {}) {
      const title = typeof keyOrFn === 'function' ? keyOrFn() : this.$t(keyOrFn)
      wx.showToast({
        title,
        icon: 'none',
        duration: 2000,
        ...opts,
      })
    },
    /**
     * 显示动态错误 toast：text || fallbackKey
     * - text 优先（来自 err.message 等运行时字段）
     * - 缺省 fallback 到 i18n key
     * @param {string} text - 动态文本（可能为空）
     * @param {string} fallbackKey - 兜底 i18n key
     * @param {object} [opts]
     */
    errorDynamic(text, fallbackKey, opts = {}) {
      const title = (text && String(text)) || this.$t(fallbackKey)
      wx.showToast({
        title,
        icon: 'none',
        duration: 2000,
        ...opts,
      })
    },
    /**
     * 显示动态成功 toast：text || fallbackKey
     */
    toastDynamic(text, fallbackKey, opts = {}) {
      const title = (text && String(text)) || this.$t(fallbackKey)
      wx.showToast({
        title,
        icon: 'success',
        duration: 2000,
        ...opts,
      })
    },
    /**
     * 显示 i18n modal 对话框
     * - 支持 titleKey / contentKey 自动查 i18n
     * - 支持 success 回调：参数为 (confirmed, modalRes)
     * - 兼容旧字段：title / content（直接文本）
     * @param {object} opts
     * @param {string} [opts.titleKey] - 标题 i18n key
     * @param {string} [opts.contentKey] - 内容 i18n key
     * @param {string} [opts.title] - 标题直接文本
     * @param {string} [opts.content] - 内容直接文本
     * @param {boolean} [opts.showCancel=true]
     * @param {string} [opts.cancelTextKey] - 取消按钮 i18n key
     * @param {string} [opts.confirmTextKey] - 确定按钮 i18n key
     * @param {function} [opts.success] - (confirmed) => void
     */
    showModal(opts = {}) {
      const { titleKey, contentKey, title, content, showCancel, cancelTextKey, confirmTextKey, success, ...rest } = opts
      const finalTitle = titleKey ? this.$t(titleKey) : title || ''
      const finalContent = contentKey ? this.$t(contentKey) : content || ''
      const finalOpts = {
        title: finalTitle,
        content: finalContent,
        ...(showCancel !== undefined ? { showCancel } : {}),
        ...(cancelTextKey ? { cancelText: this.$t(cancelTextKey) } : {}),
        ...(confirmTextKey ? { confirmText: this.$t(confirmTextKey) } : {}),
        ...rest,
        success(res) {
          if (typeof success === 'function') {
            success(!!(res && res.confirm), res)
          }
        },
      }
      wx.showModal(finalOpts)
    },
    /**
     * 切换 locale 并刷新 t map
     */
    setLocale(loc) {
      i18n.setLocale(loc)
      const app = typeof getApp === 'function' ? getApp() : null
      if (app && app.globalData) {app.globalData.locale = loc}
      this.setData({ t: buildTMap(loc) })
    },
    /**
     * 内部：从 app / module 推断 locale
     */
    _getLocale() {
      try {
        const app = typeof getApp === 'function' ? getApp() : null
        return (app && app.globalData && app.globalData.locale) || i18n.getLocale()
      } catch (e) {
        return i18n.getLocale()
      }
    },
  }
}

module.exports = {
  create,
  mixin,
  buildTMap,
  DEFAULT_LOCALES,
}
