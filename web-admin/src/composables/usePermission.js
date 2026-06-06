import { useAuthStore } from '@/stores/auth'

export function usePermission() {
  const auth = useAuthStore()

  // Web 端只有超级管理员登录，已登录即有全部权限
  function hasPermission() {
    return auth.isLoggedIn
  }

  function filterByPermission(menus) {
    return menus
  }

  return { hasPermission, filterByPermission }
}
