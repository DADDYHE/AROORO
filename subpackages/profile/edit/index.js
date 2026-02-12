const app = getApp()
const { centralIdentityManager } = require('../../../utils/CentralIdentityManager')

Page({
  data: {
    userInfo: {
      nickName: '',
      gender: '',
      phone: '',
      birthday: '',
      email: '',
      address: '',
      avatarUrl: ''
    },
    genderOptions: [
      { text: '男', value: 'male' },
      { text: '女', value: 'female' },
      { text: '保密', value: 'secret' }
    ],
    genderIndex: 0,
    isLoggedIn: false,
    isLoading: false,
    hasLoadedOnce: false, // 标记是否已经加载过用户信息
    hasLoadedFromDatabase: false, // 标记是否已经从数据库加载过用户信息
    // 头像相关
    showAvatarPreview: false,
    previewAvatarUrl: '',
    tempAvatarFilePath: '',
    avatarUrl: '',
    isChoosingAvatar: false
  },

  onLoad() {
    console.log('Personal Edit page onLoad')
    this.checkLoginAndLoadUserInfo()
  },

  onShow(options) {
    console.log('Personal Edit page onShow', options)
    // 页面显示时，只有第一次加载或从登录页面返回时才重新加载用户信息
    // 避免保存或选择地址后立即覆盖数据
    if (!this.data.hasLoadedOnce) {
      this.checkLoginAndLoadUserInfo()
      this.setData({
        hasLoadedOnce: true
      })
    }
  },

  // 检查登录状态
  checkLoginStatus() {
    try {
      // 检查全局退出状态
      if (app.globalData.isLogout) {
        console.log('checkLoginStatus - 全局是退出状态，设置为未登录')
        this.setData({
          isLoggedIn: false,
          userInfo: {},
          userRole: 'owner'
        })
        return false
      }

      // 检查登录过期
      try {
        const loginStateManager = app.globalData.loginStateManager
        const loginExpiry = loginStateManager ? loginStateManager.get('loginExpiry') : null
        if (loginExpiry && Date.now() > loginExpiry) {
          console.log('checkLoginStatus - 登录已过期，需要重新登录')
          this.setData({
            isLoggedIn: false,
            userInfo: {},
            userRole: 'owner'
          })
          return false
        }
      } catch (error) {
        console.error('检查登录过期失败:', error)
      }

      // 检查用户信息是否存在
      const loginStateManager = app.globalData.loginStateManager
      const userInfo = app.globalData.userInfo || (loginStateManager ? loginStateManager.getUserInfo() : null)
      if (userInfo && userInfo._id) {
        console.log('checkLoginStatus - 已登录')
        this.setData({
          isLoggedIn: true
        })
        return true
      } else {
        console.log('checkLoginStatus - 未登录')
        this.setData({
          isLoggedIn: false
        })
        return false
      }
    } catch (error) {
      console.error('检查登录状态失败:', error)
      this.setData({
        isLoggedIn: false
      })
      return false
    }
  },

  // 微信登录
  loginWithWechat() {
    console.log('开始登录')
    
    // 跳转到个人中心页面进行登录
    wx.switchTab({
      url: '/pages/profile/index',
      success: () => {
        console.log('成功跳转到个人中心')
      },
      fail: (error) => {
        console.error('跳转到个人中心失败:', error)
        wx.showToast({
          title: '跳转失败，请重试',
          icon: 'none'
        })
      }
    })
  },

  // 检查登录状态并加载用户信息
  checkLoginAndLoadUserInfo() {
    const isLoggedIn = this.checkLoginStatus()
    if (isLoggedIn) {
      this.loadUserInfo()
    } else {
      console.log('未登录，显示登录提示')
      wx.showModal({
        title: '请登录',
        content: '您需要先登录才能编辑个人信息',
        confirmText: '去登录',
        success: (res) => {
          if (res.confirm) {
            this.loginWithWechat()
          } else {
            // 用户取消登录，返回上一页
            wx.navigateBack()
          }
        }
      })
    }
  },

  // 从数据库获取用户信息
  fetchFromDatabase() {
    return new Promise((resolve, reject) => {
      try {
        // 尝试通过云函数获取，不传递 openid，让云函数自己从上下文获取
        wx.cloud.callFunction({
          name: 'getUserInfo',
          success: (res) => {
            console.log('从数据库获取用户信息成功:', res)
            if (res.result && res.result.userInfo) {
              resolve(res.result.userInfo)
            } else {
              resolve(null)
            }
          },
          fail: (err) => {
            console.error('通过云函数获取用户信息失败:', err)
            // 不尝试 HTTP 请求，直接使用本地数据
            resolve(null)
          }
        })
      } catch (error) {
        console.error('从数据库获取用户信息异常:', error)
        reject(error)
      }
    })
  },

  // 通过 HTTP 请求获取用户信息
  fetchViaHTTP(openid) {
    return new Promise((resolve, reject) => {
      try {
        // 实际项目中需要替换为真实的后端 API 地址
        const apiUrl = 'https://api.example.com/user/get'
        
        wx.request({
          url: apiUrl,
          method: 'GET',
          data: {
            openid
          },
          success: (res) => {
            if (res.statusCode === 200 && res.data.success && res.data.userInfo) {
              console.log('通过 HTTP 获取用户信息成功:', res)
              resolve(res.data.userInfo)
            } else {
              console.error('通过 HTTP 获取用户信息失败:', res)
              resolve(null)
            }
          },
          fail: (err) => {
            console.error('HTTP 请求失败:', err)
            reject(err)
          }
        })
      } catch (error) {
        console.error('HTTP 获取用户信息异常:', error)
        reject(error)
      }
    })
  },

  // 上传到数据库
  uploadToDatabase(userInfo) {
    return new Promise((resolve, reject) => {
      try {
        // 这里使用 wx.cloud.callFunction 调用云函数更新用户信息
        // 不传递 openid，让云函数自己从上下文获取
        wx.cloud.callFunction({
          name: 'updateUserInfo',
          data: {
            userInfo: {
              nickName: userInfo.nickName,
              gender: userInfo.gender,
              phone: userInfo.phone,
              birthday: userInfo.birthday,
              email: userInfo.email,
              address: userInfo.address,
              avatarUrl: userInfo.avatarUrl
            }
          },
          success: (res) => {
            console.log('上传到数据库成功:', res)
            resolve(res)
          },
          fail: (err) => {
            console.error('上传到数据库失败:', err)
            // 云函数调用失败时，不尝试 HTTP 请求，直接返回成功（本地保存已完成）
            resolve()
          }
        })
      } catch (error) {
        console.error('上传到数据库异常:', error)
        reject(error)
      }
    })
  },

  // 通过 HTTP 请求上传
  uploadViaHTTP(openid, userInfo) {
    return new Promise((resolve, reject) => {
      try {
        // 实际项目中需要替换为真实的后端 API 地址
        const apiUrl = 'https://api.example.com/user/update'
        
        wx.request({
          url: apiUrl,
          method: 'POST',
          data: {
            openid,
            userInfo: {
              nickName: userInfo.nickName,
              gender: userInfo.gender,
              phone: userInfo.phone,
              birthday: userInfo.birthday,
              email: userInfo.email,
              address: userInfo.address,
              avatarUrl: userInfo.avatarUrl
            }
          },
          success: (res) => {
            if (res.statusCode === 200 && res.data.success) {
              console.log('HTTP 上传成功:', res)
              resolve(res)
            } else {
              console.error('HTTP 上传失败:', res)
              reject(new Error('HTTP 上传失败'))
            }
          },
          fail: (err) => {
            console.error('HTTP 请求失败:', err)
            reject(err)
          }
        })
      } catch (error) {
        console.error('HTTP 上传异常:', error)
        reject(error)
      }
    })
  },

  // 加载用户信息
  loadUserInfo() {
    wx.showLoading({
      title: '加载中...'
    })
    
    try {
      console.log('Personal Edit page loadUserInfo - 开始加载用户信息')
      
      // 使用 CentralIdentityManager 获取当前身份信息
      const currentIdentity = centralIdentityManager.getCurrentIdentity()
      const userRole = centralIdentityManager.getCurrentRole() || 'owner'
      
      // 提取角色特定信息
      let roleSpecificInfo = currentIdentity || {}
      
      console.log('Personal Edit page loadUserInfo - 角色特定信息:', {
        hasRoleSpecificInfo: !!currentIdentity,
        userRole: userRole,
        infoKeys: currentIdentity ? Object.keys(currentIdentity) : []
      })
      
      // 处理头像URL
      const avatarUrl = roleSpecificInfo.avatarUrl || ''
      
      // 设置页面数据
      this.setData({
        userInfo: {
          nickName: roleSpecificInfo.nickName || roleSpecificInfo.hostName || '',
          gender: roleSpecificInfo.gender || '',
          phone: roleSpecificInfo.phone || '',
          birthday: roleSpecificInfo.birthday || '',
          email: roleSpecificInfo.email || '',
          address: roleSpecificInfo.address || '',
          avatarUrl: avatarUrl
        },
        avatarUrl: avatarUrl
      })
      
      console.log('Personal Edit page loadUserInfo - 加载用户信息成功:', this.data.userInfo)
      
      // 尝试从数据库获取最新数据（作为更新）- 仅在初始加载时执行
      if (!this.data.hasLoadedFromDatabase) {
        this.fetchFromDatabase().then((databaseUserInfo) => {
          if (databaseUserInfo) {
            console.log('Personal Edit page - 从数据库获取到的用户信息:', databaseUserInfo)
            // 更新为数据库中的最新数据，仅更新页面上未修改的字段
            const pageUserInfo = this.data.userInfo
            const updatedUserInfo = {
              ...roleSpecificInfo,
              ...databaseUserInfo,
              // 保留页面上已修改的字段
              nickName: pageUserInfo.nickName || databaseUserInfo.nickName || databaseUserInfo.hostName || '',
              gender: pageUserInfo.gender || databaseUserInfo.gender || '',
              phone: pageUserInfo.phone || databaseUserInfo.phone || '',
              birthday: pageUserInfo.birthday || databaseUserInfo.birthday || '',
              email: pageUserInfo.email || databaseUserInfo.email || '',
              address: pageUserInfo.address || databaseUserInfo.address || '',
              avatarUrl: pageUserInfo.avatarUrl || databaseUserInfo.avatarUrl || ''
            }
            
            // 更新页面数据
            this.setData({
              userInfo: updatedUserInfo,
              avatarUrl: updatedUserInfo.avatarUrl,
              hasLoadedFromDatabase: true
            })
            
            // 使用 CentralIdentityManager 更新身份信息
            if (userRole) {
              centralIdentityManager.setIdentity(userRole, updatedUserInfo)
            }
            
            console.log('Personal Edit page - 从数据库更新用户信息成功:', updatedUserInfo)
          }
          
          wx.hideLoading()
        }).catch((error) => {
          console.log('Personal Edit page - 从数据库获取数据失败，使用本地数据:', error)
          wx.hideLoading()
        })
      } else {
        wx.hideLoading()
      }
    } catch (error) {
      console.error('Personal Edit page loadUserInfo - 加载用户信息失败:', error)
      wx.hideLoading()
      // 加载失败时使用默认值
      this.setData({
        userInfo: {
          nickName: '',
          gender: '',
          phone: '',
          birthday: '',
          email: '',
          address: '',
          avatarUrl: ''
        },
        avatarUrl: ''
      })
    }
  },

  // 选择头像
  chooseAvatar() {
    if (this.data.isChoosingAvatar) {
      console.log('头像选择已在处理中，防止重复调用')
      return
    }
    
    const that = this
    this.setData({ isChoosingAvatar: true })
    
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
          that.setData({ isChoosingAvatar: false })
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
              that.setData({ isChoosingAvatar: false })
              return
            }
            
            // 显示自定义预览弹窗
            that.setData({
              showAvatarPreview: true,
              previewAvatarUrl: tempFile.tempFilePath,
              tempAvatarFilePath: tempFile.tempFilePath,
              isChoosingAvatar: false
            })
          },
          fail: function (error) {
            console.error('获取图片信息失败:', error)
            // 出错时也显示预览
            that.setData({
              showAvatarPreview: true,
              previewAvatarUrl: tempFile.tempFilePath,
              tempAvatarFilePath: tempFile.tempFilePath,
              isChoosingAvatar: false
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
        that.setData({ isChoosingAvatar: false })
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

    // 使用 CentralIdentityManager 获取当前角色
    const userRole = centralIdentityManager.getCurrentRole() || 'owner'
    const directory = userRole === 'host' ? 'hostAvatars' : 'user-avatars'
    
    // 生成唯一文件名
    const fileName = `${directory}/${Date.now()}_${Math.floor(Math.random() * 1000)}.png`

    console.log('Personal Edit page uploadAvatar - 上传头像:', {
      userRole: userRole,
      directory: directory,
      fileName: fileName
    })

    wx.cloud.uploadFile({
      cloudPath: fileName,
      filePath: tempFilePath,
      success: function (res) {
        console.log('头像上传成功:', res)
        const fileID = res.fileID
        
        // 更新用户信息
        const userInfo = { ...that.data.userInfo }
        userInfo.avatarUrl = fileID
        
        that.setData({ 
          userInfo: userInfo,
          avatarUrl: fileID,
          isLoading: false 
        })
        
        // 使用 CentralIdentityManager 更新身份信息
        if (userRole) {
          const currentIdentity = centralIdentityManager.getCurrentIdentity()
          if (currentIdentity) {
            const updatedIdentity = {
              ...currentIdentity,
              avatarUrl: fileID
            }
            centralIdentityManager.setIdentity(userRole, updatedIdentity)
          }
        }
        
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

  // 返回上一页
  goBack() {
    wx.navigateBack()
  },

  // 昵称输入变化
  onNickNameChange(e) {
    this.setData({
      'userInfo.nickName': e.detail.value
    })
  },

  // 手机号输入变化
  onPhoneChange(e) {
    this.setData({
      'userInfo.phone': e.detail.value
    })
  },

  // 邮箱输入变化
  onEmailChange(e) {
    this.setData({
      'userInfo.email': e.detail.value
    })
  },

  // 跳转到地址管理页面
  goToAddress() {
    wx.navigateTo({
      url: '/subpackages/other/address/index',
      success: () => {
        console.log('成功跳转到地址管理页面')
      },
      fail: (error) => {
        console.error('跳转到地址管理页面失败:', error)
        wx.showToast({
          title: '跳转失败，请重试',
          icon: 'none'
        })
      }
    })
  },

  // 地址选择回调 - 从地址管理页面返回时调用
  onAddressSelected(address) {
    console.log('接收到的地址信息:', address)
    
    // 直接从全局数据获取，确保获取到最新的地址
    const selectedAddress = app.globalData.selectedAddress || address
    console.log('最终使用的地址:', selectedAddress)
    
    if (!selectedAddress || !selectedAddress.detail) {
      console.error('无效的地址信息:', selectedAddress)
      wx.showToast({
        title: '地址信息无效',
        icon: 'none'
      })
      return
    }
    
    try {
      // 直接更新页面数据，确保地址栏显示最新选择的地址
      const addressDetail = selectedAddress.detail
      console.log('准备更新的地址详情:', addressDetail)
      
      this.setData({
        'userInfo.address': addressDetail
      }, () => {
        // 数据更新完成后的回调
        console.log('地址栏显示已更新:', this.data.userInfo.address)
        wx.showToast({
          title: '地址已选择',
          icon: 'success'
        })
      })
      
      // 保存地址到本地和数据库
      this.saveSelectedAddress(selectedAddress)
    } catch (error) {
      console.error('更新地址显示失败:', error)
      wx.showToast({
        title: '更新地址失败',
        icon: 'none'
      })
    }
  },

  // 保存选择的地址到本地和数据库
  saveSelectedAddress(address) {
    try {
      // 使用当前页面的userInfo作为基础，保留未保存的修改
      const pageUserInfo = this.data.userInfo
      
      // 获取LoginStateManager中的用户信息（包含 _id 和 openid）
      const loginStateManager = app.globalData.loginStateManager
      const localUserInfo = loginStateManager ? loginStateManager.getUserInfo() : {}
      
      // 更新所有字段，确保保留原来的 _id 和 openid，同时保留页面上的其他修改
      const updatedUserInfo = {
        ...localUserInfo,
        ...pageUserInfo,
        address: address.detail,
        // 确保保留原来的 _id 和 openid
        _id: localUserInfo._id || pageUserInfo._id,
        openid: localUserInfo.openid || pageUserInfo.openid
      }
      
      // 保存到LoginStateManager
      if (loginStateManager) {
        loginStateManager.updateUserInfo(updatedUserInfo)
      }
      
      // 更新全局数据
      app.globalData.userInfo = updatedUserInfo
      
      console.log('地址已保存到LoginStateManager和全局数据:', updatedUserInfo.address)
      
      // 上传到数据库
      this.uploadToDatabase(updatedUserInfo).then(() => {
        console.log('地址已上传到数据库:', updatedUserInfo.address)
      }).catch(() => {
        console.log('地址本地保存成功，数据库上传失败:', updatedUserInfo.address)
      })
    } catch (error) {
      console.error('保存地址失败:', error)
    }
  },

  // 性别选择变化
  onGenderChange(e) {
    const selectedGender = this.data.genderOptions[e.detail.value].value
    this.setData({
      'userInfo.gender': selectedGender,
      genderIndex: e.detail.value
    })
  },

  // 生日选择变化
  onBirthdayChange(e) {
    this.setData({
      'userInfo.birthday': e.detail.value
    })
  },

  // 验证所有字段
  validateAllFields(userInfo) {
    // 验证昵称
    if (userInfo.nickName && !userInfo.nickName.trim()) {
      wx.showToast({
        title: '昵称不能为空',
        icon: 'none'
      })
      return false
    }
    
    // 验证手机号
    if (userInfo.phone && !/^1[3-9]\d{9}$/.test(userInfo.phone)) {
      wx.showToast({
        title: '手机号格式不正确',
        icon: 'none'
      })
      return false
    }
    
    // 验证邮箱
    if (userInfo.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userInfo.email)) {
      wx.showToast({
        title: '邮箱格式不正确',
        icon: 'none'
      })
      return false
    }
    
    return true
  },

  // 保存所有信息
  saveAll() {
    wx.showLoading({
      title: '保存中...'
    })
    
    try {
      // 获取当前页面的用户信息
      const pageUserInfo = this.data.userInfo
      
      // 验证所有字段
      if (!this.validateAllFields(pageUserInfo)) {
        wx.hideLoading()
        return
      }
      
      // 使用 CentralIdentityManager 获取当前角色
      const userRole = centralIdentityManager.getCurrentRole() || 'owner'
      
      // 获取当前身份信息（包含 _id 和 openid）
      const currentIdentity = centralIdentityManager.getCurrentIdentity()
      const userInfo = currentIdentity || {}
      
      // 更新所有字段，确保保留原来的 _id 和 openid
      const updatedUserInfo = {
        ...userInfo,
        ...pageUserInfo,
        // 确保保留原来的 _id 和 openid
        _id: userInfo._id || this.data.userInfo._id,
        openid: userInfo.openid || this.data.userInfo.openid,
        role: userRole
      }
      
      // 使用 CentralIdentityManager 更新身份信息
      if (userRole) {
        centralIdentityManager.setIdentity(userRole, updatedUserInfo)
        console.log('Personal Edit page saveAll - 使用 CentralIdentityManager 保存身份信息:', userRole)
      }
      
      // 更新页面数据
      this.setData({
        userInfo: updatedUserInfo
      })
      
      // 上传到数据库
      this.uploadToDatabase(updatedUserInfo).then(() => {
        wx.hideLoading()
        wx.showToast({
          title: '保存成功',
          icon: 'success',
          duration: 1500
        })
        console.log('Personal Edit page saveAll - 保存所有用户信息成功:', updatedUserInfo)
        // 1.5秒后自动返回上一页
        setTimeout(() => {
          wx.navigateBack()
        }, 1500)
      }).catch(() => {
        wx.hideLoading()
        wx.showToast({
          title: '保存成功（本地）',
          icon: 'success',
          duration: 1500
        })
        console.log('Personal Edit page saveAll - 本地保存成功，数据库上传失败:', updatedUserInfo)
        // 1.5秒后自动返回上一页
        setTimeout(() => {
          wx.navigateBack()
        }, 1500)
      })
    } catch (error) {
      console.error('Personal Edit page saveAll - 保存所有用户信息失败:', error)
      wx.hideLoading()
      wx.showToast({
        title: '保存失败',
        icon: 'none'
      })
    }
  }
})