const __i18n = require('../../utils/i18n.js')
const __pageI18n = require('../../utils/page-i18n.js')
const __i18nT = (k) => __i18n.t(k, __i18n.getLocale())
Component({
  properties: {
    visible: { type: Boolean, value: false },
  },

  data: {
  ...__pageI18n.buildTMap(__i18n.getLocale()),
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

    // 优雅退场：先播放离场动画，再通知父组件移除
    _startLeave(callback) {
      if (this.data._leaving) return
      this.setData({ _leaving: true })
      setTimeout(() => {
        this.setData({ _leaving: false })
        callback()
      }, 320)
    },
  },
})
