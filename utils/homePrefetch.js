/**
 * homePrefetch.js - 首页数据预热（P2 冷启动优化）
 *
 * 原理：
 *   冷启动必经 splash 启动页（1~5s 展示窗口）。期间 fire-and-forget 预取首页
 *   6 个数据接口，写入 CloudFunctionService 前端请求缓存
 *   （cacheKey = cloud_request_cache_${name}_${stableStringify(data)}）。
 *   splash 退出 reLaunch 回首页后，首页 onShow 的 _initPage()/_refreshUserData()
 *   直接命中缓存，首帧无需等待网络往返。
 *
 * 约束：
 *   - 预热参数与首页 6 个 behavior 严格一致（含 action 字段），否则 cacheKey 不命中：
 *     banner/pets/activities/my-act 走 get() 5min 默认缓存；
 *     tuan/mall 走 call() 30s 缓存窗口（与 homeTuanBehavior/homeMallBehavior 对齐）。
 *   - 登录态判断与首页 _refreshUserData 一致（authService.isLoggedIn()）：
 *     pets/my-activities 仅登录时预热；未登录后端 code!=0 抛错也不会写缓存，双保险。
 *   - fire-and-forget：.catch 静默，不阻塞 splash 展示、不向页面抛错。
 */
const { UtilityService, PetService, ActivityService, CloudFunctionService } = require('../services/CloudFunctionService')
const { TuanService } = require('../services/TuanService')

function _fire(promise) {
  if (promise && typeof promise.catch === 'function') {
    promise.catch(() => {})
  }
  return promise
}

function prefetchHomeData(app) {
  try {
    const auth = app && app.globalData ? app.globalData.authService : null
    const loggedIn = !!(auth && typeof auth.isLoggedIn === 'function' && auth.isLoggedIn())

    // 公共板块（始终预热）
    _fire(UtilityService.getBanners())
    _fire(ActivityService.getActivityList({ status: 'published' }))
    _fire(TuanService.getTuanDealList({ page: 1, pageSize: 4 }, { useCache: true, cacheTime: 30000 }))
    _fire(CloudFunctionService.call('mallService', { action: 'getProductList', page: 1, pageSize: 6 }, { useCache: true, cacheTime: 30000 }))

    // 登录态板块（与首页 if (isLoggedIn) 守卫一致）
    if (loggedIn) {
      _fire(PetService.getPetList())
      _fire(ActivityService.getRegistrationList({ status: 'all', pageSize: 20 }))
    }
  } catch (e) {
    // 预热失败静默：splash 展示与首页加载不受影响
  }
}

module.exports = { prefetchHomeData }
