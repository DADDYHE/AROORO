<template>
  <el-container class="admin-layout">
    <el-aside :width="isCollapsed ? '64px' : '220px'" class="admin-aside">
      <div class="logo-area">
        <span v-if="!isCollapsed" class="logo-text">AROORO</span>
        <span v-else class="logo-text-mini">A</span>
      </div>
      <el-menu
        :default-active="currentPath"
        :collapse="isCollapsed"
        router
        background-color="#1a1b2e"
        text-color="#9ca0b8"
        active-text-color="#3bb8b0"
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
            <span class="admin-name">{{ adminName }} <el-icon><ArrowDown /></el-icon></span>
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
import { SIDEBAR_MENUS } from '@/utils/constants'
import { getPendingApplicationCount } from '@/api/admin'
import { Fold, Expand, ArrowDown } from '@element-plus/icons-vue'

const route = useRoute()
const auth = useAuthStore()
const isCollapsed = ref(false)
const pendingCount = ref(0)
let timer = null

const currentPath = computed(() => route.path)
const adminName = computed(() => auth.admin?.nickName || '合作伙伴')

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
  const filtered = SIDEBAR_MENUS
  // 移除连续的 section 标签和首尾的 section 标签
  const result = []
  for (let i = 0; i < filtered.length; i++) {
    const item = filtered[i]
    if (item.type === 'section') {
      const prev = result[result.length - 1]
      const next = filtered[i + 1]
      // 跳过连续 section 或 section 后面没有可见菜单项的情况
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
.admin-aside {
  background: var(--bg-sidebar);
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow-y: auto;
  overflow-x: hidden;
  border-right: none;
}
.admin-aside::-webkit-scrollbar { width: 0; }
.logo-area {
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  background: rgba(0, 0, 0, 0.1);
}
.logo-text {
  color: var(--color-primary);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 3px;
}
.logo-text-mini {
  color: var(--color-primary);
  font-size: 22px;
  font-weight: 700;
}

/* 分组标签 */
.menu-section {
  padding: 20px 20px 6px;
  user-select: none;
}
.menu-section-text {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.28);
}
.menu-section-divider {
  height: 1px;
  margin: 12px 16px;
  background: rgba(255, 255, 255, 0.06);
}

/* 菜单样式 */
.admin-aside :deep(.el-menu) {
  border-right: none;
  padding: 4px 0;
}
.admin-aside :deep(.el-menu-item) {
  height: 40px;
  line-height: 40px;
  margin: 1px 8px;
  border-radius: var(--radius-sm);
  transition: all 0.2s ease;
  font-size: 13px;
}
.admin-aside :deep(.el-menu-item:hover) {
  background: var(--bg-sidebar-hover) !important;
}
.admin-aside :deep(.el-menu-item.is-active) {
  background: var(--bg-sidebar-active) !important;
  color: var(--color-primary) !important;
}
.admin-aside :deep(.el-sub-menu__title) {
  height: 40px;
  line-height: 40px;
  margin: 1px 8px;
  border-radius: var(--radius-sm);
  transition: all 0.2s ease;
  font-size: 13px;
}
.admin-aside :deep(.el-sub-menu__title:hover) {
  background: var(--bg-sidebar-hover) !important;
}
.admin-aside :deep(.el-sub-menu .el-menu) {
  background: transparent !important;
}
.admin-aside :deep(.el-sub-menu .el-menu-item) {
  min-width: auto;
  padding-left: 48px !important;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
}
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
}
.admin-header {
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-card);
  padding: 0 var(--spacing-lg);
  height: 56px;
  box-shadow: var(--shadow-sm);
  z-index: 1;
}
.collapse-btn {
  cursor: pointer;
  font-size: 18px;
  margin-right: var(--spacing-md);
  color: var(--text-secondary);
  transition: color 0.2s;
}
.collapse-btn:hover { color: var(--color-primary); }
.header-right { margin-left: auto; }
.admin-name {
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: var(--text-secondary);
  transition: color 0.2s;
}
.admin-name:hover { color: var(--color-primary); }
.admin-main {
  background: var(--bg-page);
  padding: var(--spacing-lg);
  overflow-y: auto;
}
</style>
