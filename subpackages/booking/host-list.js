const { HostService } = require('../../services/CloudFunctionService')
const { extractCityAndDistrict } = require('../../utils/addressUtils')
const { BookingData } = require('../../utils/BookingDataService')
const cloudImageBehavior = require('../../behaviors/cloudImageBehavior')

const pageI18n = require('../../utils/page-i18n.js')

Page({
  ...pageI18n.mixin(),
  behaviors: [cloudImageBehavior],
  /**
   * 页面的初始数据
   */
  data: {
    hosts: [],
    isLoading: true  // 是否正在加载寄养家庭列表
  },

  onLoad(options) {
    this.getHostList()
  },

  /**
   * 获取寄养家庭列表
   */
  async getHostList() {
    // 设置加载状态，显示页面内加载动画
    this.setData({ isLoading: true })

    try {
      const result = await HostService.getHostList()
      
      if (result.code === 0) {
        const hostData = result.data.list || result.data
          const hosts = (hostData || [])
            .filter(host => host.isAcceptingOrders !== false) // 只保留接受接单的寄养家庭
            .map((host, index) => {
              return {
                id: host._id || host.id,
                name: host.hostName || '匿名寄养家庭',
                avatarUrl: host.avatarUrl || '',
                price: host.pricePerDay || 80,
                location: extractCityAndDistrict(host.address),
                tags: host.tags || ['有经验', '爱干净', '可上门'],
                isAcceptingOrders: host.isAcceptingOrders !== false // 默认接受接单
              }
            })

          this.setData({
            hosts: hosts,
            isLoading: false  // 加载完成，关闭加载动画
          })
        } else {
          this.setData({ isLoading: false })
          this.errorDynamic(result.message, 'GET_FAILED')
        }
      } catch (error) {
        console.error('[APP] 获取寄养家庭列表失败', error)
        this.setData({ isLoading: false })
        this.error('GET_FAILED')
      } finally {
        this.setData({ isLoading: false })
        wx.stopPullDownRefresh()
      }
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
   * 预约寄养家庭
   */
  bookHost(e) {
    const hostId = e.currentTarget.dataset.id
    const selectedHost = this.data.hosts.find(host => host.id === hostId)
    
    if (!selectedHost) {
      this.error('HOST_NOT_EXIST')
      return
    }

    if (selectedHost.isAcceptingOrders === false) {
      this.error('HOST_PAUSED')
      return
    }

    // 保存选择的寄养家庭信息
    BookingData.set('selectedHost', selectedHost)

    // 跳转到确认订单页面
    wx.navigateTo({
      url: `/subpackages/booking/confirm?id=${hostId}`
    })
  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {
    this.getHostList()
  }
})