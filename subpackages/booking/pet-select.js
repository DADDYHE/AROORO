const __i18n = require('../../utils/i18n.js')
const __pageI18n = require('../../utils/page-i18n.js')
const __i18nT = (k) => __i18n.t(k, __i18n.getLocale())
const { authService } = require('../../services/AuthService')
const { PetService } = require('../../services/CloudFunctionService')
const { BookingData } = require('../../utils/BookingDataService')
const DEFAULT_AVATAR = '/images/default-avatar.svg'
const cloudImageBehavior = require('../../behaviors/cloudImageBehavior')
const shareEntryBehavior = require('../../behaviors/shareEntryBehavior')
const { ListBehavior } = require('../../behaviors/listBehavior')
const { buildSharePath } = require('../../utils/share')
const { isHoliday } = require('../../utils/holidays')
const { requireLogin } = require('../../utils/require-login')

const pageI18n = require('../../utils/page-i18n.js')

Page({
  ...pageI18n.mixin(),
  behaviors: [ListBehavior, cloudImageBehavior, shareEntryBehavior],
  data: {
    t: __pageI18n.buildTMap(__i18n.getLocale()),
    pets: [],
    selectedPets: [],
    isLoggedIn: false,
    fromPage: 'booking',
    isLoading: false,
    showSelectPopup: false,
    popupPet: {},
    serviceFeeding: true,
    walkMinutes: 0,
    selectedServiceDates: [],
    minServiceDate: 0,
    maxServiceDate: 0,
    selectableMinDate: 0,
    selectableMaxDate: 0,
    defaultCalendarDates: [],
    calendarKey: 0,
    calendarFormatter: null,
    iconService: '/images/icons/message-luxury-line.svg',
  },

  async onLoad(options) {
    this._initNavbarHeight()
    const fromPage = options.from || 'booking'

    // 显示范围：今天前7天到今天后60天；可选范围：今天到今天后60天
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const DAY = 24 * 60 * 60 * 1000
    const minServiceDate = new Date(today.getTime() - 7 * DAY).getTime()
    const maxServiceDate = new Date(today.getTime() + 60 * DAY).getTime()
    const selectableMinDate = today.getTime()
    const selectableMaxDate = maxServiceDate

    this.setData({
      fromPage,
      minServiceDate,
      maxServiceDate,
      selectableMinDate,
      selectableMaxDate,
      calendarFormatter: this._buildFormatter(0),
    })

    const isLoggedIn = authService.isLoggedIn()
    this.setData({ isLoggedIn })

    if (isLoggedIn) {
      const forceRefresh = options && options.forceRefresh === 'true'
      this.getPetProfiles(forceRefresh)
    } else {
      requireLogin()
    }
  },

  async onShow() {
    this.resetSelectionStatus()
    const isLoggedIn = authService.isLoggedIn()
    if (isLoggedIn !== this.data.isLoggedIn) {
      this.setData({ isLoggedIn })
    }
    if (isLoggedIn && !this.data.isLoading) {
      this.getPetProfiles(true)
    }
  },

  _buildFormatter(walkMinutes) {
    return function(day) {
      if (!day.date) {return day}
      const holiday = isHoliday(day.date)
      const basePrice = holiday ? 60 : 50
      day.bottomInfo = `¥${basePrice + walkMinutes}`
      return day
    }
  },

  resetSelectionStatus() {
    BookingData.set('selectedPets', [])

    const updatedPets = this.data.pets.map(pet => ({
      ...pet,
      checked: false,
    }))

    this.setData({
      selectedPets: [],
      pets: updatedPets,
    })
  },

  async getPetProfiles(forceRefresh = false) {
    if (!this.data.isLoggedIn) {
      return
    }

    // 显示自定义加载效果
    this.setData({ isLoading: true })

    try {
      // 直接调用云函数获取宠物列表
      const result = await PetService.getPetList()

      if (result && result.code === 0) {
        const petsData = result.data || {}
        const pets = petsData.list || petsData.pets || []
        if (pets && pets.length > 0) {
          this.processPetData(pets)
        } else {
          this.setData({ pets: [], isLoading: false })
        }
      } else {
        this.setData({ pets: [], isLoading: false })
      }
    } catch (error) {
      console.error('[APP] 获取宠物数据失败:', error)
      this.errorDynamic(error.message, 'PET_LOAD_FAILED')
      this.setData({ pets: [], isLoading: false })
    }
  },

  async processPetData(petData) {
    const formattedPets = petData.map(pet => {
      const formattedPet = {
        id: pet._id || pet.id,
        name: pet.name || '',
        type: pet.type === 'dog' ? '狗狗' : pet.type === 'cat' ? '猫咪' : pet.type === 'exotic' ? '异宠' : pet.type || '其他',
        birthday: pet.birthday || '',
        weight: pet.weight || 0,
        breed: pet.breed || '',
        avatarUrl: pet.avatarUrl || '',
        gender: pet.gender || '',
        note: pet.note || '',
        createdAt: pet.createdAt,
        updatedAt: pet.updatedAt,
      }
      formattedPet.checked = false
      return formattedPet
    })

    formattedPets.forEach(pet => {
      if (!pet.avatarUrl) {
        pet.avatarUrl = DEFAULT_AVATAR
      }
    })

    this.setPetData(formattedPets)
  },

  setPetData(formattedPets) {
    const selectedPets = BookingData.get('selectedPets')

    const petsWithChecked = formattedPets.map(pet => ({
      ...pet,
      checked: selectedPets.some(id => String(id) === String(pet.id)),
    }))

    this.setData({
      pets: petsWithChecked,
      selectedPets,
      isLoading: false,
    })
  },

  viewPetDetail(e) {
    const petId = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/subpackages/pet/detail?petId=${petId}&fromPetSelect=true`,
    })
  },
  openSelectPopup(e) {
    const petId = e.currentTarget.dataset.id
    const pet = this.data.pets.find(p => p.id === petId)
    if (!pet) {return}

    if (pet.checked) {
      this.selectPet(petId)
      return
    }

    this.setData({
      popupPet: pet,
      showSelectPopup: true,
      serviceFeeding: true,
      walkMinutes: 0,
      selectedServiceDates: [],
      defaultCalendarDates: [],
    })
  },

  toggleFeeding() {
    this.setData({ serviceFeeding: !this.data.serviceFeeding })
  },

  increaseWalk() {
    const walkMinutes = this.data.walkMinutes + 10
    this.setData({
      walkMinutes,
      calendarFormatter: this._buildFormatter(walkMinutes),
    })
  },

  decreaseWalk() {
    if (this.data.walkMinutes >= 10) {
      const walkMinutes = this.data.walkMinutes - 10
      this.setData({
        walkMinutes,
        calendarFormatter: this._buildFormatter(walkMinutes),
      })
    }
  },

  closeSelectPopup() {
    this.setData({
      showSelectPopup: false,
    })
  },

  onCalendarSelect(e) {
    const dates = e.detail || []
    if (!Array.isArray(dates) || dates.length === 0) {return}

    const weekDays = ['日', '一', '二', '三', '四', '五', '六']
    const formatted = dates.map(ts => {
      const d = new Date(ts)
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return {
        date: `${y}-${m}-${day}`,
        shortDate: `${m}/${day} 周${weekDays[d.getDay()]}`,
        timestamp: ts,
      }
    }).sort((a, b) => a.timestamp - b.timestamp)

    this.setData({
      selectedServiceDates: formatted,
    })
  },

  confirmSelectPet() {
    if (this.data.selectedServiceDates.length === 0) {
      this.error('SERVICE_DATE_REQUIRED')
      return
    }

    const petId = this.data.popupPet.id
    const serviceDates = this.data.selectedServiceDates
    const serviceDatesText = serviceDates.map(d => d.shortDate).join('、')
    const services = {
      feeding: this.data.serviceFeeding,
      walkMinutes: this.data.walkMinutes,
    }

    this.setData({ showSelectPopup: false })

    this.selectPet(petId)

    const updatedPets = this.data.pets.map(pet => {
      if (pet.id === petId) {
        return { ...pet, serviceDates, serviceDatesText, services }
      }
      return pet
    })
    this.setData({ pets: updatedPets })

    const selectedPetDetails = updatedPets.filter(pet => pet.checked)
    BookingData.set('selectedPetDetails', selectedPetDetails)

    const petServices = BookingData.get('petServices') || {}
    petServices[petId] = {
      feeding: services.feeding,
      walkMinutes: services.walkMinutes,
      serviceDates,
      serviceDatesText,
    }
    BookingData.set('petServices', petServices)
  },

  selectPet(e) {

    let petId
    if (typeof e === 'object' && e.currentTarget) {
      if (e.stopPropagation) {
        e.stopPropagation()
      }
      petId = e.currentTarget.dataset.id
    } else {
      petId = e
    }


    let newSelectedPets = [...this.data.selectedPets]
    const index = newSelectedPets.indexOf(petId)

    if (index > -1) {
      newSelectedPets = newSelectedPets.filter(id => id !== petId)
    } else {
      newSelectedPets.push(petId)
    }

    const updatedPets = this.data.pets.map(pet => ({
      ...pet,
      checked: newSelectedPets.includes(pet.id),
    }))

    this.setData({
      selectedPets: newSelectedPets,
      pets: updatedPets,
    })

    BookingData.set('selectedPets', newSelectedPets)
    BookingData.set('selectedPetDetails', updatedPets.filter(pet => pet.checked))

  },

  addNewPet() {
    if (!this.data.isLoggedIn) {
      requireLogin()
      return
    }

    wx.navigateTo({
      url: '/subpackages/pet/create-step1',
    })
  },

  onPetAvatarLoadError(e) {
    const index = e.target.dataset.index
    if (index === undefined) {return}

    const pet = this.data.pets[index]
    if (!pet) {return}

    const key = `pets[${index}].avatarUrl`
    this.setData({ [key]: DEFAULT_AVATAR })
  },

  // 下一步
  nextStep() {
    if (this.data.selectedPets.length === 0) {
      this.error('PET_REQUIRED_MIN')
      return
    }

    const selectedPetDetails = this.data.pets.filter(pet =>
      this.data.selectedPets.includes(pet.id)
    )

    BookingData.set('selectedPetDetails', selectedPetDetails)

    const app = getApp()
    app.globalData.selectedPets = this.data.selectedPets
    app.globalData.selectedPetDetails = selectedPetDetails

    if (this.data.fromPage === 'service') {
      wx.navigateTo({
        url: '/subpackages/feeding/confirm-service',
      })
    } else {
      wx.navigateBack({
        delta: 1,
        success: () => {
        },
      })
    }
  },

  // 页面相关事件处理函数--监听用户下拉动作
  onPullDownRefresh() {
    this.getPetProfiles(true) // 强制刷新
    wx.stopPullDownRefresh()
  },

  // 用户点击右上角分享
  onShareAppMessage() {
    return {
      title: __i18nT('BIZ_IKY2TL'),
      path: buildSharePath('/subpackages/booking/pet-select'),
    }
  },
})
