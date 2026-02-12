const app = getApp()
import loginModule from '../../src/modules/auth/index'
const ErrorHandler = require('../../utils/error-handler')
const ImageOptimizer = require('../../utils/image-optimizer')
const { enhancePage } = require('../../utils/base-page')
const TouchHandler = require('../../utils/touch-handler')
const { stateManager } = require('../../utils/stateManager')

Page(enhancePage({
  // 页面初始化数据，不使用本地存储，每次从云函数获取最新数据
  data: {
    userInfo: {
      avatarUrl: '',
      nickName: '',
      role: 'owner'
    },
    userRole: 'owner',
    hostProfile: null, // 寄养家庭信息
    isLoggedIn: false,
    recommendedFamilies: [],
    events: [],
    count: 0,
    showLoginForm: false, // 登录表单显示状态
    showIdentityForm: false, // 身份选择表单显示状态
    existingRoles: [], // 已有身份列表
    avatarUrl: '', // 用户选择的头像
    nickName: '', // 用户输入的昵称
    isLoading: false, // 页面加载时默认不显示加载状态，避免影响用户体验
    isLoggingIn: false, // 登录中状态，用于显示登录动画
    isChoosingAvatar: false, // 头像选择状态，防止重复调用
    isGettingNickname: false, // 昵称获取状态，防止重复调用
    activeNavItem: '', // 激活的导航项
    todos: [], // todos 数据
    avatarUrlCache: {}, // 头像URL缓存，避免重复请求
    // 寄养家庭角色相关数据
    hostStats: {
      totalOrders: 0,
      totalIncome: 0,
      avgRating: 0,
      pendingOrders: 0
    },
  },

  // 触摸处理器实例
  touchHandler: null,

  onLoad() {
    // 初始化触摸处理器
    this.touchHandler = new TouchHandler()

    // 注册页面状态到状态管理器
    stateManager.registerPage('home', {
      isLoading: false,
      isLoggedIn: false,
      userInfo: {},
      userRole: 'owner',
      recommendedFamilies: [],
      events: [],
      todos: [],
      hostStats: {
        totalOrders: 0,
        totalIncome: 0,
        avgRating: 0,
        pendingOrders: 0
      }
    })

    // 添加状态变更监听器
    this.stateListener = stateManager.addListener('home', (updates, newState) => {
      this.setData(updates)
    })

    // 初始设置为未登录状态，确保动态类正确应用
    this.setData({
      isLoading: false,
      isLoggedIn: false,
      userInfo: {},
      userRole: 'owner'
    })

    // 检查是否是用户主动退出登录
    if (app.globalData.isLogout) {
      // 只加载基础数据，不加载用户相关数据
      return
    }

    // 检查是否需要手动登录（用户退出或未注册）
    if (app.globalData.needManualLogin) {
      // 只加载基础数据，不加载用户相关数据
      this.fetchTodos()
      return
    }
    
    // 获取 todos 数据
    this.fetchTodos()

    // 不在这里调用 checkLoginStatus，因为身份系统还在初始化
    // 等待身份系统初始化完成后，通过事件监听器自动更新页面

    // 添加身份系统初始化完成的监听器
    this.addIdentitySystemInitializedListener()
  },

  // 添加身份系统初始化完成的监听器
  addIdentitySystemInitializedListener() {
    // 监听身份系统初始化完成事件
    app.on('identitySystemInitialized', () => {
      this.updateUserInfoAfterIdentityInitialized()
    })
  },

  // 身份系统初始化完成后更新用户信息
  async updateUserInfoAfterIdentityInitialized() {
    try {
      // 检查全局用户信息是否存在
      if (app.globalData.userInfo) {
        const userRole = app.globalData.userRole || 'owner'

        // 先设置基本数据，让用户立即看到登录状态
        const userInfo = {
          ...app.globalData.userInfo,
          avatarUrl: app.globalData.userInfo.avatarUrl || '',
        }

        const hostProfile = app.globalData.hostInfo ? { ...app.globalData.hostInfo } : null
        const ownerProfile = app.globalData.ownerInfo ? { ...app.globalData.ownerInfo } : null

        // 使用状态管理器更新状态，利用防抖功能减少重复更新
        stateManager.debounceUpdate('home', {
          isLoggedIn: true,
          userInfo: userInfo,
          userRole: userRole,
          hostProfile: hostProfile,
          ownerProfile: ownerProfile
        })

        // 异步处理头像URL，逐步更新
        await this.handleAvatarUrls(userInfo, hostProfile, ownerProfile)
      }
    } catch (error) {
      console.error('更新用户信息失败:', error)
    }
  },

  // 处理头像URL，确保使用临时URL（与个人中心一致）
  async handleAvatarUrls(userInfo, hostProfile, ownerProfile) {
    console.log('Home handleAvatarUrls - 开始处理头像URL');
    console.log('Home handleAvatarUrls - userInfo.avatarUrl:', userInfo?.avatarUrl);
    console.log('Home handleAvatarUrls - hostProfile.avatarUrl:', hostProfile?.avatarUrl);
    console.log('Home handleAvatarUrls - ownerProfile.avatarUrl:', ownerProfile?.avatarUrl);

    // 收集所有头像URL，去重处理
    const avatarUrls = new Set();
    if (userInfo && userInfo.avatarUrl) avatarUrls.add(userInfo.avatarUrl);
    if (hostProfile && hostProfile.avatarUrl) avatarUrls.add(hostProfile.avatarUrl);
    if (ownerProfile && ownerProfile.avatarUrl) avatarUrls.add(ownerProfile.avatarUrl);

    console.log('Home handleAvatarUrls - 去重后需要处理的头像URL数量:', avatarUrls.size);

    // 处理用户头像
    if (userInfo && userInfo.avatarUrl) {
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

    // 使用状态管理器更新状态，利用防抖功能减少重复更新
    stateManager.debounceUpdate('home', {
      userInfo: userInfo,
      hostProfile: hostProfile,
      ownerProfile: ownerProfile
    });

    console.log('Home handleAvatarUrls - 头像URL处理完成');
  },

  // 处理单个头像URL
  async processAvatarUrl(avatarUrl) {
    if (!avatarUrl) {
      return '/images/default-avatar.svg';
    }

    // cloud:// fileID，生成临时URL并缓存
    if (avatarUrl.startsWith('cloud://')) {
      // 检查缓存中是否已有对应的临时URL
      const avatarUrlCache = this.data.avatarUrlCache;
      if (avatarUrlCache[avatarUrl]) {
        // 检查缓存的URL是否过期
        const cachedUrl = avatarUrlCache[avatarUrl];
        const urlExpiry = this.extractUrlExpiry(cachedUrl);
        const now = Date.now();

        // 如果URL还有效（剩余时间大于5分钟），使用缓存
        if (urlExpiry && (urlExpiry - now > 5 * 60 * 1000)) {
          console.log('Home processAvatarUrl - 使用缓存的临时URL:', cachedUrl);
          return cachedUrl;
        } else {
          console.log('Home processAvatarUrl - 缓存的URL已过期，重新获取');
        }
      }

      // 生成临时URL并缓存
      const tempUrl = await this.getTempAvatarUrl(avatarUrl);
      console.log('Home processAvatarUrl - cloud:// URL 转换为临时URL:', tempUrl);

      // 缓存临时URL，避免重复请求
      const newCache = { ...avatarUrlCache, [avatarUrl]: tempUrl };
      this.setData({ avatarUrlCache: newCache });
      console.log('Home processAvatarUrl - 缓存临时URL，缓存大小:', Object.keys(newCache).length);

      return tempUrl;
    }
    // 对于临时URL，检查是否过期
    else if (avatarUrl.includes('tcb.qcloud.la') || avatarUrl.includes('?t=')) {
      const urlExpiry = this.extractUrlExpiry(avatarUrl);
      const now = Date.now();

      if (urlExpiry && (urlExpiry - now < 5 * 60 * 1000)) {
        console.log('Home processAvatarUrl - 临时URL即将过期，需要从原始cloud:// URL重新获取');
        // 尝试从缓存中查找对应的 cloud:// URL
        const originalUrl = Object.keys(this.data.avatarUrlCache).find(
          key => this.data.avatarUrlCache[key] === avatarUrl
        );
        if (originalUrl) {
          return await this.processAvatarUrl(originalUrl);
        }
        // 如果找不到原始URL，返回默认头像
        return '/images/default-avatar.svg';
      }

      // 其他情况，直接使用原始URL
      return avatarUrl;
    }
    // 其他URL（如默认头像），直接使用
    else {
      return avatarUrl;
    }
  },

  // 从临时URL中提取过期时间
  extractUrlExpiry(url) {
    try {
      // URL格式示例: ...?sign=xxx&t=1234567890
      const match = url.match(/[?&]t=(\d+)/);
      if (match && match[1]) {
        return parseInt(match[1], 10) * 1000; // 转换为毫秒
      }
      return null;
    } catch (error) {
      console.error('提取URL过期时间失败:', error);
      return null;
    }
  },

  // 获取临时头像URL
  getTempAvatarUrl(cloudUrl) {
    console.log('Home page getTempAvatarUrl - 检测到云存储fileID，开始生成临时URL:', cloudUrl);

    return new Promise((resolve) => {
      wx.cloud.getTempFileURL({
        fileList: [cloudUrl],
        success: (res) => {
          console.log('Home page getTempAvatarUrl - 获取临时文件URL成功:', res);
          if (res.fileList && res.fileList[0] && res.fileList[0].tempFileURL) {
            const tempUrl = res.fileList[0].tempFileURL;
            console.log('Home page getTempAvatarUrl - 云存储fileID转换为临时URL成功:', tempUrl);
            resolve(tempUrl);
          } else {
            console.error('Home page getTempAvatarUrl - 获取临时文件URL失败，返回原始URL');
            resolve(cloudUrl);
          }
        },
        fail: (err) => {
          console.error('Home page getTempAvatarUrl - 获取临时文件URL失败:', err);
          resolve(cloudUrl);
        }
      });
    });
  },



  // 从云函数获取最新的用户角色和数据
  async getLatestUserRoleAndData() {
    // 检查是否是用户主动退出登录
    if (app.globalData.isLogout || app.globalData.needManualLogin) {
      console.log('用户主动退出登录或需要手动登录，跳过获取用户角色和数据')
      return
    }
    
    try {
      // 使用请求缓存管理器减少重复请求
      const requestCacheManager = app.globalData.requestCacheManager
      
      // 检查缓存
      const cachedData = requestCacheManager.getCache('getLatestUserRoleAndData')
      if (cachedData) {
        console.log('使用缓存的用户角色和数据')
        const userInfo = cachedData.userInfo
        const userRole = app.globalData.userRole || 'owner'
        
        // 使用状态管理器更新状态，利用防抖功能减少重复更新
        stateManager.debounceUpdate('home', {
          userInfo: userInfo,
          userRole: userRole
        })
        
        // 根据用户角色加载不同的数据
        if (userRole === 'owner') {
          // 宠物主人角色，加载推荐寄养家庭和活动
          this.getRecommendedFamilies()
          this.getEvents()
        } else {
          // 寄养家庭角色，加载统计数据
          this.getHostStats()
        }
        return
      }
      
      const result = await wx.cloud.callFunction({
        name: 'login',
        data: {
          // 不传递参数，只获取用户信息
        }
      })

      if (result.result.code === 0) {
        const userInfo = result.result.userInfo
        // 强制使用全局变量中的角色，确保状态一致性
        const userRole = app.globalData.userRole || 'owner'

        // 处理头像URL：如果云函数返回的头像URL为空，使用全局变量中的头像URL
        if (!userInfo.avatarUrl || userInfo.avatarUrl === '') {
          console.warn('云函数返回的头像URL为空，使用全局变量中的头像URL')
          userInfo.avatarUrl = (app.globalData.userInfo && app.globalData.userInfo.avatarUrl) || ''
        }

        // 处理头像URL
        userInfo.avatarUrl = await this.handleAvatarUrl(userInfo.avatarUrl)
          
        // 更新用户信息，但保持角色不变
        const updatedUserInfo = {
          ...userInfo,
          role: userRole
        }

        // 缓存数据，有效期10分钟
        requestCacheManager.setCache('getLatestUserRoleAndData', {
          userInfo: updatedUserInfo,
          userRole: userRole
        }, 600000)

        // 更新全局变量中的用户信息，使用包含正确角色的用户信息
        app.globalData.userInfo = updatedUserInfo
        // 不更新 userRole，保持当前活跃角色

        // 使用状态管理器更新状态
        stateManager.setState('home', {
          userInfo: updatedUserInfo,
          userRole: userRole
        })

        // 根据用户角色加载不同的数据
        if (userRole === 'owner') {
          // 宠物主人角色，加载推荐寄养家庭和活动
          this.getRecommendedFamilies()
          this.getEvents()
        } else {
          // 寄养家庭角色，加载统计数据
          this.getHostStats()
        }
      }
    } catch (error) {
      console.error('获取用户信息和角色失败:', error)
    }
  },

  // 获取 todos 数据
  async fetchTodos() {
    try {
      // 使用请求缓存管理器减少重复请求
      const requestCacheManager = app.globalData.requestCacheManager
      
      // 检查缓存模块是否已初始化
      if (requestCacheManager && requestCacheManager.getCache) {
        const cachedTodos = requestCacheManager.getCache('fetchTodos')
        if (cachedTodos) {
          console.log('使用缓存的待办事项数据')
          // 使用状态管理器更新状态
          stateManager.setState('home', {
            todos: cachedTodos,
          })
          return
        }
      }
      
      // 检查云开发是否已初始化
      if (typeof wx === 'object' && wx !== null && typeof wx.cloud === 'object' && wx.cloud !== null) {
        // 调用云函数获取待办事项数据
        const result = await wx.cloud.callFunction({
          name: 'getTodos'
        })
        
        if (result.result.success) {
          const todos = result.result.data || []
          // 缓存数据，有效期2分钟
          if (requestCacheManager && requestCacheManager.setCache) {
            requestCacheManager.setCache('fetchTodos', todos, 120000)
          }
          
          // 使用状态管理器更新状态
          stateManager.setState('home', {
            todos: todos,
          })
        } else {
          console.error('获取待办事项失败:', result.result.error)
        }
      } else {
        console.error('云开发未初始化，无法获取待办事项数据')
        // 云开发未初始化，使用默认数据
        const defaultTodos = []
        // 使用状态管理器更新状态
        stateManager.setState('home', {
          todos: defaultTodos,
        })
      }
    } catch (error) {
      console.error('Failed to get todos:', error)
    }
  },

  // 检查登录状态
  // 使用增强页面提供的方法

  // 处理头像URL的通用方法
  async handleAvatarUrl(avatarUrl) {
    return new Promise((resolve, reject) => {
      // 增强错误处理，添加类型检查
      if (typeof avatarUrl !== 'string') {
        console.error('头像URL类型错误，期望字符串，实际:', typeof avatarUrl, avatarUrl)
        resolve('') // 返回空字符串，让Avatar组件显示SVG
        return
      }

      // 去除字符串两端的反引号和空格
      let cleanedAvatarUrl = avatarUrl.replace(/^[`\s]+|[`\s]+$/g, '')

      // 检查是否是空字符串或只包含空格
      if (!cleanedAvatarUrl.trim()) {
        resolve('') // 返回空字符串，让Avatar组件显示SVG
        return
      }

      // 检查是否是云存储的fileID
      if (cleanedAvatarUrl.startsWith('cloud://')) {
        // 首先检查缓存中是否已有对应的临时URL
        const avatarUrlCache = this.data.avatarUrlCache || {};
        if (avatarUrlCache[cleanedAvatarUrl]) {
          const cachedUrl = avatarUrlCache[cleanedAvatarUrl];
          const urlExpiry = this.extractUrlExpiry(cachedUrl);
          const now = Date.now();

          // 如果URL还有效（剩余时间大于5分钟），使用缓存
          if (urlExpiry && (urlExpiry - now > 5 * 60 * 1000)) {
            console.log('handleAvatarUrl - 使用缓存的临时URL:', cachedUrl);
            resolve(cachedUrl);
            return;
          } else {
            console.log('handleAvatarUrl - 缓存的URL已过期，重新获取');
          }
        }

        // 为云存储的fileID生成临时访问URL
        wx.cloud.getTempFileURL({
          fileList: [cleanedAvatarUrl],
          success: res => {
            if (res.fileList && res.fileList[0] && res.fileList[0].tempFileURL) {
              const tempUrl = res.fileList[0].tempFileURL;

              // 缓存临时URL，使用 cloud:// URL 作为key
              const newCache = { ...avatarUrlCache, [cleanedAvatarUrl]: tempUrl };
              this.setData({ avatarUrlCache: newCache });

              console.log('handleAvatarUrl - 生成并缓存临时URL:', tempUrl);
              resolve(tempUrl);
            } else {
              console.error('云存储fileID转换失败，返回默认头像:', res)
              resolve('')
            }
          },
          fail: error => {
            console.error('获取临时文件URL失败:', error)
            resolve('')
          }
        })
        return
      }

      // 检查是否是云存储的临时访问URL
      if (cleanedAvatarUrl.includes('cloud1') || cleanedAvatarUrl.includes('tcb.qcloud.la')) {
        // 检查URL是否过期
        const urlExpiry = this.extractUrlExpiry(cleanedAvatarUrl);
        const now = Date.now();

        if (urlExpiry && (urlExpiry - now < 5 * 60 * 1000)) {
          console.log('handleAvatarUrl - 临时URL即将过期，尝试从缓存重新获取');
          // 尝试从缓存中查找对应的 cloud:// URL
          const originalUrl = Object.keys(this.data.avatarUrlCache || {}).find(
            key => (this.data.avatarUrlCache[key]) === cleanedAvatarUrl
          );
          if (originalUrl) {
            console.log('handleAvatarUrl - 找到原始URL，重新生成:', originalUrl);
            this.handleAvatarUrl(originalUrl).then(resolve);
            return;
          }
          console.warn('handleAvatarUrl - 未找到原始cloud:// URL，返回默认头像');
          resolve('/images/default-avatar.svg');
          return;
        }

        resolve(cleanedAvatarUrl);
        return
      }
      
      // 检查是否是本地资源路径格式
      if (cleanedAvatarUrl.startsWith('/')) {
        resolve(cleanedAvatarUrl)
        return
      }
      
      // 对于其他格式的URL（包括wxfile://和http://），直接使用
      resolve(cleanedAvatarUrl)
    })
  },

  // 获取用户信息 - 从云函数获取最新数据，不使用本地存储
  async getUserInfo() {
    // 检查是否是用户主动退出登录
    if (app.globalData.isLogout || app.globalData.needManualLogin) {
      return
    }
    
    try {
      const result = await wx.cloud.callFunction({
        name: 'login',
        data: {}
      })
      
      if (result.result.code === 0 && result.result.userInfo) {
        const userInfo = result.result.userInfo
        const userRole = userInfo.role || 'owner'
        
        // 处理头像URL
        userInfo.avatarUrl = await this.handleAvatarUrl(userInfo.avatarUrl)
        
        this.setData({
          userInfo: {
            avatarUrl: userInfo.avatarUrl,
            nickName: userInfo.nickName,
            role: userRole
          },
          userRole: userRole
        })

        // 如果是寄养家庭角色，获取寄养家庭信息
        if (userRole === 'host') {
          this.getHostProfile()
        } else {
          // 如果是宠物主人角色，清空寄养家庭信息
          this.setData({
            hostProfile: null
          })
        }
      }
    } catch (error) {
      console.error('获取用户信息失败:', error)
    }
  },

  // 获取寄养家庭信息
  getHostProfile() {
    wx.cloud.callFunction({
      name: 'getHostProfile',
      success: res => {
        if (res.result.code === 0 && res.result.data) {
          // 从顶级字段获取寄养家庭的头像和名称，确保字段匹配
          const hostData = res.result.data

          // 处理嵌套结构和扁平结构的数据，确保兼容性
          // 重要：保存原始的 cloud:// fileID 到 globalData，而不是临时URL
          const originalAvatarUrl = hostData.avatarUrl || (hostData.basicInfo && hostData.basicInfo.avatarUrl) || ''
          let processedHostProfile = {
            ...hostData,
            avatarUrl: hostData.avatarUrl || (hostData.basicInfo && hostData.basicInfo.avatarUrl) || '',
            hostName: hostData.hostName || (hostData.basicInfo && hostData.basicInfo.hostName) || hostData.name || (hostData.basicInfo && hostData.basicInfo.name) || '未设置名称'
          }

          // 更新全局变量中的hostInfo，存储原始的 cloud:// fileID
          app.globalData.hostInfo = {
            ...hostData,
            avatarUrl: originalAvatarUrl
          }

          // 如果头像字段是fileID，获取临时访问URL用于显示
          if (originalAvatarUrl && originalAvatarUrl.startsWith('cloud://')) {
            // 直接获取临时访问URL
            wx.cloud.getTempFileURL({
              fileList: [originalAvatarUrl],
              success: res => {
                if (res.fileList[0].tempFileURL) {
                  const tempUrl = res.fileList[0].tempFileURL;

                  // 关键修复：保存原始 cloud:// fileID，而不是临时URL
                  processedHostProfile.avatarUrl = originalAvatarUrl;

                  // 缓存临时URL，使用 cloud:// URL 作为key
                  const newCache = { ...this.data.avatarUrlCache, [originalAvatarUrl]: tempUrl };
                  this.setData({ avatarUrlCache: newCache });

                  this.setData({
                    hostProfile: processedHostProfile,
                    'userInfo.avatarUrl': tempUrl, // 仅用于显示，保存临时URL
                    'userInfo.nickName': processedHostProfile.hostName
                  });

                  // 同时更新全局变量中的用户信息（用于显示）
                  // 注意：这里保存临时URL用于显示，但保留原始fileID
                  app.globalData.userInfo = {
                    ...app.globalData.userInfo,
                    avatarUrl: tempUrl,
                    nickName: processedHostProfile.hostName
                  };
                }
              },
              fail: err => {
                console.error('获取临时文件URL失败:', err);
                // 显示原始fileID或使用默认头像
                this.setData({
                  hostProfile: processedHostProfile,
                  'userInfo.avatarUrl': processedHostProfile.avatarUrl || '',
                  'userInfo.nickName': processedHostProfile.hostName
                });
              }
            });
          } else {
            // 头像不是fileID，直接使用
            this.setData({
              hostProfile: processedHostProfile
            })

            // 同时更新页面显示的用户头像和名称，确保一致性
            // 对于寄养家庭角色，强制使用寄养家庭的头像和名称
            this.setData({
              'userInfo.avatarUrl': processedHostProfile.avatarUrl || '',
              'userInfo.nickName': processedHostProfile.hostName
            })

            // 同时更新全局变量中的用户信息
            app.globalData.userInfo = {
              ...app.globalData.userInfo,
              avatarUrl: processedHostProfile.avatarUrl || app.globalData.userInfo.avatarUrl,
              nickName: processedHostProfile.hostName
            }
          }
        } else {
          this.setData({
            hostProfile: null,
            'userInfo.avatarUrl': '',
            'userInfo.nickName': '未设置名称'
          })
        }
      },
      fail: err => {
        console.error('获取寄养家庭信息失败:', err)
        this.setData({
          hostProfile: null,
          'userInfo.avatarUrl': '',
          'userInfo.nickName': '未设置名称'
        })
      }
    })
  },

  // 获取寄养家庭统计数据
  async getHostStats() {
    try {
      // 使用请求缓存管理器减少重复请求
      const requestCacheManager = app.globalData.requestCacheManager
      
      // 检查缓存
      const cachedStats = requestCacheManager.getCache('getHostStats')
      if (cachedStats) {
        console.log('使用缓存的寄养家庭统计数据')
        // 使用状态管理器更新状态
        stateManager.setState('home', {
          hostStats: cachedStats
        })
        return
      }
      
      // 调用云函数获取统计数据
      const res = await wx.cloud.callFunction({
        name: 'getHostStats'
      })
      
      if (res.result.code === 0 && res.result.data) {
        // 缓存数据，有效期3分钟
        requestCacheManager.setCache('getHostStats', res.result.data, 180000)
        
        // 使用状态管理器更新状态
        stateManager.setState('home', {
          hostStats: res.result.data
        })
      } else {
        console.error('获取寄养家庭统计数据失败:', res.result.message)
        // 使用模拟数据作为备用
        const mockStats = {
          totalOrders: 12,
          totalIncome: 2850,
          avgRating: 4.8,
          pendingOrders: 2
        }
        stateManager.setState('home', {
          hostStats: mockStats
        })
      }
    } catch (error) {
      console.error('调用云函数 getHostStats 失败:', error)
      // 使用模拟数据作为备用
      const mockStats = {
        totalOrders: 12,
        totalIncome: 2850,
        avgRating: 4.8,
        pendingOrders: 2
      }
      stateManager.setState('home', {
        hostStats: mockStats
      })
    }
  },

  // 登录按钮点击事件
  onLoginButtonTap() {
    // 显示登录表单，让用户选择头像和输入昵称
    this.setData({
      showLoginForm: true
    })
  },

  // 处理头像选择
  async onChooseAvatar(e) {
    // 检查是否已经在处理头像选择，如果是则直接返回，防止重复调用
    if (this.data.isChoosingAvatar) {
      return
    }

    const tempFilePath = e.detail.avatarUrl

    try {
      // 设置正在处理头像选择的状态
      this.setData({
        isChoosingAvatar: true
      })

      // 显示上传中提示
      wx.showLoading({
        title: '上传头像中...',
      })

      // 将临时文件上传到云存储
      const uploadResult = await wx.cloud.uploadFile({
        cloudPath: `user-avatars/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.png`,
        filePath: tempFilePath,
      })

      // 上传成功，保存云存储fileID
      this.setData({
        avatarUrl: uploadResult.fileID
      })
      
      wx.hideLoading()
    } catch (error) {
      console.error('头像上传失败:', error)
      wx.hideLoading()
      wx.showToast({
        title: '头像上传失败，请重试',
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
    console.log('用户输入了昵称:', e.detail.value)
    this.setData({
      nickName: e.detail.value
    })
  },

  // 处理昵称输入框点击事件
  onNicknameInputTap() {
    console.log('用户点击了昵称输入框')
    // 微信小程序最新政策：wx.getUserProfile API 已无法获取真实的微信昵称，只能返回默认的"微信用户"
    // 官方推荐使用 type="nickname" 的输入框让用户手动输入昵称
    // 因此这里不做特殊处理，让用户直接在输入框中输入昵称
  },

  // 处理登录表单提交 - 已迁移到标准登录模块
  onSubmitLogin() {
    console.log('Home page onSubmitLogin - 使用标准登录模块')
    
    // 设置登录中状态，显示加载动画
    this.setData({
      isLoggingIn: true
    })
    
    const app = getApp()
    app.login()
      .then(result => {
        if (result.success) {
          console.log('登录成功:', result.message)
          // 登录成功后关闭登录表单
          this.setData({
            showLoginForm: false,
            avatarUrl: '',
            nickName: '',
            isLoggingIn: false
          })
          this.checkLoginStatus()
        } else {
          // 登录失败，重置登录状态
          this.setData({
            isLoggingIn: false
          })
        }
      })
      .catch(error => {
        console.error('登录失败:', error)
        // 登录失败，重置登录状态
        this.setData({
          isLoggingIn: false
        })
      })
  },

  // 处理取消登录
  onCancelLogin() {
    // 隐藏登录表单，清除临时输入的头像和昵称
    this.setData({
      showLoginForm: false,
      avatarUrl: '',
      nickName: ''
    })
  },

  // 显示身份选择表单
  showIdentityForm() {
    this.loadUserRoles()
    this.setData({
      showIdentityForm: true
    })
  },

  // 隐藏身份选择表单
  hideIdentityForm() {
    this.setData({
      showIdentityForm: false
    })
    
    // 确保用户取消身份选择后，下次登录时仍需要选择身份
    // 不清除用户信息，只确保userRole为空
    const app = getApp()
    if (app && app.globalData) {
      // 保持用户信息不变，但清除用户角色
      app.globalData.userRole = null
    }
  },

  // 加载用户角色
  async loadUserRoles() {
    try {
      const app = getApp()
      
      // 使用标准登录模块获取用户角色列表
      const roles = app.globalData.loginManager.getRoles()
      console.log('获取到用户角色列表:', roles)
      
      // 更新页面数据
      this.setData({
        existingRoles: roles || []
      })
    } catch (error) {
      console.error('加载用户角色失败:', error)
      this.setData({
        existingRoles: []
      })
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
        this.hideIdentityForm()
        // 隐藏登录表单
        this.setData({ showLoginForm: false })
        setTimeout(() => {
          this.checkLoginStatus()
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
        this.hideIdentityForm()
        // 隐藏登录表单
        this.setData({ showLoginForm: false })
        setTimeout(() => {
          this.checkLoginStatus()
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
  async createHostIdentity() {
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
        this.hideIdentityForm()
        // 隐藏登录表单
        this.setData({ showLoginForm: false })
        setTimeout(() => {
          this.checkLoginStatus()
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
  },

  // 微信登录 - 已迁移到标准登录模块
  loginWithWechat(avatarUrl, nickName) {
    console.log('Home page loginWithWechat - 使用标准登录模块')
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
      }
      if (userSig) {
        wx.setStorageSync('userSig', userSig)
      }
      // 登录成功后，清除本地存储中的退出标志，确保其他页面能正确检测到登录状态
      wx.removeStorageSync('isLogout')
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
    // 更新页面数据
    this.setData({
      userInfo: userInfo,
      isLoggedIn: true,
      showLoginForm: false, // 关闭登录表单
      nickName: '', // 清除临时昵称
      avatarUrl: '' // 清除临时头像
    })
    
    // 更新全局数据
    const app = getApp()
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
  handleLoginSuccess(userInfo, avatarUrl, token, userSig) {
    // 确保用户信息包含必要的角色字段
    if (!userInfo.role) {
      userInfo.role = 'owner'
    }
    
    // 检查头像是否上传成功，优先使用用户选择的头像，即使云函数返回了默认头像
    if (!userInfo.avatarUrl || userInfo.avatarUrl === '' || userInfo.avatarUrl === '/images/default-avatar.svg') {
      userInfo.avatarUrl = avatarUrl
    }

    // 保存用户信息、token 和 userSig 到本地存储
    if (!this.saveUserInfo(userInfo, token, userSig)) {
      return
    }
    
    // 更新用户界面
    this.updateUserInterface(userInfo)
    
    // 显示登录成功提示
    wx.hideLoading()
    wx.showToast({
      title: '登录成功',
      icon: 'success'
    })
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
    wx.cloud.callFunction({
      name: 'login',
      data: {
        code: code,
        userInfo: userInfo  // 传递用户授权的信息，符合微信官方登录流程
        // 根据微信最新政策，用户信息需要在登录时由用户主动授权
      },
      success: (cloudRes) => {
        console.log('云函数返回的结果:', JSON.stringify(cloudRes.result, null, 2))
        
        // 检查云函数是否返回成功
        if (cloudRes.result.code === -1) {
          console.error('云函数返回登录失败：', cloudRes.result.message)
          // 处理登录失败，使用临时模式
          this.handleLoginFailure('', '', 'temp')
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
          console.error('云函数返回的用户信息不完整:', resultUserInfo)
          
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
            resultUserInfo.avatarUrl = resultUserInfo.avatarUrl || (cloudRes.result && cloudRes.result.data && cloudRes.result.data.userInfo && cloudRes.result.data.userInfo.avatarUrl) || ''
            resultUserInfo.nickName = resultUserInfo.nickName || (cloudRes.result && cloudRes.result.data && cloudRes.result.data.userInfo && cloudRes.result.data.userInfo.nickName) || ''
            resultUserInfo.role = resultUserInfo.role || (cloudRes.result && cloudRes.result.data && cloudRes.result.data.userInfo && cloudRes.result.data.userInfo.role) || 'owner'
            
            console.log('修复后的用户信息:', resultUserInfo)
          } else {
            wx.hideLoading()
            wx.showToast({
              title: '登录失败，用户信息不完整',
              icon: 'none',
              duration: 3000
            })
            return
          }
        }
        
        // 处理登录成功，传递 token 和 userSig
        this.handleLoginSuccess(resultUserInfo, '', token, userSig)
      },
      fail: (error) => {
        console.error('云函数 login 调用失败：', error)
        // 处理登录失败，使用离线模式
        this.handleLoginFailure('', '', 'offline')
      }
    })
  },

  // 获取推荐寄养家庭
  async getRecommendedFamilies() {
    try {
      console.log('开始获取推荐寄养家庭列表')
      
      // 使用请求缓存管理器减少重复请求
      const requestCacheManager = app.globalData.requestCacheManager
      
      // 检查缓存
      const cachedFamilies = requestCacheManager.getCache('getRecommendedFamilies')
      if (cachedFamilies) {
        console.log('使用缓存的推荐寄养家庭列表')
        // 使用状态管理器更新状态
        stateManager.setState('home', {
          recommendedFamilies: cachedFamilies
        })
        // 预加载寄养家庭头像
        this.preloadHostAvatars(cachedFamilies)
        return
      }
      
      // 调用云函数获取真实的寄养家庭列表
      const result = await wx.cloud.callFunction({
        name: 'getHostList'
      })

      if (result.result.code === 0 && result.result.data) {
        // 从完整地址中提取城市和区县信息
        function extractCityAndDistrict(address) {
          if (!address) {return '成都市'}

          // 常见的地址格式："成都市武侯区某某街道"或"成都市锦江区某某路"
          // 提取前两级行政区划
          const addressParts = address.split(/[市县区]/).filter(part => part)
          if (addressParts.length >= 2) {
            return `${addressParts[0]}市${addressParts[1]}区`
          } else if (addressParts.length >= 1) {
            return `${addressParts[0]}市`
          } else {
            return '成都市'
          }
        }

        // 处理获取到的数据
        const families = result.result.data.slice(0, 4).map(host => {
          return {
            id: host._id || host.id,
            name: host.hostName || '未设置名称',
            avatarUrl: host.avatarUrl || '',
            rating: host.rating || 0,
            reviews: host.reviewCount || 0,
            price: host.pricePerDay || 0,
            location: extractCityAndDistrict(host.address),
            tags: ['有经验', '爱干净', '可上门'],
            isAcceptingOrders: host.isAcceptingOrders !== undefined ? host.isAcceptingOrders : true
          }
        })

        // 缓存数据，有效期5分钟
        requestCacheManager.setCache('getRecommendedFamilies', families, 300000)

        // 使用状态管理器更新状态
        stateManager.setState('home', {
          recommendedFamilies: families
        })

        // 预加载寄养家庭头像
        this.preloadHostAvatars(families)
      } else {
        console.error('获取寄养家庭列表失败:', result.result.message)
        // 如果获取失败，使用空数组避免显示错误
        stateManager.setState('home', {
          recommendedFamilies: []
        })
      }
    } catch (error) {
      console.error('调用云函数 getHostList 失败:', error)
      // 出错时显示空数组
      stateManager.setState('home', {
        recommendedFamilies: []
      })
    }
  },

  // 选择寄养家庭
  selectHost(e) {
    const hostId = e.currentTarget.dataset.id
    
    // 跳转到寄养家庭详情页面
    wx.navigateTo({
      url: `/subpackages/booking/host-detail?id=${hostId}`
    })
  },

  // 获取热门活动
  getEvents() {
    // 模拟数据
    const events = [
      {
        id: 1,
        title: '新用户首单立减50元',
        image: 'https://picsum.photos/200/200?random=4',
        startDate: '2023-01-01',
        endDate: '2023-01-31',
        discount: '立减50元'
      },
      {
        id: 2,
        title: '元旦寄养特惠',
        image: 'https://picsum.photos/200/200?random=5',
        startDate: '2023-01-01',
        endDate: '2023-01-07',
        discount: '8折优惠'
      }
    ]

    this.setData({
      events: events
    })
  },

  // 防抖定时器
  navClickTimer: null,
  // 防止重复点击的标志
  isNavigating: false,
  // 激活的导航项
  activeNavItem: '',

  // 导航按钮触摸开始事件
  onNavTouchStart(e) {
    // 清除之前的定时器
    if (this.navClickTimer) {
      clearTimeout(this.navClickTimer)
      this.navClickTimer = null
    }
    
    // 设置激活状态
    const action = e.currentTarget.dataset.action
    this.setData({
      activeNavItem: action
    })
  },

  // 导航到寄养家庭维护页面
  navigateToHostingServices() {
    wx.navigateTo({
      url: '/subpackages/hosting/index'
    })
  },

  // 导航按钮触摸结束事件
  onNavTouchEnd(e) {
    // 获取要执行的动作
    const action = e.currentTarget.dataset.action
    
    // 设置导航标志
    if (this.isNavigating) {
      // 如果正在导航中，取消之前的定时器并重新设置
      if (this.navClickTimer) {
        clearTimeout(this.navClickTimer)
      }
    }
    
    this.isNavigating = true
    
    // 执行导航操作
    this.navClickTimer = setTimeout(() => {
      // 添加安全检查
      if (typeof this[action] === 'function') {
        this[action]()
      } else {
        console.error(`函数 ${action} 不存在`)
        wx.showToast({
          title: '功能待开发',
          icon: 'none'
        })
      }
      // 重置导航标志
      this.isNavigating = false
      this.navClickTimer = null
      // 重置激活状态
      this.setData({
        activeNavItem: ''
      })
    }, 150) // 增加延迟时间，确保动画完整显示
  },

  // 导航按钮触摸取消事件
  onNavTouchCancel() {
    // 重置激活状态
    this.setData({
      activeNavItem: ''
    })
    // 清除定时器
    if (this.navClickTimer) {
      clearTimeout(this.navClickTimer)
      this.navClickTimer = null
      this.isNavigating = false
    }
  },

  // 导航到预约页面
  navigateToBooking() {
    wx.switchTab({
      url: '/pages/booking/calendar'
    })
  },

  // 导航到宠物管理页面
  navigateToPets() {
    // 直接导航到宠物列表页面
    wx.navigateTo({
      url: '/pages/pet/list'
    })
  },

  // 导航到我的收藏页面
  navigateToFavorites() {
    wx.navigateTo({
      url: '/subpackages/other/favorites/index'
    })
  },

  // 导航到客户页面
  navigateToCustomers() {
    wx.showToast({
      title: '我的客户页面待开发',
      icon: 'none'
    })
  },

  // 导航到个人中心页面
  navigateToProfile() {
    wx.switchTab({
      url: '/pages/profile/index'
    })
  },

  // 测试函数
  testFunction() {
    console.log('测试函数被调用了')
    wx.showToast({
      title: '测试函数被调用',
      icon: 'success'
    })
  },
  
  // 查看更多寄养家庭
  viewMoreFamilies() {
    console.log('点击了查看全部按钮')
    wx.navigateTo({
      url: '/subpackages/booking/host-list-all',
      success: function(res) {
        console.log('页面跳转成功', res)
      },
      fail: function(err) {
        console.error('页面跳转失败', err)
      }
    })
  },

  // 调用容器化接口
  callContainerAPI() {
    wx.showLoading({
      title: '加载中...'
    })
    
    wx.cloud.callContainer({
      'config': {
        'env': 'prod-4gaiua8of9782c6c'
      },
      'path': '/api/count',
      'header': {
        'X-WX-SERVICE': 'express-5ff0'
      },
      'method': 'POST',
      'data': {
        'action': 'inc'
      },
      success: (res) => {
        wx.hideLoading()

        if (res.data && res.data.count) {
          this.setData({
            count: res.data.count
          })
          
          wx.showToast({
            title: '计数已增加',
            icon: 'success'
          })
        } else {
          wx.showToast({
            title: '返回数据格式错误',
            icon: 'none'
          })
        }
      },
      fail: (error) => {
        console.error('调用失败:', error)
        wx.hideLoading()
        wx.showToast({
          title: '调用失败',
          icon: 'none'
        })
      }
    })
  },

  // 初始化寄养家庭数据
  initHostProfiles() {
    wx.showLoading({
      title: '初始化中...'
    })
    
    wx.cloud.callFunction({
      name: 'initHostProfiles',
      success: res => {
        console.log('初始化寄养家庭数据成功:', res.result)
        wx.hideLoading()
        
        if (res.result.success) {
          wx.showToast({
            title: '初始化成功',
            icon: 'success'
          })
          
          // 重新获取推荐寄养家庭列表
          this.getRecommendedFamilies()
        } else {
          wx.showToast({
            title: '初始化失败',
            icon: 'none'
          })
        }
      },
      fail: err => {
        console.error('初始化寄养家庭数据失败:', err)
        wx.hideLoading()
        wx.showToast({
          title: '初始化失败',
          icon: 'none'
        })
      }
    })
  },

  // 查看更多活动
  viewMoreEvents() {
    wx.showToast({
      title: '活动列表页面待开发',
      icon: 'none'
    })
  },

  // 页面显示时更新登录状态，并确保 tabBar 选中状态正确
  async onShow() {
    try {
      // 检查全局退出状态

      // 如果刚刚完成了身份选择，隐藏身份选择表单和登录表单
      if (app.globalData.justCompletedIdentitySelection) {
        console.log('Home page onShow - 检测到刚刚完成了身份选择，隐藏身份选择表单和登录表单')
        this.setData({ 
          showIdentityForm: false,
          showLoginForm: false
        })
        // 清除标志，避免下次误触发
        app.globalData.justCompletedIdentitySelection = false
      }

      // 如果身份系统还没有初始化完成，提前返回，避免 base-page.js 的 checkLoginAndShowModal 弹出提示
      if (!app.globalData.userInfo) {
        // 确保 tabBar 选中状态正确
        this.setTabBarSelected()
        return
      }

      // 如果全局是退出状态，不执行自动登录，直接设置为未登录状态
      if (app.globalData.isLogout) {
        // 使用状态管理器更新状态
        stateManager.setState('home', {
          isLoggedIn: false,
          userInfo: {},
          userRole: 'owner'
        })
        // 确保 tabBar 选中状态正确
        this.setTabBarSelected()
        return
      }

      // 优先检查全局用户信息，如果存在则直接使用
      if (app.globalData.userInfo && app.globalData.userInfo._id) {
        // 先设置基本数据，让用户立即看到登录状态
        const userInfo = {
          ...app.globalData.userInfo,
          avatarUrl: app.globalData.userInfo.avatarUrl || '',
        }

        const userRole = app.globalData.userRole || 'owner'
        const hostProfile = app.globalData.hostInfo ? { ...app.globalData.hostInfo } : null
        const ownerProfile = app.globalData.ownerInfo ? { ...app.globalData.ownerInfo } : null

        // 使用状态管理器更新状态
        stateManager.setState('home', {
          isLoggedIn: true,
          userInfo: userInfo,
          userRole: userRole,
          hostProfile: hostProfile,
          ownerProfile: ownerProfile
        })

        // 异步处理头像URL
        await this.handleAvatarUrls(userInfo, hostProfile, ownerProfile)

        // 确保 tabBar 选中状态正确
        this.setTabBarSelected()
        return
      }
      
      // 检查当前页面的登录状态
      console.log('Home page onShow - 当前页面登录状态:', this.data.isLoggedIn)
      
      // 优先使用全局用户信息，如果存在且未登录，再执行登录检查
      if (!this.data.isLoggedIn && app.globalData.userInfo) {
        console.log('Home page onShow - 使用全局用户信息更新页面')
        
        const userInfo = {
          ...app.globalData.userInfo,
          avatarUrl: app.globalData.userInfo.avatarUrl || '',
          role: app.globalData.userRole || 'owner'
        }
        
        // 使用状态管理器更新状态
        stateManager.setState('home', {
          isLoggedIn: true,
          userInfo: userInfo,
          userRole: app.globalData.userRole || 'owner'
        })
        
        // 异步处理头像URL
        await this.handleAvatarUrls(userInfo, null, null)
        
        // 确保 tabBar 选中状态正确
        this.setTabBarSelected()
        return
      }
      
      // 如果页面已登录且全局用户信息存在，检查是否一致
      if (this.data.isLoggedIn && app.globalData.userInfo) {
        const globalUserInfo = {
          ...app.globalData.userInfo,
          avatarUrl: app.globalData.userInfo.avatarUrl || '',
          role: app.globalData.userRole || 'owner'
        }

        // 如果一致，不更新页面数据
        if (JSON.stringify(this.data.userInfo) === JSON.stringify(globalUserInfo) &&
            this.data.userRole === (app.globalData.userRole || 'owner')) {
          // 确保 tabBar 选中状态正确
          this.setTabBarSelected()
          return
        }
      }

      // 只有在必要时才检查登录状态并获取用户信息
      // 如果身份系统还没有初始化完成，不调用 checkLoginStatus
      if (app.globalData.userInfo) {
        await this.checkLoginStatus()
      }

      // 确保 tabBar 选中状态正确
      this.setTabBarSelected()
    } catch (error) {
      console.error('Home page onShow - 发生错误:', error)
      // 确保 tabBar 选中状态正确，即使发生错误
      this.setTabBarSelected()
    }
  },
  
  // 设置 tabBar 选中状态
  setTabBarSelected() {
    // 调用增强页面提供的方法
    this.setTabBarIndex(0)
  },

  // 头像加载失败时的处理函数
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
  
  // 重试获取用户信息的辅助函数
  retryGetUserInfo() {
    console.log('尝试重新获取用户信息')
    // 检查是否需要手动登录（用户退出或未注册）
    if (app.globalData.needManualLogin || app.globalData.isLogout) {
      console.log('需要手动登录或用户已退出，跳过自动登录重试')
      return
    }
    app.autoLogin().then(() => {
      this.checkLoginStatus()
      this.getUserInfo()
    }).catch(error => {
      console.error('重新获取用户信息失败:', error)
      // 即使失败，也不显示默认头像，保持为空或原始状态
    })
  },

  // 寄养家庭头像加载失败时的处理函数
  onFamilyAvatarLoadError(e) {
    // 这里可以根据索引更新对应项的头像，或者直接忽略（因为已经设置了默认头像）
  },

  // 活动图片加载失败时的处理函数
  onEventImageLoadError(e) {
    // 这里可以根据索引更新对应项的图片，或者直接忽略（因为已经设置了默认图片）
  },

  // 寄养家庭列表开始触摸
  onHostListTouchStart(e) {
    this.touchHandler.onTouchStart(e)
  },

  // 寄养家庭列表滑动
  onHostListTouchMove(e) {
    // 当检测到滑动时，设置isSwiping为true
    const deltaX = Math.abs(e.touches[0].clientX - this.touchHandler.touchStartX)
    const deltaY = Math.abs(e.touches[0].clientY - this.touchHandler.touchStartY)
    if (deltaX > this.touchHandler.swipeThreshold || deltaY > this.touchHandler.swipeThreshold) {
      this.touchHandler.isSwiping = true
    }
  },

  // 寄养家庭列表结束触摸
  onHostListTouchEnd(e) {
    this.touchHandler.onTouchEnd(e)
  },

  // 寄养家庭列表项开始触摸
  onHostItemTouchStart(e) {
    this.touchHandler.onTouchStart(e)
  },

  // 寄养家庭列表项结束触摸
  onHostItemTouchEnd(e) {
    const isSwiping = this.touchHandler.onTouchEnd(e)
    const hostId = e.currentTarget.dataset.id
    const isAcceptingOrders = e.currentTarget.dataset.isAccepting
    
    // 如果不是滑动，且寄养家庭接受订单，才执行点击事件
    if (!isSwiping && isAcceptingOrders) {
      this.selectHost(e)
    }
  },

  // 选择寄养家庭
  selectHost(e) {
    const hostId = e.currentTarget.dataset.id

    wx.navigateTo({
      url: `/subpackages/booking/host-detail?id=${hostId}`
    })
  },
  
  // 预加载图片
  preloadImages() {
    const imageUrls = []
    
    // 添加用户头像
    if (this.data.userInfo.avatarUrl) {
      imageUrls.push(this.data.userInfo.avatarUrl)
    }
    
    // 添加其他需要预加载的图片
    // 例如轮播图、活动图片等
    
    if (imageUrls.length > 0) {
      ImageOptimizer.preloadImages(imageUrls, {
        priority: 'high',
        maxConcurrent: 3
      }).then(results => {
        console.log('图片预加载完成', results)
      })
    }
  },
  
  // 预加载寄养家庭头像
  preloadHostAvatars(families) {
    const avatarUrls = families
      .filter(family => family.avatarUrl)
      .map(family => family.avatarUrl)
    
    if (avatarUrls.length > 0) {
      ImageOptimizer.preloadImages(avatarUrls, {
        priority: 'medium',
        maxConcurrent: 5
      })
    }
  },

  // 生命周期函数--监听页面卸载
  onUnload() {
    // 清理状态管理器监听器
    if (this.stateListener) {
      this.stateListener() // 调用取消监听函数
      this.stateListener = null
    }

    // 清理触摸处理器实例
    if (this.touchHandler) {
      this.touchHandler = null
    }

    // 清理定时器
    if (this.navClickTimer) {
      clearTimeout(this.navClickTimer)
      this.navClickTimer = null
    }

    // 清理状态管理器中的页面状态
    stateManager.unregisterPage('home')

    // 清理请求缓存中与本页面相关的缓存
    const requestCacheManager = app.globalData.requestCacheManager
    if (requestCacheManager) {
      // 清理首页相关的缓存
      requestCacheManager.clearCache('getLatestUserRoleAndData')
      requestCacheManager.clearCache('getRecommendedFamilies')
      requestCacheManager.clearCache('getHostStats')
      requestCacheManager.clearCache('fetchTodos')
    }

    // 清理页面数据
    this.setData({
      userInfo: null,
      hostProfile: null,
      recommendedFamilies: null,
      events: null,
      todos: null,
      hostStats: null
    })
  }
}))
