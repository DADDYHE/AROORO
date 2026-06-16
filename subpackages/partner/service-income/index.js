const { AdminService } = require('../../../services/CloudFunctionService')

const pageI18n = require('../../../utils/page-i18n.js')

Page({
  ...pageI18n.mixin(),
  data: {
    isLoading: true,
    overview: null,
    activeTab: 'all',
    details: [],
    detailTotal: 0,
    page: 1,
    pageSize: 20,
    hasMore: true,
  },

  onLoad() {
    this._loadData()
  },

  onShow() {
    if (!this.data.isLoading) {
      this._loadData()
    }
  },

  async _loadData() {
    this.setData({ isLoading: true })
    try {
      const overviewRes = await AdminService.getServiceIncomeOverview()
      
      if (overviewRes.code === 0 && overviewRes.data) {
        const d = overviewRes.data
        this.setData({
          overview: {
            activity: d.activity || { total: 0, monthly: 0, today: 0, count: 0 },
            boarding: d.boarding || { total: 0, monthly: 0, today: 0, count: 0 },
            feeding: d.feeding || { total: 0, monthly: 0, today: 0, count: 0 },
            totalIncome: d.totalIncome || 0,
            monthlyIncome: d.monthlyIncome || 0,
            todayIncome: d.todayIncome || 0,
          },
        })
      }
      
      await this._loadDetails()
    } catch (e) {
      console.error('[service-income] _loadData error:', e)
    } finally {
      this.setData({ isLoading: false })
    }
  },

  async _loadDetails() {
    try {
      const res = await AdminService.getServiceIncomeDetails({
        type: this.data.activeTab,
        page: this.data.page,
        pageSize: this.data.pageSize,
      })
      
      if (res.code === 0 && res.data) {
        const list = res.data.list || []
        this.setData({
          details: this.data.page === 1 ? list : [...this.data.details, ...list],
          detailTotal: res.data.total || 0,
          hasMore: list.length >= this.data.pageSize,
        })
      }
    } catch (e) {
      console.error('[service-income] _loadDetails error:', e)
    }
  },

  onTabChange(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab === this.data.activeTab) return
    
    this.setData({
      activeTab: tab,
      page: 1,
      details: [],
    })
    this._loadDetails()
  },

  onLoadMore() {
    if (!this.data.hasMore) return
    
    this.setData({
      page: this.data.page + 1,
    })
    this._loadDetails()
  },

  onPullDownRefresh() {
    this._loadData().then(() => {
      wx.stopPullDownRefresh()
    })
  },
})
