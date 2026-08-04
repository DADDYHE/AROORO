/**
 * homeBannerBehavior.js - 首页 Banner 数据加载行为
 *
 * 用途：
 *   - 封装 Banner 数据加载逻辑
 *   - 从 home/index.js 中抽离，减少主文件职责
 *
 * 用法：
 *   const homeBannerBehavior = require('../../behaviors/homeBannerBehavior')
 *   Page({
 *     behaviors: [homeBannerBehavior],
 *     // ...
 *   })
 */

const { UtilityService } = require('../services/CloudFunctionService')

const homeBannerBehavior = Behavior({
  data: {
    bannerList: [],
    bannerHeight: 422,
    bannerVisibleHeight: 337,
    contentSheetOverlap: 0,
    // scroll-view 布局参数
    scrollViewOffset: 64, // scroll-view 顶部偏移 = navbarHeight + topbarHeight
    scrollMarginTop: 0,   // scroll-view 负 margin，拉升至 banner 顶部
  },

  methods: {
    _initBanner() {
      const windowWidth = wx.getWindowInfo().windowWidth
      // 内容卡片上移后，要求 banner 可见区域为 5:4（宽:高 = 5:4）
      // 图片比例至少为 4:5（高:宽 = 5:4），否则会被强制拉伸到该比例
      const minImageRatio = 5 / 4
      const visibleRatio = 4 / 5
      const bannerHeight = Math.round(windowWidth * minImageRatio)
      const bannerVisibleHeight = Math.round(windowWidth * visibleRatio)
      const contentSheetOverlap = bannerHeight - bannerVisibleHeight
      this.setData({ bannerHeight, bannerVisibleHeight, contentSheetOverlap })
      this._updateScrollLayout()
    },

    /**
     * 计算 scroll-view 布局参数：
     * - scrollViewOffset: scroll-view 在页面中的顶部位置 = navbarHeight + topbarHeight
     *   (topbarHeight 仅登录时存在，112rpx → px)
     * - scrollMarginTop: 负值，将 scroll-view 从 banner 下方拉回 banner 顶部，
     *   使内容卡片可滚动覆盖固定 banner
     */
    _updateScrollLayout() {
      const windowWidth = wx.getWindowInfo().windowWidth
      const topbarHeightPx = this.data.isLoggedIn ? 112 * windowWidth / 750 : 0
      const scrollViewOffset = Math.round(this.data._navbarHeight + topbarHeightPx)
      const scrollMarginTop = -this.data.bannerHeight
      this.setData({ scrollViewOffset, scrollMarginTop })
    },

    /**
     * 图片加载完成后，按第一张图片的真实比例动态调整 swiper 高度。
     * 避免图片比例与默认 16:9 不一致时被 aspectFill 裁剪。
     * 同时保证内容卡片上移后 banner 可见区域为 5:4。
     */
    onBannerImageLoad(e) {
      if (this._bannerHeightAdjusted) {return}
      this._bannerHeightAdjusted = true

      const { width, height } = e.detail || {}
      if (!width || !height) {return}

      const windowWidth = wx.getWindowInfo().windowWidth
      const minImageRatio = 5 / 4
      const visibleRatio = 4 / 5
      const ratio = Math.max(height / width, minImageRatio)
      const newHeight = Math.round(windowWidth * ratio)
      const bannerVisibleHeight = Math.round(windowWidth * visibleRatio)
      const contentSheetOverlap = newHeight - bannerVisibleHeight

      // 合理范围校验，避免异常值
      if (newHeight > 100 && newHeight < 2000) {
        this.setData({ bannerHeight: newHeight, bannerVisibleHeight, contentSheetOverlap })
        this._updateScrollLayout()
      }
    },

    async _loadBannerData() {
      // 允许新一轮加载时重新调整高度
      this._bannerHeightAdjusted = false
      try {
        const result = await UtilityService.getBanners()
        if (result && result.code === 0 && result.data) {
          const list = result.data.list || []
          this.setData({ bannerList: list })
        } else {
          this.setData({ bannerList: [] })
        }
      } catch (error) {
        this.setData({ bannerList: [] })
      }
    },
  },
})

module.exports = homeBannerBehavior
