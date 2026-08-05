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
    },
    async scanLogin(loginToken) {
      const res = await pollScanLogin(loginToken)
      if (res.data.status === 'confirmed') {
        const { token, admin } = res.data
        this.token = token
        this.admin = admin
        localStorage.setItem('token', token)
        localStorage.setItem('admin', JSON.stringify(admin))
        return 'confirmed'
      }
      return res.data.status
    },
    logout() {
      this.token = ''
      this.admin = null
      localStorage.removeItem('token')
      localStorage.removeItem('admin')
      router.push('/login')
    },
    // Web 端只有超级管理员登录，已登录即有全部权限
    hasPermission() {
      return this.isLoggedIn
    },
  },
})
