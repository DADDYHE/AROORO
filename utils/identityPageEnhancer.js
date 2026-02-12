/**
 * 页面身份增强模块
 * 为页面提供统一的身份获取接口
 *
 * 使用方式：
 * Page(enhanceWithIdentity({
 *   data: { ... },
 *   onLoad() { ... },
 *   // 页面其他代码
 * }))
 */

const { centralIdentityManager, IDENTITY_EVENTS, ROLE_TYPES } = require('./CentralIdentityManager')

/**
 * 身份增强函数
 * @param {object} pageConfig - 页面配置对象
 * @returns {object} 增强后的页面配置
 */
function enhanceWithIdentity(pageConfig) {
  // 保存原始生命周期函数
  const originalOnLoad = pageConfig.onLoad
  const originalOnShow = pageConfig.onShow
  const originalOnUnload = pageConfig.onUnload

  return {
    ...pageConfig,

    /**
     * 增强的 onLoad 生命周期
     */
    onLoad(options) {
      console.log('[IdentityEnhance] 页面加载，初始化身份管理')

      // 初始化身份管理器
      if (!centralIdentityManager.isInitialized) {
        centralIdentityManager.init()
      }

      // 设置身份事件监听器
      this._setupIdentityEventListeners()

      // 同步身份状态到页面
      this._syncIdentityToPage()

      // 调用原始 onLoad
      if (originalOnLoad) {
        originalOnLoad.call(this, options)
      }
    },

    /**
     * 增强的 onShow 生命周期
     */
    onShow() {
      console.log('[IdentityEnhance] 页面显示，刷新身份状态')

      // 同步身份状态到页面
      this._syncIdentityToPage()

      // 调用原始 onShow
      if (originalOnShow) {
        originalOnShow.call(this)
      }
    },

    /**
     * 增强的 onUnload 生命周期
     */
    onUnload() {
      console.log('[IdentityEnhance] 页面卸载，清理身份监听器')

      // 清理身份事件监听器
      this._cleanupIdentityEventListeners()

      // 调用原始 onUnload
      if (originalOnUnload) {
        originalOnUnload.call(this)
      }
    },

    /**
     * 设置身份事件监听器
     * @private
     */
    _setupIdentityEventListeners() {
      // 保存事件回调引用
      this._identityEventCallbacks = {
        [IDENTITY_EVENTS.ROLE_CHANGED]: (data) => this._onRoleChanged(data),
        [IDENTITY_EVENTS.IDENTITY_UPDATED]: (data) => this._onIdentityUpdated(data),
        [IDENTITY_EVENTS.LOGIN_STATE_CHANGED]: (data) => this._onLoginStateChanged(data)
      }

      // 注册事件监听器
      Object.keys(this._identityEventCallbacks).forEach(eventName => {
        centralIdentityManager.on(eventName, this._identityEventCallbacks[eventName])
      })

      console.log('[IdentityEnhance] 身份事件监听器已设置')
    },

    /**
     * 清理身份事件监听器
     * @private
     */
    _cleanupIdentityEventListeners() {
      if (!this._identityEventCallbacks) return

      Object.keys(this._identityEventCallbacks).forEach(eventName => {
        centralIdentityManager.off(eventName, this._identityEventCallbacks[eventName])
      })

      this._identityEventCallbacks = null
      console.log('[IdentityEnhance] 身份事件监听器已清理')
    },

    /**
     * 同步身份状态到页面
     * @private
     */
    _syncIdentityToPage() {
      const identity = centralIdentityManager.getCurrentIdentity()
      const isLoggedIn = centralIdentityManager.isLoggedIn()
      const currentRole = centralIdentityManager.getCurrentRole()

      console.log('[IdentityEnhance] 同步身份状态到页面:', {
        isLoggedIn,
        currentRole,
        hasIdentity: !!identity
      })

      // 构建页面数据
      const pageData = {
        isLoggedIn,
        userRole: currentRole || ROLE_TYPES.OWNER,
        currentRole: currentRole,
        hasIdentity: !!identity
      }

      // 添加身份特定的数据
      if (identity) {
        pageData.userInfo = {
          _id: identity._id,
          openid: identity.openid,
          avatarUrl: identity.avatarUrl || '',
          nickName: identity.nickName || '',
          role: currentRole
        }

        // 根据角色添加特定的 profile 数据
        if (currentRole === ROLE_TYPES.HOST) {
          pageData.hostProfile = {
            _id: identity._id,
            openid: identity.openid,
            avatarUrl: identity.avatarUrl || '',
            hostName: identity.hostName || identity.nickName || '',
            phone: identity.phone || '',
            address: identity.address || ''
          }
        } else if (currentRole === ROLE_TYPES.OWNER) {
          pageData.ownerProfile = {
            _id: identity._id,
            openid: identity.openid,
            avatarUrl: identity.avatarUrl || '',
            nickName: identity.nickName || ''
          }
        }
      }

      // 更新页面数据
      this.setData(pageData)
    },

    /**
     * 处理角色变更事件
     * @private
     * @param {object} data - 事件数据
     */
    _onRoleChanged(data) {
      console.log('[IdentityEnhance] 角色变更事件:', data)

      // 同步身份状态到页面
      this._syncIdentityToPage()

      // 如果页面有自定义处理方法，调用它
      if (this.onIdentityChanged && typeof this.onIdentityChanged === 'function') {
        this.onIdentityChanged(data)
      }
    },

    /**
     * 处理身份更新事件
     * @private
     * @param {object} data - 事件数据
     */
    _onIdentityUpdated(data) {
      console.log('[IdentityEnhance] 身份更新事件:', data)

      // 同步身份状态到页面
      this._syncIdentityToPage()

      // 如果页面有自定义处理方法，调用它
      if (this.onIdentityUpdated && typeof this.onIdentityUpdated === 'function') {
        this.onIdentityUpdated(data)
      }
    },

    /**
     * 处理登录状态变更事件
     * @private
     * @param {object} data - 事件数据
     */
    _onLoginStateChanged(data) {
      console.log('[IdentityEnhance] 登录状态变更事件:', data)

      // 同步身份状态到页面
      this._syncIdentityToPage()

      // 如果页面有自定义处理方法，调用它
      if (this.onLoginStateChanged && typeof this.onLoginStateChanged === 'function') {
        this.onLoginStateChanged(data)
      }
    },

    /**
     * 检查权限
     * @param {string} permission - 权限名称
     * @returns {boolean} 是否有权限
     */
    hasPermission(permission) {
      return centralIdentityManager.hasPermission(permission)
    },

    /**
     * 批量检查权限
     * @param {array} permissionList - 权限列表
     * @returns {object} 权限检查结果
     */
    checkPermissions(permissionList) {
      return centralIdentityManager.checkPermissions(permissionList)
    },

    /**
     * 获取当前角色
     * @returns {string|null} 当前角色
     */
    getCurrentRole() {
      return centralIdentityManager.getCurrentRole()
    },

    /**
     * 获取当前身份信息
     * @returns {object|null} 当前身份信息
     */
    getCurrentIdentity() {
      return centralIdentityManager.getCurrentIdentity()
    },

    /**
     * 切换角色
     * @param {string} role - 目标角色
     * @returns {boolean} 是否切换成功
     */
    switchRole(role) {
      return centralIdentityManager.switchRole(role)
    },

    /**
     * 退出登录
     * @returns {boolean} 是否退出成功
     */
    logout() {
      return centralIdentityManager.logout()
    }
  }
}

/**
 * 组合增强函数（用于同时使用多个增强器）
 * @param {...function} enhancers - 增强器函数列表
 * @returns {function} 组合后的增强器
 */
function composeEnhancers(...enhancers) {
  return (pageConfig) => {
    return enhancers.reduceRight(
      (config, enhancer) => enhancer(config),
      pageConfig
    )
  }
}

module.exports = {
  enhanceWithIdentity,
  composeEnhancers,
  IDENTITY_EVENTS,
  ROLE_TYPES
}
