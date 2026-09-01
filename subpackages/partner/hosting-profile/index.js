const __i18n = require('../../../utils/i18n.js')
const __pageI18n = require('../../../utils/page-i18n.js')
const __i18nT = (k) => __i18n.t(k, __i18n.getLocale())
const { HostService, OrderService, AdminService } = require('../../../services/CloudFunctionService')
const { ListBehavior } = require('../../../behaviors/listBehavior')
const pageI18n = require('../../../utils/page-i18n.js')
const i18n = require('../../../utils/i18n.js')

// 档案状态 → 展示文案
const STATUS_TEXT = {
  active: '营业中',
  pending_review: '审核中',
  rejected: '已驳回',
  disabled: '已下架',
}

// 订单状态 → 展示文案
const ORDER_STATUS_TEXT = {
  pending_payment: '待买家支付',
  paid: '待接单',
  confirmed: '已接单',
  in_progress: '寄养中',
  completed: '已完成',
  rejected: '已拒单',
  cancelled: '已取消',
  refunded: '已退款',
}

Page({
  behaviors: [ListBehavior],
  data: {
  ...__pageI18n.buildTMap(__i18n.getLocale()),
    // 注入 i18n t-map，使 WXML 可绑定 {{ t.BIZ_XXX }}（根治 BIZ_BX46V0 死 key）
    ...pageI18n.buildTMap(i18n.getLocale()),
    isLoading: true,
    profile: null,
    hasProfile: false,
    statusText: '',
    acceptSwitching: false,
    orders: [],
    orderTotal: 0,
    page: 1,
    pageSize: 20,
    hasMore: true,
  },

  onLoad() {
    this._initNavbarHeight()
    this._loadData()
  },

  onShow() {
    // 从编辑页返回时刷新档案 + 订单（onLoad 后首次 onShow 由 _loaded 跳过）
    if (!this._loaded) {
      this._loaded = true
      return
    }
    this._loadData()
  },

  onPullDownRefresh() {
    this._loadData().finally(() => wx.stopPullDownRefresh())
  },

  async _loadData() {
    this.setData({ isLoading: true })
    try {
      const res = await HostService.getMyProfile()
      if (res.code === 0 && res.data && (res.data._id || res.data.openid)) {
        this.setData({
          profile: res.data,
          hasProfile: true,
          statusText: STATUS_TEXT[res.data.status] || res.data.status,
          isLoading: false,
        })
        this._loadOrders()
      } else {
        this.setData({ hasProfile: false, isLoading: false })
      }
    } catch (e) {
      console.error('[partner/hosting-profile] _loadData error:', e)
      this.setData({ hasProfile: false, isLoading: false })
    }
  },

  async _loadOrders() {
    try {
      const res = await AdminService.getMyBoardingOrders({ page: this.data.page, pageSize: this.data.pageSize })
      if (res.code === 0 && res.data) {
        const list = (res.data.list || []).map(o => ({
          ...o,
          statusText: ORDER_STATUS_TEXT[o.status] || o.status,
        }))
        this.setData({
          orders: list,
          orderTotal: res.data.total || 0,
          hasMore: list.length >= this.data.pageSize,
        })
      }
    } catch (e) {
      console.error('[partner/hosting-profile] _loadOrders error:', e)
    }
  },

  // ---------- 操作 ----------

  goCreate() {
    wx.navigateTo({ url: '/subpackages/partner/hosting-profile-edit/index' })
  },

  goEdit() {
    wx.navigateTo({ url: '/subpackages/partner/hosting-profile-edit/index?edit=1' })
  },

  async onAcceptToggle(e) {
    if (this.data.acceptSwitching) { return }
    const value = e.detail.value
    this.setData({ acceptSwitching: true })
    try {
      const res = await HostService.updateHostAcceptingOrders(value)
      if (res.code === 0) {
        this.setData({ 'profile.isAcceptingOrders': value })
        wx.showToast({ title: value ? '已恢复接单' : '已暂停接单', icon: 'none' })
      } else {
        wx.showToast({ title: res.msg || '操作失败', icon: 'none' })
        this.setData({ 'profile.isAcceptingOrders': !value })
      }
    } catch (err) {
      console.error('[partner/hosting-profile] toggle error:', err)
      wx.showToast({ title: '操作失败，请重试', icon: 'none' })
      this.setData({ 'profile.isAcceptingOrders': !value })
    }
    this.setData({ acceptSwitching: false })
  },

  // ---------- 寄养订单操作（confirm/reject/complete，走 orderService 状态机） ----------

  onOrderAction(e) {
    const { id, op } = e.currentTarget.dataset
    if (!id || !op) { return }
    const tips = {
      confirm: { content: '确认接下这笔寄养订单？', op: 'confirm' },
      reject: { content: '拒绝后订单将自动全额退款给买家，确认拒绝？', op: 'reject' },
      complete: { content: '确认寄养服务已完成？完成后将结算服务收入。', op: 'complete' },
    }
    const conf = tips[op]
    if (!conf) { return }
    wx.showModal({
      title: op === 'confirm' ? '接单确认' : (op === 'reject' ? '拒单确认' : '完成确认'),
      content: conf.content,
      confirmColor: '#1F3A1F',
      success: res => {
        if (res.confirm) { this._doOrderAction(id, conf.op) }
      },
    })
  },

  async _doOrderAction(orderId, operation) {
    wx.showLoading({ title: __i18nT('BIZ_DLJHN'), mask: true })
    try {
      const res = await OrderService.handleBoardingOrder(orderId, operation)
      wx.hideLoading()
      if (res.code === 0) {
        if (operation === 'confirm' && res.data && res.data.pendingReview) {
          wx.showToast({ title: '已接单，待风控复核', icon: 'none' })
        } else if (res.data && res.data.refundInitiated) {
          wx.showToast({ title: '已发起退款，等待到账', icon: 'none' })
        } else {
          wx.showToast({ title: '操作成功', icon: 'success' })
        }
        this._loadOrders()
      } else {
        wx.showToast({ title: res.msg || '操作失败，请重试', icon: 'none' })
      }
    } catch (err) {
      wx.hideLoading()
      console.error('[partner/hosting-profile] order action error:', err)
      wx.showToast({ title: '操作失败，请重试', icon: 'none' })
    }
  },
})
