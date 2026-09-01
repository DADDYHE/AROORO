const { AdminService } = require('../../../services/CloudFunctionService')
const { ListBehavior } = require('../../../behaviors/listBehavior')

Page({
  behaviors: [ListBehavior],
  data: {
    isLoading: true,
    users: [],
    total: 0,
    page: 1,
    pageSize: 20,
    hasMore: true,
    isLoadingMore: false,
    stats: null,
  },

  onLoad() {
    this._initNavbarHeight()
    this._loadData()
  },

  onShow() {
    if (this.data.users.length > 0) {
      const now = Date.now()
      // 30s 节流：窗口内返回走被动缓存加载（秒开），窗口外强制刷新（统计/列表最新）
      if (this._lastShowRefresh && now - this._lastShowRefresh < 30000) {
        this._refreshData()
        return
      }
      this._lastShowRefresh = now
      this._refreshData(true)
    }
  },

  // 组装统计字段（partnerService 语义：消费总额来自邀请用户消费，订单/佣金来自佣金记录）
  _buildStats(refStats, orderStats) {
    if (!orderStats) {return null}
    return {
      totalAmount: refStats && refStats.totalSpent ? Number(refStats.totalSpent).toFixed(2) : '0.00',
      totalCount: orderStats.totalOrders || 0,
      estimatedCommission: Number(orderStats.totalCommission || 0).toFixed(2),
    }
  },

  // onShow 被动刷新：优先 BFF 聚合（3 次 → 1 次），失败回退原 3 连
  async _refreshData(forceRefresh = false) {
    const opts = forceRefresh ? { useCache: false } : { useCache: true, cacheTime: 30000 }
    try {
      const bundle = await this._loadBundle(opts)
      if (bundle) {
        this._applyBundle(bundle, false)
        return
      }
    } catch (e) {
      console.warn('[partner/referral] bundle failed, fallback to legacy:', e?.message || e)
    }
    await this._legacyLoad(opts, false)
  },

  async _loadData({ forceRefresh = false } = {}) {
    this.setData({ isLoading: true })
    const opts = forceRefresh ? { useCache: false } : { useCache: true, cacheTime: 30000 }
    try {
      const bundle = await this._loadBundle(opts)
      if (bundle) {
        this._applyBundle(bundle, true)
        return
      }
    } catch (e) {
      console.warn('[partner/referral] bundle failed, fallback to legacy:', e?.message || e)
    }
    await this._legacyLoad(opts, true)
  },

  async _loadBundle(opts) {
    const res = await AdminService.getReferralBundle({ pageSize: this.data.pageSize }, opts)
    if (!res || res.code !== 0 || !res.data) { return null }
    return res.data
  },

  // 兜底：原 3 连
  async _legacyLoad(opts, showLoading) {
    try {
      const [usersRes, statsRes, referralRes] = await Promise.all([
        AdminService.getMyInvitedUsers({ page: 1, pageSize: this.data.pageSize }, opts),
        AdminService.getReferralOrderStats({ type: 'all' }, opts),
        AdminService.getReferralStats(opts),
      ])
      this._applyBundle({
        users: usersRes.code === 0 && usersRes.data ? usersRes.data : null,
        orderStats: statsRes.code === 0 && statsRes.data ? statsRes.data : null,
        referralStats: referralRes.code === 0 && referralRes.data ? referralRes.data : null,
      }, showLoading)
    } catch (e) {
      console.error('[partner/referral] _loadData error:', e)
      if (showLoading) { this.setData({ isLoading: false }) }
    }
  },

  // bundle 与 legacy 共用落地
  _applyBundle(bundle, showLoading) {
    const list = bundle.users && bundle.users.list ? bundle.users.list : []
    const total = bundle.users && bundle.users.total ? bundle.users.total : 0
    const stats = this._buildStats(bundle.referralStats, bundle.orderStats)
    const next = { users: list, total, stats, page: 1, hasMore: list.length >= this.data.pageSize }
    if (showLoading) { next.isLoading = false }
    this.setData(next)
  },

  onAvatarError(e) {
    const index = e.currentTarget.dataset.index
    if (index === undefined || !this.data.users[index]) {return}
    this.setData({ [`users[${index}].avatarUrl`]: '/images/default-avatar.svg' })
  },

  onReachBottom() {
    if (!this.data.hasMore || this.data.isLoading || this.data.isLoadingMore) {return}
    this.setData({ page: this.data.page + 1 })
    return this._loadMore()
  },

  async _loadMore() {
    this.setData({ isLoadingMore: true })
    try {
      const res = await AdminService.getMyInvitedUsers({ page: this.data.page, pageSize: this.data.pageSize })
      if (res.code === 0 && res.data) {
        this.setData({
          users: [...this.data.users, ...(res.data.list || [])],
          hasMore: (res.data.list || []).length >= this.data.pageSize,
        })
      }
    } catch (e) {
      console.error('[partner/referral] _loadMore error:', e)
    } finally {
      this.setData({ isLoadingMore: false })
    }
  },

  onPullDownRefresh() {
    this.setData({ page: 1 })
    this._loadData({ forceRefresh: true }).then(() => wx.stopPullDownRefresh())
  },
})
