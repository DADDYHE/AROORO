const { ListBehavior } = require('../../behaviors/listBehavior')

Page({
  behaviors: [ListBehavior],
  data: {
    latitude: 0,
    longitude: 0,
    name: '',
    address: '',
    markers: [],
  },

  onLoad(options) {
    this._initNavbarHeight()
    const latitude = parseFloat(options.latitude)
    const longitude = parseFloat(options.longitude)
    const name = decodeURIComponent(options.name || '')
    const address = decodeURIComponent(options.address || '')

    this.setData({
      latitude,
      longitude,
      name,
      address,
      markers: [{
        id: 1,
        latitude,
        longitude,
        title: name,
        width: 30,
        height: 30,
      }],
    })
  },

  openNavigation() {
    wx.openLocation({
      latitude: this.data.latitude,
      longitude: this.data.longitude,
      name: this.data.name,
      address: this.data.address,
      scale: 16,
    })
  },
})
