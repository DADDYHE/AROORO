const __i18n = require('../../utils/i18n.js')
const __pageI18n = require('../../utils/page-i18n.js')
const __i18nT = (k) => __i18n.t(k, __i18n.getLocale())
Component({
  properties: {
    visible: { type: Boolean, value: false },
  },
  observers: {
    /* 重新打开时清除上一次退场残留的 leaving 状态：
       否则 root-portal 复现时直接渲染退场终态（opacity 0），弹层"打开却看不见" */
    visible(v) {
      if (v && this.data._leaving) this.setData({ _leaving: false })
    },
  },

  data: {
    t: __pageI18n.buildTMap(__i18n.getLocale()),
    _leaving: false,
  },

  methods: {
    onLogin() {
      this._startLeave(() => {
        const { authService } = require('../../services/AuthService')
        this.triggerEvent('close')
        authService.startLogin()
      })
    },

    onClose() {
      this._startLeave(() => {
        this.triggerEvent('close')
      })
    },

    // 优雅退场：播放离场动画后通知父组件移除。
    // _leaving 保持 true 直到节点被 wx:if 销毁 —— 若中途重置，
    // 退场 class 被移除会让弹层闪回完整显示态一帧再消失（表现为闪烁）。
    _startLeave(callback) {
      if (this.data._leaving) return
      this.setData({ _leaving: true })
      setTimeout(callback, 320)
    },
  },
})
