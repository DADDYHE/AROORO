// 视频列表页面逻辑
Page({
  /**
   * 页面的初始数据
   */
  data: {
    videos: [], // 视频列表
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    // 从页面参数中获取寄养家庭信息
    try {
      const host = JSON.parse(decodeURIComponent(options.host || '{}'))
      console.log('视频列表页面获取到的寄养家庭信息：', host)
    
      // 处理视频数据
      const videos = []
    
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
      }
    
      this.setData({
        videos: videos
      })
    } catch (error) {
      console.error('解析寄养家庭信息失败：', error)
      this.setData({
        videos: []
      })
    }
  },



  /**
   * 预览视频
   */
  previewVideo: function (e) {
    const index = e.currentTarget.dataset.index
    const video = this.data.videos[index]
    
    console.log('预览视频:', video)
    
    // 这里可以添加视频播放逻辑，例如跳转到全屏播放页面
    wx.showToast({
      title: '视频播放功能开发中',
      icon: 'none'
    })
  },

  /**
   * 视频播放事件
   */
  onVideoPlay: function (e) {
    const { index } = e.currentTarget.dataset
    console.log('视频播放:', index)
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
   * 用户点击右上角分享
   */
  onShareAppMessage: function () {
    return {
      title: '查看视频列表',
      path: '/subpackages/other/video-list/index'
    }
  }
})
