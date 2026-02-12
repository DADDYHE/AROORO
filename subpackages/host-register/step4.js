const app = getApp()

Page({
  data: {
    formData: {
      idCardFront: '',
      idCardBack: '',
      emergencyContactName: '',
      emergencyContactPhone: ''
    },
    currentActive: 3,
    stepsData: [
      { text: '基本信息' },
      { text: '寄养环境' },
      { text: '服务信息' },
      { text: '资质认证' }
    ]
  },

  onLoad() {
    console.log('host-register step4: 页面加载')
    
    // 强制渲染步骤指示器
    this.setData({
      currentActive: 3,
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

  // 选择身份证正面照片
  chooseIdCardFront() {
    this.chooseImage('idCardFront')
  },

  // 选择身份证反面照片
  chooseIdCardBack() {
    this.chooseImage('idCardBack')
  },



  // 选择图片
  chooseImage(field) {
    wx.showActionSheet({
      itemList: ['拍照', '从相册选择'],
      success: (res) => {
        if (res.tapIndex === 0) {
          // 用户选择拍照
          this.takePhoto(field)
        } else if (res.tapIndex === 1) {
          // 用户选择从相册选择
          this.chooseFromAlbum(field)
        }
      },
      fail: (err) => {
        console.error('选择操作失败:', err)
      }
    })
  },
  
  // 拍照
  takePhoto(field) {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['camera'],
      success: (res) => {
        const tempFilePaths = res.tempFilePaths[0]
        this.processImage(tempFilePaths, field)
      },
      fail: (err) => {
        console.error('拍照失败:', err)
        wx.showToast({
          title: '拍照失败',
          icon: 'none'
        })
      }
    })
  },
  
  // 从相册选择
  chooseFromAlbum(field) {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album'],
      success: (res) => {
        const tempFilePaths = res.tempFilePaths[0]
        this.processImage(tempFilePaths, field)
      },
      fail: (err) => {
        console.error('从相册选择失败:', err)
        wx.showToast({
          title: '选择图片失败',
          icon: 'none'
        })
      }
    })
  },
  
  // 处理图片（移除方向检测，任何方向都可以使用）
  processImage(tempFilePaths, field) {
    // 直接上传图片，不再检测方向
    this.uploadImage(tempFilePaths, field)
  },

  // 上传图片
  uploadImage(filePath, field) {
    wx.showLoading({
      title: '上传中...'
    })

    const fileName = `host-register/${Date.now()}_${Math.floor(Math.random() * 10000)}.${filePath.split('.').pop()}`

    wx.cloud.uploadFile({
      cloudPath: fileName,
      filePath: filePath,
      success: (res) => {

        // 直接保存原始 fileID，不转换为临时URL
        const formData = { ...this.data.formData }
        formData[field] = res.fileID
        this.setData({ formData })

        wx.hideLoading()
        wx.showToast({
          title: '上传成功',
          icon: 'success'
        })
      },
      fail: (err) => {
        console.error('上传图片失败:', err)
        wx.hideLoading()
        wx.showToast({
          title: '上传失败',
          icon: 'none'
        })
      }
    })
  },

  // 输入处理
  onEmergencyContactNameInput(e) {
    const formData = { ...this.data.formData }
    formData.emergencyContactName = e.detail.value ? String(e.detail.value) : ''
    this.setData({ formData })
  },

  onEmergencyContactPhoneInput(e) {
    const formData = { ...this.data.formData }
    formData.emergencyContactPhone = e.detail.value ? String(e.detail.value) : ''
    this.setData({ formData })
  },

  // 上一步
  prevStep() {
    app.globalData.hostFormData = { ...this.data.formData }
    wx.navigateTo({
      url: '/subpackages/host-register/step3'
    })
  },

  // 提交注册
  async submit() {
    const { idCardFront, idCardBack, emergencyContactName, emergencyContactPhone, hostName, realName, phone, idCard, address, housingType, hasYard, maxPets, hasOtherPets, nativePetInfo, petTypes, serviceTypes, pricePerDay, description } = this.data.formData

    if (!idCardFront || !idCardBack || !emergencyContactName || !emergencyContactPhone) {
      wx.showToast({
        title: '请填写完整的信息',
        icon: 'none'
      })
      return
    }

    // 验证紧急联系人电话不能与注册电话相同
    if (emergencyContactPhone === phone) {
      wx.showToast({
        title: '紧急联系人电话不能与注册电话相同',
        icon: 'none'
      })
      return
    }

    wx.showLoading({
      title: '提交中...'
    })

    try {
      // 保存到全局变量
      app.globalData.hostFormData = { ...this.data.formData }

      // 组织数据结构为云函数期望的格式
      const hostData = {
        // 直接将头像保存到顶层，与编辑页面保持一致
        avatarUrl: this.data.formData.avatarUrl || '',
        hostName,
        realName,
        phone,
        idCard,
        address,
        housingType,
        hasYard,
        maxPets,
        hasOtherPets,
        nativePetInfo,
        petTypes,
        serviceTypes,
        pricePerDay,
        description,
        idCardFront,
        idCardBack,
        emergencyContactName,
        emergencyContactPhone
      }

      // 调用云函数创建寄养家庭档案
      const result = await wx.cloud.callFunction({
        name: 'createHostProfile',
        data: hostData
      })

      if (result.result.code === 0) {
        // 注册成功
        wx.hideLoading()
        wx.showToast({
          title: '注册成功',
          icon: 'success'
        })

        // 更新用户角色为寄养家庭
        if (app.globalData.loginStateManager) {
          app.globalData.loginStateManager.switchRole('host')
          app.globalData.loginStateManager.set('hostInfo', { ...this.data.formData })
          
          // 更新userInfo对象，确保头像和名称正确显示
          if (app.globalData.userInfo) {
            const updatedUserInfo = {
              ...app.globalData.userInfo,
              role: 'host',
              avatarUrl: this.data.formData.avatarUrl || app.globalData.userInfo.avatarUrl,
              nickName: this.data.formData.hostName || app.globalData.userInfo.nickName
            }
            app.globalData.userInfo = updatedUserInfo
            app.globalData.loginStateManager.updateUserInfo(updatedUserInfo)
          }
        } else {
          // 回退方案：如果LoginStateManager不存在，使用本地存储
          wx.setStorageSync('userRole', 'host')
          app.globalData.userRole = 'host'
          app.globalData.hostInfo = { ...this.data.formData }
          
          if (app.globalData.userInfo) {
            app.globalData.userInfo = {
              ...app.globalData.userInfo,
              role: 'host',
              avatarUrl: app.globalData.hostInfo.avatarUrl || app.globalData.userInfo.avatarUrl,
              nickName: app.globalData.hostInfo.hostName || app.globalData.userInfo.nickName
            }
            try {
              wx.setStorageSync('userInfo', app.globalData.userInfo)
            } catch (error) {
              console.error('保存userInfo到本地存储失败:', error)
            }
          }
        }

        // 更新IM用户资料，确保寄养家庭的头像和昵称同步到IM SDK
        const userName = hostData.hostName || ''
        const avatarUrl = hostData.avatarUrl || ''
        
        // 直接使用原始用户名，不添加前缀（宠物主人和寄养家庭是分别的IM账号）
        if (app.updateIMUserProfile) {
          app.updateIMUserProfile(userName, avatarUrl)
          console.log('[HostRegister] IM用户资料已更新:', { userName, avatarUrl })
        }

        // 跳转到"我的"页面
        setTimeout(() => {
          wx.switchTab({
            url: '/pages/profile/index'
          })
        }, 1500)
      } else {
        // 注册失败
        wx.hideLoading()
        wx.showToast({
          title: result.result.message || '注册失败',
          icon: 'none'
        })
      }
    } catch (error) {
      console.error('提交失败:', error)
      wx.hideLoading()
      wx.showToast({
        title: '网络错误',
        icon: 'none'
      })
    }
  }
})
