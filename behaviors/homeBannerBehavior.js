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
  },

  methods: {
    _initBanner() {
      const windowWidth = wx.getWindowInfo().windowWidth
      const bannerHeight = Math.round(windowWidth * 9 / 16)
      this.setData({ bannerHeight })
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
