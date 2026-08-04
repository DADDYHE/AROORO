import axios from 'axios'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { CLOUDBASE_API, API_KEY } from '@/config/cloudbase'

// 静态托管环境直接调用 CloudBase HTTP API，开发环境走 Vite 代理
const API_BASE = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? '/api' : CLOUDBASE_API)

let _isLoggingOut = false

function handleResponseError(res, silent) {
  if (res.code !== undefined && res.code !== 0) {
    if (!silent) { ElMessage.error(res.message || '请求失败') }
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

// 重试配置
const MAX_RETRIES = 2
const RETRY_DELAY = 1000

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isRetryableError(err) {
  // 网络错误或超时错误可以重试
  return !err.response && (err.code === 'ECONNABORTED' || err.code === 'ENOTFOUND' || err.code === 'ECONNRESET' || err.message?.includes('network'))
}

import { resolveCloudUrls } from '@/utils/cloudImage'

function convertCloudUrls(obj) {
  return resolveCloudUrls(obj)
}

async function callAction(action, data = {}, options = {}) {
  const { silent = false, retryCount = MAX_RETRIES } = options
  let lastError = null

  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try {
      const authStore = useAuthStore()
      const token = authStore.token

      const payload = {
        action,
        data,
      }
      if (token) {payload.accessToken = token}
      console.log('[callAction]', action, 'hasToken:', !!token)

      // 认证契约：
      //   - X-User-Token 始终携带用户 JWT（后端 parseHttpAuth 优先读取）
      //   - Authorization 在生产环境携带 CloudBase 网关 API Key（开发环境由 Vite 代理注入）
      const headers = {}
      if (token) {headers['X-User-Token'] = token}
      if (import.meta.env.PROD) {headers.Authorization = API_KEY}
      const response = await axios.post(API_BASE, payload, {
        timeout: 15000,
        headers,
      })

      const res = response.data || {}
      return handleResponseError(convertCloudUrls(res), silent)
    } catch (err) {
      lastError = err
      const msg = err.response?.data?.message || err.message || ''

      // 认证错误不重试
      if (msg.includes('EXCEED_AUTHORITY') || msg.includes('未登录') || msg.includes('无效的认证令牌')) {
        if (!_isLoggingOut) {
          _isLoggingOut = true
          const authStore = useAuthStore()
          authStore.logout()
          _isLoggingOut = false
        }
        if (!silent && !err._handled) {
          ElMessage.error(msg || '认证失败')
        }
        return Promise.reject(err)
      }

      // 如果不是可重试的错误或已达最大重试次数，抛出错误
      if (!isRetryableError(err) || attempt >= retryCount) {
        if (!silent && !err._handled) {
          ElMessage.error(msg || '网络错误')
        }
        return Promise.reject(err)
      }

      // 等待后重试
      await sleep(RETRY_DELAY * (attempt + 1))
    }
  }

  // 所有重试都失败
  const msg = lastError?.response?.data?.message || lastError?.message || '网络错误'
  if (!silent && !lastError?._handled) {
    ElMessage.error(msg)
  }
  return Promise.reject(lastError)
}

export { callAction }
export default { callAction }
