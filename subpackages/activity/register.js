const { authService } = require('../../services/AuthService')
const { PetService } = require('../../services/CloudFunctionService')
const { ActivityService } = require('./services/ActivityService')
const { CouponService } = require('../../services/CouponService')
const cloudImageBehavior = require('../../behaviors/cloudImageBehavior')

const pageI18n = require('../../utils/page-i18n.js')

Page({
  ...pageI18n.mixin(),
  behaviors: [cloudImageBehavior],
  data: {
    activityId: '',
    activity: null,
    isRegistered: false,
    pets: [
      { petName: '', petGender: 'male', petBreed: '' }
    ],
    phone: '',
    notes: '',
    friends: [],
    showPetPicker: false,
    myPets: [],
    participantCount: '',
    totalAmount: 0,
    isPaid: false,

    selectedCouponId: '',
    selectedCoupon: null,
    availableCoupons: [],
    couponDiscount: 0,
    finalAmount: 0,
    showCouponSelector: false,
    loadingCoupons: false,
  },

  onLoad(options) {
    const { id } = options
    this.setData({ activityId: id })
    this._loadActivity()
  },

  onShow() {
    const { activityId } = this.data
    if (activityId && !this.data.showPetPicker) {
      this._loadActivity()
    } else if (this.data.showPetPicker) {
      this._refreshMyPets()
    }
  },

  async _loadActivity() {
    const { activityId } = this.data
    try {
      const result = await ActivityService.getActivityDetail(activityId)
      if (result && result.code === 0) {
        const activity = result.data
        this.setData({
          activity,
          isRegistered: activity.isRegistered === true,
        })
        this._recalculateAmount()
        this._loadAvailableCoupons()
      } else {
        const activity = {
          _id: activityId,
          title: '宠物户外社交活动',
          time: '2024-12-25 14:00-16:00',
          location: '城市公园',
          price: 88,
          pricePerPerson: 0,
          pricePerPet: 88,
        }
        this.setData({ activity, totalAmount: 88, finalAmount: 88, isPaid: true })
      }
    } catch (e) {
      const activity = {
        _id: activityId,
        title: '宠物户外社交活动',
        time: '2024-12-25 14:00-16:00',
        location: '城市公园',
        price: 88,
        pricePerPerson: 0,
        pricePerPet: 88,
      }
      this.setData({ activity, totalAmount: 88, finalAmount: 88, isPaid: true })
    }
  },

  _refreshMyPets() {
    const isLoggedIn = authService.isLoggedIn()
    if (!isLoggedIn) return
    PetService.getPets().then(res => {
      const petList = (res && res.data && res.data.list) || []
      this.setData({ myPets: petList })
    }).catch(err => {
      console.error('[Register] 获取宠物列表失败:', err)
      this.setData({ myPets: [] })
    })
  },

  _recalculateAmount() {
    const { activity, participantCount, pets, friends } = this.data
    if (!activity) return

    const pricePerPerson = activity.pricePerPerson || 0
    const pricePerPet = activity.pricePerPet || 0
    const pCount = participantCount ? parseInt(participantCount) : 0
    const validPetCount = pets.filter(p => p.petName && p.petBreed).length
    const friendPetCount = friends ? friends.length : 0
    const petCount = validPetCount + friendPetCount
    const totalAmount = pricePerPerson * pCount + pricePerPet * petCount
    const isPaid = totalAmount > 0

    this.setData({
      totalAmount,
      finalAmount: Math.max(0, totalAmount - (this.data.couponDiscount || 0)),
      isPaid,
      validPetCount: petCount,
    })
  },

  onParticipantCountInput(e) {
    const val = e.detail.value
    this.setData({ participantCount: val })
    this._recalculateAmount()
  },

  async _loadAvailableCoupons() {
    const { activity, totalAmount } = this.data
    if (!activity || !totalAmount) return

    this.setData({ loadingCoupons: true })
    try {
      const result = await CouponService.getAvailableCoupons({
        business: 'activity',
        items: activity._id ? [activity._id] : [],
        amount: totalAmount,
      })
      if (result && result.code === 0) {
        this.setData({ availableCoupons: result.data || [] })
      }
    } catch (e) {
      // silent
    } finally {
      this.setData({ loadingCoupons: false })
    }
  },

  onToggleCouponSelector() {
    this.setData({ showCouponSelector: !this.data.showCouponSelector })
  },

  onSelectCoupon(e) {
    const { id, amount } = e.currentTarget.dataset
    const coupon = this.data.availableCoupons.find(c => c._id === id)
    if (!coupon) return

    const discountAmount = parseFloat(amount)
    const finalAmount = Math.max(0, Math.round((this.data.totalAmount - discountAmount) * 100) / 100)

    this.setData({
      selectedCouponId: id,
      selectedCoupon: coupon,
      couponDiscount: discountAmount,
      finalAmount,
      showCouponSelector: false,
    })
  },

  onRemoveCoupon() {
    this.setData({
      selectedCouponId: '',
      selectedCoupon: null,
      couponDiscount: 0,
      finalAmount: this.data.totalAmount,
    })
  },

  onShowPetPicker() {
    const isLoggedIn = authService.isLoggedIn()
    if (!isLoggedIn) {
      authService.startLogin()
      return
    }
    this._refreshMyPets()
    this.setData({ showPetPicker: true })
  },

  onHidePetPicker() {
    this.setData({ showPetPicker: false })
  },

  onSelectMyPet(e) {
    const { index } = e.currentTarget.dataset
    const selectedPet = this.data.myPets[index]
    const genderMap = { '公': 'male', '母': 'female', '雄': 'male', '雌': 'female' }
    const petGender = genderMap[selectedPet.gender] || selectedPet.gender || 'male'
    const petData = {
      petName: selectedPet.name || '',
      petGender,
      petBreed: selectedPet.breed || selectedPet.species || '',
    }

    const pets = [...this.data.pets]
    let filledIndex = -1
    for (let i = 0; i < pets.length; i++) {
      if (!pets[i].petName && !pets[i].petBreed) {
        filledIndex = i
        pets[i] = { ...pets[i], ...petData }
        break
      }
    }
    const newPets = filledIndex === -1 ? [...pets, petData] : pets
    this.setData({ pets: newPets, showPetPicker: false })
    this._recalculateAmount()
    this.toast(() => `已添加「${petData.petName}」`)
  },

  goToAddPet() {
    this.setData({ showPetPicker: false })
    wx.navigateTo({ url: '/subpackages/pet/create-step1' })
  },

  onInput(e) {
    const { field, index } = e.currentTarget.dataset
    if (index !== undefined) {
      const pets = [...this.data.pets]
      pets[index][field] = e.detail.value
      this.setData({ pets })
    } else {
      this.setData({ [field]: e.detail.value })
    }
  },

  onSelectGender(e) {
    const { gender, field, index } = e.currentTarget.dataset
    if (index !== undefined) {
      const pets = [...this.data.pets]
      pets[index][field] = gender
      this.setData({ pets })
    } else {
      this.setData({ [field || 'petGender']: gender })
    }
  },

  onAddMorePet() {
    if (this.data.pets.length < 5) {
      const pets = [...this.data.pets, { petName: '', petGender: 'male', petBreed: '' }]
      this.setData({ pets })
      this._recalculateAmount()
    }
  },

  onRemovePet(e) {
    const { index } = e.currentTarget.dataset
    if (index > 0) {
      const pets = [...this.data.pets]
      pets.splice(index, 1)
      this.setData({ pets })
      this._recalculateAmount()
    }
  },

  goToAddFriend() {
    wx.navigateTo({
      url: '/subpackages/activity/friend',
      success: (res) => {
        res.eventChannel.emit('acceptDataFromOpenerPage', { from: 'register' })
        res.eventChannel.on('acceptDataFromOpenedPage', (data) => {
          if (data.friend) {
            const friends = [...this.data.friends]
            friends.push(data.friend)
            this.setData({ friends })
            this._recalculateAmount()
            this.toast('ACTIVITY_FRIEND_ADDED')
          }
        })
      },
    })
  },

  onEditFriend(e) {
    const { index } = e.currentTarget.dataset
    const friend = this.data.friends[index]
    wx.navigateTo({
      url: `/subpackages/activity/friend?index=${index}`,
      success: (res) => {
        res.eventChannel.emit('acceptDataFromOpenerPage', { from: 'register', friend, index })
        const listener = (data) => {
          if (data.friend && data.index !== undefined) {
            const friends = [...this.data.friends]
            friends[data.index] = data.friend
            this.setData({ friends })
            this._recalculateAmount()
            this.toast('ACTIVITY_FRIEND_UPDATED')
          }
        }
        res.eventChannel.on('acceptDataFromOpenedPage', listener)
        res.eventChannel.once('pageUnload', () => {
          res.eventChannel.off('acceptDataFromOpenedPage', listener)
        })
      },
    })
  },

  onDeleteFriend(e) {
    const { index } = e.currentTarget.dataset
    const friends = [...this.data.friends]
    friends.splice(index, 1)
    this.setData({ friends })
    this._recalculateAmount()
  },

  async onSubmit() {
    const { activityId, pets, phone, notes, friends, totalAmount, selectedCouponId, couponDiscount, finalAmount, participantCount } = this.data

    const pCount = parseInt(participantCount)
    if (!pCount || pCount < 1) {
      this.error('ACTIVITY_PARTICIPANT_REQUIRED')
      return
    }

    if (!phone) {
      this.error('ACTIVITY_PHONE_REQUIRED')
      return
    }

    for (let i = 0; i < pets.length; i++) {
      const pet = pets[i]
      if (!pet.petName || !pet.petBreed) {
        this.error(() => `请填写第${i + 1}只宠物的必填信息`)
        return
      }
    }

    const registrationData = {
      activityId,
      pets,
      phone,
      notes: notes || '',
      friends: friends || [],
      petIds: pets.map(p => p.petId).filter(Boolean),
      participantCount: pCount,
      totalAmount: finalAmount,
      originalAmount: totalAmount,
      couponId: selectedCouponId || undefined,
      couponDiscount: couponDiscount || 0,
    }

    if (finalAmount <= 0) {
      wx.showLoading({ title: '提交中...', mask: true })
      try {
        const result = await ActivityService.submitRegistration(registrationData)
        wx.hideLoading()
        if (result && result.code === 0) {
          const pages = getCurrentPages()
          const prevPage = pages[pages.length - 2]
          if (prevPage && prevPage._updateRegisteredState) {
            prevPage._updateRegisteredState()
          }
          this.toast('ACTIVITY_REGISTRATION_SUCCESS')
          setTimeout(() => wx.navigateBack(), 1500)
        } else {
          this.errorDynamic(result?.message, 'ACTIVITY_REGISTRATION_FAILED')
        }
      } catch (error) {
        wx.hideLoading()
        console.error('[Register] 提交报名失败:', error)
        this.error('NETWORK_ERROR_LATER')
      }
    } else {
      wx.navigateTo({
        url: `/subpackages/activity/payment?data=${encodeURIComponent(JSON.stringify(registrationData))}`,
      })
    }
  },
})
