const app = getApp()
const { prefetchHomeData } = require('../../utils/homePrefetch')

// 启动首屏海报 · 独立全屏页
// 由首页 onLoad 在冷启动首屏一次 navigateTo 进入；本页非 tab 页、navigationStyle:custom
// => 框架级 100% 全屏，覆盖 navbar 与系统 tabBar（用户级 root-portal 无法覆盖系统级 tabBar）。
// 数据：app.globalData.__splashSync（同步缓存，首帧即展示销闪屏）+ app.getSplashPosterAsync()（异步刷新）。
Page({
  data: {
    visible: false,
    imageUrl: '',
    showHint: false,
    closing: false,
    reduceMotion: false,
    _duration: 2500,
    _timer: null,
  },

  onLoad() {
    // 性能优化（P2）：冷启动展示窗口（1~5s）内预取首页 6 个数据接口，
    // splash 退出 reLaunch 回首页后 onShow 直接命中前端缓存，首帧零等待。
    // fire-and-forget，失败静默，不影响海报展示。
    prefetchHomeData(app)

    // 减少动态效果（一次性展示，无需实时监听）
    if (wx.getSystemSetting) {
      try {
        const setting = wx.getSystemSetting()
        if (setting && setting.reduceMotion === 'enable') this.setData({ reduceMotion: true })
      } catch (e) {}
    }

    const sync = app.globalData && app.globalData.__splashSync
    // 已同步缓存且明确关闭 -> 不展示，立即退出
    if (sync && sync.enabled === false) {
      this._exit()
      return
    }

    // 进入展示态：首帧即时覆盖（无淡入），避免背后首页闪现
    this.setData({ visible: true, closing: false })

    if (sync && sync.enabled && sync.imageUrl) {
      this._render(this._resolveUrl(sync), sync.durationMs)
    }
    // 首启无缓存 / 未知：先铺深色底，等异步拉取裁决

    // 异步刷新：拉取最新配置并渲染；若最终无海报则退出（深绿一闪即回首页）
    if (app.getSplashPosterAsync) {
      app.getSplashPosterAsync().then((data) => {
        if (!data || !data.enabled || !data.imageUrl) {
          if (!this.data.imageUrl) this._exit()
          else this._hide()
          return
        }
        this._render(this._resolveUrl(data), data.durationMs)
      }).catch(() => {
        if (!this.data.imageUrl) this._exit()
      })
    }
  },

  _render(url, durationMs) {
    const dur = Math.min(5000, Math.max(1000, Number(durationMs) || 2500))
    if (this._timer) { clearTimeout(this._timer); this._timer = null }
    this.setData({ imageUrl: url, showHint: true, _duration: dur })
    // 展示时长后自动消失（与后端收敛一致 1s~5s）
    this._timer = setTimeout(() => this._hide(), dur)
  },

  _resolveUrl(data) {
    // 优先用 imagePreviewUrl（https 直链）：
    // devtools(Skyline/SummerCompiler) 预编译会把 cloud:// 当项目内本地路径 readFileSync，
    // 触发 ENOENT + 500；改用 https 可彻底规避，且公读桶下该直链长期有效、真机同样正常加载。
    // 仅当后端未返回预览链（极少数 legacy）时才回退 imageUrl。
    return data.imagePreviewUrl || data.imageUrl || ''
  },

  onTap() {
    this._hide()
  },

  _hide() {
    if (this.data.closing) return
    if (this._timer) { clearTimeout(this._timer); this._timer = null }
    if (this.data.reduceMotion) { this._exit(); return }
    this.setData({ closing: true })
    this._timer = setTimeout(() => this._exit(), 280)
  },

  _exit() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null }
    // 启动页由 reLaunch 进入（页面栈仅自身），退出时统一 reLaunch 回首页，
    // 不依赖页面栈层级，避免 navigateBack 在异常栈下失败导致卡死。
    wx.reLaunch({ url: '/pages/home/index' })
  },

  onUnload() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null }
    if (app) app.__splashShown = true
  },
})
