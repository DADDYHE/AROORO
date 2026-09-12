/**
 * homeBannerBehavior.js - 首页「当期橱窗」手动横滑数据行为
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
    // 时装屋开场 · 当期橱窗：手动横滑（无 autoplay / 无 circular）。
    //   swiper 的 previous/next-margin 以 px 下发（属性单位歧义），由 _initCarousel 按 rpx 换算；
    //   默认值对应 375pt 屏（值 = rpx × r）：
    //     卡高 600rpx＝300px（方案 B 的 .car-img 高 300px）
    //     itemW 568rpx = 卡宽 536rpx（≈内容宽 654rpx 的 82%）+ 左右各 16rpx 卡外边距
    //     previous-margin 32rpx → 卡左缘落 48rpx 页边距上
    //     next-margin 150rpx = 750 - 32 - 568 → 下一张露边 134rpx
    carouselHeight: 300,      // 600rpx
    carPrevMargin: 16,        // 32rpx（= 48rpx 页边距 - 16rpx 卡外边距）
    carNextMargin: 75,        // 150rpx（= 750rpx - previous 32rpx - itemW 568rpx）
    carouselIndex: 0,
    carouselLabel: '01 / 01',
    carouselCurrent: { title: '当期橱窗', subtitle: 'CURRENT SELECTION' },
    // scroll-view 布局参数
    scrollViewOffset: 64, // scroll-view 顶部偏移 = navbarHeight + topbarHeight
    scrollMarginTop: 0,   // scroll-view 负 margin，拉升至 banner 顶部
  },

  methods: {
    _initCarousel() {
      const windowWidth = wx.getWindowInfo().windowWidth
      const r = windowWidth / 750
      this.setData({
        carouselHeight: Math.round(600 * r),
        carPrevMargin: Math.round(32 * r),
        carNextMargin: Math.round(150 * r),
      })
      this._updateScrollLayout()
    },

    /**
     * 计算 scroll-view 布局参数（时装屋开场：封面 + 当期橱窗都在 scroll-view 内，
     * 与内容一起上滑；深绿封面与纸面 sheet 硬边相接，零透叠）：
     * - scrollViewOffset: scroll-view 顶部偏移 = navbarHeight + topbarHeight（用于高度公式）
     * - scrollMarginTop: 0（不覆到顶栏之上）
     */
    _updateScrollLayout() {
      const windowWidth = wx.getWindowInfo().windowWidth
      const logged = !!this.data.isLoggedIn
      const topbarHeightPx = logged ? 112 * windowWidth / 750 : 0
      const scrollViewOffset = Math.round(this.data._navbarHeight + topbarHeightPx)
      const scrollMarginTop = 0
      this.setData({ scrollViewOffset, scrollMarginTop })
      // 极光帘幕的切片几何取决于「问候行是否存在」（登录态翻转 => topbar 显隐 => 帘幕总高变化），
      // 变则重算，否则封面会取到偏移一段的切片、与导航栏底缘错位。
      if (this._gemBandLogged !== logged && typeof this._initGemBand === 'function') { this._initGemBand() }
    },

    async _loadBannerData() {
      try {
        const result = await UtilityService.getBanners()
        if (result && result.code === 0 && result.data) {
          this._applyBannerData(result.data.list || [])
        } else {
          this._applyBannerData([])
        }
      } catch (error) {
        this._applyBannerData([])
      }
    },

    /** 应用 banner 板块数据（首页 BFF getHomeFeed 分发与单独加载共用） */
    _applyBannerData(list) {
      const arr = Array.isArray(list) ? list : []
      this.setData({ bannerList: arr })
      this._syncCarousel(0)
    },

    /** 同步当期橱窗的索引 / 展签 / 页码（手动横滑：swiper bindchange 与初次装载共用） */
    _syncCarousel(index) {
      const list = this.data.bannerList || []
      const total = list.length
      const i = total ? Math.max(0, Math.min(total - 1, Math.floor(index) || 0)) : 0
      const cur = list[i] || {}
      const pad = n => (n < 10 ? '0' + n : '' + n)
      this.setData({
        carouselIndex: i,
        carouselLabel: pad(i + 1) + ' / ' + pad(total || 1),
        carouselCurrent: {
          title: cur.title || '当期橱窗',
          subtitle: cur.subtitle || 'CURRENT SELECTION',
        },
      })
    },

    /** 手动横滑：swiper bindchange → 更新展签与页码 */
    onCarouselChange(e) {
      this._syncCarousel(e.detail.current)
    },
  },
})

module.exports = homeBannerBehavior
