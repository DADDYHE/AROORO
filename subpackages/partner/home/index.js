const { AdminService } = require('../../../services/CloudFunctionService')

const pageI18n = require('../../../utils/page-i18n.js')
const { ListBehavior } = require('../../../behaviors/listBehavior')

Page({
  ...pageI18n.mixin(),
  behaviors: [ListBehavior],
  data: {
    isLoading: true,
    hasPendingApplication: false,
    isPartner: false,
    incomeSummary: null,
    modules: [
      { id: 'income', title: '佣金管理', desc: '查看佣金与提现', icon: 'income', iconPath: '/images/icons/wallet-luxury-line.svg', path: '/subpackages/partner/income/index' },
      { id: 'serviceIncome', title: '收入管理', desc: '查看服务收入', icon: 'serviceIncome', iconPath: '/images/icons/dollar-sign-line.svg', path: '/subpackages/partner/service-income/index' },
      { id: 'referral', title: '推荐管理', desc: '查看带货数据', icon: 'referral', iconPath: '/images/icons/users-luxury-line.svg', path: '/subpackages/partner/referral/index' },
      { id: 'activity', title: '活动管理', desc: '管理活动与报名', icon: 'activity', iconPath: '/images/icons/celebration-luxury-line.svg', path: '/subpackages/partner/activity-list/index' },
      { id: 'hosting', title: '寄养档案', desc: '管理寄养家庭信息', icon: 'hosting', iconPath: '/images/icons/home-luxury-line.svg', path: '/subpackages/partner/hosting-profile/index' },
      { id: 'feeding', title: '上门服务', desc: '管理服务与订单', icon: 'feeding', iconPath: '/images/icons/paw-luxury-line.svg', path: '/subpackages/partner/feeding/index' },
      { id: 'application', title: '申请状态', desc: '查看审核进度', icon: 'application', iconPath: '/images/icons/clipboard-luxury-line.svg', path: '/subpackages/partner/application/index' },
    ],
  },

  onLoad() {
    this._initNavbarHeight()
    // Sprint 41 修复：partner 入口同步预检查，未登录直接返回
    // 修复：app.js 没有 globalData.identity，应使用 globalData.userInfo
    const userInfo = getApp()?.globalData?.userInfo
    if (!userInfo) {
      this.error('AUTH_REQUIRED')
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
    // isPartner 由 _loadData 异步从云端拉取后用 WXML wx:if 渲染，
    // 这里不再做硬性拦截（userInfo 是登录态，isPartner 是业务态）
    this._loadData()
  },

  onShow() {
    if (!this.data.isLoading) {this._loadData()}
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
              total: ((d.commission?.total || 0) + (d.activity?.total || 0) + (d.boarding?.total || 0) + (d.feeding?.total || 0)).toFixed(2),
              monthly: ((d.commission?.monthly || 0) + (d.activity?.monthly || 0) + (d.boarding?.monthly || 0) + (d.feeding?.monthly || 0)).toFixed(2),
              walletBalance: Number(d.wallet?.balance || 0).toFixed(2),
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
    if (!mod) {return}
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
