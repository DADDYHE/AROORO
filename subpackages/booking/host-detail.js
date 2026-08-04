const { HostService, FavoriteService } = require('../../services/CloudFunctionService')
const { extractCityAndDistrict } = require('../../utils/addressUtils')
const { authService } = require('../../services/AuthService')
const cloudImageBehavior = require('../../behaviors/cloudImageBehavior')
const shareEntryBehavior = require('../../behaviors/shareEntryBehavior')
const { ListBehavior } = require('../../behaviors/listBehavior')
const pageI18n = require('../../utils/page-i18n.js')
const { buildSharePath } = require('../../utils/share')

Page({
  ...pageI18n.mixin(),
  behaviors: [ListBehavior, cloudImageBehavior, shareEntryBehavior],
  /**
   * 页面的初始数据
   */
  data: {
    currentMediaType: 'photos', // 当前显示的媒体类型：photos、videos、album
    currentTab: 0, // 当前显示的标签页，0 为照片，1 为视频
    photosScrollLeft: 0, // 照片滚动位置
    videosScrollLeft: 0, // 视频滚动位置
    host: {},
    startX: 0, // 触摸开始时的 X 坐标
    startY: 0, // 触摸开始时的 Y 坐标
    currentIndex: 0, // 当前显示的照片索引
    isScrolling: false, // 是否正在滑动
    isFavorited: false, // 是否已收藏
    isLoading: true, // 是否正在加载寄养家庭详情
    isFavoriteLoading: false, // 是否正在处理收藏操作
    services: [
      { icon: '/images/icons/home-luxury-line.svg', text: '提供舒适的寄养环境' },
      { icon: '/images/icons/bowl-luxury-line.svg', text: '定时喂食和喝水' },
      { icon: '/images/icons/walk-luxury-line.svg', text: '每日遛弯和陪伴' },
      { icon: '/images/icons/camera-luxury-line.svg', text: '每日照片和视频反馈' },
      { icon: '/images/icons/pill-luxury-line.svg', text: '按时喂药服务' },
      { icon: '/images/icons/bath-luxury-line.svg', text: '洗澡和美容服务' },
    ],
    facilities: [
      { icon: '/images/icons/house-garden-luxury-line.svg', text: '独立房间' },
      { icon: '/images/icons/run-luxury-line.svg', text: '户外花园' },
      { icon: '/images/icons/tree-luxury-line.svg', text: '宠物乐园' },
      { icon: '/images/icons/lock-luxury-line.svg', text: '安全围栏' },
      { icon: '/images/icons/monitor-luxury-line.svg', text: '监控摄像头' },
      { icon: '/images/icons/toilet-luxury-line.svg', text: '宠物厕所' },
    ],
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    this._initNavbarHeight()
    const hostId = options.id || options.hostId
    if (!hostId) {
      this.error('HOST_ID_MISSING')
      setTimeout(() => wx.navigateBack(), 1500)
      return
    }

    this.getHostDetail(hostId)
    this.checkFavoriteStatus(hostId).then(isFavorited => {
      this.setData({ isFavorited })
    }).catch(err => {
      console.error('[APP] 检查收藏状态失败:', err)
      this.setData({ isFavorited: false })
    })
  },

  /**
   * 获取寄养家庭详情
   */
  async getHostDetail(hostId) {
    this.setData({ isLoading: true })

    try {
      const result = await HostService.getHostInfo(hostId)


      if (result && result.data) {
        const hostData = result.data


        const host = {
          id: hostData._id || hostData.id,
          openid: hostData.openid,
          name: hostData.hostName || '匿名寄养家庭',
          avatarUrl: hostData.avatarUrl || '',
          price: hostData.pricePerDay || 80,
          location: extractCityAndDistrict(hostData.address),
          tags: hostData.tags || ['有经验', '爱干净', '可上门'],
          description: hostData.description || '这家寄养家庭非常细心，对宠物照顾得很好。',
          photos: hostData.photos || [],
          videos: hostData.videos || [],
          isAcceptingOrders: hostData.isAcceptingOrders !== undefined ? hostData.isAcceptingOrders : true,
          hostName: hostData.hostName || '匿名寄养家庭',
        }


        const photosSnapPoints = []
        if (host.photos && host.photos.length > 0) {
          for (let i = 0; i < host.photos.length; i++) {
            photosSnapPoints.push(i * 750)
          }
        }

        this.setData({
          host,
          photosSnapPoints,
          isLoading: false,
        })
      } else {
        this.setData({ isLoading: false })
        this.error('HOST_NOT_FOUND_TEXT')
      }
    } catch (error) {
      console.error('[APP] 获取寄养家庭详情失败', error)
      this.setData({ isLoading: false })
      this.error('GET_FAILED')
    }
  },

  /**
   * 切换标签页
   */
  _pauseAllVideos() {
    (this.data.host.videos || []).forEach((_, i) => {
      const videoContext = wx.createVideoContext(`video${i}`, this)
      if (videoContext) {
        videoContext.pause()
      }
    })
  },

  switchTab(e) {
    const index = parseInt(e.currentTarget.dataset.index, 10)

    if (this.data.currentTab === 1) {
      this._pauseAllVideos()
    }

    this.setData({
      currentTab: index,
    })

  },

  switchMediaType(e) {
    const mediaType = e.currentTarget.dataset.type

    if (this.data.currentMediaType === 'videos') {
      this._pauseAllVideos()
    }

    // 处理相册跳转
    if (mediaType === 'album') {
      this.openAlbum()
      return
    }

    // 切换到其他媒体类型
    this.setData({
      currentMediaType: mediaType,
      currentIndex: 0,
    })
  },

  /**
   * 打开照片页面
   */
  goToPhotosPage() {
    wx.navigateTo({
      url: `/subpackages/other/album/index?hostId=${this.data.host.id || this.data.host._id || ''}&tab=album`,
    })
  },

  /**
   * 打开视频页面
   */
  goToVideosPage() {
    wx.navigateTo({
      url: `/subpackages/other/album/index?hostId=${this.data.host.id || this.data.host._id || ''}&tab=video`,
    })
  },

  /**
   * 打开相册页面
   */
  openAlbum() {
    wx.navigateTo({
      url: `/subpackages/other/album/index?hostId=${this.data.host.id || this.data.host._id || ''}`,
    })
  },

  /**
   * 轮播图切换事件
   */
  onSwiperChange(e) {
    // 防止连续滑动
    if (this.data.isScrolling) {
      return
    }

    this.setData({
      isScrolling: true,
      currentIndex: e.detail.current,
    })

    // 设置滑动锁定定时器
    setTimeout(() => {
      this.setData({
        isScrolling: false,
      })
    }, 300) // 与轮播图切换动画时间一致
  },

  /**
   * 查看更多照片
   */
  viewMorePhotos() {
    wx.navigateTo({ url: `/subpackages/other/album/index?hostId=${this.data.host._id}` })
  },

  viewMoreVideos() {
    wx.navigateTo({ url: `/subpackages/other/video-list/index?hostId=${this.data.host._id}` })
  },

  playVideo(e) {
    const index = e.currentTarget.dataset.index
    wx.navigateTo({ url: `/subpackages/other/video-list/index?hostId=${this.data.host._id}&index=${index}` })
  },

  async contactFamily() {
    const host = this.data.host
    if (!host || !host.openid) {
      this.error('HOST_INFO_LOAD_FAILED')
      return
    }

    if (!authService.isLoggedIn()) {
      this.error('AUTH_REQUIRED')
      return
    }

    this.error('CHAT_NOT_OPEN')
  },

  /**
   * 收藏/取消收藏
   */
  async toggleFavorite() {
    const hostId = this.data.host.id
    const isFavorited = this.data.isFavorited

    // 设置加载状态
    this.setData({
      isFavoriteLoading: true,
    })

    try {
      if (isFavorited) {
        // 取消收藏
        await this.removeFavorite(hostId)
      } else {
        // 添加收藏
        await this.addFavorite(hostId)
      }

      // 更新收藏状态
      this.setData({
        isFavorited: !isFavorited,
        isFavoriteLoading: false,
      })
    } catch (error) {
      console.error('[APP] 处理收藏操作失败:', error)
      this.error('OPERATION_RETRY')
      // 无论成功失败，都要设置加载状态为false
      this.setData({
        isFavoriteLoading: false,
      })
    }
  },

  /**
   * 添加收藏
   */
  async addFavorite(hostId) {
    try {
      // 确保hostId是字符串
      const hostProfileId = typeof hostId === 'string' ? hostId : hostId.hostProfileId
      if (!hostProfileId) {
        throw new Error('缺少hostProfileId')
      }

      const result = await FavoriteService.addFavorite({ hostProfileId })

      if (result.code === 0) {
        this.toast('FAVORITE_SUCCESS')
        return result
      } else {
        this.error(() => result.message)
        throw new Error(result.message)
      }
    } catch (error) {
      console.error('[APP] 添加收藏失败:', error)
      this.error('FAVORITE_FAILED')
      throw error
    }
  },

  /**
   * 取消收藏
   */
  async removeFavorite(hostId) {
    try {
      // 确保hostId是字符串
      const hostProfileId = typeof hostId === 'string' ? hostId : hostId.hostProfileId
      if (!hostProfileId) {
        throw new Error('缺少hostProfileId')
      }

      const result = await FavoriteService.removeFavorite({ hostProfileId })

      if (result.code === 0) {
        this.toast('UNFAVORITE_SUCCESS')
        return result
      } else {
        this.error(() => result.message)
        throw new Error(result.message)
      }
    } catch (error) {
      console.error('[APP] 取消收藏失败:', error)
      this.error('UNFAVORITE_FAILED')
      throw error
    }
  },

  /**
   * 检查是否已收藏
   */
  async checkFavoriteStatus(hostId) {
    try {
      const result = await FavoriteService.getFavorites({})

      if (result.code === 0 && result.data) {

        const favoriteList = result.data.list || result.data
        const isFavorited = favoriteList.some(favorite => {
          const favoriteHostId = favorite.hostProfileId || favorite.id
          return String(favoriteHostId) === String(hostId)
        })
        return isFavorited
      } else {
        return false
      }
    } catch (error) {
      console.error('[APP] 获取收藏列表失败:', error)
      return false // 失败时返回 false
    }
  },

  // 页面卸载时清理资源


  onShareAppMessage() {
    const { host } = this.data
    const hostId = host?._id || host?.id
    const basePath = hostId ? `/subpackages/booking/host-detail?id=${hostId}` : '/subpackages/booking/host-detail'
    return {
      title: host?.name ? `${host.name} - 寄养家庭` : 'AROORO 寄养家庭',
      path: buildSharePath(basePath),
    }
  },
})
