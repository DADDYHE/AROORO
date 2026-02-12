/**
 * 小程序入口文件
 * 集成了身份隔离功能，支持一个账号下两个身份的完全隔离
 *
 * 参考文档：
 * - 微信小程序官方文档：https://developers.weixin.qq.com/miniprogram/dev/framework/
 * - 微信云开发官方文档：https://developers.weixin.qq.com/miniprogram/dev/wxcloud/basis/getting-started.html
 * - 腾讯云IM官方文档：https://cloud.tencent.com/document/product/269/1502
 */

// 关键：在全局作用域最开始就初始化全局a变量和wx.a
// 这是为了避免TUI-Messages子包在评估阶段报错：'undefined is not an object (evaluating 'a.functions')'
// 必须在任何其他代码执行前设置，因为子包可能在主app.js的onLaunch之前就开始加载和评估

// 方案1：在全局作用域直接定义a变量（必须在文件最开始，任何require之前执行）
// 这样即使在wx对象不存在的情况下，a.functions也不会报错
// 注意：必须在任何导入语句之前执行，确保在任何模块加载之前，a变量就已经存在

// 直接在全局作用域定义a变量，使用立即执行函数确保在任何情况下都能执行
(function() {
  // 先定义全局a变量（如果未定义）
  if (typeof a === 'undefined') {
    // 在小程序环境中，直接定义在全局作用域
    a = {};
  }
  
  // 确保 a.functions 存在
  if (!a.functions) {
    a.functions = {};
  }
  
  // 额外初始化一些可能需要的属性
  if (!a.functions.getAuthCode) {
    a.functions.getAuthCode = function() { return Promise.resolve(''); };
  }
  
  // 额外初始化一些 TUI 组件可能需要的函数
  if (!a.functions.getImageInfo) {
    a.functions.getImageInfo = function(options) {
      return wx.getImageInfo(options);
    };
  }
  
  if (!a.functions.showToast) {
    a.functions.showToast = function(options) {
      return wx.showToast(options);
    };
  }
  
  if (!a.functions.hideToast) {
    a.functions.hideToast = function() {
      return wx.hideToast();
    };
  }
  
  if (!a.functions.showLoading) {
    a.functions.showLoading = function(options) {
      return wx.showLoading(options);
    };
  }
  
  if (!a.functions.hideLoading) {
    a.functions.hideLoading = function() {
      return wx.hideLoading();
    };
  }
})();

console.log('APP_GLOBAL: 全局a.functions 已初始化');

// 方案2：同时初始化wx.a
// 使用立即执行函数确保在文件加载时就执行
(function() {
  try {
    // 确保wx对象存在
    if (typeof wx !== 'undefined') {
      // 初始化wx.a
      if (!wx.a) {
        wx.a = {};
      }
      if (!wx.a.functions) {
        wx.a.functions = {};
      }
      // 额外初始化一些可能需要的属性
      if (!wx.a.functions.getAuthCode) {
        wx.a.functions.getAuthCode = function() { return Promise.resolve(''); };
      }
    }
  } catch (error) {
    // 静默处理初始化错误，避免阻塞应用启动
  }
})();

// 关键：在全局作用域尽早初始化 TUICore 和 chat-uikit-engine
// 这样可以确保子包加载时这些模块已经被初始化
try {
  const TUICore = require('@tencentcloud/tui-core');
  if (!TUICore.functions) {
    TUICore.functions = {};
  }
  if (!wx.$TUICore) {
    wx.$TUICore = TUICore;
  }
} catch (error) {
  // 静默处理初始化错误
}

try {
  const TUIChatEngine = require('@tencentcloud/chat-uikit-engine');
  if (!TUIChatEngine.functions) {
    TUIChatEngine.functions = {};
  }
  if (!wx.$TUIChatEngine) {
    wx.$TUIChatEngine = TUIChatEngine;
  }
} catch (error) {
  // 静默处理初始化错误
}

// 最先执行：拦截 console.warn，过滤 getSystemInfoSync 的弃用警告
const originalConsoleWarn = console.warn
console.warn = function(...args) {
  const message = args.join(' ')
  // 过滤掉 getSystemInfoSync 的弃用警告
  if (message.includes('getSystemInfoSync') && message.includes('deprecated')) {
    return
  }
  originalConsoleWarn.apply(console, args)
}

// 最先执行：重写 wx.getSystemInfoSync() 函数，优先使用新的 API
// 必须在任何其他代码之前，防止其他模块调用时触发deprecation警告
const originalGetSystemInfoSync = wx.getSystemInfoSync
wx.getSystemInfoSync = function () {
  try {
    // 优先使用新 API
    const deviceInfoResult = wx.getDeviceInfo()
    const windowInfoResult = wx.getWindowInfo()
    const appInfoResult = wx.getAppBaseInfo()

    // 构建兼容的数据结构，确保返回的数据格式与旧 API 一致
    const systemInfo = {
      // 设备信息
      deviceBrand: deviceInfoResult.deviceBrand,
      deviceModel: deviceInfoResult.deviceModel,
      system: deviceInfoResult.system,
      platform: deviceInfoResult.platform,

      // 窗口信息
      windowWidth: windowInfoResult.windowWidth,
      windowHeight: windowInfoResult.windowHeight,
      pixelRatio: windowInfoResult.pixelRatio,
      screenWidth: windowInfoResult.screenWidth,
      screenHeight: windowInfoResult.screenHeight,

      // 应用信息
      appVersion: appInfoResult.appVersion,
      SDKVersion: appInfoResult.SDKVersion,
      language: appInfoResult.language,

      // 其他可能需要的字段
      benchmarkLevel: 1,
      batteryLevel: 100,
      networkType: 'wifi',
      storage: '',
      fontSizeSetting: 16,
      locationAuthorized: true,
      bluetoothEnabled: true,
      locationEnabled: true,
      wifiEnabled: true,
      safeArea: {
        left: 0,
        right: windowInfoResult.windowWidth,
        top: 0,
        bottom: windowInfoResult.windowHeight,
        width: windowInfoResult.windowWidth,
        height: windowInfoResult.windowHeight,
      },
    }

    // 添加标记，表示已经使用新 API
    systemInfo.__usingNewApi__ = true

    return systemInfo
  } catch (error) {
    // 降级使用旧 API
    console.warn('使用新 API 获取设备信息失败，降级使用旧 API:', error)
    return originalGetSystemInfoSync()
  }
}

// 防止多次重写
if (!wx.getSystemInfoSync.__patched__) {
  wx.getSystemInfoSync.__patched__ = true
}

// 导入错误处理模块
const { errorHandler } = require('./utils/errorHandler')
// 导入模块管理器
const { moduleManager } = require('./utils/moduleManager')
// 导入身份上下文管理模块
const { identityContextManager } = require('./utils/identityContextManager')
// 导入存储管理模块
const StorageManager = require('./utils/storageManager')
// 导入权限管理模块
const { permissionManager } = require('./utils/permissionManager')
// 导入动画管理模块
const { animationManager } = require('./utils/animationManager')
// 导入状态管理模块
const { stateManager } = require('./utils/stateManager')
// 导入标准登录模块
import AuthModule from './src/modules/auth/index.js'
// 导入请求缓存管理器
const { requestCacheManager } = require('./utils/requestCacheManager')
// 导入性能监控工具
const { performanceMonitor } = require('./utils/performanceMonitor')
// 导入安全管理器
const { securityManager } = require('./utils/securityManager')
// 导入监控管理器
const { monitoringManager } = require('./utils/monitoringManager')
// 导入ID生成工具
const { generateIMUserId } = require('./utils/idGenerator')
// 导入IM用户ID验证器
const { generateFormat1UserID } = require('./utils/imUserIdValidator')
// 导入离线推送配置
const offlinePushConfig = require('./utils/offlinePushConfig')
// 导入IM用户资料管理器
const imProfileManager = require('./utils/im-profile-manager')

App({
  globalData: {
    envId: 'cloud1-8gvqhsiga3011047',
    appId: 'wxc5b705cab9ba29e7',
    userInfo: null,
    offlinePushConfig: offlinePushConfig, // 离线推送配置
    userRole: null,
    ownerInfo: null,
    hostInfo: null,
    currentRole: null,
    currentProfile: null,
    user: null,
    roles: null,
    imManager: null,
    client: null,
    models: null,
    identityContextManager: null,
    storageManager: null,
    permissionManager: null,
    animationManager: null,
    stateManager: null,
    loginManager: null,
    requestCacheManager: null,
    performanceMonitor: null,
    securityManager: null,
    errorHandler: null,
    moduleManager: null,
    monitoringManager: null,
    imProfileManager: null, // IM用户资料管理器
    isLogout: false,
    imInitialized: false, // IM初始化状态
    identitySystemInitialized: false, // 身份系统初始化状态
    // 宠物主人身份的数据
    ownerData: {
      selectedDates: {},
      selectedPets: [],
      bookingRequirements: {},
      petFormData: {},
    },
    // 寄养家庭身份的数据
    hostData: {
      selectedDates: {},
      selectedPets: [],
      bookingRequirements: {},
      petFormData: {},
    },
    showSelectSuccess: false, // 用于控制是否显示选择成功的反馈
  },

  onLaunch() {
    // 初始化事件监听器
    this.initEventListeners();
    
    // 初始化全局函数，保留原有的globalData配置
    this.globalData = {
      ...this.globalData,
      functions: {
        formatTime: (timestamp) => {
          const date = new Date(timestamp * 1000);
          const hours = date.getHours().toString().padStart(2, '0');
          const minutes = date.getMinutes().toString().padStart(2, '0');
          return `${hours}:${minutes}`;
        },
        // 其他全局函数
      }
    };
    
    // 确保getApp()返回的是当前App实例
    if (typeof getApp === 'function') {
      try {
        const appInstance = getApp();
        if (appInstance) {
          appInstance.functions = this.globalData.functions;
        }
      } catch (error) {
        // 静默处理错误，避免阻塞应用启动
      }
    }
    
    // 挂载到wx全局对象
    if (typeof wx === 'object' && wx !== null) {
      wx.functions = this.globalData.functions;
    }
    
    console.log('APP: 全局functions已初始化并暴露');
    console.log('APP: 事件监听器已初始化');


    // 初始化云开发环境（仅用于云函数调用）
    if (typeof wx === 'object' && wx !== null && typeof wx.cloud === 'object' && wx.cloud !== null) {
      if (!this.globalData.envId) {
        console.error('envId 未配置')
        return
      }

      wx.cloud.init({
        traceUser: true,
        env: this.globalData.envId,
      })

      // 初始化云开发数据模型SDK
      const cloudbasePath = require('./miniprogram_npm/@cloudbase/wx-cloud-client-sdk/index.js')
      const { init } = cloudbasePath
      this.globalData.client = init(wx.cloud, {
        env: this.globalData.envId,
      })
      this.globalData.models = this.globalData.client.models // 数据模型API
    } else {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
    }

    // 初始化身份管理器
    this.initIdentityContextManager()

    // 初始化存储管理器
    this.initStorageManager()

    // 初始化权限管理器
    this.initPermissionManager()

    // 初始化动画管理器
    this.initAnimationManager()
    
    // 初始化状态管理器
    this.initStateManager()
    
    // 初始化登录管理器
    this.initLoginManager()
    
    // 初始化请求缓存管理器
    this.initRequestCacheManager()
    
    // 初始化性能监控工具
    this.initPerformanceMonitor()
    
    // 初始化错误处理模块
    this.initErrorHandler()
    
    // 初始化安全管理器
    this.initSecurityManager()
    
    // 初始化监控管理器
    this.initMonitoringManager()

    // 初始化模块管理器
    this.initModuleManager()

    // 初始化IM用户资料管理器
    this.initIMProfileManager()

    // 从本地存储获取用户信息和退出状态
    try {
      const logoutStatus = wx.getStorageSync('isLogout')
      if (logoutStatus) {
        this.globalData.isLogout = true
      } else {
        // 使用统一存储管理器获取用户信息，确保使用正确的键前缀
        const { getStorageManager } = require('./src/modules/auth/StorageManager')
        const storageManager = getStorageManager()
        
        const storedUserInfo = storageManager.getUserInfo()
        const storedUserRole = storageManager.getUserRole()
        const storedOwnerInfo = storageManager.getOwnerInfo()
        const storedHostInfo = storageManager.getHostInfo()
        const storedUserSig = storageManager.get('userSig', '')
        const loginExpiry = storageManager.getLoginExpiry()

        if (storedUserInfo && (storedUserInfo._id || storedUserInfo.openid)) {
          // 本地存储有有效的用户信息，直接使用
          this.globalData.userInfo = storedUserInfo
          this.globalData.userRole = storedUserRole || 'owner'
          console.log('从StorageManager恢复用户信息:', storedUserInfo)
          console.log('登录过期时间:', loginExpiry ? new Date(loginExpiry).toLocaleString('zh-CN') : '未设置')
        }

        // 恢复两个身份的独立信息
        if (storedOwnerInfo && (storedOwnerInfo._id || storedOwnerInfo.openid)) {
          this.globalData.ownerInfo = storedOwnerInfo

          // 将恢复的身份信息添加到身份上下文管理器
          // 生成正确格式的IM用户ID
          const ownerOpenid = storedOwnerInfo.openid || storedUserInfo.openid || ''
          const ownerImUserId = generateFormat1UserID(ownerOpenid, 'owner')
          
          this.globalData.identityContextManager.addContext('owner', {
            roleId: generateIMUserId('owner', ownerOpenid),
            profile: storedOwnerInfo,
            storageInfo: {
              prefix: 'owner_',
            },
            imUserInfo: {
              userID: ownerImUserId,
              userSig: storedUserSig || '',
              isLoggedIn: false,
              lastLoginTime: null,
            },
          })
        }

        if (storedHostInfo && (storedHostInfo._id || storedHostInfo.openid)) {
          this.globalData.hostInfo = storedHostInfo

          // 将恢复的身份信息添加到身份上下文管理器
          // 生成正确格式的IM用户ID
          const hostOpenid = storedHostInfo.openid || storedUserInfo.openid || ''
          const hostImUserId = generateFormat1UserID(hostOpenid, 'host')
          
          this.globalData.identityContextManager.addContext('host', {
            roleId: generateIMUserId('host', hostOpenid),
            profile: storedHostInfo,
            storageInfo: {
              prefix: 'host_',
            },
            imUserInfo: {
              userID: hostImUserId,
              userSig: storedUserSig || '',
              isLoggedIn: false,
              lastLoginTime: null,
            },
          })
        }
        
        // 如果没有恢复到完整的身份信息，但有用户信息，创建默认的身份上下文
        if (storedUserInfo && (storedUserInfo._id || storedUserInfo.openid)) {
          // 检查是否已经添加了身份信息
          const identityManager = this.globalData.identityContextManager
          if (!identityManager.hasContext('owner')) {
            // 生成正确格式的IM用户ID
            const ownerOpenid = storedUserInfo.openid || ''
            const ownerImUserId = generateFormat1UserID(ownerOpenid, 'owner')
            
            // 创建默认的owner身份上下文
            identityManager.addContext('owner', {
              roleId: generateIMUserId('owner', ownerOpenid),
              profile: {
                ...storedUserInfo,
                ...(this.globalData.ownerInfo || {}),
                openid: storedUserInfo.openid,
                userId: storedUserInfo._id,
                ownerName: storedUserInfo.nickName || '宠物主人',
              },
              storageInfo: {
                prefix: 'owner_',
              },
              imUserInfo: {
                userID: ownerImUserId,
                userSig: storedUserSig || '',
                isLoggedIn: false,
                lastLoginTime: null,
              },
            })
          }
        }
      }
    } catch (error) {
      console.error('读取本地存储失败:', error)
    }

    // 初始化腾讯云IM服务
    this.initIMService()

    // 初始化身份管理系统
    this.initIdentitySystem()
    
    // 验证并修复身份一致性
    this.validateAndFixIdentityConsistency()
  },

  /**
   * 初始化身份上下文管理器
   */
  initIdentityContextManager() {
    this.globalData.identityContextManager = identityContextManager
  },

  /**
   * 初始化存储管理器
   */
  initStorageManager() {
    this.globalData.storageManager = new StorageManager(this.globalData.identityContextManager)
  },

  /**
   * 初始化权限管理器
   */
  initPermissionManager() {
    this.globalData.permissionManager = permissionManager
  },

  /**
   * 初始化动画管理器
   */
  initAnimationManager() {
    this.globalData.animationManager = animationManager
  },

  /**
   * 初始化状态管理器
   */
  initStateManager() {
    console.log('APP: 初始化状态管理器');
    this.globalData.stateManager = stateManager
    // 初始化状态管理器
    stateManager.init();
    console.log('APP: 状态管理器初始化完成');
  },

  /**
   * 初始化登录管理器
   */
  initLoginManager() {
    // 初始化标准登录模块
    AuthModule.init(this)
    this.globalData.loginManager = AuthModule
  },

  /**
   * 初始化请求缓存管理器
   */
  initRequestCacheManager() {
    this.globalData.requestCacheManager = requestCacheManager
  },

  /**
   * 初始化性能监控工具
   */
  initPerformanceMonitor() {
    this.globalData.performanceMonitor = performanceMonitor
    // 启动性能监控
    performanceMonitor.startMonitoring()
  },

  /**
   * 初始化安全管理器
   */
  initSecurityManager() {
    this.globalData.securityManager = securityManager
  },

  /**
   * 初始化错误处理模块
   */
  initErrorHandler() {
    this.globalData.errorHandler = errorHandler
    errorHandler.initGlobalErrorHandler()
  },

  /**
   * 初始化监控管理器
   */
  initMonitoringManager() {
    this.globalData.monitoringManager = monitoringManager
    // 初始化监控管理器
    monitoringManager.init()
  },

  /**
   * 初始化模块管理器
   */
  initModuleManager() {
    this.globalData.moduleManager = moduleManager

    // 注册模块
    moduleManager.registerModule('errorHandler', errorHandler, [])
    moduleManager.registerModule('stateManager', stateManager, ['errorHandler'])
    moduleManager.registerModule('securityManager', securityManager, ['errorHandler'])
    moduleManager.registerModule('requestCacheManager', requestCacheManager, ['errorHandler'])
    moduleManager.registerModule('performanceMonitor', performanceMonitor, ['errorHandler'])
    moduleManager.registerModule('monitoringManager', monitoringManager, ['errorHandler'])
    moduleManager.registerModule('loginManager', this.globalData.loginManager, ['errorHandler', 'securityManager'])
    moduleManager.registerModule('identityContextManager', identityContextManager, ['errorHandler'])

    // 初始化所有模块
    moduleManager.initAllModules()
  },

  /**
   * 初始化IM用户资料管理器
   */
  initIMProfileManager() {
    console.log('APP: 初始化IM用户资料管理器');
    this.globalData.imProfileManager = imProfileManager
    // 资料管理器在导入时已经初始化
    console.log('APP: IM用户资料管理器初始化完成');
  },



  /**
   * 初始化事件监听器存储
   */
  initEventListeners() {
    if (!this.eventListeners) {
      this.eventListeners = {
        // 身份相关事件
        roleChanged: [],
        identitySystemInitialized: [],
        identitySwitchStart: [],
        identitySwitchComplete: [],
        loginStatusChanged: [],
        logoutComplete: []
      }
    }
  },

  /**
   * 触发自定义事件
   * @param {string} eventName - 事件名称
   * @param {object} detail - 事件详情
   */
  triggerEvent(eventName, detail = {}) {
    // 确保事件监听器存储已初始化
    if (!this.eventListeners) {
      this.initEventListeners()
    }
    
    if (this.eventListeners[eventName]) {
      console.log(`触发事件 ${eventName}:`, detail)
      this.eventListeners[eventName].forEach(callback => {
        try {
          callback(detail)
        } catch (error) {
          console.error(`触发事件 ${eventName} 失败:`, error)
        }
      })
    } else {
      console.warn(`事件 ${eventName} 没有监听器`)
    }
  },

  /**
   * 监听自定义事件
   * @param {string} eventName - 事件名称
   * @param {function} callback - 回调函数
   */
  on(eventName, callback) {
    // 确保事件监听器存储已初始化
    if (!this.eventListeners) {
      this.initEventListeners()
    }
    
    if (!this.eventListeners[eventName]) {
      this.eventListeners[eventName] = []
    }
    this.eventListeners[eventName].push(callback)
    console.log(`添加事件监听器 ${eventName}，当前监听器数量:`, this.eventListeners[eventName].length)
  },

  /**
   * 移除自定义事件监听
   * @param {string} eventName - 事件名称
   * @param {function} [callback] - 回调函数（可选，不提供则移除所有该事件的监听）
   */
  off(eventName, callback) {
    if (this.eventListeners && this.eventListeners[eventName]) {
      if (callback) {
        const originalLength = this.eventListeners[eventName].length
        this.eventListeners[eventName] = this.eventListeners[eventName].filter(
          cb => cb !== callback
        )
        console.log(`移除事件监听器 ${eventName}，监听器数量从 ${originalLength} 减少到 ${this.eventListeners[eventName].length}`)
      } else {
        console.log(`移除所有事件监听器 ${eventName}`)
        delete this.eventListeners[eventName]
      }
    }
  },

  /**
   * 获取事件监听器数量
   * @param {string} eventName - 事件名称
   * @returns {number} 监听器数量
   */
  getEventListenerCount(eventName) {
    if (this.eventListeners && this.eventListeners[eventName]) {
      return this.eventListeners[eventName].length
    }
    return 0
  },

  /**
   * 初始化身份管理系统
   */
  async initIdentitySystem() {
    const ErrorHandler = require('./utils/errorHandler')
    try {
      // 检查是否是用户主动退出登录
      if (this.globalData.isLogout) {
        return
      }

      // 检查用户是否已经授权登录
      // 只有在用户已经登录或者有本地存储的用户信息时才调用云函数
      const hasLocalUserInfo = this.globalData.userInfo && this.globalData.userInfo._id
      const hasLocalUser = this.globalData.user && this.globalData.user._id
      
      console.log('APP initIdentitySystem - 检查用户登录状态:')
      console.log('  hasLocalUserInfo:', hasLocalUserInfo)
      console.log('  hasLocalUser:', hasLocalUser)
      
      // 如果用户未登录且没有本地存储的用户信息，跳过身份系统初始化
      if (!hasLocalUserInfo && !hasLocalUser) {
        console.log('APP initIdentitySystem - 用户未登录且无本地用户信息，跳过身份系统初始化')
        return
      }

      // 调用云函数获取身份信息
      const res = await wx.cloud.callFunction({
        name: 'getUserIdentity',
      })

      if (res.result && res.result.code === 0) {
        const { user, roles, currentRole, currentProfile } = res.result.data
        this.globalData.user = user
        this.globalData.roles = roles
        this.globalData.currentRole = currentRole
        this.globalData.currentProfile = currentProfile
        this.globalData.userRole = currentRole.roleType // 保持向后兼容

        // 更新globalData.userInfo，确保包含avatarUrl
        if (user) {
          // 优先使用云函数返回的用户信息，特别是avatarUrl字段
          this.globalData.userInfo = {
            ...this.globalData.userInfo,
            _id: user._id,
            openid: user.openid,
            avatarUrl: user.avatarUrl || '',
            nickName: user.nickName || '',
            role: currentRole.roleType
          }
        }

        // 保存当前角色的完整profile
        if (currentProfile) {
          console.log('APP initIdentitySystem - 保存当前角色的完整profile:', currentRole.roleType, currentProfile)
          if (currentRole.roleType === 'host') {
            // 验证 avatarUrl，如果是 user-avatars 则警告并尝试修复
            if (currentProfile.avatarUrl && currentProfile.avatarUrl.includes('user-avatars')) {
              console.warn('警告：hostProfile.avatarUrl 包含 user-avatars，可能不是正确的寄养家庭头像！')
              console.warn('尝试从 hostAvatars 目录获取正确的寄养家庭头像...')
              // 这里可以添加逻辑从hostAvatars目录获取头像
            }
            // 确保hostProfile.avatarUrl是云开发标准路径格式
            if (currentProfile.avatarUrl && !currentProfile.avatarUrl.startsWith('cloud://')) {
              console.warn('hostProfile.avatarUrl 不是云开发标准路径格式，使用默认头像')
              currentProfile.avatarUrl = '/images/default-avatar.svg'
            }
            // 确保hostInfo包含必要的字段
            if (!currentProfile._id) {
              currentProfile._id = `host_${Date.now()}`
            }
            if (!currentProfile.openid) {
              currentProfile.openid = user.openid
            }
            this.globalData.hostInfo = currentProfile
            console.log('APP initIdentitySystem - 已更新hostInfo:', this.globalData.hostInfo)
          } else if (currentRole.roleType === 'owner') {
            // 确保ownerProfile.avatarUrl是云开发标准路径格式
            if (currentProfile.avatarUrl && !currentProfile.avatarUrl.startsWith('cloud://')) {
              console.warn('ownerProfile.avatarUrl 不是云开发标准路径格式，使用user.avatarUrl或默认头像')
              if (user.avatarUrl && user.avatarUrl.startsWith('cloud://')) {
                console.warn('使用user.avatarUrl替换:', user.avatarUrl)
                currentProfile.avatarUrl = user.avatarUrl
              } else {
                console.warn('使用默认头像替换')
                currentProfile.avatarUrl = '/images/default-avatar.svg'
              }
            }
            this.globalData.ownerInfo = currentProfile
            console.log('APP initIdentitySystem - 已更新ownerInfo:', this.globalData.ownerInfo)
          }
        }

        // 从roles数组中提取owner和host身份信息，并添加到身份上下文管理器
        if (roles && Array.isArray(roles)) {
          roles.forEach(role => {
            // 为每个身份创建完整的imUserInfo
            const imUserID = generateIMUserId(role.roleType, user.openid);
            const imUserInfo = {
              userID: imUserID,
              userSig: '',
              isLoggedIn: false,
              lastLoginTime: null,
            }

            // 使用已保存的profile（currentProfile）或创建临时profile
            let profile
            if (role.roleType === currentRole.roleType && currentProfile) {
              profile = currentProfile
              // 只在 avatarUrl 为空时才使用 user.avatarUrl，避免覆盖正确的头像
              if (!profile.avatarUrl && user.avatarUrl) {
                console.warn('当前角色的avatarUrl为空，使用user.avatarUrl:', user.avatarUrl)
                console.warn('角色类型:', role.roleType, '当前角色:', currentRole.roleType)
                // 确保使用云开发标准路径格式
                if (user.avatarUrl && user.avatarUrl.startsWith('cloud://')) {
                  profile.avatarUrl = user.avatarUrl
                } else {
                  console.warn('user.avatarUrl 不是云开发标准路径格式，使用默认头像')
                  profile.avatarUrl = '/images/default-avatar.svg'
                }
              } else if (profile.avatarUrl && !profile.avatarUrl.startsWith('cloud://')) {
                // 确保已有的avatarUrl是云开发标准路径格式
                console.warn('检测到非云开发标准路径格式的avatarUrl:', profile.avatarUrl)
                if (user.avatarUrl && user.avatarUrl.startsWith('cloud://')) {
                  console.warn('使用user.avatarUrl替换:', user.avatarUrl)
                  profile.avatarUrl = user.avatarUrl
                } else {
                  console.warn('使用默认头像替换')
                  profile.avatarUrl = '/images/default-avatar.svg'
                }
              }
            } else {
              // 确保使用云开发标准路径格式
              let avatarUrl = ''
              if (user.avatarUrl && user.avatarUrl.startsWith('cloud://')) {
                avatarUrl = user.avatarUrl
              } else {
                avatarUrl = '/images/default-avatar.svg'
              }
              
              // 创建profile，优先使用user.avatarUrl
              profile = {
                _id: role.profileId || `temp_profile_${Date.now()}`,
                openid: user.openid,
                userId: user._id,
                ownerName: role.roleType === 'owner' ? '宠物主人' : '寄养家庭',
                avatarUrl: avatarUrl,
                createdAt: new Date(),
                updatedAt: new Date(),
                // 合并role.profile中的其他字段，但不覆盖avatarUrl
                ...(({ avatarUrl, ...rest }) => rest)(role.profile || {})
              }
              
              // 再次确保最终的avatarUrl是云开发标准路径格式
              if (!profile.avatarUrl || !profile.avatarUrl.startsWith('cloud://')) {
                if (user.avatarUrl && user.avatarUrl.startsWith('cloud://')) {
                  console.warn('role.profile.avatarUrl 不是云开发标准路径格式，使用user.avatarUrl:', user.avatarUrl)
                  profile.avatarUrl = user.avatarUrl
                } else {
                  console.warn('role.profile.avatarUrl 和 user.avatarUrl 都不是云开发标准路径格式，使用默认头像')
                  profile.avatarUrl = '/images/default-avatar.svg'
                }
              }
            }

            if (role.roleType === 'owner') {
              // 确保ownerInfo使用云开发标准路径格式的头像
              if (profile.avatarUrl && profile.avatarUrl.startsWith('cloud://')) {
                // 如果还没有保存ownerInfo，使用这个profile
                if (!this.globalData.ownerInfo) {
                  this.globalData.ownerInfo = profile
                } else {
                  // 更新已有ownerInfo的avatarUrl
                  this.globalData.ownerInfo.avatarUrl = profile.avatarUrl
                }
              } else if (user.avatarUrl && user.avatarUrl.startsWith('cloud://')) {
                // 如果profile.avatarUrl不是云开发标准路径格式，但user.avatarUrl是，使用user.avatarUrl
                console.warn('owner profile.avatarUrl 不是云开发标准路径格式，使用user.avatarUrl:', user.avatarUrl)
                profile.avatarUrl = user.avatarUrl
                if (!this.globalData.ownerInfo) {
                  this.globalData.ownerInfo = profile
                } else {
                  this.globalData.ownerInfo.avatarUrl = profile.avatarUrl
                }
              } else {
                // 如果两者都不是云开发标准路径格式，使用默认头像
                console.warn('owner profile.avatarUrl 和 user.avatarUrl 都不是云开发标准路径格式，使用默认头像')
                profile.avatarUrl = '/images/default-avatar.svg'
                if (!this.globalData.ownerInfo) {
                  this.globalData.ownerInfo = profile
                } else {
                  this.globalData.ownerInfo.avatarUrl = profile.avatarUrl
                }
              }

              // 添加到身份上下文管理器
              this.globalData.identityContextManager.addContext('owner', {
                roleId: role._id || generateIMUserId('owner', role.openid || Date.now()),
                profile: profile,
                storageInfo: {
                  prefix: 'owner_',
                },
                imUserInfo: imUserInfo,
              })
            } else if (role.roleType === 'host') {
              // 总是使用云函数返回的最新数据更新hostInfo
              // 确保hostInfo使用云开发标准路径格式的头像
              if (profile.avatarUrl && !profile.avatarUrl.startsWith('cloud://')) {
                console.warn('hostProfile.avatarUrl 不是云开发标准路径格式，使用默认头像')
                profile.avatarUrl = '/images/default-avatar.svg'
              }
              // 确保hostInfo包含必要的字段
              if (!profile._id) {
                profile._id = `host_${Date.now()}`
              }
              if (!profile.openid) {
                profile.openid = user.openid
              }
              console.log('APP initIdentitySystem - 更新hostInfo:', profile)
              this.globalData.hostInfo = profile

              // 添加到身份上下文管理器
              this.globalData.identityContextManager.addContext('host', {
                roleId: role._id || `host_${Date.now()}`,
                profile: profile,
                storageInfo: {
                  prefix: 'host_',
                },
                imUserInfo: imUserInfo,
              })
              console.log('APP initIdentitySystem - 已添加host身份到身份上下文管理器')
            }
          })
        }

        // 切换到当前身份
        if (currentRole && currentRole.roleType) {
          this.globalData.identityContextManager.switchContext(currentRole.roleType)
        }

        // 设置初始化完成标志
        this.globalData.identitySystemInitialized = true
        // 触发身份系统初始化完成事件
        this.triggerEvent('identitySystemInitialized')
      } else if (res.result && res.result.code === -1) {
        // 云函数执行失败，使用临时身份信息
        console.warn('getUserIdentity云函数执行失败，使用临时身份信息:', res.result.error)

        // 创建临时身份信息
        const tempUser = {
          _id: `temp_user_${Date.now()}`,
          openid:
            (this.globalData.userInfo && this.globalData.userInfo.openid) ||
            `temp_openid_${Date.now()}`,
          createdAt: new Date(),
        }

        // 确保使用云开发标准路径格式
        let tempAvatarUrl = ''
        if (this.globalData.userInfo && this.globalData.userInfo.avatarUrl && this.globalData.userInfo.avatarUrl.startsWith('cloud://')) {
          tempAvatarUrl = this.globalData.userInfo.avatarUrl
        } else {
          tempAvatarUrl = '/images/default-avatar.svg'
        }
        
        const tempRole = {
          _id: `temp_role_${Date.now()}`,
          userId: tempUser._id,
          openid: tempUser.openid,
          roleType: 'owner',
          profileId: `temp_profile_${Date.now()}`,
          isActive: true,
          createdAt: new Date(),
          profile: {
              _id: `temp_profile_${Date.now()}`,
              openid: tempUser.openid,
              userId: tempUser._id,
              ownerName: '宠物主人',
              avatarUrl: tempAvatarUrl,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
        }

        // 更新全局数据
        this.globalData.user = tempUser
        this.globalData.roles = [tempRole]
        this.globalData.currentRole = tempRole
        this.globalData.currentProfile = tempRole.profile
        this.globalData.userRole = tempRole.roleType
        this.globalData.ownerInfo = tempRole.profile

        // 添加到身份上下文管理器
        const tempImUserID = generateFormat1UserID(tempUser.openid, 'owner');
        this.globalData.identityContextManager.addContext('owner', {
          roleId: tempRole._id,
          profile: tempRole.profile,
          storageInfo: {
            prefix: 'owner_',
          },
          imUserInfo: {
            userID: tempImUserID,
            userSig: '',
            isLoggedIn: false,
            lastLoginTime: null,
          },
        })

        // 切换到临时身份
        this.globalData.identityContextManager.switchContext('owner')
        // 设置初始化完成标志
        this.globalData.identitySystemInitialized = true
        // 触发身份系统初始化完成事件
        this.triggerEvent('identitySystemInitialized')
      } else {
        console.error('getUserIdentity云函数返回结果无效:', res.result)
      }
    } catch (error) {
      console.error('初始化身份管理系统失败:', error)

      // 创建临时身份信息
      const tempUser = {
        _id: `temp_user_${Date.now()}`,
        openid:
          (this.globalData.userInfo && this.globalData.userInfo.openid) ||
          `temp_openid_${Date.now()}`,
        createdAt: new Date(),
      }

      // 确保使用云开发标准路径格式
        let tempAvatarUrl = ''
        if (this.globalData.userInfo && this.globalData.userInfo.avatarUrl && this.globalData.userInfo.avatarUrl.startsWith('cloud://')) {
          tempAvatarUrl = this.globalData.userInfo.avatarUrl
        } else {
          tempAvatarUrl = '/images/default-avatar.svg'
        }
        
        const tempRole = {
          _id: `temp_role_${Date.now()}`,
          userId: tempUser._id,
          openid: tempUser.openid,
          roleType: 'owner',
          profileId: `temp_profile_${Date.now()}`,
          isActive: true,
          createdAt: new Date(),
          profile: {
              _id: `temp_profile_${Date.now()}`,
              openid: tempUser.openid,
              userId: tempUser._id,
              ownerName: '宠物主人',
              avatarUrl: tempAvatarUrl,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
        }

      // 更新全局数据
      this.globalData.user = tempUser
      this.globalData.roles = [tempRole]
      this.globalData.currentRole = tempRole
      this.globalData.currentProfile = tempRole.profile
      this.globalData.userRole = tempRole.roleType
      this.globalData.ownerInfo = tempRole.profile

      // 添加到身份上下文管理器
      const tempImUserID = generateFormat1UserID(tempUser.openid, 'owner');
      this.globalData.identityContextManager.addContext('owner', {
        roleId: tempRole._id,
        profile: tempRole.profile,
        storageInfo: {
          prefix: 'owner_',
        },
        imUserInfo: {
          userID: tempImUserID,
          userSig: '',
          isLoggedIn: false,
          lastLoginTime: null,
        },
      })

      // 切换到临时身份
      this.globalData.identityContextManager.switchContext('owner')

      // 设置初始化完成标志
      this.globalData.identitySystemInitialized = true
      // 触发身份系统初始化完成事件
      this.triggerEvent('identitySystemInitialized')
    }
  },

  /**
   * 切换身份（使用 CentralIdentityManager）
   */
  async switchRole(targetRoleType) {
    const startTime = Date.now()
    console.log('APP switchRole - 开始切换身份:', {
      targetRoleType,
      currentRole: this.globalData.currentRole,
      currentTime: new Date().toISOString()
    })

    try {
      // 验证身份类型
      if (!['owner', 'host'].includes(targetRoleType)) {
        console.error('切换身份失败：无效的身份类型')
        return { success: false, message: '无效的身份类型' }
      }

      // 检查目标身份是否存在
      if (targetRoleType === 'host' && (!this.globalData.hostInfo || !Object.keys(this.globalData.hostInfo).length)) {
        console.error('切换身份失败：寄养家庭身份不存在')
        return { success: false, message: '寄养家庭身份不存在' }
      }

      // 使用新的身份选择云函数（集成 CentralIdentityManager）
      console.log('APP switchRole - 调用登录云函数选择身份:', targetRoleType)
      const res = await wx.cloud.callFunction({
        name: 'login',
        data: {
          selectRole: true,
          openid: this.globalData.userInfo.openid,
          roleType: targetRoleType
        },
      })

      console.log('APP switchRole - 云函数返回结果:', res)

      if (res.result.code === 0) {
        // 触发身份切换开始事件
        this.triggerEvent('identitySwitchStart', { targetRoleType })

        // 处理currentProfile中的avatarUrl
        let currentProfile = res.result.data.currentProfile
        console.log('APP switchRole - 处理currentProfile:', currentProfile)
        if (currentProfile.avatarUrl && !currentProfile.avatarUrl.startsWith('cloud://')) {
          console.warn('检测到非fileID的avatarUrl:', currentProfile.avatarUrl)
          // 对于寄养家庭身份，不要使用宠物主人的头像
          if (targetRoleType === 'host') {
            console.warn('寄养家庭身份使用了非fileID的avatarUrl，设置为默认头像')
            currentProfile.avatarUrl = '/images/default-avatar.svg'
          } else if (this.globalData.ownerInfo && this.globalData.ownerInfo.avatarUrl && this.globalData.ownerInfo.avatarUrl.startsWith('cloud://')) {
            // 对于宠物主人身份，使用ownerInfo.avatarUrl（确保是云开发标准路径格式）
            currentProfile.avatarUrl = this.globalData.ownerInfo.avatarUrl
          } else {
            console.warn('宠物主人信息中没有有效的avatarUrl fileID，使用默认头像')
            currentProfile.avatarUrl = '/images/default-avatar.svg'
          }
        } else if (!currentProfile.avatarUrl) {
          // 头像URL为空时，确保使用云开发标准路径格式
          if (targetRoleType === 'owner' && this.globalData.ownerInfo && this.globalData.ownerInfo.avatarUrl && this.globalData.ownerInfo.avatarUrl.startsWith('cloud://')) {
            console.warn('宠物主人的avatarUrl为空，使用ownerInfo中的云存储头像')
            currentProfile.avatarUrl = this.globalData.ownerInfo.avatarUrl
          } else if (targetRoleType === 'host' && this.globalData.hostInfo && this.globalData.hostInfo.avatarUrl && this.globalData.hostInfo.avatarUrl.startsWith('cloud://')) {
            console.warn('寄养家庭的avatarUrl为空，使用hostInfo中的云存储头像')
            currentProfile.avatarUrl = this.globalData.hostInfo.avatarUrl
          } else {
            console.warn('对应身份信息中没有有效的avatarUrl fileID，使用默认头像')
            currentProfile.avatarUrl = '/images/default-avatar.svg'
          }
        }

        // 确保currentProfile包含必要的字段
        if (!currentProfile._id) {
          currentProfile._id = `${targetRoleType}_${Date.now()}`
        }
        if (!currentProfile.openid) {
          currentProfile.openid = this.globalData.userInfo ? this.globalData.userInfo.openid : ''
        }

        // 更新全局状态
        console.log('APP switchRole - 更新全局状态:', targetRoleType)
        this.globalData.currentRole = res.result.data.currentRole
        this.globalData.currentProfile = currentProfile
        this.globalData.userRole = targetRoleType // 保持向后兼容

        // 根据目标身份类型更新对应的身份信息
        if (targetRoleType === 'owner') {
          this.globalData.ownerInfo = currentProfile
          console.log('APP switchRole - 已更新ownerInfo:', currentProfile)
        } else if (targetRoleType === 'host') {
          this.globalData.hostInfo = currentProfile
          console.log('APP switchRole - 已更新hostInfo:', currentProfile)
        }

        // 更新身份上下文管理器中的信息
        console.log('APP switchRole - 更新身份上下文管理器:', targetRoleType)
        this.globalData.identityContextManager.updateContext(targetRoleType, {
          profile: currentProfile,
          updatedAt: Date.now(),
        })

        // 切换到目标身份的上下文
        console.log('APP switchRole - 切换到目标身份的上下文:', targetRoleType)
        const switchResult = this.globalData.identityContextManager.switchContext(targetRoleType, {
          // 添加验证回调函数
          verifyCallback: roleType => {
            // 这里可以添加自定义验证逻辑
            // 例如：检查用户是否有权限切换到该身份
            console.log('APP switchRole - 验证身份切换权限:', roleType)
            return true
          },
          // 可以添加令牌验证（如果有）
          // token: 'your-auth-token'
        })

        if (!switchResult) {
          console.error('切换身份上下文失败:', targetRoleType)
          return { success: false, message: '切换身份上下文失败' }
        }

        // 切换IM用户账号
        console.log('APP switchRole - 切换IM用户账号:', targetRoleType)
        await this.switchIMAccount(targetRoleType)

        // 触发身份切换完成事件
        this.triggerEvent('identitySwitchComplete', { targetRoleType })

        const endTime = Date.now()
        console.log('APP switchRole - 身份切换成功:', {
          targetRoleType,
          responseTime: endTime - startTime,
          timestamp: new Date().toISOString()
        })

        return { success: true, message: '切换成功' }
      } else {
        console.error('身份切换失败:', res.result.message)
        return { success: false, message: res.result.message }
      }
    } catch (error) {
      console.error('切换身份失败:', error)
      const endTime = Date.now()
      console.log('APP switchRole - 身份切换失败:', {
        targetRoleType,
        error: error.message,
        responseTime: endTime - startTime,
        timestamp: new Date().toISOString()
      })
      return { success: false, message: '切换失败' }
    }
  },

  // 创建新身份
  async createNewRole(roleType, profileData) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'createNewRole',
        data: { roleType, profileData },
      })

      if (res.result.code === 1) {
        // 重新初始化身份系统，获取最新状态
        await this.initIdentitySystem()
        return { success: true, message: '创建成功' }
      } else {
        return { success: false, message: res.result.message }
      }
    } catch (error) {
      console.error('创建新身份失败:', error)
      return { success: false, message: '创建失败' }
    }
  },

  // 登录方法 - 使用标准登录模块
  login(options = {}) {
    return this.globalData.loginManager.login(options)
  },

  /**
   * 检查登录状态是否有效（统一方法）
   * @returns {boolean} 登录状态是否有效
   */
  checkLoginStatusValid() {
    if (!this.globalData.loginManager) {
      console.warn('[APP] loginManager未初始化')
      return false
    }
    return this.globalData.loginManager.checkLoginStatusValid()
  },

  /**
   * 获取登录状态（供页面使用）
   * @returns {boolean} 是否已登录
   */
  isLoggedIn() {
    // 检查退出状态
    if (this.globalData.isLogout) {
      return false
    }

    // 使用统一方法检查登录状态
    return this.checkLoginStatusValid()
  },

  /**
   * 自动处理登录过期
   * @returns {Promise<boolean>} 是否成功处理
   */
  async handleLoginExpiry() {
    return this.globalData.loginManager.handleLoginExpiry()
  },



  // 退出登录方法 - 使用标准登录模块
  logout(showConfirm = true) {
    return this.globalData.loginManager.logout(showConfirm)
  },

  /**
   * 初始化腾讯云IM服务
   * 使用统一的IM单例管理器
   */
  initIMService() {
    // 导入新的IM单例管理器
    const { imSingleton, IMState } = require('./utils/imSingleton')
    const { messageStorage } = require('./utils/messageStorage')

    // 检查 imSingleton 是否有效
    if (!imSingleton) {
      console.error('[APP] imSingleton 初始化失败')
      return
    }

    // 安全获取 SDK 实例
    const sdkInstance = imSingleton.getSDK()
    if (!sdkInstance) {
      console.error('[APP] 无法获取 IM SDK 实例')
      return
    }

    // 设置全局变量
    wx.$TUIKit = sdkInstance
    wx.$IMManager = imSingleton
    wx.$MessageStorage = messageStorage
    wx.$IMState = IMState

    console.log('[APP] 全局IM变量已设置:', {
      '$TUIKit': typeof wx.$TUIKit,
      'hasIsReady': typeof wx.$TUIKit?.isReady === 'function',
      '$IMManager': typeof wx.$IMManager,
      '$MessageStorage': typeof wx.$MessageStorage
    })

    // 兼容旧的全局变量
    wx.TencentCloudChat = require('@tencentcloud/chat')

    // 设置IM初始化完成标志
    this.globalData.imInitialized = true

    // 注册全局事件监听（用于调试）
    imSingleton.on('stateChange', (event) => {
      console.log('[APP] IM状态变更:', event)
    })

    imSingleton.on('ERROR', (event) => {
      console.error('[APP] IM错误事件:', event)
    })

    // 预加载chat-uikit-engine（TUI-Messages组件需要）
    try {
      const TUIChatEngine = require('@tencentcloud/chat-uikit-engine')
      // 设置默认的空functions对象，避免子包加载时出错
      if (typeof TUIChatEngine.functions === 'undefined') {
        TUIChatEngine.functions = {}
      }
      TUIChatEngine._initConfig = TUIChatEngine._initConfig || {}
      wx.$TUIChatEngine = TUIChatEngine
    } catch (error) {
      console.warn('[APP] 预加载chat-uikit-engine失败，但不影响应用启动:', error)
    }

    console.log('[APP] IM服务初始化完成')
  },

  /**
   * 更新IM用户资料，确保昵称和头像与小程序中的设置保持一致
   * @param {string} userName - 用户昵称
   * @param {string} avatarUrl - 用户头像URL
   * @returns {Promise<boolean>} 是否更新成功
   */
  async updateIMUserProfile(userName, avatarUrl) {
    console.log('[APP] 开始更新IM用户资料:', { userName, avatarUrl })
    
    // 检查IM SDK是否初始化
    if (!wx.$TUIKit && !wx.$IMManager) {
      console.error('[APP] 腾讯云IM未初始化，无法更新用户资料')
      return false
    }

    // 检查参数有效性
    if (!userName && !avatarUrl) {
      console.warn('[APP] 无效的用户资料参数')
      return false
    }

    // 使用IM用户资料管理器更新资料
    try {
      const imProfileManager = this.globalData.imProfileManager
      if (imProfileManager) {
        console.log('[APP] 使用imProfileManager更新IM用户资料')
        const success = await imProfileManager.updateMyProfile({
          nick: userName,
          avatar: avatarUrl || ''
        })
        
        if (success) {
          console.log('[APP] IM用户资料更新成功')
          return true
        } else {
          console.warn('[APP] IM用户资料更新失败')
          return false
        }
      } else {
        // 降级方案：直接使用TUIKit
        console.log('[APP] 使用降级方案更新IM用户资料')
        if (wx.$TUIKit) {
          const result = await wx.$TUIKit.updateMyProfile({
            nick: userName,
            avatar: avatarUrl || ''
          })
          
          if (result.code === 0) {
            console.log('[APP] IM用户资料更新成功:', result.data)
            return true
          } else {
            console.error('[APP] IM用户资料更新失败:', result)
            return false
          }
        }
      }
    } catch (error) {
      console.error('[APP] 更新IM用户资料异常:', error)
      return false
    }
    
    return false
  },

  /**
   * 获取缓存的UserSig
   * @param {string} roleType - 身份类型
   * @param {string} openid - 用户openid
   * @returns {string|null} 缓存的UserSig或null
   */
  _getCachedUserSig(roleType, openid) {
    try {
      const { userSigManager } = require('./utils/imSingleton')
      return userSigManager.getCachedUserSig(roleType, openid)
    } catch (error) {
      console.error('[APP] 获取缓存的UserSig失败:', error)
      return null
    }
  },

  /**
   * 缓存UserSig
   * @param {string} roleType - 身份类型
   * @param {string} openid - 用户openid
   * @param {string} userSig - 要缓存的UserSig
   */
  _cacheUserSig(roleType, openid, userSig) {
    try {
      const { userSigManager } = require('./utils/imSingleton')
      userSigManager.cacheUserSig(roleType, openid, userSig)
    } catch (error) {
      console.error('[APP] 缓存UserSig失败:', error)
    }
  },

  /**
   * 切换IM用户账号
   * @param {string} targetRoleType - 目标身份类型
   */
  async switchIMAccount(targetRoleType) {
    const that = this

    // 1. 检查IM单例是否存在
    if (!wx.$IMManager) {
      console.error('[switchIMAccount] IM单例未初始化，无法切换IM用户账号')
      return
    }

    const imManager = wx.$IMManager

    try {
      const identityManager = that.globalData.identityContextManager
      if (!identityManager) {
        console.error('[switchIMAccount] 身份上下文管理器未初始化，无法切换IM账号')
        return
      }

      // 2. 获取并验证目标身份上下文
      let targetContext = identityManager.getContext(targetRoleType)
      if (!targetContext) {
        console.warn('[switchIMAccount] 目标身份上下文不存在，尝试重新初始化身份系统')
        await that.initIdentitySystem()
        targetContext = identityManager.getContext(targetRoleType)
        if (!targetContext) {
          console.error(`[switchIMAccount] 获取目标身份上下文失败：身份 ${targetRoleType} 不存在`)
          return
        }
      }

      // 3. 获取用户信息和openid
      const userInfo = that.globalData.userInfo
      if (!userInfo || !userInfo.openid) {
        console.error('[switchIMAccount] 获取用户信息失败，无法生成IM用户账号')
        return
      }

      const openid = userInfo.openid
      
      // 优先使用身份上下文管理器中已经存储的IM用户ID
      let imUserID = ''
      const identityContext = identityManager.getContext(targetRoleType)
      if (identityContext && identityContext.imUserInfo && identityContext.imUserInfo.userID) {
        imUserID = identityContext.imUserInfo.userID
        console.log('[switchIMAccount] 使用身份上下文管理器中的IM用户ID:', targetRoleType, '->', imUserID)
      } else {
        // 如果没有存储的ID，使用统一ID生成模块生成新的IM用户ID
        const { generateIMUserId } = require('./utils/idGenerator')
        imUserID = generateIMUserId(targetRoleType, openid)
        console.log('[switchIMAccount] 使用统一ID生成模块为目标角色生成IM用户ID:', targetRoleType, '->', imUserID)
      }
      console.log('[switchIMAccount] ID长度:', imUserID.length)

      // 4. 检查是否已经登录该账号
      const currentUser = imManager.getCurrentUser()
      if (currentUser?.userID === imUserID && imManager.isReady()) {
        console.log('[switchIMAccount] 已经登录该账号，跳过登录:', imUserID)
        identityManager.updateConnectionStatus(targetRoleType, 'connected')
        return
      }

      // 5. 退出当前账号
      const currentRoleType = identityManager.currentRoleType
      if (currentRoleType) {
        try {
          console.log('[switchIMAccount] 退出当前账号:', currentRoleType)
          await imManager.logout()
          identityManager.updateConnectionStatus(currentRoleType, 'disconnected')
          identityManager.setLoginStatus(currentRoleType, false)
        } catch (logoutError) {
          console.warn('[switchIMAccount] 登出失败（已忽略）:', logoutError.message)
        }
      }

      // 6. 等待SDK登出操作完成
      await new Promise(resolve => setTimeout(resolve, 300))

      // 7. 获取或刷新UserSig (强制获取新的UserSig以确保格式正确)
      const { getUserSigManager } = require('./src/modules/auth/UserSigManager')
      const userSigManager = getUserSigManager()
      
      // 强制清除旧的缓存，确保获取新的UserSig
      console.log('[switchIMAccount] 强制清除旧的UserSig缓存，获取新的UserSig')
      userSigManager.clearUserSigCache(targetRoleType)
      
      // 强制刷新UserSig
      let userSig = null
      try {
        userSig = await userSigManager.refreshUserSig(targetRoleType, openid, imUserID)
        if (userSig) {
          console.log('[switchIMAccount] 成功获取新的UserSig')
          // 直接使用当前的userSigManager实例缓存UserSig
          userSigManager.cacheUserSig(targetRoleType, openid, userSig)
        } else {
          console.error('[switchIMAccount] 获取userSig失败')
          return
        }
      } catch (error) {
        console.error('[switchIMAccount] 刷新userSig失败:', error)
        return
      }

      // 8. 检查连接状态
      const connectionStatus = targetContext.imUserInfo?.connectionStatus
      if (connectionStatus === 'connected') {
        console.log('[switchIMAccount] 目标身份已连接，无需登录')
        identityManager.setLoginStatus(targetRoleType, true, userSig)
        return
      }

      // 9. 登录目标账号
      console.log('[switchIMAccount] 开始登录IM账号:', imUserID)
      identityManager.updateConnectionStatus(targetRoleType, 'connecting')

      try {
        await imManager.login({
          userID: imUserID,
          userSig: userSig,
        })

        // 10. 更新全局登录状态
        wx.$chat_userID = imUserID
        wx.$chat_userSig = userSig

        // 11. 更新目标身份的登录状态
        identityManager.setLoginStatus(
          targetRoleType,
          true,
          userSig,
          Date.now() + 7 * 24 * 3600 * 1000
        )
        identityManager.updateConnectionStatus(targetRoleType, 'connected')

        console.log('[switchIMAccount] IM账号登录成功:', imUserID)

        // 12. 触发IM登录成功事件，通知其他组件刷新会话列表
        this.triggerEvent('imLoginSuccess', { userID: imUserID, roleType: targetRoleType })
        console.log('[switchIMAccount] 触发imLoginSuccess事件')

        // 13. 初始化离线推送
        setTimeout(async () => {
          try {
            const pushInitialized = await this.globalData.offlinePushConfig.initOfflinePush()
            if (pushInitialized) {
              console.log('[switchIMAccount] 离线推送初始化成功')
            }
          } catch (error) {
            console.warn('[switchIMAccount] 离线推送初始化失败:', error)
          }
        }, 1000)

        // 13. 更新IM用户资料
        const profile = targetContext.profile
        let userName = ''
        let avatarUrl = ''

        if (profile) {
          userName = targetRoleType === 'host'
            ? (profile.hostName || profile.name || profile.nickName || '')
            : targetRoleType === 'owner'
              ? (profile.ownerName || profile.name || profile.nickName || '')
              : (profile.name || profile.nickName || '')
          // Role-specific avatar handling - ensure we use the correct avatarUrl source
          avatarUrl = profile.avatarUrl || ''
        }

        // 添加身份前缀
        userName = targetRoleType === 'owner'
          ? `主人 ${userName}`
          : targetRoleType === 'host'
            ? `寄养家庭 ${userName}`
            : userName

        // 延迟更新用户资料，确保SDK已就绪
        setTimeout(() => {
          try {
            imManager.updateProfile({
              nick: userName,
              avatar: avatarUrl,
            })
          } catch (error) {
            console.warn('[switchIMAccount] 更新IM用户资料失败:', error.message)
          }
        }, 500)

      } catch (loginError) {
        console.error('[switchIMAccount] 登录失败:', loginError)
        throw loginError
      }
    } catch (error) {
      console.error('[switchIMAccount] 切换IM用户账号失败:', error)
      const identityManager = that.globalData.identityContextManager
      if (identityManager) {
        identityManager.updateConnectionStatus(targetRoleType, 'disconnected')
        identityManager.setLoginStatus(targetRoleType, false)
      }
    }
  },



  /**
   * 获取IM连接状态
   * @param {string} roleType - 身份类型
   * @returns {object|null} 连接状态或null
   */
  getIMConnectionStatus(roleType) {
    const userInfo = this.globalData.userInfo
    if (!userInfo || !userInfo.openid) {
      return null
    }

    const prefix = `${roleType}_`;
    const maxOpenIdPartLength = 32 - prefix.length;
    const openIdPart = userInfo.openid.substring(0, maxOpenIdPartLength);
    const imUserID = `${prefix}${openIdPart}`
    return this.globalData.imConnectionStatus[imUserID] || null
  },

  /**
   * 切换身份时更新IM用户资料
   * @param {string} targetRoleType - 目标身份类型
   */
  async switchRoleAndUpdateIMProfile(targetRoleType) {
    const result = await this.switchRole(targetRoleType)
    if (result.success) {
      // 切换身份成功后，更新IM用户资料
      const currentProfile = this.globalData.currentProfile
      const userName = currentProfile.name || currentProfile.nickName || '' // 不设置默认昵称，保留空值
      const avatarUrl = currentProfile.avatarUrl || ''

      // 直接使用原始用户名，不添加前缀（宠物主人和寄养家庭是分别的IM账号）
      this.updateIMUserProfile(userName, avatarUrl)
    }
    return result
  },

  /**
   * 验证并修复身份一致性
   * @returns {string} 修复后的身份类型
   */
  validateAndFixIdentityConsistency() {
    try {
      // 导入身份工具函数
      const { isIdentityConsistent, fixIdentityInconsistency } = require('./utils/identityUtils')
      
      // 检查身份是否一致
      if (!isIdentityConsistent(this)) {
        console.warn('检测到身份不一致问题，开始修复')
        return fixIdentityInconsistency(this)
      }
      
      console.log('身份信息一致，无需修复')
      return this.globalData.userRole || 'owner'
    } catch (error) {
      console.error('验证并修复身份一致性失败:', error)
      return 'owner'
    }
  },

  /**
   * 检查IM服务状态
   * @returns {object} IM服务状态信息
   */
  checkIMStatus() {
    const status = {
      imInitialized: this.globalData.imInitialized || false,
      identitySystemInitialized: this.globalData.identitySystemInitialized || false,
      hasUserInfo: !!this.globalData.userInfo && !!this.globalData.userInfo.openid,
      currentRole: this.globalData.currentRole,
      currentProfile: this.globalData.currentProfile,
      imManager: !!wx.$IMManager,
      tuiKit: !!wx.$TUIKit,
      chatUserID: wx.$chat_userID,
      chatUserSig: !!wx.$chat_userSig,
    }

    // 检查身份上下文管理器状态
    if (this.globalData.identityContextManager) {
      const currentRoleType = this.globalData.currentRole?.roleType || 'owner'
      const currentContext = this.globalData.identityContextManager.getContext(currentRoleType)
      status.identityContext = {
        exists: !!currentContext,
        roleType: currentRoleType,
        connectionStatus: currentContext?.imUserInfo?.connectionStatus || 'disconnected',
        isLoggedIn: currentContext?.imUserInfo?.isLoggedIn || false,
      }
    }

    return status
  },

  /**
   * 确保IM服务就绪
   * @returns {Promise<boolean>} 是否就绪
   */
  async ensureIMReady() {
    console.log('检查IM服务就绪状态...')
    
    // 检查基本状态
    if (!this.globalData.imInitialized) {
      console.warn('IM服务未初始化')
      return false
    }

    if (!this.globalData.identitySystemInitialized) {
      console.warn('身份系统未初始化')
      return false
    }

    if (!this.globalData.userInfo || !this.globalData.userInfo.openid) {
      console.warn('用户信息不完整')
      return false
    }

    // 检查身份上下文
    const identityManager = this.globalData.identityContextManager
    if (!identityManager) {
      console.warn('身份上下文管理器未初始化')
      return false
    }

    const currentRoleType = this.globalData.currentRole?.roleType || 'owner'
    const currentContext = identityManager.getContext(currentRoleType)
    if (!currentContext) {
      console.warn('当前身份上下文不存在')
      return false
    }

    // 检查连接状态
    const connectionStatus = currentContext.imUserInfo?.connectionStatus
    if (connectionStatus !== 'connected') {
      console.warn('IM连接未建立:', connectionStatus)
      return false
    }

    console.log('IM服务已就绪')
    return true
  },
})
