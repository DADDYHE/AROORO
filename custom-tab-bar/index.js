const __i18n = require('../utils/i18n.js')
const __pageI18n = require('../utils/page-i18n.js')
const __i18nT = (k) => __i18n.t(k, __i18n.getLocale())
Component({
  data: {
    t: __pageI18n.buildTMap(__i18n.getLocale()),
    selected: 0,
    color: '#666666',
    selectedColor: '#4F5E35',
    list: [
      {
        pagePath: '/pages/home/index',
        iconPath: '/images/icons/home-line.svg',
        selectedIconPath: '/images/icons/home-white.svg',
        text: '首页',
      },
      {
        pagePath: '/pages/boarding/index',
        iconPath: '/images/icons/boarding-line-white.svg',
        selectedIconPath: '/images/icons/boarding-gold.svg',
        text: '家庭寄养',
      },
      {
        pagePath: '/pages/discover/index',
        iconPath: '/images/icons/discover-line.svg',
        selectedIconPath: '/images/icons/discover-gold.svg',
        text: '宠团团',
      },
      {
        pagePath: '/pages/service/index',
        iconPath: '/images/icons/service-line.svg',
        selectedIconPath: '/images/icons/service-line.svg',
        text: '上门服务',
      },
      {
        pagePath: '/pages/profile/index',
        iconPath: '/images/icons/profile-line.svg',
        selectedIconPath: '/images/icons/profile-white.svg',
        text: '我的',
      },
    ],
    tabBarPadding: 20,
    _isAttached: false,
  },
  attached() {
    this._isAttached = true
    this.setData({ tabBarPadding: 20 })
    if (wx.getSystemSetting) {
      const setting = wx.getSystemSetting()
      if (setting && setting.reduceMotion) {
        this.setData({ reduceMotion: setting.reduceMotion === 'enable' })
      }
    }
    const pages = getCurrentPages()
    if (pages.length > 0) {
      const currentPage = pages[pages.length - 1]
      if (currentPage && currentPage.route) {
        const currentPath = currentPage.route
        const index = this.data.list.findIndex(item => item.pagePath === `/${currentPath}`)
        if (index !== -1 && index !== this.data.selected) {
          this.setData({ selected: index })
        }
      }
    }
    this._syncTabBarFromPages()

    // 初始化 worklet 按压弹性动效（nextTick 等节点渲染就绪后再绑定，
    // 避免 Skyline 下 attached 时 .tab-scale-N 节点尚未挂载导致 applyAnimatedStyle 报 "can not find corresponding nodes" 噪声）
    wx.nextTick(() => this._initTabPressAnimation())
  },
  detached() {
    this._isAttached = false
    this._teardownTabPressAnimation()
  },
  methods: {
    switchTab(e) {
      const data = e.currentTarget.dataset
      const url = data.path
      const index = parseInt(data.index, 10)
      if (index === this.data.selected) {return}
      this.setData({ selected: index })
      wx.switchTab({
        url,
        fail: error => {
          console.error('页面切换失败:', error)
          // 切换超时/失败逃生舱：reLaunch 强制重建目标 tab 页，绕过可能卡死的 webview。
          // 常见于源页面存在未释放的全屏遮罩或云调用悬挂导致框架切换超时。
          const errMsg = (error && error.errMsg) || ''
          if (/timeout|fail/.test(errMsg)) {
            wx.reLaunch({
              url,
              fail: () => this._syncTabBarFromPages(),
            })
          } else {
            this._syncTabBarFromPages()
          }
        },
      })
    },
    _syncTabBarFromPages() {
      const pages = getCurrentPages()
      if (pages.length === 0) {return}
      const currentPage = pages[pages.length - 1]
      if (!currentPage || !currentPage.route) {return}
      const currentPath = `/${currentPage.route}`
      const index = this.data.list.findIndex(item => item.pagePath === currentPath)
      if (index !== -1 && index !== this.data.selected) {
        this.setData({ selected: index })
      }
    },

    // ================================================================
    // Worklet 按压弹性动效
    // ----------------------------------------------------------------
    // 按下：scale 缩小到 0.85（反馈按压）
    // 松开：scale 回弹到 1.0（easeOutBack 缓动，轻微回弹）
    // worklet 在 UI 线程同步驱动，无 setData 开销，60fps 流畅
    // ================================================================
    _initTabPressAnimation() {
      if (!wx.worklet || !this.applyAnimatedStyle) return
      const { shared, Easing } = wx.worklet
      // easeOutBack：超过目标值后回弹，产生弹性反馈
      this._pressEasing = Easing.cubicBezier(0.34, 1.56, 0.64, 1)
      this._tabScales = []
      this._tabCancels = []

      // 为 5 个 tab item 各创建独立 SharedValue
      for (let i = 0; i < 5; i++) {
        const scale = shared(1)
        this._tabScales[i] = scale
        const scaleRef = scale
        try {
          const cancel = this.applyAnimatedStyle(`.tab-scale-${i}`, () => {
            'worklet'
            return { transform: `scale(${scaleRef.value})` }
          })
          this._tabCancels[i] = cancel
        } catch (e) {
          this._tabCancels[i] = null
        }
      }
      this._workletReady = true
    },

    _teardownTabPressAnimation() {
      if (this._tabCancels) {
        this._tabCancels.forEach(c => c && c())
        this._tabCancels = null
      }
      this._tabScales = null
      this._workletReady = false
    },

    onTabTouchStart(e) {
      if (!this._workletReady) return
      const index = parseInt(e.currentTarget.dataset.index, 10)
      this._animateTabScale(index, 0.92)
    },

    onTabTouchEnd(e) {
      if (!this._workletReady) return
      const index = parseInt(e.currentTarget.dataset.index, 10)
      this._animateTabScale(index, 1)
    },

    _animateTabScale(index, target) {
      const scale = this._tabScales && this._tabScales[index]
      if (!scale) return
      const { timing, runOnUI } = wx.worklet || {}
      if (!runOnUI) return
      const easing = this._pressEasing
      runOnUI(() => {
        'worklet'
        scale.value = timing(target, { duration: target === 1 ? 320 : 160, easing })
      })()
    },
  },
})
