Page({
  /**
   * 页面的初始数据
   */
  data: {
    hosts: []
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    this.getHostList()
  },

  /**
   * 获取寄养家庭列表
   */
  getHostList() {
    wx.showLoading({
      title: '加载中...'
    })

    wx.cloud.callFunction({
      name: 'getHostList',
      success: res => {
        console.log('获取寄养家庭列表成功', res)
        if (res.result.code === 0) {
          // 从完整地址中提取城市和区县信息
          function extractCityAndDistrict(address) {
            if (!address) {return '成都市'}
            
            // 常见的地址格式："成都市武侯区某某街道"或"成都市锦江区某某路"
            // 提取前两级行政区划
            const addressParts = address.split(/[市县区]/).filter(part => part)
            if (addressParts.length >= 2) {
              return `${addressParts[0]}市${addressParts[1]}区`
            } else if (addressParts.length >= 1) {
              return `${addressParts[0]}市`
            } else {
              return '成都市'
            }
          }
          
          // 处理获取到的数据，确保数据结构符合页面需求
          // 过滤掉不接受接单的寄养家庭，只显示可选择的寄养家庭
          const hosts = res.result.data
            .filter(host => host.isAcceptingOrders !== false) // 只保留接受接单的寄养家庭
            .map((host, index) => {
              return {
                id: host.id,
                name: host.hostName || '匿名寄养家庭',
                avatarUrl: host.avatarUrl || '',
                rating: host.rating || 4.8,
                reviews: host.reviewCount || 0,
                price: host.pricePerDay || 80,
                location: extractCityAndDistrict(host.address),
                tags: ['有经验', '爱干净', '可上门'], // 暂时使用默认标签
                isAcceptingOrders: host.isAcceptingOrders !== false // 默认接受接单
              }
            })

          this.setData({
            hosts: hosts
          })
        } else {
          wx.showToast({
            title: res.result.message || '获取失败',
            icon: 'none'
          })
        }
      },
      fail: err => {
        console.error('获取寄养家庭列表失败', err)
        wx.showToast({
          title: '获取失败',
          icon: 'none'
        })
      },
      complete: () => {
        wx.hideLoading()
        wx.stopPullDownRefresh()
      }
    })
  },

  /**
   * 选择寄养家庭
   */
  selectHost(e) {
    const hostId = e.currentTarget.dataset.id
    const selectedHost = this.data.hosts.find(host => host.id === hostId)
    
    // 跳转到寄养家庭详情页面
    wx.navigateTo({
      url: `/subpackages/booking/host-detail?id=${hostId}`
    })
  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {
    // 刷新页面数据
    this.getHostList()
  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {
    // 加载更多数据
  }
})