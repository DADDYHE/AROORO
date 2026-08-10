const { AdminService } = require('../../../services/CloudFunctionService')

const pageI18n = require('../../../utils/page-i18n.js')
const { ListBehavior } = require('../../../behaviors/listBehavior')

Page({
  ...pageI18n.mixin(),
  behaviors: [ListBehavior],
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
    isDetailLoading: false,
    isLoadingMore: false,
    // 提现弹窗
    showWithdrawModal: false,
    withdrawAmount: '',
    withdrawBalance: 0,
    isSubmitting: false,
    // v5.1：收款方式与收款账号
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

  async _loadData() {
    this.setData({ isLoading: true })
    try {
      const [overviewRes, walletRes] = await Promise.all([
        AdminService.getMyIncomeOverview(),
        AdminService.getMyWallet(),
      ])

      const overview = overviewRes.code === 0 && overviewRes.data ? overviewRes.data : null
      const wallet = walletRes.code === 0 && walletRes.data ? walletRes.data : null

      const TYPE_NAMES = { tuan: '团购', mall: '商城', activity: '活动', feeding: '喂养', hosting: '寄养' }
      // 佣金率查询独立容错：失败（如云函数未部署最新版）不阻塞收入/钱包展示
      let ratesData = null
      try {
        const ratesRes = await AdminService.getMyCommissionRates()
        ratesData = ratesRes.code === 0 && ratesRes.data ? ratesRes.data : null
      } catch (e) {
        console.warn('[partner/income] getMyCommissionRates failed:', e?.message || e)
        ratesData = null
      }
      const commissionRates = ratesData && ratesData.rates
        ? Object.keys(TYPE_NAMES).map(key => ({ key, name: TYPE_NAMES[key], rate: ratesData.rates[key] || 0 }))
        : Object.keys(TYPE_NAMES).map(key => ({ key, name: TYPE_NAMES[key], rate: 0 }))

      let totalIncomeText = ''
      let commissionText = ''
      let hostingText = ''
      let feedingText = ''
      // walletCardTotalIncome：钱包卡片"总收入"展示值
      // 与"累计佣金"卡片保持一致，避免 commissions 累加 vs wallets.totalIncome 历史记账口径不同导致数据不一致
      let walletCardTotalIncome = ''
      // 钱包卡片金额格式化到小数点后两位
      let walletBalanceText = ''
      let walletTotalWithdrawnText = ''
      if (overview) {
        const ct = overview.commission?.total || 0
        const at = overview.activity?.total || 0
        const ht = overview.boarding?.total || 0
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
      // v5.1：收款账号（失败不阻塞收入展示）
      try {
        const payeeRes = await AdminService.getMyPayeeAccounts()
        if (payeeRes.code === 0 && payeeRes.data && payeeRes.data.payee) {
          const p = payeeRes.data.payee
          this.setData({
            payee: p,
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
          this.syncCurrentChannel()
        }
      } catch (e) {
        console.warn('[partner/income] getMyPayeeAccounts failed:', e?.message || e)
      }
      this._loadDetails()
    } catch (e) {
      console.error('[partner/income] _loadData error:', e)
      this.setData({ isLoading: false })
    }
  },

  async _loadDetails(append = false) {
    const loadingKey = append ? 'isLoadingMore' : 'isDetailLoading'
    this.setData({ [loadingKey]: true })
    try {
      const res = await AdminService.getMyIncomeDetails({ type: this.data.activeTab, page: this.data.page, pageSize: this.data.pageSize })
      if (res.code === 0 && res.data) {
        let list = res.data.list || []
        // v5.1：佣金状态展示（待结算/已结算/已取消/已冲销）
        const COMMISSION_STATUS_MAP = {
          pending: { text: '待结算', color: '#C9A24B' },
          settled: { text: '已结算', color: '#5B7C4A' },
          cancelled: { text: '已取消', color: '#9A9489' },
          reversed: { text: '已冲销', color: '#A85B4A' },
        }
        list = list.map(it => {
          const st = COMMISSION_STATUS_MAP[it.status] || { text: it.status || '待结算', color: '#9A9489' }
          return { ...it, statusText: st.text, statusColor: st.color }
        })
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
        const details = append ? this.data.details.concat(list) : list
        this.setData({
          details,
          detailTotal: res.data.total || 0,
          hasMore: list.length >= this.data.pageSize,
        })
      }
    } catch (e) {
      console.error('[partner/income] _loadDetails error:', e)
    } finally {
      this.setData({ [loadingKey]: false })
    }
  },

  onTabChange(e) {
    const { tab } = e.currentTarget.dataset
    this.setData({ activeTab: tab, page: 1, details: [] })
    this._loadDetails()
  },

  onReachBottom() {
    if (this.data.isDetailLoading || this.data.isLoading || !this.data.hasMore) {return}
    this.setData({ page: this.data.page + 1 })
    return this._loadDetails(true)
  },

  onWithdrawTap() {
    if (!this.data.wallet || this.data.withdrawBalance < 1) {
      wx.showToast({ title: '可提现余额不足1元', icon: 'none' })
      return
    }
    // 默认选中第一个已预留渠道，否则微信
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
    // v5.1：所选收款方式必须已预留账号
    if (!this.syncCurrentChannel()) {
      wx.showToast({ title: '请先在「收款账号」中预留该收款方式', icon: 'none' })
      this.openPayeeManage()
      return
    }

    this.setData({ isSubmitting: true })
    try {
      const res = await AdminService.requestWithdrawal(amount, 'commission', this.data.payoutMethod)
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

  // ===== 收款账号管理（v5.1） =====
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

  onWithdrawRecordsTap() {
    wx.navigateTo({ url: '/subpackages/partner/withdrawal/index' })
  },
})
