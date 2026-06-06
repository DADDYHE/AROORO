const { AdminService } = require('../../../services/CloudFunctionService')

Page({
  data: {
    isLoading: true,
    feeder: null,
    hasFeeder: false,
    serviceTypesText: '',
    orders: [],
    orderTotal: 0,
    page: 1,
    pageSize: 20,
    hasMore: true,
  },

  onLoad() {
    this._loadData()
  },

  async _loadData() {
    this.setData({ isLoading: true })
    try {
      const res = await AdminService.getCurrentFeeder()
      if (res.code === 0 && res.data) {
        this.setData({
          feeder: res.data,
          hasFeeder: true,
          serviceTypesText: (res.data.serviceTypes || []).join('、') || '—',
          isLoading: false,
        })
        this._loadOrders()
      } else {
        this.setData({ hasFeeder: false, isLoading: false })
      }
    } catch (e) {
      console.error('[partner/feeding] _loadData error:', e)
      this.setData({ isLoading: false })
    }
  },

  async _loadOrders() {
    try {
      const res = await AdminService.getFeederOrders({ page: this.data.page, pageSize: this.data.pageSize })
      if (res.code === 0 && res.data) {
        const list = res.data.list || []
        this.setData({
          orders: list,
          orderTotal: res.data.total || 0,
          hasMore: list.length >= this.data.pageSize,
        })
      }
    } catch (e) {
      console.error('[partner/feeding] _loadOrders error:', e)
    }
  },
})
