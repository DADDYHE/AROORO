// 通用导航栏组件 — Skyline 模式下替代原生导航栏
// 自动适配状态栏高度和胶囊按钮位置
// 返回按钮按压反馈用 CSS :active 实现（避免 worklet 在 root-portal 内的触摸命中问题）

// 全局缓存窗口/胶囊信息，避免每个 navbar 实例重复调用 wx.getWindowInfo 注册监听器
let _cachedLayout = null

function _getLayout() {
  if (_cachedLayout) return _cachedLayout
  try {
    const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    const menuButton = wx.getMenuButtonBoundingClientRect()
    const statusBarHeight = windowInfo.statusBarHeight || 20
    const navBarHeight = (menuButton.top - statusBarHeight) * 2 + menuButton.height
    _cachedLayout = {
      statusBarHeight,
      navBarHeight,
      menuButtonTop: menuButton.top,
      menuButtonHeight: menuButton.height,
    }
    return _cachedLayout
  } catch (e) {
    console.warn('[zy-navbar] 获取导航栏尺寸失败，使用默认值', e)
    return null
  }
}

Component({
  properties: {
    title: { type: String, value: '' },
    showBack: { type: Boolean, value: true },
    bg: { type: String, value: '#FFFFFF' },
    color: { type: String, value: '#1D1D1F' },
    transparent: { type: Boolean, value: false },
  },

  data: {
    statusBarHeight: 20,
    navBarHeight: 44,
    menuButtonTop: 24,
    menuButtonHeight: 32,
  },

  lifetimes: {
    attached() {
      const layout = _getLayout()
      if (layout) {
        this.setData(layout)
      }
    },
  },

  methods: {
    onBackTap() {
      const pages = getCurrentPages()
      if (pages.length > 1) {
        wx.navigateBack()
      } else {
        wx.switchTab({ url: '/pages/home/index' })
      }
    },
  },
})
