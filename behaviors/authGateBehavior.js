/**
 * authGateBehavior.js - 全站强制登录门（2026-09-10）
 *
 * 规则（与产品约定一致）：
 *   1. tabBar 页：放行浏览（页内动作仍由 requireLogin 触发弹层）
 *   2. 公开展示类页面（OPEN_PAGES）：放行只读浏览，动作才拦
 *      —— 商品/活动/团购/家庭/服务 详情页属分享落地页，强制登录会砍掉传播转化
 *   3. 其余页面：未登录进入即弹 login-prompt 品牌登录弹层
 *      —— 关闭弹层 = 放弃 → 自动返回（栈底则切回首页 tab），不留「无身份空态页」
 *   4. 分享卡片进入（globalData.pendingInviterId 有值）：任何页（含 tab 页）都直接弹层
 *      —— 沿用原 shareEntryBehavior 行为；登录后 navigateBack 回落地页，页内 onShow 重拉数据
 *
 * 与 requireLogin 的关系：
 *   utils/require-login.js 检测页面是否实现 showLoginPrompt()，本 behavior 正好提供 →
 *   所有挂载本 behavior 的页面，其动作级守卫（下单/报名/领券…）自动获得弹层能力，无需逐页改造。
 *
 * 接入三件套（缺一不可）：
 *   json: "usingComponents": { "login-prompt": "/components/login-prompt/login-prompt" }
 *   wxml: <login-prompt visible="{{showLoginPrompt}}" bind:close="onLoginPromptClose" />
 *   js:   behaviors: [..., authGateBehavior]
 */

const TAB_PAGES = [
  'pages/home/index',
  'pages/boarding/index',
  'pages/discover/index',
  'pages/service/index',
  'pages/profile/index',
]

// 公开展示/浏览类：放行只读（含已确认的分享落地页；动作层由 requireLogin 拦截）
const OPEN_PAGES = [
  'pages/group-detail/index',              // 团购详情（分享落地）
  'subpackages/booking/host-detail',       // 寄养家庭详情（分享落地）
  'subpackages/activity/detail',           // 活动详情（分享落地）
  'subpackages/mall/product-detail',       // 商品详情（分享落地）
  'subpackages/feeding/service-detail',    // 上门服务详情（分享落地）
  'subpackages/mall/product-list',         // 商品列表（购物浏览）
  'subpackages/activity/list',             // 活动列表（浏览）
  'subpackages/activity/map-view',         // 活动地图（浏览辅助）
  'subpackages/other/video-list/index',    // 宠团团视频流（浏览）
  'subpackages/profile/privacy/privacy',   // 隐私政策（合规要求可读）
  'subpackages/profile/agreement/agreement', // 用户协议（合规要求可读）
  'subpackages/profile/about/about',       // 关于我们（运营内容）
]

// 不参与登录门：程序性/登录流程页
const EXCLUDED_PAGES = [
  'pages/splash/index',                    // 启动首屏海报（程序性，立即离开）
  'subpackages/profile/login/index',       // 登录页本身（不能弹「请登录」）
]

const authGateBehavior = Behavior({
  data: {
    showLoginPrompt: false,
  },

  pageLifetimes: {
    show() {
      this._authGateOnShow()
    },
  },

  methods: {
    _authGateOnShow() {
      const app = getApp()
      if (!app || !app.globalData) { return }
      const route = this.route || ''
      if (EXCLUDED_PAGES.indexOf(route) >= 0) { return }
      const { authService } = require('../services/AuthService')

      if (authService.isLoggedIn()) {
        // 登录恢复：收起可能残留的弹层
        if (this.data.showLoginPrompt) { this.setData({ showLoginPrompt: false }) }
        this._authGateShown = false
        return
      }

      const fromShare = !!app.globalData.pendingInviterId
      // 分享进入：任何页都弹（含 tab 页）；否则开放页（tab/公开浏览）放行
      if (!fromShare && this._isAuthOpenPage(route)) { return }
      if (this._authGateShown) { return }
      this._authGateShown = true
      // 分享进入沿用 600ms 延时（等落地页首屏渲染后再弹，视觉更稳）；其余场景立即弹
      setTimeout(() => {
        if (!this.data.showLoginPrompt) { this.setData({ showLoginPrompt: true }) }
      }, fromShare ? 600 : 0)
    },

    _isAuthOpenPage(route) {
      return TAB_PAGES.indexOf(route) >= 0 || OPEN_PAGES.indexOf(route) >= 0
    },

    /** 供 utils/require-login.js 调用（动作级守卫 → 弹层而非跳页） */
    showLoginPrompt() {
      if (!this.data.showLoginPrompt) { this.setData({ showLoginPrompt: true }) }
    },

    /** 关闭弹层：开放页停留；受限页未登录 → 自动返回（栈底切回首页 tab） */
    onLoginPromptClose(e) {
      const reason = e && e.detail && e.detail.reason
      const { authService } = require('../services/AuthService')
      this.setData({ showLoginPrompt: false })
      this._authGateShown = false
      /* 用户点「立即登录」：只关弹层、绝不返回/跳首页 —— 登录页跳转由
         startLogin 接管（其内部已记录 loginReturnTo，登录成功后回跳本页）。
         此前的竞态：close 先于 startLogin 同步执行 → 此处未登录 → 栈底单页
         被 switchTab 回首页，吞掉了随后的登录页跳转 */
      if (reason === 'login') { return }
      if (authService.isLoggedIn()) { return }
      const route = this.route || ''
      if (this._isAuthOpenPage(route)) { return }
      // 导航锁：startLogin 的登录页跳转进行中时，绝不发起第二个导航（返回/switchTab），
      // 否则两个导航竞争会把用户甩到首页（分享冷启动 + 分包未预热时必现）
      const app2 = getApp()
      if (app2 && app2.globalData && app2.globalData.__navLock) {
        console.warn('[authGate] 关闭返回被导航锁拦截（登录页跳转进行中）:', route)
        return
      }
      const pages = getCurrentPages()
      console.warn('[authGate] 关闭触发返回:', route, '| 栈深:', pages.length)
      if (pages.length > 1) {
        wx.navigateBack()
      } else {
        wx.switchTab({ url: '/pages/home/index' })
      }
    },
  },
})

module.exports = authGateBehavior
