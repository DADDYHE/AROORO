// ================================================================
// booking/invitation-fill · 寄养开单邀请填写页（用户侧）
// ----------------------------------------------------------------
// 进入路径：
//   1. 分享卡片：?code=分享码
//   2. 小程序码海报：scene=c=分享码（wxacode.getUnlimited）
// 流程：
//   加载邀请（公开读）→ 登录校验 → 按家庭指定数量填宠物槽位
//   （选已有档案 / 新建宠物，均需确认健康信息）→ 提交生成订单
//   → 选择定金（30%）或全款支付 → 跳转订单详情
// 提交前宠物信息已通过 petService 持久化（档案+healthInfo），
// submitInvitation 仅传最终 petIds，服务端原子占用邀请并建单。
// ================================================================

const { OrderService, PetService } = require('../../../services/CloudFunctionService')
const PaymentService = require('../../../services/PaymentService')
const { authService } = require('../../../services/AuthService')
const { ListBehavior } = require('../../../behaviors/listBehavior')

const PET_TYPE_OPTIONS = [
  { value: 'cat', label: '猫咪' },
  { value: 'dog', label: '狗狗' },
  { value: 'exotic', label: '异宠' },
]
const GENDER_OPTIONS = [
  { value: 'male', label: '公' },
  { value: 'female', label: '母' },
  { value: 'unknown', label: '未知' },
]

/** 生成空槽位（宠物数量个） */
function buildSlots(petCount) {
  return Array.from({ length: petCount }, (_, i) => ({
    key: `slot_${i}`,
    // mode: 'empty' | 'existing' | 'new'
    mode: 'empty',
    pet: null,          // 已有档案（existing）
    newPet: null,       // 新建宠物草稿（new）{ name,type,typeLabel,gender,genderLabel,breed,birthday,weight }
    healthInfo: null,   // 当前槽位健康信息
    healthTouched: false,
  }))
}

Page({
  behaviors: [ListBehavior],

  data: {
    isLoading: true,
    loadError: '',
    code: '',
    invitation: null,
    days: 0,
    isLoggedIn: false,
    slots: [],
    // 选择已有宠物弹层
    petPickerVisible: false,
    petPickerIndex: -1,
    myPets: [],
    myPetsLoading: false,
    // 提交/支付
    submitting: false,
    paySheetVisible: false,
    paySheetOrder: null,
    depositAmount: 0,
    note: '',
  },

  onLoad(options) {
    console.log('[invitation-fill] onLoad options:', JSON.stringify(options || {}))
    this._initNavbarHeight()
    // 分享卡片 ?code=xxx；小程序码 scene=c=xxx（URL 编码）
    let code = options.code || ''
    if (!code && options.scene) {
      const scene = decodeURIComponent(options.scene)
      const m = scene.match(/(?:^|&|^)c=([^&]+)/)
      if (m) { code = m[1] }
    }
    if (!code) {
      this.setData({ isLoading: false, loadError: '邀请链接无效' })
      return
    }
    this.setData({ code, isLoggedIn: authService.isLoggedIn() })
    this._loadInvitation(code)
  },

  async _loadInvitation(code) {
    this.setData({ isLoading: true, loadError: '' })
    try {
      const res = await OrderService.getInvitationByCode(code)
      if (res.code === 0 && res.data && res.data.invitation) {
        const inv = res.data.invitation
        const days = Math.max(1, Math.round(
          (Date.parse(`${inv.endDate}T00:00:00Z`) - Date.parse(`${inv.startDate}T00:00:00Z`)) / 86400000,
        ))
        console.log('[invitation-fill] loaded ok, code=', code)
        this.setData({
          invitation: inv,
          days,
          slots: buildSlots(inv.petCount || 1),
          isLoading: false,
        })
      } else {
        console.error('[invitation-fill] load failed:', res.message)
        this.setData({ isLoading: false, loadError: res.message || '邀请不存在或已失效' })
      }
    } catch (e) {
      this.setData({ isLoading: false, loadError: '加载失败，请稍后重试' })
    }
  },

  // ---------- 登录 ----------

  onLoginTap() {
    authService.startLogin()
  },

  onShow() {
    // 登录返回后刷新登录态
    const logged = authService.isLoggedIn()
    if (logged !== this.data.isLoggedIn) {
      this.setData({ isLoggedIn: logged })
    }
  },

  /** 二次转发：本页转发始终携带邀请码，收件人可直接进入同一填写页 */
  onShareAppMessage() {
    const inv = this.data.invitation
    const code = this.data.code
    return {
      title: inv
        ? `寄养开单邀请 · ${inv.hostSnapshot && inv.hostSnapshot.hostName || '家庭寄养'} · ${inv.startDate} 至 ${inv.endDate}`
        : '寄养开单邀请',
      path: `/subpackages/booking/invitation-fill/index?code=${code}`,
    }
  },

  goHome() {
    wx.switchTab({ url: '/pages/boarding/index' })
  },

  goOrder() {
    const orderId = this.data.invitation && this.data.invitation.orderId
    if (orderId) {
      wx.navigateTo({ url: `/subpackages/profile/order-detail/index?id=${orderId}` })
    }
  },

  // 修复 #3：filled 且无 orderId（同步中）时，跳寄养订单列表供用户自查
  goMyOrders() {
    wx.navigateTo({ url: '/subpackages/profile/order-stats/index?type=boarding' })
  },

  // ---------- 槽位：选择已有宠物 ----------

  async onPickExisting(e) {
    const idx = e.currentTarget.dataset.index
    this.setData({ petPickerVisible: true, petPickerIndex: idx, myPetsLoading: true })
    try {
      const res = await PetService.getPetList({ page: 1, pageSize: 50 })
      console.log('[invitation-fill] getPetList:', JSON.stringify(res && { code: res.code, total: res.data && res.data.total, listLen: res.data && (res.data.list || []).length }))
      if (res.code === 0 && res.data) {
        this.setData({ myPets: res.data.list || [], myPetsLoading: false })
      } else {
        wx.showToast({ title: res.message || '宠物列表加载失败', icon: 'none' })
        this.setData({ myPets: [], myPetsLoading: false })
      }
    } catch (e) {
      console.error('[invitation-fill] getPetList 异常:', e && e.message)
      wx.showToast({ title: (e && e.message) || '宠物列表加载失败', icon: 'none' })
      this.setData({ myPets: [], myPetsLoading: false })
    }
  },

  onPetPickerClose() {
    this.setData({ petPickerVisible: false, petPickerIndex: -1 })
  },

  onPetSelect(e) {
    const petId = e.currentTarget.dataset.id
    const idx = this.data.petPickerIndex
    const pet = this.data.myPets.find(p => p._id === petId)
    if (!pet || idx < 0) { return }
    // 排除已在其他槽位选中的宠物
    const used = this.data.slots.some((s, i) => i !== idx && s.pet && s.pet._id === petId)
    if (used) {
      wx.showToast({ title: '该宠物已在其他槽位选择', icon: 'none' })
      return
    }
    const slotKey = `slots[${idx}]`
    this.setData({
      [`${slotKey}.mode`]: 'existing',
      [`${slotKey}.pet`]: pet,
      [`${slotKey}.healthInfo`]: (pet.healthInfo && Object.keys(pet.healthInfo).length > 0) ? pet.healthInfo : null,
      [`${slotKey}.healthTouched`]: false,
      petPickerVisible: false,
      petPickerIndex: -1,
    })
  },

  // ---------- 槽位：新建宠物 ----------

  onCreateNew(e) {
    const idx = e.currentTarget.dataset.index
    this.setData({
      [`slots[${idx}].mode`]: 'new',
      [`slots[${idx}].newPet`]: {
        name: '', type: 'cat', typeLabel: '猫咪', gender: 'male', genderLabel: '公',
        breed: '', birthday: '', weight: '',
      },
      [`slots[${idx}].healthInfo`]: null,
      [`slots[${idx}].healthTouched`]: false,
    })
  },

  onSlotReset(e) {
    const idx = e.currentTarget.dataset.index
    this.setData({
      [`slots[${idx}].mode`]: 'empty',
      [`slots[${idx}].pet`]: null,
      [`slots[${idx}].newPet`]: null,
      [`slots[${idx}].healthInfo`]: null,
      [`slots[${idx}].healthTouched`]: false,
    })
  },

  onNewPetInput(e) {
    const { index, field } = e.currentTarget.dataset
    this.setData({ [`slots[${index}].newPet.${field}`]: e.detail.value })
  },

  onNewPetType(e) {
    const idx = Number(e.detail.value) || 0
    const opt = PET_TYPE_OPTIONS[idx]
    if (!opt) { return }
    const { index } = e.currentTarget.dataset
    this.setData({
      [`slots[${index}].newPet.type`]: opt.value,
      [`slots[${index}].newPet.typeLabel`]: opt.label,
    })
  },

  onNewPetGender(e) {
    const idx = Number(e.detail.value) || 0
    const opt = GENDER_OPTIONS[idx]
    if (!opt) { return }
    const { index } = e.currentTarget.dataset
    this.setData({
      [`slots[${index}].newPet.gender`]: opt.value,
      [`slots[${index}].newPet.genderLabel`]: opt.label,
    })
  },

  onNewPetBirthday(e) {
    const { index } = e.currentTarget.dataset
    this.setData({ [`slots[${index}].newPet.birthday`]: e.detail.value })
  },

  // ---------- 健康信息（health-form 组件回调） ----------

  onHealthChange(e) {
    const { index } = e.currentTarget.dataset
    this.setData({
      [`slots[${index}].healthInfo`]: e.detail.healthInfo,
      [`slots[${index}].healthTouched`]: true,
    })
  },

  // ---------- 订单备注 ----------

  onNote(e) {
    this.setData({ note: e.detail.value })
  },

  // ---------- 提交 ----------

  _validateSlots() {
    const { slots } = this.data
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i]
      if (s.mode === 'empty') {
        return `请填写第 ${i + 1} 只宠物的信息`
      }
      if (s.mode === 'new') {
        const np = s.newPet || {}
        if (!np.name || !String(np.name).trim()) { return `请填写第 ${i + 1} 只宠物的昵称` }
        if (!np.breed || !String(np.breed).trim()) { return `请填写第 ${i + 1} 只宠物的品种` }
      }
      if (!s.healthTouched) {
        return `请确认第 ${i + 1} 只宠物的健康信息（如无特殊情况可选择「无」填写）`
      }
    }
    return ''
  },

  async onSubmit() {
    if (this.data.submitting) { return }
    if (!this.data.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      return
    }
    const inv = this.data.invitation
    if (inv && inv.expired) {
      wx.showToast({ title: '该邀请已过期', icon: 'none' })
      return
    }
    const invalid = this._validateSlots()
    if (invalid) {
      wx.showToast({ title: invalid, icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    wx.showLoading({ title: '提交中', mask: true })

    try {
      const petIds = []
      // 1) 逐槽位持久化宠物（新建建档 / 已有档案更新健康信息）
      for (const slot of this.data.slots) {
        if (slot.mode === 'new') {
          const np = slot.newPet
          const createRes = await PetService.createPet({
            name: String(np.name).trim(),
            type: np.type,
            gender: np.gender,
            breed: String(np.breed).trim(),
            birthday: np.birthday || '',
            weight: np.weight || '',
            note: '',
            healthInfo: slot.healthInfo || undefined,
          })
          if (createRes.code !== 0 || !createRes.data) {
            throw new Error(createRes.message || `宠物「${np.name}」建档失败`)
          }
          petIds.push(createRes.data.id || createRes.data.pet._id)
        } else {
          const updateRes = await PetService.updatePet(slot.pet._id, {
            healthInfo: slot.healthInfo || {},
          })
          if (updateRes.code !== 0) {
            throw new Error(updateRes.message || `宠物「${slot.pet.name}」健康信息保存失败`)
          }
          petIds.push(slot.pet._id)
        }
      }

      // 2) 提交邀请 → 生成订单
      const submitRes = await OrderService.submitInvitation({
        code: this.data.code,
        petIds,
        note: this.data.note,
      })
      if (submitRes.code !== 0 || !submitRes.data) {
        throw new Error(submitRes.message || '提交失败，请重试')
      }

      wx.hideLoading()
      const { orderId } = submitRes.data
      const totalPrice = Number(this.data.invitation.totalPrice) || 0
      this.setData({
        submitting: false,
        paySheetVisible: true,
        paySheetOrder: { orderId, totalPrice },
        depositAmount: Math.round(totalPrice * 0.3 * 100) / 100,
      })
    } catch (e) {
      wx.hideLoading()
      // 邀请被并发占用等状态错误：重载邀请展示最新状态
      const msg = (e && e.message) || '提交失败，请重试'
      if (msg.includes('已被') || msg.includes('已被填写') || msg.includes('已被取消')) {
        this.setData({ submitting: false })
        wx.showModal({ title: '提示', content: msg, showCancel: false })
        this._loadInvitation(this.data.code)
        return
      }
      wx.showToast({ title: msg, icon: 'none' })
      this.setData({ submitting: false })
    }
  },

  // ---------- 支付 ----------

  onPaySheetClose() {
    this.setData({ paySheetVisible: false })
    // 未支付关闭 → 跳订单详情（30 分钟超时内可继续支付）
    if (this.data.paySheetOrder) {
      wx.redirectTo({ url: `/subpackages/profile/order-detail/index?id=${this.data.paySheetOrder.orderId}` })
    }
  },

  async onPay(e) {
    const payType = e.currentTarget.dataset.type // deposit / full
    const order = this.data.paySheetOrder
    if (!order) { return }
    const amount = payType === 'deposit' ? this.data.depositAmount : order.totalPrice

    try {
      await PaymentService.pay({
        type: 'order',
        orderId: order.orderId,
        payType,
        amount: Math.round(amount * 100),
        description: `寄养-${this.data.invitation.hostSnapshot && this.data.invitation.hostSnapshot.hostName || '家庭寄养'}${payType === 'deposit' ? '-定金' : ''}`,
      })
      wx.showToast({ title: payType === 'deposit' ? '定金支付成功，尾款可与家庭沟通' : '支付成功，寄养家庭已自动确认', icon: 'none', duration: 2500 })
      this.setData({ paySheetVisible: false })
      setTimeout(() => {
        wx.redirectTo({ url: `/subpackages/profile/order-detail/index?id=${order.orderId}` })
      }, 1200)
    } catch (err) {
      if (err.isCancel) {
        wx.showToast({ title: '已取消支付', icon: 'none' })
      } else if (err.isPending) {
        wx.showToast({ title: err.message, icon: 'none', duration: 2500 })
        this.setData({ paySheetVisible: false })
        setTimeout(() => {
          wx.redirectTo({ url: `/subpackages/profile/order-detail/index?id=${order.orderId}` })
        }, 1200)
      } else {
        wx.showToast({ title: err.message || '支付失败，请重试', icon: 'none' })
      }
    }
  },
})
