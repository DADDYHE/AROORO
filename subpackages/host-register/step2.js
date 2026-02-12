const app = getApp()

Page({
  data: {
    formData: {
      housingType: '',
      hasYard: '',
      maxPets: '',
      hasOtherPets: '',
      nativePetInfo: '',
      petTypes: ''
    },
    housingTypes: [
      { name: '公寓', value: 'apartment' },
      { name: '住宅', value: 'residential' },
      { name: '独栋', value: 'detached' },
      { name: '商业', value: 'commercial' }
    ],
    petTypeOptions: [
      { name: '狗狗', value: 'dog' },
      { name: '猫咪', value: 'cat' },
      { name: '其他', value: 'other' }
    ],
    showHousingTypeSheet: false,
    showHasYardSheet: false,
    showMaxPetsSheet: false,
    showHasOtherPetsSheet: false,
    showPetTypeSheet: false,
    currentActive: 1,
    stepsData: [
      { text: '基本信息' },
      { text: '寄养环境' },
      { text: '服务信息' },
      { text: '资质认证' }
    ]
  },

  onLoad() {
    console.log('host-register step2: 页面加载')
    
    // 强制渲染步骤指示器
    this.setData({
      currentActive: 1,
      stepsData: [
        { text: '基本信息' },
        { text: '寄养环境' },
        { text: '服务信息' },
        { text: '资质认证' }
      ]
    })

    // 检查是否有上一步的数据
    if (app.globalData.hostFormData) {
      this.setData({
        formData: { ...this.data.formData, ...app.globalData.hostFormData }
      })
    }
  },

  // 选择住房类型
  selectHousingType() {
    this.setData({ showHousingTypeSheet: true })
  },

  onSelectHousingType(event) {
    const formData = { ...this.data.formData }
    const selectedValue = event.currentTarget.dataset.value
    // 找到对应的中文名称
    const selectedItem = this.data.housingTypes.find(item => item.value === selectedValue)
    formData.housingType = selectedItem.name
    this.setData({ 
      formData,
      showHousingTypeSheet: false
    })
  },

  onCloseHousingTypeSheet() {
    this.setData({ showHousingTypeSheet: false })
  },

  // 选择是否有庭院
  selectHasYard() {
    this.setData({ showHasYardSheet: true })
  },

  onSelectHasYard(event) {
    const formData = { ...this.data.formData }
    formData.hasYard = event.currentTarget.dataset.value
    this.setData({ 
      formData,
      showHasYardSheet: false
    })
  },

  onCloseHasYardSheet() {
    this.setData({ showHasYardSheet: false })
  },

  // 选择最大可寄养宠物数量
  selectMaxPets() {
    this.setData({ showMaxPetsSheet: true })
  },

  onSelectMaxPets(event) {
    const formData = { ...this.data.formData }
    formData.maxPets = event.currentTarget.dataset.value
    this.setData({ 
      formData,
      showMaxPetsSheet: false
    })
  },

  onCloseMaxPetsSheet() {
    this.setData({ showMaxPetsSheet: false })
  },

  // 选择是否有其他宠物
  selectHasOtherPets() {
    this.setData({ showHasOtherPetsSheet: true })
  },

  onSelectHasOtherPets(event) {
    const formData = { ...this.data.formData }
    formData.hasOtherPets = event.currentTarget.dataset.value
    // 如果选择"否"，清空原住民信息
    if (formData.hasOtherPets === '无') {
      formData.nativePetInfo = ''
    }
    this.setData({ 
      formData,
      showHasOtherPetsSheet: false
    })
  },

  onCloseHasOtherPetsSheet() {
    this.setData({ showHasOtherPetsSheet: false })
  },

  // 选择可寄养宠物类型
  selectPetType() {
    this.setData({ showPetTypeSheet: true })
  },

  onSelectPetType(event) {
    const formData = { ...this.data.formData }
    formData.petTypes = event.currentTarget.dataset.value
    this.setData({ 
      formData,
      showPetTypeSheet: false
    })
  },

  onClosePetTypeSheet() {
    this.setData({ showPetTypeSheet: false })
  },

  // 处理原住民品种和数量输入
  onNativePetInfoInput(event) {
    const formData = { ...this.data.formData }
    formData.nativePetInfo = event.detail
    this.setData({ formData })
  },

  // 上一步
  prevStep() {
    app.globalData.hostFormData = { ...this.data.formData }
    wx.navigateTo({
      url: '/subpackages/host-register/step1'
    })
  },

  // 下一步
  nextStep() {
    const { housingType, maxPets, petTypes, hasYard, hasOtherPets, nativePetInfo } = this.data.formData

    if (!housingType || !maxPets || !petTypes || !hasYard || !hasOtherPets) {
      wx.showToast({
        title: '请填写完整的信息',
        icon: 'none'
      })
      return
    }

    // 如果选择有原住民，需要填写原住民品种和数量
    if (hasOtherPets === '有' && !nativePetInfo) {
      wx.showToast({
        title: '请填写原住民品种和数量',
        icon: 'none'
      })
      return
    }

    // 保存到全局变量
    app.globalData.hostFormData = { ...this.data.formData }

    wx.navigateTo({
      url: '/subpackages/host-register/step3'
    })
  }
})
