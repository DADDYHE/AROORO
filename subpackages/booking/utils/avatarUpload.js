const __i18n = require('../../../utils/i18n.js')
const __i18nT = (k) => __i18n.t(k, __i18n.getLocale())
function chooseAndUploadAvatar({ cloudPrefix = 'pet-avatarUrls', onSuccess, onError }) {
  wx.showActionSheet({
    itemList: ['从相册选择', '拍照'],
    success: res => {
      if (res.tapIndex === 0) {
        wx.chooseMedia({
          count: 1,
          mediaType: ['image'],
          sourceType: ['album'],
          success: mediaRes => doUpload(mediaRes.tempFiles[0].tempFilePath),
          fail: error => {
            console.error('[APP] 选择图片失败:', error)
            if (onError) onError('CHOOSE_IMAGE_FAILED')
          },
        })
      } else if (res.tapIndex === 1) {
        wx.chooseMedia({
          count: 1,
          mediaType: ['image'],
          sourceType: ['camera'],
          success: mediaRes => doUpload(mediaRes.tempFiles[0].tempFilePath),
          fail: error => {
            console.error('[APP] 拍照失败:', error)
            if (onError) onError('PHOTO_FAILED')
          },
        })
      }
    },
    fail: error => {
      console.error('[APP] 选择操作失败:', error)
    },
  })

  async function doUpload(tempFilePath) {
    try {
      wx.showLoading({ title: __i18nT('BIZ_1B2ADFB'), mask: true })
      const fileName = `${cloudPrefix}/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.jpg`
      const uploadResult = await wx.cloud.uploadFile({
        cloudPath: fileName,
        filePath: tempFilePath,
      })
      wx.hideLoading()
      if (onSuccess) onSuccess(uploadResult.fileID)
    } catch (error) {
      console.error('[APP] 头像上传失败:', error)
      wx.hideLoading()
      if (onError) onError('AVATAR_UPLOAD_FAILED')
    }
  }
}

module.exports = { chooseAndUploadAvatar }
