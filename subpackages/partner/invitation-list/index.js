// ================================================================
// partner/invitation-list · 开单邀请列表管理
// ----------------------------------------------------------------
// - 状态筛选：全部 / 待填写 / 已成单 / 已取消
// - active：转发分享（button open-type=share）/ 生成海报 / 取消
// - filled：查看关联订单
// - 海报：wx.showShareImageMenu 分享图片（canvas 2d 绘制，含小程序码）
// ================================================================

const { OrderService } = require('../../../services/CloudFunctionService')
const { ListBehavior } = require('../../../behaviors/listBehavior')

const authGateBehavior = require('../../../behaviors/authGateBehavior')
const STATUS_TEXT = {
  active: '待填写',
  filled: '已成单',
  cancelled: '已取消',
}

const STATUS_TAG_CLASS = {
  active: 'tag-active',
  filled: 'tag-filled',
  cancelled: 'tag-inactive',
}

const TABS = [
  { key: 'all', label: '全部' },
  { key: 'active', label: '待填写' },
  { key: 'deposit_pending', label: '待付尾款' },
  { key: 'completed', label: '已完成' },
  { key: 'cancelled', label: '已取消' },
]
// 组合筛选 tab：filled 邀请按关联订单状态细分（服务端 orderStatusFilter 过滤）
const COMBO_TABS = { deposit_pending: 'deposit_paid', completed: 'completed' }
// 关联订单状态 → 展示
const ORDER_STATUS_VIEW = {
  pending_payment: '待客户支付',
  deposit_paid: '待补尾款',
  paid: '待接单',
  confirmed: '已接单',
  in_progress: '寄养中',
  completed: '已完成',
}

Page({

  stopBubble() {}, /* glass-easel 下 catchtap 需绑真实方法才阻断冒泡 */  behaviors: [ListBehavior, authGateBehavior],

  data: {
    isLoading: true,
    tabs: TABS,
    activeTab: 'all',
    list: [],
    total: 0,
    page: 1,
    pageSize: 20,
    hasMore: false,
    // 海报弹层
    posterVisible: false,
    posterInvitation: null,
    posterLoading: false,
    posterSaving: false,
  },

  onLoad(options) {
    this._initNavbarHeight()
    this._created = options.created === '1'
  },

  onShow() {
    this._loadList()
  },

  onPullDownRefresh() {
    this._loadList().finally(() => wx.stopPullDownRefresh())
  },

  onTabTap(e) {
    const key = e.currentTarget.dataset.key
    if (key === this.data.activeTab) { return }
    this.setData({ activeTab: key, page: 1, list: [] })
    this._loadList()
  },

  async _loadList() {
    this.setData({ isLoading: this.data.list.length === 0 })
    try {
      const res = await OrderService.getMyInvitations({
        status: this.data.activeTab,
        page: this.data.page,
        pageSize: this.data.pageSize,
      })
      if (res.code === 0 && res.data) {
        const list = (res.data.list || []).map(inv => {
          // 有关联订单状态时（filled 项），按订单维度展示「待补尾款/已完成」等
          const os = inv.orderStatus
          const statusText = os
            ? (ORDER_STATUS_VIEW[os] || os)
            : (STATUS_TEXT[inv.status] || inv.status)
          const statusTagClass = os
            ? (os === 'completed' ? 'tag-active' : 'tag-filled')
            : (STATUS_TAG_CLASS[inv.status] || 'tag-inactive')
          return {
          ...inv,
          statusText,
          statusTagClass,
          days: this._calcDays(inv.startDate, inv.endDate),
          dateRangeText: `${inv.startDate || '-'} 至 ${inv.endDate || '-'}`,
          timeText: `${inv.startAt || '--:--'} - ${inv.endAt || '--:--'}`,
          // 修复 #1：filled 且无 orderId → 订单创建失败遗留的孤儿邀请，可释放
          releasable: inv.status === 'filled' && !inv.orderId,
          }
        })
        this.setData({
          list: this.data.page > 1 ? this.data.list.concat(list) : list,
          total: res.data.total || 0,
          hasMore: list.length >= this.data.pageSize,
          isLoading: false,
        })
      } else {
        this.setData({ isLoading: false })
      }
    } catch (e) {
      this.setData({ isLoading: false })
      this.error('LOAD_FAILED')
    }
  },

  _calcDays(startDate, endDate) {
    if (!startDate || !endDate) { return 0 }
    return Math.max(1, Math.round(
      (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86400000,
    ))
  },

  onLoadMore() {
    if (!this.data.hasMore || this.data.isLoading) { return }
    this.setData({ page: this.data.page + 1 })
    this._loadList()
  },

  // ---------- 分享（button open-type=share 触发，dataset.id 带邀请码） ----------
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

  /** 分享确认弹层（Skyline 下 open-type=share 事件参数不可靠） */
  onShareTap(e) {
    const id = e.currentTarget && e.currentTarget.dataset.id
    const inv = this.data.list.find(x => x._id === id)
    if (!inv) { return }
    this.setData({ shareSheet: { type: 'invitation', shareCode: inv.shareCode, inv } })
  },

  onShareSheetClose() {
    this.setData({ shareSheet: null })
  },

  noopStop() { /* 阻止弹层内容点击冒泡到遮罩 */ },

  onShareAppMessage() {
    // 直发分享：返回当前选中邀请；无上下文时兜底最新 active 邀请
    const s = this.data.shareSheet
    const rc = (s && s.type === 'invitation') ? s : null
    const pick = rc || (() => {
      const latest = (this.data.list || []).find(x => x.status === 'active')
      return latest ? { shareCode: latest.shareCode, inv: latest } : null
    })()
    const inv = pick ? (pick.inv || {}) : {}
    if (pick && pick.shareCode) {
      return {
        title: inv.hostSnapshot && inv.hostSnapshot.hostName
          ? `寄养开单邀请 · ${inv.hostSnapshot.hostName} · ${inv.startDate} 至 ${inv.endDate} · ¥${inv.totalPrice}`
          : `寄养开单邀请 · ${inv.startDate} 至 ${inv.endDate} · ¥${inv.totalPrice}`,
        path: `/subpackages/booking/invitation-fill/index?code=${pick.shareCode}`,
      }
    }
    return { title: 'AROORO · 家庭寄养', path: '/subpackages/partner/invitation-create/index' }
  },

  // ---------- 取消 ----------
  onCancelTap(e) {
    const id = e.currentTarget.dataset.id
    if (!id) { return }
    wx.showModal({
      title: '取消开单',
      content: '取消后客户将无法再通过此邀请填写下单，确认取消？',
      confirmColor: '#1F3A1F',
      success: res => {
        if (res.confirm) { this._doCancel(id) }
      },
    })
  },

  async _doCancel(invitationId) {
    wx.showLoading({ title: '取消中', mask: true })
    try {
      const res = await OrderService.cancelInvitation(invitationId)
      wx.hideLoading()
      if (res.code === 0) {
        wx.showToast({ title: '已取消', icon: 'success' })
        this.setData({ page: 1, list: [] })
        this._loadList()
      } else {
        wx.showToast({ title: res.message || res.msg || '取消失败', icon: 'none' })
      }
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '取消失败，请重试', icon: 'none' })
    }
  },

  // 修复 #1：释放「失联卡死态」filled 邀请（复用 cancelInvitation，后端校验订单是否终结）
  onReleaseTap(e) {
    const id = e.currentTarget.dataset.id
    if (!id) { return }
    wx.showModal({
      title: '释放邀请',
      content: '此操作将作废该邀请，释放后可重新开单。若关联订单仍有效将无法释放。确认？',
      confirmColor: '#1F3A1F',
      success: res => {
        if (res.confirm) { this._doCancel(id) }
      },
    })
  },

  // ---------- 查看关联订单 ----------
  onViewOrder(e) {
    const orderId = e.currentTarget.dataset.orderid
    if (!orderId) {
      wx.showToast({ title: '订单生成中，请稍后刷新', icon: 'none' })
      return
    }
    wx.navigateTo({ url: `/subpackages/profile/order-detail/index?id=${orderId}` })
  },

  // ---------- 海报 ----------
  async onPosterTap(e) {
    const id = e.currentTarget.dataset.id
    const inv = this.data.list.find(x => x._id === id)
    if (!inv) { return }
    this.setData({ posterVisible: true, posterInvitation: inv, posterLoading: true })
    try {
      const res = await OrderService.getInviteQrCode(id)
      if (res.code === 0 && res.data && res.data.fileId) {
        // cloud:// fileID → 临时链接供 canvas 绘制
        const tmpRes = await new Promise((resolve, reject) => {
          wx.cloud.getTempFileURL({ fileList: [res.data.fileId], success: resolve, fail: reject })
        })
        const url = tmpRes.fileList && tmpRes.fileList[0] && tmpRes.fileList[0].tempFileURL
        if (url) {
          this.setData({ posterInvitation: { ...inv, qrUrl: url }, posterLoading: false })
          this._drawPoster({ ...inv, qrUrl: url })
          return
        }
      }
      this.setData({ posterLoading: false })
      wx.showToast({ title: (res.message || '小程序码获取失败'), icon: 'none' })
    } catch (e) {
      this.setData({ posterLoading: false })
      wx.showToast({ title: '海报生成失败，请重试', icon: 'none' })
    }
  },

  /** canvas 2d 绘制海报：品牌头部 + 家庭信息 + 寄养安排 + 价格 + 小程序码 */
  _drawPoster(inv) {
    const query = this.createSelectorQuery()
    query.select('#posterCanvas').fields({ node: true, size: true }).exec(res => {
      if (!res || !res[0] || !res[0].node) { return }
      const canvas = res[0].node
      const dpr = wx.getWindowInfo ? wx.getWindowInfo().pixelRatio : 2
      const W = 340, H = 520 // 设计尺寸
      canvas.width = W * dpr
      canvas.height = H * dpr
      const ctx = canvas.getContext('2d')
      ctx.scale(dpr, dpr)

      // 底：奶油白
      ctx.fillStyle = '#F7F5EF'
      ctx.fillRect(0, 0, W, H)
      // 头部：深森林绿块
      ctx.fillStyle = '#1F3A1F'
      ctx.fillRect(0, 0, W, 110)
      // 品牌字
      ctx.fillStyle = '#C9A24B'
      ctx.font = '600 18px sans-serif'
      ctx.fillText('A R O O R O', 24, 44)
      ctx.fillStyle = 'rgba(247,245,239,0.9)'
      ctx.font = '400 12px sans-serif'
      ctx.fillText('家庭寄养 · 主动开单邀请', 24, 68)

      // 家庭信息
      ctx.fillStyle = '#1A1A17'
      ctx.font = '600 20px sans-serif'
      const hostName = (inv.hostSnapshot && inv.hostSnapshot.hostName) || '寄养家庭'
      ctx.fillText(hostName, 24, 150)
      const addr = (inv.hostSnapshot && inv.hostSnapshot.addressPublic) || ''
      if (addr) {
        ctx.fillStyle = '#736D5F'
        ctx.font = '400 12px sans-serif'
        ctx.fillText(addr.slice(0, 22), 24, 172)
      }

      // 寄养安排
      ctx.strokeStyle = '#E2DED3'
      ctx.beginPath()
      ctx.moveTo(24, 192)
      ctx.lineTo(W - 24, 192)
      ctx.stroke()

      ctx.fillStyle = '#5A564C'
      ctx.font = '400 12px sans-serif'
      ctx.fillText('寄养安排', 24, 216)
      ctx.fillStyle = '#1A1A17'
      ctx.font = '500 15px sans-serif'
      ctx.fillText(`${inv.startDate} 至 ${inv.endDate}`, 24, 240)
      ctx.fillText(`${inv.startAt} 接宠 · ${inv.endAt} 还宠 · ${inv.days} 天`, 24, 264)

      ctx.fillStyle = '#5A564C'
      ctx.font = '400 12px sans-serif'
      ctx.fillText('寄养宠物', 24, 296)
      ctx.fillStyle = '#1A1A17'
      ctx.font = '500 15px sans-serif'
      ctx.fillText(`${inv.petCount} 只`, 24, 320)

      // 价格
      ctx.fillStyle = '#5A564C'
      ctx.font = '400 12px sans-serif'
      ctx.fillText('订单总价', 24, 356)
      ctx.fillStyle = '#A8894A'
      ctx.font = '600 34px sans-serif'
      ctx.fillText(`¥${Number(inv.totalPrice).toFixed(2)}`, 24, 396)

      if (inv.note) {
        ctx.fillStyle = '#736D5F'
        ctx.font = '400 11px sans-serif'
        ctx.fillText(inv.note.slice(0, 26), 24, 424)
      }

      // 小程序码
      const qrImg = canvas.createImage()
      qrImg.onload = () => {
        ctx.drawImage(qrImg, W - 116, H - 132, 92, 92)
        ctx.fillStyle = '#736D5F'
        ctx.font = '400 10px sans-serif'
        ctx.fillText('长按识别 · 填写宠物信息', W - 116, H - 28)
        this._posterCanvas = canvas
      }
      qrImg.src = inv.qrUrl
    })
  },

  onPosterClose() {
    this.setData({ posterVisible: false, posterInvitation: null })
  },

  /** 保存海报到相册（canvas → 临时文件 → saveImageToPhotosAlbum） */
  async onPosterSave() {
    if (!this._posterCanvas || this.data.posterSaving) { return }
    this.setData({ posterSaving: true })
    try {
      const res = await new Promise((resolve, reject) => {
        wx.canvasToTempFilePath({
          canvas: this._posterCanvas,
          success: resolve,
          fail: reject,
        }, this)
      })
      await new Promise((resolve, reject) => {
        wx.saveImageToPhotosAlbum({ filePath: res.tempFilePath, success: resolve, fail: reject })
      })
      wx.showToast({ title: '已保存到相册', icon: 'success' })
    } catch (e) {
      if (e && (e.errMsg || '').includes('auth')) {
        wx.showModal({
          title: '需要相册权限',
          content: '请在设置中允许保存图片到相册',
          confirmText: '去设置',
          success: r => {
            if (r.confirm) { wx.openSetting() }
          },
        })
      } else {
        wx.showToast({ title: '保存失败，请重试', icon: 'none' })
      }
    }
    this.setData({ posterSaving: false })
  },

  // ---------- 新建 ----------
  onCreateTap() {
    wx.navigateTo({ url: '/subpackages/partner/invitation-create/index' })
  },
})
