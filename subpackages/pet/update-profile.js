const { petService, petStore, petFormatter } = require('./index')
const { authService } = require('../../services/AuthService')
const cloudImageBehavior = require('../../behaviors/cloudImageBehavior')

const pageI18n = require('../../utils/page-i18n.js')

Page({
  ...pageI18n.mixin(),
  behaviors: [cloudImageBehavior],
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
      avatarUrl: ''
    },
    petTypes: [
      { name: '猫咪', value: 'cat' },
      { name: '狗狗', value: 'dog' },
      { name: '异宠', value: 'exotic' }
    ],
    petGenders: [
      { name: '弟弟', value: 'male' },
      { name: '妹妹', value: 'female' },
      { name: '不确定', value: 'unknown' }
    ],
    showTypeSheet: false,
    showGenderSheet: false,
    showBirthdayPicker: false,
    currentDate: new Date().getTime(),
    minDate: new Date(2000, 0, 1).getTime(),
    maxDate: new Date().getTime(),
    saving: false,
    isLoading: false
  },

  onLoad(options) {
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
          avatarUrl: petData.avatarUrl || ''
        }

        let currentDate = this.data.currentDate
        if (editingData.birthday) {
          const bd = new Date(editingData.birthday)
          if (!isNaN(bd.getTime())) {
            currentDate = bd.getTime()
          }
        }

        this.setData({
          pet: petData,
          editingData: editingData,
          currentDate: currentDate,
          isLoading: false
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
    this.setData({ showBirthdayPicker: true })
  },

  onConfirmBirthday(e) {
    const date = new Date(e.detail)
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    this.setData({ 'editingData.birthday': `${y}-${m}-${d}`, showBirthdayPicker: false })
  },

  onCloseBirthday() {
    this.setData({ showBirthdayPicker: false })
  },

  async savePetInfo() {
    if (this.data.saving) return

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
          updatedAt: new Date()
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
    wx.showActionSheet({
      itemList: ['从相册选择', '拍照'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.chooseImageFromAlbum()
        } else if (res.tapIndex === 1) {
          this.takePhoto()
        }
      },
      fail: (error) => {
        console.error('[APP] 选择操作失败:', error)
      }
    })
  },

  chooseImageFromAlbum() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album'],
      success: (res) => {
        this.uploadAvatar(res.tempFiles[0].tempFilePath)
      },
      fail: (error) => {
        console.error('[APP] 选择图片失败:', error)
        this.error('CHOOSE_IMAGE_FAILED')
      }
    })
  },

  takePhoto() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera'],
      success: (res) => {
        this.uploadAvatar(res.tempFiles[0].tempFilePath)
      },
      fail: (error) => {
        console.error('[APP] 拍照失败:', error)
        this.error('PHOTO_FAILED')
      }
    })
  },

  async uploadAvatar(tempFilePath) {
    try {
      wx.showLoading({ title: '上传中...', mask: true })

      const fileName = `pet-avatarUrls/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.jpg`

      const uploadResult = await wx.cloud.uploadFile({
        cloudPath: fileName,
        filePath: tempFilePath
      })

      this.setData({
        'editingData.avatarUrl': uploadResult.fileID
      })

      wx.hideLoading()
      this.toast('AVATAR_UPLOAD_SUCCESS')
    } catch (error) {
      console.error('[APP] 头像上传失败:', error)
      wx.hideLoading()
      this.error('AVATAR_UPLOAD_FAILED')
    }
  },
})
