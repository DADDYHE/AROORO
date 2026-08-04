// ================================================================
// components/zy-loading · Skyline Worklet 驱动加载组件 v2
// ----------------------------------------------------------------
// 渲染策略：
//   - Skyline 环境：用 worklet 驱动旋转，UI 线程同步动画，不掉帧
//   - WebView 兜底：保留 CSS @keyframes 旋转，自动降级
// 工作机制：
//   1. attached 时检测 wx.worklet 可用性
//   2. 创建 SharedValue rotation，通过 applyAnimatedStyle 绑定到 transform
//   3. runOnUI 启动递归 timing 循环（800ms 一圈，linear 缓动）
//   4. detached 时取消样式绑定并释放 SharedValue
// ----------------------------------------------------------------
// v2 新增：奢侈级动画变体（纯 CSS animation，Skyline 兼容）
//   type='tourbillon'  陀飞轮金环 — 三层同心金环正反向旋转
//   type='cascade'     金粒瀑布 — 七颗金粒错落坠落
//   type='silk'        丝缎波纹 — 五条金线波浪缩放
//   type='monogram'    品牌呼吸 — 品牌字呼吸 + 涟漪扩散
// ================================================================

const { shared, timing, runOnUI, cancelAnimation } = wx.worklet || {}

// 奢侈级变体数据（常量，无需响应式）
const CASCADE_PARTICLES = [
  { left: 20, color: '#E8D5A8', delay: 0 },
  { left: 36, color: '#D4B978', delay: 150 },
  { left: 52, color: '#C9A24B', delay: 300 },
  { left: 68, color: '#D4B978', delay: 450 },
  { left: 84, color: '#E8D5A8', delay: 600 },
  { left: 100, color: '#C9A24B', delay: 750 },
  { left: 48, color: '#D4B978', delay: 900 },
]

const SILK_LINES = [
  { color: '#E8D5A8', delay: 0 },
  { color: '#D4B978', delay: 100 },
  { color: '#C9A24B', delay: 200 },
  { color: '#D4B978', delay: 300 },
  { color: '#E8D5A8', delay: 400 },
]

const MONOGRAM_RINGS = [
  { delay: 0 },
  { delay: 800 },
  { delay: 1600 },
]

Component({
  properties: {
    // 尺寸（rpx）
    size: { type: null, value: 48 },
    // 颜色
    color: { type: String, value: '#4F5E35' },
    // 颜色（灰色，背景圆环）
    trackColor: { type: String, value: 'rgba(0, 0, 0, 0.08)' },
    // 线条粗细（rpx）
    strokeWidth: { type: null, value: 4 },
    // 类型：circular | spinner | tourbillon | cascade | silk | monogram
    type: { type: String, value: 'circular' },
    // 文字
    text: { type: String, value: '' },
    // 文字大小
    textSize: { type: null, value: 24 },
    // 文字颜色
    textColor: { type: String, value: '#9A9489' },
    // 是否垂直排列
    vertical: { type: Boolean, value: false },
    // monogram 变体的品牌文字
    monogramText: { type: String, value: 'AROORO' },
  },

  data: {
    // spinner 模式下 12 个叶片
    _leaves: Array.from({ length: 12 }, (_, i) => i),
    // worklet 是否启用（启用后禁用 CSS animation，改由 worklet 驱动）
    _workletEnabled: false,
    // 奢侈级变体数据
    _cascadeParticles: CASCADE_PARTICLES,
    _silkLines: SILK_LINES,
    _monogramRings: MONOGRAM_RINGS,
  },

  lifetimes: {
    attached() {
      // 奢侈级变体使用纯 CSS animation，不需要 worklet
      const luxTypes = ['tourbillon', 'cascade', 'silk', 'monogram']
      if (luxTypes.indexOf(this.data.type) !== -1) return

      // WebView 或低版本无 worklet，保留 CSS 兜底
      if (!wx.worklet || !this.applyAnimatedStyle) return
      this._setupWorklet()
    },
    detached() {
      this._teardownWorklet()
    },
  },

  methods: {
    _setupWorklet() {
      // 创建跨线程共享的旋转角度
      const rotation = shared(0)
      this._rotation = rotation

      // 标记启用 worklet，WXML 加 worklet-driven class 禁用 CSS animation
      this.setData({ _workletEnabled: true }, () => {
        // 节点渲染后绑定 animated style
        const updateStyle = () => {
          'worklet'
          return { transform: `rotate(${rotation.value}deg)` }
        }

        // 两个选择器可能只有一个存在，分别 try-catch
        try {
          this._cancelCircularStyle = this.applyAnimatedStyle(
            '.zy-loading__circular',
            updateStyle
          )
        } catch (e) {
          this._cancelCircularStyle = null
        }
        try {
          this._cancelSpinnerStyle = this.applyAnimatedStyle(
            '.zy-loading__spinner',
            updateStyle
          )
        } catch (e) {
          this._cancelSpinnerStyle = null
        }

        this._startRotationLoop()
      })
    },

    _startRotationLoop() {
      const rotation = this._rotation
      // 递归 timing：每 800ms 旋转 360 度，完成后立即重启
      const loop = () => {
        'worklet'
        rotation.value = timing(rotation.value + 360, { duration: 800 }, () => {
          'worklet'
          loop()
        })
      }
      // 首次启动（在 UI 线程执行）
      runOnUI(loop)()
    },

    _teardownWorklet() {
      if (this._cancelCircularStyle) {
        this._cancelCircularStyle()
        this._cancelCircularStyle = null
      }
      if (this._cancelSpinnerStyle) {
        this._cancelSpinnerStyle()
        this._cancelSpinnerStyle = null
      }
      if (this._rotation) {
        cancelAnimation(this._rotation)
        this._rotation = null
      }
    },
  },
})
