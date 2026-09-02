/**
 * homeTuanBehavior.js - 首页团购数据加载行为
 *
 * 用途：
 *   - 封装团购数据加载逻辑
 *   - 从 home/index.js 中抽离，减少主文件职责
 *
 * 用法：
 *   const homeTuanBehavior = require('../../behaviors/homeTuanBehavior')
 *   Page({
 *     behaviors: [homeTuanBehavior],
 *     // ...
 *   })
 */

const { TuanService } = require('../services/TuanService')

const homeTuanBehavior = Behavior({
  data: {
    tuanDeals: [],
  },

  methods: {
    async _loadTuanDeals(forceRefresh) {
      try {
        // 性能优化（2026-09-01）：30s 缓存 + 下拉/节流窗口外强制刷新
        const opts = forceRefresh ? { useCache: false } : { useCache: true, cacheTime: 30000 }
        const result = await TuanService.getTuanDealList({ page: 1, pageSize: 4, skipTotal: true }, opts)
        if (result && result.code === 0 && result.data) {
          this._applyTuanDeals(result.data.list || [])
        } else {
          this._applyTuanDeals([])
        }
      } catch (error) {
        this._applyTuanDeals([])
      }
    },

    /** 应用团购板块数据（首页 BFF getHomeFeed 分发与单独加载共用） */
    _applyTuanDeals(list) {
      const tuanDeals = (Array.isArray(list) ? list : []).map(deal => ({
        _id: deal._id,
        title: deal.title || '',
        coverUrl: deal.coverUrl || '',
        minPrice: deal.minPrice || 0,
        totalOrders: deal.totalOrders || 0,
        endTime: deal.endTime || '',
      }))
      this.setData({ tuanDeals })
    },
  },
})

module.exports = homeTuanBehavior
