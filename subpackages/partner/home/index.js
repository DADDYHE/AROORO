const __i18n = require('../../../utils/i18n.js')
const __pageI18n = require('../../../utils/page-i18n.js')
const __i18nT = (k) => __i18n.t(k, __i18n.getLocale())
const { AdminService } = require('../../../services/CloudFunctionService')

const pageI18n = require('../../../utils/page-i18n.js')
const { ListBehavior } = require('../../../behaviors/listBehavior')

Page({
  ...pageI18n.mixin(),
  behaviors: [ListBehavior],
  data: {
    t: __pageI18n.buildTMap(__i18n.getLocale()),
    isLoading: true,
    hasPendingApplication: false,
    isPartner: false,
    incomeSummary: null,
    modules: [
      { id: 'income', title: '佣金管理', desc: '查看佣金与提现', icon: 'income', iconPath: '/images/icons/wallet-luxury-line.svg', path: '/subpackages/partner/income/index' },
      { id: 'serviceIncome', title: '收入管理', desc: '查看服务收入', icon: 'serviceIncome', iconPath: '/images/icons/dollar-sign-line.svg', path: '/subpackages/partner/service-income/index' },
      { id: 'referral', title: '推荐管理', desc: '查看带货数据', icon: 'referral', iconPath: '/images/icons/users-luxury-line.svg', path: '/subpackages/partner/referral/index' },
      { id: 'activity', title: __i18nT('BIZ_E4OKK2'), desc: '管理活动与报名', icon: 'activity', iconPath: '/images/icons/celebration-luxury-line.svg', path: '/subpackages/partner/activity-list/index' },
      { id: 'hosting', title: '家庭寄养', desc: '管理寄养家庭信息', icon: 'hosting', iconPath: '/images/icons/home-luxury-line.svg', path: '/subpackages/partner/hosting-profile/index' },
      { id: 'feeding', title: __i18nT('BIZ_AGSVKI'), desc: '管理服务与订单', icon: 'feeding', iconPath: '/images/icons/paw-luxury-line.svg', path: '/subpackages/partner/feeding/index' },
      { id: 'application', title: __i18nT('BIZ_FD7PYN'), desc: '查看审核进度', icon: 'application', iconPath: '/images/icons/clipboard-luxury-line.svg', path: '/subpackages/partner/application/index' },
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
    // 节流：30s 内不重复全量刷新（从子页返回时避免无谓的云调用）
    const now = Date.now()
    if (this._lastLoadedAt && now - this._lastLoadedAt < 30000) { return }
    this._loadData()
  },

  async _loadData() {
    this.setData({ isLoading: true })
    const startAt = Date.now()
    try {
      // 性能优化（2026-09-01）：优先走 BFF 聚合接口，1 次云调用取代 3 次
      //   3 次冷启 + 3 次 RTT → 1 次冷启 + 1 次 RTT
      const bundle = await this._loadBundle()
      if (bundle) {
        this.setData({
          isLoading: false,
          isPartner: bundle.isPartner,
          hasPendingApplication: bundle.hasPendingApplication,
          incomeSummary: bundle.incomeSummary,
        })
        this._lastLoadedAt = Date.now()
        console.log('[partner/home] load cost(ms):', Date.now() - startAt)
        return
      }
    } catch (e) {
      console.warn('[partner/home] bundle failed, fallback to legacy:', e.message || e)
    }

    // 兜底：聚合接口不可用时回退旧的三连调用（并行 + 串行 income）
    try {
      const [permRes, appRes] = await Promise.all([
        AdminService.getMyPermissions(),
        AdminService.getApplicationStatus(),
      ])

      const isPartner = permRes.code === 0 && permRes.data && permRes.data.isPartner === true
      const hasPending = appRes.code === 0 && appRes.data ? appRes.data.hasPending || false : false

      let incomeSummary = null
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
      this._lastLoadedAt = Date.now()
    } catch (e) {
      console.error('[partner/home] _loadData error:', e)
      this.setData({ isLoading: false })
    }
  },

  /** 调用 BFF 聚合接口；返回 null 表示不可用（需回退） */
  async _loadBundle() {
    const res = await AdminService.getPartnerHome()
    if (!res || res.code !== 0 || !res.data) { return null }
    const d = res.data
    return {
      isPartner: d.isPartner === true,
      hasPendingApplication: d.hasPendingApplication === true,
      incomeSummary: d.incomeSummary || null,
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
    // P1：点击跳转瞬间后台预热目标页首屏数据（与子页面 onLoad 同参数写 30s 缓存），
    //   跳转后子页面命中缓存 → 首次进入也秒开；失败静默（子页面自身有兜底）
    this._prewarmModule(id)
    wx.navigateTo({ url: mod.path })
  },

  // fire-and-forget 预热：不 await、失败静默，仅承担「把数据提前拉进前端缓存」职责
  _prewarmModule(id) {
    const CACHE = { useCache: true, cacheTime: 30000 }
    try {
      const warm = (p) => p.catch(err => console.warn('[partner/home] prewarm failed:', err?.message || err))
      if (id === 'income') {
        warm(AdminService.getPartnerIncomeBundle({ pageSize: 20 }, CACHE))
      } else if (id === 'serviceIncome') {
        warm(AdminService.getServiceIncomeBundle({ pageSize: 20 }, CACHE))
      } else if (id === 'referral') {
        warm(AdminService.getReferralBundle({ pageSize: 20 }, CACHE))
      }
    } catch (e) {
      console.warn('[partner/home] prewarm error:', e?.message || e)
    }
  },

  onApplyTap() {
    wx.navigateTo({ url: '/subpackages/partner/application/index' })
  },
})
