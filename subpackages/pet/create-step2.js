const app = getApp()
import loginModule from '../../src/modules/auth/index'

Page({
  data: {
    formData: {
      isSterilized: '',
      isVaccinated: '',
      healthStatus: '',
      allergies: '',
      specialNeeds: ''
    },
    sterilizedOptions: [
      { name: '是', value: 'true' },
      { name: '否', value: 'false' }
    ],
    vaccinatedOptions: [
      { name: '是', value: 'true' },
      { name: '否', value: 'false' }
    ],
    showSterilizedSheet: false,
    showVaccinatedSheet: false,
    isLoggedIn: false,
    // 步骤指示器数据
    currentActive: 1,
    stepsData: [
      { text: '基本信息' },
      { text: '健康状况' },
      { text: '生活习惯' },
      { text: '紧急联系人' }
    ]
  },
  

  onLoad() {
    console.log('create-step2: 页面加载')
    // 立即强制渲染步骤指示器
    this.setData({
      currentActive: 1,
      stepsData: [
        { text: '基本信息' },
        { text: '健康状况' },
        { text: '生活习惯' },
        { text: '紧急联系人' }
      ]
    })
    // 延迟再更新一次
    setTimeout(() => {
      this.setData({
        currentActive: 1,
        stepsData: [
          { text: '基本信息' },
          { text: '健康状况' },
          { text: '生活习惯' },
          { text: '紧急联系人' }
        ]
      })
      console.log('create-step2: 强制更新步骤指示器数据')
    }, 100)
    
    // 检查用户是否已登录
    await this.checkLoginStatus()
    
    // 检查权限
    try {
      const userRole = loginModule.getUserRole() || 'owner'
      const canCreate = userRole === 'owner'
      if (!canCreate) {
        wx.showToast({
          title: '只有宠物主人可以创建宠物档案',
          icon: 'none'
        })
        setTimeout(() => {
          wx.navigateBack()
        }, 1500)
      }
    } catch (error) {
      console.error('检查创建权限失败:', error)
      // 发生错误时，默认允许创建，避免影响用户体验
    }
    
    // 从全局变量中获取上一步的表单数据
    const userRole = app.globalData.userRole || 'owner'
    const petFormData = userRole === 'owner' ? app.globalData.ownerData.petFormData : app.globalData.hostData.petFormData
    if (petFormData) {
      this.setData({
        formData: {
          ...this.data.formData,
          ...petFormData
        }
      })
    }
  },


  // 检查用户登录状态
  async checkLoginStatus() {
    try {
      const isLoggedIn = await loginModule.checkLoginStatusValid()
      this.setData({
        isLoggedIn: isLoggedIn
      })
    } catch (error) {
      console.error('检查登录状态失败:', error)
      this.setData({
        isLoggedIn: false
      })
    }
  },

  // 微信快捷登录
  async loginWithWechat() {
    wx.showLoading({
      title: '登录中...'
    })
    
    try {
      // 使用标准登录模块登录
      const loginResult = await loginModule.login()
      
      if (loginResult.success) {
        console.log('登录成功:', loginResult)
        
        // 更新页面数据
        this.setData({
          isLoggedIn: true
        })
        
        wx.hideLoading()
        wx.showToast({
          title: '登录成功',
          icon: 'success'
        })
      } else {
        console.error('登录失败：', loginResult.message)
        wx.hideLoading()
        wx.showToast({
          title: '登录失败',
          icon: 'none'
        })
      }
    } catch (error) {
      console.error('登录失败：', error)
      wx.hideLoading()
      wx.showToast({
        title: '登录失败',
        icon: 'none'
      })
    }
  },

  // 输入处理
  onHealthStatusInput(e) {
    const formData = { ...this.data.formData }
    formData.healthStatus = e.detail.value ? String(e.detail.value) : ''
    this.setData({ formData })
  },

  onAllergiesInput(e) {
    const formData = { ...this.data.formData }
    formData.allergies = e.detail.value ? String(e.detail.value) : ''
    this.setData({ formData })
  },

  onSpecialNeedsInput(e) {
    const formData = { ...this.data.formData }
    formData.specialNeeds = e.detail.value ? String(e.detail.value) : ''
    this.setData({ formData })
  },

  // 选择是否绝育
  selectSterilized() {
    // 关闭所有可能的焦点
    this.blurAllInputs()
    
    // 显示操作菜单
    this.setData({ showSterilizedSheet: true })
  },

  onSelectSterilized(event) {
    const item = event.detail
    console.log('选择是否绝育:', item)
    const formData = { ...this.data.formData }
    formData.isSterilized = item.value
    this.setData({ 
      formData,
      showSterilizedSheet: false
    })
    console.log('更新后的表单数据:', this.data.formData)
    
    // 确保选择完成后所有输入框失去焦点
    this.blurAllInputs()
  },

  onCloseSterilizedSheet() {
    this.setData({ showSterilizedSheet: false })
    // 确保关闭后所有输入框失去焦点
    this.blurAllInputs()
  },

  // 选择是否接种疫苗
  selectVaccinated() {
    // 关闭所有可能的焦点
    this.blurAllInputs()
    
    // 显示操作菜单
    this.setData({ showVaccinatedSheet: true })
  },

  onSelectVaccinated(event) {
    const item = event.detail
    console.log('选择是否接种疫苗:', item)
    const formData = { ...this.data.formData }
    formData.isVaccinated = item.value
    this.setData({ 
      formData,
      showVaccinatedSheet: false
    })
    console.log('更新后的表单数据:', this.data.formData)
    
    // 确保选择完成后所有输入框失去焦点
    this.blurAllInputs()
  },

  onCloseVaccinatedSheet() {
    this.setData({ showVaccinatedSheet: false })
    // 确保关闭后所有输入框失去焦点
    this.blurAllInputs()
  },

  // 强制所有输入框失去焦点
  blurAllInputs() {
    // 创建一个临时的 input 元素并让它失去焦点，从而移除页面上所有输入框的焦点
    const query = wx.createSelectorQuery()
    query.selectAll('textarea, input')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (res && res[0] && res[0].length > 0) {
          // 模拟点击页面其他区域，使输入框失去焦点
          wx.pageScrollTo({
            scrollTop: 0,
            duration: 0
          })
        }
      })
  },

  // 上一步
  prevStep() {
    // 保存当前表单数据到全局变量，根据用户角色保存到对应的身份数据中
    const userRole = app.globalData.userRole || 'owner'
    if (userRole === 'owner') {
      app.globalData.ownerData.petFormData = { ...this.data.formData }
    } else {
      app.globalData.hostData.petFormData = { ...this.data.formData }
    }
    
    wx.navigateBack()
  },

  // 下一步
  nextStep() {
    if (!this.data.isLoggedIn) {
      wx.showModal({
        title: '请登录',
        content: '您需要先登录才能创建宠物档案',
        confirmText: '去登录',
        success: (res) => {
          if (res.confirm) {
            this.loginWithWechat()
          }
        }
      })
      return
    }

    const { isSterilized, isVaccinated } = this.data.formData

    if (!isSterilized || !isVaccinated) {
      wx.showToast({
        title: '请填写完整的信息',
        icon: 'none'
      })
      return
    }

    // 保存到全局变量，根据用户角色保存到对应的身份数据中
    const userRole = app.globalData.userRole || 'owner'
    if (userRole === 'owner') {
      app.globalData.ownerData.petFormData = { ...this.data.formData }
    } else {
      app.globalData.hostData.petFormData = { ...this.data.formData }
    }

    wx.navigateTo({
      url: '/subpackages/pet/create-step3'
    })
  }
})
