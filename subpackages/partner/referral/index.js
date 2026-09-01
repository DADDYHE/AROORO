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

  // forceRefresh=true：下拉等主动操作，穿透 30s 前端缓存
  async _refreshData(forceRefresh = false) {
    try {
      const opts = forceRefresh ? { useCache: false } : { useCache: true, cacheTime: 30000 }
      const [usersRes, statsRes, referralRes] = await Promise.all([
        AdminService.getMyInvitedUsers({ page: 1, pageSize: this.data.pageSize }, opts),
        AdminService.getReferralOrderStats({ type: 'all' }, opts),
        AdminService.getReferralStats(opts),
      ])
      const list = usersRes.code === 0 && usersRes.data ? usersRes.data.list || [] : []
      const total = usersRes.code === 0 && usersRes.data ? usersRes.data.total || 0 : 0
      const stats = this._buildStats(
        referralRes.code === 0 && referralRes.data ? referralRes.data : null,
        statsRes.code === 0 && statsRes.data ? statsRes.data : null
      )
      this.setData({ users: list, total, stats, page: 1, hasMore: list.length >= this.data.pageSize })
    } catch (e) {
      console.warn('[partner/referral] _refreshData error:', e)
    }
  },

  async _loadData({ forceRefresh = false } = {}) {
    this.setData({ isLoading: true })
    try {
      const opts = forceRefresh ? { useCache: false } : { useCache: true, cacheTime: 30000 }
      const [usersRes, statsRes, referralRes] = await Promise.all([
        AdminService.getMyInvitedUsers({ page: this.data.page, pageSize: this.data.pageSize }, opts),
        AdminService.getReferralOrderStats({ type: 'all' }, opts),
        AdminService.getReferralStats(opts),
      ])

      const list = usersRes.code === 0 && usersRes.data ? usersRes.data.list || [] : []
      const total = usersRes.code === 0 && usersRes.data ? usersRes.data.total || 0 : 0
      const stats = this._buildStats(
        referralRes.code === 0 && referralRes.data ? referralRes.data : null,
        statsRes.code === 0 && statsRes.data ? statsRes.data : null
      )

      this.setData({
        isLoading: false,
        users: list,
        total,
        hasMore: list.length >= this.data.pageSize,
        stats,
      })
    } catch (e) {
      console.error('[partner/referral] _loadData error:', e)
      this.setData({ isLoading: false })
    }
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
