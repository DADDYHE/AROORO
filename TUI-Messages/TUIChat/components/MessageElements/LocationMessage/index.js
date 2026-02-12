// eslint-disable-next-line no-undef
Component({
  /**
   * 组件的属性列表
   */
  properties: {
    message: {
      type: Object,
      value: {},
      observer(newVal) {
        this.parseLocation(newVal);
      },
    },
    isMine: {
      type: Boolean,
      value: true,
    },
  },

  /**
   * 组件的初始数据
   */
  data: {
    locationName: '',
    locationAddress: '',
    latitude: 0,
    longitude: 0,
  },

  /**
   * 组件的方法列表
   */
  methods: {
    parseLocation(message) {
      if (!message || !message.payload) {
        return;
      }

      console.log('LocationMessage - 完整消息:', message);
      console.log('LocationMessage - Payload:', message.payload);

      const { payload } = message;

      // 腾讯IM位置消息payload结构:
      // - description: 位置描述/地址
      // - longitude: 经度
      // - latitude: 纬度

      this.setData({
        locationName: '位置信息', // 位置消息一般只有description，没有独立的title
        locationAddress: payload.description || '未知位置',
        latitude: parseFloat(payload.latitude) || 0,
        longitude: parseFloat(payload.longitude) || 0,
      });

      console.log('LocationMessage - 解析结果:', {
        locationName: this.data.locationName,
        locationAddress: this.data.locationAddress,
        latitude: this.data.latitude,
        longitude: this.data.longitude
      });
    },

    // 打开位置（使用微信内置地图）
    openLocation() {
      const { latitude, longitude, locationName, locationAddress } = this.data;

      if (!latitude || !longitude) {
        wx.showToast({
          title: '位置信息无效',
          icon: 'none',
        });
        return;
      }

      // 使用微信内置地图打开位置，支持查看详情和跳转外部地图
      wx.openLocation({
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        name: locationName,
        address: locationAddress,
        scale: 15,
        success: () => {
          console.log('位置地图已打开');
        },
        fail: (error) => {
          console.error('打开位置失败:', error);
          // 如果微信地图打开失败，尝试使用腾讯地图H5打开
          this.openLocationWithMapApp(latitude, longitude, locationAddress);
        },
      });
    },

    // 使用腾讯地图H5打开位置（支持线路规划）
    openLocationWithMapApp(latitude, longitude, address) {
      const lat = parseFloat(latitude);
      const lng = parseFloat(longitude);

      // 腾讯地图线路规划URL
      // type=walk 步行, type=drive 驾车, type=bus 公交, type=bike 骑行
      const mapUrl = `https://apis.map.qq.com/uri/v1/marker?marker=coord:${lat},${lng};title:${encodeURIComponent(address || '位置')};addr:${encodeURIComponent(address || '')}&referer=Zuoyou`;

      wx.showActionSheet({
        itemList: ['在腾讯地图中查看', '复制位置信息'],
        success: (res) => {
          if (res.tapIndex === 0) {
            // 在腾讯地图中查看
            wx.setClipboardData({
              data: mapUrl,
              success: () => {
                wx.showToast({
                  title: '链接已复制，请在浏览器打开',
                  icon: 'none',
                  duration: 2000
                });
              }
            });
          } else if (res.tapIndex === 1) {
            // 复制位置信息
            const locationText = `${address}\n经度: ${lng}\n纬度: ${lat}`;
            wx.setClipboardData({
              data: locationText,
              success: () => {
                wx.showToast({
                  title: '位置信息已复制',
                  icon: 'success'
                });
              }
            });
          }
        }
      });
    },
  },
});
