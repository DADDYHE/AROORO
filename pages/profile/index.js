const app = getApp()
const { enhancePage } = require('../../utils/base-page')
const IdentityManager = require('../../utils/identityManager')
const { permissionManager } = require('../../utils/permissionManager')
const RoleManager = require('../../utils/roleManager')

Page(enhancePage({
  // 页面初始化数据
  data: {
    userInfo: {
      avatarUrl: '',
      nickName: '',
      role: 'owner'
    },
    userRole: 'owner',
    hostProfile: null, // 寄养家庭信息
    ownerProfile: null, // 宠物主人信息
    isLoggedIn: false,
    isLoading: false,
    showLoginForm: false, // 登录表单显示状态
    avatarUrl: '', // 用户选择的头像
    nickName: '', // 用户输入的昵称
    isChoosingAvatar: false, // 头像选择状态，防止重复调用
    isSwitchingRole: false, // 身份切换状态
    switchingRoleText: '正在切换身份...', // 身份切换提示文字
    avatarUrlCache: {}, // 头像URL缓存，避免重复请求
    showRoleSelection: false, // 身份选择弹窗显示状态
    availableRoles: [], // 可用的身份列表
    selectedRole: null, // 用户选择的身份
    tempUserInfo: null, // 临时保存的用户信息（微信返回）
    tempLoginInfo: null, // 临时保存的登录信息（用于身份选择）
  },

  onLoad() {
    console.log('Profile page onLoad - 开始页面加载')


    // 初始设置为未登录状态，确保动态类正确应用
    this.setData({
      isLoading: false,
      isLoggedIn: false,
      userInfo: {},
      userRole: 'owner'
    })

    // 初始化身份管理器
    console.log('初始化身份管理器')
    try {
      IdentityManager.init()
    } catch (error) {
      console.error('身份管理器初始化失败:', error)
    }

    // 检查是否是用户主动退出登录
    if (app.globalData.isLogout) {
      console.log('用户主动退出登录，不执行自动登录')

      return
    }

    // 监听身份系统初始化完成事件
    this.setupIdentitySystemListener()

    // 开始执行自动登录检查
    console.log('开始执行自动登录检查')

    this.checkLoginAndShowModal()
  },
  
  // 设置身份系统初始化监听
  setupIdentitySystemListener() {
    console.log('Profile page setupIdentitySystemListener - 设置身份系统初始化监听');
    
    // 添加身份系统初始化完成事件监听
    app.on('identitySystemInitialized', () => {
      console.log('Profile page - 身份系统初始化完成，更新页面用户信息');
      this.updatePageUserInfo();
    });
  },
  
  // 更新页面用户信息
  async updatePageUserInfo() {
    console.log('Profile page updatePageUserInfo - 开始更新用户信息（身份系统初始化后）');

    const app = getApp();

    // 检查全局用户信息是否存在
    if (app.globalData.userInfo) {
      console.log('Profile page updatePageUserInfo - 全局用户信息存在，更新页面');

      // 使用统一身份管理工具获取身份信息
      const identity = IdentityManager.getCurrentIdentity();
      const userInfo = { ...identity.userInfo };
      const hostProfile = app.globalData.hostInfo ? { ...app.globalData.hostInfo } : null;
      const ownerProfile = app.globalData.ownerInfo ? { ...app.globalData.ownerInfo } : null;
      const userRole = identity.role;

      console.log('Profile page updatePageUserInfo - 角色信息:', {
        identityRole: identity.role,
        userInfoRole: userInfo.role
      });

      // 处理头像URL，确保使用临时URL
      await this.handleAvatarUrls(userInfo, hostProfile, ownerProfile);

      // 更新页面数据
      this.setData({
        userInfo: userInfo,
        userRole: userRole,
        hostProfile: hostProfile,
        ownerProfile: ownerProfile,
        isLoggedIn: identity.isLoggedIn
      });

      console.log('Profile page updatePageUserInfo - 页面用户信息更新成功');
    } else {
      console.log('Profile page updatePageUserInfo - 全局用户信息不存在');
    }
  },
  
  // 处理头像URL，确保使用临时URL
  async handleAvatarUrls(userInfo, hostProfile, ownerProfile) {
    console.log('Profile handleAvatarUrls - 开始处理头像URL');
    console.log('Profile handleAvatarUrls - userInfo.avatarUrl:', userInfo.avatarUrl);
    console.log('Profile handleAvatarUrls - hostProfile.avatarUrl:', hostProfile?.avatarUrl);
    console.log('Profile handleAvatarUrls - ownerProfile.avatarUrl:', ownerProfile?.avatarUrl);

    // 收集所有头像URL，去重处理
    const avatarUrls = new Set();
    if (userInfo.avatarUrl) avatarUrls.add(userInfo.avatarUrl);
    if (hostProfile && hostProfile.avatarUrl) avatarUrls.add(hostProfile.avatarUrl);
    if (ownerProfile && ownerProfile.avatarUrl) avatarUrls.add(ownerProfile.avatarUrl);

    console.log('Profile handleAvatarUrls - 去重后需要处理的头像URL数量:', avatarUrls.size);

    // 处理用户头像
    if (userInfo.avatarUrl) {
      userInfo.avatarUrl = await this.processAvatarUrl(userInfo.avatarUrl);
    }

    // 处理寄养家庭头像
    if (hostProfile && hostProfile.avatarUrl) {
      hostProfile.avatarUrl = await this.processAvatarUrl(hostProfile.avatarUrl);
    }

    // 处理宠物主人头像
    if (ownerProfile && ownerProfile.avatarUrl) {
      ownerProfile.avatarUrl = await this.processAvatarUrl(ownerProfile.avatarUrl);
    }

    console.log('Profile handleAvatarUrls - 头像URL处理完成');
  },

  // 处理单个头像URL
  async processAvatarUrl(avatarUrl) {
    if (avatarUrl.startsWith('cloud://')) {
      // 检查缓存中是否已有对应的临时URL
      const avatarUrlCache = this.data.avatarUrlCache;
      if (avatarUrlCache[avatarUrl]) {
        console.log('Profile processAvatarUrl - 使用缓存的临时URL:', avatarUrlCache[avatarUrl]);
        return avatarUrlCache[avatarUrl];
      }
      
      // cloud:// fileID，生成临时URL并缓存
      const tempUrl = await this.getTempAvatarUrl(avatarUrl);
      console.log('Profile processAvatarUrl - cloud:// URL 转换为临时URL:', tempUrl);
      
      // 缓存临时URL，避免重复请求
      const newCache = { ...avatarUrlCache, [avatarUrl]: tempUrl };
      this.setData({ avatarUrlCache: newCache });
      console.log('Profile processAvatarUrl - 缓存临时URL，缓存大小:', Object.keys(newCache).length);
      
      return tempUrl;
    } else {
      // 其他情况（包括临时URL），直接使用原始URL
      return avatarUrl;
    }
  },

  // 获取临时头像URL
  getTempAvatarUrl(cloudUrl) {
    console.log('Profile page getTempAvatarUrl - 检测到云存储fileID，开始生成临时URL:', cloudUrl);

    return new Promise((resolve) => {
      wx.cloud.getTempFileURL({
        fileList: [cloudUrl],
        success: (res) => {
          console.log('Profile page getTempAvatarUrl - 获取临时文件URL成功:', res);
          if (res.fileList && res.fileList[0] && res.fileList[0].tempFileURL) {
            const tempUrl = res.fileList[0].tempFileURL;
            console.log('Profile page getTempAvatarUrl - 云存储fileID转换为临时URL成功:', tempUrl);
            resolve(tempUrl);
          } else {
            console.error('Profile page getTempAvatarUrl - 获取临时文件URL失败，返回原始URL');
            resolve(cloudUrl);
          }
        },
        fail: (err) => {
          console.error('Profile page getTempAvatarUrl - 获取临时文件URL失败:', err);
          resolve(cloudUrl);
        }
      });
    });
  },

  // 设置 tabBar 选中状态
  setTabBarSelected() {
    // 调用增强页面提供的方法
    this.setTabBarIndex(3)
  },

  async onShow() {
    console.log('Profile page onShow - 开始更新登录状态')


    // 检查全局退出状态
    console.log('Profile page onShow - 全局退出状态:', app.globalData.isLogout)

    if (app.globalData.isLogout) {
      console.log('Profile page onShow - 全局是退出状态，设置为未登录')

      this.setData({
        isLoggedIn: false,
        userInfo: {},
        userRole: 'owner'
      })
      // 确保 tabBar 选中状态正确
      this.setTabBarSelected()
      return
    }

    // 检查当前页面登录状态
    console.log('Profile page onShow - 当前页面登录状态:', this.data.isLoggedIn)

    // 检查登录状态
    await this.checkLoginAndShowModal()

    // 如果已登录且身份系统已初始化，确保头像URL是最新的
    if (this.data.isLoggedIn && app.globalData.userInfo) {
      console.log('Profile page onShow - 已登录，检查并更新头像URL');

      // 使用统一身份管理工具获取身份信息
      const identity = IdentityManager.getCurrentIdentity();
      const userInfo = { ...identity.userInfo };
      const hostProfile = app.globalData.hostInfo ? { ...app.globalData.hostInfo } : null;
      const ownerProfile = app.globalData.ownerInfo ? { ...app.globalData.ownerInfo } : null;
      const userRole = identity.role;

      console.log('Profile page onShow - 角色信息:', {
        identityRole: identity.role,
        userInfoRole: userInfo.role
      });

      console.log('Profile page onShow - 处理头像URL');
      console.log('Profile page onShow - userInfo.avatarUrl:', userInfo.avatarUrl);
      console.log('Profile page onShow - hostProfile.avatarUrl:', hostProfile?.avatarUrl);
      console.log('Profile page onShow - ownerProfile.avatarUrl:', ownerProfile?.avatarUrl);

      // 处理头像URL
      await this.handleAvatarUrls(userInfo, hostProfile, ownerProfile);

      // 更新页面数据
      this.setData({
        userInfo: userInfo,
        userRole: userRole,
        hostProfile: hostProfile,
        ownerProfile: ownerProfile
      });

      console.log('Profile page onShow - 头像URL更新完成');
    }

    // 确保 tabBar 选中状态正确
    this.setTabBarSelected()
  },

  // 检查登录状态并显示登录提示
  async checkLoginAndShowModal() {
    const isLoggedIn = await this.checkLoginStatus()
    if (!isLoggedIn) {
      console.log('checkLoginAndShowModal - 未登录，显示登录提示')
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      })
    }
    return isLoggedIn
  },

  // 保存用户信息到本地存储
  saveUserInfo(userInfo, token, userSig) {
    try {
      wx.setStorageSync('userInfo', userInfo)
      wx.setStorageSync('userRole', userInfo.role)
      // 保存登录时间，用于后续检查登录状态是否过期
      wx.setStorageSync('lastLoginTime', Date.now())
      // 保存 token 和 userSig（如果有）
      if (token) {
        wx.setStorageSync('token', token)
        console.log('token 保存成功:', token)
      }
      if (userSig) {
        wx.setStorageSync('userSig', userSig)
        console.log('userSig 保存成功:', userSig)
      }
      // 登录成功后，清除本地存储中的退出标志，确保其他页面能正确检测到登录状态
      wx.removeStorageSync('isLogout')
      console.log('用户信息保存成功：', userInfo)
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

  // 更新用户界面
  updateUserInterface(userInfo) {
    const app = getApp()
    
    // 更新页面数据
    this.setData({
      userInfo: userInfo,
      isLoggedIn: true,
      showLoginForm: false, // 关闭登录表单
      nickName: '', // 清除临时昵称
      avatarUrl: '', // 清除临时头像
      hostProfile: app.globalData.hostInfo || null,
      ownerProfile: app.globalData.ownerInfo || null
    })
    
    // 更新全局数据
    app.globalData.userInfo = userInfo
    app.globalData.userRole = userInfo.role
    // 清除全局退出标志和手动登录标志
    app.globalData.isLogout = false
    app.globalData.needManualLogin = false
  },

  // 创建临时用户信息
  createTempUserInfo(avatarUrl, nickName) {
    return {
      _id: `temp_${Date.now()}`,
      openid: `temp_openid_${Date.now()}`,
      avatarUrl: avatarUrl,
      nickName: nickName,
      role: 'owner'
    }
  },

  // 处理登录成功
  async handleLoginSuccess(userInfo, avatarUrl, token, userSig) {
    console.log('Profile page handleLoginSuccess - 开始处理登录成功')
    console.log('用户信息:', userInfo)
    console.log('用户角色:', userInfo.role)

    // 步骤1：确保用户信息包含必要的角色字段
    if (!userInfo.role) {
      console.warn('用户信息缺少角色字段，默认设置为owner')
      userInfo.role = 'owner'
    }

    // 步骤2：验证角色类型的有效性
    if (!['owner', 'host'].includes(userInfo.role)) {
      console.error('无效的角色类型:', userInfo.role)
      wx.showToast({
        title: '登录失败，身份无效',
        icon: 'none'
      })
      return
    }

    // 步骤3：检查头像是否上传成功，优先使用用户选择的头像
    if (!userInfo.avatarUrl || userInfo.avatarUrl === '') {
      console.warn('头像未设置或使用默认头像，使用上传的头像URL')
      userInfo.avatarUrl = avatarUrl
    }

    // 步骤4：检查并处理微信返回的临时头像URL
    if (userInfo.avatarUrl && userInfo.avatarUrl.startsWith('http://tmp/')) {
      console.log('检测到微信临时头像URL，开始上传到云存储:', userInfo.avatarUrl)
      try {
        // 根据角色类型选择正确的头像存储目录
        const avatarDirectory = userInfo.role === 'owner' ? 'ownerProfiles/avatars' : 'hostProfiles/avatars';
        const uploadResult = await wx.cloud.uploadFile({
          cloudPath: `${avatarDirectory}/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.png`,
          filePath: userInfo.avatarUrl,
        })
        
        console.log('临时头像上传成功:', uploadResult)
        userInfo.avatarUrl = uploadResult.fileID
        console.log('头像URL已更新为cloud://格式:', userInfo.avatarUrl)
      } catch (error) {
        console.error('上传临时头像失败:', error)
      }
    }

    // 步骤5：使用身份管理器同步身份状态
    console.log('使用身份管理器同步身份状态')
    try {
      // 设置全局角色
      app.globalData.userRole = userInfo.role
      app.globalData.userInfo = userInfo

      // 同步身份状态到所有位置
      IdentityManager.syncIdentityState()

      console.log('身份管理器同步完成，当前角色:', userInfo.role)
    } catch (error) {
      console.error('身份管理器同步失败:', error)
    }

    // 步骤6：验证身份对应的权限
    console.log('验证身份对应的权限:', userInfo.role)
    const rolePermissions = permissionManager.getRolePermissions(userInfo.role)
    if (!rolePermissions) {
      console.error('无法获取该身份的权限配置:', userInfo.role)
    } else {
      console.log('身份权限配置:', rolePermissions)
    }

    // 步骤7：检查数据访问权限
    const hasProfileAccess = permissionManager.checkPermission(userInfo.role, 'profile', 'view')
    const hasMessageAccess = permissionManager.checkPermission(userInfo.role, 'message', 'view')

    if (!hasProfileAccess || !hasMessageAccess) {
      console.error('该身份缺少基本访问权限:', {
        role: userInfo.role,
        hasProfileAccess,
        hasMessageAccess
      })
      wx.showToast({
        title: '该身份权限不足',
        icon: 'none'
      })
      return
    }

    // 步骤8：保存用户信息、token 和 userSig 到本地存储
    if (!this.saveUserInfo(userInfo, token, userSig)) {
      return
    }

    // 步骤9：调用云函数更新数据库中的用户信息
    await this.updateUserInfoInDatabase(userInfo)

    // 步骤10：更新用户界面
    this.updateUserInterface(userInfo)

    // 步骤11：注册角色切换回调（用于后续的身份切换）
    this._registerRoleSwitchCallback()

    // 步骤12：显示登录成功提示
    wx.hideLoading()
    wx.showToast({
      title: '登录成功',
      icon: 'success'
    })

    console.log('登录成功处理完成，当前身份:', userInfo.role)
  },

  /**
   * 注册角色切换回调
   * @private
   */
  _registerRoleSwitchCallback() {
    console.log('注册角色切换回调')

    // 使用RoleManager注册回调
    const callbackId = RoleManager.registerRoleChangeCallback((newRole) => {
      console.log('收到角色切换通知:', newRole)

      // 更新页面数据
      this.setData({
        userRole: newRole
      })

      // 验证新角色的权限
      const hasPermission = permissionManager.checkPermission(newRole, 'basic', 'view')
      if (!hasPermission) {
        console.error('新角色没有基本权限:', newRole)
        wx.showToast({
          title: '该身份暂不可用',
          icon: 'none'
        })
        return
      }

      // 重新加载页面数据
      this._loadRoleSpecificData(newRole)
    })

    // 保存回调ID，用于后续清理
    this.roleSwitchCallbackId = callbackId
  },

  /**
   * 加载角色特定数据
   * @private
   * @param {string} role - 角色类型
   */
  _loadRoleSpecificData(role) {
    console.log('加载角色特定数据:', role)

    // 根据角色加载不同的数据
    if (role === 'owner') {
      // 加载宠物主人数据
      this.loadOwnerData()
    } else if (role === 'host') {
      // 加载寄养家庭数据
      this.loadHostData()
    }
  },

  /**
   * 加载宠物主人数据
   * @private
   */
  async loadOwnerData() {
    console.log('加载宠物主人数据')

    try {
      // 检查是否有权限访问宠物数据
      const hasPetPermission = permissionManager.checkPermission('owner', 'pet', 'list')
      if (!hasPetPermission) {
        console.warn('没有宠物列表访问权限')
      }

      // 检查是否有权限访问订单数据
      const hasOrderPermission = permissionManager.checkPermission('owner', 'order', 'list')
      if (!hasOrderPermission) {
        console.warn('没有订单列表访问权限')
      }

      // 加载统计数据
      await this.loadOwnerStats()

      console.log('宠物主人数据加载完成')
    } catch (error) {
      console.error('加载宠物主人数据失败:', error)
    }
  },

  /**
   * 加载寄养家庭数据
   * @private
   */
  async loadHostData() {
    console.log('加载寄养家庭数据')

    try {
      // 检查是否有权限管理寄养服务
      const hasHostPermission = permissionManager.checkPermission('host', 'host', 'manage')
      if (!hasHostPermission) {
        console.warn('没有寄养服务管理权限')
      }

      // 检查是否有权限访问订单数据
      const hasOrderPermission = permissionManager.checkPermission('host', 'order', 'list')
      if (!hasOrderPermission) {
        console.warn('没有订单列表访问权限')
      }

      // 加载统计数据
      await this.loadHostStats()

      console.log('寄养家庭数据加载完成')
    } catch (error) {
      console.error('加载寄养家庭数据失败:', error)
    }
  },

  // 处理登录失败
  handleLoginFailure(avatarUrl, nickName, mode = 'temp') {
    // 创建临时用户信息
    const userInfo = this.createTempUserInfo(avatarUrl, nickName)
    console.log(`${mode === 'temp' ? '临时' : '离线'}用户信息：`, userInfo)
    
    // 保存用户信息到本地存储
    if (!this.saveUserInfo(userInfo)) {
      return
    }
    
    // 更新用户界面
    this.updateUserInterface(userInfo)
    
    // 显示登录成功提示
    wx.hideLoading()
    wx.showToast({
      title: `登录成功（${mode === 'temp' ? '临时模式' : '离线模式'}）`,
      icon: 'success'
    })
  },

  // 调用登录云函数
  callLoginCloudFunction(code, userInfo) {
    // 将 wx.cloud.callFunction 包装成 Promise
    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: 'login',
        data: {
          code: code,
          userInfo: userInfo  // 传递完整的用户信息，符合微信官方登录流程
        },
        success: async (cloudRes) => {
          console.log('Profile page callLoginCloudFunction - 云函数返回的结果:', JSON.stringify(cloudRes.result, null, 2))
          
          // 检查云函数是否返回成功
          if (cloudRes.result.code === -1) {
            console.error('Profile page callLoginCloudFunction - 云函数返回登录失败：', cloudRes.result.message)
            // 处理登录失败，使用临时模式
            this.handleLoginFailure(userInfo.avatarUrl, userInfo.nickName, 'temp')
            resolve()
            return
          }
          
          // 检查云函数返回的用户信息是否完整
          // 支持两种返回结构：cloudRes.result.userInfo 和 cloudRes.result.data.userInfo
          let resultUserInfo = cloudRes.result.userInfo || (cloudRes.result.data && cloudRes.result.data.userInfo)
          
          // 获取 token 和 userSig，支持多种返回结构
          const token = cloudRes.result.token || (cloudRes.result.data && cloudRes.result.data.token)
          const userSig = cloudRes.result.userSig || (cloudRes.result.data && cloudRes.result.data.userSig)
          
          // 处理云函数返回结构不符合预期的情况
          if (!resultUserInfo || (!resultUserInfo._id && !resultUserInfo.openid)) {
            console.error('Profile page callLoginCloudFunction - 云函数返回的用户信息不完整:', resultUserInfo)
            
            // 从返回结果中获取 openid，支持多种返回结构
            let openid = (cloudRes.result && cloudRes.result.tcbContext && cloudRes.result.tcbContext.OPENID) || 
                        (cloudRes.result && cloudRes.result.wxContext && cloudRes.result.wxContext.OPENID) || 
                        (cloudRes.result && cloudRes.result.openid) ||
                        (cloudRes.result && cloudRes.result.data && cloudRes.result.data.tcbContext && cloudRes.result.data.tcbContext.OPENID) ||
                        (cloudRes.result && cloudRes.result.data && cloudRes.result.data.wxContext && cloudRes.result.data.wxContext.OPENID) ||
                        (cloudRes.result && cloudRes.result.data && cloudRes.result.data.openid)
            
            // 检查是否从云函数返回结果中获取到了 openid
            if (openid) {
              console.log('从云函数返回中获取到 openid:', openid)
              
              // 如果 userInfo 为空或不完整，创建一个基本的用户信息对象
              if (!resultUserInfo) {
                resultUserInfo = {}
              }
              
              // 添加必要字段
              resultUserInfo.openid = openid
              resultUserInfo._id = resultUserInfo._id || (cloudRes.result && cloudRes.result.data && cloudRes.result.data.userInfo && cloudRes.result.data.userInfo._id) || `temp_${openid}_${Date.now()}`
              resultUserInfo.avatarUrl = resultUserInfo.avatarUrl || (cloudRes.result && cloudRes.result.data && cloudRes.result.data.userInfo && cloudRes.result.data.userInfo.avatarUrl) || userInfo.avatarUrl || ''
              resultUserInfo.nickName = resultUserInfo.nickName || (cloudRes.result && cloudRes.result.data && cloudRes.result.data.userInfo && cloudRes.result.data.userInfo.nickName) || userInfo.nickName || ''
              resultUserInfo.role = resultUserInfo.role || (cloudRes.result && cloudRes.result.data && cloudRes.result.data.userInfo && cloudRes.result.data.userInfo.role) || 'owner'
              
              console.log('修复后的用户信息:', resultUserInfo)
            } else {
              wx.hideLoading()
              wx.showToast({
                title: '登录失败，用户信息不完整',
                icon: 'none',
                duration: 3000
              })
              resolve()
              return
            }
          }

          // 检查用户是否有多个身份
          const roles = cloudRes.result.data && cloudRes.result.data.roles
          if (roles && roles.length > 0) {
            // 获取有效身份
            const validRoles = roles.filter(role => ['owner', 'host'].includes(role.roleType))
            const hasHostRole = validRoles.some(role => role.roleType === 'host')
            const hasOwnerRole = validRoles.some(role => role.roleType === 'owner')

            if (hasHostRole && hasOwnerRole) {
              // 同时拥有两种身份，显示身份选择弹窗
              console.log('用户拥有多个身份，显示身份选择弹窗', validRoles)

              // 临时保存登录信息，供身份选择后使用
              this.setData({
                availableRoles: validRoles,
                showRoleSelection: true,
                tempLoginInfo: {
                  userInfo: resultUserInfo,
                  avatarUrl: userInfo.avatarUrl,
                  token: token,
                  userSig: userSig
                }
              })

              wx.hideLoading()
              resolve()
              return
            }
          }

          // 处理登录成功，传递 token 和 userSig，以及用户选择的头像URL
          await this.handleLoginSuccess(resultUserInfo, userInfo.avatarUrl, token, userSig)
          resolve()
        },
        fail: (error) => {
          console.error('Profile page callLoginCloudFunction - 云函数 login 调用失败：', error)
          console.error('Profile page callLoginCloudFunction - 错误详情：', JSON.stringify(error, null, 2))
          
          // 处理登录失败，使用离线模式
          this.handleLoginFailure(userInfo.avatarUrl, userInfo.nickName, 'offline')
          resolve()
        }
      })
    })
  },

  // 更新数据库中的用户信息
  async updateUserInfoInDatabase(userInfo) {
    try {
      console.log('开始更新数据库中的用户信息:', userInfo)
      
      // 开始性能监控
      const startTime = Date.now()
      
      // 获取设备信息
      const deviceInfo = wx.getDeviceInfo()
      const windowInfo = wx.getWindowInfo()
      
      // 构建更新数据
      const updateData = {
        userId: userInfo._id,
        openid: userInfo.openid,
        avatarUrl: userInfo.avatarUrl,
        nickName: userInfo.nickName,
        loginInfo: {
          lastLoginTime: new Date().toISOString(),
          loginCount: 1, // 云函数会处理连续登录次数的递增
          deviceInfo: {
            deviceBrand: deviceInfo.deviceBrand,
            deviceModel: deviceInfo.deviceModel,
            system: deviceInfo.system,
            platform: deviceInfo.platform,
            screenWidth: windowInfo.screenWidth,
            screenHeight: windowInfo.screenHeight
          }
        }
      }
      
      // 如果有宠物主人头像URL，也添加到更新数据中
      if (this.data.ownerAvatarUrl) {
        updateData.ownerAvatarUrl = this.data.ownerAvatarUrl
        console.log('添加宠物主人头像URL到更新数据中:', this.data.ownerAvatarUrl)
      }
      
      // 如果有寄养家庭头像URL，也添加到更新数据中
      if (this.data.hostAvatarUrl) {
        updateData.hostAvatarUrl = this.data.hostAvatarUrl
        console.log('添加寄养家庭头像URL到更新数据中:', this.data.hostAvatarUrl)
      }
      
      // 调用云函数更新用户信息
      const res = await wx.cloud.callFunction({
        name: 'updateUserInfo',
        data: updateData
      })
      
      // 结束性能监控
      const endTime = Date.now()
      const responseTime = endTime - startTime
      console.log('数据库更新操作响应时间:', responseTime, '毫秒')
      
      // 检查更新结果
      if (res.result && res.result.code === 0) {
        console.log('数据库更新成功:', res.result.data)
        
        // 验证更新结果
        if (res.result.data && res.result.data.updated) {
          console.log('更新结果验证成功，实际更新的字段:', res.result.data.updatedFields)
        } else {
          console.warn('更新结果验证失败，可能没有实际更新任何字段')
        }
      } else {
        console.error('数据库更新失败:', res.result ? res.result.message : '未知错误')
      }
    } catch (error) {
      console.error('更新数据库中的用户信息失败:', error)
      // 数据库更新失败不应影响登录流程，继续执行后续操作
    }
  },

  // 处理退出登录按钮点击
  logout() {
    console.log('Profile page logout - 开始退出登录')

    // 调用全局退出登录方法
    app.logout()
      .then(() => {
        console.log('退出登录成功，更新页面状态')
        this.setData({
          isLoggedIn: false,
          userInfo: {},
          userRole: 'owner'
        })
        wx.showToast({
          title: '已退出登录',
          icon: 'success'
        })
      })
      .catch((error) => {
        console.error('退出登录失败:', error)
        // 用户取消退出登录时不显示错误提示
        if (error.message !== '用户取消退出登录') {
          wx.showToast({
            title: '退出登录失败，请重试',
            icon: 'none'
          })
        }
      })
  },

  // 处理切换身份按钮点击
  switchRole() {
    console.log('Profile page switchRole - 开始切换身份')
  
    // 确定目标身份类型
    const currentRole = this.data.userRole
    const targetRoleType = currentRole === 'owner' ? 'host' : 'owner'
    
    // 检查用户是否有目标身份
    if (targetRoleType === 'host') {
      // 检查是否有寄养家庭身份（增强检查逻辑）
      console.log('Profile switchRole - 检查寄养家庭身份:', app.globalData.hostInfo)
      const hasHostRole = app.globalData.hostInfo && 
                        Object.keys(app.globalData.hostInfo).length > 0 &&
                        (app.globalData.hostInfo._id || app.globalData.hostInfo.openid) &&
                        app.globalData.hostInfo.avatarUrl
      
      console.log('Profile switchRole - 寄养家庭身份检查结果:', hasHostRole)
      
      if (hasHostRole) {
        // 有寄养家庭身份，显示确认弹窗后切换身份
        wx.showModal({
          title: '确认切换身份',
          content: '您确定要切换到寄养家庭身份吗？',
          confirmText: '确定',
          cancelText: '取消',
          success: (res) => {
            if (res.confirm) {
              // 切换身份
              console.log('Profile switchRole - 用户确认切换到寄养家庭身份')
              this.switchToRole(targetRoleType)
            }
          }
        })
      } else {
        // 没有寄养家庭身份，显示确认弹窗后跳转到注册页面
        wx.showModal({
          title: '创建寄养家庭身份',
          content: '您还没有寄养家庭身份，是否前往注册？',
          confirmText: '确定',
          cancelText: '取消',
          success: (res) => {
            if (res.confirm) {
              // 跳转到注册寄养家庭身份页面
              console.log('Profile switchRole - 用户确认前往注册寄养家庭身份')
              wx.navigateTo({
                url: '/subpackages/host-register/step1'
              })
            }
          }
        })
      }
    } else {
      // 切换到宠物主人身份，直接显示确认弹窗后切换
      wx.showModal({
        title: '确认切换身份',
        content: '您确定要切换到宠物主人身份吗？',
        confirmText: '确定',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            // 切换身份
            this.switchToRole(targetRoleType)
          }
        }
      })
    }
  },

  // 切换身份的辅助方法
  async switchToRole(targetRoleType) {
    // 显示切换身份加载效果
    this.setData({
      isSwitchingRole: true,
      switchingRoleText: targetRoleType === 'host' ? '正在切换到寄养家庭...' : '正在切换到宠物主人...'
    })

    try {
      await app.switchRole(targetRoleType)

      console.log('切换身份成功，更新页面状态:')

      // 重新检查登录状态并更新用户信息
      this.checkLoginStatus()

      // 使用 setTimeout 确保身份切换完成后再获取用户信息
      setTimeout(async () => {
        this.checkLoginStatus()
        // 强制更新hostProfile和ownerProfile数据
        const hostProfile = app.globalData.hostInfo ? { ...app.globalData.hostInfo } : null;
        const ownerProfile = app.globalData.ownerInfo ? { ...app.globalData.ownerInfo } : null;
        const userInfo = app.globalData.userInfo ? { ...app.globalData.userInfo } : {};

        // 验证并修复hostProfile.avatarUrl
        if (hostProfile && hostProfile.avatarUrl && hostProfile.avatarUrl.includes('user-avatars')) {
          console.warn('Profile switchToRole - 发现hostProfile.avatarUrl使用了user-avatars目录，这可能不是正确的寄养家庭头像！');
          // 从hostProfiles集合中获取正确的寄养家庭头像
          try {
            // 调用云函数获取正确的寄养家庭头像
            wx.cloud.callFunction({
              name: 'getHostProfile',
              success: (res) => {
                if (res.result.code === 0 && res.result.data && res.result.data.avatarUrl) {
                  const correctAvatarUrl = res.result.data.avatarUrl;
                  if (correctAvatarUrl && !correctAvatarUrl.includes('user-avatars')) {
                    console.log('Profile switchToRole - 已获取到正确的寄养家庭头像:', correctAvatarUrl);
                    hostProfile.avatarUrl = correctAvatarUrl;
                    // 更新页面数据
                    this.setData({ hostProfile: hostProfile });
                  }
                }
              },
              fail: (error) => {
                console.error('获取寄养家庭头像失败:', error);
              }
            });
          } catch (error) {
            console.error('处理寄养家庭头像时发生错误:', error);
          }
        }

        console.log('Profile switchToRole - 处理头像URL');
        console.log('Profile switchToRole - userInfo.avatarUrl:', userInfo.avatarUrl);
        console.log('Profile switchToRole - hostProfile.avatarUrl:', hostProfile?.avatarUrl);
        console.log('Profile switchToRole - ownerProfile.avatarUrl:', ownerProfile?.avatarUrl);

        // 处理头像URL
        await this.handleAvatarUrls(userInfo, hostProfile, ownerProfile);

        this.setData({
          hostProfile: hostProfile,
          ownerProfile: ownerProfile,
          userInfo: userInfo,
          isSwitchingRole: false
        })

        wx.showToast({
          title: '切换成功',
          icon: 'success',
          duration: 1500
        })
      }, 300)
    } catch (error) {
      console.error('切换身份失败:', error)
      this.setData({ isSwitchingRole: false })

      // 检查错误信息，如果是角色不存在，显示更具体的提示
      if (error.message === 'role not found') {
        wx.showToast({
          title: '目标身份不存在',
          icon: 'none',
          duration: 2000
        })
      } else {
        wx.showToast({
          title: '切换身份失败',
          icon: 'none',
          duration: 2000
        })
      }
    }
  },

  // 处理修改个人信息按钮点击
  handleEditProfile() {
    console.log('Profile page handleEditProfile - 开始修改个人信息')

    
    // 检查登录状态
    if (!this.data.isLoggedIn) {
      console.log('未登录，显示登录提示')
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      })
      return
    }
    
    // 跳转到修改个人信息页面
    wx.navigateTo({
      url: '/subpackages/profile/settings/index'
    })
  },

  // 处理查看订单按钮点击
  handleViewOrders() {
    console.log('Profile page handleViewOrders - 开始查看订单')

    
    // 检查登录状态
    if (!this.data.isLoggedIn) {
      console.log('未登录，显示登录提示')
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      })
      return
    }
    
    // 跳转到订单列表页面
    wx.navigateTo({
      url: '/subpackages/booking/confirm'
    })
  },

  // 处理查看收藏按钮点击
  handleViewFavorites() {
    console.log('Profile page handleViewFavorites - 开始查看收藏')

    
    // 检查登录状态
    if (!this.data.isLoggedIn) {
      console.log('未登录，显示登录提示')
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      })
      return
    }
    
    // 跳转到收藏列表页面
    wx.navigateTo({
      url: '/subpackages/other/favorites/index'
    })
  },

  // 处理用户设置按钮点击
  goToSettings() {
    console.log('Profile page goToSettings - 跳转到用户设置页面')

    
    // 检查登录状态
    if (!this.data.isLoggedIn) {
      console.log('未登录，显示登录提示')
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      })
      return
    }
    
    try {
      // 跳转到用户设置页面（使用完整路径）
      console.log('尝试跳转到用户设置页面...')
      wx.navigateTo({
        url: '/subpackages/profile/settings/index',
        success: function(res) {
          console.log('跳转成功:', res)
        },
        fail: function(err) {
          console.error('跳转失败:', err)
          wx.showToast({
            title: '跳转失败，请重试',
            icon: 'none'
          })
        }
      })
    } catch (error) {
      console.error('跳转到用户设置页面时发生错误:', error)
      wx.showToast({
        title: '发生错误，请重试',
        icon: 'none'
      })
    }
  },

  // 处理联系客服按钮点击
  handleContactSupport() {
    console.log('Profile page handleContactSupport - 开始联系客服')

    
    // 跳转到联系客服页面
    wx.navigateTo({
      url: '/pages/messages/index'
    })
  },

  // 处理关于我们按钮点击
  handleAboutUs() {
    console.log('Profile page handleAboutUs - 开始查看关于我们')

    
    // 跳转到关于我们页面
    wx.navigateTo({
      url: '/pages/index/index'
    })
  },

  // 跳转到订单页面
  goToOrders() {
    console.log('Profile page goToOrders - 跳转到订单页面')

    
    // 检查登录状态
    if (!this.data.isLoggedIn) {
      console.log('未登录，显示登录提示')
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      })
      return
    }
    
    // 跳转到订单页面
    wx.navigateTo({
      url: '/subpackages/booking/confirm'
    })
  },

  // 跳转到宠物页面
  goToPets() {
    console.log('Profile page goToPets - 跳转到宠物页面')

    
    // 检查登录状态
    if (!this.data.isLoggedIn) {
      console.log('未登录，显示登录提示')
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      })
      return
    }
    
    // 跳转到宠物页面
    wx.navigateTo({
      url: '/pages/pet/list'
    })
  },

  // 跳转到寄养服务页面
  goToHostingServices() {
    console.log('Profile page goToHostingServices - 跳转到寄养服务页面')

    
    // 检查登录状态
    if (!this.data.isLoggedIn) {
      console.log('未登录，显示登录提示')
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      })
      return
    }
    
    // 跳转到寄养服务页面
    wx.navigateTo({
      url: '/subpackages/hosting/index'
    })
  },

  // 跳转到评价页面
  goToReviews() {
    console.log('Profile page goToReviews - 跳转到评价页面')

    
    // 检查登录状态
    if (!this.data.isLoggedIn) {
      console.log('未登录，显示登录提示')
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      })
      return
    }
    
    // 跳转到评价页面
    wx.navigateTo({
      url: '/pages/messages/index'
    })
  },

  // 补全信息
  onCompleteInfo() {
    console.log('Profile page onCompleteInfo - 补全信息')

    
    // 检查登录状态
    if (!this.data.isLoggedIn) {
      console.log('未登录，显示登录提示')
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      })
      return
    }
    
    // 跳转到用户设置页面
    wx.navigateTo({
      url: '/subpackages/profile/settings/index'
    })
  },

  // 头像加载失败处理
  onAvatarLoadError(e) {
    console.log('头像加载失败:', e)
    // 设置默认头像
    if (this.data.userRole === 'host' && this.data.hostProfile) {
      const updatedProfile = {...this.data.hostProfile}
      updatedProfile.avatarUrl = '/images/default-avatar.svg'
      this.setData({
        hostProfile: updatedProfile
      })
    } else if (this.data.userInfo) {
      const updatedUserInfo = {...this.data.userInfo}
      updatedUserInfo.avatarUrl = '/images/default-avatar.svg'
      this.setData({
        userInfo: updatedUserInfo
      })
    }
    console.log('头像已更新为默认头像')
  },

  // 登录按钮点击事件
  onLoginButtonTap() {
    console.log('Profile page onLoginButtonTap - 登录按钮被点击，使用标准登录模块')
    const app = getApp()
    app.login()
      .then(result => {
        if (result.success) {
          console.log('登录成功:', result.message)
          this.checkLoginStatus()
        }
      })
      .catch(error => {
        console.error('登录失败:', error)
      })
  },

  // 处理头像选择
  async onChooseAvatar(e) {
    // 检查是否已经在处理头像选择，如果是则直接返回，防止重复调用
    if (this.data.isChoosingAvatar) {
      console.log('Profile page onChooseAvatar - 已有头像选择请求在处理中，忽略当前请求')
      return
    }
    
    console.log('Profile page onChooseAvatar - 用户选择了头像:', e.detail.avatarUrl)
    const tempFilePath = e.detail.avatarUrl
    
    try {
      // 设置正在处理头像选择的状态
      this.setData({
        isChoosingAvatar: true
      })
      
      // 检查图片大小
      const imageInfo = await new Promise((resolve, reject) => {
        wx.getImageInfo({
          src: tempFilePath,
          success: resolve,
          fail: reject
        })
      })
      
      if (imageInfo.size > 5 * 1024 * 1024) { // 5MB限制
        wx.showToast({
          title: '图片大小不能超过5MB',
          icon: 'none'
        })
        return
      }
      
      // 检查图片尺寸 - 移除最小尺寸限制，因为微信返回的头像可能较小
      // 微信官方文档建议使用用户选择的头像，不应该对尺寸进行严格限制
      // if (imageInfo.width < 200 || imageInfo.height < 200) {
      //   wx.showToast({
      //     title: '图片尺寸不能小于200x200',
      //     icon: 'none'
      //   })
      //   return
      // }
      
      // 显示上传中提示
      wx.showLoading({
        title: '上传头像中...',
      })
      
      // 根据当前角色选择正确的头像存储目录
      const currentRole = this.data.userRole || 'owner';
      const avatarDirectory = currentRole === 'owner' ? 'ownerProfiles/avatars' : 'hostProfiles/avatars';
      
      // 将临时文件上传到云存储（对应角色的头像目录）
      const uploadResult = await wx.cloud.uploadFile({
        cloudPath: `${avatarDirectory}/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.png`,
        filePath: tempFilePath,
      })
      
      console.log(`${currentRole}头像上传成功:`, uploadResult)
      
      // 上传成功，保存云存储fileID
      this.setData({
        avatarUrl: uploadResult.fileID
      })
      
      // 保存对应角色头像的fileID，用于后续更新数据库
      if (currentRole === 'owner') {
        this.setData({
          ownerAvatarUrl: uploadResult.fileID
        })
        console.log('宠物主人头像URL已保存:', uploadResult.fileID)
      } else {
        this.setData({
          hostAvatarUrl: uploadResult.fileID
        })
        console.log('寄养家庭头像URL已保存:', uploadResult.fileID)
      }
      
      wx.hideLoading()
      wx.showToast({
        title: '头像上传成功',
        icon: 'success'
      })
    } catch (error) {
      console.error('头像上传失败:', error)
      wx.hideLoading()
      
      // 详细的错误处理
      let errorMessage = '头像上传失败，请重试'
      if (error.errCode === -502) {
        errorMessage = '网络连接失败，请检查网络'
      } else if (error.errCode === -504) {
        errorMessage = '上传超时，请稍后重试'
      }
      
      wx.showToast({
        title: errorMessage,
        icon: 'none',
        duration: 2000
      })
      this.setData({
        avatarUrl: ''
      })
    } finally {
      // 无论成功还是失败，都要重置头像选择状态
      this.setData({
        isChoosingAvatar: false
      })
    }
  },

  // 处理昵称输入
  onNicknameInput(e) {
    console.log('Profile page onNicknameInput - 用户输入了昵称:', e.detail.value)
    this.setData({
      nickName: e.detail.value
    })
  },

  // 处理登录表单提交 - 已迁移到标准登录模块
  onSubmitLogin() {
    console.log('Profile page onSubmitLogin - 使用标准登录模块')
    const app = getApp()
    app.login()
      .then(result => {
        if (result.success) {
          console.log('登录成功:', result.message)
          this.checkLoginStatus()
        }
      })
      .catch(error => {
        console.error('登录失败:', error)
      })
  },

  // 处理身份选择
  onRoleSelect(e) {
    const selectedRoleType = e.currentTarget.dataset.roleType
    console.log('用户选择了身份:', selectedRoleType)

    // 验证角色类型是否有效
    if (!['owner', 'host'].includes(selectedRoleType)) {
      console.error('无效的角色类型:', selectedRoleType)
      wx.showToast({
        title: '无效的身份类型',
        icon: 'none'
      })
      return
    }

    // 检查该身份是否在可用身份列表中
    const { availableRoles } = this.data
    const roleExists = availableRoles.some(role => role.roleType === selectedRoleType)

    if (!roleExists) {
      console.error('所选身份不在可用身份列表中:', selectedRoleType)
      wx.showToast({
        title: '该身份不可用',
        icon: 'none'
      })
      return
    }

    this.setData({
      selectedRole: selectedRoleType
    })
  },

  // 确认身份选择
  async onConfirmRoleSelection() {
    const { selectedRole, tempLoginInfo } = this.data
    if (!selectedRole) {
      wx.showToast({
        title: '请选择一个身份',
        icon: 'none'
      })
      return
    }

    // 隐藏身份选择弹窗
    this.setData({
      showRoleSelection: false
    })

    // 检查是否是从登录流程触发的身份选择
    if (tempLoginInfo) {
      console.log('从登录流程确认身份选择:', selectedRole)

      // 使用临时登录信息完成登录
      const { userInfo, avatarUrl, token, userSig } = tempLoginInfo

      // 设置用户角色
      userInfo.role = selectedRole

      // 完成登录
      await this.handleLoginSuccess(userInfo, avatarUrl, token, userSig)

      // 清除临时登录信息
      this.setData({
        tempLoginInfo: null
      })
    } else {
      // 从身份管理页面触发的身份切换
      console.log('从身份管理页面确认身份选择:', selectedRole)
      await this.completeLogin(selectedRole)
    }
  },

  // 取消身份选择
  onCancelRoleSelection() {
    this.setData({
      showRoleSelection: false,
      selectedRole: null,
      tempUserInfo: null,
      tempLoginInfo: null
    })
  },

  // 完成登录流程 - 已迁移到标准登录模块
  async completeLogin(roleType) {
    console.log('以身份完成登录:', roleType)
    const app = getApp()
    
    // 使用标准登录模块的角色切换功能
    try {
      const result = await app.globalData.loginManager.switchRole(roleType)
      if (result) {
        console.log('角色切换成功:', roleType)
        this.checkLoginStatus()
        wx.showToast({
          title: '登录成功',
          icon: 'success'
        })
      }
    } catch (error) {
      console.error('角色切换失败:', error)
      wx.showToast({
        title: '登录失败，请重试',
        icon: 'none'
      })
    }
  },

  // 处理取消登录
  onCancelLogin() {
    console.log('Profile page onCancelLogin - 用户取消了登录')
    // 隐藏登录表单，清除临时输入的头像、昵称和宠物主人头像URL
    this.setData({
      showLoginForm: false,
      avatarUrl: '',
      nickName: '',
      ownerAvatarUrl: ''
    })
  },
}))
