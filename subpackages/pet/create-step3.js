const app = getApp()
import loginModule from '../../src/modules/auth/index'

Page({

  /**
   * 页面的初始数据
   */
  data: {
    userInfo: {},
    isLoggedIn: false,
    formData: {
      dietaryHabit: '',
      exerciseNeed: '',
      sleepingHabit: '',
      socialBehavior: ''
    },
    // 步骤指示器数据
    currentActive: 2,
    stepsData: [
      { text: '基本信息' },
      { text: '健康状况' },
      { text: '生活习惯' },
      { text: '紧急联系人' }
    ]
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    console.log('create-step3: 页面加载')
    // 立即强制渲染步骤指示器
    this.setData({
      currentActive: 2,
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
        currentActive: 2,
        stepsData: [
          { text: '基本信息' },
          { text: '健康状况' },
          { text: '生活习惯' },
          { text: '紧急联系人' }
        ]
      })
      console.log('create-step3: 强制更新步骤指示器数据')
    }, 100)
    
    // 检查用户登录状态
    this.checkLoginStatus()
    // 获取用户信息
    this.getUserInfo()
    
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

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    // 每次页面显示时重新检查登录状态
    this.checkLoginStatus()
    this.getUserInfo()
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

  // 获取用户信息
  getUserInfo() {
    try {
      const userInfo = loginModule.getUserInfo()
      const userRole = loginModule.getUserRole() || 'owner'
      if (userInfo) {
        this.setData({
          userInfo: {
            avatarUrl: userInfo.avatarUrl,
            nickName: userInfo.nickName,
            role: userRole
          }
        })
        console.log('获取用户信息成功:', userInfo.nickName || userRole)
      }
    } catch (error) {
      console.error('获取用户信息异常:', error)
    }
  },

  // 输入处理
  onDietaryHabitInput(e) {
    const formData = { ...this.data.formData }
    formData.dietaryHabit = e.detail.value ? String(e.detail.value) : ''
    this.setData({ formData })
  },

  onExerciseNeedInput(e) {
    const formData = { ...this.data.formData }
    formData.exerciseNeed = e.detail.value ? String(e.detail.value) : ''
    this.setData({ formData })
  },

  onSleepingHabitInput(e) {
    const formData = { ...this.data.formData }
    formData.sleepingHabit = e.detail.value ? String(e.detail.value) : ''
    this.setData({ formData })
  },

  onSocialBehaviorInput(e) {
    const formData = { ...this.data.formData }
    formData.socialBehavior = e.detail.value ? String(e.detail.value) : ''
    this.setData({ formData })
  },

  // 微信快捷登录
  loginWithWechat() {
    wx.showLoading({
      title: '登录中...'
    })
    
    // 使用标准登录模块
    loginModule.login().then((result) => {
      wx.hideLoading()
      if (result.success) {
        console.log('登录成功:', result)
        
        // 更新页面数据
        this.setData({
          userInfo: app.globalData.userInfo,
          isLoggedIn: true
        })
        
        wx.showToast({
          title: '登录成功',
          icon: 'success'
        })
      } else {
        console.error('登录失败:', result)
        wx.showToast({
          title: '登录失败',
          icon: 'none'
        })
      }
    }).catch((error) => {
      console.error('登录失败:', error)
      wx.hideLoading()
      wx.showToast({
        title: '登录失败',
        icon: 'none'
      })
    })
  },

  // 完成创建
  completeCreate() {
    // 检查用户是否已登录
    if (!this.data.isLoggedIn) {
      this.loginWithWechat()
      return
    }

    // 显示创建成功提示
    wx.showToast({
      title: '宠物档案创建成功',
      icon: 'success'
    })

    // 跳转到首页
    setTimeout(() => {
      wx.switchTab({
        url: '/pages/home/index'
      })
    }, 1500)
  },

  // 上一步
  prevStep() {
    // 保存当前表单数据到全局变量
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

    // 保存到全局变量
    const userRole = app.globalData.userRole || 'owner'
    if (userRole === 'owner') {
      app.globalData.ownerData.petFormData = { ...this.data.formData }
    } else {
      app.globalData.hostData.petFormData = { ...this.data.formData }
    }

    wx.navigateTo({
      url: '/subpackages/pet/create-step4'
    })
  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {

  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {

  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {

  }
})