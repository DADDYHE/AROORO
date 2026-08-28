const { CouponService } = require('../../services/CouponService')
const { getAccentColor, translateScopes, isTemplateExpired, getClaimBtnState } = require('./coupon-utils')

const pageI18n = require('../../utils/page-i18n.js')
const { ListBehavior } = require('../../behaviors/listBehavior')
const { requireLogin } = require('../../utils/require-login')

Page({
  ...pageI18n.mixin(),
  behaviors: [ListBehavior],
  data: {
    templates: [],
    page: 1,
    pageSize: 20,
    hasMore: true,
    isLoading: false,
  },

  onLoad() {
    this._initNavbarHeight()
    this._loadTemplates()
  },

  onShow() {
    // 从 my-coupons 领券后返回时，刷新状态（已领模板需要更新）
    this.setData({ page: 1, templates: [], hasMore: true })
    this._loadTemplates()
  },

  async _loadTemplates() {
    if (this.data.isLoading) {return}
    this.setData({ isLoading: true })
    try {
      const result = await CouponService.getClaimableTemplates({
        page: this.data.page,
        pageSize: this.data.pageSize,
      })
      if (result && result.code === 0) {
        // 仅显示近 6 个月内创建且在领取有效期内的模板
        const sixMonthsAgo = Date.now() - 180 * 24 * 60 * 60 * 1000
        const rawList = (result.data.list || []).filter(item => {
          const created = new Date(item.createdAt || 0).getTime()
          return created >= sixMonthsAgo
        })
        const list = rawList.map(item => ({
          ...item,
          accentColor: getAccentColor(item.type),
          scopeLabels: translateScopes(item.applicableScopes),
          claimBtn: getClaimBtnState(item),
        }))
        this.setData({
          templates: this.data.page === 1 ? list : [...this.data.templates, ...list],
          hasMore: list.length >= this.data.pageSize,
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
    this._loadTemplates()
  },

  async onClaimCoupon(e) {
    if (!(await requireLogin())) {return}
    const { id } = e.currentTarget.dataset
    if (!id) {return}
    const idx = this._findIndex(id)
    if (idx < 0) {return}
    const cur = this.data.templates[idx]
    if (!cur.canClaim || isTemplateExpired(cur)) {
      this.errorDynamic('当前优惠券不可领取', 'COUPON_CLAIM_FAILED')
      return
    }
    try {
      const result = await CouponService.claimCoupon(id, 'claim-center')
      if (result && result.code === 0) {
        this.toast('COUPON_CLAIM_SUCCESS')
        // 局部刷新：更新该模板的 canClaim 与按钮文案
        const updated = { ...cur, canClaim: false, claimBtn: getClaimBtnState({ ...cur, canClaim: false }) }
        const keyPath = `templates[${idx}]`
        this.setData({ [keyPath]: updated })
      } else {
        this.errorDynamic((result && result.message), 'COUPON_CLAIM_FAILED')
      }
    } catch (err) {
      this.errorDynamic(err.message, 'COUPON_CLAIM_FAILED')
    }
  },

  _findIndex(id) {
    return this.data.templates.findIndex(t => t._id === id)
  },
})
