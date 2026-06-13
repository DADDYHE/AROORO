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
    async _loadTuanDeals() {
      try {
        const result = await TuanService.getTuanDealList({ page: 1, pageSize: 4 })
        if (result && result.code === 0 && result.data) {
          const list = (result.data.list || []).map(deal => ({
            _id: deal._id,
            title: deal.title || '',
            coverUrl: deal.coverUrl || '',
            minPrice: deal.minPrice || 0,
            totalOrders: deal.totalOrders || 0,
            endTime: deal.endTime || '',
          }))
          this.setData({ tuanDeals: list })
        } else {
          this.setData({ tuanDeals: [] })
        }
      } catch (error) {
        this.setData({ tuanDeals: [] })
      }
    },
  },
})

module.exports = homeTuanBehavior
