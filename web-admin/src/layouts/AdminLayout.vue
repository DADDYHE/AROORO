<template>
  <el-container class="admin-layout">
    <el-aside :width="isCollapsed ? '64px' : '240px'" class="admin-aside">
      <div class="logo-area">
        <div class="logo-mark" v-if="isCollapsed">A</div>
        <template v-else>
          <span class="logo-text">AROORO</span>
          <span class="logo-sub">ADMIN</span>
        </template>
      </div>
      <div class="gold-line"></div>
      <el-menu
        :default-active="currentPath"
        :collapse="isCollapsed"
        router
        class="luxury-menu"
      >
        <template v-for="(menu, idx) in visibleMenus" :key="idx">
          <!-- 分组标签 -->
          <div v-if="menu.type === 'section' && !isCollapsed" class="menu-section">
            <span class="menu-section-text">{{ menu.title }}</span>
          </div>
          <div v-else-if="menu.type === 'section' && isCollapsed" class="menu-section-divider" />

          <!-- 带子菜单 -->
          <el-sub-menu v-else-if="menu.children" :index="menu.path">
            <template #title>
              <el-icon><component :is="menu.icon" /></el-icon>
              <span>{{ menu.title }}</span>
              <el-badge v-if="menuHasPending(menu) && pendingCount > 0" :value="pendingCount" :max="99" class="approval-badge" />
            </template>
            <el-menu-item v-for="child in menu.children" :key="child.path" :index="child.path">
              <span>{{ child.title }}</span>
              <el-badge v-if="child.path === '/admin/approval' && pendingCount > 0" :value="pendingCount" :max="99" class="approval-badge" />
            </el-menu-item>
          </el-sub-menu>

          <!-- 独立菜单项 -->
          <el-menu-item v-else :index="menu.path">
            <el-icon><component :is="menu.icon" /></el-icon>
            <template #title>{{ menu.title }}</template>
          </el-menu-item>
        </template>
      </el-menu>
      <div class="aside-footer" v-if="!isCollapsed">
        <div class="footer-brand">AROORO PET</div>
        <div class="footer-copy">© 2025 All Rights Reserved</div>
      </div>
    </el-aside>
    <el-container>
      <el-header class="admin-header">
        <el-icon class="collapse-btn" @click="isCollapsed = !isCollapsed">
          <Fold v-if="!isCollapsed" /><Expand v-else />
        </el-icon>
        <el-breadcrumb separator="/">
          <el-breadcrumb-item :to="{ path: '/' }">首页</el-breadcrumb-item>
          <el-breadcrumb-item v-if="parentMenuTitle">{{ parentMenuTitle }}</el-breadcrumb-item>
          <el-breadcrumb-item v-if="route.meta.title">{{ route.meta.title }}</el-breadcrumb-item>
        </el-breadcrumb>
        <div class="header-right">
          <el-dropdown @command="onCommand">
            <span class="admin-name">
              <span class="admin-avatar">{{ avatarLetter }}</span>
              {{ adminName }}
              <el-icon><ArrowDown /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="logout">退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>
      <el-main class="admin-main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { SIDEBAR_MENUS } from '@/constants/order'
import { getPendingApplicationCount } from '@/api/admin'
import { Fold, Expand, ArrowDown } from '@element-plus/icons-vue'

const route = useRoute()
const auth = useAuthStore()
const isCollapsed = ref(false)
const pendingCount = ref(0)
let timer = null

const currentPath = computed(() => route.path)
const adminName = computed(() => auth.admin?.nickName || '合作伙伴')
const avatarLetter = computed(() => (auth.admin?.nickName || 'A').charAt(0).toUpperCase())

const parentMenuTitle = computed(() => {
  for (const menu of SIDEBAR_MENUS) {
    if (menu.children) {
      for (const child of menu.children) {
        if (child.path === route.path) return menu.title
      }
    }
  }
  return ''
})

const visibleMenus = computed(() => {
  const isSuperAdmin = auth.admin?.isSuperAdmin === true
  const filtered = SIDEBAR_MENUS
    .map(menu => {
      if (menu.superAdminOnly && !isSuperAdmin) {return null}
      if (menu.children) {
        return { ...menu, children: menu.children.filter(child => !child.superAdminOnly || isSuperAdmin) }
      }
      return menu
    })
    .filter(Boolean)
  const result = []
  for (let i = 0; i < filtered.length; i++) {
    const item = filtered[i]
    if (item.type === 'section') {
      const prev = result[result.length - 1]
      const next = filtered[i + 1]
      if (prev?.type === 'section') continue
      if (!next || next.type === 'section') continue
    }
    result.push(item)
  }
  return result
})

async function fetchPendingCount() {
  try {
    const res = await getPendingApplicationCount()
    pendingCount.value = res.data?.total || 0
  } catch (e) {
    pendingCount.value = 0
  }
}

function onCommand(cmd) {
  if (cmd === 'logout') auth.logout()
}

function menuHasPending(menu) {
  return menu.children?.some(child => child.path === '/admin/approval')
}

onMounted(() => {
  fetchPendingCount()
  timer = setInterval(fetchPendingCount, 60000)
  window.addEventListener('approval-changed', fetchPendingCount)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
  window.removeEventListener('approval-changed', fetchPendingCount)
})
</script>

<style scoped>
.admin-layout { height: 100vh; }

/* ---- 侧边栏 ---- */
.admin-aside {
  background: var(--bg-sidebar);
  transition: width 0.35s var(--ease-luxury);
  overflow-y: auto;
  overflow-x: hidden;
  border-right: none;
  display: flex;
  flex-direction: column;
}
.admin-aside::-webkit-scrollbar { width: 0; }

/* ---- Logo 区域 ---- */
.logo-area {
  height: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 2px;
  position: relative;
}
.logo-text {
  color: var(--color-accent);
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 600;
  letter-spacing: 4px;
  line-height: 1;
}
.logo-sub {
  color: var(--text-inverse-tertiary);
  font-family: var(--font-eyebrow);
  font-size: 9px;
  font-weight: 500;
  letter-spacing: 3px;
  text-transform: uppercase;
}
.logo-mark {
  color: var(--color-accent);
  font-family: var(--font-display);
  font-size: 24px;
  font-weight: 600;
}

/* ---- 金色分割线 ---- */
.gold-line {
  height: 1px;
  background: linear-gradient(90deg, transparent 10%, var(--color-accent) 50%, transparent 90%);
  opacity: 0.3;
  margin: 0 24px 8px;
}

/* ---- 分组标签 ---- */
.menu-section {
  padding: 24px 24px 8px;
  user-select: none;
}
.menu-section-text {
  font-family: var(--font-eyebrow);
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 2.5px;
  text-transform: uppercase;
  color: var(--text-inverse-tertiary);
}
.menu-section-divider {
  height: 1px;
  margin: 16px 20px;
  background: var(--border-inverse);
}

/* ---- 菜单样式 ---- */
.luxury-menu {
  background: transparent !important;
  border-right: none !important;
  padding: 4px 0;
  flex: 1;
}

.admin-aside :deep(.el-menu) {
  border-right: none;
  background: transparent !important;
}

.admin-aside :deep(.el-menu-item) {
  height: 42px;
  line-height: 42px;
  margin: 2px 12px;
  border-radius: var(--radius-sm);
  transition: all 0.25s var(--ease-luxury);
  font-size: 13px;
  color: var(--text-inverse-secondary);
  font-family: var(--font-sans);
}

.admin-aside :deep(.el-menu-item:hover) {
  background: var(--bg-sidebar-hover) !important;
  color: var(--text-inverse) !important;
}

.admin-aside :deep(.el-menu-item.is-active) {
  background: var(--bg-sidebar-active) !important;
  color: var(--color-accent) !important;
  font-weight: 500;
  position: relative;
}

.admin-aside :deep(.el-menu-item.is-active)::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 20px;
  background: var(--color-accent);
  border-radius: 0 2px 2px 0;
}

.admin-aside :deep(.el-sub-menu__title) {
  height: 42px;
  line-height: 42px;
  margin: 2px 12px;
  border-radius: var(--radius-sm);
  transition: all 0.25s var(--ease-luxury);
  font-size: 13px;
  color: var(--text-inverse-secondary);
  font-family: var(--font-sans);
}

.admin-aside :deep(.el-sub-menu__title:hover) {
  background: var(--bg-sidebar-hover) !important;
  color: var(--text-inverse) !important;
}

.admin-aside :deep(.el-sub-menu .el-menu) {
  background: transparent !important;
}

.admin-aside :deep(.el-sub-menu .el-menu-item) {
  min-width: auto;
  padding-left: 52px !important;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  height: 38px;
  line-height: 38px;
}

/* ---- Badge ---- */
.approval-badge {
  position: relative;
  top: 0;
  right: 0;
  margin-left: 8px;
  line-height: 1;
}
.approval-badge :deep(.el-badge__content) {
  font-size: 10px;
  height: 16px;
  line-height: 16px;
  padding: 0 5px;
  position: relative;
  top: 0;
  transform: none;
  background: var(--color-accent);
  font-family: var(--font-number);
}

/* ---- 底部 ---- */
.aside-footer {
  padding: 20px 24px;
  border-top: 1px solid var(--border-inverse);
  margin-top: auto;
}
.footer-brand {
  font-family: var(--font-eyebrow);
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 2px;
  color: var(--text-inverse-tertiary);
  margin-bottom: 4px;
}
.footer-copy {
  font-size: 10px;
  color: var(--text-inverse-tertiary);
  opacity: 0.6;
}

/* ---- Header ---- */
.admin-header {
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-card);
  padding: 0 var(--spacing-lg);
  height: 60px;
  box-shadow: var(--shadow-sm);
  z-index: 1;
}
.collapse-btn {
  cursor: pointer;
  font-size: 18px;
  margin-right: var(--spacing-md);
  color: var(--text-tertiary);
  transition: color var(--transition-fast);
}
.collapse-btn:hover { color: var(--color-accent); }

.header-right { margin-left: auto; }
.admin-name {
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary);
  font-family: var(--font-sans);
  transition: color var(--transition-fast);
}
.admin-name:hover { color: var(--color-primary); }

.admin-avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--color-primary);
  color: var(--color-accent);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-display);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0;
}

/* ---- Main ---- */
.admin-main {
  background: var(--bg-page);
  padding: var(--spacing-lg);
  overflow-y: auto;
}
</style>
