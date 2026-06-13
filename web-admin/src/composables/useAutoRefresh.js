/**
 * useAutoRefresh composable - 自动刷新逻辑
 *
 * 用途：
 *   - 封装自动刷新的 start/stop/watch 逻辑
 *   - 减少重复代码
 *
 * 用法：
 *   import { useAutoRefresh } from '@/composables/useAutoRefresh'
 *
 *   const { autoRefresh, startAutoRefresh, stopAutoRefresh } = useAutoRefresh(() => {
 *     loadData()
 *   }, 30000) // 30 秒刷新一次
 */

import { ref, watch, onUnmounted } from 'vue'

/**
 * 自动刷新 composable
 * @param {Function} callback - 刷新时执行的回调函数
 * @param {number} interval - 刷新间隔（毫秒），默认 30000
 * @returns {{ autoRefresh, startAutoRefresh, stopAutoRefresh }}
 */
export function useAutoRefresh(callback, interval = 30000) {
  const autoRefresh = ref(true)
  let refreshTimer = null

  function startAutoRefresh() {
    stopAutoRefresh()
    if (autoRefresh.value) {
      refreshTimer = setInterval(() => {
        callback()
      }, interval)
    }
  }

  function stopAutoRefresh() {
    if (refreshTimer) {
      clearInterval(refreshTimer)
      refreshTimer = null
    }
  }

  watch(autoRefresh, (val) => {
    if (val) startAutoRefresh()
    else stopAutoRefresh()
  })

  onUnmounted(() => {
    stopAutoRefresh()
  })

  return {
    autoRefresh,
    startAutoRefresh,
    stopAutoRefresh,
  }
}
