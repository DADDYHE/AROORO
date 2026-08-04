const { authService } = require('../../../services/AuthService')

const pageI18n = require('../../../utils/page-i18n.js')
const { ListBehavior } = require('../../../behaviors/listBehavior')

Page({
  ...pageI18n.mixin(),
  behaviors: [ListBehavior],
  data: {
    avatarUrl: '',
    nickName: '',
    canSubmit: false,
    isUploadingAvatar: false,
    uploadedAvatarId: '',
  },

  onLoad() {
    this._initNavbarHeight()
  },

  onChooseAvatar(e) {
    const { avatarUrl } = e.detail
    if (!avatarUrl) {return}
    this.setData({
      avatarUrl,
      uploadedAvatarId: '',
    })
    this._uploadAvatar(avatarUrl)
  },

  async _uploadAvatar(tempFilePath) {
    this.setData({ isUploadingAvatar: true })
    try {
      const cloudPath = `avatars/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`
      const uploadRes = await wx.cloud.uploadFile({ cloudPath, filePath: tempFilePath })
      this.setData({
        uploadedAvatarId: uploadRes.fileID,
      })
    } catch (err) {
      console.error('[Login] 头像上传失败:', err)
      this.error('AVATAR_UPLOAD_FAILED')
    } finally {
      this.setData({ isUploadingAvatar: false })
    }
  },

  onNicknameInput(e) {
    const value = e.detail.value || ''
    this.setData({ nickName: value })
    this._updateCanSubmit()
  },

  onNicknameBlur(e) {
    const value = e.detail.value || ''
    if (value && !this.data.nickName) {
      this.setData({ nickName: value })
      this._updateCanSubmit()
    }
  },

  _updateCanSubmit() {
    const canSubmit = Boolean(this.data.avatarUrl && this.data.nickName && this.data.nickName.trim())
    this.setData({ canSubmit })
  },

  onConfirm() {
    const { uploadedAvatarId, nickName, isUploadingAvatar } = this.data
    if (!nickName || !nickName.trim()) {return}
    if (isUploadingAvatar) {
      this.error('UPLOADING_AVATAR')
      return
    }

    wx.showLoading({ title: '登录中...', mask: true })

    const loginData = { nickName }
    if (uploadedAvatarId) {
      loginData.avatarUrl = uploadedAvatarId
    }

    authService.login(loginData).then(result => {
      wx.hideLoading()
      if (result.success) {
        this.toast('LOGIN_SUCCESS')
        wx.navigateBack()
      } else {
        this.errorDynamic(result.message, 'LOGIN_FAILED')
      }
    }).catch(() => {
      wx.hideLoading()
      this.error('LOGIN_RETRY')
    })
  },

  onCancel() {
    wx.navigateBack()
  },
})
