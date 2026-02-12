// 图片查看页面逻辑
Page({
  /**
   * 页面的初始数据
   */
  data: {
    currentIndex: 0, // 当前显示的照片索引
    photos: [], // 照片列表
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    // 从页面参数中获取照片列表和当前索引
    try {
      const photos = JSON.parse(decodeURIComponent(options.photos || '[]'))
      const currentIndex = parseInt(options.currentIndex || '0')
      
      console.log('图片查看页面获取到的照片列表：', photos)
      console.log('当前照片索引：', currentIndex)
      
      this.setData({
        currentIndex: currentIndex,
        photos: photos,
      })
    } catch (error) {
      console.error('解析照片数据失败：', error)
      this.setData({
        currentIndex: 0,
        photos: [],
      })
    }
  },

  /**
   * 图片加载完成事件
   */
  onImageLoad: function (e) {
    const { width, height } = e.detail
    const index = e.currentTarget.dataset.index
    
    // 更新照片的宽高信息
    const photos = this.data.photos
    photos[index].width = width
    photos[index].height = height
    
    this.setData({
      photos: photos
    })
  },

  /**
   * 轮播图切换事件
   */
  onSwiperChange: function (e) {
    const { current } = e.detail
    this.setData({
      currentIndex: current
    })
  },

  /**
   * 切换照片
   */
  switchPhoto: function (e) {
    const index = e.currentTarget.dataset.index
    this.setData({
      currentIndex: index
    })
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
      title: '查看照片',
      path: '/subpackages/other/photo-viewer/index'
    }
  }
})
