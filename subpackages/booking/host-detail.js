const __i18n = require('../../utils/i18n.js')
const __pageI18n = require('../../utils/page-i18n.js')
const __i18nT = (k) => __i18n.t(k, __i18n.getLocale())
const { HostService, FavoriteService } = require('../../services/CloudFunctionService')
const { formatRegion } = require('../../utils/addressUtils')
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
    t: __pageI18n.buildTMap(__i18n.getLocale()),
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
    // 服务/居住条件由真实档案字段映射（getHostDetail 内构建），无数据则整块隐藏
    services: [],
    facilities: [],
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
          // 价格：真实值，未填（0）时展示「价格待定」，不造假
          price: Number(hostData.pricePerDay) || 0,
          location: formatRegion(hostData),
          tags: hostData.tags || [],
          description: hostData.description || '',
          photos: hostData.photos || [],
          videos: hostData.videos || [],
          isAcceptingOrders: hostData.isAcceptingOrders !== undefined ? hostData.isAcceptingOrders : true,
          // 联系方式：电话直拨 + 微信号复制（编辑表单留存，getHostDetail 公开投影透出）
          contactPhone: hostData.phone || '',
          wechatId: hostData.wechatId || '',
          hostName: hostData.hostName || '匿名寄养家庭',
        }

        // 服务内容：映射真实 serviceTypes（档案表单收集），无数据则整块隐藏
        const SERVICE_META = {
          board: { icon: '/images/icons/home-luxury-line.svg', text: '家庭寄养' },
          walk: { icon: '/images/icons/walk-luxury-line.svg', text: '每日遛狗' },
          feed: { icon: '/images/icons/bowl-luxury-line.svg', text: '上门喂养' },
        }
        const services = (Array.isArray(hostData.serviceTypes) ? hostData.serviceTypes : [])
          .filter(k => SERVICE_META[k])
          .map(k => SERVICE_META[k])

        // 居住条件：映射真实档案字段，无数据则整块隐藏
        const BOARDING_MODE_TEXT = { cage: '笼养', freeRange: '散养', flexible: '按需选择' }
        const facilities = []
        if (hostData.housingType) {
          facilities.push({ icon: '/images/icons/home-luxury-line.svg', text: hostData.housingType })
        }
        if (hostData.boardingMode && BOARDING_MODE_TEXT[hostData.boardingMode]) {
          facilities.push({ icon: '/images/icons/paw-luxury-line.svg', text: `寄养方式 · ${BOARDING_MODE_TEXT[hostData.boardingMode]}` })
        }
        if (hostData.hasYard === 'yes') {
          facilities.push({ icon: '/images/icons/tree-luxury-line.svg', text: '户外院子' })
        }
        if (Number(hostData.maxPets) > 0) {
          facilities.push({ icon: '/images/icons/dog-luxury-line.svg', text: `可接 ${Number(hostData.maxPets)} 只` })
        }


        // 收费方式（勿与寄养方式 boardingMode 混淆）：档案缺失时兜底酒店式（与档案/服务端口径一致）
        const BILLING_META = {
          hotel: {
            label: '酒店式',
            intro: `按过夜计费；${hostData.checkInAfter || '14:00'} 后入住、${hostData.checkOutBefore || '12:00'} 前退房，超时将加收半天或一天费用`,
          },
          hourly24: {
            label: '24小时制',
            intro: '每满 24 小时按一天计，不足一天按实际小时计费（小时价 = 日单价 ÷ 24）',
          },
        }
        const billingMeta = BILLING_META[hostData.billingMode] || BILLING_META.hotel

        const photosSnapPoints = []
        if (host.photos && host.photos.length > 0) {
          for (let i = 0; i < host.photos.length; i++) {
            photosSnapPoints.push(i * 750)
          }
        }

        this.setData({
          host,
          services,
          facilities,
          chargeLabel: billingMeta.label,
          chargeIntro: billingMeta.intro,
          photosSnapPoints,
          isLoading: false,
        })
        this._updateCounter(this.data.currentMediaType)
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

  /** 画册页码（Skyline：wxml 绑定禁方法调用，页码一律 JS 预计算） */
  _updateCounter(type) {
    const list = type === 'videos' ? (this.data.host.videos || []) : (this.data.host.photos || [])
    const total = list.length
    if (!total) {
      this.setData({ counterText: '' })
      return
    }
    const current = type === this.data.currentMediaType ? (this.data.currentIndex || 0) : 0
    const pad = (n) => (n < 10 ? '0' + n : '' + n)
    this.setData({ counterText: `${pad(current + 1)} / ${pad(total)}` })
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
    this._updateCounter(mediaType)
  },

  /**
   * 打开照片页面
   */
  goToPhotosPage() {
    wx.navigateTo({
      url: `/subpackages/other/album/index?hostId=${this.data.host.id || this.data.host.id || ''}&tab=album`,
    })
  },

  /**
   * 打开视频页面
   */
  goToVideosPage() {
    wx.navigateTo({
      url: `/subpackages/other/album/index?hostId=${this.data.host.id || this.data.host.id || ''}&tab=video`,
    })
  },

  /**
   * 打开相册页面
   */
  openAlbum() {
    wx.navigateTo({
      url: `/subpackages/other/album/index?hostId=${this.data.host.id || this.data.host.id || ''}`,
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
    this._updateCounter(this.data.currentMediaType)

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
    wx.navigateTo({ url: `/subpackages/other/album/index?hostId=${this.data.host.id}` })
  },

  viewMoreVideos() {
    wx.navigateTo({ url: `/subpackages/other/video-list/index?hostId=${this.data.host.id}` })
  },

  playVideo(e) {
    const index = e.currentTarget.dataset.index
    wx.navigateTo({ url: `/subpackages/other/video-list/index?hostId=${this.data.host.id}&index=${index}` })
  },

  /**
   * 立即预约：跳预订确认页（选日期/宠物/下单）
   */
  goBooking() {
    const host = this.data.host
    if (!host || !host.id) {
      this.error('HOST_INFO_LOAD_FAILED')
      return
    }
    if (host.isAcceptingOrders === false) {
      wx.showToast({ title: '该家庭已暂停接待', icon: 'none' })
      return
    }
    if (!authService.isLoggedIn()) {
      this.error('AUTH_REQUIRED')
      return
    }
    wx.navigateTo({ url: `/subpackages/booking/confirm?hostId=${host.id}` })
  },

  /**
   * 联系家庭：有电话/微信号时弹 ActionSheet——电话直拨，微信号复制引导添加
   */
  async contactFamily() {
    const host = this.data.host
    // 公开投影不透 openid，用 host.id（档案 _id）判存在
    if (!host || !host.id) {
      this.error('HOST_INFO_LOAD_FAILED')
      return
    }

    if (!authService.isLoggedIn()) {
      this.error('AUTH_REQUIRED')
      return
    }

    const items = []
    const actions = []
    if (host.contactPhone) {
      items.push(`拨打电话 ${host.contactPhone}`)
      actions.push('call')
    }
    if (host.wechatId) {
      items.push(`复制微信号 ${host.wechatId}`)
      actions.push('copy')
    }

    if (!items.length) {
      wx.showToast({ title: '家庭未留联系方式', icon: 'none' })
      return
    }

    wx.showActionSheet({
      itemList: items,
      success: (res) => {
        const action = actions[res.tapIndex]
        if (action === 'call') {
          wx.makePhoneCall({ phoneNumber: host.contactPhone })
        } else if (action === 'copy') {
          wx.setClipboardData({
            data: host.wechatId,
            success: () => wx.showToast({ title: '已复制，去微信添加好友', icon: 'none' }),
          })
        }
      },
      fail: () => {}, // 用户取消，静默
    })
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
      const result = await FavoriteService.getFavorites({}, { useCache: false })

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
    const hostId = host?.id
    const basePath = hostId ? `/subpackages/booking/host-detail?id=${hostId}` : '/subpackages/booking/host-detail'
    return {
      title: host?.name ? `${host.name} - 寄养家庭` : 'AROORO 寄养家庭',
      path: buildSharePath(basePath),
    }
  },
})
