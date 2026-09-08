const __i18n = require('../../utils/i18n.js')
const __i18nT = (k) => __i18n.t(k, __i18n.getLocale())
const { authService } = require('../../services/AuthService')
const { petService } = require('./index')
const cloudImageBehavior = require('../../behaviors/cloudImageBehavior')
const { ListBehavior } = require('../../behaviors/listBehavior')
const { chooseAndUploadAvatar } = require('./utils/avatarUpload')

const pageI18n = require('../../utils/page-i18n.js')
const { requireLogin } = require('../../utils/require-login')

Page({
  ...pageI18n.mixin(),
  behaviors: [ListBehavior, cloudImageBehavior],
  data: {
    formData: {
      avatarUrl: '',
      name: '',
      type: '',
      gender: '',
      breed: '',
      birthday: '',
      weight: '',
      note: '',
    },
    petTypes: [
      { name: '狗狗', value: 'dog' },
      { name: '猫咪', value: 'cat' },
      { name: '异宠', value: 'exotic' },
    ],
    petGenders: [
      { name: '弟弟', value: 'male' },
      { name: '妹妹', value: 'female' },
      { name: '不确定', value: 'unknown' },
    ],
    showTypeSheet: false,
    showGenderSheet: false,
    // 原生 <picker mode="date"> 用：今日日期字符串（YYYY-MM-DD）
    todayStr: '',
    isLoggedIn: false,
  },

  onLoad(options) {
    this._initNavbarHeight()
    // 邀请开单来源（2026-09-08）：fill 页跳入建档，提交成功后返回原页并回填槽位
    if (options && options.from === 'invitation') {
      this._fromInvitation = true
    }
    const isLoggedIn = authService.isLoggedIn()
    const now = new Date()
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    this.setData({ isLoggedIn, todayStr })
  },

  async onShow() {
    const isLoggedIn = authService.isLoggedIn()
    if (isLoggedIn !== this.data.isLoggedIn) {
      this.setData({ isLoggedIn })
    }
  },

  loginWithWechat() {
    authService.startLogin()
  },

  chooseAvatar() {
    chooseAndUploadAvatar({
      onSuccess: fileID => this.setData({ 'formData.avatarUrl': fileID }),
      onError: key => this.error(key),
    })
  },

  onNameInput(e) {
    this.setData({ 'formData.name': e.detail.value ? String(e.detail.value) : '' })
  },

  onBreedInput(e) {
    this.setData({ 'formData.breed': e.detail.value ? String(e.detail.value) : '' })
  },

  onWeightInput(e) {
    this.setData({ 'formData.weight': e.detail.value ? String(e.detail.value) : '' })
  },

  onNoteInput(e) {
    this.setData({ 'formData.note': e.detail.value ? String(e.detail.value) : '' })
  },

  selectPetType() {
    this.setData({ showTypeSheet: true })
  },

  onSelectType(event) {
    const selected = this.data.petTypes.find(item => item.name === event.detail.name)
    this.setData({ 'formData.type': selected ? selected.value : '', showTypeSheet: false })
  },

  onCloseTypeSheet() {
    this.setData({ showTypeSheet: false })
  },

  selectGender() {
    this.setData({ showGenderSheet: true })
  },

  onSelectGender(event) {
    const selected = this.data.petGenders.find(item => item.name === event.detail.name)
    this.setData({ 'formData.gender': selected ? selected.value : '', showGenderSheet: false })
  },

  onCloseGenderSheet() {
    this.setData({ showGenderSheet: false })
  },

  selectBirthday() {
    // 原生 <picker mode="date"> 由 WXML 触发，此处保留空函数避免意外调用
  },

  onConfirmBirthday(e) {
    // 原生 picker 返回 'YYYY-MM-DD' 字符串
    const dateStr = e.detail.value
    if (!dateStr) return
    this.setData({ 'formData.birthday': dateStr })
  },

  onCloseBirthday() {
    // 兼容旧调用（原生 picker 无需关闭）
  },

  async completeCreate() {
    if (!(await requireLogin())) {
      return
    }

    const { name, type, breed, gender } = this.data.formData
    if (!name || !type || !breed || !gender) {
      this.error('FILL_ALL_REQUIRED')
      return
    }

    wx.showLoading({ title: __i18nT('BIZ_XOJLY8'), mask: true })

    try {
      const submitData = {
        name: this.data.formData.name,
        type: this.data.formData.type,
        gender: this.data.formData.gender,
        breed: this.data.formData.breed,
        birthday: this.data.formData.birthday || '',
        weight: this.data.formData.weight || '',
        note: this.data.formData.note || '',
        avatarUrl: this.data.formData.avatarUrl || '',
      }

      const result = await petService.createPet(submitData)
      wx.hideLoading()

      if (result && (result.id || result.pet)) {
        this.toast('PET_CREATE_SUCCESS')

        try {
          const { petStore } = require('./store/petStore')
          await petStore.fetchPetList(true)
        } catch (e) {
          console.warn('[APP] 刷新宠物列表缓存失败:', e)
        }

        // 邀请开单来源：写回新档案快照并返回原页（fill 页 onShow 回填槽位）
        if (this._fromInvitation) {
          const pet = result.pet || { _id: result.id, ...submitData }
          wx.setStorageSync('_petCreated', { id: result.id || pet._id, pet: { ...pet, _id: pet._id || result.id } })
          setTimeout(() => wx.navigateBack(), 1200)
          return
        }

        setTimeout(() => {
          wx.switchTab({ url: '/pages/home/index' })
        }, 1500)
      } else {
        console.error('[APP] 创建宠物档案失败:', result)
        this.errorDynamic(result.message, 'CREATE_FAILED')
      }
    } catch (error) {
      wx.hideLoading()
      console.error('[APP] 创建宠物档案失败:', error)
      this.error('CREATE_RETRY_LATER')
    }
  },

})
