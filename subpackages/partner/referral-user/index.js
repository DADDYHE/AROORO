const __i18n = require('../../../utils/i18n.js')
const __pageI18n = require('../../../utils/page-i18n.js')
const __i18nT = (k) => __i18n.t(k, __i18n.getLocale())
const { AdminService } = require('../../../services/CloudFunctionService')
const { ListBehavior } = require('../../../behaviors/listBehavior')
const authGateBehavior = require('../../../behaviors/authGateBehavior')

// 佣金订单类型 → 中文名（与 referral 列表口径一致：寄养 hosting/boarding 双值同表）
const ORDER_TYPE_NAMES = {
  tuan: '团购',
  mall: '商城',
  activity: '活动',
  boarding: '寄养',
  hosting: '寄养',
  feeding: '上门喂养',
}

// 佣金状态 → 文案 + 复用 common.wxss 状态徽章类（token 化，避免 inline 颜色）
const STATUS_MAP = {
  pending: { text: '待结算', cls: 'status-warning' },
  settled: { text: '已结算', cls: 'status-success' },
  cancelled: { text: '已取消', cls: 'status-disabled' },
  reversed: { text: '已冲销', cls: 'status-neutral' },
}

Page({
  behaviors: [ListBehavior, authGateBehavior],
  data: {
    noPermission: false,
    t: __pageI18n.buildTMap(__i18n.getLocale()),
    isLoading: true,
    ownerId: '',
    nickName: '用户',
    avatarUrl: '',
    orderCount: 0,
    totalSpentText: '0.00',
    stats: null,
    list: [],
    page: 1,
    pageSize: 20,
    hasMore: true,
    isLoadingMore: false,
  },

  onLoad(query) {
    this._initNavbarHeight()
    const ownerId = (query && query.ownerId) || ''
    // 非法路由保护：无 ownerId 视为从旧入口误入，提示后返回
    if (!ownerId) {
      wx.showToast({ title: '参数缺失', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 600)
      return
    }
    let nickName = ''
    try { nickName = (query.nickName && decodeURIComponent(query.nickName)) || '' } catch (e) { nickName = '' }
    this.setData({
      ownerId,
      nickName: nickName || '用户',
      avatarUrl: (query && query.avatarUrl) || '',
      orderCount: Number(query.orderCount) || 0,
      totalSpentText: (query && query.totalSpent) || '0.00',
    })
    this._loadData()
  },

  async _loadData() {
    this.setData({ isLoading: true })
    try {
      const [statsRes, listRes] = await Promise.all([
        AdminService.getReferralUserStats({ type: 'all', ownerId: this.data.ownerId }),
        AdminService.getReferralUserOrders({ type: 'all', ownerId: this.data.ownerId, page: 1, pageSize: this.data.pageSize }),
      ])
      if (this._isPartnerDenied(statsRes) || this._isPartnerDenied(listRes)) {
        this._showPartnerDenied()
        return
      }
      const rawList = listRes.code === 0 && listRes.data && listRes.data.list ? listRes.data.list : []
      this.setData({
        stats: statsRes.code === 0 && statsRes.data ? this._buildStats(statsRes.data) : null,
        list: rawList.map((i) => this._transformItem(i)),
        total: (listRes.data && listRes.data.total) || 0,
        page: 1,
        hasMore: rawList.length >= this.data.pageSize,
        isLoading: false,
      })
    } catch (e) {
      console.error('[partner/referral-user] _loadData error:', e)
      this.setData({ isLoading: false })
    }
  },

  // 佣金统计（commissions 口径，按 ownerId 聚合）
  _buildStats(s) {
    return {
      totalOrders: s.totalOrders || 0,
      totalCommissionText: Number(s.totalCommission || 0).toFixed(2),
      pendingCommissionText: Number(s.pendingCommission || 0).toFixed(2),
      settledCommissionText: Number(s.settledCommission || 0).toFixed(2),
    }
  },

  _transformItem(c) {
    const status = c.status || 'pending'
    const s = STATUS_MAP[status] || { text: status, cls: 'status-neutral' }
    return {
      _id: c._id || '',
      orderNo: c.orderNo || '',
      orderTypeName: ORDER_TYPE_NAMES[c.orderType] || (c.orderType || '订单'),
      commissionText: Number(c.commissionAmount || 0).toFixed(2),
      orderAmount: Number(c.orderAmount || 0).toFixed(2),
      statusText: s.text,
      statusClass: s.cls,
      createdText: this._formatTime(c.createdAt),
    }
  },

  _formatTime(input) {
    if (!input) {return ''}
    const d = typeof input === 'number' ? new Date(input) : new Date(input)
    if (isNaN(d.getTime())) {return ''}
    const p = (n) => (n < 10 ? '0' + n : '' + n)
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
  },

  onReachBottom() {
    if (!this.data.hasMore || this.data.isLoading || this.data.isLoadingMore) {return}
    this.setData({ page: this.data.page + 1 })
    return this._loadMore()
  },

  async _loadMore() {
    this.setData({ isLoadingMore: true })
    try {
      const res = await AdminService.getReferralUserOrders({ type: 'all', ownerId: this.data.ownerId, page: this.data.page, pageSize: this.data.pageSize })
      if (res.code === 0 && res.data && res.data.list) {
        this.setData({
          list: [...this.data.list, ...res.data.list.map((i) => this._transformItem(i))],
          hasMore: res.data.list.length >= this.data.pageSize,
        })
      }
    } catch (e) {
      console.error('[partner/referral-user] _loadMore error:', e)
    } finally {
      this.setData({ isLoadingMore: false })
    }
  },

  onPullDownRefresh() {
    this.setData({ page: 1, hasMore: true })
    this._loadData().then(() => wx.stopPullDownRefresh())
  },

  onGoBack() {
    wx.navigateBack()
  },

  /** 非合伙人守卫：partnerService 权限拒绝（403）时展示申请引导 */
  _isPartnerDenied(res) {
    if (!res) { return false }
    if (res.code === 403) { return true }
    const msg = String(res.message || res.msg || '')
    return /权限不足|无权限|不是合作伙伴/.test(msg)
  },

  _showPartnerDenied() {
    this.setData({ noPermission: true, isLoading: false, isLoadingMore: false })
  },

  onGoPartnerApply() {
    wx.navigateTo({ url: '/subpackages/partner/home/index' })
  },
})