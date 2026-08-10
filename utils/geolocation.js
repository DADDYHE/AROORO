/**
 * 定位工具：获取用户当前 gcj02 坐标，并处理授权失败引导。
 * 用于活动签到时确认用户位于活动现场。
 */
function getLocation() {
  return new Promise((resolve, reject) => {
    wx.getLocation({
      type: 'gcj02',
      success: (res) => resolve({ latitude: res.latitude, longitude: res.longitude }),
      fail: (err) => {
        const msg = (err && err.errMsg) || ''
        // 用户拒绝了定位授权 → 引导到设置页开启
        if (msg.indexOf('auth deny') >= 0 || msg.indexOf('authorize') >= 0) {
          wx.showModal({
            title: '需要定位权限',
            content: '签到需获取您的位置以确认在现场，请在设置中开启「位置」权限后重试。',
            confirmText: '去设置',
            cancelText: '取消',
            success: (m) => {
              if (m.confirm) {
                wx.openSetting({
                  success: (s) => {
                    if (s.authSetting && s.authSetting['scope.userLocation']) {
                      wx.getLocation({
                        type: 'gcj02',
                        success: (r) => resolve({ latitude: r.latitude, longitude: r.longitude }),
                        fail: (e) => reject(e),
                      })
                    } else {
                      reject(err)
                    }
                  },
                  fail: () => reject(err),
                })
              } else {
                reject(err)
              }
            },
          })
        } else {
          reject(err)
        }
      },
    })
  })
}

module.exports = { getLocation }
