// ================================================================
// partner/invitation-create · 寄养家庭主动开单
// ----------------------------------------------------------------
// 家庭选定：寄养起止日期 + 接宠/还宠时刻 + 宠物数量 + 手动定价总价
// 系统按家庭价目表计算参考价展示；总价以家庭输入为准（权威来源）
// 提交 → orderService.createInvitation → 跳转开单列表（分享/海报）
// ================================================================

const { OrderService } = require('../../../services/CloudFunctionService')
const { ListBehavior } = require('../../../behaviors/listBehavior')

const PET_TYPE_TEXT = {
  dog: '狗狗',
  cat: '猫咪',
  exotic: '异宠',
}

Page({
  behaviors: [ListBehavior],

  data: {
    isLoading: true,
    submitting: false,
    editId: '',
    profile: null,
    // 表单
    startDate: '',
    endDate: '',
    startAt: '',
    endAt: '',
    petCount: 1,
    totalPrice: '',   // 输入串（元）
    note: '',
    // 展示
    days: 0,
    referencePrice: 0, // 系统参考价（元）
    priceHint: '',
  },

  onLoad(options) {
    this._initNavbarHeight()
    // 编辑模式：?id=邀请ID —— 回填表单（家庭填错信息场景）
    if (options && options.id) {
      this.setData({ editId: options.id })
      this._loadForEdit(options.id)
      return
    }
    this._loadProfile()
  },

  /** 编辑模式：拉取邀请回填表单（经 getInvitationByCode 公开读，shareCode 唯一定位） */
  async _loadForEdit(invitationId) {
    try {
      // 优先读卡片点击时传递的快照（storage），避免翻列表查找
      let inv = null
      try {
        inv = wx.getStorageSync('_inviteEdit') || null
        if (inv && inv._id !== invitationId) { inv = null }
        wx.removeStorageSync('_inviteEdit')
      } catch (e) { inv = null }
      if (!inv) {
        const { OrderService } = require('../../../services/CloudFunctionService')
        const res = await OrderService.getMyInvitations({ page: 1, pageSize: 50 })
        inv = ((res.data && res.data.list) || []).find(x => x._id === invitationId) || null
      }
      if (!inv) {
        this.setData({ isLoading: false })
        wx.showToast({ title: '邀请不存在', icon: 'none' })
        return
      }
      if (inv.status !== 'active') {
        wx.showToast({ title: '仅待客户填写的邀请可编辑', icon: 'none' })
        setTimeout(() => wx.navigateBack(), 1200)
        return
      }
      this.setData({
        isLoading: false,
        profile: { pricePerDay: 0 },
        startDate: inv.startDate || '',
        endDate: inv.endDate || '',
        startAt: inv.startAt || '',
        endAt: inv.endAt || '',
        petCount: inv.petCount || 1,
        totalPrice: String(inv.totalPrice || ''),
        note: inv.note || '',
        shareCode: inv.shareCode || '',
      })
      this._recalc()
    } catch (e) {
      this.setData({ isLoading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  async _loadProfile() {
    try {
      const { HostService } = require('../../../services/CloudFunctionService')
      const res = await HostService.getMyProfile()
      if (res.code === 0 && res.data) {
        this.setData({
          profile: res.data,
          // 默认接宠/还宠时刻取家庭档案配置
          startAt: this.data.startAt || (res.data.checkInAfter || '10:00'),
          endAt: this.data.endAt || (res.data.checkOutBefore || '12:00'),
          isLoading: false,
        })
        this._recalc()
      } else {
        this.setData({ isLoading: false })
        this.error(() => '未找到寄养家庭档案，请先完成入驻')
      }
    } catch (e) {
      this.setData({ isLoading: false })
      this.error('LOAD_FAILED')
    }
  },

  // ---------- 表单交互 ----------

  onStartDate(e) {
    const v = e.detail.value
    this.setData({ startDate: v })
    if (this.data.endDate && this.data.endDate < v) {
      this.setData({ endDate: v })
    }
    this._recalc()
  },

  onEndDate(e) {
    this.setData({ endDate: e.detail.value })
    this._recalc()
  },

  onStartAt(e) {
    this.setData({ startAt: e.detail.value })
    this._recalc()
  },

  onEndAt(e) {
    this.setData({ endAt: e.detail.value })
    this._recalc()
  },

  onPetCountMinus() {
    if (this.data.petCount <= 1) { return }
    this.setData({ petCount: this.data.petCount - 1 })
    this._recalc()
  },

  onPetCountPlus() {
    if (this.data.petCount >= 10) { return }
    this.setData({ petCount: this.data.petCount + 1 })
    this._recalc()
  },

  onTotalPrice(e) {
    this.setData({ totalPrice: e.detail.value })
  },

  onNote(e) {
    this.setData({ note: e.detail.value })
  },

  /** 参考价本地试算（展示参考；权威金额为家庭输入总价，服务端仅存快照） */
  _recalc() {
    const { startDate, endDate, petCount, profile } = this.data
    if (!startDate || !endDate || !profile) {
      this.setData({ days: 0, referencePrice: 0, priceHint: '' })
      return
    }
    const days = Math.max(1, Math.round(
      (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86400000,
    ))
    const pricePerDay = Number(profile.pricePerDay) || 0
    const ref = Math.round(pricePerDay * days * petCount * 100) / 100
    this.setData({
      days,
      referencePrice: ref,
      priceHint: pricePerDay > 0
        ? `参考价按日单价 ¥${pricePerDay} × ${days} 天 × ${petCount} 只 计算，可与您和客户商定的价格不同`
        : '您尚未设置日单价，仅供参考价不可用',
    })
  },

  // ---------- 提交 ----------

  async onSubmit() {
    if (this.data.submitting) { return }
    const { startDate, endDate, startAt, endAt, petCount, totalPrice, note } = this.data
    const price = Number(totalPrice)

    if (!startDate || !endDate) {
      wx.showToast({ title: '请选择寄养起止日期', icon: 'none' })
      return
    }
    if (!startAt || !endAt) {
      wx.showToast({ title: '请选择接宠和还宠时刻', icon: 'none' })
      return
    }
    if (!Number.isFinite(price) || price < 0.01) {
      wx.showToast({ title: '请输入正确的订单总价（元）', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    try {
      const isEdit = Boolean(this.data.editId)
      const res = isEdit
        ? await OrderService.updateInvitation({
            invitationId: this.data.editId,
            startDate, endDate, startAt, endAt, petCount,
            totalPrice: price,
            note: note || '',
          })
        : await OrderService.createInvitation({
            startDate, endDate, startAt, endAt, petCount,
            totalPrice: price,
            note: note || '',
          })
      if (res.code === 0) {
        wx.showToast({ title: isEdit ? '保存成功' : '开单成功', icon: 'success' })
        setTimeout(() => wx.navigateBack(), 800)
        return
      }
      wx.showToast({ title: res.message || res.msg || '开单失败', icon: 'none' })
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '开单失败，请重试', icon: 'none' })
    }
    this.setData({ submitting: false })
  },
})
