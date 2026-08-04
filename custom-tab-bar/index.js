const app = getApp()

Component({
  data: {
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
        pagePath: '/pages/quick-register/index',
        iconPath: '/images/icons/calendar-icon.svg',
        selectedIconPath: '/images/icons/calendar-icon.svg',
        text: '一键报名',
      },
      {
        pagePath: '/pages/discover/index',
        iconPath: '/images/icons/discover-line.svg',
        selectedIconPath: '/images/icons/discover-white.svg',
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
    showSplash: false,
    splashFading: false,
  },
  attached() {
    this._isAttached = true
    this.setData({ tabBarPadding: 20 })
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

    // AROORO 启动屏：冷启动仅首次显示，覆盖全屏（含 tabBar）
    if (!app.splashShown) {
      app.splashShown = true
      this.setData({ showSplash: true })
      this._splashTimer = setTimeout(() => {
        this.dismissSplash()
      }, 2800)
    }

    // 初始化 worklet 按压弹性动效
    this._initTabPressAnimation()
  },
  detached() {
    this._isAttached = false
    if (this._splashTimer) {
      clearTimeout(this._splashTimer)
      this._splashTimer = null
    }
    this._teardownTabPressAnimation()
  },
  methods: {
    dismissSplash() {
      if (this._splashTimer) {
        clearTimeout(this._splashTimer)
        this._splashTimer = null
      }
      this.setData({ splashFading: true })
      setTimeout(() => {
        this.setData({ showSplash: false, splashFading: false })
      }, 500)
    },
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
          this._syncTabBarFromPages()
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
