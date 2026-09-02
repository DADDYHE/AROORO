/**
 * homeActivityBehavior.js - 首页活动数据加载行为
 *
 * 用途：
 *   - 封装活动数据加载逻辑
 *   - 从 home/index.js 中抽离，减少主文件职责
 *
 * 用法：
 *   const homeActivityBehavior = require('../../behaviors/homeActivityBehavior')
 *   Page({
 *     behaviors: [homeActivityBehavior],
 *     // ...
 *   })
 */

const { ActivityService } = require('../services/CloudFunctionService')
const { sortAndSliceActivities } = require('../utils/activityFormatter')

const homeActivityBehavior = Behavior({
  data: {
    latestActivities: [],
  },

  methods: {
    async _loadLatestActivities() {
      try {
        const result = await ActivityService.getActivityList({ status: 'published', skipTotal: true })
        if (result && result.code === 0) {
          this._applyLatestActivities(result.data?.list || [])
        } else {
          this._applyLatestActivities([])
        }
      } catch (error) {
        this._applyLatestActivities([])
      }
    },

    /** 应用最新活动板块数据（首页 BFF getHomeFeed 分发与单独加载共用） */
    _applyLatestActivities(list) {
      const sorted = sortAndSliceActivities(Array.isArray(list) ? list : [], 5)
      this.setData({ latestActivities: sorted })
    },
  },
})

module.exports = homeActivityBehavior
