const __i18n = require('../../../utils/i18n.js')
const __i18nT = (k) => __i18n.t(k, __i18n.getLocale())
// 视频列表页面逻辑
const shareEntryBehavior = require('../../../behaviors/shareEntryBehavior')
const { ListBehavior } = require('../../../behaviors/listBehavior')

Page({
  behaviors: [ListBehavior, shareEntryBehavior],

  /**
   * 页面的初始数据
   */
  data: {
    videos: [], // 视频列表
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad (options) {
    this._initNavbarHeight()
    try {
      const host = options.hostId ? null : JSON.parse(decodeURIComponent(options.host || '{}'))

      const videos = []

      if (host && host.videos && host.videos.length > 0) {
        host.videos.forEach((videoUrl, index) => {
          videos.push({
            url: videoUrl,
            id: `video-${Date.now()}-${Math.random()}`,
            poster: '/images/default-photo.png',
            description: `${host.name || '寄养家庭'}的日常记录`,
            hostInfo: {
              avatarUrl: host.avatarUrl || '',
              name: host.name || '寄养家庭',
            },
          })
        })
      }

      this.setData({ videos })
    } catch (error) {
      console.error('[APP] 解析寄养家庭信息失败：', error)
      this.setData({ videos: [] })
    }
  },

  /**
   * 预览视频
   */
  previewVideo (e) {
    const index = e.currentTarget.dataset.index
    const video = this.data.videos[index]
    if (video && video.url) {
      wx.previewMedia({
        sources: [{ url: video.url, type: 'video' }],
        current: 0,
      })
    }
  },

  /**
   * 视频播放事件
   */
  onVideoPlay (e) {
    const { index } = e.currentTarget.dataset
  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh () {
    setTimeout(() => {
      wx.stopPullDownRefresh()
    }, 1000)
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage () {
    const app = getApp()
    const userInfo = app?.globalData?.userInfo
    const inviterId = ((userInfo?.isPartner || userInfo?.permissions?.length) && userInfo?.openid) ? userInfo.openid : ''
    return {
      title: __i18nT('BIZ_6RDYGY'),
      path: inviterId ? `/subpackages/other/video-list/index?inviterId=${inviterId}` : '/subpackages/other/video-list/index',
    }
  },
})
