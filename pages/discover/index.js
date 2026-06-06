const { TuanService } = require('../../services/TuanService')
const { CouponService } = require('../../services/CouponService')
const tabBarSyncBehavior = require('../../behaviors/tabBarSync')
const cloudImageBehavior = require('../../behaviors/cloudImageBehavior')

const pageI18n = require('../../utils/page-i18n.js')

const ACCENT_COLORS = {
  fixed_amount: '#C4956A',
  discount: '#8BA4B8',
  full_reduction: '#D4A853',
}

Page({
  ...pageI18n.mixin(),
  behaviors: [tabBarSyncBehavior, cloudImageBehavior],

  data: {
    dealList: [],
    page: 1,
    pageSize: 10,
    total: 0,
    hasMore: true,
    loading: false,
    refreshing: false,
    shareDealId: '',
    shareDealTitle: '',
    // 弹窗发券
    popupCoupon: null,
    popupClaiming: false,
  },

  onLoad() {
    this._loadDeals(true)
  },

  onShow() {
    this._syncTabBar()
    this._checkPopupCoupon()
  },

  onPullDownRefresh() {
    this.setData({ refreshing: true })
    this._loadDeals(true).finally(() => {
      wx.stopPullDownRefresh()
      this.setData({ refreshing: false })
    })
  },

  onReachBottom() {
    if (!this.data.hasMore || this.data.loading) { return }
    this.setData({ page: this.data.page + 1 })
    this._loadDeals(false)
  },

  async _loadDeals(reset) {
    if (this.data.loading) { return }
    this.setData({ loading: true })
    const page = reset ? 1 : this.data.page
    try {
      const res = await TuanService.getTuanDealList({ page, pageSize: this.data.pageSize })
      const data = res?.data || res || {}
      const list = data.list || data.data || []
      const total = data.total || list.length || 0
      if (reset) {
        this.setData({ dealList: list, page: 1, total, hasMore: list.length < total })
      } else {
        const merged = this.data.dealList.concat(list)
        this.setData({ dealList: merged, total, hasMore: merged.length < total })
      }
    } catch (e) {
      console.error('[宠团团] 加载团购列表失败:', e)
    } finally {
      this.setData({ loading: false })
    }
  },

  async _checkPopupCoupon() {
    // 防骚扰：本次会话已弹过则不再弹
    const dismissedKey = 'popup_dismissed_tuan'
    if (this._popupDismissed) return

    try {
      const result = await CouponService.getPopupCoupon({ page: 'tuan' })
      if (result && result.code === 0 && result.data) {
        const coupon = result.data
        coupon.accentColor = ACCENT_COLORS[coupon.type] || '#C4956A'
        this.setData({ popupCoupon: coupon })
      }
    } catch (e) {
      // 静默失败，不影响页面
    }
  },

  async onClaimPopupCoupon() {
    const { popupCoupon } = this.data
    if (!popupCoupon) return

    this.setData({ popupClaiming: true })
    try {
      const result = await CouponService.claimCoupon(popupCoupon.templateId, 'popup')
      if (result && result.code === 0) {
        this._popupDismissed = true
        this.setData({ popupCoupon: null, popupClaiming: false })
        this.toast('COUPON_CLAIM_SUCCESS')
      } else {
        this.errorDynamic((result && result.message), 'COUPON_CLAIM_FAILED')
        this.setData({ popupClaiming: false })
      }
    } catch (e) {
      this.errorDynamic(e.message, 'COUPON_CLAIM_FAILED')
      this.setData({ popupClaiming: false })
    }
  },

  onClosePopupCoupon() {
    this._popupDismissed = true
    this.setData({ popupCoupon: null })
  },

  onDealTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/group-detail/index?dealId=${id}` })
  },

  onShareDeal(e) {
    const { id, title } = e.currentTarget.dataset
    this.setData({ shareDealId: id, shareDealTitle: title })
  },

  onShareAppMessage() {
    const dealId = this.data.shareDealId
    const title = this.data.shareDealTitle || '超值拼团'
    const userInfo = getApp().globalData.userInfo
    const inviterId = ((userInfo?.isPartner || userInfo?.permissions?.length) && userInfo?.openid) ? userInfo.openid : ''
    const basePath = `/pages/group-detail/index?dealId=${dealId}`
    return {
      title: `${title} - 宠团团`,
      path: inviterId ? `${basePath}&inviterId=${inviterId}` : basePath,
    }
  },
})
