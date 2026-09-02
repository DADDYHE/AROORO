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
 *   }, 60000) // 60 秒刷新一次
 *
 * 云资源优化（2026-09-02）：
 *   - 默认关闭：后台挂起的浏览器标签页不再持续触发云函数调用
 *     （每次刷新 = 1 次云函数调用 + 多次数据库读；挂一晚 ≈ 近千次调用）
 *   - 页面隐藏（切标签/最小化）自动暂停，回前台且开关开启时自动恢复
 *   - 默认间隔 30s -> 60s
 */

import { ref, watch, onMounted, onUnmounted } from 'vue'

/**
 * 自动刷新 composable
 * @param {Function} callback - 刷新时执行的回调函数
 * @param {number} interval - 刷新间隔（毫秒），默认 60000
 * @returns {{ autoRefresh, startAutoRefresh, stopAutoRefresh }}
 */
export function useAutoRefresh(callback, interval = 60000) {
  // 默认关闭：由用户通过开关（el-switch v-model）按需开启，节省云资源
  const autoRefresh = ref(false)
  let refreshTimer = null

  function startAutoRefresh() {
    stopAutoRefresh()
    // 页面隐藏时不启动（visibilitychange 回前台时会自动恢复）
    if (autoRefresh.value && !document.hidden) {
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

  // 页面隐藏时暂停刷新（后台标签页不再消耗云资源），回前台且开关开启时恢复
  function handleVisibilityChange() {
    if (document.hidden) {
      stopAutoRefresh()
    } else if (autoRefresh.value) {
      startAutoRefresh()
    }
  }

  watch(autoRefresh, (val) => {
    if (val) startAutoRefresh()
    else stopAutoRefresh()
  })

  onMounted(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange)
  })

  onUnmounted(() => {
    stopAutoRefresh()
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  })

  return {
    autoRefresh,
    startAutoRefresh,
    stopAutoRefresh,
  }
}
