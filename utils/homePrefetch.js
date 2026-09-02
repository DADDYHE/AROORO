/**
 * homePrefetch.js - 首页数据预热（P2 冷启动优化）
 *
 * 原理：
 *   冷启动必经 splash 启动页（1~5s 展示窗口）。期间 fire-and-forget 预取首页
 *   聚合接口 getHomeFeed，写入 CloudFunctionService 前端请求缓存
 *   （cacheKey = cloud_request_cache_${name}_${stableStringify(data)}）。
 *   splash 退出 reLaunch 回首页后，首页 onShow 的 _initPage() 直接命中缓存，
 *   首帧无需等待网络往返。
 *
 * 约束：
 *   - 预热参数与首页 _loadHomeFeed 严格一致（action/withUser/缓存窗口 30s），
 *     否则 cacheKey 不命中。
 *   - 登录态判断与首页一致（app.globalData.isLoggedIn）：
 *     withUser=true 时后端才返回 pets/可签到活动板块。
 *   - fire-and-forget：.catch 静默，不阻塞 splash 展示、不向页面抛错。
 *
 * 云资源优化（2026-09-02）：原 6 个接口预热（banner/pets/activities/my-act/tuan/mall）
 * 收敛为 1 次 getHomeFeed 聚合调用。
 *
 * 竞态修复（2026-09-02）：
 *   小程序不保证页面 onLoad 等待 App.onLaunch 的 await，splash onLoad 读
 *   globalData.isLoggedIn 时会话恢复往往尚未完成 => 预取 withUser:false，
 *   而首页随后请求 withUser:true => cacheKey 不同，预取完全失效（已登录用户
 *   每次冷启动都白等一次网络往返）。
 *   现改为 await app.sessionReady（app.js 暴露的会话恢复同步点）后再预取；
 *   超时则放弃预取，避免用错误的 withUser 白发一次云调用。
 */
const { UtilityService } = require('../services/CloudFunctionService')

// 会话恢复等待上限（ms）。splash 最短展示 1000ms，900ms 内拿到登录态即可赶在
// 首页 reLaunch 之前完成预取；超时则预取已无意义，直接放弃。
const SESSION_WAIT_TIMEOUT = 900

function _fire(promise) {
  if (promise && typeof promise.catch === 'function') {
    promise.catch(() => {})
  }
  return promise
}

function prefetchHomeData(app) {
  const sessionReady = (app && app.sessionReady) ? app.sessionReady : Promise.resolve()
  let timer = null
  const timeout = new Promise(resolve => {
    timer = setTimeout(() => resolve('timeout'), SESSION_WAIT_TIMEOUT)
  })

  Promise.race([
    // 恢复成功或失败都视为「登录态已落定」，此时 isLoggedIn 是可信终值
    sessionReady.then(() => 'ready', () => 'ready'),
    timeout,
  ])
    .then(reason => {
      if (timer) { clearTimeout(timer) }
      if (reason === 'timeout') {
        console.warn('[homePrefetch] 会话恢复超时', SESSION_WAIT_TIMEOUT, 'ms，跳过预取')
        return
      }
      // 与首页 _loadHomeFeed 完全一致的调用参数（命中同一缓存 key）
      _fire(UtilityService.getHomeFeed(
        !!(app && app.globalData && app.globalData.isLoggedIn),
        { useCache: true, cacheTime: 30000 },
      ))
    })
    .catch(() => {
      // 预热失败静默：splash 展示与首页加载不受影响
    })
}

module.exports = { prefetchHomeData }
