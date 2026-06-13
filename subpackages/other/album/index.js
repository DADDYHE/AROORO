// 相册页面逻辑
const { HostService } = require('../../../services/CloudFunctionService')
const cloudImageBehavior = require('../../../behaviors/cloudImageBehavior')

const pageI18n = require('../../../utils/page-i18n.js')

Page({
  ...pageI18n.mixin(),
  behaviors: [cloudImageBehavior],
  data: {
    currentTab: 'album',
    photos: [],
    videos: [],
    scrollPosition: 0,
    isScrolling: false,
    videoSnapPoints: [],
    videoHeight: 0,
    currentVideoIndex: 0,
    isLoading: true,
  },

  onLoad (options) {
    const tab = options.tab || 'album'
    const hostId = options.hostId

    this.setData({ currentTab: tab, isLoading: true })

    if (hostId) {
      this.loadHostMedia(hostId)
    } else {
      this.setData({
        photos: [],
        videos: [],
        isLoading: false,
      })
    }
  },

  async loadHostMedia(hostId) {
    try {
      const result = await HostService.getHostInfo(hostId)
      if (result && result.code === 0 && result.data) {
        const host = result.data
        const photos = (host.photos || []).map((url, i) => ({
          url,
          id: `photo-${host._id || hostId}-${i}`,
        }))
        const videos = (host.videos || []).map((url, i) => ({
          url,
          id: `video-${host._id || hostId}-${i}`,
          poster: host.avatarUrl || '/images/default-photo.png',
          description: `${host.hostName || '寄养家庭'}的日常记录`,
          hostInfo: {
            avatarUrl: host.avatarUrl || '',
            name: host.hostName || '寄养家庭',
          },
        }))

        let videoHeight = 0
        if (videos.length > 0) {
          const windowInfo = wx.getWindowInfo()
          const rpxToPx = windowInfo.windowWidth / 750
          videoHeight = windowInfo.windowHeight - 230 * rpxToPx
        }

        this.setData({
          photos,
          videos,
          videoHeight,
          isLoading: false,
        })
      } else {
        this.setData({ isLoading: false })
        this.error('LOAD_FAILED')
      }
    } catch (error) {
      console.error('[相册] 加载媒体失败:', error)
      this.setData({ isLoading: false })
      this.error('LOAD_FAILED')
    }
  },

  switchTab (e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ currentTab: tab, scrollPosition: 0 })
  },

  goBack () {
    wx.navigateBack()
  },

  previewPhoto (e) {
    const index = e.currentTarget.dataset.index
    const urls = this.data.photos.map(p => p.url)
    wx.previewImage({
      current: urls[index],
      urls,
    })
  },

  onVideoTimeUpdate (e) {
  },

  onVideoPlay (e) {
    const index = e.currentTarget.dataset.index
    this.setData({ currentVideoIndex: index })
  },

  onVideoSwiperChange (e) {
    this.setData({ currentVideoIndex: e.detail.current })
  },

  onProgressTouchStart (e) {
    const index = e.currentTarget.dataset.index
    const videos = this.data.videos
    videos[index] = { ...videos[index], isDragging: true }
    this.setData({ videos })
  },

  onProgressTouchMove (e) {
    const index = e.currentTarget.dataset.index
    const touch = e.touches[0]
    const query = wx.createSelectorQuery()
    query.select('.progress-bar').boundingClientRect()
    query.exec(res => {
      if (!res || !res[0]) {return}
      const rect = res[0]
      const progress = Math.max(0, Math.min(100, ((touch.clientX - rect.left) / rect.width) * 100))
      const videos = this.data.videos
      videos[index] = { ...videos[index], playProgress: progress }
      this.setData({ videos })
    })
  },

  onProgressTouchEnd (e) {
    const index = e.currentTarget.dataset.index
    const videos = this.data.videos
    videos[index] = { ...videos[index], isDragging: false }
    this.setData({ videos })
  },

  goToVideoList () {
    wx.navigateTo({ url: '/subpackages/other/video-list/index' })
  },

  formatTime (seconds) {
    if (!seconds || isNaN(seconds)) {return '00:00'}
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m < 10 ? `0${m}` : m}:${s < 10 ? `0${s}` : s}`
  },
})
