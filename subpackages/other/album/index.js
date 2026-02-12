// 相册页面逻辑
Page({
  /**
   * 页面的初始数据
   */
  data: {
    currentTab: 'album', // 当前选中的标签：'video' 或 'album'
    photos: [], // 照片列表
    videos: [], // 视频列表
    scrollPosition: 0, // 滚动位置
    isScrolling: false, // 是否正在滚动
    videoSnapPoints: [], // 视频滚动停靠点
    videoHeight: 0, // 视频容器高度（像素）
    currentVideoIndex: 0, // 当前播放的视频索引
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    // 从页面参数中获取寄养家庭信息和标签页参数
    try {
      console.log('相册页面参数：', options)
      const host = JSON.parse(decodeURIComponent(options.host || '{}'))
      const tab = options.tab || 'album' // 默认显示相册标签页
      console.log('相册页面获取到的寄养家庭信息：', host)
    
      // 分离照片和视频
      const photos = []
      const videos = []
    
      // 添加照片
      if (host.photos && host.photos.length > 0) {
        host.photos.forEach(photoUrl => {
          photos.push({
            url: photoUrl,
            id: `photo-${Date.now()}-${Math.random()}`
          })
        })
        console.log('处理后的照片数据：', photos)
      }
    
      // 添加视频
      if (host.videos && host.videos.length > 0) {
        host.videos.forEach((videoUrl, index) => {
          videos.push({
            url: videoUrl,
            id: `video-${Date.now()}-${Math.random()}`,
            poster: `https://picsum.photos/600/400?random=${Math.random()}`, // 随机封面图
            description: index === 0 ? '这是一只非常可爱的小猫咪，喜欢玩耍和睡觉' : index === 1 ? '狗狗们在公园里快乐地玩耍' : index === 2 ? '记录宠物的日常生活点滴' : index === 3 ? '收集了各种萌宠的照片和视频' : '宠物们在这里度过快乐的时光', // 视频文案
            hostInfo: {
              avatarUrl: host.avatarUrl, // 寄养家庭头像
              name: host.name // 寄养家庭名字
            }
          })
        })
        console.log('处理后的视频数据：', videos)
      }
    
      // 计算视频轮播图高度
      let videoHeight = 0
      if (videos.length > 0) {
        // 获取屏幕高度，计算每个视频的实际高度（减去切换栏）
        const windowInfo = wx.getWindowInfo()
        const rpxToPx = windowInfo.windowWidth / 750 // 计算 rpx 到 px 的转换比例
        videoHeight = windowInfo.windowHeight - 230 * rpxToPx // 230rpx 转换为像素值，比之前减少 150rpx，让播放器高度增加 50rpx
      }
    
      this.setData({
        currentTab: tab,
        photos: photos,
        videos: videos,
        videoHeight: videoHeight
      })
      
      console.log('页面数据设置完成：', this.data)
    } catch (error) {
      console.error('解析寄养家庭信息失败：', error)
      this.setData({
        photos: [],
        videos: []
      })
    }
  },

  /**
   * 切换标签页
   */
  switchTab: function (e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({
      currentTab: tab,
      scrollPosition: 0
    })
  },

  /**
   * 返回上一页
   */
  goBack: function () {
    wx.navigateBack()
  },

  /**
   * 预览照片
   */
  previewPhoto: function (e) {
    console.log('图片点击事件触发', e)
    
    const index = e.currentTarget.dataset.index
    console.log('当前图片索引:', index)
    
    wx.navigateTo({
      url: `/subpackages/other/photo-viewer/index?photos=${encodeURIComponent(JSON.stringify(this.data.photos))}&currentIndex=${index}`,
      success: function(res) {
        console.log('页面跳转成功:', res)
      },
      fail: function(err) {
        console.error('页面跳转失败:', err)
      }
    })
  },

  /**
   * 播放视频
   */
  playVideo: function (e) {
    const index = e.currentTarget.dataset.index
    const video = this.data.videos[index]
    
    wx.navigateTo({
      url: `/pages/video-player/index?url=${video.url}`
    })
  },

  /**
   * 切换播放/暂停
   */
  togglePlay: function (e) {
    const index = e.currentTarget.dataset.index
    const videoId = `video-${index}`
    const videoContext = wx.createVideoContext(videoId)
    
    // 获取视频当前状态
    videoContext.playbackRate = 1.0 // 恢复正常速度
    videoContext.play()
  },

  /**
   * 滚动事件处理
   */
  onScroll: function (e) {
    this.setData({
      scrollPosition: e.detail.scrollTop,
      isScrolling: true
    })
    
    // 延迟结束滚动状态
    clearTimeout(this.scrollTimeout)
    this.scrollTimeout = setTimeout(() => {
      this.setData({
        isScrolling: false
      })
    }, 100)
  },

  /**
   * 视频轮播图切换事件
   */
  onVideoSwiperChange: function (e) {
    const { current } = e.detail
    
    // 暂停之前播放的视频
    const prevVideoId = `video-${this.data.currentVideoIndex}`
    const prevVideoContext = wx.createVideoContext(prevVideoId)
    if (prevVideoContext) {
      prevVideoContext.pause()
    }
    
    // 更新当前视频索引
    this.setData({
      currentVideoIndex: current
    })
    
    // 播放当前视频
    const currentVideoId = `video-${current}`
    const currentVideoContext = wx.createVideoContext(currentVideoId)
    if (currentVideoContext) {
      currentVideoContext.play()
    }
  },

  /**
   * 视频播放事件
   */
  onVideoPlay: function (e) {
    const { index } = e.currentTarget.dataset
    console.log('视频播放:', index)
  },

  /**
   * 视频暂停事件
   */
  onVideoPause: function (e) {
    const { index } = e.currentTarget.dataset
    console.log('视频暂停:', index)
  },

  /**
   * 视频播放结束事件
   */
  onVideoEnded: function (e) {
    const { index } = e.currentTarget.dataset
    console.log('视频播放结束:', index)
    
    // 自动播放下一个视频
    if (index < this.data.videos.length - 1) {
      this.setData({
        currentVideoIndex: index + 1
      })
    }
  },

  /**
   * 视频播放进度更新事件
   */
  onVideoTimeUpdate: function (e) {
    const { index } = e.currentTarget.dataset
    const { currentTime, duration } = e.detail
    
    // 更新视频播放进度
    const videos = this.data.videos
    videos[index].currentTime = currentTime
    videos[index].duration = duration
    videos[index].playProgress = duration > 0 ? (currentTime / duration) * 100 : 0
    
    this.setData({
      videos: videos
    })
  },

  /**
   * 进度条触摸开始事件
   */
  onProgressTouchStart: function (e) {
    const { index } = e.currentTarget.dataset
    const videos = this.data.videos
    videos[index].isDragging = true
    this.setData({
      videos: videos
    })
  },

  /**
   * 进度条触摸移动事件
   */
  onProgressTouchMove: function (e) {
    const { index } = e.currentTarget.dataset
    const { clientX } = e.touches[0]
    const windowInfo = wx.getWindowInfo()
    const screenWidth = windowInfo.windowWidth
    
    // 计算触摸位置在屏幕中的百分比
    let percent = (clientX / screenWidth) * 100
    percent = Math.max(0, Math.min(100, percent)) // 限制在 0-100% 范围内
    
    const videos = this.data.videos
    videos[index].playProgress = percent
    
    // 根据进度计算当前播放时间
    if (videos[index].duration) {
      videos[index].currentTime = (percent / 100) * videos[index].duration
    }
    
    this.setData({
      videos: videos
    })
  },

  /**
   * 进度条触摸结束事件
   */
  onProgressTouchEnd: function (e) {
    const { index } = e.currentTarget.dataset
    const videos = this.data.videos
    videos[index].isDragging = false
    
    // 跳转到指定位置播放
    const videoId = `video-${index}`
    const videoContext = wx.createVideoContext(videoId)
    if (videoContext && videos[index].duration) {
      videoContext.seek(videos[index].currentTime)
      videoContext.play()
    }
    
    this.setData({
      videos: videos
    })
  },

  /**
   * 格式化时间为 MM:SS 格式
   */
  formatTime: function (seconds) {
    if (!seconds || isNaN(seconds)) {
      return '00:00'
    }
    
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh: function () {
    // 这里可以添加刷新数据的逻辑
    setTimeout(() => {
      wx.stopPullDownRefresh()
    }, 1000)
  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom: function () {
    // 这里可以添加加载更多数据的逻辑
  },

  /**
   * 跳转到视频列表页面
   */
  goToVideoList: function () {
    // 从页面参数中获取寄养家庭信息
    try {
      const pages = getCurrentPages()
      const prevPage = pages[pages.length - 2]
      const host = prevPage.data.host
      
      wx.navigateTo({
        url: `/subpackages/other/video-list/index?host=${encodeURIComponent(JSON.stringify(host))}`
      })
    } catch (error) {
      console.error('获取寄养家庭信息失败：', error)
      wx.showToast({
        title: '获取信息失败',
        icon: 'none'
      })
    }
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function () {
    return {
      title: '查看寄养家庭相册',
      path: '/subpackages/other/album/index'
    }
  }
})
