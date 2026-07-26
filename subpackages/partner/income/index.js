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
    activityText: '',
    hostingText: '',
    feedingText: '',
    details: [],
    detailTotal: 0,
    page: 1,
    pageSize: 20,
    hasMore: true,
    activeTab: 'all',
    // 提现弹窗
    showWithdrawModal: false,
    withdrawAmount: '',
    withdrawBalance: 0,
    isSubmitting: false,
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
      // walletCardTotalIncome：钱包卡片"总收入"展示值
      // 与"累计收入"卡片保持一致，避免 commissions 累加 vs wallets.totalIncome 历史记账口径不同导致数据不一致
      let walletCardTotalIncome = ''
      // 钱包卡片金额格式化到小数点后两位
      let walletBalanceText = ''
      let walletTotalWithdrawnText = ''
      if (overview) {
        const ct = overview.commission?.total || 0
        const at = overview.activity?.total || 0
        const ht = overview.hosting?.total || 0
        const ft = overview.feeding?.total || 0
        totalIncomeText = (ct + at + ht + ft).toFixed(2)
        commissionText = ct.toFixed(2)
        activityText = at.toFixed(2)
        hostingText = ht.toFixed(2)
        feedingText = ft.toFixed(2)
        walletCardTotalIncome = totalIncomeText
      }
      if (wallet) {
        walletBalanceText = (Number(wallet.balance) || 0).toFixed(2)
        walletTotalWithdrawnText = (Number(wallet.totalWithdrawn) || 0).toFixed(2)
      }

      this.setData({
        overview, wallet, commissionRates, totalIncomeText, commissionText, activityText, hostingText, feedingText,
        walletCardTotalIncome, walletBalanceText, walletTotalWithdrawnText,
        withdrawBalance: wallet ? Number(wallet.balance) || 0 : 0,
        isLoading: false,
      })
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
        // 转换 cloud:// 头像 URL 为可访问的临时 URL
        const cloudAvatars = list.filter(it => it.buyerAvatarUrl && it.buyerAvatarUrl.startsWith('cloud://'))
        if (cloudAvatars.length > 0) {
          const uniqueFileIds = [...new Set(cloudAvatars.map(it => it.buyerAvatarUrl))]
          try {
            const urlRes = await wx.cloud.getTempFileURL({ fileList: uniqueFileIds })
            const urlMap = {}
            ;(urlRes.fileList || []).forEach(f => {
              if (f.status === 0 && f.tempFileURL) {urlMap[f.fileID] = f.tempFileURL}
            })
            list.forEach(it => {
              if (it.buyerAvatarUrl && urlMap[it.buyerAvatarUrl]) {it.buyerAvatarUrl = urlMap[it.buyerAvatarUrl]}
            })
          } catch (e) {
            console.error('[partner/income] avatarUrl convert error:', e)
          }
        }
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
    if (!this.data.wallet || this.data.withdrawBalance < 1) {
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
      const res = await AdminService.requestWithdrawal(amount)
      if (res.code === 0) {
        wx.showToast({ title: '提现申请已提交', icon: 'success' })
        this.setData({ showWithdrawModal: false, withdrawAmount: '' })
        this._loadData()
      } else {
        wx.showToast({ title: res.message || '提现失败', icon: 'none' })
      }
    } catch (e) {
      wx.showToast({ title: e.message || '提现失败', icon: 'none' })
    } finally {
      this.setData({ isSubmitting: false })
    }
  },

  onWithdrawCancel() {
    this.setData({ showWithdrawModal: false, withdrawAmount: '' })
  },

  onWithdrawRecordsTap() {
    wx.navigateTo({ url: '/subpackages/partner/withdrawal/index' })
  },
})
