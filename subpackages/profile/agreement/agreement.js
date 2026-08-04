const { ListBehavior } = require('../../../behaviors/listBehavior')

Page({
  behaviors: [ListBehavior],
  onLoad() {
    this._initNavbarHeight()
  },

  // 返回上一页
  goBack() {
    wx.navigateBack()
  },
})
