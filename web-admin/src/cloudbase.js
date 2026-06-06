import cloudbase from '@cloudbase/js-sdk'

const app = cloudbase.init({
  env: 'cloudbase-d7getcjqy33b13475',
  region: 'ap-shanghai',
})

// 匿名登录（callFunction 需要登录态）
let _authReady = false
let _authPromise = null

export async function ensureAuth() {
  if (_authReady) return
  if (_authPromise) return _authPromise
  _authPromise = (async () => {
    try {
      const auth = app.auth()
      if (!auth.hasLoginState()) {
        await auth.signInAnonymously()
      }
      _authReady = true
    } catch (e) {
      _authPromise = null
      throw e
    }
  })()
  return _authPromise
}

export default app
