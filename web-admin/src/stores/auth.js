import { defineStore } from 'pinia'
import { webLogin, createScanLogin, pollScanLogin } from '@/api/auth'
import router from '@/router'

function isTokenExpired(token) {
  if (!token) {return true}
  try {
    const parts = token.split('.')
    if (parts.length !== 3) {return true}
    let payload = parts[1]
    const pad = payload.length % 4
    if (pad) {payload += '='.repeat(4 - pad)}
    const decoded = JSON.parse(atob(payload))
    if (!decoded.exp) {return false}
    return decoded.exp * 1000 < Date.now()
  } catch (e) {
    return true
  }
}

function getTokenExpiry(token) {
  if (!token) {return 0}
  try {
    const parts = token.split('.')
    if (parts.length !== 3) {return 0}
    let payload = parts[1]
    const pad = payload.length % 4
    if (pad) {payload += '='.repeat(4 - pad)}
    const decoded = JSON.parse(atob(payload))
    return decoded.exp ? decoded.exp * 1000 : 0
  } catch (e) {
    return 0
  }
}

let _refreshTimer = null

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem('token') || '',
    admin: JSON.parse(localStorage.getItem('admin') || 'null'),
  }),
  getters: {
    isLoggedIn: state => Boolean(state.token) && !isTokenExpired(state.token),
  },
  actions: {
    async login(username, password) {
      const res = await webLogin(username, password)
      const { token, admin } = res.data
      this.token = token
      this.admin = admin
      localStorage.setItem('token', token)
      localStorage.setItem('admin', JSON.stringify(admin))
      this._scheduleTokenRefresh()
    },
    async scanLogin(loginToken) {
      const res = await pollScanLogin(loginToken)
      if (res.data.status === 'confirmed') {
        const { token, admin } = res.data
        this.token = token
        this.admin = admin
        localStorage.setItem('token', token)
        localStorage.setItem('admin', JSON.stringify(admin))
        this._scheduleTokenRefresh()
        return 'confirmed'
      }
      return res.data.status
    },
    logout() {
      this.token = ''
      this.admin = null
      localStorage.removeItem('token')
      localStorage.removeItem('admin')
      this._cancelTokenRefresh()
      router.push('/login')
    },
    // Web 端只有超级管理员登录，已登录即有全部权限
    hasPermission() {
      return this.isLoggedIn
    },
    // 安排 token 刷新（在过期前 5 分钟刷新）
    _scheduleTokenRefresh() {
      this._cancelTokenRefresh()
      const expiry = getTokenExpiry(this.token)
      if (!expiry) {return}
      
      const now = Date.now()
      const refreshIn = expiry - now - 5 * 60 * 1000 // 过期前 5 分钟刷新
      
      if (refreshIn <= 0) {
        // Token 已经过期或即将过期，立即登出
        this.logout()
        return
      }
      
      _refreshTimer = setTimeout(() => {
        this._attemptRefresh()
      }, refreshIn)
    },
    _cancelTokenRefresh() {
      if (_refreshTimer) {
        clearTimeout(_refreshTimer)
        _refreshTimer = null
      }
    },
    async _attemptRefresh() {
      try {
        // 尝试重新登录（使用存储的凭据）
        // 注意：由于安全原因，不存储密码，这里只是检查 token 是否仍然有效
        // 如果 token 已过期，用户需要重新登录
        if (isTokenExpired(this.token)) {
          this.logout()
        }
      } catch (e) {
        this.logout()
      }
    },
  },
})
