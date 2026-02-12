const app = getApp()
import loginModule from '../../src/modules/auth/index'

Page({
  data: {
    requirements: {
      feeding: '',
      exercise: '',
      medical: '',
      other: ''
    },
    isLoggedIn: false,
    estimatedTotal: 0
  },

  onLoad() {
    // 检查用户是否已登录
    this.checkLoginStatus()
    // 获取当前用户角色
    const userRole = app.globalData.userRole || 'owner'
    // 检查是否有已保存的需求
    const bookingRequirements = userRole === 'owner' ? app.globalData.ownerData.bookingRequirements : app.globalData.hostData.bookingRequirements
    if (bookingRequirements) {
      this.setData({
        requirements: bookingRequirements
      })
    }
    // 计算预估总费用
    this.calculateEstimatedTotal()
  },

  // 计算预估总费用
  calculateEstimatedTotal() {
    // 获取当前用户角色
    const userRole = app.globalData.userRole || 'owner'
    // 获取对应身份的选中日期和宠物数据
    const selectedDates = userRole === 'owner' ? app.globalData.ownerData.selectedDates : app.globalData.hostData.selectedDates
    const selectedPets = userRole === 'owner' ? app.globalData.ownerData.selectedPets : app.globalData.hostData.selectedPets
    const petCount = selectedPets.length
    
    // 假设每日基础价格为 100 元
    const dailyPrice = 100
    const days = selectedDates.days || 0
    
    // 计算基础费用
    let total = dailyPrice * days
    
    // 根据宠物数量计算折扣（每增加一只宠物，总费用打 9 折）
    if (petCount > 1) {
      total = total * (0.9 ** (petCount - 1))
    }
    
    // 计算最终价格（保留整数）
    const estimatedTotal = Math.floor(total)
    
    this.setData({
      estimatedTotal
    })
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

  // 喂食要求输入
  onFeedingInput(e) {
    const requirements = { ...this.data.requirements }
    requirements.feeding = e.detail.value
    this.setData({ requirements })
    // 保存到全局变量，根据用户角色保存到对应的身份数据中
    const userRole = app.globalData.userRole || 'owner'
    if (userRole === 'owner') {
      app.globalData.ownerData.bookingRequirements = requirements
    } else {
      app.globalData.hostData.bookingRequirements = requirements
    }
  },

  // 运动需求输入
  onExerciseInput(e) {
    const requirements = { ...this.data.requirements }
    requirements.exercise = e.detail.value
    this.setData({ requirements })
    // 保存到全局变量，根据用户角色保存到对应的身份数据中
    const userRole = app.globalData.userRole || 'owner'
    if (userRole === 'owner') {
      app.globalData.ownerData.bookingRequirements = requirements
    } else {
      app.globalData.hostData.bookingRequirements = requirements
    }
  },

  // 医疗需求输入
  onMedicalInput(e) {
    const requirements = { ...this.data.requirements }
    requirements.medical = e.detail.value
    this.setData({ requirements })
    // 保存到全局变量，根据用户角色保存到对应的身份数据中
    const userRole = app.globalData.userRole || 'owner'
    if (userRole === 'owner') {
      app.globalData.ownerData.bookingRequirements = requirements
    } else {
      app.globalData.hostData.bookingRequirements = requirements
    }
  },

  // 其他需求输入
  onOtherInput(e) {
    const requirements = { ...this.data.requirements }
    requirements.other = e.detail.value
    this.setData({ requirements })
    // 保存到全局变量，根据用户角色保存到对应的身份数据中
    const userRole = app.globalData.userRole || 'owner'
    if (userRole === 'owner') {
      app.globalData.ownerData.bookingRequirements = requirements
    } else {
      app.globalData.hostData.bookingRequirements = requirements
    }
  },

  // 下一步
  nextStep() {
    if (!this.data.isLoggedIn) {
      wx.showModal({
        title: '请登录',
        content: '您需要先登录才能继续预订流程',
        confirmText: '去登录',
        success: (res) => {
          if (res.confirm) {
            this.loginWithWechat()
          }
        }
      })
      return
    }

    wx.navigateTo({
      url: '/subpackages/booking/confirm'
    })
  }
})