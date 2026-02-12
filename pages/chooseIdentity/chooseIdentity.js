// pages/chooseIdentity/chooseIdentity.js
Page({
  data: {
    // 用户已有的身份列表
    existingRoles: [],
    // 是否显示创建新身份的选项
    showCreateOptions: false
  },

  onLoad() {
    // 页面加载时获取用户的身份信息
    this.loadUserRoles()
  },

  // 获取用户的身份信息
  async loadUserRoles() {
    wx.showLoading({ title: '加载中...' })
    try {
      const app = getApp()
      
      // 使用标准登录模块获取用户角色列表
      const roles = app.globalData.loginManager.getRoles()
      console.log('获取到用户角色列表:', roles)
      
      // 如果没有角色信息，尝试从标准登录模块获取
      if (!roles || roles.length === 0) {
        // 检查用户是否已登录
        if (app.globalData.loginManager.checkLoginStatusValid()) {
          // 尝试获取用户信息
          const userInfo = app.globalData.loginManager.getUserInfo()
          if (userInfo && userInfo.openid) {
            // 这里可以添加从云函数获取角色列表的逻辑
            // 暂时使用空数组
            console.log('用户已登录，但未获取到角色信息')
          }
        }
      }
      
      // 更新页面数据
      this.setData({
        existingRoles: roles || [],
        // 如果用户没有身份，显示创建新身份的选项
        showCreateOptions: !roles || roles.length === 0
      })
    } catch (error) {
      console.error('加载用户角色失败:', error)
      // 如果出错，默认显示创建新身份的选项
      this.setData({
        existingRoles: [],
        showCreateOptions: true
      })
    } finally {
      wx.hideLoading()
    }
  },

  // 选择已有身份进行登录
  async selectExistingRole(e) {
    const roleType = e.currentTarget.dataset.roleType
    console.log('用户选择的身份:', roleType)
    
    wx.showLoading({ title: '登录中...' })
    try {
      const app = getApp()
      
      // 使用标准登录模块切换角色
      const switchResult = await app.globalData.loginManager.switchRole(roleType)
      if (switchResult) {
        // 设置全局标志，表明刚刚完成了身份选择
        app.globalData.justCompletedIdentitySelection = true
        wx.showToast({ title: '登录成功' })
        setTimeout(() => {
          wx.switchTab({ url: '/pages/home/index' })
        }, 1000)
      } else {
        wx.showToast({ title: '登录失败，请重试', icon: 'none' })
      }
    } catch (error) {
      console.error('选择身份登录失败:', error)
      wx.showToast({ title: '登录失败，请重试', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  // 创建宠物主人身份
  async createOwnerIdentity() {
    wx.showLoading({ title: '创建中...' })
    try {
      const app = getApp()
      const result = await app.globalData.loginManager.createRole('owner', {
        realName: '',
        phone: '',
        address: '',
        petPreferences: ''
      })
      
      if (result) {
        // 设置全局标志，表明刚刚完成了身份选择
        app.globalData.justCompletedIdentitySelection = true
        wx.showToast({ title: '创建成功' })
        setTimeout(() => {
          wx.switchTab({ url: '/pages/home/index' })
        }, 1000)
      } else {
        wx.showToast({ title: '创建失败，请重试', icon: 'none' })
      }
    } catch (error) {
      console.error('创建宠物主人身份失败:', error)
      wx.showToast({ title: '创建失败，请稍后重试', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  // 创建寄养家庭身份
  async createSitterIdentity() {
    wx.showLoading({ title: '创建中...' })
    try {
      const app = getApp()
      const result = await app.globalData.loginManager.createRole('host', {
        realName: '',
        phone: '',
        homeAddress: '',
        serviceDescription: '',
        certificationPhotos: [],
        isVerified: false
      })
      
      if (result) {
        // 设置全局标志，表明刚刚完成了身份选择
        app.globalData.justCompletedIdentitySelection = true
        wx.showToast({ title: '创建成功' })
        setTimeout(() => {
          wx.switchTab({ url: '/pages/home/index' })
        }, 1000)
      } else {
        wx.showToast({ title: '创建失败，请重试', icon: 'none' })
      }
    } catch (error) {
      console.error('创建寄养家庭身份失败:', error)
      wx.showToast({ title: '创建失败，请稍后重试', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  }
})