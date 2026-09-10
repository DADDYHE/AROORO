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
  },

  methods: {
    onLogin() {
      /* close 带 reason='login'：父级（authGate）只关弹层、不做返回/跳首页，
         由 startLogin 的登录页跳转接管（startLogin 已记录 loginReturnTo 供登录后回跳） */
      this.triggerEvent('close', { reason: 'login' })
      const { authService } = require('../../services/AuthService')
      authService.startLogin()
    },

    onClose() {
      // 立即通知父组件移除（无退场动画）：Skyline 下 root-portal 内的
      // 退场动画与节点销毁存在渲染竞争，表现为消失时闪烁 —— 两次时序修复无效，
      // 故退场改为即时消失（入场编排保留）。_leaving 相关逻辑不再使用。
      this.triggerEvent('close')
    },
  },
})
