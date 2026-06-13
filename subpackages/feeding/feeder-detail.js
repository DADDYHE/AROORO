const { FeedingService } = require('./services/FeedingService')
const cloudImageBehavior = require('../../behaviors/cloudImageBehavior')

const pageI18n = require('../../utils/page-i18n.js')
const { buildSharePath } = require('../../utils/share')

Page({
  ...pageI18n.mixin(),
  behaviors: [cloudImageBehavior],

  data: {
    feeder: null,
    isLoading: true,
    source: '',
  },

  onLoad(options) {
    const feederId = options.id
    const source = options.source || ''
    this.setData({ source })
    if (feederId) {
      this.loadFeederDetail(feederId)
    } else {
      this.setData({ isLoading: false })
      this.error('INVALID_PARAMS')
    }
  },

  async loadFeederDetail(feederId) {
    this.setData({ isLoading: true })
    try {
      const result = await FeedingService.getFeederDetail(feederId)
      if (result && result.code === 0 && result.data) {
        const feeder = this._formatFeeder(result.data)
        this.setData({ feeder })
      } else {
        this.error('FEEDER_NOT_FOUND')
        setTimeout(() => wx.navigateBack(), 1500)
      }
    } catch (error) {
      console.error('[FeederDetail] 加载失败:', error)
      this.error('LOAD_FAILED')
      setTimeout(() => wx.navigateBack(), 1500)
    }
    this.setData({ isLoading: false })
  },

  _formatFeeder(p) {
    return {
      ...p,
      displayName: p.nickname || p.realName || p.name || '服务师',
      priceText: p.pricePerVisit ? `¥${p.pricePerVisit}` : '面议',
      address: p.address || (p.serviceArea && p.serviceArea.length > 0 ? p.serviceArea.join('、') : ''),
      experience: p.experience || 0,
      beautyBreeds: (p.beautyInfo && p.beautyInfo.breeds) ? p.beautyInfo.breeds : '',
      beautyPrice: (p.beautyInfo && p.beautyInfo.price) ? p.beautyInfo.price : 0,
    }
  },

  onBookService() {
    const { feeder } = this.data
    if (!feeder) {return}
    wx.navigateTo({
      url: `/subpackages/feeding/order-confirm?feederId=${feeder._id}`,
    })
  },

  onContact() {
    wx.switchTab({ url: '/pages/messages/index' })
  },

  onShareAppMessage() {
    const { feeder } = this.data
    const displayName = feeder?.nickname || feeder?.realName || feeder?.name
    const basePath = `/subpackages/feeding/feeder-detail?id=${feeder?._id}`
    return {
      title: displayName ? `${displayName} - 服务师` : '宠物服务师',
      path: buildSharePath(basePath),
    }
  },
})
