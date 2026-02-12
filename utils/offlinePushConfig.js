/**
 * 离线消息推送配置
 * 
 * 功能：
 * 1. 配置腾讯云IM离线推送
 * 2. 支持多平台推送（iOS APNs、Android FCM/厂商通道）
 * 3. 支持推送通知栏显示
 * 4. 支持自定义推送标题和内容
 * 
 * 使用方法：
 * 在IM登录成功后调用 initOfflinePush() 初始化推送配置
 */

class OfflinePushConfig {
  constructor() {
    this._initialized = false
    this._pushToken = null
    this._platform = ''
    this._config = {
      // iOS推送配置
      ios: {
        // APNs推送配置
        token: '',
        // 消息推送角标
        badge: true,
        // 播放声音
        sound: true,
        // 自定义提示音
        customSound: '',
      },
      // Android推送配置
      android: {
        // 厂商通道（小米、华为、OPPO、VIVO等）
        channelID: 'default',
        channelName: '默认通知渠道',
        // 消息推送角标
        badge: true,
        // 播放声音
        sound: true,
        // 震动
        vibrate: true,
      },
      // 通用配置
      common: {
        // 是否推送离线消息
        enabled: true,
        // 消息推送标题
        title: '宠物寄养',
        // 点击通知栏跳转页面
        openUrl: 'pages/messages/chat/chat',
        // 自定义数据
        customData: {},
      },
    }
    
    console.log('[OfflinePushConfig] 初始化完成')
  }
  
  /**
   * 初始化离线推送
   * @returns {Promise<boolean>} 是否初始化成功
   */
  async initOfflinePush() {
    try {
      if (this._initialized) {
        console.log('[OfflinePushConfig] 离线推送已初始化')
        return true
      }
      
      // 检查IM是否已初始化
      if (!wx.$TUIKit || !wx.$IMManager) {
        console.error('[OfflinePushConfig] IM未初始化，无法配置离线推送')
        return false
      }
      
      // 获取当前平台
      this._platform = await this._detectPlatform()
      
      // 根据平台初始化推送配置
      switch (this._platform) {
      case 'ios':
        await this._initIOSPush()
        break
      case 'android':
        await this._initAndroidPush()
        break
      default:
        console.warn('[OfflinePushConfig] 未知平台，跳过离线推送初始化')
      }
      
      // 注册推送Token
      await this._registerPushToken()
      
      this._initialized = true
      console.log('[OfflinePushConfig] 离线推送初始化成功')
      
      return true
    } catch (error) {
      console.error('[OfflinePushConfig] 离线推送初始化失败:', error)
      return false
    }
  }
  
  /**
   * 检测当前平台
   * @private
   * @returns {Promise<string>} 平台类型
   */
  async _detectPlatform() {
    return new Promise((resolve) => {
      wx.getSystemInfo({
        success: (res) => {
          const platform = res.platform
          console.log(`[OfflinePushConfig] 检测到平台: ${platform}`)
          resolve(platform)
        },
        fail: () => {
          console.warn('[OfflinePushConfig] 获取平台信息失败，默认为未知平台')
          resolve('unknown')
        },
      })
    })
  }
  
  /**
   * 初始化iOS推送
   * @private
   */
  async _initIOSPush() {
    try {
      console.log('[OfflinePushConfig] 初始化iOS推送配置')
      
      // 请求推送权限
      const authResult = await this._requestIOSPushPermission()
      
      if (!authResult.granted) {
        console.warn('[OfflinePushConfig] 用户未授权推送权限')
        return
      }
      
      // 获取APNs Token
      const token = await this._getAPNSToken()
      if (token) {
        this._config.ios.token = token
        this._pushToken = token
        console.log('[OfflinePushConfig] APNs Token获取成功')
      }
    } catch (error) {
      console.error('[OfflinePushConfig] 初始化iOS推送失败:', error)
    }
  }
  
  /**
   * 初始化Android推送
   * @private
   */
  async _initAndroidPush() {
    try {
      console.log('[OfflinePushConfig] 初始化Android推送配置')
      
      // 在Android平台上，微信小程序使用微信推送
      // 不需要额外配置，微信会自动处理推送
      console.log('[OfflinePushConfig] Android推送配置由微信自动处理')
    } catch (error) {
      console.error('[OfflinePushConfig] 初始化Android推送失败:', error)
    }
  }
  
  /**
   * 请求iOS推送权限
   * @private
   * @returns {Promise<Object>} 权限请求结果
   */
  async _requestIOSPushPermission() {
    return new Promise((resolve) => {
      wx.requestSubscribeMessage({
        tmplIds: [], // 消息订阅模板ID（如果需要）
        success: (res) => {
          console.log('[OfflinePushConfig] iOS推送权限请求成功:', res)
          resolve({ granted: true })
        },
        fail: (error) => {
          console.warn('[OfflinePushConfig] iOS推送权限请求失败:', error)
          resolve({ granted: false })
        },
      })
    })
  }
  
  /**
   * 获取APNs Token
   * @private
   * @returns {Promise<string|null>} APNs Token
   */
  async _getAPNSToken() {
    return new Promise((resolve) => {
      // 微信小程序环境下，APNs Token由微信管理
      // 不需要直接获取，微信会自动注册
      console.log('[OfflinePushConfig] APNs Token由微信管理')
      resolve(null)
    })
  }
  
  /**
   * 注册推送Token到IM
   * @private
   */
  async _registerPushToken() {
    try {
      if (!wx.$TUIKit || !wx.$IMManager) {
        console.error('[OfflinePushConfig] IM未初始化，无法注册推送Token')
        return
      }
      
      // 在微信小程序环境中，推送由微信自动处理
      // 不需要手动注册Token
      console.log('[OfflinePushConfig] 微信小程序环境，推送由微信自动处理')
    } catch (error) {
      console.error('[OfflinePushConfig] 注册推送Token失败:', error)
    }
  }
  
  /**
   * 设置离线推送配置
   * @param {Object} config - 推送配置
   * @param {boolean} config.enabled - 是否启用推送
   * @param {string} config.title - 推送标题
   * @param {string} config.openUrl - 点击跳转页面
   */
  setPushConfig(config) {
    try {
      if (config.enabled !== undefined) {
        this._config.common.enabled = config.enabled
      }
      if (config.title) {
        this._config.common.title = config.title
      }
      if (config.openUrl) {
        this._config.common.openUrl = config.openUrl
      }
      if (config.customData) {
        this._config.common.customData = { ...this._config.common.customData, ...config.customData }
      }
      
      console.log('[OfflinePushConfig] 推送配置已更新:', this._config.common)
    } catch (error) {
      console.error('[OfflinePushConfig] 更新推送配置失败:', error)
    }
  }
  
  /**
   * 获取推送配置
   * @returns {Object} 推送配置
   */
  getPushConfig() {
    return {
      ...this._config.common,
      platform: this._platform,
      initialized: this._initialized,
    }
  }
  
  /**
   * 设置推送角标
   * @param {number} badge - 角标数量
   */
  async setBadge(badge) {
    try {
      // 微信小程序不支持设置应用角标
      // 可以使用微信的tabBar徽标来模拟
      if (typeof wx.setTabBarBadge === 'function') {
        if (badge > 0) {
          wx.setTabBarBadge({
            text: badge > 99 ? '99+' : badge.toString(),
          })
        } else {
          wx.removeTabBarBadge()
        }
      }
      
      console.log(`[OfflinePushConfig] 角标已设置: ${badge}`)
    } catch (error) {
      console.error('[OfflinePushConfig] 设置角标失败:', error)
    }
  }
  
  /**
   * 清除所有角标
   */
  async clearBadge() {
    try {
      if (typeof wx.removeTabBarBadge === 'function') {
        wx.removeTabBarBadge()
      }
      
      console.log('[OfflinePushConfig] 角标已清除')
    } catch (error) {
      console.error('[OfflinePushConfig] 清除角标失败:', error)
    }
  }
  
  /**
   * 配置消息推送选项
   * @param {string} conversationType - 会话类型（C2C/GROUP）
   * @param {Object} options - 推送选项
   * @returns {Object} 推送选项对象
   */
  getOfflinePushOptions(conversationType, options = {}) {
    if (!this._config.common.enabled) {
      return {
        offlinePushInfo: {
          disablePush: true, // 禁用推送
        },
      }
    }
    
    const pushInfo = {
      title: this._config.common.title,
      desc: '', // 推送描述，由调用方设置
      ext: JSON.stringify({
        ...this._config.common.customData,
        conversationType,
        openUrl: this._config.common.openUrl,
        timestamp: Date.now(),
      }),
      androidSound: this._config.android.sound ? 'default' : '',
      androidVibrate: this._config.android.vibrate ? 1 : 0,
      androidOPPOChannelID: this._config.android.channelID,
      androidVIVOClassification: 1,
      androidFCMChannelID: this._config.android.channelID,
      iosSound: this._config.ios.sound ? 'default' : '',
      iosBadgeType: this._config.ios.badge ? 0 : -1, // 0为计数，-1为不显示
    }
    
    // 如果传入了自定义选项，覆盖默认值
    if (options.title) {
      pushInfo.title = options.title
    }
    if (options.desc) {
      pushInfo.desc = options.desc
    }
    if (options.ext) {
      pushInfo.ext = JSON.stringify({
        ...JSON.parse(pushInfo.ext || '{}'),
        ...options.ext,
      })
    }
    
    return {
      offlinePushInfo: pushInfo,
    }
  }
  
  /**
   * 处理离线推送通知
   * @param {Object} notification - 通知对象
   */
  handleOfflinePush(notification) {
    try {
      console.log('[OfflinePushConfig] 收到离线推送通知:', notification)
      
      // 解析自定义数据
      let customData = {}
      try {
        if (notification.ext) {
          customData = JSON.parse(notification.ext)
        }
      } catch (error) {
        console.warn('[OfflinePushConfig] 解析自定义数据失败:', error)
      }
      
      // 跳转到指定页面
      if (customData.openUrl) {
        wx.navigateTo({
          url: customData.openUrl,
          fail: () => {
            // 如果navigateTo失败，尝试使用switchTab
            wx.switchTab({
              url: customData.openUrl,
            })
          },
        })
      }
    } catch (error) {
      console.error('[OfflinePushConfig] 处理离线推送失败:', error)
    }
  }
  
  /**
   * 销毁配置
   */
  destroy() {
    this._initialized = false
    this._pushToken = null
    this._platform = ''
    console.log('[OfflinePushConfig] 配置已销毁')
  }
}

// 创建单例实例
const offlinePushConfig = new OfflinePushConfig()

module.exports = offlinePushConfig
