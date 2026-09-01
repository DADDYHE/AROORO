const __i18n = require('../../../utils/i18n.js')
const __pageI18n = require('../../../utils/page-i18n.js')
const __i18nT = (k) => __i18n.t(k, __i18n.getLocale())
const { OrderService } = require('../../../services/CloudFunctionService')
const { ListBehavior } = require('../../../behaviors/listBehavior')

Page({
  behaviors: [ListBehavior],
  data: {
  ...__pageI18n.buildTMap(__i18n.getLocale()),
    isLoading: true,
    isLoadingMore: false,
    orders: [],
    orderTotal: 0,
    page: 1,
    pageSize: 20,
    hasMore: true,
  },

  onLoad() {
    this._initNavbarHeight()
    this._initListBehavior({
      fetchFn: () => this._loadOrders(),
    })
    this._loadOrders()
  },

  async _loadOrders(append = false) {
    this.setData({ isLoadingMore: append })
    if (!append) this.setData({ isLoading: true })
    try {
      const res = await OrderService.getFeedingOrders({
        page: this.data.page,
        pageSize: this.data.pageSize,
      }, { useCache: !append && this.data.page === 1, cacheTime: 30000 })
      if (res.code === 0 && res.data) {
        const list = res.data.list || []
        this.setData({
          orders: append ? [...this.data.orders, ...list] : list,
          orderTotal: res.data.total || 0,
          hasMore: list.length >= this.data.pageSize,
          isLoading: false,
          isLoadingMore: false,
        })
      } else {
        this.setData({ isLoading: false, isLoadingMore: false })
      }
    } catch (e) {
      console.error('[partner/feeding] _loadOrders error:', e)
      this.setData({ isLoading: false, isLoadingMore: false })
    }
  },

  onReachBottom() {
    if (!this.data.hasMore || this.data.isLoading) {return}
    this.setData({ page: this.data.page + 1 })
    return this._loadOrders(true)
  },
})
