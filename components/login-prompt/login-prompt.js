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
      /* 刻意【不】触发 close：close 会同步进入 authGate 的关闭逻辑（未登录 →
         受限页 navigateBack / 栈底 switchTab 首页），与 startLogin 的登录页跳转
         形成导航竞争（分享进入+分包未预热时必现吞跳转）。
         正确时序：只 startLogin —— 登录页覆盖本页（弹层随页面不可见）；
         登录成功 navigateBack 回来时 authGate 检测已登录自动收起弹层；
         用户未登录直接返回则弹层保留，可重试。 */
      const { authService } = require('../../services/AuthService')
      authService.startLogin()
    },

    /** 阻断卡内点击冒泡到 overlay（overlay bindtap=onClose 会关弹层）：
        catchtap="" 空串在 glass-easel/Skyline 下不阻止冒泡，必须绑真实方法 */
    stopBubble() {},

    onClose() {
      // 立即通知父组件移除（无退场动画）：Skyline 下 root-portal 内的
      // 退场动画与节点销毁存在渲染竞争，表现为消失时闪烁 —— 两次时序修复无效，
      // 故退场改为即时消失（入场编排保留）。_leaving 相关逻辑不再使用。
      this.triggerEvent('close')
    },
  },
})
