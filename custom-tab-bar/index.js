// custom-tab-bar/index.js
Component({
  data: {
    selected: 0,
    color: "#666666",
    selectedColor: "#FF6B00",
    list: [
      {
        pagePath: "/pages/home/index",
        iconPath: "/images/tabBar/home_normal.png",
        selectedIconPath: "/images/tabBar/home_white.png",
        text: "首页"
      },
      {
        pagePath: "/pages/booking/calendar",
        iconPath: "/images/tabBar/booking_normal.png",
        selectedIconPath: "/images/tabBar/booking_white.png",
        text: "预订"
      },
      {
        pagePath: "/pages/messages/index",
        iconPath: "/images/tabBar/messages_normal.png",
        selectedIconPath: "/images/tabBar/messages_white.png",
        text: "消息"
      },
      {
        pagePath: "/pages/profile/index",
        iconPath: "/images/tabBar/profile_normal.png",
        selectedIconPath: "/images/tabBar/profile_white.png",
        text: "我的"
      }
    ],
    routeTimer: null
  },
  attached() {
    // 立即设置选中状态，避免首次渲染时的延迟
    const pages = getCurrentPages();
    if (pages.length > 0) {
      const currentPage = pages[pages.length - 1];
      if (currentPage && currentPage.route) {
        const currentPath = currentPage.route;
        const index = this.data.list.findIndex(item => item.pagePath === `/${currentPath}`);
        if (index !== -1 && index !== this.data.selected) {
          this.setData({
            selected: index
          });
        }
      }
    }

    // 监听页面切换事件，确保选中状态与当前页面一致
    // 添加防抖机制，避免频繁 setData
    wx.onAppRoute(() => {
      if (this.data.routeTimer) {
        clearTimeout(this.data.routeTimer);
      }
      this.data.routeTimer = setTimeout(() => {
        const pages = getCurrentPages();
        if (pages.length > 0) {
          const currentPage = pages[pages.length - 1];
          if (currentPage && currentPage.route) {
            const currentPath = currentPage.route;
            const index = this.data.list.findIndex(item => item.pagePath === `/${currentPath}`);
            if (index !== -1 && index !== this.data.selected) {
              this.setData({
                selected: index
              });
            }
          }
        }
      }, 100);
    });
  },
  detached() {
    // 组件卸载时清除定时器
    if (this.data.routeTimer) {
      clearTimeout(this.data.routeTimer);
    }
  },
  methods: {
    switchTab(e) {
      const data = e.currentTarget.dataset;
      const url = data.path;
      const index = parseInt(data.index);

      // 点击当前 tab 不执行操作
      if (index === this.data.selected) {
        return;
      }

      // 更新选中状态
      this.setData({
        selected: index
      });

      // 执行页面切换
      wx.switchTab({
        url,
        fail: (error) => {
          console.error('页面切换失败:', error);
        }
      });
    }
  }
})
