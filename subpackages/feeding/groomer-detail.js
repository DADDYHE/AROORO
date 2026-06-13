const { FeedingService } = require('./services/FeedingService')

const pageI18n = require('../../utils/page-i18n.js')

Page({
  ...pageI18n.mixin(),
  data: {
    groomer: null,
    isLoading: true,
  },

  onLoad(options) {
    const groomerId = options.id
    if (groomerId) {
      this.loadGroomerDetail(groomerId)
    } else {
      this.setData({ isLoading: false })
      this.error('INVALID_PARAMS')
    }
  },

  async loadGroomerDetail(groomerId) {
    this.setData({ isLoading: true })
    try {
      const result = await FeedingService.getFeederDetail(groomerId)
      if (result && result.code === 0 && result.data) {
        this.setData({ groomer: result.data })
      } else {
        this.error('GROOMER_NOT_FOUND')
        setTimeout(() => wx.navigateBack(), 1500)
      }
    } catch (error) {
      console.error('[GroomerDetail] 加载失败:', error)
      this.error('LOAD_FAILED')
      setTimeout(() => wx.navigateBack(), 1500)
    }
    this.setData({ isLoading: false })
  },

  onBookService() {
    const { groomer } = this.data
    if (!groomer) {return}
    wx.navigateTo({
      url: `/subpackages/feeding/order-confirm?feederId=${groomer._id}`,
    })
  },

  onContact() {
    wx.switchTab({ url: '/pages/messages/index' })
  },
})
