const __i18n = require('../../utils/i18n.js')
const __pageI18n = require('../../utils/page-i18n.js')
const __i18nT = (k) => __i18n.t(k, __i18n.getLocale())
const { TuanService } = require('../../services/TuanService')
const { CouponService } = require('../../services/CouponService')
const tabBarSyncBehavior = require('../../behaviors/tabBarSync')
const cloudImageBehavior = require('../../behaviors/cloudImageBehavior')
const shareEntryBehavior = require('../../behaviors/shareEntryBehavior')
const { ListBehavior } = require('../../behaviors/listBehavior')

const pageI18n = require('../../utils/page-i18n.js')
const { buildSharePath } = require('../../utils/share')

const ACCENT_COLORS = {
  fixed_amount: '#C9A24B',
  discount: '#6B7D8C',
  full_reduction: '#C9A24B',
}

Page({
  ...pageI18n.mixin(),
  behaviors: [ListBehavior, tabBarSyncBehavior, cloudImageBehavior, shareEntryBehavior],

  data: {
  ...__pageI18n.buildTMap(__i18n.getLocale()),
    dealList: [],
    total: 0,
    refreshing: false,
    shareDealId: '',
    shareDealTitle: '',
    // 弹窗发券
    popupCoupon: null,
    popupClaiming: false,
  },

  onLoad() {
    this._initNavbarHeight()
    this._initListBehavior(
      params => this._doFetch(params),
      { pageSize: 10, listKey: 'dealList' }
    )
    this._resetAndLoad()
  },

  onShow() {
    this._syncTabBar()
    this._checkPopupCoupon()
  },

  onPullDownRefresh() {
    this.setData({ refreshing: true })
    this._onPullDownRefresh().finally(() => {
      this.setData({ refreshing: false })
    })
  },

  onReachBottom() {
    this._onReachBottom()
  },

  async _doFetch(params) {
    const res = await TuanService.getTuanDealList({ page: params.page, pageSize: params.pageSize })
    const data = res?.data || res || {}
    return data.list || data.data || []
  },

  async _checkPopupCoupon() {
    // 防骚扰：本次会话已弹过则不再弹
    if (this._popupDismissed) { return }

    try {
      // 性能优化（2026-09-01）：30s 缓存，tab 切回避免重复查询弹窗券
      const result = await CouponService.getPopupCoupon({ page: 'tuan' }, { useCache: true, cacheTime: 30000 })
      if (result && result.code === 0 && result.data) {
        const coupon = result.data
        coupon.accentColor = ACCENT_COLORS[coupon.type] || '#C9A24B'
        this.setData({ popupCoupon: coupon })
      }
    } catch (e) {
      // 静默失败，不影响页面
    }
  },

  async onClaimPopupCoupon() {
    const { popupCoupon } = this.data
    if (!popupCoupon) { return }

    this.setData({ popupClaiming: true })
    try {
      const res = await CouponService.claimCoupon(popupCoupon.templateId, 'popup')
      if (res && res.code === 0) {
        this.setData({ popupCoupon: null })
        wx.showToast({ title: '领取成功', icon: 'success' })
      } else {
        wx.showToast({ title: res?.message || '领取失败', icon: 'none' })
      }
    } catch (e) {
      wx.showToast({ title: '领取失败', icon: 'none' })
    } finally {
      this.setData({ popupClaiming: false })
      this._popupDismissed = true
    }
  },

  onClosePopupCoupon() {
    this.setData({ popupCoupon: null })
    this._popupDismissed = true
  },

  onDealTap(e) {
    const id = e.currentTarget.dataset.id
    if (!id) { return }
    wx.navigateTo({ url: `/pages/group-detail/index?dealId=${id}` })
  },

  onShareAppMessage() {
    return {
      title: 'AROORO 宠团团 - 超值拼团等你来',
      path: buildSharePath('/pages/discover/index'),
    }
  },
})
