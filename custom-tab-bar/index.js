const app = getApp()

Component({
  data: {
    selected: 0,
    color: '#666666',
    selectedColor: '#0D5A6B',
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
  },
  detached() {
    this._isAttached = false
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
  },
})
