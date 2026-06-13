const app = getApp()
const { petStore, petService } = require('./index.js')
const { authService } = require('../../services/AuthService')
const cloudImageBehavior = require('../../behaviors/cloudImageBehavior')
const { buildSharePath } = require('../../utils/share')

const pageI18n = require('../../utils/page-i18n.js')

Page({
  ...pageI18n.mixin(),
  behaviors: [cloudImageBehavior],
  data: {
    petProfiles: [],
    isLoggedIn: false,
    isLoading: false,
    isManaging: false,
    selectedPets: [],
    hasSelectedPets: false,
    fromCreate: false,
  },

  async onLoad(options) {
    petStore.subscribe('pet-list-page', this.handleStoreChange.bind(this))

    const isLoggedIn = authService.isLoggedIn()
    this.setData({ isLoggedIn })

    await this.loadPets(true)

    if (options.from === 'create') {
      this.setData({ fromCreate: true })
    } else {
      this.setData({ fromCreate: false })
    }
  },

  async onShow() {
    const isLoggedIn = authService.isLoggedIn()
    if (isLoggedIn !== this.data.isLoggedIn) {
      this.setData({ isLoggedIn })
    }

    await this.loadPets(true)
    this.setData({ fromCreate: false })
  },

  handleStoreChange(newState) {
    if (!newState) {return}

    this.setData({
      petProfiles: Array.isArray(newState.petList) ? newState.petList : [],
    })
  },

  async loadPets(forceRefresh = false) {
    if (!this.data.isLoggedIn) {
      this.setData({ petProfiles: [] })
      return
    }

    try {
      this.setData({ isLoading: true })
      await petStore.fetchPetList(forceRefresh)
    } catch (error) {
      console.error('[APP] 加载宠物数据失败:', error)
      this.error('LOAD_FAILED')
    } finally {
      this.setData({ isLoading: false })
    }
  },

  createNewPet() {
    if (!this.data.isLoggedIn) {
      this.showModal({ titleKey: 'BIZ_L2PGX', contentKey: 'BIZ_414LG6', confirmText: '去登录' })
      return
    }

    wx.navigateTo({
      url: '/subpackages/pet/create-step1',
      fail: err => {
        console.error('[APP] 跳转失败:', err)
        wx.redirectTo({
          url: '/subpackages/pet/create-step1',
          fail: err2 => {
            console.error('[APP] redirectTo 也失败了:', err2)
            this.error('NAVIGATE_RETRY')
          },
        })
      },
    })
  },

  viewPetDetail(e) {
    const petId = e.currentTarget.dataset.id

    if (!petId) {
      console.error('[APP] 宠物ID为空，无法查看详情')
      this.error('PET_DATA_INVALID')
      return
    }

    wx.navigateTo({
      url: `/subpackages/pet/detail?petId=${petId}`,
    })
  },

  onPullDownRefresh() {
    this.loadPets(true).finally(() => {
      wx.stopPullDownRefresh()
    })
  },

  toggleManageMode() {
    const isManaging = !this.data.isManaging

    if (!isManaging) {
      const petProfiles = this.data.petProfiles.map(pet => ({
        ...pet,
        checked: false,
      }))
      this.setData({
        isManaging: false,
        petProfiles,
        selectedPets: [],
        hasSelectedPets: false,
      })
    } else {
      this.setData({
        isManaging: true,
        selectedPets: [],
        hasSelectedPets: false,
      })
    }
  },

  selectPet(e) {
    const petId = e.currentTarget.dataset.id
    const petProfiles = [...this.data.petProfiles]
    const index = petProfiles.findIndex(pet => pet.id === petId)

    if (index > -1) {
      petProfiles[index].checked = !petProfiles[index].checked
      const hasSelectedPets = petProfiles.some(pet => pet.checked)
      this.setData({
        petProfiles,
        hasSelectedPets,
      })
    }
  },

  deleteSelectedPets() {
    const selectedPets = this.data.petProfiles.filter(pet => pet.checked)

    if (selectedPets.length === 0) {
      this.error('PET_DELETE_REQUIRED')
      return
    }

    this.showModal({
      titleKey: 'BIZ_FROTRU',
      success: (confirmed) => {
        if (!confirmed) {return}
        this.deletePets(selectedPets)
      },
    })
  },

  async deletePets(selectedPets) {
    try {
      for (const pet of selectedPets) {
        const result = await petService.deletePet(pet.id)

        if (result && result.code !== 0) {
          throw new Error(`删除宠物 ${pet.name} 失败：${result.message}`)
        }
      }

      this.toast('DELETE_SUCCESS')

      petStore.reset()
      this.loadPets(true)
      this.setData({ isManaging: false })
    } catch (error) {
      console.error('[APP] 删除宠物失败:', error)
      this.error('DELETE_FAILED')
    }
  },

  onShareAppMessage() {
    return {
      title: '我的宠物',
      path: buildSharePath('/subpackages/pet/list'),
    }
  },

  onUnload() {
    petStore.unsubscribe('pet-list-page')
  },

  onBackPress(options) {
    if (this.data.fromCreate) {
      const pages = getCurrentPages()
      const delta = pages.length - 1

      wx.navigateBack({
        delta,
        fail: navError => {
          console.error('[APP] wx.navigateBack 失败:', navError)
          wx.switchTab({
            url: '/pages/home/index',
            fail: switchError => {
              console.error('[APP] wx.switchTab失败:', switchError)
            },
          })
        },
      })

      return true
    }

    return false
  },
})
