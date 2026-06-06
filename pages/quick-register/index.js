const app = getApp()
const tabBarSyncBehavior = require('../../behaviors/tabBarSync')
const cloudImageBehavior = require('../../behaviors/cloudImageBehavior')
const { formatActivityForDisplay, sortAndSliceActivities } = require('../../utils/activityFormatter')
const { ActivityService } = require('../../services/CloudFunctionService')

const pageI18n = require('../../utils/page-i18n.js')

Page({
  ...pageI18n.mixin(),
  behaviors: [tabBarSyncBehavior, cloudImageBehavior],
  data: {
    isLoading: false,
    activities: [],
    hasMore: true,
    page: 1,
    pageSize: 10,
  },

  onLoad() {
    this._loadActivities()
  },

  onShow() {
    this._syncTabBar()
    if (this._dataLoaded) {
      this._loadActivities()
    }
    this._dataLoaded = true
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.isLoading) {
      this._loadActivities(true)
    }
  },

  onPullDownRefresh() {
    this.setData({ page: 1, hasMore: true })
    this._loadActivities().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  async _loadActivities(isLoadMore = false) {
    if (this.data.isLoading) return

    this.setData({ isLoading: true })

    try {
      const result = await ActivityService.getActivityList({ 
        status: 'published',
        page: isLoadMore ? this.data.page + 1 : 1,
        size: this.data.pageSize
      })

      if (result && result.code === 0) {
        const list = result.data?.list || []
        const sorted = sortAndSliceActivities(list)

        this.setData({
          activities: isLoadMore ? [...this.data.activities, ...sorted] : sorted,
          page: isLoadMore ? this.data.page + 1 : 1,
          hasMore: list.length >= this.data.pageSize,
        })
      } else {
        this.setData({ activities: [], hasMore: false })
      }
    } catch (error) {
      console.error('[quick-register] 获取活动列表失败:', error)
      this.setData({ activities: [], hasMore: false })
    } finally {
      this.setData({ isLoading: false })
    }
  },

  handleActivityTap(e) {
    const id = e.currentTarget.dataset.id
    const isEnded = e.currentTarget.dataset.isended
    const isRegistered = e.currentTarget.dataset.isregistered
    const registrationEnded = e.currentTarget.dataset.registrationended

    if (isEnded) {
      this.error('ACTIVITY_ENDED_TOAST')
      return
    }

    if (isRegistered) {
      this.error('ALREADY_REGISTERED')
      return
    }

    if (registrationEnded) {
      this.error('REGISTRATION_CLOSED')
      return
    }

    wx.navigateTo({ url: `/subpackages/activity/register?id=${id}` })
  },

  handleActivityDetailTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/subpackages/activity/detail?id=${id}` })
  },
})
