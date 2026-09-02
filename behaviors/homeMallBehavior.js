/**
 * homeMallBehavior.js - 首页商城商品数据加载行为
 *
 * 用途：
 *   - 封装首页商城商品板块的数据加载逻辑
 *   - 从 home/index.js 中抽离，与 homeTuanBehavior 保持一致的职责划分
 *
 * 用法：
 *   const homeMallBehavior = require('../../behaviors/homeMallBehavior')
 *   Page({
 *     behaviors: [homeMallBehavior],
 *     // ...
 *   })
 */

const { CloudFunctionService } = require('../services/CloudFunctionService')

const homeMallBehavior = Behavior({
  data: {
    mallProducts: [],
  },

  methods: {
    async _loadMallProducts(forceRefresh) {
      try {
        // 直接调用 mallService 云函数，避免主包引用分包模块（subpackages/mall/MallService）
        // 注：去掉 isFeatured 筛选，避免商品未标记 isFeatured 时返回空列表
        // 性能优化（2026-09-01）：30s 缓存 + 下拉/节流窗口外强制刷新
        const result = await CloudFunctionService.call('mallService', {
          action: 'getProductList',
          page: 1,
          pageSize: 6,
          skipTotal: true,
        }, forceRefresh ? { useCache: false } : { useCache: true, cacheTime: 30000 })
        if (result && result.code === 0 && result.data) {
          this._applyMallProducts(result.data.list || [])
        } else {
          this._applyMallProducts([])
        }
      } catch (error) {
        console.error('[homeMall] _loadMallProducts error:', error)
        this._applyMallProducts([])
      }
    },

    /** 应用商城商品板块数据（首页 BFF getHomeFeed 分发与单独加载共用） */
    _applyMallProducts(list) {
      const mallProducts = (Array.isArray(list) ? list : []).map(product => ({
        _id: product._id,
        name: product.name || '',
        coverUrl: product.coverUrl || '',
        price: product.minPrice || product.price || 0,
        originalPrice: product.originalPrice || 0,
        soldCount: product.soldCount || 0,
        subTitle: product.subTitle || '',
      }))
      this.setData({ mallProducts })
    },

    handleViewAllMallProducts() {
      wx.navigateTo({ url: '/subpackages/mall/product-list' })
    },

    handleMallProductTap(e) {
      const id = e.currentTarget.dataset.id
      if (!id) { return }
      wx.navigateTo({ url: `/subpackages/mall/product-detail?id=${id}` })
    },
  },
})

module.exports = homeMallBehavior
