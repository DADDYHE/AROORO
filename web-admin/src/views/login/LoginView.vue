<template>
  <div class="login-page" ref="loginPageRef">
    <!-- 装饰背景 -->
    <div class="bg-decoration">
      <div class="bg-circle bg-circle-1"></div>
      <div class="bg-circle bg-circle-2"></div>
      <div class="bg-grain"></div>
    </div>

    <div class="login-card" ref="loginCardRef">
      <!-- Logo 区 -->
      <div class="logo-section">
        <div class="logo-ornament"></div>
        <h1 class="login-title">AROORO</h1>
        <p class="login-subtitle">管 理 后 台</p>
        <div class="logo-ornament"></div>
      </div>

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
            <el-button type="primary" size="large" :loading="loading" class="login-btn" native-type="submit">登 录</el-button>
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
import { ref, reactive, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { createScanLogin } from '@/api/auth'
import { ElMessage } from 'element-plus'
import { RefreshRight, Loading } from '@element-plus/icons-vue'
import QRCode from 'qrcode'
import { gsap } from 'gsap'

const router = useRouter()
const auth = useAuthStore()
const formRef = ref()
const loading = ref(false)
const loginPageRef = ref()
const loginCardRef = ref()

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

// GSAP 入场动画
onMounted(async () => {
  await nextTick()
  if (loginCardRef.value) {
    gsap.from(loginCardRef.value, {
      opacity: 0,
      y: 40,
      duration: 1,
      ease: 'power3.out',
    })
  }
  if (scanMode.value) {
    generateQrcode()
  }
})

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
      color: { dark: '#1F3A1F', light: '#FFFFFF' },
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
        await nextTick()
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
    await nextTick()
    router.push('/dashboard')
  } catch (e) {
    ElMessage.error(e?.message || '登录失败，请检查账号密码')
  } finally {
    loading.value = false
  }
}

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
  background: linear-gradient(145deg, #0F1C0F 0%, #1F3A1F 50%, #162A16 100%);
  position: relative;
  overflow: hidden;
}

/* ---- 装饰背景 ---- */
.bg-decoration {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.bg-circle {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
}
.bg-circle-1 {
  top: -20%;
  right: -15%;
  width: 500px;
  height: 500px;
  background: radial-gradient(circle, rgba(201, 162, 75, 0.08) 0%, transparent 70%);
}
.bg-circle-2 {
  bottom: -20%;
  left: -15%;
  width: 400px;
  height: 400px;
  background: radial-gradient(circle, rgba(31, 58, 31, 0.15) 0%, transparent 70%);
}
.bg-grain {
  position: absolute;
  inset: 0;
  opacity: 0.03;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}

/* ---- 登录卡片 ---- */
.login-card {
  width: 420px;
  padding: 52px 44px 40px;
  background: var(--bg-card);
  border-radius: var(--radius-xl);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.30), 0 0 0 1px rgba(201, 162, 75, 0.08);
  position: relative;
  z-index: 1;
}
.login-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 20%;
  right: 20%;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--color-accent), transparent);
  opacity: 0.5;
}

/* ---- Logo 区 ---- */
.logo-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 36px;
}
.logo-ornament {
  width: 40px;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--color-accent), transparent);
  margin: 8px 0;
  opacity: 0.4;
}
.login-title {
  text-align: center;
  font-family: var(--font-display);
  font-size: 32px;
  font-weight: 600;
  color: var(--color-primary);
  margin: 4px 0;
  letter-spacing: 6px;
  line-height: 1;
}
.login-subtitle {
  text-align: center;
  color: var(--text-tertiary);
  margin: 0;
  font-size: 11px;
  font-family: var(--font-eyebrow);
  letter-spacing: 4px;
  text-transform: uppercase;
}

/* ---- 扫码区 ---- */
.scan-section { display: flex; flex-direction: column; align-items: center; }
.qrcode-wrapper { margin-bottom: 24px; }
.qrcode-container { position: relative; width: 220px; height: 220px; }
.qrcode-img {
  width: 220px;
  height: 220px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
}
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
  background: var(--bg-page);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
}

.scan-status { text-align: center; }
.status-icon { font-size: 24px; margin-bottom: 8px; }
.status-text { font-size: 15px; font-weight: 500; color: var(--text-primary); margin: 0 0 4px; font-family: var(--font-serif); }
.scanned-text { color: var(--color-warning); }
.confirmed-text { color: var(--color-success); }
.denied-text { color: var(--color-danger); }
.status-hint { font-size: 13px; color: var(--text-tertiary); margin: 0; }

.switch-mode { margin-top: 20px; }
.switch-mode :deep(.el-divider__text) {
  font-size: 12px;
  color: var(--text-placeholder);
  background: var(--bg-card);
  font-family: var(--font-sans);
}

.spin { animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

/* ---- 密码登录区 ---- */
.password-section :deep(.el-input__wrapper) {
  border-radius: var(--radius-sm);
  padding: 4px 12px;
}
.password-section :deep(.el-input__inner) {
  font-family: var(--font-sans);
  height: 44px;
}
.password-section :deep(.el-form-item) {
  margin-bottom: 22px;
}
.login-btn {
  width: 100%;
  height: 48px;
  font-size: 15px;
  font-family: var(--font-serif);
  font-weight: 600;
  letter-spacing: 6px;
  border-radius: var(--radius-sm);
  background: var(--color-primary);
  border-color: var(--color-primary);
}
.login-btn:hover {
  background: var(--color-primary-dark);
  border-color: var(--color-primary-dark);
  box-shadow: 0 4px 20px rgba(31, 58, 31, 0.25);
}
</style>
