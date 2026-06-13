const PetCardGenerator = require('./utils/generatePetCard')
const app = getApp()
const { petService, petStore, petFormatter } = require('./index')
const { authService } = require('../../services/AuthService')
const cloudImageBehavior = require('../../behaviors/cloudImageBehavior')
const { chooseAndUploadAvatar } = require('./utils/avatarUpload')

const pageI18n = require('../../utils/page-i18n.js')

Page({
  ...pageI18n.mixin(),
  behaviors: [cloudImageBehavior],
  goBack() {
    wx.navigateBack()
  },

  data: {
    pet: {},
    userInfo: {},
    isLoggedIn: false,
    fromPetSelect: false,
    isLoading: false,
    navScrolled: false,
    scrollY: 0,
  },

  onLoad(options) {
    this.setData({
      isLoading: true,
    })

    if (options.fromPetSelect) {
      this.setData({ fromPetSelect: true })
    }

    const petId = options.petId || options.id
    if (petId) {
      this.loadPetData(petId)
    } else {
      this.setData({ isLoading: false })
    }
  },

  onShow() {
    const petId = this.data.pet._id || this.data.pet.id
    if (petId) {
      this.loadPetData(petId, true)
    } else {
      console.warn('[APP] 没有找到 petId')
    }
  },

  onPageScroll(e) {
    const scrollY = e.scrollTop
    const navScrolled = scrollY > 50

    if (navScrolled !== this.data.navScrolled) {
      this.setData({ navScrolled })
    }

    this.setData({ scrollY })
  },

  loginWithWechat() {
    authService.startLogin()
  },

  async loadPetData(petId, forceRefresh = false) {
    const isLoggedIn = authService.isLoggedIn()

    if (!isLoggedIn) {
      this.setData({ isLoading: false })
      return
    }

    try {
      this.setData({ isLoading: true })

      const pet = await petStore.fetchPetDetail(petId, forceRefresh)

      if (pet) {
        const formattedPet = petFormatter.formatPetBasic(pet)

        this.setData({
          pet: formattedPet,
          isLoading: false,
        })
      } else {
        console.warn('[APP] 没有获取到宠物数据')
        this.setData({ isLoading: false })
      }
    } catch (error) {
      console.error('[APP] 加载宠物数据失败:', error)
      this.setData({ isLoading: false })

      if (error.message && (error.message.includes('不存在') || error.message.includes('权限'))) {
        this.error('PET_DELETED')
        setTimeout(() => {
          wx.navigateBack()
        }, 1500)
      } else {
        this.errorDynamic(error.message, 'LOAD_FAILED')
      }
    }
  },

  async generatePetCard() {
    try {
      if (!this.canvas) {
        console.error('[APP] Canvas 2D 实例未获取')
        this.error('CANVAS_INIT_FAILED')
        return
      }

      this.setData({ loading: true })

      const cardImage = await PetCardGenerator.generate(this.canvas, this.data.pet)

      this.setData({
        cardImage,
        loading: false,
      })

      this.toast('CARD_GENERATE_SUCCESS')
    } catch (error) {
      console.error('[APP] 生成宠物身份卡片失败:', error)
      this.setData({ loading: false })
      this.error('CARD_GENERATE_FAILED')
    }
  },

  onCardImageLoadError(e) {
    console.error('[APP] 宠物卡片图片加载失败:', e.detail)
    this.setData({ cardImage: '' })
    this.error('CARD_IMAGE_FAILED')
  },

  chooseAvatar() {
    chooseAndUploadAvatar({
      onSuccess: async fileID => {
        await this.updatePetAvatar(fileID)
        this.toast('AVATAR_UPLOAD_SUCCESS')
      },
      onError: key => this.error(key),
    })
  },

  async updatePetAvatar(fileID) {
    try {
      const updatedPet = { ...this.data.pet, avatarUrl: fileID }
      this.setData({ pet: updatedPet })

      const petId = this.data.pet._id || this.data.pet.id

      await petService.updatePet(
        petId,
        { avatarUrl: fileID }
      )

      petStore.updatePetInList(petId, {
        avatarUrl: fileID,
        updatedAt: new Date(),
      })
    } catch (error) {
      console.error('[APP] 更新宠物头像失败:', error)
      throw error
    }
  },

  savePetCard() {
    if (!this.data.cardImage) {
      this.error('CARD_REQUIRED')
      return
    }

    wx.saveImageToPhotosAlbum({
      filePath: this.data.cardImage,
      success: () => {
        this.toast('SAVE_SUCCESS')
      },
      fail: error => {
        console.error('[APP] 保存卡片失败:', error)
        this.error('SAVE_FAILED')
      },
    })
  },

  goToUpdateProfile(e) {
    const petId = this.data.pet._id || this.data.pet.id

    if (!petId) {
      this.error('PET_DATA_NOT_LOADED')
      return
    }

    wx.navigateTo({
      url: `./update-profile?petId=${petId}`,
      fail: error => {
        console.error('[APP] 页面跳转失败:', error)
        this.error('NAVIGATE_PAGE_FAILED')
      },
    })
  },

  confirmSelect() {
    const pages = getCurrentPages()
    const prevPage = pages[pages.length - 2]

    if (prevPage) {
      const selectedPets = prevPage.data.selectedPets ? [...prevPage.data.selectedPets] : []
      const petId = this.data.pet._id || this.data.pet.id
      const index = selectedPets.indexOf(petId)

      if (index > -1) {
        selectedPets.splice(index, 1)
      } else {
        selectedPets.push(petId)
      }

      const updatedPets = prevPage.data.pets.map(pet => ({
        ...pet,
        checked: selectedPets.includes(pet.id),
      }))

      prevPage.setData({
        selectedPets,
        pets: updatedPets,
      })

      const { BookingData } = require('../../utils/BookingDataService')
      BookingData.set('selectedPets', selectedPets)
      app.globalData.showSelectSuccess = true

      setTimeout(() => {
        wx.navigateBack()
      }, 500)
    } else {
      this.error('NAVIGATE_BACK_FAILED')
    }
  },
})
