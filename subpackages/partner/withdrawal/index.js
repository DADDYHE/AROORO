const { AdminService } = require('../../../services/CloudFunctionService')
const { formatTime } = require('../../profile/utils/dateUtils')

const STATUS_MAP = {
  pending: { text: '待审核', color: '#FF9500' },
  approved: { text: '待转账', color: '#5856D6' },
  processing: { text: '转账中', color: '#007AFF' },
  completed: { text: '已到账', color: '#34C759' },
  rejected: { text: '已拒绝', color: '#FF3B30' },
}

Page({
  data: {
    list: [],
    total: 0,
    page: 1,
    pageSize: 20,
    hasMore: true,
    isLoading: true,
  },

  onLoad() {
    this._loadData()
  },

  async _loadData() {
    this.setData({ isLoading: true })
    try {
      const res = await AdminService.getMyWithdrawals({ page: this.data.page, pageSize: this.data.pageSize })
      if (res.code === 0 && res.data) {
        const list = (res.data.list || []).map(item => ({
          ...item,
          statusText: STATUS_MAP[item.status]?.text || item.status,
          statusColor: STATUS_MAP[item.status]?.color || '#8E8E93',
          amountText: Number(item.amount).toFixed(2),
          timeText: this._formatTime(item.createdAt),
          rejectReason: item.rejectReason || '',
        }))
        this.setData({
          list: this.data.page === 1 ? list : this.data.list.concat(list),
          total: res.data.total || 0,
          hasMore: list.length >= this.data.pageSize,
          isLoading: false,
        })
      } else {
        this.setData({ isLoading: false })
      }
    } catch (e) {
      console.error('[partner/withdrawal] _loadData error:', e)
      this.setData({ isLoading: false })
    }
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.isLoading) {
      this.setData({ page: this.data.page + 1 })
      this._loadData()
    }
  },

  _formatTime(date) { return formatTime(date) },
})
