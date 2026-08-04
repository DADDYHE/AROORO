const app = getApp()
const { ListBehavior } = require('../../../behaviors/listBehavior')

Page({
  behaviors: [ListBehavior],
  data: {
    // 从 globalData 读取版本号（由 utils/appStartupOptimizer.js 启动时写入），
    // 兜底保留 '1.0.0' 防止 globalData 未初始化导致显示空白
    version: (app && app.globalData && app.globalData.appVersion) || '1.0.0',
  },

  onLoad() {
    this._initNavbarHeight()
  },

  // 返回上一页
  goBack() {
    wx.navigateBack()
  },
})
