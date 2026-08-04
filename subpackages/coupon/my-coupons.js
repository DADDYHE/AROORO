const { CouponService } = require('../../services/CouponService')
const { getAccentColor, translateScopes } = require('./coupon-utils')

function formatRule(coupon) {
  if (!coupon || !coupon.rules) {return ''}
  const { type, rules } = coupon
  switch (type) {
  case 'full_reduction':
    return `满${rules.threshold}减${rules.reduceAmount}`
  case 'fixed_amount':
    return `立减${rules.reduceAmount}元`
  case 'discount': {
    let text = `${rules.discountRate ? Math.round(rules.discountRate * 100) : '—'}折`
    if (rules.maxReduceAmount) {text += `（最高${rules.maxReduceAmount}元）`}
    return text
  }
  default:
    return ''
  }
}

function formatEndTime(dateStr) {
  if (!dateStr) {return ''}
  const d = new Date(dateStr)
  const now = new Date()
  const diff = d.getTime() - now.getTime()
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24))
  if (days <= 0) {return '即将过期'}
  if (days <= 3) {return `${days}天后过期`}
  const m = d.getMonth() + 1
  const day = d.getDate()
  return `${m}.${day}到期`
}

const pageI18n = require('../../utils/page-i18n.js')
const { ListBehavior } = require('../../behaviors/listBehavior')

Page({
  ...pageI18n.mixin(),
  behaviors: [ListBehavior],
  data: {
    coupons: [],
    claimableTemplates: [],
    tabs: [
      { key: 'all', label: '全部' },
      { key: 'unused', label: '未使用' },
      { key: 'used', label: '已使用' },
      { key: 'expired', label: '已过期' },
    ],
    activeTab: 'all',
    page: 1,
    hasMore: true,
    isLoading: false,
    _tick: Date.now(),
  },

  onLoad() {
    this._initNavbarHeight()
    this._loadData()
    this._startExpiryTimer()
  },

  onShow() {
    this.setData({ page: 1, coupons: [], hasMore: true })
    this._loadData()
  },

  onUnload() {
    this._stopExpiryTimer()
  },

  onHide() {
    this._stopExpiryTimer()
  },

  _startExpiryTimer() {
    this._stopExpiryTimer()
    this._expiryTimer = setInterval(() => {
      this.setData({ _tick: Date.now() })
    }, 60000)
  },

  _stopExpiryTimer() {
    if (this._expiryTimer) {
      clearInterval(this._expiryTimer)
      this._expiryTimer = null
    }
  },

  onTabChange(e) {
    const key = e.currentTarget.dataset.key
    this.setData({ activeTab: key, page: 1, coupons: [], hasMore: true })
    this._loadData()
  },

  _loadData() {
    if (this.data.activeTab === 'claim') {
      this._loadClaimableTemplates()
    } else {
      this._loadCoupons()
    }
  },

  onGoClaimCenter() {
    wx.navigateTo({
      url: '/subpackages/coupon/claim-center',
      success: () => console.log('[my-coupons] navigateTo claim-center success'),
      fail: (err) => {
        console.error('[my-coupons] navigateTo claim-center fail', err)
        this.errorDynamic(err && err.errMsg, 'JUMP_FAILED')
      },
    })
  },

  async _loadClaimableTemplates() {
    if (this.data.isLoading) {return}
    this.setData({ isLoading: true })
    try {
      const result = await CouponService.getClaimableTemplates({
        page: this.data.page,
        pageSize: 20,
      })
      if (result && result.code === 0) {
        const list = (result.data.list || []).map(item => ({
          ...item,
          accentColor: getAccentColor(item.type),
          scopeLabels: translateScopes(item.applicableScopes),
        }))
        this.setData({
          claimableTemplates: this.data.page === 1 ? list : [...this.data.claimableTemplates, ...list],
          hasMore: list.length >= 20,
        })
      }
    } catch (e) {
      this.error('LOAD_FAILED')
    } finally {
      this.setData({ isLoading: false })
    }
  },

  async _loadCoupons() {
    if (this.data.isLoading) {return}
    this.setData({ isLoading: true })
    try {
      // 所有 tab 统一仅显示近 6 个月的优惠券
      const sixMonthsAgo = Date.now() - 180 * 24 * 60 * 60 * 1000
      const params = { page: this.data.page, pageSize: 50 }
      if (this.data.activeTab !== 'all') {params.status = this.data.activeTab}
      const result = await CouponService.getMyCoupons(params)
      if (result && result.code === 0) {
        const rawList = result.data.list || []
        const filtered = rawList.filter(c => {
          const t = new Date(c.createdAt || c.claimedAt || 0).getTime()
          return t >= sixMonthsAgo
        })
        const list = filtered.map(item => ({
          ...item,
          accentColor: getAccentColor(item.type),
          scopeLabels: translateScopes(item.applicableScopes),
        }))
        this.setData({
          coupons: this.data.page === 1 ? list : [...this.data.coupons, ...list],
          hasMore: filtered.length >= 20,
        })
      }
    } catch (e) {
      this.error('LOAD_FAILED')
    } finally {
      this.setData({ isLoading: false })
    }
  },

  onLoadMore() {
    if (!this.data.hasMore || this.data.isLoading) {return}
    this.setData({ page: this.data.page + 1 })
    this._loadData()
  },

  async onClaimCoupon(e) {
    const { id } = e.currentTarget.dataset
    try {
      const result = await CouponService.claimCoupon(id, 'claim')
      if (result && result.code === 0) {
        this.toast('COUPON_CLAIM_SUCCESS')
        this.setData({ page: 1, claimableTemplates: [] })
        this._loadClaimableTemplates()
      } else {
        this.errorDynamic((result && result.message), 'COUPON_CLAIM_FAILED')
      }
    } catch (err) {
      this.errorDynamic(err.message, 'COUPON_CLAIM_FAILED')
    }
  },

  onUseCoupon(e) {
    let scopes = e.currentTarget.dataset.scope
    // WXML 把 data-* 数组自动 JSON 序列化
    if (typeof scopes === 'string') {
      try { scopes = JSON.parse(scopes) } catch (_) { scopes = [scopes] }
    }
    const scopeList = Array.isArray(scopes) ? scopes : (scopes ? [scopes] : [])

    // tabBar 页面必须用 switchTab
    const tabPages = {
      tuan: '/pages/discover/index',
      hosting: '/pages/quick-register/index',
      feeding: '/pages/service/index',
    }
    // 普通分包页面用 navigateTo
    const subPages = {
      activity: '/subpackages/activity/list',
      mall: '/subpackages/mall/product-list',
    }

    // 全模块通用或包含 all 时，跳转到首页
    if (scopeList.includes('all') || scopeList.length === 0) {
      wx.switchTab({ url: '/pages/home/index' })
      return
    }

    // 优先跳转 tabBar 页面
    for (const scope of scopeList) {
      if (tabPages[scope]) {
        wx.switchTab({ url: tabPages[scope] })
        return
      }
    }
    // 再跳转分包页面
    for (const scope of scopeList) {
      if (subPages[scope]) {
        wx.navigateTo({ url: subPages[scope] })
        return
      }
    }
    wx.switchTab({ url: '/pages/home/index' })
  },

  formatRule,
  formatEndTime,
})
