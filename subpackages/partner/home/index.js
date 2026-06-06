const { AdminService } = require('../../../services/CloudFunctionService')

const pageI18n = require('../../../utils/page-i18n.js')

Page({
  ...pageI18n.mixin(),
  data: {
    isLoading: true,
    hasPendingApplication: false,
    isPartner: false,
    incomeSummary: null,
    modules: [
      { id: 'activity', title: '活动管理', desc: '管理活动与报名', icon: 'activity', path: '/subpackages/partner/activity-list/index' },
      { id: 'hosting', title: '寄养档案', desc: '管理寄养家庭信息', icon: 'hosting', path: '/subpackages/partner/hosting-profile/index' },
      { id: 'feeding', title: '上门服务', desc: '管理服务与订单', icon: 'feeding', path: '/subpackages/partner/feeding/index' },
      { id: 'income', title: '收入概览', desc: '查看收入与提现', icon: 'income', path: '/subpackages/partner/income/index' },
      { id: 'referral', title: '推荐用户', desc: '查看带货数据', icon: 'referral', path: '/subpackages/partner/referral/index' },
      { id: 'application', title: '申请状态', desc: '查看审核进度', icon: 'application', path: '/subpackages/partner/application/index' },
    ],
  },

  onLoad() {
    // 仅做登录态检查（isPartner 留给异步 _loadData 校验，避免破坏申请流程）
    const userInfo = getApp().globalData.userInfo
    if (!userInfo) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      setTimeout(() => {
        const pages = getCurrentPages()
        if (pages.length > 1) {
          wx.navigateBack()
        } else {
          wx.switchTab({ url: '/pages/profile/index' })
        }
      }, 1500)
      return
    }
    this._loadData()
  },

  onShow() {
    if (!this.data.isLoading) this._loadData()
  },

  async _loadData() {
    this.setData({ isLoading: true })
    try {
      // 先获取权限和申请状态（无需合作伙伴身份）
      const [permRes, appRes] = await Promise.all([
        AdminService.getMyPermissions(),
        AdminService.getApplicationStatus(),
      ])

      const isPartner = permRes.code === 0 && permRes.data && permRes.data.isPartner === true
      const hasPending = appRes.code === 0 && appRes.data ? appRes.data.hasPending || false : false

      let incomeSummary = null
      // 只有合作伙伴才获取收入数据
      if (isPartner) {
        try {
          const incomeRes = await AdminService.getMyIncomeOverview()
          if (incomeRes.code === 0 && incomeRes.data) {
            const d = incomeRes.data
            incomeSummary = {
              total: ((d.commission?.total || 0) + (d.hosting?.total || 0) + (d.feeding?.total || 0)).toFixed(2),
              monthly: ((d.commission?.monthly || 0) + (d.hosting?.monthly || 0) + (d.feeding?.monthly || 0)).toFixed(2),
              walletBalance: d.wallet?.balance || 0,
            }
          }
        } catch (e) {
          console.warn('[partner/home] getMyIncomeOverview failed:', e.message || e)
        }
      }

      this.setData({
        isLoading: false,
        isPartner,
        hasPendingApplication: hasPending,
        incomeSummary,
      })
    } catch (e) {
      console.error('[partner/home] _loadData error:', e)
      this.setData({ isLoading: false })
    }
  },

  onModuleTap(e) {
    const { id } = e.currentTarget.dataset
    const mod = this.data.modules.find(m => m.id === id)
    if (!mod) return
    if (!this.data.isPartner) {
      this.error('BIZ_160DFJX')
      return
    }
    wx.navigateTo({ url: mod.path })
  },

  onApplyTap() {
    wx.navigateTo({ url: '/subpackages/partner/application/index' })
  },
})
