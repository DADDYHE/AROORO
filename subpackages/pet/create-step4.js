const app = getApp()
import loginModule from '../../src/modules/auth/index'

Page({

  /**
   * 页面的初始数据
   */
  data: {
    userInfo: {},
    isLoggedIn: false,
    phoneError: '',
    formData: {
      emergencyContactName: '',
      emergencyContactPhone: '',
      emergencyContactRelation: '',
      emergencyContactNote: ''
    },
    // 步骤指示器数据
    currentActive: 3,
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
    console.log('create-step4: 页面加载')
    // 立即强制渲染步骤指示器
    this.setData({
      currentActive: 3,
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
        currentActive: 3,
        stepsData: [
          { text: '基本信息' },
          { text: '健康状况' },
          { text: '生活习惯' },
          { text: '紧急联系人' }
        ]
      })
      console.log('create-step4: 强制更新步骤指示器数据')
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

  // 验证电话号码格式
  validatePhoneNumber(phoneNumber) {
    // 中国大陆手机号正则表达式：11位数字，以1开头
    const phoneReg = /^1[3-9]\d{9}$/
    return phoneReg.test(phoneNumber)
  },

  // 输入处理
  onContactNameInput(e) {
    const formData = { ...this.data.formData }
    formData.emergencyContactName = e.detail.value ? String(e.detail.value) : ''
    this.setData({ formData })
  },

  onContactPhoneInput(e) {
    const formData = { ...this.data.formData }
    formData.emergencyContactPhone = e.detail.value ? String(e.detail.value) : ''
    // 实时验证电话号码
    let phoneError = ''
    if (formData.emergencyContactPhone && !this.validatePhoneNumber(formData.emergencyContactPhone)) {
      phoneError = '请输入正确的电话号码'
    }
    this.setData({ formData, phoneError })
  },

  onContactRelationInput(e) {
    const formData = { ...this.data.formData }
    formData.emergencyContactRelation = e.detail.value ? String(e.detail.value) : ''
    this.setData({ formData })
  },

  onContactNoteInput(e) {
    const formData = { ...this.data.formData }
    formData.emergencyContactNote = e.detail.value ? String(e.detail.value) : ''
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

    const { emergencyContactName, emergencyContactPhone } = this.data.formData

    if (!emergencyContactName || !emergencyContactPhone) {
      wx.showToast({
        title: '请填写完整的信息',
        icon: 'none'
      })
      return
    }

    // 验证电话号码格式
    if (!this.validatePhoneNumber(emergencyContactPhone)) {
      wx.showToast({
        title: '请输入正确的电话号码',
        icon: 'none'
      })
      return
    }

    // 显示加载中
    wx.showLoading({
      title: '创建中...'
    })

    // 调用云函数创建宠物档案 - 传递完整的表单数据
    const userRole = app.globalData.userRole || 'owner'
    const petFormData = userRole === 'owner' ? app.globalData.ownerData.petFormData : app.globalData.hostData.petFormData
    const completeFormData = {
      ...petFormData,
      ...this.data.formData
    }
    console.log('调用云函数时传递的数据:', completeFormData)
    
    // 获取当前用户的 openid 并打印
    try {
      // 从全局用户信息中获取 openid
      if (app.globalData.userInfo && app.globalData.userInfo.openid) {
        console.log('创建宠物档案时的用户 openid:', app.globalData.userInfo.openid)
      } else {
        console.log('全局用户信息中未找到 openid')
      }
    } catch (error) {
      console.error('获取用户 openid 失败:', error)
    }
    
    wx.cloud.callFunction({
      name: 'createPetProfile',
      data: completeFormData,
      success: (res) => {
        wx.hideLoading()
        
        if (res.result.code === 0) {
          // 创建成功
          console.log('宠物档案创建成功:', res.result)
          wx.showToast({
            title: '宠物档案创建成功',
            icon: 'success'
          })

          // 清空全局变量
          const userRole = app.globalData.userRole || 'owner'
          if (userRole === 'owner') {
            app.globalData.ownerData.petFormData = {}
          } else {
            app.globalData.hostData.petFormData = {}
          }

          // 跳转到选择宠物页面，使用navigateTo保留页面栈以显示微信默认返回键
          setTimeout(() => {
            console.log('开始跳转页面')
            wx.navigateTo({
              url: '/subpackages/booking/pet-select?forceRefresh=true',
              success: () => {
                console.log('跳转页面成功')
              },
              fail: (error) => {
                console.error('跳转页面失败:', error)
              }
            })
          }, 1500)
        } else {
          // 创建失败
          console.error('创建宠物档案失败:', res.result)
          wx.showToast({
            title: res.result.message || '创建失败',
            icon: 'none'
          })
        }
      },
      fail: (error) => {
        wx.hideLoading()
        console.error('创建宠物档案失败:', error)
        wx.showToast({
          title: '创建失败，请稍后重试',
          icon: 'none'
        })
      }
    })
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
