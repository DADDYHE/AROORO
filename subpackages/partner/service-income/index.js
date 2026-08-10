const { AdminService } = require('../../../services/CloudFunctionService')

const pageI18n = require('../../../utils/page-i18n.js')
const { ListBehavior } = require('../../../behaviors/listBehavior')

Page({
  ...pageI18n.mixin(),
  behaviors: [ListBehavior],
  data: {
    isLoading: true,
    overview: null,
    activeTab: 'all',
    details: [],
    detailTotal: 0,
    page: 1,
    pageSize: 20,
    hasMore: true,
    isDetailLoading: false,
    isLoadingMore: false,
    // 服务收入钱包（P2 修复：服务收入也支持提现）
    serviceBalanceText: '0.00',
    withdrawBalance: 0,
    withdrawBalanceText: '0.00',
    showWithdrawModal: false,
    withdrawAmount: '',
    isSubmitting: false,
  },

  onLoad() {
    this._initNavbarHeight()
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
      const [overviewRes, walletRes] = await Promise.all([
        AdminService.getServiceIncomeOverview(),
        AdminService.getMyWallet({ walletType: 'serviceIncome' }),
      ])
      
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

      if (walletRes.code === 0 && walletRes.data) {
        const balance = Number(walletRes.data.balance) || 0
        this.setData({
          serviceBalanceText: balance.toFixed(2),
          withdrawBalance: balance,
          withdrawBalanceText: balance.toFixed(2),
        })
      }
      
      await this._loadDetails()
    } catch (e) {
      console.error('[service-income] _loadData error:', e)
    } finally {
      this.setData({ isLoading: false })
    }
  },

  async _loadDetails(append = false) {
    const loadingKey = append ? 'isLoadingMore' : 'isDetailLoading'
    this.setData({ [loadingKey]: true })
    try {
      const res = await AdminService.getServiceIncomeDetails({
        type: this.data.activeTab,
        page: this.data.page,
        pageSize: this.data.pageSize,
      })

      if (res.code === 0 && res.data) {
        const list = res.data.list || []
        this.setData({
          details: append ? [...this.data.details, ...list] : list,
          detailTotal: res.data.total || 0,
          hasMore: list.length >= this.data.pageSize,
        })
      }
    } catch (e) {
      console.error('[service-income] _loadDetails error:', e)
    } finally {
      this.setData({ [loadingKey]: false })
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

  onReachBottom() {
    if (this.data.isDetailLoading || this.data.isLoading || !this.data.hasMore) {return}
    this.setData({ page: this.data.page + 1 })
    return this._loadDetails(true)
  },

  onPullDownRefresh() {
    this._loadData().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  onWithdrawTap() {
    if (this.data.withdrawBalance < 1) {
      wx.showToast({ title: '可提现余额不足1元', icon: 'none' })
      return
    }
    this.setData({ showWithdrawModal: true, withdrawAmount: '' })
  },

  onWithdrawAmountInput(e) {
    this.setData({ withdrawAmount: e.detail.value })
  },

  onWithdrawAll() {
    const maxAmount = Math.min(this.data.withdrawBalance, 500)
    this.setData({ withdrawAmount: maxAmount.toFixed(2) })
  },

  async onWithdrawConfirm() {
    const amount = Number(this.data.withdrawAmount)
    if (!amount || amount < 1) {
      wx.showToast({ title: '最低提现1元', icon: 'none' })
      return
    }
    if (amount > this.data.withdrawBalance) {
      wx.showToast({ title: '超出可提现余额', icon: 'none' })
      return
    }
    if (amount > 500) {
      wx.showToast({ title: '单笔最高提现500元', icon: 'none' })
      return
    }

    this.setData({ isSubmitting: true })
    try {
      const res = await AdminService.requestWithdrawal(amount, 'serviceIncome')
      if (res.code === 0) {
        wx.showToast({ title: '提现申请已提交', icon: 'success' })
        this.setData({ showWithdrawModal: false, withdrawAmount: '' })
        this._loadData()
      } else {
        wx.showToast({ title: res.message || '提现失败', icon: 'none' })
      }
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '提现失败', icon: 'none' })
    } finally {
      this.setData({ isSubmitting: false })
    }
  },

  onWithdrawCancel() {
    this.setData({ showWithdrawModal: false, withdrawAmount: '' })
  },
})
