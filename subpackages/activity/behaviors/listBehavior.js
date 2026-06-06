const ListBehavior = Behavior({
  data: {
    page: 1,
    pageSize: 20,
    isLoading: false,
    hasMore: true,
    isError: false,
  },

  methods: {
    _initListBehavior(fetchFn, options = {}) {
      this._listFetchFn = fetchFn
      if (options.pageSize) this.setData({ pageSize: options.pageSize })
      if (options.listKey) this._listDataKey = options.listKey
      if (options.sortFn) this._listSortFn = options.sortFn
    },

    _resetAndLoad() {
      this.setData({ page: 1, hasMore: true, isError: false })
      return this._loadPageData()
    },

    _onReachBottom() {
      if (this.data.isLoading || !this.data.hasMore) return
      this.setData({ page: this.data.page + 1 })
      return this._loadPageData(true)
    },

    _onPullDownRefresh() {
      this.setData({ page: 1, hasMore: true, isError: false })
      return this._loadPageData().then(() => wx.stopPullDownRefresh()).catch(() => wx.stopPullDownRefresh())
    },

    async _loadPageData(append = false) {
      if (this.data.isLoading) return
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
        if (!append) this.setData({ isError: true })
        this.setData({ isLoading: false })
        if (typeof this._onListError === 'function') {
          this._onListError(err)
        }
        throw err
      }
    },

    _extractRawList(res) {
      if (!res) return []
      if (Array.isArray(res)) return res
      if (res.data && Array.isArray(res.data.list)) return res.data.list
      if (res.data && Array.isArray(res.data)) return res.data
      if (res.list) return res.list
      return []
    },

    _onListRetry() {
      return this._resetAndLoad()
    },
  },
})

module.exports = { ListBehavior }
