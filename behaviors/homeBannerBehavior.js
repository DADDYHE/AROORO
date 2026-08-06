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
    // Plain Sheet：banner 恒为 16:9 纯图，sheet 硬边紧贴其下，零透叠。
    // 不变式：bannerVisibleHeight === bannerHeight
    bannerHeight: 211,
    bannerVisibleHeight: 211,
    // scroll-view 布局参数
    scrollViewOffset: 64, // scroll-view 顶部偏移 = navbarHeight + topbarHeight
    scrollMarginTop: 0,   // scroll-view 负 margin，拉升至 banner 顶部
  },

  methods: {
    _initBanner() {
      const windowWidth = wx.getWindowInfo().windowWidth
      const bannerHeight = Math.round(windowWidth * 9 / 16)
      this.setData({ bannerHeight, bannerVisibleHeight: bannerHeight })
      this._updateScrollLayout()
    },

    /**
     * 计算 scroll-view 布局参数（Plain Sheet：banner 为 scroll-view 之外的独立兄弟节点，
     * 下方硬边相接实色 sheet，零透叠）：
     * - scrollViewOffset: scroll-view 顶部偏移 = navbarHeight + topbarHeight（用于高度公式）
     * - scrollMarginTop: 0（不再用负 margin 把 sheet 拉到 banner 之上，否则会盖住 banner）
     */
    _updateScrollLayout() {
      const windowWidth = wx.getWindowInfo().windowWidth
      const topbarHeightPx = this.data.isLoggedIn ? 112 * windowWidth / 750 : 0
      const scrollViewOffset = Math.round(this.data._navbarHeight + topbarHeightPx)
      const scrollMarginTop = 0
      this.setData({ scrollViewOffset, scrollMarginTop })
    },

    async _loadBannerData() {
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
