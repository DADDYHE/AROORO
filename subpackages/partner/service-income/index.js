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
    // v5.1：收款方式与收款账号（与收入页共用同一 users.payee）
    payoutMethod: 'wechat',
    payee: {},
    currentChannelAccountText: '',
    payeeModalVisible: false,
    savingPayee: false,
    payeeForm: {
      wechat: '',
      alipay: '',
      bank: { bankName: '', cardNo: '', holder: '' },
    },
  },

  onLoad() {
    this._initNavbarHeight()
    this._loadData()
  },

  onShow() {
    if (this.data.isLoading) {return}
    const now = Date.now()
    // 30s 节流：窗口内返回走被动缓存加载（秒开），窗口外强制刷新（保证收入最新）
    if (this._lastShowRefresh && now - this._lastShowRefresh < 30000) {
      this._loadData()
      return
    }
    this._lastShowRefresh = now
    this._loadData({ forceRefresh: true })
  },

  // forceRefresh=true：提现等写操作/下拉后主动刷新，穿透 30s 前端缓存
  async _loadData({ forceRefresh = false } = {}) {
    this.setData({ isLoading: true })
    const opts = forceRefresh ? { useCache: false } : { useCache: true, cacheTime: 30000 }
    // P1：优先 BFF 聚合（4 次调用 → 1 次），失败回退旧多连
    try {
      const bundle = await this._loadBundle(opts)
      if (bundle) {
        this._renderOverview(bundle.overview, bundle.wallet, bundle.payee, bundle.details)
        return
      }
    } catch (e) {
      console.warn('[service-income] bundle failed, fallback to legacy:', e?.message || e)
    }
    await this._legacyLoad(opts)
  },

  async _loadBundle(opts) {
    const res = await AdminService.getServiceIncomeBundle({ pageSize: this.data.pageSize }, opts)
    if (!res || res.code !== 0 || !res.data) { return null }
    return res.data
  },

  // 兜底：原多连（overview+wallet 并行 → payee → details），保持 payee 独立容错
  async _legacyLoad(opts) {
    try {
      const [overviewRes, walletRes] = await Promise.all([
        AdminService.getServiceIncomeOverview(opts),
        AdminService.getMyWallet({ walletType: 'serviceIncome' }, opts),
      ])
      let payee = null
      try {
        const payeeRes = await AdminService.getMyPayeeAccounts(opts)
        if (payeeRes.code === 0 && payeeRes.data && payeeRes.data.payee) { payee = payeeRes.data.payee }
      } catch (e) {
        console.warn('[service-income] getMyPayeeAccounts failed:', e?.message || e)
      }
      this._renderOverview(
        overviewRes.code === 0 && overviewRes.data ? overviewRes.data : null,
        walletRes.code === 0 && walletRes.data ? walletRes.data : null,
        payee,
        null
      )
    } catch (e) {
      console.error('[service-income] _loadData error:', e)
      this.setData({ isLoading: false })
    }
  },

  // bundle 与 legacy 共用渲染：概览/钱包/payee/首屏详情一次落地
  _renderOverview(overviewData, wallet, payee, detailsBundle) {
    if (overviewData) {
      const d = overviewData
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
    if (wallet) {
      const balance = Number(wallet.balance) || 0
      this.setData({
        serviceBalanceText: balance.toFixed(2),
        withdrawBalance: balance,
        withdrawBalanceText: balance.toFixed(2),
      })
    }
    if (payee) { this._applyPayee(payee) }
    if (detailsBundle) {
      const list = detailsBundle.list || []
      this.setData({
        details: list,
        detailTotal: detailsBundle.total || 0,
        hasMore: list.length >= this.data.pageSize,
      })
    } else {
      this._loadDetails(false, true)
    }
    this.setData({ isLoading: false })
  },

  _applyPayee(payee) {
    this.setData({
      payee,
      payeeForm: {
        wechat: payee.wechat || '',
        alipay: payee.alipay || '',
        bank: {
          bankName: (payee.bank && payee.bank.bankName) || '',
          cardNo: (payee.bank && payee.bank.cardNo) || '',
          holder: (payee.bank && payee.bank.holder) || '',
        },
      },
    })
    this.syncCurrentChannel()
  },

  // useCache=true 仅用于 onLoad 被动首屏；tab 切换/分页为主动行为，穿透缓存保证新鲜
  async _loadDetails(append = false, useCache = false) {
    const loadingKey = append ? 'isLoadingMore' : 'isDetailLoading'
    this.setData({ [loadingKey]: true })
    try {
      const res = await AdminService.getServiceIncomeDetails(
        {
          type: this.data.activeTab,
          page: this.data.page,
          pageSize: this.data.pageSize,
        },
        useCache ? { useCache: true, cacheTime: 30000 } : {}
      )

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
    this._loadData({ forceRefresh: true }).then(() => {
      wx.stopPullDownRefresh()
    })
  },

  onWithdrawTap() {
    if (this.data.withdrawBalance < 1) {
      wx.showToast({ title: '可提现余额不足1元', icon: 'none' })
      return
    }
    const payee = this.data.payee || {}
    let payoutMethod = 'wechat'
    if (payee.alipay) {payoutMethod = 'alipay'}
    if (payee.bank && payee.bank.cardNo) {payoutMethod = 'bank'}
    if (payee.wechat) {payoutMethod = 'wechat'}
    this.setData({ showWithdrawModal: true, withdrawAmount: '', payoutMethod })
    this.syncCurrentChannel()
  },

  onPayoutMethodChange(e) {
    this.setData({ payoutMethod: e.detail.value })
    this.syncCurrentChannel()
  },

  syncCurrentChannel() {
    const payee = this.data.payee || {}
    const m = this.data.payoutMethod
    let text = ''
    if (m === 'wechat') {text = payee.wechat || ''}
    if (m === 'alipay') {text = payee.alipay || ''}
    if (m === 'bank') {
      const b = payee.bank || {}
      text = [b.bankName, b.cardNo, b.holder].filter(Boolean).join(' ')
    }
    this.setData({ currentChannelAccountText: text })
    return text
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
    if (!this.syncCurrentChannel()) {
      wx.showToast({ title: '请先在「收款账号」中预留该收款方式', icon: 'none' })
      this.openPayeeManage()
      return
    }

    this.setData({ isSubmitting: true })
    try {
      const res = await AdminService.requestWithdrawal(amount, 'serviceIncome', this.data.payoutMethod)
      if (res.code === 0) {
        wx.showToast({ title: '提现申请已提交', icon: 'success' })
        this.setData({ showWithdrawModal: false, withdrawAmount: '' })
        this._loadData({ forceRefresh: true })
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

  openPayeeManage() {
    const p = this.data.payee || {}
    this.setData({
      payeeModalVisible: true,
      payeeForm: {
        wechat: p.wechat || '',
        alipay: p.alipay || '',
        bank: {
          bankName: (p.bank && p.bank.bankName) || '',
          cardNo: (p.bank && p.bank.cardNo) || '',
          holder: (p.bank && p.bank.holder) || '',
        },
      },
    })
  },

  onPayeeInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`payeeForm.${field}`]: e.detail.value })
  },

  onBankInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`payeeForm.bank.${field}`]: e.detail.value })
  },

  closePayeeManage() {
    this.setData({ payeeModalVisible: false })
  },

  async onSavePayee() {
    const f = this.data.payeeForm
    const wechat = (f.wechat || '').trim()
    const alipay = (f.alipay || '').trim()
    const bankName = (f.bank.bankName || '').trim()
    const cardNo = (f.bank.cardNo || '').trim()
    const holder = (f.bank.holder || '').trim()
    if (alipay && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(alipay) && !/^1\d{10}$/.test(alipay)) {
      wx.showToast({ title: '支付宝账号格式不正确', icon: 'none' })
      return
    }
    if (cardNo && cardNo.length < 12) {
      wx.showToast({ title: '银行卡号格式不正确', icon: 'none' })
      return
    }
    if ((bankName || cardNo || holder) && (!bankName || !cardNo || !holder)) {
      wx.showToast({ title: '银行卡三项需填写完整', icon: 'none' })
      return
    }
    this.setData({ savingPayee: true })
    try {
      const payee = { wechat, alipay, bank: { bankName, cardNo, holder } }
      const res = await AdminService.updatePayeeAccounts(payee)
      if (res.code === 0) {
        this.setData({ payee, payeeModalVisible: false })
        this.syncCurrentChannel()
        wx.showToast({ title: '收款账号已保存', icon: 'success' })
      } else {
        wx.showToast({ title: res.message || '保存失败', icon: 'none' })
      }
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '保存失败', icon: 'none' })
    } finally {
      this.setData({ savingPayee: false })
    }
  },
})
