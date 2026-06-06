const { AdminService } = require('../../../services/CloudFunctionService')

const pageI18n = require('../../../utils/page-i18n.js')

Page({
  ...pageI18n.mixin(),
  data: {
    isLoading: true,
    overview: null,
    wallet: null,
    commissionRates: [],
    totalIncomeText: '',
    commissionText: '',
    hostingText: '',
    feedingText: '',
    details: [],
    detailTotal: 0,
    page: 1,
    pageSize: 20,
    hasMore: true,
    activeTab: 'all',
  },

  onLoad() {
    this._loadData()
  },

  async _loadData() {
    this.setData({ isLoading: true })
    try {
      const [overviewRes, walletRes, ratesRes] = await Promise.all([
        AdminService.getMyIncomeOverview(),
        AdminService.getMyWallet(),
        AdminService.getMyCommissionRates(),
      ])

      const overview = overviewRes.code === 0 && overviewRes.data ? overviewRes.data : null
      const wallet = walletRes.code === 0 && walletRes.data ? walletRes.data : null

      const TYPE_NAMES = { tuan: '团购', mall: '商城', activity: '活动', feeding: '喂养', hosting: '寄养' }
      const ratesData = ratesRes.code === 0 && ratesRes.data ? ratesRes.data : null
      const commissionRates = ratesData && ratesData.rates
        ? Object.keys(TYPE_NAMES).map(key => ({ key, name: TYPE_NAMES[key], rate: ratesData.rates[key] || 0 }))
        : Object.keys(TYPE_NAMES).map(key => ({ key, name: TYPE_NAMES[key], rate: 0 }))

      let totalIncomeText = ''
      let commissionText = ''
      let hostingText = ''
      let feedingText = ''
      if (overview) {
        const ct = overview.commission?.total || 0
        const ht = overview.hosting?.total || 0
        const ft = overview.feeding?.total || 0
        totalIncomeText = (ct + ht + ft).toFixed(2)
        commissionText = ct.toFixed(2)
        hostingText = ht.toFixed(2)
        feedingText = ft.toFixed(2)
      }

      this.setData({ overview, wallet, commissionRates, totalIncomeText, commissionText, hostingText, feedingText, isLoading: false })
      this._loadDetails()
    } catch (e) {
      console.error('[partner/income] _loadData error:', e)
      this.setData({ isLoading: false })
    }
  },

  async _loadDetails() {
    try {
      const res = await AdminService.getMyIncomeDetails({ type: this.data.activeTab, page: this.data.page, pageSize: this.data.pageSize })
      if (res.code === 0 && res.data) {
        const list = res.data.list || []
        this.setData({
          details: list,
          detailTotal: res.data.total || 0,
          hasMore: list.length >= this.data.pageSize,
        })
      }
    } catch (e) {
      console.error('[partner/income] _loadDetails error:', e)
    }
  },

  onTabChange(e) {
    const { tab } = e.currentTarget.dataset
    this.setData({ activeTab: tab, page: 1, details: [] })
    this._loadDetails()
  },

  onWithdrawTap() {
    this.error('CONTACT_SUPPORT_WITHDRAW')
  },
})
