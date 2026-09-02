const __i18n = require('../../utils/i18n.js')
const __pageI18n = require('../../utils/page-i18n.js')
const __i18nT = (k) => __i18n.t(k, __i18n.getLocale())
const PetCardGenerator = require('./utils/generatePetCard')
const app = getApp()
const { petService, petStore, petFormatter } = require('./index')
const { authService } = require('../../services/AuthService')
const cloudImageBehavior = require('../../behaviors/cloudImageBehavior')
const { ListBehavior } = require('../../behaviors/listBehavior')
const { chooseAndUploadAvatar } = require('./utils/avatarUpload')

const pageI18n = require('../../utils/page-i18n.js')

Page({
  ...pageI18n.mixin(),
  behaviors: [ListBehavior, cloudImageBehavior],
  goBack() {
    wx.navigateBack()
  },

  data: {
    t: __pageI18n.buildTMap(__i18n.getLocale()),
    pet: {},
    userInfo: {},
    isLoggedIn: false,
    isOwner: false,
    fromPetSelect: false,
    isLoading: false,
    navScrolled: false,
    scrollY: 0,
  },

  onLoad(options) {
    this._initNavbarHeight()

    // 合并初始状态到一次 setData，减少渲染帧
    const initialData = { isLoading: true }
    if (options.fromPetSelect) {
      initialData.fromPetSelect = true
    }
    this.setData(initialData)

    const petId = options.petId || options.id
    if (petId) {
      this._petId = petId
      this._firstLoadDone = false
      this.loadPetData(petId)
    } else {
      this.setData({ isLoading: false })
    }
  },

  onShow() {
    const petId = this.data.pet._id || this.data.pet.id || this._petId
    if (!petId) {
      console.warn('[APP] 没有找到 petId')
      return
    }
    // 首次进入时 onLoad 已在加载，跳过避免 loading 重复闪烁
    if (!this._firstLoadDone) {
      return
    }
    // 从子页面返回时静默刷新，不显示 loading 动画
    this.loadPetData(petId, true, true)
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

  async loadPetData(petId, forceRefresh = false, silent = false) {
    const isLoggedIn = authService.isLoggedIn()

    if (!isLoggedIn) {
      if (!silent) {
        this.setData({ isLoading: false })
      }
      return
    }

    try {
      // 守卫：若已在 loading 状态则不重复 setData，减少渲染帧
      if (!silent && !this.data.isLoading) {
        this.setData({ isLoading: true })
      }

      const pet = await petStore.fetchPetDetail(petId, forceRefresh)

      if (pet) {
        const formattedPet = petFormatter.formatPetBasic(pet)

        this.setData({
          pet: formattedPet,
          // P1 修复：公开接口返回 isOwner（服务端用 openid 与 ownerId 比较，
          //   不泄露 ownerId 明文），据此控制编辑/换头像入口
          isOwner: pet.isOwner === true,
          ...(silent ? {} : { isLoading: false }),
        })
      } else {
        console.warn('[APP] 没有获取到宠物数据')
        if (!silent) {
          this.setData({ isLoading: false })
        }
      }

      this._firstLoadDone = true
    } catch (error) {
      console.error('[APP] 加载宠物数据失败:', error)
      if (!silent) {
        this.setData({ isLoading: false })
      }

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
    // P1 修复：非本人宠物不允许换头像（上传前拦截，避免 COS 产生垃圾文件）
    if (!this.data.isOwner) {
      this.error('PERMISSION_DENIED')
      return
    }
    chooseAndUploadAvatar({
      onSuccess: async fileID => {
        try {
          await this.updatePetAvatar(fileID)
          this.toast('AVATAR_UPLOAD_SUCCESS')
        } catch (e) {
          // P2 修复：头像已上传 COS 但档案更新失败时，清理已上传文件，避免垃圾存储
          try {
            if (fileID && fileID.startsWith('cloud://')) {
              wx.cloud.deleteFile({ fileList: [fileID] })
            }
          } catch (_) { /* best-effort */ }
          this.error('SAVE_FAILED')
        }
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
