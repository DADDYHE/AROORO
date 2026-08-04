const { petService, petStore, petFormatter } = require('./index')
const { authService } = require('../../services/AuthService')
const cloudImageBehavior = require('../../behaviors/cloudImageBehavior')
const { ListBehavior } = require('../../behaviors/listBehavior')
const { chooseAndUploadAvatar } = require('./utils/avatarUpload')

const pageI18n = require('../../utils/page-i18n.js')

Page({
  ...pageI18n.mixin(),
  behaviors: [ListBehavior, cloudImageBehavior],
  data: {
    pet: {},
    editingData: {
      name: '',
      type: '',
      gender: '',
      breed: '',
      birthday: '',
      weight: '',
      note: '',
      avatarUrl: '',
    },
    petTypes: [
      { name: '猫咪', value: 'cat' },
      { name: '狗狗', value: 'dog' },
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
    saving: false,
    isLoading: false,
  },

  onLoad(options) {
    this._initNavbarHeight()
    const now = new Date()
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    this.setData({ todayStr })

    if (options.petId) {
      this.loadPetData(options.petId)
    } else {
      console.error('[APP] 没有收到 petId 参数')
      this.error('INVALID_PARAMS')
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
    }
  },

  async loadPetData(petId) {
    const isLoggedIn = authService.isLoggedIn()

    if (!isLoggedIn) {
      this.setData({ isLoading: false })
      return
    }

    try {
      this.setData({ isLoading: true })

      await petStore.fetchPetDetail(petId, true)

      const currentPet = petStore.getState().currentPet
      if (currentPet) {
        const petData = petFormatter.formatPetBasic(currentPet)

        const editingData = {
          name: petData.name || '',
          type: currentPet.type || '',
          gender: currentPet.gender || '',
          breed: petData.breed || '',
          birthday: currentPet.birthday || '',
          weight: currentPet.weight != null ? String(currentPet.weight) : '',
          note: currentPet.note || '',
          avatarUrl: petData.avatarUrl || '',
        }

        this.setData({
          pet: petData,
          editingData,
          isLoading: false,
        })
      }
    } catch (error) {
      console.error('[APP] 加载宠物数据失败:', error)
      this.setData({ isLoading: false })
      this.errorDynamic(error.message, 'LOAD_FAILED')

      if (error.message && error.message.includes('权限')) {
        setTimeout(() => {
          wx.navigateBack()
        }, 1500)
      }
    }
  },

  onNameInput(e) {
    this.setData({ 'editingData.name': e.detail.value ? String(e.detail.value) : '' })
  },

  onBreedInput(e) {
    this.setData({ 'editingData.breed': e.detail.value ? String(e.detail.value) : '' })
  },

  onWeightInput(e) {
    this.setData({ 'editingData.weight': e.detail.value ? String(e.detail.value) : '' })
  },

  onNoteInput(e) {
    this.setData({ 'editingData.note': e.detail.value ? String(e.detail.value) : '' })
  },

  selectPetType() {
    this.setData({ showTypeSheet: true })
  },

  onSelectType(event) {
    const selected = this.data.petTypes.find(item => item.name === event.detail.name)
    this.setData({ 'editingData.type': selected ? selected.value : '', showTypeSheet: false })
  },

  onCloseTypeSheet() {
    this.setData({ showTypeSheet: false })
  },

  selectGender() {
    this.setData({ showGenderSheet: true })
  },

  onSelectGender(event) {
    const selected = this.data.petGenders.find(item => item.name === event.detail.name)
    this.setData({ 'editingData.gender': selected ? selected.value : '', showGenderSheet: false })
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
    this.setData({ 'editingData.birthday': dateStr })
  },

  onCloseBirthday() {
    // 兼容旧调用（原生 picker 无需关闭）
  },

  async savePetInfo() {
    if (this.data.saving) {return}

    const { name, type, gender } = this.data.editingData
    if (!name || !name.trim()) {
      this.error('PET_NAME_REQUIRED')
      return
    }
    if (!type) {
      this.error('PET_TYPE_REQUIRED')
      return
    }
    if (!gender) {
      this.error('GENDER_REQUIRED')
      return
    }

    try {
      this.setData({ saving: true })

      const updatePayload = {
        name: this.data.editingData.name.trim(),
        type: this.data.editingData.type,
        gender: this.data.editingData.gender,
        breed: this.data.editingData.breed ? this.data.editingData.breed.trim() : '',
        birthday: this.data.editingData.birthday || '',
        weight: this.data.editingData.weight || '',
        note: this.data.editingData.note || '',
        avatarUrl: this.data.editingData.avatarUrl || '',
      }

      const result = await petService.updatePet(
        this.data.pet.id,
        updatePayload
      )

      if (result && result.pet) {
        const updatedPet = result.pet
        if (!updatedPet._id) {
          updatedPet._id = this.data.pet.id
        }
        petStore.updatePetInList(this.data.pet.id, updatedPet)
      } else {
        petStore.updatePetInList(this.data.pet.id, {
          ...this.data.editingData,
          updatedAt: new Date(),
        })
      }

      this.toast('SAVE_SUCCESS')

      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
    } catch (error) {
      console.error('[APP] 保存宠物信息失败:', error)
      this.setData({ saving: false })
      this.errorDynamic(error.message, 'SAVE_FAILED')
    }
  },

  chooseAvatar() {
    chooseAndUploadAvatar({
      onSuccess: fileID => this.setData({ 'editingData.avatarUrl': fileID }),
      onError: key => this.error(key),
    })
  },
})
