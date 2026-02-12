// 基础页面类，提供通用方法

// 页面增强工具函数
function enhancePage(pageConfig) {
  // 保存原始的生命周期函数
  const originalOnLoad = pageConfig.onLoad
  const originalOnShow = pageConfig.onShow
  const originalOnUnload = pageConfig.onUnload
  
  // 增强页面配置
  return {
    ...pageConfig,
    
    // 初始化身份管理
    _initIdentityManagement() {
      console.log('初始化身份管理...')
      this._setupIdentityEventListeners()
    },
    
    // 设置身份事件监听器
    _setupIdentityEventListeners() {
      const app = getApp()
      if (!app) return
      
      // 保存事件监听器引用
      this._identityEventListeners = {
        roleChanged: (detail) => this._handleRoleChanged(detail),
        identitySystemInitialized: () => this._handleIdentitySystemInitialized(),
        identitySwitchComplete: (detail) => this._handleIdentitySwitchComplete(detail),
        loginStatusChanged: (detail) => this._handleLoginStatusChanged(detail)
      }
      
      // 注册事件监听器
      app.on('roleChanged', this._identityEventListeners.roleChanged)
      app.on('identitySystemInitialized', this._identityEventListeners.identitySystemInitialized)
      app.on('identitySwitchComplete', this._identityEventListeners.identitySwitchComplete)
      app.on('loginStatusChanged', this._identityEventListeners.loginStatusChanged)
      
      console.log('身份事件监听器已注册')
    },
    
    // 处理登录状态变更
    _handleLoginStatusChanged(detail) {
      console.log('处理登录状态变更:', detail)
      this._syncIdentityState()
    },
    
    // 移除身份事件监听器
    _removeIdentityEventListeners() {
      const app = getApp()
      if (!app || !this._identityEventListeners) return
      
      // 移除事件监听器
      app.off('roleChanged', this._identityEventListeners.roleChanged)
      app.off('identitySystemInitialized', this._identityEventListeners.identitySystemInitialized)
      app.off('identitySwitchComplete', this._identityEventListeners.identitySwitchComplete)
      app.off('loginStatusChanged', this._identityEventListeners.loginStatusChanged)
      
      this._identityEventListeners = null
      console.log('身份事件监听器已移除')
    },
    
    // 处理角色变化
    _handleRoleChanged(detail) {
      console.log('处理角色变化:', detail)
      this._syncIdentityState()
    },
    
    // 处理身份系统初始化完成
    _handleIdentitySystemInitialized() {
      console.log('处理身份系统初始化完成')
      this._syncIdentityState()
    },
    
    // 处理身份切换完成
    _handleIdentitySwitchComplete(detail) {
      console.log('处理身份切换完成:', detail)
      this._syncIdentityState()
    },
    
    // 同步身份状态
    _syncIdentityState() {
      console.log('base-page.js 同步身份状态...')
      const app = getApp()
      if (!app) return

      try {
        // 使用统一的isLoggedIn方法检查登录状态
        const isLoggedIn = typeof app.isLoggedIn === 'function' ? app.isLoggedIn() : false
        console.log('base-page.js 检查登录状态:', isLoggedIn)

        if (isLoggedIn) {
          // 从身份上下文管理器中获取最新的身份信息
          if (app.globalData.identityContextManager) {
            const currentRoleType = app.globalData.identityContextManager.getCurrentRoleType()
            const currentContext = app.globalData.identityContextManager.getCurrentContext()

            console.log('base-page.js 从 identityContextManager 获取:', {
              currentRoleType,
              hasCurrentContext: !!currentContext
            })

            if (currentContext) {
              // 增强globalData，添加从身份上下文管理器获取的信息
              const enhancedGlobalData = {
                ...app.globalData,
                currentRoleType: currentRoleType,
                currentContext: currentContext,
                identityInfo: {
                  roleType: currentRoleType,
                  profile: currentContext.profile,
                  permissions: currentContext.permissions,
                  imUserInfo: currentContext.imUserInfo
                }
              }
              console.log('base-page.js 已设置登录状态:', {
                userRole: enhancedGlobalData.userRole,
                currentRoleType: currentRoleType,
                hasIdentityInfo: !!enhancedGlobalData.identityInfo,
                hasCurrentContext: !!currentContext
              })
              this._setLoggedInState(enhancedGlobalData)
              return
            } else {
              console.warn('base-page.js currentContext 为 null，无法同步身份状态')
            }
          } else {
            console.warn('base-page.js identityContextManager 未初始化')
          }
          // 如果身份上下文管理器不可用，使用原始的globalData
          console.log('base-page.js 使用原始 globalData 同步状态')
          this._setLoggedInState(app.globalData)
        } else {
          console.log('base-page.js 未登录，设置未登录状态')
          this._setNotLoggedInState()
        }
      } catch (error) {
        console.error('base-page.js 同步身份状态失败:', error)
      }
    },
    
    // 检查登录状态
    async checkLoginStatus() {
      try {
        const app = getApp()
        
        // 检查全局退出状态
        if (app.globalData.isLogout) {
          this._setNotLoggedInState()
          return false
        }
        
        // 检查登录过期
        if (this._isLoginExpired()) {
          this._setNotLoggedInState()
          return false
        }
        
        // 检查身份系统是否已初始化且有有效的用户信息
        const identitySystemInitialized = app.globalData.identitySystemInitialized || false
        const hasValidUserInfo = app.globalData.userInfo && (app.globalData.userInfo._id || app.globalData.userInfo.openid)
        
        // 优先检查身份系统初始化状态
        if (identitySystemInitialized && hasValidUserInfo) {
          this._setLoggedInState(app.globalData)
          return true
        }
        
        // 使用标准登录模块检查登录状态
        if (app.globalData.loginManager) {
          const isLoggedIn = await app.globalData.loginManager.isLoggedIn()
          
          if (isLoggedIn) {
            this._setLoggedInState(app.globalData)
            return true
          } else {
            this._setNotLoggedInState()
            return false
          }
        } else {
          this._setNotLoggedInState()
          return false
        }
      } catch (error) {
        console.error('检查登录状态失败:', error)
        this._setNotLoggedInState()
        return false
      }
    },

    // 设置未登录状态
    _setNotLoggedInState() {
      this.setData({
        isLoggedIn: false,
        userInfo: {},
        userRole: 'owner',
        hostProfile: null,
        ownerProfile: null
      })
    },

    // 设置已登录状态
    _setLoggedInState(globalData) {
      const userInfo = globalData.userInfo || {}
      const hostProfile = globalData.hostInfo || null
      const ownerProfile = globalData.ownerInfo || null

      // 优先从 identityContextManager 获取角色
      let currentRoleType = null
      let currentContext = null

      if (globalData.identityContextManager) {
        currentRoleType = globalData.identityContextManager.getCurrentRoleType()
        currentContext = globalData.identityContextManager.getCurrentContext()
      }

      // 如果 identityContextManager 没有角色，使用 globalData 中的角色
      const userRole = currentRoleType || globalData.userRole || globalData.currentRoleType || 'owner'

      // 优先使用从身份上下文管理器获取的身份信息
      const identityInfo = globalData.identityInfo || globalData.loginManager?.getIdentityInfo() || {}

      this.setData({
        isLoggedIn: true,
        userInfo: userInfo,
        userRole: userRole,
        hostProfile: hostProfile,
        ownerProfile: ownerProfile,
        identityInfo: identityInfo,
        currentRoleType: currentRoleType || userRole,
        currentContext: currentContext || globalData.currentContext || null
      })

      console.log('已设置登录状态:', {
        userRole,
        currentRoleType: currentRoleType || userRole,
        hasIdentityInfo: !!globalData.identityInfo,
        hasCurrentContext: !!currentContext
      })
    },

    // 检查登录是否过期
    _isLoginExpired() {
      try {
        // 导入标准登录模块的StorageManager
        const { getStorageManager } = require('../src/modules/auth/StorageManager')
        const storageManager = getStorageManager()
        
        const loginExpiry = storageManager.getLoginExpiry()
        console.log('[BasePage] 检查登录过期：过期时间:', loginExpiry)
        console.log('[BasePage] 检查登录过期：当前时间:', Date.now())
        
        const isExpired = loginExpiry && Date.now() > loginExpiry
        console.log('[BasePage] 检查登录过期：是否过期:', isExpired)
        
        return isExpired
      } catch (error) {
        console.error('[BasePage] 检查登录过期失败:', error)
        return false
      }
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

    // 检查登录状态并执行操作
    async checkLoginAndExecute(callback) {
      const isLoggedIn = await this.checkLoginStatus()
      if (!isLoggedIn) {
        wx.showModal({
          title: '请登录',
          content: '您需要先登录才能执行此操作',
          confirmText: '去登录',
          success: (res) => {
            if (res.confirm) {
              // 调用标准登录模块
              const app = getApp()
              if (app.globalData.loginManager) {
                app.globalData.loginManager.login()
              }
            }
          }
        })
        return false
      }
      callback()
      return true
    },
    
    // 切换身份
    async switchIdentity(roleType) {
      const app = getApp()
      if (!app || !app.globalData.loginManager) {
        console.error('无法获取登录管理器')
        return false
      }
      
      try {
        const result = await app.globalData.loginManager.switchRole(roleType)
        return result
      } catch (error) {
        console.error('切换身份失败:', error)
        return false
      }
    },
    
    // 获取身份信息
    getIdentityInfo() {
      const app = getApp()
      if (!app || !app.globalData.loginManager) {
        return {}
      }
      
      try {
        return app.globalData.loginManager.getIdentityInfo()
      } catch (error) {
        console.error('获取身份信息失败:', error)
        return {}
      }
    },

    // 设置 TabBar 选中状态
    setTabBarIndex(index) {
      if (typeof this.getTabBar === 'function' && this.getTabBar()) {
        const currentSelected = this.getTabBar().data.selected
        if (currentSelected !== index) {
          console.log(`${this.__pageName || 'Page'} - 设置 tabBar 选中状态为 ${index}，当前选中状态:`, currentSelected)
          this.getTabBar().setData({
            selected: index
          })
        } else {
          console.log(`${this.__pageName || 'Page'} - tabBar 选中状态已为 ${index}，无需设置`)
        }
      } else {
        console.error(`${this.__pageName || 'Page'} - 无法获取 tabBar 实例`)
      }
    },
    
    // 增强的 onLoad 方法
    onLoad(options) {
      // 初始化页面名称
      this.__pageName = this.route ? this.route.split('/').pop() : 'Page'
      
      // 初始化身份管理
      this._initIdentityManagement()
      
      // 调用原始的 onLoad 方法
      if (typeof originalOnLoad === 'function') {
        originalOnLoad.call(this, options)
      }
    },
    
    // 增强的 onShow 方法
    onShow() {
      // 调用原始的 onShow 方法
      if (typeof originalOnShow === 'function') {
        originalOnShow.call(this)
      }

      // 检查登录状态并同步身份状态
      // 如果身份系统还没初始化（globalData.userInfo 不存在），跳过检查
      const app = getApp()
      if (app.globalData.userInfo) {
        this.checkLoginAndShowModal()
        this._syncIdentityState()
      } else {
        console.log('onShow - 身份系统未初始化，跳过登录检查')
      }
    },
    
    // 增强的 onUnload 方法
    onUnload() {
      // 移除身份事件监听器
      this._removeIdentityEventListeners()
      
      // 调用原始的 onUnload 方法
      if (typeof originalOnUnload === 'function') {
        originalOnUnload.call(this)
      }
    }
  }
}

module.exports = {
  enhancePage
}