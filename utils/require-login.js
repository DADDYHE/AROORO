/**
 * requireLogin - 统一强制登录守卫
 *
 * 设计目标：一处封装所有「需登录才能操作」的入口，避免散落各处、漏加守卫、
 * 或登录后无法回跳原页面。保持品牌登录页（/subpackages/profile/login/index）
 * 唯一登录入口，登录后自动回跳登录前浏览的页面。
 *
 * 用法：
 *   const { requireLogin } = require('../../../utils/require-login')
 *   async onBuy() {
 *     if (!(await requireLogin())) return   // 未登录：已记录来源页并跳转品牌登录页
 *     // 已登录：继续原操作（下单/收藏/报名…）
 *   }
 *
 * 行为：
 *   - 已登录        → resolve(true)，调用方直接继续原操作
 *   - 未登录        → 记录来源页 (route + options) 到 globalData.loginReturnTo
 *                     → 若页面实现 showLoginPrompt() 则弹品牌登录提醒(login-prompt)，
 *                       否则直接跳品牌登录页
 *                     → resolve(false)
 * 登录成功后由 login/index.js 自动回跳来源页并触发 _notifySessionRestored 刷新。
 *
 * 回跳为什么可靠：主路径用 navigateBack（原页面在栈中，options/data 状态零丢失）；
 * 仅当登录页非 navigateTo 而来（极罕见独立打开）时，用 redirectTo 携带完整 options 兜底。
 */

const { authService } = require('../services/AuthService')

function _getCurPage() {
  const pages = getCurrentPages()
  return pages.length ? pages[pages.length - 1] : null
}

function _recordReturnTo() {
  const app = getApp()
  if (!app || !app.globalData) return
  if (app.globalData.loginReturnTo) return // 幂等：已记录则保留
  const cur = _getCurPage()
  if (cur && cur.route) {
    app.globalData.loginReturnTo = {
      route: '/' + cur.route,
      options: cur.options || {},
    }
    console.log('[requireLogin] 记录来源页:', app.globalData.loginReturnTo)
  }
}

/**
 * 强制登录守卫
 * @param {{prompt?: boolean}} [opts]
 *   prompt: 是否优先弹 login-prompt 品牌提醒（需页面实现 showLoginPrompt），默认 true
 * @returns {Promise<boolean>} true=已登录可直接操作；false=未登录（已引导登录）
 */
function requireLogin(opts = {}) {
  const { prompt = true } = opts
  if (authService.isLoggedIn()) {
    return Promise.resolve(true)
  }
  _recordReturnTo()
  const cur = _getCurPage()
  if (prompt && cur && typeof cur.showLoginPrompt === 'function') {
    cur.showLoginPrompt()
  } else {
    authService.startLogin()
  }
  return Promise.resolve(false)
}

module.exports = { requireLogin }
