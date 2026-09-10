const { ListBehavior } = require('../../../behaviors/listBehavior')

const authGateBehavior = require('../../../behaviors/authGateBehavior')
Page({
  behaviors: [ListBehavior, authGateBehavior],
  onLoad() {
    this._initNavbarHeight()
  },

  // 返回上一页
  goBack() {
    wx.navigateBack()
  },
})
