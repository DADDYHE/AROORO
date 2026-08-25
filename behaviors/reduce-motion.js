// behaviors/reduce-motion.js
// 统一的「减少动态」(prefers-reduced-motion) 适配层。
//
// 现状痛点：tab-bar / splash / home 三处各写一套 wx.getSystemSetting + onReduceMotionChange，
// 重复且易漏清理。Skyline 下 WXSS 不支持 @media (prefers-reduced-motion)，
// 必须走 JS 读系统设置 + 在根节点切换 .rm class 做降级（详见 animation-plan-audit.md）。
//
// 用法（Page / Component 通用）：
//   1. const { ReduceMotionBehavior } = require('../behaviors/reduce-motion')
//   2. behaviors: [ReduceMotionBehavior]
//   3. onLoad / attached 里调 this.initReduceMotion()
//   4. onUnload / detached 里调 this.cleanupReduceMotion()
//   WXSS：根节点 class="{{reduceMotion ? 'rm' : ''}}"，motion.wxss 内补 .rm 降级规则（P3）。

module.exports = {
  ReduceMotionBehavior: Behavior({
    data: {
      reduceMotion: false,
      // 根节点 reduce-motion 标记：挂载到页面/组件根元素 class，
      // 供 motion.wxss 的 .rm 规则压制 WXSS 声明式动画（Skyline 不支持 @media prefers-reduced-motion）。
      rmClass: '',
    },
    methods: {
      // 读取系统「减少动态」设置并注册实时监听；运行中切换系统设置立即生效。
      initReduceMotion() {
        if (!wx.getSystemSetting) return
        let setting
        try {
          setting = wx.getSystemSetting()
        } catch (e) {
          return
        }
        if (setting && typeof setting.reduceMotion === 'string') {
          const rm = setting.reduceMotion === 'enable'
          this.setData({ reduceMotion: rm, rmClass: rm ? 'rm' : '' })
        }
        if (typeof wx.onReduceMotionChange !== 'function') return
        this._reduceMotionHandler = (res) => {
          if (res && typeof res.reduceMotion === 'string') {
            const rm = res.reduceMotion === 'enable'
            this.setData({ reduceMotion: rm, rmClass: rm ? 'rm' : '' })
          }
        }
        wx.onReduceMotionChange(this._reduceMotionHandler)
      },
      // 卸载时注销监听，避免内存泄漏。
      cleanupReduceMotion() {
        if (this._reduceMotionHandler && typeof wx.offReduceMotionChange === 'function') {
          wx.offReduceMotionChange(this._reduceMotionHandler)
          this._reduceMotionHandler = null
        }
      },
    },
  }),
}
