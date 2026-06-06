import axios from 'axios'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'

const API_BASE = import.meta.env.VITE_API_BASE || 'https://cloudbase-d7getcjqy33b13475-1433773879.ap-shanghai.app.tcloudbase.com/adminService'

const http = axios.create()
let _isLoggingOut = false

function handleResponseError(res, silent) {
  if (res.code !== undefined && res.code !== 0) {
    if (!silent) ElMessage.error(res.message || '请求失败')
    if (res.code === 1003 || res.code === 401) {
      if (!_isLoggingOut) {
        _isLoggingOut = true
        const authStore = useAuthStore()
        authStore.logout()
        _isLoggingOut = false
      }
    }
    return Promise.reject(new Error(res.message))
  }
  if (res._renewedToken) {
    const authStore = useAuthStore()
    authStore.token = res._renewedToken
    localStorage.setItem('token', res._renewedToken)
  }
  return res
}

async function callAction(action, data = {}, options = {}) {
  const { silent = false } = options
  try {
    const authStore = useAuthStore()
    const token = authStore.token

    const headers = {}
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    const response = await http.post(API_BASE, {
      action,
      data,
    }, { headers })

    // HTTP 云函数返回格式：{ statusCode, headers, body }
    // body 是 JSON 字符串
    let res
    if (response.data && typeof response.data.body === 'string') {
      res = JSON.parse(response.data.body)
    } else {
      res = response.data
    }

    return handleResponseError(res, silent)
  } catch (err) {
    const status = err.response?.status
    if (status === 401 || err.message?.includes('EXCEED_AUTHORITY') || err.message?.includes('未登录')) {
      if (!_isLoggingOut) {
        _isLoggingOut = true
        const authStore = useAuthStore()
        authStore.logout()
        _isLoggingOut = false
      }
    }
    if (!silent && !err._handled) {
      ElMessage.error(err.message || '网络错误')
    }
    return Promise.reject(err)
  }
}

export { callAction, http }
export default http
