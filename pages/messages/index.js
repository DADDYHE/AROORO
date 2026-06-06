const tabBarSyncBehavior = require('../../behaviors/tabBarSync');
const cloudImageBehavior = require('../../behaviors/cloudImageBehavior');

const SERVICE_ICONS = [
  'cloud://cloudbase-d7getcjqy33b13475.636c-cloudbase-d7getcjqy33b13475-1433773870/icons/door-open-line.svg',
  'cloud://cloudbase-d7getcjqy33b13475.636c-cloudbase-d7getcjqy33b13475-1433773870/icons/home-heart-line.svg',
]

Page({
  behaviors: [tabBarSyncBehavior, cloudImageBehavior],
  data: {
    statusBarHeight: 20,
    serviceItems: [
      { id: 'feeding', name: '上门服务', desc: '洗护·喂养', icon: SERVICE_ICONS[0] },
      { id: 'boarding', name: '宠物寄养', desc: '安心寄养家庭', icon: SERVICE_ICONS[1] },
    ],
  },

  onLoad() {
    const windowInfo = wx.getWindowInfo();
    this.setData({ statusBarHeight: windowInfo.statusBarHeight || 20 });
  },

  onShow() {
    this._syncTabBar()
  },

  onHide() {
  },

  onUnload() {
  },

  handleServiceTap(e) {
    const id = e.currentTarget.dataset.id
    const routes = {
      boarding: '/subpackages/booking/host-list-all',
      feeding: '/subpackages/feeding/service-home',
    }
    const url = routes[id]
    if (!url) return
    wx.navigateTo({ url })
  },
})
