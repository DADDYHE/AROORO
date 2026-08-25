const ListBehavior = Behavior({
  data: {
    page: 1,
    pageSize: 20,
    isLoading: false,
    hasMore: true,
    isError: false,
    // scroll-view 兼容字段（Skyline 模式下页面级滚动 API 失效，改用 scroll-view 事件）
    _refresherTriggered: false,
    _navbarHeight: 64, // 导航栏总高度（状态栏 + 标题栏），用于 scroll-view 高度计算
  },

  methods: {
    _initListBehavior(fetchFn, options = {}) {
      this._listFetchFn = fetchFn
      if (options.pageSize) {this.setData({ pageSize: options.pageSize })}
      if (options.listKey) {this._listDataKey = options.listKey}
      if (options.sortFn) {this._listSortFn = options.sortFn}
    },

    // 计算 zy-navbar 占位高度，供 scroll-view 的 calc(100vh - Xpx) 使用
    _initNavbarHeight() {
      // 使用缓存，避免每次调用都注册 WindowInfoChanged 监听器
      if (ListBehavior._cachedNavbarHeight) {
        this.setData({ _navbarHeight: ListBehavior._cachedNavbarHeight })
        return
      }
      try {
        const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
        const menuButton = wx.getMenuButtonBoundingClientRect()
        const statusBarHeight = windowInfo.statusBarHeight || 20
        const navBarHeight = (menuButton.top - statusBarHeight) * 2 + menuButton.height
        const total = statusBarHeight + navBarHeight
        ListBehavior._cachedNavbarHeight = total
        this.setData({ _navbarHeight: total })
      } catch (e) {
        // 降级：使用默认值 64px
      }
    },

    _resetAndLoad() {
      this.setData({ page: 1, hasMore: true, isError: false })
      return this._loadPageData()
    },

    _onReachBottom() {
      if (this.data.isLoading || !this.data.hasMore) {return}
      this.setData({ page: this.data.page + 1 })
      return this._loadPageData(true)
    },

    _onPullDownRefresh() {
      this.setData({ page: 1, hasMore: true, isError: false })
      return this._loadPageData().then(() => wx.stopPullDownRefresh()).catch(() => wx.stopPullDownRefresh())
    },

    // ================================================================
    // scroll-view 事件桥接（Skyline 兼容）
    // 页面包裹 <scroll-view> 后，由这些方法路由到原业务回调
    // ================================================================

    // scroll-view 下拉刷新 → 路由到 onPullDownRefresh / _onPullDownRefresh
    // 子页面可实现 _afterRefresherRefresh 钩子，在刷新结束后执行（如 worklet 回弹动画）
    _onRefresherRefresh() {
      // 未注册 fetchFn 且无 onPullDownRefresh 的页面，直接结束刷新态
      if (typeof this._listFetchFn !== 'function' && typeof this.onPullDownRefresh !== 'function') {
        this.setData({ _refresherTriggered: false })
        return
      }
      this.setData({ _refresherTriggered: true })
      const done = () => {
        this.setData({ _refresherTriggered: false })
        // 刷新结束钩子：子页面可实现此方法添加额外逻辑（如 worklet 回弹）
        if (typeof this._afterRefresherRefresh === 'function') {
          this._afterRefresherRefresh()
        }
      }
      const result = typeof this.onPullDownRefresh === 'function'
        ? this.onPullDownRefresh()
        : this._onPullDownRefresh()
      return Promise.resolve(result)
        .then(done)
        .catch(done)
    },

    // scroll-view 触底 → 路由到 onReachBottom / _onReachBottom
    _onScrollToLower() {
      // 未注册 fetchFn 且无 onReachBottom 的页面，直接返回
      if (typeof this._listFetchFn !== 'function' && typeof this.onReachBottom !== 'function') {return}
      if (this._loadingMore) {return}
      this._loadingMore = true
      const result = typeof this.onReachBottom === 'function'
        ? this.onReachBottom()
        : this._onReachBottom()
      return Promise.resolve(result)
        .finally(() => { this._loadingMore = false })
    },

    // scroll-view 滚动 → 路由到 onPageScroll
    _onScroll(e) {
      const { scrollTop } = e.detail
      // 视差 hook：子页面可注册 _onParallaxScroll，直接更新 worklet SharedValue（无 setData 开销）
      if (typeof this._onParallaxScroll === 'function') {
        this._onParallaxScroll(scrollTop)
      }
      if (typeof this.onPageScroll === 'function') {
        this.onPageScroll({ scrollTop })
      }
    },

    // 滚动到指定位置（替代 wx.pageScrollTo）
    _scrollTo(top, duration = 300) {
      if (this._scrollContext) {
        this._scrollContext.scrollTo({ top, duration })
      }
    },

    async _loadPageData(append = false) {
      // 保护：未通过 _initListBehavior 注册 fetchFn 的页面（仅用 ListBehavior 获取 navbar 高度/scroll 事件桥接），
      // 直接返回，避免 _listFetchFn is not a function 崩溃
      if (typeof this._listFetchFn !== 'function') {return}
      if (this.data.isLoading) {return}
      this.setData({ isLoading: true, isError: false })
      try {
        const res = await this._listFetchFn({ page: this.data.page, pageSize: this.data.pageSize })
        const rawList = this._extractRawList(res)
        const transformed = typeof this._transformListItem === 'function'
          ? rawList.map(item => this._transformListItem(item))
          : rawList

        if (typeof this._listSortFn === 'function') {
          transformed.sort(this._listSortFn.bind(this))
        }

        const listKey = this._listDataKey || 'list'
        if (append) {
          const currentList = this.data[listKey] || []
          this.setData({ [listKey]: [...currentList, ...transformed] })
        } else {
          this.setData({ [listKey]: transformed })
        }

        this.setData({
          hasMore: rawList.length >= this.data.pageSize,
          isLoading: false,
        })
        return transformed
      } catch (err) {
        if (!append) {this.setData({ isError: true })}
        this.setData({ isLoading: false })
        if (typeof this._onListError === 'function') {
          this._onListError(err)
        }
        throw err
      }
    },

    _extractRawList(res) {
      if (!res) {return []}
      if (Array.isArray(res)) {return res}
      if (res.data && Array.isArray(res.data.list)) {return res.data.list}
      if (res.data && Array.isArray(res.data)) {return res.data}
      if (res.list) {return res.list}
      return []
    },

    _onListRetry() {
      return this._resetAndLoad()
    },
  },
})

module.exports = { ListBehavior }
