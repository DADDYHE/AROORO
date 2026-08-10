const { AdminService } = require('../../../services/CloudFunctionService')
const { formatTime } = require('../../profile/utils/dateUtils')
const { ListBehavior } = require('../../../behaviors/listBehavior')

const STATUS_MAP = {
  pending: { text: '待审核', color: '#C9A24B' },
  approved: { text: '', color: '#6B7D5A' }, // 文案按 mode 区分：manual→待人工打款 / 其他→待转账
  processing: { text: '转账中', color: '#6B7D8C' },
  completed: { text: '已到账', color: '#5B7C4A' },
  rejected: { text: '已拒绝', color: '#A85B4A' },
  cancelled: { text: '已取消', color: '#9A9489' },
}

Page({
  behaviors: [ListBehavior],
  data: {
    list: [],
    total: 0,
    page: 1,
    pageSize: 20,
    hasMore: true,
    isLoading: true,
  },

  onLoad() {
    this._initNavbarHeight()
    this._loadData()
  },

  async _loadData() {
    this.setData({ isLoading: true })
    try {
      const res = await AdminService.getMyWithdrawals({ page: this.data.page, pageSize: this.data.pageSize })
      if (res.code === 0 && res.data) {
        const list = (res.data.list || []).map(item => ({
          ...item,
          statusText: item.status === 'approved'
            ? (item.mode === 'manual' ? '待人工打款' : '待转账')
            : (STATUS_MAP[item.status]?.text || item.status),
          statusColor: STATUS_MAP[item.status]?.color || '#9A9489',
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

  /**
   * v5.1：自助取消提现（仅 pending）
   */
  async onCancelRequest(e) {
    const { id } = e.currentTarget.dataset
    if (!id) {return}
    const modal = await new Promise(resolve => {
      wx.showModal({
        title: '取消提现',
        content: '确定取消该提现申请？冻结金额将退回余额。',
        editable: true,
        placeholderText: '请填写取消原因（必填）',
        success: resolve,
      })
    })
    if (!modal.confirm) {return}
    const reason = (modal.content || '').trim()
    if (!reason) {
      wx.showToast({ title: '请填写取消原因', icon: 'none' })
      return
    }
    try {
      const res = await AdminService.cancelWithdrawal(id, reason)
      if (res.code === 0) {
        wx.showToast({ title: '已取消', icon: 'success' })
        this.setData({ page: 1 })
        this._loadData()
      } else {
        wx.showToast({ title: res.message || '取消失败', icon: 'none' })
      }
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '取消失败', icon: 'none' })
    }
  },

  /**
   * P0 修复：确认收款 / 查询到账（新版商家转账需用户在小程序确认收款后才到账）
   *  - confirmWithdrawal 查单：SUCCESS → 后端结算落库；WAIT_USER_CONFIRM → 返回 packageInfo
   *  - 有 packageInfo → wx.requestMerchantTransfer 拉起微信确认收款，确认后再查一次闭环
   */
  async onConfirmReceipt(e) {
    const { id } = e.currentTarget.dataset
    if (!id) {return}
    wx.showLoading({ title: '查询中', mask: true })
    try {
      let res = await AdminService.confirmWithdrawal(id)
      if (res.code !== 0) {throw new Error(res.message || '操作失败')}
      let state = (res.data && res.data.state) || ''
      const packageInfo = (res.data && res.data.packageInfo) || ''

      if (packageInfo) {
        wx.hideLoading()
        await this._requestMerchantConfirm(packageInfo)
        wx.showLoading({ title: '确认中', mask: true })
        res = await AdminService.confirmWithdrawal(id)
        if (res.code !== 0) {throw new Error(res.message || '操作失败')}
        state = (res.data && res.data.state) || ''
      }

      wx.hideLoading()
      if (state === 'SUCCESS') {
        wx.showToast({ title: '已到账', icon: 'success' })
      } else if (state === 'FAIL' || state === 'CANCELLED' || state === 'CANCELING') {
        wx.showToast({ title: '转账未成功，请联系客服', icon: 'none' })
      } else if (state === 'WAIT_USER_CONFIRM') {
        wx.showToast({ title: '请在微信确认收款', icon: 'none' })
      } else {
        wx.showToast({ title: '转账处理中，请稍后查询', icon: 'none' })
      }
      this.setData({ page: 1 })
      this._loadData()
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: (e && e.message) || '操作失败', icon: 'none' })
    }
  },

  _requestMerchantConfirm(packageInfo) {
    return new Promise((resolve, reject) => {
      if (typeof wx.requestMerchantTransfer !== 'function') {
        reject(new Error('当前微信版本不支持确认收款'))
        return
      }
      wx.requestMerchantTransfer({
        packageInfo,
        success: resolve,
        fail: (err) => reject(new Error((err && err.errMsg) || '确认收款未完成')),
      })
    })
  },

  _formatTime(date) { return formatTime(date) },
})
