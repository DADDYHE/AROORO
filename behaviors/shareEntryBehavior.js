/**
 * behaviors/shareEntryBehavior.js
 *
 * 分享进入自动引导登录行为
 *
 * 用途：
 *   - 检测用户是否通过分享链接进入且未登录
 *   - 自动弹出友好的登录引导弹窗（复用首页登录卡片样式）
 *   - 登录完成后自动恢复用户操作
 *
 * 用法：
 *   // JSON 中注册组件
 *   { "usingComponents": { "login-prompt": "/components/login-prompt/login-prompt" } }
 *
 *   // WXML 中使用
 *   <login-prompt visible="{{showLoginPrompt}}" bind:close="onLoginPromptClose" />
 *
 *   // JS 中引入 behavior
 *   Page({
 *     behaviors: [shareEntryBehavior],
 *     // ...
 *   })
 */

const shareEntryBehavior = Behavior({
  lifetimes: {
    attached() {
      this._checkShareEntry()
    },
  },

  pageLifetimes: {
    show() {
      this._checkShareEntry()
    },
  },

  methods: {
    _checkShareEntry() {
      const app = getApp()
      if (!app || !app.globalData) return
      if (app.globalData.isLoggedIn) return
      if (!app.globalData.pendingInviterId) return
      if (this._shareEntryShown) return
      this._shareEntryShown = true

      setTimeout(() => {
        this.setData({ showLoginPrompt: true })
      }, 600)
    },

    onLoginPromptClose() {
      this.setData({ showLoginPrompt: false })
    },
  },
})

module.exports = shareEntryBehavior
