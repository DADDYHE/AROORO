const __i18n = require('../../../utils/i18n.js')
const __pageI18n = require('../../../utils/page-i18n.js')
const __i18nT = (k) => __i18n.t(k, __i18n.getLocale())
const app = getApp()
const { authService } = require('../../../services/AuthService')
const { UserService } = require('../../../services/CloudFunctionService')
const { validateFields } = require('../../validator')

const PROFILE_VALIDATION_FIELDS = [
  { name: 'nickName', label: '昵称', required: true },
  { name: 'phone', label: '手机号', type: 'phone' },
]

const pageI18n = require('../../../utils/page-i18n.js')
const { requireLogin } = require('../../../utils/require-login')
const { ListBehavior } = require('../../../behaviors/listBehavior')

Page({
  ...pageI18n.mixin(),
  behaviors: [ListBehavior],
  data: {
    t: __pageI18n.buildTMap(__i18n.getLocale()),
    userInfo: {
      nickName: '',
      gender: '',
      phone: '',
      birthday: '',
      address: '',
      avatarUrl: '',
    },
    genderOptions: [
      { text: '男', value: 'male' },
      { text: '女', value: 'female' },
      { text: '保密', value: 'secret' },
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
    isChoosingAvatar: false,
  },

  onLoad() {
    this._initNavbarHeight()
    // 置位防首 onShow 竞态：onLoad 已发起加载，首个 onShow 的 !hasLoadedOnce 分支不再重复拉 getUserInfo
    this.setData({ hasLoadedOnce: true })
    this.checkLoginAndLoadUserInfo()
  },

  onShow(options) {
    const globalAddress = app.globalData.selectedAddress
    if (globalAddress) {
      this.setData({
        'userInfo.address': globalAddress.fullAddress || '',
      })
      this.saveSelectedAddress(globalAddress)
      app.globalData.selectedAddress = null
    }

    if (!this.data.hasLoadedOnce) {
      this.checkLoginAndLoadUserInfo()
      this.setData({
        hasLoadedOnce: true,
      })
    }
  },

  // 检查登录状态
  checkLoginStatus() {
    try {
      if (app.globalData.isLogout) {
        this.setData({
          isLoggedIn: false,
          userInfo: {},
        })
        return false
      }

      const isLoggedIn = authService.isLoggedIn()
      if (isLoggedIn) {
        this.setData({
          isLoggedIn: true,
        })
        return true
      } else {
        this.setData({
          isLoggedIn: false,
        })
        return false
      }
    } catch (error) {
      console.error('[APP] 检查登录状态失败:', error)
      this.setData({
        isLoggedIn: false,
      })
      return false
    }
  },

  // 微信登录
  loginWithWechat() {
    authService.startLogin()
  },

  // 检查登录状态并加载用户信息
  checkLoginAndLoadUserInfo() {
    const isLoggedIn = this.checkLoginStatus()
    if (isLoggedIn) {
      this.loadUserInfo()
    } else {
      requireLogin()
    }
  },

  _onSessionRestored() {
    this.checkLoginAndLoadUserInfo()
  },

  // 从数据库获取用户信息
  async fetchFromDatabase() {
    try {
      // 使用 UserService 获取用户信息
      const result = await UserService.getUserInfo()

      if (result && result.code === 0 && result.data) {
        return result.data
      } else {
        return null
      }
    } catch (error) {
      console.error('[APP] 从数据库获取用户信息异常:', error)
      return null
    }
  },

  // 上传到数据库
  async uploadToDatabase(userInfo) {
    try {
      const updateData = {
        gender: userInfo.gender,
        phone: userInfo.phone,
        birthday: userInfo.birthday,
        address: userInfo.address,
        avatarUrl: userInfo.avatarUrl,
        ownerName: userInfo.nickName,
      }

      // 使用 UserService 更新用户信息
      const result = await UserService.updateUserInfo({
        userInfo: updateData,
      })

      if (result && result.code === 0) {
        return result
      } else {
        console.error('[APP] 上传到数据库失败:', result?.message || '未知错误')
        return null
      }
    } catch (error) {
      console.error('[APP] 上传到数据库失败:', error)
      // 云函数调用失败时，不尝试 HTTP 请求，直接返回成功（本地保存已完成）
      return null
    }
  },

  loadUserInfo() {
    wx.showLoading({ title: '加载中...', mask: true })

    try {

      // 使用 authService 获取当前身份信息
      const roleSpecificInfo = authService.getCurrentIdentity() || {}

      // 获取对应的显示名称
      const displayName = roleSpecificInfo.ownerName || roleSpecificInfo.nickName || ''

      // 处理头像 URL
      const avatarUrl = roleSpecificInfo.avatarUrl || ''

      // 设置页面数据
      this.setData({
        userInfo: {
          nickName: displayName, // 使用计算后的显示名称
          gender: roleSpecificInfo.gender || '',
          phone: roleSpecificInfo.phone || '',
          birthday: roleSpecificInfo.birthday || '',
          address: roleSpecificInfo.address || '',
          avatarUrl,
        },
        avatarUrl,
      })


      wx.hideLoading()
    } catch (error) {
      console.error('[APP] Personal Edit page loadUserInfo - 加载用户信息失败:', error)
      wx.hideLoading()
      // 加载失败时使用默认值
      this.setData({
        userInfo: {
          nickName: '',
          gender: '',
          phone: '',
          birthday: '',
          address: '',
          avatarUrl: '',
        },
        avatarUrl: '',
      })
    }
  },

  // 选择头像
  chooseAvatar() {
    if (this.data.isChoosingAvatar) {
      return
    }

    this.setData({ isChoosingAvatar: true })

    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      maxDuration: 30,
      sizeType: ['compressed'],
      camera: 'back',
      success: res => {
        const tempFile = res.tempFiles[0]

        if (tempFile.size > 5 * 1024 * 1024) {
          this.error('IMAGE_SIZE_LIMIT')
          this.setData({ isChoosingAvatar: false })
          return
        }

        wx.getImageInfo({
          src: tempFile.tempFilePath,
          success: imageInfo => {
            if (imageInfo.width < 200 || imageInfo.height < 200) {
              this.error('IMAGE_SIZE_MIN')
              this.setData({ isChoosingAvatar: false })
              return
            }

            this.setData({
              showAvatarPreview: true,
              previewAvatarUrl: tempFile.tempFilePath,
              tempAvatarFilePath: tempFile.tempFilePath,
              isChoosingAvatar: false,
            })
          },
          fail: error => {
            console.error('[APP] 获取图片信息失败:', error)
            this.setData({
              showAvatarPreview: true,
              previewAvatarUrl: tempFile.tempFilePath,
              tempAvatarFilePath: tempFile.tempFilePath,
              isChoosingAvatar: false,
            })
          },
        })
      },
      fail: err => {
        console.error('[APP] 选择头像失败:', err)
        if (err.errMsg !== 'chooseMedia:fail cancel') {
          this.error('CHOOSE_AVATAR_FAILED')
        }
        this.setData({ isChoosingAvatar: false })
      },
    })
  },

  // 取消头像预览
  cancelAvatarPreview() {
    this.setData({
      showAvatarPreview: false,
      previewAvatarUrl: '',
      tempAvatarFilePath: '',
    })
  },

  // 确认头像预览并上传
  confirmAvatarPreview() {
    const tempFilePath = this.data.tempAvatarFilePath
    if (tempFilePath) {
      this.uploadAvatar(tempFilePath)
    }
    // 关闭预览弹窗
    this.setData({
      showAvatarPreview: false,
      previewAvatarUrl: '',
      tempAvatarFilePath: '',
    })
  },

  // 上传头像到云存储
  uploadAvatar(tempFilePath) {
    this.setData({ isLoading: true })

    const directory = 'user-avatars'

    const fileName = `${directory}/${Date.now()}_${Math.floor(Math.random() * 1000)}.png`

    wx.cloud.uploadFile({
      cloudPath: fileName,
      filePath: tempFilePath,
      success: res => {
        const fileID = res.fileID

        const userInfo = { ...this.data.userInfo }
        userInfo.avatarUrl = fileID

        this.setData({
          userInfo,
          avatarUrl: fileID,
          isLoading: false,
        })

        this.toast('AVATAR_UPLOAD_SUCCESS')
      },
      fail: err => {
        console.error('[APP] 头像上传失败:', err)
        this.setData({ isLoading: false })

        let errorMessage = '头像上传失败'
        if (err.errCode === -502) {
          errorMessage = '网络连接失败，请检查网络'
        } else if (err.errCode === -504) {
          errorMessage = '上传超时，请稍后重试'
        }

        this.error(() => errorMessage)
      },
    })
  },

  // 返回上一页
  goBack() {
    wx.navigateBack()
  },

  // 昵称输入变化
  onNickNameChange(e) {
    this.setData({
      'userInfo.nickName': e.detail.value,
    })
  },

  // 手机号输入变化
  onPhoneChange(e) {
    this.setData({
      'userInfo.phone': e.detail.value,
    })
  },

  goToAddress() {
    wx.navigateTo({
      url: '/subpackages/other/address/index',
      fail: error => {
        console.error('[APP] 跳转到地址管理页面失败:', error)
        this.error('NAVIGATE_RETRY')
      },
    })
  },

  onAddressSelected(address) {
    if (!address || !address.fullAddress) {
      this.error('ADDRESS_INVALID')
      return
    }

    this.setData({
      'userInfo.address': address.fullAddress,
    })

    this.saveSelectedAddress(address)

    this.toast('ADDRESS_SELECTED')
  },

  // 保存选择的地址到本地和数据库
  saveSelectedAddress(address) {
    try {
      // 使用当前页面的 userInfo 作为基础，保留未保存的修改
      const pageUserInfo = this.data.userInfo

      // 从 authService 获取用户信息（包含 _id 和 openid）
      const localUserInfo = authService.getCurrentIdentity() || {}

      // 更新所有字段，确保保留原来的 _id 和 openid，同时保留页面上的其他修改
      const updatedUserInfo = {
        ...localUserInfo,
        ...pageUserInfo,
        address: address.fullAddress || address.detail,
        // 确保保留原来的 _id 和 openid
        _id: localUserInfo._id || pageUserInfo._id,
        openid: localUserInfo.openid || pageUserInfo.openid,
      }

      // 更新 authService
      // 身份信息已自动同步到 globalData


      // 上传到数据库
      this.uploadToDatabase(updatedUserInfo).then(() => {
      }).catch(() => {
      })
    } catch (error) {
      console.error('[APP] 保存地址失败:', error)
    }
  },

  // 性别选择变化
  onGenderChange(e) {
    const selectedGender = this.data.genderOptions[e.detail.value].value
    this.setData({
      'userInfo.gender': selectedGender,
      genderIndex: e.detail.value,
    })
  },

  // 生日选择变化
  onBirthdayChange(e) {
    this.setData({
      'userInfo.birthday': e.detail.value,
    })
  },

  // 验证所有字段
  validateAllFields(userInfo) {
    const result = validateFields(PROFILE_VALIDATION_FIELDS, userInfo)
    if (!result.valid) {
      this.error(() => result.message)
      return false
    }
    return true
  },

  // 保存所有信息
  async saveAll() {
    wx.showLoading({ title: __i18nT('BIZ_VTS3P8'), mask: true })

    try {
      const pageUserInfo = this.data.userInfo

      if (!this.validateAllFields(pageUserInfo)) {
        wx.hideLoading()
        return
      }

      const currentIdentity = authService.getCurrentIdentity() || {}

      const updatedUserInfo = {
        ...currentIdentity,
        ...pageUserInfo,
        _id: currentIdentity.openid || this.data.userInfo.openid,
        openid: currentIdentity.openid || this.data.userInfo.openid,
      }

      this.setData({
        userInfo: updatedUserInfo,
      })

      const uploadResult = await this.uploadToDatabase(updatedUserInfo)
      wx.hideLoading()

      if (uploadResult && uploadResult.code === 0) {
        authService._syncUserInfoToGlobal(updatedUserInfo)

        this.toast('SAVE_SUCCESS', { duration: 1500 })
        setTimeout(() => {
          wx.navigateBack()
        }, 1500)
      } else {
        this.showModal({ titleKey: 'BIZ_HN56', contentKey: 'BIZ_1MGFW86', showCancel: false, confirmText: '知道了' })
      }
    } catch (error) {
      console.error('[APP] Personal Edit page saveAll - 保存所有用户信息失败:', error)
      wx.hideLoading()
      this.showModal({ titleKey: 'SAVE_FAILED', contentKey: 'BIZ_MTVQO8', showCancel: false, confirmText: '知道了' })
    }
  },
})
