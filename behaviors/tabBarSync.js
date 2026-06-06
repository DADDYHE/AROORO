const tabBarSyncBehavior = Behavior({
  methods: {
    _syncTabBar() {
      const tabBar = this.getTabBar()
      if (tabBar && tabBar._syncTabBarFromPages) {
        tabBar._syncTabBarFromPages()
      }
    },
  },
})

module.exports = tabBarSyncBehavior