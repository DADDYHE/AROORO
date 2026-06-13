<template>
  <div class="login-page">
    <div class="login-card">
      <h1 class="login-title">AROORO</h1>
      <p class="login-subtitle">管理后台</p>

      <div class="scan-section" v-if="scanMode">
        <div class="qrcode-wrapper">
          <div class="qrcode-container" v-if="qrcodeDataUrl">
            <img :src="qrcodeDataUrl" alt="扫码登录" class="qrcode-img" />
            <div class="qrcode-overlay expired" v-if="scanStatus === 'expired'" @click="refreshQrcode">
              <div class="refresh-hint">
                <el-icon :size="32"><RefreshRight /></el-icon>
                <span>二维码已过期</span>
                <span>点击刷新</span>
              </div>
            </div>
          </div>
          <div class="qrcode-loading" v-else>
            <el-icon :size="40" class="spin"><Loading /></el-icon>
            <span>生成二维码中...</span>
          </div>
        </div>

        <div class="scan-status">
          <template v-if="scanStatus === 'pending'">
            <div class="status-icon pending-icon">📱</div>
            <p class="status-text">请使用微信扫描二维码</p>
            <p class="status-hint">打开微信 → 扫一扫 → 确认登录</p>
          </template>
          <template v-else-if="scanStatus === 'scanned'">
            <div class="status-icon scanned-icon">✓</div>
            <p class="status-text scanned-text">扫描成功</p>
            <p class="status-hint">请在手机上确认登录</p>
          </template>
          <template v-else-if="scanStatus === 'confirmed'">
            <div class="status-icon confirmed-icon">✓</div>
            <p class="status-text confirmed-text">登录成功</p>
            <p class="status-hint">正在跳转...</p>
          </template>
          <template v-else-if="scanStatus === 'expired'">
            <div class="status-icon expired-icon">⏰</div>
            <p class="status-text">二维码已过期</p>
            <p class="status-hint">请点击二维码刷新</p>
          </template>
          <template v-else-if="scanStatus === 'denied'">
            <div class="status-icon denied-icon">✕</div>
            <p class="status-text denied-text">登录被拒绝</p>
            <p class="status-hint">非管理员账号，无法登录</p>
          </template>
        </div>
      </div>

      <div class="password-section" v-else>
        <el-form ref="formRef" :model="form" :rules="rules" @submit.prevent="onLogin">
          <el-form-item prop="username">
            <el-input v-model="form.username" placeholder="用户名" prefix-icon="User" size="large" />
          </el-form-item>
          <el-form-item prop="password">
            <el-input v-model="form.password" type="password" placeholder="密码" prefix-icon="Lock" size="large" show-password />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" size="large" :loading="loading" style="width:100%" native-type="submit">登 录</el-button>
          </el-form-item>
        </el-form>
      </div>

      <div class="switch-mode">
        <el-divider>{{ scanMode ? '其他登录方式' : '扫码登录' }}</el-divider>
        <el-button link type="primary" @click="toggleMode">
          {{ scanMode ? '使用账号密码登录' : '使用微信扫码登录' }}
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { createScanLogin } from '@/api/auth'
import { ElMessage } from 'element-plus'
import { RefreshRight, Loading } from '@element-plus/icons-vue'
import QRCode from 'qrcode'

const router = useRouter()
const auth = useAuthStore()
const formRef = ref()
const loading = ref(false)

const scanMode = ref(false)
const qrcodeDataUrl = ref('')
const loginToken = ref('')
const scanStatus = ref('pending')
let pollTimer = null
let expireTimer = null

const form = reactive({ username: '', password: '' })
const rules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

async function generateQrcode() {
  scanStatus.value = 'pending'
  qrcodeDataUrl.value = ''
  loginToken.value = ''

  try {
    const res = await createScanLogin()
    const { loginToken: token, urlScheme } = res.data
    loginToken.value = token

    const qrContent = urlScheme || token
    qrcodeDataUrl.value = await QRCode.toDataURL(qrContent, {
      width: 240,
      margin: 2,
      color: { dark: '#1d1e2c', light: '#ffffff' },
    })

    startPolling()
    startExpireTimer(res.data.expiresAt)
  } catch (e) {
    ElMessage.error('生成二维码失败，请刷新重试')
  }
}

function startPolling() {
  stopPolling()
  pollTimer = setInterval(async () => {
    if (!loginToken.value) return
    try {
      const status = await auth.scanLogin(loginToken.value)
      if (status === 'confirmed') {
        scanStatus.value = 'confirmed'
        stopPolling()
        clearTimeout(expireTimer)
        ElMessage.success('登录成功')
        router.push('/dashboard')
      } else if (status === 'denied') {
        scanStatus.value = 'denied'
        stopPolling()
        clearTimeout(expireTimer)
      } else if (status === 'expired' || status === 'invalid' || status === 'completed') {
        scanStatus.value = 'expired'
        stopPolling()
      }
    } catch (e) {
    }
  }, 2000)
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function startExpireTimer(expiresAt) {
  clearTimeout(expireTimer)
  const delay = expiresAt - Date.now()
  if (delay <= 0) {
    scanStatus.value = 'expired'
    stopPolling()
    return
  }
  expireTimer = setTimeout(() => {
    if (scanStatus.value === 'pending') {
      scanStatus.value = 'expired'
      stopPolling()
    }
  }, delay)
}

function refreshQrcode() {
  generateQrcode()
}

function toggleMode() {
  scanMode.value = !scanMode.value
  if (scanMode.value) {
    generateQrcode()
  } else {
    stopPolling()
    clearTimeout(expireTimer)
  }
}

async function onLogin() {
  await formRef.value.validate()
  loading.value = true
  try {
    await auth.login(form.username, form.password)
    ElMessage.success('登录成功')
    router.push('/dashboard')
  } catch (e) {
    ElMessage.error(e?.message || '登录失败，请检查账号密码')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  if (scanMode.value) {
    generateQrcode()
  }
})

onUnmounted(() => {
  stopPolling()
  clearTimeout(expireTimer)
})
</script>

<style scoped>
.login-page {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(145deg, #1a1b2e 0%, #252740 50%, #1a1b2e 100%);
  position: relative;
  overflow: hidden;
}
.login-page::before {
  content: '';
  position: absolute;
  top: -50%;
  right: -30%;
  width: 600px;
  height: 600px;
  background: radial-gradient(circle, rgba(59, 184, 176, 0.08) 0%, transparent 70%);
  pointer-events: none;
}
.login-card {
  width: 400px;
  padding: 48px 40px;
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.3);
  position: relative;
  z-index: 1;
}
.login-title {
  text-align: center;
  font-size: 26px;
  font-weight: 700;
  color: var(--color-primary);
  margin: 0 0 4px;
  letter-spacing: 4px;
}
.login-subtitle {
  text-align: center;
  color: var(--text-tertiary);
  margin: 0 0 36px;
  font-size: 13px;
  letter-spacing: 2px;
}

.scan-section { display: flex; flex-direction: column; align-items: center; }
.qrcode-wrapper { margin-bottom: 24px; }
.qrcode-container { position: relative; width: 220px; height: 220px; }
.qrcode-img { width: 220px; height: 220px; border-radius: var(--radius-md); }
.qrcode-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(255, 255, 255, 0.92);
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  backdrop-filter: blur(2px);
}
.refresh-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  color: var(--text-secondary);
  font-size: 13px;
}
.refresh-hint span:first-child { font-size: 15px; font-weight: 500; }
.qrcode-loading {
  width: 220px;
  height: 220px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-tertiary);
  background: #f8f9fb;
  border-radius: var(--radius-md);
}

.scan-status { text-align: center; }
.status-icon { font-size: 24px; margin-bottom: 8px; }
.status-text { font-size: 15px; font-weight: 500; color: var(--text-primary); margin: 0 0 4px; }
.scanned-text { color: var(--color-warning); }
.confirmed-text { color: var(--color-success); }
.denied-text { color: var(--color-danger); }
.status-hint { font-size: 13px; color: var(--text-tertiary); margin: 0; }

.switch-mode { margin-top: 20px; }
.switch-mode :deep(.el-divider__text) {
  font-size: 12px;
  color: var(--text-placeholder);
  background: var(--bg-card);
}

.spin { animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

.password-section :deep(.el-input__wrapper) {
  border-radius: var(--radius-sm);
}

.password-section :deep(.el-button--primary) {
  height: 44px;
  font-size: 15px;
  letter-spacing: 4px;
  border-radius: var(--radius-sm);
}
</style>
