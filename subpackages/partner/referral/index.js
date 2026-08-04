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
      this._refreshData()
    }
  },

  async _refreshData() {
    try {
      const [usersRes, statsRes] = await Promise.all([
        AdminService.getMyInvitedUsers({ page: 1, pageSize: this.data.pageSize }),
        AdminService.getReferralOrderStats({ type: 'all' }),
      ])
      const list = usersRes.code === 0 && usersRes.data ? usersRes.data.list || [] : []
      const total = usersRes.code === 0 && usersRes.data ? usersRes.data.total || 0 : 0
      const stats = statsRes.code === 0 && statsRes.data ? statsRes.data : null
      this.setData({ users: list, total, stats, page: 1, hasMore: list.length >= this.data.pageSize })
    } catch (e) {
      console.warn('[partner/referral] _refreshData error:', e)
    }
  },

  async _loadData() {
    this.setData({ isLoading: true })
    try {
      const [usersRes, statsRes] = await Promise.all([
        AdminService.getMyInvitedUsers({ page: this.data.page, pageSize: this.data.pageSize }),
        AdminService.getReferralOrderStats({ type: 'all' }),
      ])

      const list = usersRes.code === 0 && usersRes.data ? usersRes.data.list || [] : []
      const total = usersRes.code === 0 && usersRes.data ? usersRes.data.total || 0 : 0
      const stats = statsRes.code === 0 && statsRes.data ? statsRes.data : null

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
    this._loadData().then(() => wx.stopPullDownRefresh())
  },
})
