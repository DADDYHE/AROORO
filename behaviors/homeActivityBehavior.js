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
        const result = await ActivityService.getActivityList({ status: 'published' })
        if (result && result.code === 0) {
          const sorted = sortAndSliceActivities(result.data?.list || [], 5)
          this.setData({ latestActivities: sorted })
        } else {
          this.setData({ latestActivities: [] })
        }
      } catch (error) {
        this.setData({ latestActivities: [] })
      }
    },
  },
})

module.exports = homeActivityBehavior
