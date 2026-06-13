const tabBarSyncBehavior = require('../../behaviors/tabBarSync')
const cloudImageBehavior = require('../../behaviors/cloudImageBehavior')
const { CLOUD_ICONS } = require('../../utils/cloudIcons')
const pageI18n = require('../../utils/page-i18n.js')

const SERVICE_ICONS = [
  CLOUD_ICONS.DOOR_OPEN,
  CLOUD_ICONS.HOME_HEART,
]

Page({
  ...pageI18n.mixin(),
  behaviors: [tabBarSyncBehavior, cloudImageBehavior],
  data: {
    statusBarHeight: 20,
    serviceItems: [
      { id: 'feeding', name: 'FEEDING_SERVICE', desc: 'FEEDING_SERVICE_DESC', icon: SERVICE_ICONS[0] },
      { id: 'boarding', name: 'BOARDING_SERVICE', desc: 'BOARDING_SERVICE_DESC', icon: SERVICE_ICONS[1] },
    ],
  },

  onLoad() {
    const windowInfo = wx.getWindowInfo()
    this.setData({ statusBarHeight: windowInfo.statusBarHeight || 20 })
  },

  onShow() {
    this._syncTabBar()
  },

  handleServiceTap(e) {
    const id = e.currentTarget.dataset.id
    const routes = {
      boarding: '/subpackages/booking/host-list-all',
      feeding: '/subpackages/feeding/service-home',
    }
    const url = routes[id]
    if (!url) {return}
    wx.navigateTo({ url })
  },
})
