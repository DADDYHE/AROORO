const app = getApp()
import loginModule from '../../src/modules/auth/index'

Page({
  data: {
    formData: {
      avatarUrl: '',
      hostName: '',
      realName: '',
      phone: '',
      idCard: '',
      address: '',
      addressDetail: ''
    },
    isLoggedIn: false,
    isLoading: false,
    phoneError: '',
    idCardError: '',
    districtName: '',
    cityName: '',
    districtIndex: 0,
    showDistrictPicker: false,
    // 隐私授权相关
    showPrivacyAuthorization: false,
    hasPrivacyAuthorized: false,
    // 头像预览相关
    showAvatarPreview: false,
    previewAvatarUrl: '',
    tempAvatarFilePath: '',
    // 成都市区县列表
    districts: [
      '锦江区', '青羊区', '金牛区', '武侯区', '成华区',
      '龙泉驿区', '青白江区', '新都区', '温江区', '双流区',
      '郫都区', '新津区', '金堂县', '大邑县', '蒲江县',
      '都江堰市', '彭州市', '邛崃市', '崇州市', '简阳市'
    ],
    // 步骤指示器数据
    currentActive: 0,
    steps: [
      { text: '基本信息' },
      { text: '寄养环境' },
      { text: '服务信息' },
      { text: '资质认证' }
    ]
  },

  async onLoad() {
    console.log('host-register step1: 页面加载')
    
    // 检查隐私授权状态
    this.checkPrivacyAuthorization()
    
    // 检查用户是否已登录
    await this.checkLoginStatus()
    
    // 延迟设置步骤数据，避免 webview 初始化时的竞争条件
    setTimeout(() => {
      // 强制渲染步骤指示器
      this.setData({
        currentActive: 0,
        steps: [
          { text: '基本信息' },
          { text: '寄养环境' },
          { text: '服务信息' },
          { text: '资质认证' }
        ]
      })
    }, 100)
  },

  // 检查隐私授权状态
  checkPrivacyAuthorization() {
    try {
      const hasAuthorized = wx.getStorageSync('hostRegisterPrivacyAuthorized')
      if (!hasAuthorized) {
        // 显示隐私授权弹窗
        this.setData({ showPrivacyAuthorization: true })
      } else {
        this.setData({ hasPrivacyAuthorized: true })
      }
    } catch (error) {
      console.error('检查隐私授权状态失败:', error)
      // 出错时默认显示授权弹窗
      this.setData({ showPrivacyAuthorization: true })
    }
  },

  // 确认隐私授权
  confirmPrivacyAuthorization() {
    console.log('用户确认隐私授权')
    
    // 保存授权状态
    try {
      wx.setStorageSync('hostRegisterPrivacyAuthorized', true)
    } catch (error) {
      console.error('保存隐私授权状态失败:', error)
    }
    
    // 更新页面状态
    this.setData({ 
      showPrivacyAuthorization: false,
      hasPrivacyAuthorized: true 
    })
  },

  // 取消隐私授权
  cancelPrivacyAuthorization() {
    console.log('用户取消隐私授权')
    
    // 显示提示并返回上一页
    wx.showToast({
      title: '需要授权才能继续注册',
      icon: 'none',
      duration: 2000
    })
  },

  // 打开隐私政策
  openPrivacyPolicy() {
    console.log('打开隐私政策')
    // 跳转到隐私政策页面
    wx.navigateTo({
      url: '/subpackages/profile/privacy/privacy'
    })
  },

  // 使用微信手机号快速填写
  onGetPhoneNumber(e) {
    console.log('获取微信手机号:', e)
    
    // 检查是否授权
    if (e.detail.code) {
      // 用户同意授权，获取到code
      console.log('用户同意授权，code:', e.detail.code)
      
      // 调用云函数解密手机号
      this.setData({ isLoading: true })
      
      wx.cloud.callFunction({
        name: 'getPhoneNumber',
        data: {
          code: e.detail.code
        },
        success: (res) => {
          console.log('云函数获取手机号成功:', res.result)
          this.setData({ isLoading: false })
          
          if (res.result && res.result.phoneNumber) {
            // 更新表单数据
            const formData = { ...this.data.formData }
            formData.phone = res.result.phoneNumber
            this.setData({ formData })
            
            wx.showToast({
              title: '手机号获取成功',
              icon: 'success'
            })
          } else {
            wx.showToast({
              title: '手机号获取失败',
              icon: 'none'
            })
          }
        },
        fail: (error) => {
          console.error('云函数获取手机号失败:', error)
          this.setData({ isLoading: false })
          wx.showToast({
            title: '获取失败，请手动填写',
            icon: 'none'
          })
        }
      })
    } else {
      // 用户拒绝授权
      console.log('用户拒绝授权')
      // 确保isLoading为false，避免遮罩层覆盖提示
      this.setData({ isLoading: false })
      // 使用showModal代替showToast，确保用户能看到提示
      wx.showModal({
        title: '授权提示',
        content: '请授权以获取手机号，否则需要手动填写',
        showCancel: false,
        confirmText: '知道了'
      })
    }
  },

  // 检查用户登录状态
  async checkLoginStatus() {
    try {
      console.log('使用标准登录模块检查登录状态')
      const isLoggedIn = await loginModule.isLoggedIn()
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
      console.log('使用标准登录模块进行微信登录')
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
        console.error('登录失败:', loginResult.message)
        wx.hideLoading()
        wx.showToast({
          title: '登录失败',
          icon: 'none'
        })
      }
    } catch (error) {
      console.error('登录过程中发生错误:', error)
      wx.hideLoading()
      wx.showToast({
        title: '登录失败',
        icon: 'none'
      })
    }
  },

  // 输入处理
  onHostNameInput(e) {
    const formData = { ...this.data.formData }
    formData.hostName = e.detail.value ? String(e.detail.value) : ''
    this.setData({ formData })
  },

  onRealNameInput(e) {
    const formData = { ...this.data.formData }
    formData.realName = e.detail.value ? String(e.detail.value) : ''
    this.setData({ formData })
  },

  onPhoneInput(e) {
    const formData = { ...this.data.formData }
    formData.phone = e.detail.value ? String(e.detail.value) : ''
    this.setData({ formData })
  },

  onIdCardInput(e) {
    const formData = { ...this.data.formData }
    formData.idCard = e.detail.value ? String(e.detail.value) : ''
    this.setData({ formData })
  },

  onAddressInput(e) {
    const formData = { ...this.data.formData }
    formData.address = e.detail.value ? String(e.detail.value) : ''
    this.setData({ formData })
  },

  onAddressDetailInput(e) {
    const formData = { ...this.data.formData }
    formData.addressDetail = e.detail.value ? String(e.detail.value) : ''
    this.setData({ formData })
  },

  // 手机号验证
  onPhoneBlur(e) {
    const phone = e.detail.value ? String(e.detail.value) : ''
    let phoneError = ''
    
    if (!phone) {
      phoneError = '请输入手机号码'
    } else if (!/^1[3-9]\d{9}$/.test(phone)) {
      phoneError = '请输入正确的手机号码'
    }
    
    this.setData({ phoneError })
  },

  // 身份证号验证
  onIdCardBlur(e) {
    const idCard = e.detail.value ? String(e.detail.value) : ''
    let idCardError = ''
    
    if (!idCard) {
      idCardError = '请输入身份证号码'
    } else if (!/^[1-9]\d{5}(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]$/.test(idCard)) {
      idCardError = '请输入正确的身份证号码'
    }
    
    this.setData({ idCardError })
  },

  // 确认选择城市
  confirmCitySelection(e) {
    this.setData({
      cityName: '成都市'
    })
  },

  // 使用位置服务选择地址
  chooseLocation() {
    const that = this
    wx.chooseLocation({
      success: function (res) {
        console.log('选择地址成功:', res)
        // 更新地址信息
        const formData = { ...that.data.formData }
        formData.address = res.address
        formData.latitude = res.latitude
        formData.longitude = res.longitude
        formData.addressName = res.name
        that.setData({ formData })
      },
      fail: function (error) {
        console.error('选择地址失败:', error)
        // 处理用户取消选择的情况
        if (error.errMsg !== 'chooseLocation:fail cancel') {
          wx.showToast({
            title: '选择地址失败，请手动填写',
            icon: 'none'
          })
        }
      }
    })
  },

  // 确认选择区县（保留但不再使用）
  confirmDistrictSelection(e) {
    // 此方法保留但不再使用，因为现在使用位置服务选择地址
    console.log('confirmDistrictSelection - 方法已保留但不再使用')
  },
  
  // 选择头像
  chooseAvatar() {
    const that = this
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      maxDuration: 30,
      sizeType: ['compressed'], // 选择压缩图片
      camera: 'back', // 默认使用后置摄像头
      success: function (res) {
        console.log('选择头像成功:', res)
        const tempFile = res.tempFiles[0]
        
        // 检查图片大小
        if (tempFile.size > 5 * 1024 * 1024) { // 5MB限制
          wx.showToast({
            title: '图片大小不能超过5MB',
            icon: 'none'
          })
          return
        }
        
        // 检查图片尺寸
        wx.getImageInfo({
          src: tempFile.tempFilePath,
          success: function (imageInfo) {
            if (imageInfo.width < 200 || imageInfo.height < 200) {
              wx.showToast({
                title: '图片尺寸不能小于200x200',
                icon: 'none'
              })
              return
            }
            
            // 显示自定义预览弹窗
            that.setData({
              showAvatarPreview: true,
              previewAvatarUrl: tempFile.tempFilePath,
              tempAvatarFilePath: tempFile.tempFilePath
            })
          },
          fail: function (error) {
            console.error('获取图片信息失败:', error)
            // 出错时也显示预览
            that.setData({
              showAvatarPreview: true,
              previewAvatarUrl: tempFile.tempFilePath,
              tempAvatarFilePath: tempFile.tempFilePath
            })
          }
        })
      },
      fail: function (err) {
        console.error('选择头像失败:', err)
        // 处理用户取消选择的情况
        if (err.errMsg !== 'chooseMedia:fail cancel') {
          wx.showToast({
            title: '选择头像失败',
            icon: 'none'
          })
        }
      }
    })
  },

  // 取消头像预览
  cancelAvatarPreview() {
    console.log('用户取消头像预览')
    this.setData({
      showAvatarPreview: false,
      previewAvatarUrl: '',
      tempAvatarFilePath: ''
    })
  },

  // 确认头像预览并上传
  confirmAvatarPreview() {
    console.log('用户确认头像预览，开始上传')
    const tempFilePath = this.data.tempAvatarFilePath
    if (tempFilePath) {
      this.uploadAvatar(tempFilePath)
    }
    // 关闭预览弹窗
    this.setData({
      showAvatarPreview: false,
      previewAvatarUrl: '',
      tempAvatarFilePath: ''
    })
  },
  
  // 上传头像到云存储
  uploadAvatar(tempFilePath) {
    const that = this
    this.setData({ isLoading: true })

    // 生成唯一文件名
    const fileName = `hostProfiles/avatars/${Date.now()}_${Math.floor(Math.random() * 1000)}.png`

    wx.cloud.uploadFile({
      cloudPath: fileName,
      filePath: tempFilePath,
      success: function (res) {
        console.log('头像上传成功:', res)
        const fileID = res.fileID
        
        // 更新表单数据
        const formData = { ...that.data.formData }
        formData.avatarUrl = fileID
        that.setData({ formData, isLoading: false })
        
        wx.showToast({
          title: '头像上传成功',
          icon: 'success'
        })
      },
      fail: function (err) {
        console.error('头像上传失败:', err)
        that.setData({ isLoading: false })
        
        // 详细的错误处理
        let errorMessage = '头像上传失败'
        if (err.errCode === -502) {
          errorMessage = '网络连接失败，请检查网络'
        } else if (err.errCode === -504) {
          errorMessage = '上传超时，请稍后重试'
        }
        
        wx.showToast({
          title: errorMessage,
          icon: 'none'
        })
      }
    })
  },

  // 下一步
  nextStep() {
    // 检查隐私授权状态
    if (!this.data.hasPrivacyAuthorized) {
      this.setData({ showPrivacyAuthorization: true })
      return
    }
    
    if (!this.data.isLoggedIn) {
      wx.showModal({
        title: '请登录',
        content: '您需要先登录才能注册寄养家庭',
        confirmText: '去登录',
        success: (res) => {
          if (res.confirm) {
            this.loginWithWechat()
          }
        }
      })
      return
    }

    const { avatarUrl, hostName, realName, phone, idCard, address, addressDetail } = this.data.formData
    const { phoneError, idCardError, districtName } = this.data

    // 添加头像验证
    if (!avatarUrl || avatarUrl === '') {
      wx.showToast({
        title: '请上传家庭头像',
        icon: 'none'
      })
      return
    }

    // 验证必填字段
    if (!hostName || !realName || !phone || !idCard || !address || !addressDetail) {
      wx.showToast({
        title: '请填写完整的信息',
        icon: 'none'
      })
      return
    }

    // 验证手机号和身份证
    if (phoneError || idCardError) {
      wx.showToast({
        title: '请检查填写的信息是否正确',
        icon: 'none'
      })
      return
    }

    // 验证地址选择
    if (!this.data.formData.address) {
      wx.showToast({
        title: '请选择详细地址',
        icon: 'none'
      })
      return
    }
    
    // 验证楼栋单元门牌号
    if (!this.data.formData.addressDetail) {
      wx.showToast({
        title: '请填写楼栋单元门牌号',
        icon: 'none'
      })
      return
    }

    // 保存到全局变量
    app.globalData.hostFormData = { ...this.data.formData }

    wx.navigateTo({
      url: '/subpackages/host-register/step2'
    })
  }
})
