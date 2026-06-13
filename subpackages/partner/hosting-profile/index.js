const { AdminService } = require('../../../services/CloudFunctionService')

Page({
  data: {
    isLoading: true,
    profile: null,
    hasProfile: false,
    orders: [],
    orderTotal: 0,
    page: 1,
    pageSize: 20,
    hasMore: true,
  },

  onLoad() {
    this._loadData()
  },

  onShow() {
    if (!this.data.isLoading && this.data.hasProfile) {
      this._loadOrders()
    }
  },

  async _loadData() {
    this.setData({ isLoading: true })
    try {
      const res = await AdminService.getHostProfile()
      if (res.code === 0 && res.data) {
        this.setData({
          profile: res.data,
          hasProfile: true,
          isLoading: false,
        })
        this._loadOrders()
      } else {
        this.setData({ hasProfile: false, isLoading: false })
      }
    } catch (e) {
      console.error('[partner/hosting-profile] _loadData error:', e)
      this.setData({ isLoading: false })
    }
  },

  async _loadOrders() {
    try {
      const res = await AdminService.getMyBoardingOrders({ page: this.data.page, pageSize: this.data.pageSize })
      if (res.code === 0 && res.data) {
        const list = res.data.list || []
        this.setData({
          orders: list,
          orderTotal: res.data.total || 0,
          hasMore: list.length >= this.data.pageSize,
        })
      }
    } catch (e) {
      console.error('[partner/hosting-profile] _loadOrders error:', e)
    }
  },
})
