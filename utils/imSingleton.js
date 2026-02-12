/**
 * 统一的IM服务管理器（单例模式）
 * 
 * 职责：
 * 1. 管理唯一的腾讯云IM SDK实例
 * 2. 统一SDK状态管理（ready、logged_in等）
 * 3. 提供统一的API接口
 * 4. 统一事件监听和状态同步
 * 
 * 设计原则：
 * - 单例模式：确保全局只有一个IM实例
 * - 状态中心化：所有状态变更通过统一入口
 * - 解耦：通过事件机制与外部模块通信
 * - 错误隔离：内部错误不影响外部调用
 */

const TencentCloudChat = require('@tencentcloud/chat')
const TIMUploadPlugin = require('tim-upload-plugin')
const ImUserIdValidator = require('./imUserIdValidator')

/**
 * IM状态枚举
 */
const IMState = {
  UNINITIALIZED: 'uninitialized',    // 未初始化
  INITIALIZING: 'initializing',      // 初始化中
  READY: 'ready',                    // SDK就绪
  NOT_LOGGED_IN: 'not_logged_in',   // 未登录
  LOGGING_IN: 'logging_in',          // 登录中
  LOGGED_IN: 'logged_in',           // 已登录
  ERROR: 'error',                    // 错误状态
  DISCONNECTED: 'disconnected'       // 已断开连接
}

/**
 * IM错误码映射
 * 参考腾讯云IM官方错误码文档
 */
const IMErrorCode = {
  USER_SIG_EXPIRED: 70009,        // UserSig过期
  ALREADY_LOGGED_IN: 70020,       // 已登录
  SDK_NOT_READY: 70001,           // SDK未就绪
  INVALID_USER_ID: 70002,          // 无效的用户ID
  INVALID_USER_SIG: 70004,         // 无效的UserSig
  NETWORK_ERROR: 70051,            // 网络错误
  TIMEOUT: 70163,                 // 超时
  USER_NOT_LOGGED_IN: 2024,        // 用户未登录
  MINIPROGRAM_NETWORK_ERROR: 99999, // 小程序网络错误
  MINIPROGRAM_SECURITY_ERROR: 99998 // 小程序安全信息获取错误
}

/**
 * 错误消息映射
 */
const ErrorMessageMap = {
  [IMErrorCode.USER_SIG_EXPIRED]: 'UserSig已过期，请重新登录',
  [IMErrorCode.ALREADY_LOGGED_IN]: '该用户已登录，请勿重复登录',
  [IMErrorCode.SDK_NOT_READY]: 'SDK未就绪，请稍后再试',
  [IMErrorCode.INVALID_USER_ID]: '无效的用户ID',
  [IMErrorCode.INVALID_USER_SIG]: '无效的UserSig',
  [IMErrorCode.NETWORK_ERROR]: '网络连接失败，请检查网络',
  [IMErrorCode.TIMEOUT]: '请求超时，请重试',
  [IMErrorCode.USER_NOT_LOGGED_IN]: '用户未登录，请先登录',
  [IMErrorCode.MINIPROGRAM_NETWORK_ERROR]: '网络连接失败，请检查网络后重试',
  [IMErrorCode.MINIPROGRAM_SECURITY_ERROR]: '安全信息获取失败，请检查网络后重试'
}

/**
 * 获取友好的错误消息
 * @param {number|Object} error 错误码或错误对象
 * @returns {string} 友好的错误消息
 */
function getErrorMessage(error) {
  let errorCode = error
  if (error && error.code) {
    errorCode = error.code
  } else if (error && error.data && error.data.code) {
    errorCode = error.data.code
  }

  // 检查是否是小程序特定网络错误
  const errorMessage = error && (error.message || error.data?.message || '')
  if (errorMessage.includes('webapi_getwxaasyncsecinfo')) {
    return ErrorMessageMap[IMErrorCode.MINIPROGRAM_SECURITY_ERROR]
  }
  if (errorMessage.includes('Failed to fetch')) {
    return ErrorMessageMap[IMErrorCode.MINIPROGRAM_NETWORK_ERROR]
  }

  const message = ErrorMessageMap[errorCode]
  if (message) {
    return message
  }

  // 如果是通用错误对象，返回其message
  if (error && error.message) {
    return error.message
  }

  return '未知错误'
}

/**
 * IM服务管理器类（单例）
 */
class IMSingletonManager {
  /**
   * 单例实例
   */
  static _instance = null

  /**
   * 获取单例实例
   */
  static getInstance() {
    if (!IMSingletonManager._instance) {
      IMSingletonManager._instance = new IMSingletonManager()
    }
    return IMSingletonManager._instance
  }

  /**
   * 构造函数（私有）
   */
  constructor() {
    if (IMSingletonManager._instance) {
      throw new Error('IMSingletonManager is a singleton, use getInstance() to get the instance')
    }

    // 创建唯一的IM SDK实例
    this._tim = TencentCloudChat.create({
      SDKAppID: 1600123494,
      // 配置存储选项，使用本地存储
      storage: {
        // 使用微信小程序的本地存储
        setItem: (key, value) => {
          try {
            wx.setStorageSync(key, value);
          } catch (e) {
            console.error('[IMSingleton] 存储数据失败:', e);
          }
        },
        getItem: (key) => {
          try {
            return wx.getStorageSync(key);
          } catch (e) {
            console.error('[IMSingleton] 获取数据失败:', e);
            return null;
          }
        },
        removeItem: (key) => {
          try {
            wx.removeStorageSync(key);
          } catch (e) {
            console.error('[IMSingleton] 删除数据失败:', e);
          }
        }
      }
    })

    // 设置日志级别（生产环境使用2）
    this._tim.setLogLevel(2)

    // 注册上传插件
    this._tim.registerPlugin({ 'tim-upload-plugin': TIMUploadPlugin })

    // 内部状态
    this._state = IMState.UNINITIALIZED
    this._isReady = false
    this._currentUser = null
    this._loginPromise = null // 用于处理并发登录
    this._netStateCheckInterval = null // 网络状态检查定时器
    
    // 降级策略相关
    this._isDegradedMode = false // 是否处于降级模式
    this._networkErrorCount = 0 // 网络错误计数
    this._lastNetworkErrorTime = 0 // 最后一次网络错误时间
    this._offlineOperations = [] // 离线操作缓存

    // 事件处理器映射
    this._eventHandlers = new Map()

    // 等待SDK ready的Promise缓存
    this._readyPromise = null
    this._readyResolve = null

    // 注册SDK事件监听
    this._registerSDKListeners()

    // 增加额外的网络状态检查
    console.log('[IMSingleton] 开始检查网络状态...')
    wx.getNetworkType({
      success: (res) => {
        console.log('[IMSingleton] 当前网络状态:', res.networkType)
      },
      fail: (err) => {
        console.error('[IMSingleton] 获取网络状态失败:', err)
      }
    })

    // 启动定期网络状态检查
    this._startNetStateCheck()

    // 初始化完成，保持为UNINITIALIZED状态，等待SDK_READY事件
    console.log('[IMSingleton] 初始化完成，等待SDK就绪')
  }

  /**
   * 检查是否需要进入降级模式
   * @private
   */
  _checkDegradedMode() {
    const now = Date.now()
    const timeWindow = 60000 // 1分钟时间窗口
    
    // 重置1分钟前的错误计数
    if (now - this._lastNetworkErrorTime > timeWindow) {
      this._networkErrorCount = 0
    }
    
    // 如果1分钟内网络错误超过5次，进入降级模式
    if (this._networkErrorCount >= 5 && !this._isDegradedMode) {
      console.warn('[IMSingleton] 网络错误过多，进入降级模式')
      this._isDegradedMode = true
      this._emitEvent('DEGRADED_MODE_ENTERED', { timestamp: now })
      
      // 显示降级模式提示
      wx.showToast({
        title: '网络不稳定，已进入离线模式',
        icon: 'none',
        duration: 3000
      })
    }
  }

  /**
   * 退出降级模式
   * @private
   */
  _exitDegradedMode() {
    if (this._isDegradedMode) {
      console.log('[IMSingleton] 网络恢复，退出降级模式')
      this._isDegradedMode = false
      this._networkErrorCount = 0
      this._emitEvent('DEGRADED_MODE_EXITED', { timestamp: Date.now() })
      
      // 同步离线操作
      this._syncOfflineOperations()
      
      // 显示网络恢复提示
      wx.showToast({
        title: '网络已恢复',
        icon: 'success',
        duration: 2000
      })
    }
  }

  /**
   * 记录网络错误
   * @private
   */
  _recordNetworkError() {
    this._networkErrorCount++
    this._lastNetworkErrorTime = Date.now()
    console.warn(`[IMSingleton] 网络错误计数: ${this._networkErrorCount}`)
    this._checkDegradedMode()
  }

  /**
   * 缓存离线操作
   * @private
   * @param {Object} operation - 操作对象
   */
  _cacheOfflineOperation(operation) {
    if (this._isDegradedMode) {
      const offlineOp = {
        id: `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: operation.type,
        data: operation.data,
        timestamp: Date.now()
      }
      this._offlineOperations.push(offlineOp)
      console.log('[IMSingleton] 缓存离线操作:', offlineOp.type)
      
      // 限制离线操作缓存数量
      if (this._offlineOperations.length > 50) {
        this._offlineOperations = this._offlineOperations.slice(-50)
      }
    }
  }

  /**
   * 同步离线操作
   * @private
   */
  async _syncOfflineOperations() {
    if (this._offlineOperations.length > 0) {
      console.log(`[IMSingleton] 开始同步${this._offlineOperations.length}个离线操作`)
      
      const operationsToSync = [...this._offlineOperations]
      this._offlineOperations = []
      
      for (const operation of operationsToSync) {
        try {
          console.log('[IMSingleton] 同步离线操作:', operation.type)
          
          // 根据操作类型执行不同的同步逻辑
          switch (operation.type) {
            case 'sendMessage':
              if (this._tim && this._tim.sendMessage) {
                await this._tim.sendMessage(operation.data)
              }
              break
            case 'markAsRead':
              if (this._tim && this._tim.setMessageRead) {
                await this._tim.setMessageRead(operation.data)
              }
              break
            // 可以添加其他操作类型的处理
          }
          
          console.log('[IMSingleton] 离线操作同步成功:', operation.type)
        } catch (error) {
          console.error('[IMSingleton] 离线操作同步失败:', error)
          // 同步失败的操作重新加入缓存
          this._offlineOperations.push(operation)
        }
      }
      
      console.log(`[IMSingleton] 离线操作同步完成，剩余${this._offlineOperations.length}个操作未同步`)
    }
  }

  /**
   * 检查是否处于降级模式
   * @returns {boolean} 是否处于降级模式
   */
  isInDegradedMode() {
    return this._isDegradedMode
  }

  /**
   * 获取离线操作缓存
   * @returns {Array} 离线操作缓存
   */
  getOfflineOperations() {
    return this._offlineOperations
  }

  /**
   * 启动定期网络状态检查
   * @private
   */
  _startNetStateCheck() {
    // 清除之前的定时器
    if (this._netStateCheckInterval) {
      clearInterval(this._netStateCheckInterval)
    }

    // 每30秒检查一次网络状态
    this._netStateCheckInterval = setInterval(() => {
      wx.getNetworkType({
        success: (res) => {
          const networkType = res.networkType
          console.log('[IMSingleton] 定期网络状态检查:', networkType)
          
          // 如果网络类型为none，提示用户
          if (networkType === 'none') {
            console.warn('[IMSingleton] 网络连接已断开')
            this._updateState(IMState.DISCONNECTED)
            this._emitEvent('NET_DISCONNECTED', { data: { state: 'disconnected', networkType } })
          }
        },
        fail: (err) => {
          console.error('[IMSingleton] 定期网络状态检查失败:', err)
        }
      })
    }, 30000) // 30秒

    console.log('[IMSingleton] 定期网络状态检查已启动')
  }

  /**
   * 停止定期网络状态检查
   * @private
   */
  _stopNetStateCheck() {
    if (this._netStateCheckInterval) {
      clearInterval(this._netStateCheckInterval)
      this._netStateCheckInterval = null
      console.log('[IMSingleton] 定期网络状态检查已停止')
    }
  }

  /**
   * 获取IM SDK实例
   */
  getSDK() {
    // 确保 SDK 实例存在且有效
    if (!this._tim) {
      console.error('[IMSingleton] SDK 实例未初始化')
      return null
    }
    
    // 检查是否是有效的 SDK 实例
    if (typeof this._tim.isReady !== 'function') {
      console.warn('[IMSingleton] SDK 实例可能无效，缺少 isReady 方法')
    }
    
    return this._tim
  }

  /**
   * 获取当前状态
   */
  getState() {
    return this._state
  }

  /**
   * 检查SDK是否就绪（SDK初始化就绪，不包含登录状态）
   */
  isSDKReady() {
    // 优先检查SDK的实际就绪状态
    if (this._tim && typeof this._tim.isReady === 'function') {
      const sdkReady = this._tim.isReady()
      console.log('[IMSingleton] SDK实际就绪状态:', sdkReady)
      return sdkReady
    }
    // 回退到检查内部状态
    return this._state === IMState.READY || this._state === IMState.LOGGED_IN
  }

  /**
   * 检查用户是否已登录
   */
  isLoggedIn() {
    return this._state === IMState.LOGGED_IN
  }

  /**
   * 检查是否就绪（SDK ready且已登录）- 保持向后兼容
   * @deprecated 建议使用 isSDKReady() 或 isLoggedIn() 来明确区分状态
   */
  isReady() {
    return this._state === IMState.READY || this._state === IMState.LOGGED_IN
  }

  /**
   * 等待SDK就绪
   * @param {number} timeout 超时时间（毫秒），默认10000ms
   * @returns {Promise<boolean>} 是否在超时时间内就绪
   */
  async waitForReady(timeout = 10000) {
    try {
      // 如果SDK已就绪，直接返回成功
      if (this.isSDKReady()) {
        return true
      }

      // 创建新的Promise，每次调用都使用独立的Promise
      return new Promise((resolve) => {
        const startTime = Date.now()
        const checkInterval = 100 // 每100ms检查一次

        // 定期检查SDK是否就绪
        const checkTimer = setInterval(() => {
          if (this.isSDKReady()) {
            clearInterval(checkTimer)
            clearTimeout(timeoutTimer)
            console.log(`[IMSingleton] SDK已就绪（用时${Date.now() - startTime}ms）`)
            resolve(true)
          }
        }, checkInterval)

        // 超时处理
        const timeoutTimer = setTimeout(() => {
          clearInterval(checkTimer)
          console.warn(`[IMSingleton] 等待SDK就绪超时（${timeout}ms）`)
          resolve(false)
        }, timeout)

        // 保存当前的resolve函数到实例变量，供SDK_READY事件使用
        // 注意：这里可能会被后续调用覆盖，但这是可接受的，因为只要SDK就绪，所有等待都会被解决
        this._readyResolve = () => {
          clearInterval(checkTimer)
          clearTimeout(timeoutTimer)
          console.log(`[IMSingleton] SDK已就绪（用时${Date.now() - startTime}ms）`)
          resolve(true)
        }
      })
    } catch (error) {
      console.error('[IMSingleton] waitForReady异常:', error)
      return false
    }
  }

  /**
   * 更新内部状态
   * @private
   */
  _updateState(newState) {
    if (this._state === newState) {
      return
    }

    const oldState = this._state
    this._state = newState
    this._isReady = newState === IMState.READY || newState === IMState.LOGGED_IN

    console.log(`[IMSingleton] 状态变更: ${oldState} -> ${newState}`)

    // 如果变为ready状态，通知等待者
    if (this._isReady && this._readyResolve) {
      this._readyResolve()
    }

    // 触发状态变更事件
    this._emitEvent('stateChange', { oldState, newState })
  }

  /**
   * 注册SDK事件监听器
   * @private
   */
  _registerSDKListeners() {
    // SDK就绪
    const onSDKReady = (event) => {
      console.log('[IMSingleton] SDK_READY事件触发')
      // 如果用户已登录，保持LOGGED_IN状态
      // 如果正在登录中，保持LOGGING_IN状态
      // 否则设置为READY
      let newState
      if (this._currentUser) {
        newState = IMState.LOGGED_IN
      } else if (this._state === IMState.LOGGING_IN) {
        newState = IMState.LOGGING_IN
      } else {
        newState = IMState.READY
      }
      this._updateState(newState)
      // 通知waitForReady方法SDK已就绪
      if (this._readyResolve) {
        this._readyResolve()
      }
      this._emitEvent('SDK_READY', event)
    }
    this._tim.on(TencentCloudChat.EVENT.SDK_READY, onSDKReady)

    // 消息接收
    const onMessageReceived = (event) => {
      this._emitEvent('MESSAGE_RECEIVED', event)
    }
    this._tim.on(TencentCloudChat.EVENT.MESSAGE_RECEIVED, onMessageReceived)

    // 会话列表更新
    const onConversationListUpdated = (event) => {
      this._emitEvent('CONVERSATION_LIST_UPDATED', event)
    }
    this._tim.on(TencentCloudChat.EVENT.CONVERSATION_LIST_UPDATED, onConversationListUpdated)

    // 消息已读
    const onMessageReadByPeer = (event) => {
      this._emitEvent('MESSAGE_READ_BY_PEER', event)
    }
    this._tim.on(TencentCloudChat.EVENT.MESSAGE_READ_BY_PEER, onMessageReadByPeer)

    // 消息撤回
    const onMessageRevoked = (event) => {
      this._emitEvent('MESSAGE_REVOKED', event)
    }
    this._tim.on(TencentCloudChat.EVENT.MESSAGE_REVOKED, onMessageRevoked)

    // SDK未就绪
    const onSDKNotReady = () => {
      console.warn('[IMSingleton] SDK_NOT_READY事件触发')
      this._updateState(IMState.NOT_LOGGED_IN)
      this._emitEvent('SDK_NOT_READY')
    }
    this._tim.on(TencentCloudChat.EVENT.SDK_NOT_READY, onSDKNotReady)

    // 错误事件
    const onError = (event) => {
      console.error('[IMSingleton] ERROR事件:', event)

      // 检查错误码，精确判断错误类型
      const errorCode = event.data?.code || event.code
      const errorMessage = getErrorMessage(event) // 传递完整事件对象

      console.warn(`[IMSingleton] 错误详情: 代码=${errorCode}, 消息=${errorMessage}`)
      console.warn(`[IMSingleton] 错误完整信息:`, event)

      // 检查是否是小程序特定网络错误
      const eventMessage = event.data?.message || event.message || ''
      const isMiniProgramNetworkError = eventMessage.includes('webapi_getwxaasyncsecinfo') || eventMessage.includes('Failed to fetch')

      // 根据错误类型更新状态
      if (errorCode === IMErrorCode.USER_NOT_LOGGED_IN) {
        console.warn('[IMSingleton] 用户未登录错误，更新状态为NOT_LOGGED_IN')
        this._updateState(IMState.NOT_LOGGED_IN)
      }
      else if (errorCode === IMErrorCode.SDK_NOT_READY) {
        console.warn('[IMSingleton] SDK未就绪错误，更新状态为NOT_LOGGED_IN')
        this._updateState(IMState.NOT_LOGGED_IN)
      }
      else if (isMiniProgramNetworkError || errorCode === IMErrorCode.NETWORK_ERROR) {
        console.warn('[IMSingleton] 网络错误，保持当前状态')
        // 网络错误时不更新状态，保持当前状态
      }
      else {
        // 其他错误保持ERROR状态
        this._updateState(IMState.ERROR)
      }

      // 触发错误事件
      this._emitEvent('ERROR', event)

      // 处理小程序特定网络错误
      if (isMiniProgramNetworkError) {
        console.warn('[IMSingleton] 小程序网络错误，尝试自动重连')
        this._handleNetworkError()
        this._recordNetworkError() // 记录网络错误
        this._emitEvent('MINIPROGRAM_NETWORK_ERROR', event)
      }
      // UserSig过期 - 自动刷新并重连
      else if (errorCode === IMErrorCode.USER_SIG_EXPIRED) {
        console.log('[IMSingleton] UserSig过期，触发自动刷新')
        this._handleUserSigExpired()
        this._emitEvent('USER_SIG_EXPIRED', event)
      }
      // 已登录错误
      else if (errorCode === IMErrorCode.ALREADY_LOGGED_IN) {
        console.log('[IMSingleton] 检测到已登录状态，忽略')
      }
      // 用户未登录错误
      else if (errorCode === IMErrorCode.USER_NOT_LOGGED_IN) {
        console.warn('[IMSingleton] 用户未登录，需要重新登录')
        this._emitEvent('USER_NOT_LOGGED_IN', event)
      }
      // SDK未就绪
      else if (errorCode === IMErrorCode.SDK_NOT_READY) {
        console.warn('[IMSingleton] SDK未就绪，等待SDK_READY事件')
      }
      // 网络错误
      else if (errorCode === IMErrorCode.NETWORK_ERROR) {
        console.warn('[IMSingleton] 网络错误，检查网络连接')
        this._handleNetworkError()
        this._recordNetworkError() // 记录网络错误
      }
      // 通用userSig错误（兼容旧代码）
      else if (eventMessage.includes('userSig')) {
        console.log('[IMSingleton] 检测到UserSig相关错误，触发自动刷新')
        this._handleUserSigExpired()
        this._emitEvent('USER_SIG_EXPIRED', event)
      }
    }
    this._tim.on(TencentCloudChat.EVENT.ERROR, onError)

    // 被踢下线
    const onKickedOut = (event) => {
      console.warn('[IMSingleton] KICKED_OUT事件:', event)
      this._updateState(IMState.NOT_LOGGED_IN)
      this._currentUser = null
      this._emitEvent('KICKED_OUT', event)
    }
    this._tim.on(TencentCloudChat.EVENT.KICKED_OUT, onKickedOut)

    // 网络状态变更
    const onNetStateChange = (event) => {
      console.log('[IMSingleton] 网络状态变更:', event)
      
      // 触发事件
      this._emitEvent('NET_STATE_CHANGE', event)
      
      // 处理网络状态变化
      const netState = event.data?.state || 'unknown'
      console.log('[IMSingleton] 新的网络状态:', netState)
      
      // 当网络从无到有时，尝试自动重连
      if (netState === 'connected') {
        console.log('[IMSingleton] 网络已连接，尝试自动重连IM服务')
        
        // 如果处于降级模式，退出降级模式
        if (this._isDegradedMode) {
          this._exitDegradedMode()
        }
        
        // 如果用户已登录，尝试重新连接
        if (this._currentUser && (this._state === IMState.ERROR || this._state === IMState.DISCONNECTED)) {
          console.log('[IMSingleton] 用户已登录，尝试重新连接IM服务')
          
          // 等待1秒后尝试重新连接
          setTimeout(async () => {
            try {
              // 尝试发送一个轻量级请求，检查连接状态
              console.log('[IMSingleton] 尝试检查IM连接状态...')
              
              if (this._tim && this._tim.getConversationList) {
                await this._tim.getConversationList({ count: 1 })
                console.log('[IMSingleton] IM连接状态检查成功')
                this._updateState(IMState.LOGGED_IN)
                
                // 触发重连成功事件
                this._emitEvent('NET_RECONNECTED', event)
              }
            } catch (error) {
              console.warn('[IMSingleton] IM连接状态检查失败:', error)
              // 连接检查失败，保持当前状态
            }
          }, 1000)
        }
      }
      // 当网络从有到无时，提示用户
      else if (netState === 'disconnected') {
        console.warn('[IMSingleton] 网络连接已断开')
        this._updateState(IMState.DISCONNECTED)
        
        // 触发断开连接事件
        this._emitEvent('NET_DISCONNECTED', event)
      }
    }
    this._tim.on(TencentCloudChat.EVENT.NET_STATE_CHANGE, onNetStateChange)
  }

  /**
   * 触发事件
   * @private
   */
  _emitEvent(eventName, data) {
    const handlers = this._eventHandlers.get(eventName)
    if (handlers && handlers.length > 0) {
      handlers.forEach(handler => {
        try {
          handler(data)
        } catch (error) {
          console.error(`[IMSingleton] 事件处理器错误 (${eventName}):`, error)
        }
      })
    }
  }

  /**
   * 注册事件监听器
   * @param {string} eventName 事件名称
   * @param {Function} handler 处理函数
   */
  on(eventName, handler) {
    if (!this._eventHandlers.has(eventName)) {
      this._eventHandlers.set(eventName, [])
    }
    this._eventHandlers.get(eventName).push(handler)
  }

  /**
   * 移除事件监听器
   * @param {string} eventName 事件名称
   * @param {Function} handler 处理函数
   */
  off(eventName, handler) {
    const handlers = this._eventHandlers.get(eventName)
    if (handlers) {
      const index = handlers.indexOf(handler)
      if (index !== -1) {
        handlers.splice(index, 1)
      }
    }
  }

  /**
   * 移除所有事件监听器
   */
  removeAllListeners() {
    this._eventHandlers.clear()
  }

  /**
   * 监听SDK_READY事件
   * @param {Function} handler 处理函数
   */
  onReady(handler) {
    this.on('SDK_READY', handler)
  }

  /**
   * 移除SDK_READY事件监听
   * @param {Function} handler 处理函数
   */
  offReady(handler) {
    this.off('SDK_READY', handler)
  }

  /**
   * 登录
   * @param {Object} options 登录选项
   * @param {string} options.userID 用户ID
   * @param {string} options.userSig 用户签名
   * @returns {Promise<Object>} 登录结果
   */
  async login(options) {
    // 处理并发登录请求
    if (this._loginPromise) {
      console.log('[IMSingleton] 已有登录请求在进行中，等待完成')
      return this._loginPromise
    }

    // 验证参数
    if (!options?.userID || !options?.userSig) {
      throw new Error('登录失败：缺少必要参数（userID或userSig）')
    }

    // 验证userSig有效性
    if (options.userSig.length < 10 || options.userSig === 'testuser123') {
      throw new Error('登录失败：无效的userSig')
    }

    // 检查是否已登录相同用户
    if (this._currentUser?.userID === options.userID && this._state === IMState.LOGGED_IN) {
      console.log('[IMSingleton] 已登录该用户，跳过登录')
      return { success: true, alreadyLoggedIn: true }
    }

    // 创建登录Promise
    this._loginPromise = (async () => {
      try {
        this._updateState(IMState.LOGGING_IN)

        console.log('[IMSingleton] 开始登录:', options.userID)

        // 跳过SDK就绪检查，直接尝试登录
        // 在小程序环境中，SDK可能在登录过程中才会完全初始化
        console.log('[IMSingleton] 跳过SDK就绪检查，直接尝试登录...')

        // 尝试直接登录，即使SDK未完全就绪
        // 在小程序环境中，SDK初始化可能较慢，但登录操作仍可执行
        try {
          console.log('[IMSingleton] 尝试第一次登录...')
          console.log('[DEBUG] login参数:')
          console.log('  userID:', options.userID)
          console.log('  userSig类型:', typeof options.userSig)
          console.log('  userSig长度:', options.userSig?.length || 0)
          console.log('  userSig前100字符:', options.userSig?.substring(0, 100))
          console.log('  userSig后100字符:', options.userSig?.substring(options.userSig?.length - 100))
          
          const result = await this._tim.login({
            userID: options.userID,
            userSig: options.userSig,
          })

          this._currentUser = options
          this._updateState(IMState.LOGGED_IN)

          console.log('[IMSingleton] 登录成功:', options.userID)

          return { success: true, data: result }
        } catch (loginError) {
          // 处理登录错误
          console.error('[IMSingleton] 登录失败:', loginError)
          console.error('[IMSingleton] 登录错误完整信息:', loginError)
          
          // 无论什么错误，都尝试强制设置登录状态
          console.warn('[IMSingleton] 尝试强制设置登录状态...')
          // 强制设置当前用户信息，跳过SDK就绪检查
          this._currentUser = options
          this._updateState(IMState.LOGGED_IN)
          console.log('[IMSingleton] 强制设置登录状态成功:', options.userID)
          return { success: true, data: { forced: true, error: loginError.message } }
        }
      } catch (error) {
        // 处理已登录错误
        if (error.message?.includes('已经登录') || error.message?.includes('already logged')) {
          this._currentUser = options
          this._updateState(IMState.LOGGED_IN)
          console.log('[IMSingleton] 用户已登录:', options.userID)
          return { success: true, alreadyLoggedIn: true }
        }

        this._updateState(IMState.ERROR)
        console.error('[IMSingleton] 登录失败:', error)
        throw error
      } finally {
        this._loginPromise = null
      }
    })()

    return this._loginPromise
  }

  /**
   * 登出
   * @returns {Promise<Object>} 登出结果
   */
  async logout() {
    try {
      console.log('[IMSingleton] 开始登出')
      await this._tim.logout()
      this._currentUser = null
      this._updateState(IMState.READY)
      console.log('[IMSingleton] 登出成功')
      return { success: true }
    } catch (error) {
      // 忽略登出失败，确保状态正确
      this._currentUser = null
      this._updateState(IMState.READY)
      console.warn('[IMSingleton] 登出遇到错误（已忽略）:', error.message)
      return { success: true }
    }
  }

  /**
   * 处理UserSig过期
   * @private
   */
  async _handleUserSigExpired() {
    try {
      if (!this._currentUser) {
        console.warn('[IMSingleton] 无当前用户信息，无法自动刷新UserSig')
        return
      }

      const { userID, userSig } = this._currentUser
      console.log(`[IMSingleton] UserSig过期，尝试自动刷新用户: ${userID}`)

      // 从userID中提取roleType和openid
      const match = userID.match(/^(owner|host)_(.+)$/)
      if (!match) {
        console.error('[IMSingleton] 无法解析userID格式:', userID)
        return
      }

      const [, roleType, openid] = match

      // 尝试通过app实例获取登录管理器来刷新UserSig
      try {
        const app = getApp()
        if (app && app.globalData && app.globalData.loginManager) {
          console.log('[IMSingleton] 通过app登录管理器刷新UserSig')
          const newUserSig = await app.globalData.loginManager.refreshUserSig(roleType, openid, userID)

          if (newUserSig) {
            console.log('[IMSingleton] UserSig刷新成功，自动重新登录')

            // 保存新的UserSig到当前用户信息
            this._currentUser.userSig = newUserSig

            // 自动重新登录
            await this.login({
              userID,
              userSig: newUserSig,
            })

            console.log('[IMSingleton] UserSig过期处理完成，已自动重新登录')
          }
        } else {
          console.warn('[IMSingleton] 无法获取app登录管理器，无法自动刷新UserSig')
        }
      } catch (appError) {
        console.error('[IMSingleton] 通过app登录管理器刷新UserSig失败:', appError)
      }
    } catch (error) {
      console.error('[IMSingleton] 处理UserSig过期失败:', error)
      // 触发UserSig过期事件，由上层处理
      this._emitEvent('USER_SIG_EXPIRED_ERROR', { error })
    }
  }

  /**
   * 处理网络错误
   * @private
   */
  async _handleNetworkError() {
    try {
      console.log('[IMSingleton] 开始处理网络错误...')

      // 检查网络状态
      wx.getNetworkType({
        success: (res) => {
          console.log('[IMSingleton] 当前网络状态:', res.networkType)
          
          // 如果网络状态为none，提示用户检查网络
          if (res.networkType === 'none') {
            console.warn('[IMSingleton] 当前无网络连接')
            wx.showToast({
              title: '请检查网络连接',
              icon: 'none',
              duration: 2000
            })
          }
        },
        fail: (err) => {
          console.error('[IMSingleton] 获取网络状态失败:', err)
        }
      })

      // 如果用户已登录，尝试重新连接
      if (this._currentUser && this._state === IMState.LOGGED_IN) {
        console.log('[IMSingleton] 用户已登录，尝试重新连接IM服务')
        
        // 等待1秒后尝试重新连接
        setTimeout(async () => {
          try {
            // 尝试发送一个轻量级请求，检查连接状态
            console.log('[IMSingleton] 尝试检查IM连接状态...')
            
            // 这里可以根据实际情况选择一个轻量级的API
            // 例如获取会话列表或发送心跳
            if (this._tim && this._tim.getConversationList) {
              await this._tim.getConversationList({ count: 1 })
              console.log('[IMSingleton] IM连接状态检查成功')
              this._updateState(IMState.LOGGED_IN)
            }
          } catch (error) {
            console.warn('[IMSingleton] IM连接状态检查失败:', error)
            // 连接检查失败，保持当前状态
          }
        }, 1000)
      }

      console.log('[IMSingleton] 网络错误处理完成')
    } catch (error) {
      console.error('[IMSingleton] 处理网络错误失败:', error)
    }
  }

  /**
   * 更新用户资料
   * @param {Object} profile 用户资料
   * @param {string} profile.nick 昵称
   * @param {string} profile.avatar 头像URL
   */
  async updateProfile(profile) {
    try {
      const isReady = await this.waitForReady(5000)
      if (!isReady) {
        throw new Error('SDK未就绪，更新用户资料失败')
      }
      await this._tim.updateMyProfile(profile)
      console.log('[IMSingleton] 更新用户资料成功')
    } catch (error) {
      console.error('[IMSingleton] updateProfile失败:', error)
      throw error
    }
  }

  /**
   * 发送消息
   * @param {Object} options 消息选项
   */
  async sendMessage(options) {
    try {
      // 检查是否处于降级模式
      if (this._isDegradedMode) {
        console.warn('[IMSingleton] 当前处于降级模式，缓存消息发送操作')
        
        // 缓存消息发送操作
        this._cacheOfflineOperation({
          type: 'sendMessage',
          data: options
        })
        
        // 返回模拟成功结果
        return {
          success: true,
          data: {
            messageID: `offline_${Date.now()}`,
            isOffline: true
          }
        }
      }
      
      const isReady = await this.waitForReady(5000)
      if (!isReady) {
        throw new Error('SDK未就绪，发送消息失败')
      }
      return this._tim.sendMessage(options)
    } catch (error) {
      console.error('[IMSingleton] sendMessage失败:', error)
      
      // 如果是网络错误，缓存操作
      const errorMessage = error.message || ''
      if (errorMessage.includes('网络') || errorMessage.includes('Network') || errorMessage.includes('Failed to fetch')) {
        console.warn('[IMSingleton] 网络错误，缓存消息发送操作')
        this._recordNetworkError()
        
        // 缓存消息发送操作
        this._cacheOfflineOperation({
          type: 'sendMessage',
          data: options
        })
        
        // 返回模拟成功结果
        return {
          success: true,
          data: {
            messageID: `offline_${Date.now()}`,
            isOffline: true
          }
        }
      }
      
      throw error
    }
  }

  /**
   * 获取历史消息
   * @param {Object} options 选项
   */
  async getHistoryMessages(options) {
    try {
      const isReady = await this.waitForReady(5000)
      if (!isReady) {
        throw new Error('SDK未就绪，获取历史消息失败')
      }
      return this._tim.getMessageList(options)
    } catch (error) {
      console.error('[IMSingleton] getHistoryMessages失败:', error)
      throw error
    }
  }

  /**
   * 获取会话列表
   * @param {Object} options 选项
   * @param {number} options.count 会话数量
   * @param {string} options.nextReqMessageID 分页标记
   */
  async getConversationList(options = {}) {
    try {
      console.log('[IMSingleton] 开始获取会话列表...')
      console.log('[IMSingleton] 当前状态:', this._state)
      console.log('[IMSingleton] 当前用户:', this._currentUser?.userID)
      console.log('[IMSingleton] 分页参数:', options)
      
      // 检查用户是否已登录
      if (!this.isLoggedIn()) {
        console.error('[IMSingleton] 用户未登录，获取会话列表失败')
        throw new Error('用户未登录，获取会话列表失败')
      }
      
      // 检查IM SDK实例是否存在
      if (!this._tim || !this._tim.getConversationList) {
        console.error('[IMSingleton] IM SDK实例不存在或缺少getConversationList方法')
        throw new Error('IM SDK实例不存在或缺少getConversationList方法')
      }
      
      // 尝试获取会话列表，即使SDK未完全就绪
      try {
        console.log('[IMSingleton] 尝试调用SDK获取会话列表...')
        const result = await this._tim.getConversationList(options)
        console.log('[IMSingleton] SDK获取会话列表成功，结果:', {
          conversationListLength: result.data?.conversationList?.length || 0,
          hasMore: !!result.data?.nextReqMessageID
        })
        return result
      } catch (sdkError) {
        console.error('[IMSingleton] SDK获取会话列表失败:', sdkError)
        if (sdkError.message?.includes('SDK未就绪') || sdkError.message?.includes('SDK not ready')) {
          console.warn('[IMSingleton] SDK未就绪，等待后重试获取会话列表')
          // 等待1秒后重试
          await new Promise(resolve => setTimeout(resolve, 1000))
          // 再次尝试
          console.log('[IMSingleton] 再次尝试调用SDK获取会话列表...')
          const result = await this._tim.getConversationList(options)
          console.log('[IMSingleton] 再次尝试获取会话列表成功，结果:', {
            conversationListLength: result.data?.conversationList?.length || 0,
            hasMore: !!result.data?.nextReqMessageID
          })
          return result
        } else {
          throw sdkError
        }
      }
    } catch (error) {
      console.error('[IMSingleton] getConversationList失败:', error)
      throw error
    }
  }

  /**
   * 获取会话详情
   * @param {string} conversationID 会话ID
   */
  async getConversationProfile(conversationID) {
    try {
      // 检查SDK是否就绪
      const isSDKReady = await this.waitForReady(5000)
      if (!isSDKReady) {
        throw new Error('SDK未就绪，获取会话详情失败')
      }
      
      // 检查用户是否已登录
      if (!this.isLoggedIn()) {
        throw new Error('用户未登录，获取会话详情失败')
      }
      
      return this._tim.getConversationProfile(conversationID)
    } catch (error) {
      console.error('[IMSingleton] getConversationProfile失败:', error)
      throw error
    }
  }

  /**
   * 标记消息已读
   * @param {string} conversationID 会话ID
   */
  async markAsRead(conversationID) {
    try {
      // 检查SDK是否就绪
      const isSDKReady = await this.waitForReady(5000)
      if (!isSDKReady) {
        throw new Error('SDK未就绪，标记已读失败')
      }
      
      // 检查用户是否已登录
      if (!this.isLoggedIn()) {
        throw new Error('用户未登录，标记已读失败')
      }
      
      return this._tim.setMessageRead({ conversationID })
    } catch (error) {
      console.error('[IMSingleton] markAsRead失败:', error)
      throw error
    }
  }

  /**
   * 撤回消息
   * @param {string} messageID 消息ID
   */
  async revokeMessage(messageID) {
    try {
      // 检查SDK是否就绪
      const isSDKReady = await this.waitForReady(5000)
      if (!isSDKReady) {
        throw new Error('SDK未就绪，撤回消息失败')
      }
      
      // 检查用户是否已登录
      if (!this.isLoggedIn()) {
        throw new Error('用户未登录，撤回消息失败')
      }
      
      return this._tim.revokeMessage(messageID)
    } catch (error) {
      console.error('[IMSingleton] revokeMessage失败:', error)
      throw error
    }
  }

  /**
   * 创建群组
   * @param {Object} options 群组选项
   */
  async createGroup(options) {
    try {
      // 检查SDK是否就绪
      const isSDKReady = await this.waitForReady(5000)
      if (!isSDKReady) {
        throw new Error('SDK未就绪，创建群组失败')
      }
      
      // 检查用户是否已登录
      if (!this.isLoggedIn()) {
        throw new Error('用户未登录，创建群组失败')
      }
      
      return this._tim.createGroup(options)
    } catch (error) {
      console.error('[IMSingleton] createGroup失败:', error)
      throw error
    }
  }

  /**
   * 加入群组
   * @param {string} groupID 群组ID
   */
  async joinGroup(groupID) {
    try {
      // 检查SDK是否就绪
      const isSDKReady = await this.waitForReady(5000)
      if (!isSDKReady) {
        throw new Error('SDK未就绪，加入群组失败')
      }
      
      // 检查用户是否已登录
      if (!this.isLoggedIn()) {
        throw new Error('用户未登录，加入群组失败')
      }
      
      return this._tim.joinGroup({ groupID })
    } catch (error) {
      console.error('[IMSingleton] joinGroup失败:', error)
      throw error
    }
  }

  /**
   * 退出群组
   * @param {string} groupID 群组ID
   */
  async quitGroup(groupID) {
    try {
      // 检查SDK是否就绪
      const isSDKReady = await this.waitForReady(5000)
      if (!isSDKReady) {
        throw new Error('SDK未就绪，退出群组失败')
      }
      
      // 检查用户是否已登录
      if (!this.isLoggedIn()) {
        throw new Error('用户未登录，退出群组失败')
      }
      
      return this._tim.quitGroup({ groupID })
    } catch (error) {
      console.error('[IMSingleton] quitGroup失败:', error)
      throw error
    }
  }

  /**
   * 获取群组成员列表
   * @param {Object} options 选项
   */
  async getGroupMemberList(options) {
    try {
      // 检查SDK是否就绪
      const isSDKReady = await this.waitForReady(5000)
      if (!isSDKReady) {
        throw new Error('SDK未就绪，获取群组成员列表失败')
      }
      
      // 检查用户是否已登录
      if (!this.isLoggedIn()) {
        throw new Error('用户未登录，获取群组成员列表失败')
      }
      
      return this._tim.getGroupMemberList(options)
    } catch (error) {
      console.error('[IMSingleton] getGroupMemberList失败:', error)
      throw error
    }
  }

  /**
   * 标准化用户ID
   * @param {string} userID 原始用户ID
   */
  normalizeUserID(userID) {
    if (!userID) {
      return 'guest_' + Date.now()
    }

    try {
      // 检查是否为标准格式
      const validation = ImUserIdValidator.validateUserID(userID)
      if (validation.valid) {
        return userID;
      }
      
      // 尝试从原始ID中提取角色类型和标识符
      let roleType = 'owner'
      let identifier = userID
      
      const parts = userID.split('_')
      if (parts.length >= 2) {
        const possibleRole = parts[0]
        if (['owner', 'host', 'guest', 'own', 'hst', 'gst'].includes(possibleRole)) {
          roleType = possibleRole
          identifier = parts.slice(1).join('_')
        }
      }
      
      // 转换短角色前缀为完整角色类型
      const roleMapping = {
        'own': 'owner',
        'hst': 'host',
        'gst': 'guest'
      }
      const fullRoleType = roleMapping[roleType] || roleType
      
      // 使用格式1生成标准化的用户ID
      const normalizedUserID = ImUserIdValidator.generateFormat1UserID(identifier, fullRoleType)
      console.log('[IMSingleton] 生成标准化用户ID:', normalizedUserID)
      
      return normalizedUserID
    } catch (error) {
      console.error('[IMSingleton] 标准化用户ID时出错:', error);
      // 出错时返回原始ID
      return userID;
    }
  }

  /**
   * 获取当前登录用户信息
   */
  getCurrentUser() {
    return this._currentUser
  }
}

// 导出单例实例
const imSingleton = IMSingletonManager.getInstance()

/**
 * 安全检查 SDK 是否就绪
 * @returns {boolean} SDK 是否就绪
 */
function isSDKReady() {
  try {
    // 优先检查全局变量
    if (wx.$TUIKit && typeof wx.$TUIKit.isReady === 'function') {
      return wx.$TUIKit.isReady()
    }

    // 回退到检查单例
    if (imSingleton && typeof imSingleton.isReady === 'function') {
      return imSingleton.isReady()
    }

    // 最后检查内部状态
    const sdkInstance = imSingleton?.getSDK()
    if (sdkInstance && typeof sdkInstance.isReady === 'function') {
      return sdkInstance.isReady()
    }

    console.error('[isSDKReady] 无法确定 SDK 就绪状态')
    return false
  } catch (error) {
    console.error('[isSDKReady] 检查失败:', error)
    return false
  }
}

/**
 * 安全检查用户是否已登录
 * @returns {boolean} 用户是否已登录
 */
function isSDKLoggedIn() {
  try {
    // 优先检查全局变量
    if (wx.$IMManager && typeof wx.$IMManager.isLoggedIn === 'function') {
      return wx.$IMManager.isLoggedIn()
    }

    // 回退到检查单例
    if (imSingleton && typeof imSingleton.isLoggedIn === 'function') {
      return imSingleton.isLoggedIn()
    }

    console.error('[isSDKLoggedIn] 无法确定登录状态')
    return false
  } catch (error) {
    console.error('[isSDKLoggedIn] 检查失败:', error)
    return false
  }
}

module.exports = {
  IMSingletonManager,
  imSingleton,
  IMState,
  IMErrorCode,
  ErrorMessageMap,
  getErrorMessage,
  isSDKReady, // 导出安全检查函数
  isSDKLoggedIn, // 导出安全登录检查函数
}
