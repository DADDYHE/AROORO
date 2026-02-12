const app = getApp()
import loginModule from '../../src/modules/auth/index'

Page({
  data: {
    formData: {
      name: '',
      type: '',
      age: '',
      weight: '',
      breed: ''
    },
    petTypes: [
      { name: '狗狗', value: 'dog' },
      { name: '猫咪', value: 'cat' }
    ],
    showTypeSheet: false,
    isLoggedIn: false,
    // 步骤指示器数据
    currentActive: 0,
    stepsData: [
      { text: '基本信息' },
      { text: '健康状况' },
      { text: '生活习惯' },
      { text: '紧急联系人' }
    ]
  },

  async onLoad() {
    console.log('create-step1: 页面加载')
    // 立即强制渲染步骤指示器
    this.setData({
      currentActive: 0,
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
        currentActive: 0,
        stepsData: [
          { text: '基本信息' },
          { text: '健康状况' },
          { text: '生活习惯' },
          { text: '紧急联系人' }
        ]
      })
      console.log('create-step1: 强制更新步骤指示器数据')
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
  onNameInput(e) {
    const formData = { ...this.data.formData }
    formData.name = e.detail.value ? String(e.detail.value) : ''
    this.setData({ formData })
  },

  onAgeInput(e) {
    const formData = { ...this.data.formData }
    formData.age = e.detail.value ? String(e.detail.value) : ''
    this.setData({ formData })
  },

  onWeightInput(e) {
    const formData = { ...this.data.formData }
    formData.weight = e.detail.value ? String(e.detail.value) : ''
    this.setData({ formData })
  },

  onBreedInput(e) {
    const formData = { ...this.data.formData }
    formData.breed = e.detail.value ? String(e.detail.value) : ''
    this.setData({ formData })
  },

  // 选择宠物类型
  selectPetType() {
    this.setData({ showTypeSheet: true })
  },

  onSelectType(event) {
    const formData = { ...this.data.formData }
    formData.type = event.detail.value
    this.setData({ 
      formData,
      showTypeSheet: false
    })
  },

  onCloseTypeSheet() {
    this.setData({ showTypeSheet: false })
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

    const { name, type, age, weight, breed } = this.data.formData

    if (!name || !type || !age || !weight || !breed) {
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
      url: '/subpackages/pet/create-step2'
    })
  }
})