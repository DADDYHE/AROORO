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
  approved: '营业中',
  pending_review: '审核中',
  rejected: '已驳回',
  disabled: '已下架',
}

/**
 * 状态视图（文案 + 标签色）预计算：营业中(active/approved)融合接单开关——
 * isAcceptingOrders=false 时显示「已暂停接单」灰标，避免「营业中」与开关打架。
 * Skyline：wxml 只绑预计算字段，不做方法调用。
 */
function buildStatusView(profile) {
  const status = profile.status
  let text = STATUS_TEXT[status] || status
  let tagClass = status === 'active' || status === 'approved'
    ? 'tag-active'
    : (status === 'rejected' ? 'tag-rejected' : 'tag-inactive')
  if ((status === 'active' || status === 'approved') && profile.isAcceptingOrders === false) {
    text = '已暂停接单'
    tagClass = 'tag-inactive'
  }
  return { statusText: text, statusTagClass: tagClass }
}

// 邀请状态 → 展示文案
const INVITATION_STATUS_TEXT = {
  active: '待客户填写',
  filled: '已成单',
  cancelled: '已取消',
}
const INVITATION_TAG_CLASS = {
  active: 'tag-active',
  filled: 'tag-filled',
  cancelled: 'tag-inactive',
}

// 订单状态 → 展示文案
const ORDER_STATUS_TEXT = {
  pending_payment: '待买家支付',
  deposit_paid: '待补尾款',
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
    t: __pageI18n.buildTMap(__i18n.getLocale()),
    // 注入 i18n t-map，使 WXML 可绑定 {{ t.BIZ_XXX }}（根治 BIZ_BX46V0 死 key）
    ...pageI18n.buildTMap(i18n.getLocale()),
    isLoading: true,
    profile: null,
    hasProfile: false,
    statusText: '',
    acceptSwitching: false,
    orders: [],
    orderTotal: 0,
    myInvitations: [],
    invitationExpanded: true,
    ordersExpanded: false,
    cancelledOrders: [],
    cancelledExpanded: false,
    page: 1,
    pageSize: 20,
    hasMore: true,
  },

  onLoad() {
    console.log('[hosting-profile] BUILD-MARK: 2026-09-08-1536-DEBUG-ONSHARE')
    this._initNavbarHeight()
    this._loadData()
  },

  onShow() {
    // DEBUG：转发面板关闭回小程序时，toast 显示 onShareAppMessage 的实际执行数据
    if (app.__shareCalled) {
      wx.showToast({ title: app.__shareCalled, icon: 'none', duration: 6000 })
      app.__shareCalled = null
    }
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
          ...buildStatusView(res.data),
          isLoading: false,
        })
        this._loadOrders()
        this._loadInvitations()
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
        // 分页累积后按「有效 / 已取消」分组（2026-09-07：已取消单拆独立节）
        this._allOrders = this.data.page > 1 ? (this._allOrders || []).concat(list) : list
        const valid = this._allOrders.filter(o => o.status !== 'cancelled')
        const cancelled = this._allOrders.filter(o => o.status === 'cancelled')
        this.setData({
          orders: valid,
          cancelledOrders: cancelled,
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

  // 主动开单（寄养家庭邀请客户填写信息并支付）
  goInviteCreate() {
    wx.navigateTo({ url: '/subpackages/partner/invitation-create/index' })
  },

  goInviteList() {
    wx.navigateTo({ url: '/subpackages/partner/invitation-list/index' })
  },

  /** 我的开单列表（轻量拉取，每次进入刷新——邀请状态/成单结果需即时可见） */
  async _loadInvitations() {
    try {
      const res = await OrderService.getMyInvitations({ page: 1, pageSize: 10 })
      if (res.code === 0 && res.data) {
        const list = (res.data.list || []).map(o => ({
          ...o,
          statusText: INVITATION_STATUS_TEXT[o.status] || o.status,
          statusTagClass: INVITATION_TAG_CLASS[o.status] || 'tag-inactive',
          days: Math.max(1, Math.round(
            (Date.parse(`${o.endDate}T00:00:00Z`) - Date.parse(`${o.startDate}T00:00:00Z`)) / 86400000,
          )),
          dateRangeText: `${o.startDate || '-'} 至 ${o.endDate || '-'}`,
          timeText: `${o.startAt || '--:--'} - ${o.endAt || '--:--'}`,
          releasable: o.status === 'filled' && !o.orderId,
        }))
        this.setData({ myInvitations: list })
      }
    } catch (e) {
      console.error('[partner/hosting-profile] _loadInvitations error:', e)
    }
  },

  /** 手风琴互斥：点击节头展开该节、收起另一节；点已展开的节则收起自己 */
  onToggleSection(e) {
    const key = e.currentTarget && e.currentTarget.dataset.key
    if (!key) { return }
    const keys = ['invitations', 'orders', 'cancelled']
    const state = {}
    keys.forEach(k => { state[k + (k === 'invitations' ? 'Expanded' : 'Expanded')] = false })
    // 目标节取反（点已展开的收起自己），其余全收起
    const cur = key === 'invitations' ? this.data.invitationExpanded : (key === 'orders' ? this.data.ordersExpanded : this.data.cancelledExpanded)
    const map = { invitations: 'invitationExpanded', orders: 'ordersExpanded', cancelled: 'cancelledExpanded' }
    keys.forEach(k => { state[map[k]] = false })
    state[map[key]] = !cur
    this.setData(state)
  },

  /** 点击邀请卡：仅 active 可进编辑详情 */
  onCardTap(e) {
    const id = e.currentTarget && e.currentTarget.dataset.id
    if (!id) { return }
    const inv = (this.data.list || this.data.myInvitations || []).find(x => x._id === id)
    if (inv && inv.status !== 'active') {
      wx.showToast({ title: '仅待客户填写的邀请可编辑', icon: 'none' })
      return
    }
    wx.setStorageSync('_inviteEdit', inv || { _id: id })
    wx.navigateTo({ url: '/subpackages/partner/invitation-create/index?id=' + id })
  },

  /**
   * 分享（2026-09-07）：Skyline 下 open-type=share 的 tap/dataset 不可靠——
   * 改为分享确认弹层：普通按钮先 setData shareSheet，弹层内 open-type=share
   * 按钮触发 onShareAppMessage 时直接读页面状态，不依赖事件参数。
   */
  onShareTap(e) {
    const { type, id, code } = e.currentTarget.dataset
    if (type === 'order') {
      const ord = this.data.orders.find(o => o._id === id)
      this.setData({ shareSheet: { type: 'order', orderId: id, title: ord ? `寄养订单 · ${ord.statusText} · ${ord.startDate || ''}` : '寄养订单' } })
      return
    }
    const inv = this.data.myInvitations.find(x => x.shareCode === code || x._id === id)
    if (!inv) { return }
    this.setData({ shareSheet: { type: 'invitation', shareCode: inv.shareCode, inv } })
  },

  onShareSheetClose() {
    this.setData({ shareSheet: null })
  },

  noopStop() { /* 阻止弹层内容点击冒泡到遮罩 */ },

  onShareAppMessage() {
    // ⚠️ DEBUG 版（定位分享标题问题，修复后恢复原逻辑）
    const s = this.data.shareSheet
    const latest = (this.data.myInvitations || []).find(x => x.status === 'active') || (this.data.myInvitations || [])[0]
    const dbg = 'DBG:' + (s ? 'S.' + s.type : 'S.NULL') + (latest ? '+L.' + latest.status : '+L.none')
    console.log('[share-DEBUG] onShareAppMessage 被调用:', dbg, '| shareSheet:', JSON.stringify(s || null), '| latest:', latest && latest.shareCode)
    return {
      title: dbg,
      path: '/subpackages/booking/invitation-fill/index?code=' + ((s && s.shareCode) || (latest && latest.shareCode) || 'nocode'),
    }
  },

  onCancelInvitation(e) {
    const id = e.currentTarget && e.currentTarget.dataset.id
    if (!id) { return }
    wx.showModal({
      title: '取消开单',
      content: '取消后客户将无法再通过此邀请填写下单，确认取消？',
      confirmColor: '#1F3A1F',
      success: res => {
        if (res.confirm) {
          OrderService.cancelInvitation(id).then(r => {
            if (r.code === 0) {
              wx.showToast({ title: '已取消', icon: 'success' })
              this._loadInvitations()
            } else {
              wx.showToast({ title: r.message || r.msg || '取消失败', icon: 'none' })
            }
          }).catch(() => wx.showToast({ title: '取消失败，请重试', icon: 'none' }))
        }
      },
    })
  },

  /** 释放失联 filled 邀请（孤儿或订单已取消）——作废后可重新开单 */
  onReleaseInvitation(e) {
    const id = e.currentTarget && e.currentTarget.dataset.id
    if (!id) { return }
    wx.showModal({
      title: '释放邀请',
      content: '此操作将作废该邀请，释放后可重新开单。确认？',
      confirmColor: '#1F3A1F',
      success: res => {
        if (res.confirm) {
          OrderService.cancelInvitation(id).then(r => {
            if (r.code === 0) {
              wx.showToast({ title: '已释放', icon: 'success' })
              this._loadInvitations()
            } else {
              wx.showToast({ title: r.message || r.msg || '释放失败', icon: 'none' })
            }
          }).catch(() => wx.showToast({ title: '释放失败，请重试', icon: 'none' }))
        }
      },
    })
  },

  onViewOrder(e) {
    const orderId = e.currentTarget && e.currentTarget.dataset.orderid
    if (orderId) {
      wx.navigateTo({ url: '/subpackages/profile/order-detail/index?id=' + orderId })
    }
  },

  async onAcceptToggle(e) {
    if (this.data.acceptSwitching) { return }
    const value = e.detail.value
    this.setData({ acceptSwitching: true })
    const nextProfile = { ...this.data.profile, isAcceptingOrders: value }
    try {
      const res = await HostService.updateHostAcceptingOrders(value)
      if (res.code === 0) {
        // 状态文案随开关同步（营业中 ↔ 已暂停接单）
        this.setData({ 'profile.isAcceptingOrders': value, ...buildStatusView(nextProfile) })
        wx.showToast({ title: value ? '已恢复接单' : '已暂停接单', icon: 'none' })
      } else {
        wx.showToast({ title: res.msg || '操作失败', icon: 'none' })
        this.setData({ 'profile.isAcceptingOrders': !value, ...buildStatusView({ ...nextProfile, isAcceptingOrders: !value }) })
      }
    } catch (err) {
      console.error('[partner/hosting-profile] toggle error:', err)
      wx.showToast({ title: '操作失败，请重试', icon: 'none' })
      this.setData({ 'profile.isAcceptingOrders': !value, ...buildStatusView({ ...nextProfile, isAcceptingOrders: !value }) })
    }
    this.setData({ acceptSwitching: false })
  },

  // ---------- 寄养订单操作（confirm/reject/complete，走 orderService 状态机） ----------

  onOrderAction(e) {
    const { id, op } = e.currentTarget.dataset
    if (!id || !op) { return }
    if (op === 'adjust') { this._openAdjustPrice(id); return }
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

  /** 家庭改价（2026-09-06）：调整全款金额应对折扣，服务端联动定金/尾款 */
  _openAdjustPrice(orderId) {
    wx.showModal({
      title: '调整订单金额',
      editable: true,
      placeholderText: '请输入新的全款金额（元）',
      confirmColor: '#1F3A1F',
      success: res => {
        if (!res.confirm) { return }
        const newPrice = Number(res.content)
        if (!Number.isFinite(newPrice) || newPrice <= 0) {
          wx.showToast({ title: '请输入正确的金额', icon: 'none' })
          return
        }
        wx.showLoading({ title: '提交中', mask: true })
        OrderService.adjustOrderPrice({ orderId, newPrice, reason: '家庭折扣' })
          .then(resp => {
            wx.hideLoading()
            if (resp.code === 0) {
              const d = resp.data || {}
              wx.showToast({ title: d.status === 'paid' ? '定金已覆盖全款，订单完成' : '改价成功', icon: 'none' })
              this.setData({ page: 1, orders: [], hasMore: true })
              this._loadOrders()
            } else {
              wx.showToast({ title: resp.msg || '改价失败', icon: 'none' })
            }
          })
          .catch(() => {
            wx.hideLoading()
            wx.showToast({ title: '改价失败，请重试', icon: 'none' })
          })
      },
    })
  },

  /** 分享订单收款链接（button open-type=share 触发，res.target.dataset.id 带订单号） */
  onShareAppMessage(res) {
    const orderId = res && res.target && res.target.dataset && res.target.dataset.id
    return {
      title: orderId ? '您的寄养订单待支付，请点击完成付款' : 'AROORO · 家庭寄养',
      path: orderId
        ? `/subpackages/profile/order-detail/index?id=${orderId}&from=hostShare`
        : '/pages/boarding/index',
    }
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
