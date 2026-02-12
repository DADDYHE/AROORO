const app = getApp()
const { enhanceWithIdentity } = require('../../utils/identityPageEnhancer')
const messageService = require('../../utils/messageService').default

Page(enhanceWithIdentity({
  data: {
    // identityEnhancer 会自动添加以下字段：
    // - userRole: 当前角色
    // - userProfile: 当前用户资料
    // - isLoggedIn: 登录状态
    // - userInfo: 用户信息
    // - availableRoles: 可用身份列表
    // - switchToRole: 切换到指定角色的方法

    // 额外的页面数据
    hostProfile: null,
    ownerProfile: null,
    isLoading: false,
    showLoginForm: false,
    avatarUrl: '',
    nickName: '',
    isChoosingAvatar: false,
    avatarUrlCache: {},
    showRoleSelection: false,
    selectedRole: null,
    tempUserInfo: null,
    tempLoginInfo: null,
  },

  onLoad() {
    console.log('Profile page onLoad - 开始页面加载')
    this.setupEventListeners()
    this.checkLoginAndShowModal()
  },

  setupEventListeners() {
    console.log('Profile page - 设置事件监听器')

    // 监听身份系统初始化完成事件
    app.on('identitySystemInitialized', () => {
      console.log('Profile page - 身份系统初始化完成，更新页面用户信息')
      this.updatePageUserInfo()
    })

    // 监听角色变更事件（由 CentralIdentityManager 触发）
    app.on('central:roleChanged', (event) => {
      console.log('Profile page - 收到角色变更事件:', event)
      this.handleRoleChange(event)
    })
  },

  handleRoleChange(event) {
    console.log('Profile page - 处理角色变更:', event)

    // CentralIdentityManager 会自动更新 this.data.userRole 和 this.data.userProfile
    // 这里只需要处理额外的页面逻辑
    this.setData({
      hostProfile: app.globalData.hostInfo || null,
      ownerProfile: app.globalData.ownerInfo || null,
    })

    // 显示角色切换提示
    wx.showToast({
      title: `已切换到${event.roleType === 'host' ? '寄养家庭' : '宠物主人'}`,
      icon: 'success',
      duration: 1500
    })
  },

  // 更新页面用户信息
  async updatePageUserInfo() {
    console.log('Profile page updatePageUserInfo - 开始更新用户信息')

    if (!app.globalData.userInfo) {
      console.log('Profile page updatePageUserInfo - 全局用户信息不存在')
      return
    }

    console.log('Profile page updatePageUserInfo - 全局用户信息存在，更新页面')

    // 通过 this.data 获取 CentralIdentityManager 管理的身份信息
    const userInfo = this.data.userInfo ? { ...this.data.userInfo } : {}
    const userRole = this.data.userRole || 'owner'
    const hostProfile = app.globalData.hostInfo ? { ...app.globalData.hostInfo } : null
    const ownerProfile = app.globalData.ownerInfo ? { ...app.globalData.ownerInfo } : null

    console.log('Profile page updatePageUserInfo - 角色信息:', {
      userRole,
      userInfoRole: userInfo.role
    })

    // 处理头像URL
    await this.handleAvatarUrls(userInfo, hostProfile, ownerProfile)

    // 更新页面数据
    this.setData({
      userInfo: userInfo,
      hostProfile: hostProfile,
      ownerProfile: ownerProfile,
    })

    console.log('Profile page updatePageUserInfo - 页面用户信息更新成功')
  },

  // 处理头像URL
  async handleAvatarUrls(userInfo, hostProfile, ownerProfile) {
    console.log('Profile handleAvatarUrls - 开始处理头像URL')

    const avatarUrls = new Set()
    if (userInfo.avatarUrl) avatarUrls.add(userInfo.avatarUrl)
    if (hostProfile && hostProfile.avatarUrl) avatarUrls.add(hostProfile.avatarUrl)
    if (ownerProfile && ownerProfile.avatarUrl) avatarUrls.add(ownerProfile.avatarUrl)

    console.log('Profile handleAvatarUrls - 需要处理的头像URL数量:', avatarUrls.size)

    // 处理各个头像
    if (userInfo.avatarUrl) {
      userInfo.avatarUrl = await this.processAvatarUrl(userInfo.avatarUrl)
    }
    if (hostProfile && hostProfile.avatarUrl) {
      hostProfile.avatarUrl = await this.processAvatarUrl(hostProfile.avatarUrl)
    }
    if (ownerProfile && ownerProfile.avatarUrl) {
      ownerProfile.avatarUrl = await this.processAvatarUrl(ownerProfile.avatarUrl)
    }
  },

  // 处理单个头像URL
  async processAvatarUrl(avatarUrl) {
    if (avatarUrl.startsWith('cloud://')) {
      const avatarUrlCache = this.data.avatarUrlCache
      if (avatarUrlCache[avatarUrl]) {
        return avatarUrlCache[avatarUrl]
      }

      const tempUrl = await this.getTempAvatarUrl(avatarUrl)
      const newCache = { ...avatarUrlCache, [avatarUrl]: tempUrl }
      this.setData({ avatarUrlCache: newCache })
      return tempUrl
    }
    return avatarUrl
  },

  // 获取临时头像URL
  getTempAvatarUrl(cloudUrl) {
    return new Promise((resolve) => {
      wx.cloud.getTempFileURL({
        fileList: [cloudUrl],
        success: (res) => {
          if (res.fileList && res.fileList[0] && res.fileList[0].tempFileURL) {
            resolve(res.fileList[0].tempFileURL)
          } else {
            resolve(cloudUrl)
          }
        },
        fail: (err) => {
          console.error('获取临时文件URL失败:', err)
          resolve(cloudUrl)
        }
      })
    })
  },

  onShow() {
    console.log('Profile page onShow - 开始更新登录状态')

    if (app.globalData.isLogout) {
      this.setData({
        isLoggedIn: false,
        userInfo: {},
        userRole: 'owner',
        hostProfile: null,
        ownerProfile: null
      })
      return
    }

    this.checkLoginAndShowModal()

    // 如果已登录，确保头像URL是最新的
    if (this.data.isLoggedIn && app.globalData.userInfo) {
      this.updatePageUserInfo()
    }
  },

  // 检查登录状态并显示登录提示
  async checkLoginAndShowModal() {
    const isLoggedIn = await this.checkLoginStatus()
    if (!isLoggedIn) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      })
    }
    return isLoggedIn
  },

  async checkLoginStatus() {
    // 通过 CentralIdentityManager 检查登录状态
    return this.data.isLoggedIn
  },

  // 保存用户信息到本地存储（使用 CentralIdentityManager）
  saveUserInfo(userInfo, token, userSig) {
    try {
      const { centralIdentityManager } = require('../../utils/CentralIdentityManager')

      // 使用 CentralIdentityManager 保存用户信息
      centralIdentityManager.setUserInfo(userInfo)
      centralIdentityManager.setRole(userInfo.role)
      centralIdentityManager.setLoginStatus(true)

      if (token) {
        centralIdentityManager.setToken(token)
      }
      if (userSig) {
        centralIdentityManager.setUserSig(userSig)
      }

      wx.removeStorageSync('isLogout')
      console.log('用户信息保存成功:', userInfo)
      return true
    } catch (error) {
      console.error('保存用户信息失败:', error)
      wx.hideLoading()
      wx.showToast({
        title: '登录失败，保存用户信息失败',
        icon: 'none',
        duration: 3000
      })
      return false
    }
  },

  // 处理登录成功
  async handleLoginSuccess(userInfo, avatarUrl, token, userSig) {
    console.log('Profile page handleLoginSuccess - 开始处理登录成功')
    console.log('用户信息:', userInfo)
    console.log('用户角色:', userInfo.role)

    // 1. 确保用户信息包含必要的角色字段
    if (!userInfo.role) {
      console.warn('用户信息缺少角色字段，默认设置为owner')
      userInfo.role = 'owner'
    }

    // 2. 验证角色类型
    if (!['owner', 'host'].includes(userInfo.role)) {
      console.error('无效的角色类型:', userInfo.role)
      wx.showToast({
        title: '登录失败，身份无效',
        icon: 'none'
      })
      return
    }

    // 3. 检查头像
    if (!userInfo.avatarUrl || userInfo.avatarUrl === '') {
      userInfo.avatarUrl = avatarUrl
    }

    // 4. 处理微信临时头像URL
    if (userInfo.avatarUrl && userInfo.avatarUrl.startsWith('http://tmp/')) {
      console.log('检测到微信临时头像URL，开始上传到云存储:', userInfo.avatarUrl)
      try {
        const avatarDirectory = userInfo.role === 'owner' ? 'ownerProfiles/avatars' : 'hostProfiles/avatars'
        const uploadResult = await wx.cloud.uploadFile({
          cloudPath: `${avatarDirectory}/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.png`,
          filePath: userInfo.avatarUrl,
        })
        console.log('临时头像上传成功:', uploadResult)
        userInfo.avatarUrl = uploadResult.fileID
      } catch (error) {
        console.error('上传临时头像失败:', error)
      }
    }

    // 5. 使用 CentralIdentityManager 同步身份状态
    console.log('使用 CentralIdentityManager 同步身份状态')
    try {
      const { centralIdentityManager } = require('../../utils/CentralIdentityManager')

      // 设置用户信息、角色和登录状态
      centralIdentityManager.setUserInfo(userInfo)
      centralIdentityManager.setRole(userInfo.role)
      centralIdentityManager.setLoginStatus(true)

      // 更新全局数据（兼容旧代码）
      app.globalData.userRole = userInfo.role
      app.globalData.userInfo = userInfo

      console.log('CentralIdentityManager 同步完成，当前角色:', userInfo.role)
    } catch (error) {
      console.error('CentralIdentityManager 同步失败:', error)
    }

    // 6. 保存到本地存储
    if (!this.saveUserInfo(userInfo, token, userSig)) {
      return
    }

    // 7. 调用云函数更新数据库
    await this.updateUserInfoInDatabase(userInfo)

    // 8. 更新用户界面
    this.updateUserInterface(userInfo)

    // 9. 显示登录成功提示
    wx.hideLoading()
    wx.showToast({
      title: '登录成功',
      icon: 'success'
    })

    console.log('登录成功处理完成，当前身份:', userInfo.role)
  },

  updateUserInterface(userInfo) {
    this.setData({
      userInfo: userInfo,
      isLoggedIn: true,
      showLoginForm: false,
      nickName: '',
      avatarUrl: '',
      hostProfile: app.globalData.hostInfo || null,
      ownerProfile: app.globalData.ownerInfo || null
    })

    // 更新全局数据（兼容旧代码）
    app.globalData.userInfo = userInfo
    app.globalData.userRole = userInfo.role
    app.globalData.isLogout = false
    app.globalData.needManualLogin = false
  },

  async updateUserInfoInDatabase(userInfo) {
    try {
      const db = wx.cloud.database()
      await db.collection('users').doc(userInfo._id).update({
        data: {
          nickName: userInfo.nickName,
          avatarUrl: userInfo.avatarUrl,
          role: userInfo.role,
          updatedAt: new Date()
        }
      })
      console.log('数据库更新成功')
    } catch (error) {
      console.error('更新数据库失败:', error)
    }
  },

  // 身份切换功能
  async switchIdentity(targetRoleType) {
    console.log('Profile page - 切换身份到:', targetRoleType)

    // 使用 CentralIdentityManager 切换身份
    const { centralIdentityManager } = require('../../utils/CentralIdentityManager')

    try {
      this.setData({ isSwitchingRole: true, switchingRoleText: '正在切换身份...' })

      // 调用 CentralIdentityManager 的切换方法
      const result = await centralIdentityManager.switchRole(targetRoleType)

      if (result.success) {
        console.log('身份切换成功:', targetRoleType)

        // CentralIdentityManager 会自动触发角色变更事件
        // 页面会通过事件监听器自动更新
      } else {
        console.error('身份切换失败:', result.message)
        wx.showToast({
          title: result.message || '切换失败',
          icon: 'none'
        })
      }
    } catch (error) {
      console.error('切换身份异常:', error)
      wx.showToast({
        title: '切换失败',
        icon: 'none'
      })
    } finally {
      this.setData({ isSwitchingRole: false })
    }
  },

  onUnload() {
    // 清理事件监听器
    app.off('identitySystemInitialized', this.updatePageUserInfo)
    app.off('central:roleChanged', this.handleRoleChange)
  },
}))
