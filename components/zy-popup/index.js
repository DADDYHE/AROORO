// ================================================================
// components/zy-popup · Skyline Worklet 驱动弹层组件 v2
// ----------------------------------------------------------------
// 渲染策略：
//   - Skyline：worklet 驱动 transform + opacity，丝绸缓动，UI 线程同步
//   - WebView 兜底：CSS transition + _animating class 切换
// 动效设计：
//   - 遮罩领先铺陈 400ms ease-luxury（CSS transition 驱动）
//   - 面板丝绸升起 600ms ease-silk（worklet 驱动，center 500ms）
//   - 退场加速 320ms ease-exit（优雅离场）
// 工作机制：
//   1. attached 创建 SharedValue progress（0=隐藏, 1=显示）
//   2. visible 变化时，先挂载 DOM + 绑定 worklet style，再 animateTo(1/0)
//   3. worklet 从 this.data 读取 position（响应 position 动态变化）
//   4. 退场动画完成后（setTimeout 兜底）移除 DOM 并解绑
// Skyline 兼容：
//   - 仅 transform + opacity
//   - worklet-driven 时禁用 CSS transition
// ================================================================

const workletAPI = wx.worklet || {}
const { shared, timing, runOnUI, cancelAnimation } = workletAPI

Component({
  options: {
    multipleSlots: true,
  },

  properties: {
    visible: { type: Boolean, value: false },
    position: { type: String, value: 'bottom' },
    round: { type: Boolean, value: true },
    closeable: { type: Boolean, value: false },
    overlay: { type: Boolean, value: true },
    closeOnClickOverlay: { type: Boolean, value: true },
    overlayOpacity: { type: Number, value: 0.5 },
    zIndex: { type: Number, value: 1000 },
    // 动画时长（ms）——worklet 会根据 position 自动选择：
    //   bottom/top/left/right: 600ms, center: 500ms
    //   退场统一 320ms
    duration: { type: Number, value: 0 }, // 0 = 自动选择
    lockScroll: { type: Boolean, value: true },
  },

  data: {
    _innerVisible: false,
    _animating: false,
    _workletEnabled: false,
    // 动态 inline style（遮罩/面板的 opacity/transition）
    _overlayStyle: '',
    _panelStyle: '',
  },

  lifetimes: {
    attached() {
      if (!wx.worklet || !this.applyAnimatedStyle) return
      this._initWorklet()
    },
    detached() {
      this._teardownWorklet()
    },
  },

  observers: {
    visible(visible) {
      if (visible) {
        this._show()
      } else if (this.data._innerVisible) {
        this._hide()
      }
    },
  },

  methods: {
    _initWorklet() {
      const { shared: createShared, Easing } = wx.worklet
      this._progress = createShared(0)
      // 入场：ease-silk（丝绸减速）
      this._enterEasing = Easing.cubicBezier(0.16, 1, 0.3, 1)
      // 退场：ease-exit（优雅加速离场）
      this._leaveEasing = Easing.cubicBezier(0.55, 0, 1, 0.45)
      this._workletReady = true
    },

    _getDuration(isEnter) {
      if (this.data.duration > 0) return this.data.duration
      if (!isEnter) return 320 // 退场统一 320ms
      // 入场根据 position 选择时长
      const pos = this.data.position
      return pos === 'center' ? 500 : 600
    },

    _bindWorkletStyle() {
      if (this._styleBound) return
      const progress = this._progress
      const self = this

      // contentUpdater：从 self.data 动态读取 position（响应属性变化）
      const contentUpdater = () => {
        'worklet'
        const p = progress.value
        // worklet 中通过 this.data 读取最新 position
        const pos = self.data.position
        let transform = ''
        switch (pos) {
          case 'bottom':
            transform = `translateY(${(1 - p) * 100}%)`
            break
          case 'top':
            transform = `translateY(${-(1 - p) * 100}%)`
            break
          case 'center':
            transform = `translate(-50%, -50%) scale(${0.92 + 0.08 * p})`
            break
          case 'right':
            transform = `translateX(${(1 - p) * 100}%)`
            break
          case 'left':
            transform = `translateX(${-(1 - p) * 100}%)`
            break
          default:
            transform = `translateY(${(1 - p) * 100}%)`
        }
        return { transform, opacity: p }
      }

      try {
        this._cancelContent = this.applyAnimatedStyle('.zy-popup', contentUpdater)
      } catch (e) {
        this._cancelContent = null
      }
      this._styleBound = true
    },

    _unbindWorkletStyle() {
      if (this._cancelContent) {
        this._cancelContent()
        this._cancelContent = null
      }
      this._styleBound = false
    },

    _teardownWorklet() {
      this._unbindWorkletStyle()
      if (this._progress) {
        cancelAnimation(this._progress)
        this._progress = null
      }
      this._workletReady = false
    },

    _show() {
      this.setData({ _innerVisible: true }, () => {
        if (this._workletReady) {
          this._bindWorkletStyle()
          wx.nextTick(() => {
            this.setData({ _workletEnabled: true, _animating: true })
            this._animateTo(1, true)
          })
        } else {
          setTimeout(() => this.setData({ _animating: true }), 16)
        }
      })
    },

    _hide() {
      const exitDuration = this._getDuration(false)
      if (this._workletReady) {
        this.setData({ _animating: false })
        this._animateTo(0, false)
      } else {
        this.setData({ _animating: false })
      }
      setTimeout(() => {
        this.setData({ _innerVisible: false, _workletEnabled: false })
        this._unbindWorkletStyle()
      }, exitDuration)
    },

    _animateTo(target, isEnter) {
      if (!this._progress) return
      const progress = this._progress
      const duration = this._getDuration(isEnter)
      const easing = isEnter ? this._enterEasing : this._leaveEasing
      runOnUI(() => {
        'worklet'
        progress.value = timing(target, { duration, easing })
      })()
    },

    onOverlayTap() {
      if (this.data.closeOnClickOverlay) {
        this.triggerEvent('close', { source: 'overlay' })
      }
    },

    onCloseTap() {
      this.triggerEvent('close', { source: 'close-btn' })
    },

    noop() {},

    onTransitionEnd() {
      this.triggerEvent(this.data.visible ? 'enter' : 'leave')
    },
  },
})
