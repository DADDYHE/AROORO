// behaviors/worklet-anim.js
// 统一的 Skyline Worklet 动效封装层（交互/数值驱动动画专用）。
//
// 设计原则（与 animation-plan-audit.md 一致）：
//   · 基础/声明式动效（入场、过渡、hover）走 WXSS（motion.wxss），不动这里。
//   · 仅「连续数值/手势驱动、CSS 表达不了或需 setData 才驱动」的动画走 Worklet——
//     跟手（下拉阻尼/视差/拖拽）、弹簧回弹（按压/弹性入场）、滚动联动（导航栏透明→实色）。
//   · Worklet 元素无法被 WXSS 压制，故 reduce-motion 必须在 JS 内跳过（可达性硬要求）。
//   · 每个封装都带 WebView CSS 兜底（无 wx.worklet 的回退环境），升级不破坏回退。
//   · 所有 SharedValue / cancel 句柄由 behavior 统一 teardown，避免内存泄漏。
//   · applyAnimatedStyle 必须包 wx.nextTick（节点挂载后再绑定，规避 "can not find nodes" 警告）。
//
// 用法（Page / Component，CommonJS 与 listBehavior 一致）：
//   const { WorkletAnimBehavior } = require('../../behaviors/worklet-anim')
//   behaviors: [WorkletAnimBehavior]
//   onReady() { this.bindPressScale('#ctaBtn', { min: 0.94 }) }
//   // onUnload / detached 由 behavior 自动 teardown，无需手动
//
// 滚动联动（未来 hero navbar 透明→实色等）示例：
//   onReady() {
//     this._navAlpha = this.createScrollDrivenStyle('.navbar', (scrollTop) => {
//       'worklet'
//       const a = Math.min(Math.max(scrollTop / 80, 0), 1)
//       return { backgroundColor: `rgba(15,36,16,${a})` }
//     }, { staticStyle: { backgroundColor: 'rgba(15,36,16,1)' } })
//   }
//   // 在 ListBehavior._onParallaxScroll 钩子里（scroll-view 页面）：
//   _onParallaxScroll(scrollTop) { if (this._navAlpha) this._navAlpha.update(scrollTop) }

module.exports = {
  WorkletAnimBehavior: Behavior({
    data: {
      // WebView 回退环境 / reduce-motion 下由 bindPressScale 写入的静态标记
      _pressStatic: false,
    },
    methods: {
      // 内部：当前是否应启用 worklet（环境支持 + 非 reduce-motion）
      _workletReady() {
        return !!(wx.worklet && this.applyAnimatedStyle && !this.data.reduceMotion)
      },

      // ----------------------------------------------------------------
      // 按压弹性封装（spring 回弹手感，优于 CSS cubic-bezier 近似）
      //   selector: 目标节点选择器（如 '#ctaBtn' 或 '.press-cell'）
      //   opts.min: 按压时最小缩放（默认 0.96）
      //   opts.duration: 回弹时长 ms（默认 140）
      // 调用方需在 wxml 元素上加：
      //   bindtouchstart="_onPressScaleStart" bindtouchend="_onPressScaleEnd"
      //   bindtouchcancel="_onPressScaleEnd" data-press-selector="<selector>"
      // 返回 cancel 函数（behavior 也会自动 teardown，可忽略返回值）。
      // WebView 回退：本方法直接返回，按压仍由 hover-class/--pressed 兜底（项目已具备）。
      // ----------------------------------------------------------------
      bindPressScale(selector, opts = {}) {
        const min = typeof opts.min === 'number' ? opts.min : 0.96
        const duration = typeof opts.duration === 'number' ? opts.duration : 140

        if (!this._pressScales) this._pressScales = {}
        // 已绑定过
        if (this._pressScales[selector]) return this._pressScales[selector].cancel

        // reduce-motion 或环境不支持：跳过 worklet，保持静态（可达性）
        if (!this._workletReady()) {
          this.setData({ _pressStatic: true })
          return null
        }

        const { shared, timing, runOnUI, Easing } = wx.worklet
        const sv = shared(1)
        const press = () => {
          runOnUI(() => {
            'worklet'
            sv.value = timing(min, { duration, easing: Easing.cubicBezier(0.34, 1.15, 0.64, 1) })
          })()
        }
        const release = () => {
          runOnUI(() => {
            'worklet'
            sv.value = timing(1, { duration, easing: Easing.cubicBezier(0.16, 1, 0.3, 1) })
          })()
        }

        // 先占位（cancel 待 nextTick 后填充），teardown 时若 cancel 仍 null 则跳过
        this._pressScales[selector] = { sv, cancel: null, press, release }

        wx.nextTick(() => {
          // 组件可能已卸载
          if (!this._pressScales || !this._pressScales[selector]) return
          try {
            this._pressScales[selector].cancel = this.applyAnimatedStyle(selector, () => {
              'worklet'
              return { transform: `scale(${sv.value})` }
            })
          } catch (e) {
            this._pressScales[selector].cancel = null
          }
        })

        return null
      },

      // 触摸开始（wxml 元素需 bindtouchstart="_onPressScaleStart"）
      _onPressScaleStart(e) {
        const sel = this._pressSelectorOf(e)
        if (sel && this._pressScales[sel]) this._pressScales[sel].press()
      },
      // 触摸结束/取消（wxml 元素需 bindtouchend / bindtouchcancel）
      _onPressScaleEnd(e) {
        const sel = this._pressSelectorOf(e)
        if (sel && this._pressScales[sel]) this._pressScales[sel].release()
      },
      // 从事件 currentTarget 反查 selector（约定：给元素加 data-press-selector）
      _pressSelectorOf(e) {
        const ds = (e && e.currentTarget && e.currentTarget.dataset) || {}
        return ds.pressSelector || null
      },

      // ----------------------------------------------------------------
      // 滚动驱动样式工厂
      //   selector: 目标节点选择器
      //   styleFn: (scrollTop) => ({ ...styleObj })  在 UI 线程执行
      //   opts.threshold: 归一化分母（默认 80，scrollTop/threshold 得到 0~1 进度）
      //   opts.staticStyle: reduce-motion / 无 worklet 时的静态终态（由调用方决定如何 setData）
      // 返回 { update(scrollTop) }，在滚动钩子里调用（无 setData 开销）。
      // ----------------------------------------------------------------
      createScrollDrivenStyle(selector, styleFn, opts = {}) {
        const threshold = typeof opts.threshold === 'number' ? opts.threshold : 80

        if (!this._scrollStyles) this._scrollStyles = {}
        // 已绑定过
        if (this._scrollStyles[selector]) return this._scrollStyles[selector]

        let update = () => {}

        if (this._workletReady()) {
          const { shared, runOnUI } = wx.worklet
          const sv = shared(0)
          // 先占位
          this._scrollStyles[selector] = { update, sv, cancel: null }
          wx.nextTick(() => {
            if (!this._scrollStyles || !this._scrollStyles[selector]) return
            try {
              this._scrollStyles[selector].cancel = this.applyAnimatedStyle(selector, () => {
                'worklet'
                return styleFn(sv.value * threshold)
              })
            } catch (e) {
              this._scrollStyles[selector].cancel = null
            }
          })
          update = (scrollTop) => {
            const v = Math.min(Math.max(scrollTop / threshold, 0), 1)
            runOnUI(() => {
              'worklet'
              sv.value = v
            })()
          }
          this._scrollStyles[selector].update = update
        } else {
          // WebView / reduce-motion：无 worklet，提供同步接口（调用方自行决定是否 setData）
          this._scrollStyles[selector] = { update, sv: null, cancel: null }
        }
        return this._scrollStyles[selector]
      },

      // 统一 teardown：解绑所有 worklet 样式并 cancel SharedValue，避免泄漏。
      teardownWorkletAnims() {
        if (this._pressScales) {
          Object.keys(this._pressScales).forEach((k) => {
            const item = this._pressScales[k]
            if (item.cancel) item.cancel()
            if (item.sv && wx.worklet && typeof wx.worklet.cancelAnimation === 'function') {
              wx.worklet.cancelAnimation(item.sv)
            }
          })
          this._pressScales = {}
        }
        if (this._scrollStyles) {
          Object.keys(this._scrollStyles).forEach((k) => {
            const item = this._scrollStyles[k]
            if (item.cancel) item.cancel()
            if (item.sv && wx.worklet && typeof wx.worklet.cancelAnimation === 'function') {
              wx.worklet.cancelAnimation(item.sv)
            }
          })
          this._scrollStyles = {}
        }
      },
    },

    lifetimes: {
      detached() {
        this.teardownWorkletAnims()
      },
    },
    pageLifetimes: {
      unload() {
        this.teardownWorkletAnims()
      },
    },
  }),
}
