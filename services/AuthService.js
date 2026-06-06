/**
 * AuthService - 微信小程序授权登录服务
 *
 * 严格按照微信小程序官方授权登录流程实现：
 * 1. 用户主动触发登录（点击登录按钮）
 * 2. 用户授权头像和昵称（<button open-type="chooseAvatar"> + <input type="nickname">）
 * 3. 调用 wx.login() 确保微信登录态有效
 * 4. 调用云函数，通过 cloud.getWXContext() 获取 openid，创建/更新用户记录
 *
 * 微信官方授权登录流程（云开发版）：
 *   用户点击授权 → 选择头像 + 输入昵称 → wx.login() → 调用云函数 → cloud.getWXContext() 获取 openid
 *
 * 登录状态管理：
 * - globalData.isLoggedIn: 是否已登录
 * - globalData.userInfo: 用户信息
 * - Storage 'central:isLogout': 退出标记
 * - Storage 'central:loginExpiry': 登录过期时间
 * - Storage 'central:userInfo': 用户信息缓存
 */

const { IS_LOGOUT, LOGIN_EXPIRY, USER_INFO } = require('../config/storageKeys')

const LOGIN_EXPIRY_MS = 7 * 24 * 3600 * 1000

class AuthService {
  constructor() {
    this._initialized = false
    this._loginPromise = null
  }

  _wxLogin() {
    return new Promise((resolve, reject) => {
      wx.login({
        success: (res) => {
          if (res.code) {
            console.log('[AuthService] wx.login 成功')
            resolve(res.code)
          } else {
            console.error('[AuthService] wx.login 失败:', res.errMsg)
            reject(new Error('wx.login 失败: ' + res.errMsg))
          }
        },
        fail: (err) => {
          console.error('[AuthService] wx.login 调用失败:', err)
          reject(new Error('wx.login 调用失败'))
        }
      })
    })
  }

  _wxCheckSession() {
    return new Promise((resolve) => {
      wx.checkSession({
        success: () => {
          console.log('[AuthService] wx.checkSession: 微信会话有效')
          resolve(true)
        },
        fail: () => {
          console.log('[AuthService] wx.checkSession: 微信会话已过期')
          resolve(false)
        },
      })
    })
  }

  async _ensureWxSession() {
    const sessionValid = await this._wxCheckSession()
    if (sessionValid) {
      return true
    }

    console.log('[AuthService] 微信会话已过期，重新 wx.login()')
    try {
      await this._wxLogin()
      return true
    } catch (error) {
      console.warn('[AuthService] wx.login 刷新会话失败:', error.message)
      return false
    }
  }

  async tryRestoreSession() {
    const app = getApp()

    const isLogout = wx.getStorageSync(IS_LOGOUT)
    if (isLogout) {
      console.log('[AuthService] 用户已主动退出，不恢复会话')
      return false
    }

    const loginExpiry = wx.getStorageSync(LOGIN_EXPIRY)
    if (!loginExpiry || Date.now() >= loginExpiry) {
      console.log('[AuthService] 登录态已过期，不恢复会话')
      wx.removeStorageSync(USER_INFO)
      wx.removeStorageSync(LOGIN_EXPIRY)
      return false
    }

    const cachedUserInfo = wx.getStorageSync(USER_INFO)
    if (!cachedUserInfo || !cachedUserInfo.openid) {
      console.log('[AuthService] 无有效缓存用户信息，不恢复会话')
      return false
    }

    app.globalData.userInfo = cachedUserInfo
    app.globalData.isLoggedIn = true

    this._initialized = true

    this._refreshAdminStatus(app)

    console.log('[AuthService] 从缓存恢复会话成功')
    return true
  }

  async login(options = {}) {
    const app = getApp()
    console.log('[AuthService] 开始授权登录')

    if (this._loginPromise) {
      return this._loginPromise
    }

    this._loginPromise = this._doLogin(app, options)
    try {
      const result = await this._loginPromise
      return result
    } finally {
      this._loginPromise = null
    }
  }

  async _doLogin(app, options = {}) {
    try {
      try {
        await this._wxLogin()
      } catch (wxLoginError) {
        console.warn('[AuthService] wx.login 失败，仍尝试调用云函数:', wxLoginError.message)
      }

      const cloudData = await this._doCloudLogin(app, options)
      if (!cloudData.success) {
        return cloudData
      }

      this._initialized = true

      try {
        wx.removeStorageSync(IS_LOGOUT)
        app.globalData.isLogout = false
      } catch (e) {
        console.warn('[AuthService] 清除退出标记失败:', e)
      }

      console.log('[AuthService] 授权登录完成')

      return { success: true, message: '登录成功' }
    } catch (error) {
      console.error('[AuthService] 授权登录失败:', error)
      return { success: false, message: error.message || '登录失败' }
    }
  }

  async _doCloudLogin(app, options = {}) {
    try {
      console.log('[AuthService] 调用云函数登录')

      const inviterId = app.globalData.pendingInviterId || wx.getStorageSync('pendingInviterId') || ''

      let userInfo = options.userInfo || null
      if (!userInfo && (options.nickName || options.avatarUrl)) {
        userInfo = {
          nickName: options.nickName || '',
          avatarUrl: options.avatarUrl || '',
        }
      }

      const res = await wx.cloud.callFunction({
        name: 'userService',
        data: {
          action: 'login',
          userInfo,
          inviterId,
        },
        timeout: 20000
      })

      if (!res.result || res.result.code !== 0) {
        throw new Error(res.result?.message || '云函数调用失败')
      }

      const { user, isNewUser } = res.result.data

      console.log('[AuthService] 云函数返回:', {
        hasUser: !!user,
        isNewUser,
      })

      if (!user || !user.openid) {
        throw new Error('云函数未返回有效的用户信息，可能微信登录态无效')
      }

      this._applyToGlobal(app, {
        userInfo: user,
      })

      this._persistLoginState(user)

      if (inviterId) {
        app.globalData.pendingInviterId = ''
        wx.removeStorageSync('pendingInviterId')
      }

      return { success: true, user, isNewUser }
    } catch (error) {
      console.error('[AuthService] 云函数登录失败:', error)
      throw error
    }
  }

  _applyToGlobal(app, data) {
    app.globalData.userInfo = data.userInfo
    app.globalData.isLoggedIn = true

    console.log('[AuthService] 已更新 globalData:', {
      hasUserInfo: !!data.userInfo,
    })
  }

  async _refreshAdminStatus(app) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'userService',
        data: { action: 'checkAdminStatus' },
        timeout: 20000
      })
      if (res.result && res.result.code === 0 && res.result.data) {
        const { isPartner } = res.result.data
        if (app.globalData.userInfo) {
          const changed = app.globalData.userInfo.isPartner !== isPartner
          app.globalData.userInfo.isPartner = isPartner || false
          const cached = wx.getStorageSync(USER_INFO)
          if (cached) {
            cached.isPartner = isPartner || false
            wx.setStorageSync(USER_INFO, cached)
          }
          if (changed && typeof app._notifySessionRestored === 'function') {
            app._notifySessionRestored()
          }
        }
      }
    } catch (e) {
      console.warn('[AuthService] 刷新合作伙伴状态失败:', e.message)
    }
  }

  _persistLoginState(user) {
    try {
      wx.setStorageSync(LOGIN_EXPIRY, Date.now() + LOGIN_EXPIRY_MS)
      wx.setStorageSync(USER_INFO, {
        _id: user.openid,
        openid: user.openid,
        nickName: user.nickName || '',
        avatarUrl: user.avatarUrl || '',
        hasPhone: user.hasPhone || false,
        role: user.role || 'user',
        isPartner: user.isPartner || false,
      })
    } catch (e) {
      console.warn('[AuthService] 持久化登录状态失败:', e)
    }
  }

  _syncUserInfoToGlobal(updatedInfo) {
    const app = getApp()
    if (app.globalData.userInfo) {
      app.globalData.userInfo = { ...app.globalData.userInfo, ...updatedInfo }
    }
    try {
      const cached = wx.getStorageSync(USER_INFO) || {}
      wx.setStorageSync(USER_INFO, { ...cached, ...updatedInfo })
    } catch (e) {
      console.warn('[AuthService] 同步缓存失败:', e)
    }
  }

  getCurrentIdentity() {
    const app = getApp()
    return app.globalData.userInfo || null
  }

  isLoggedIn() {
    const app = getApp()
    const result = !!(app.globalData.isLoggedIn && app.globalData.userInfo)
    console.log('[AuthService] isLoggedIn:', result, {
      hasIsLoggedIn: !!app.globalData.isLoggedIn,
      hasUserInfo: !!app.globalData.userInfo,
    })
    return result
  }

  async startLogin() {
    const loggedIn = this.isLoggedIn()
    console.log('[AuthService] startLogin, isLoggedIn:', loggedIn)

    if (loggedIn) {
      return this.login({})
    }

    try {
      if (typeof wx.requirePrivacyAuthorize === 'function') {
        await wx.requirePrivacyAuthorize()
      }
    } catch (e) {
      const errMsg = (e && (e.errMsg || e.message || '')) || ''
      if (errMsg.includes('cancel') || errMsg.includes('disagree')) {
        return { success: false, message: '需要同意隐私协议' }
      }
    }

    wx.navigateTo({
      url: '/subpackages/profile/login/index',
    })
  }

  async logout() {
    const app = getApp()
    console.log('[AuthService] 开始退出登录')

    try {
      wx.setStorageSync(IS_LOGOUT, true)
      wx.removeStorageSync(LOGIN_EXPIRY)
      wx.removeStorageSync(USER_INFO)
    } catch (e) {
      console.warn('[AuthService] 设置退出标记失败:', e)
    }

    app.globalData.userInfo = null
    app.globalData.isLoggedIn = false
    app.globalData.isLogout = true

    this._initialized = false
    this._loginPromise = null

    console.log('[AuthService] 退出登录完成')
    return { success: true, message: '退出登录成功' }
  }
}

const authService = new AuthService()

module.exports = {
  authService,
}
