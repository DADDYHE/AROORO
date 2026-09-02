const __i18n = require('../../../utils/i18n.js')
const __pageI18n = require('../../../utils/page-i18n.js')
const __i18nT = (k) => __i18n.t(k, __i18n.getLocale())
const { authService } = require('../../../services/AuthService')

const pageI18n = require('../../../utils/page-i18n.js')
const { ListBehavior } = require('../../../behaviors/listBehavior')

Page({
  ...pageI18n.mixin(),
  behaviors: [ListBehavior],
  data: {
    t: __pageI18n.buildTMap(__i18n.getLocale()),
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

    wx.showLoading({ title: __i18nT('BIZ_145653V'), mask: true })

    const loginData = { nickName }
    if (uploadedAvatarId) {
      loginData.avatarUrl = uploadedAvatarId
    }

    authService.login(loginData).then(result => {
      wx.hideLoading()
      if (result.success) {
        this.toast('LOGIN_SUCCESS')
        this._backToSource()
      } else {
        this.errorDynamic(result.message, 'LOGIN_FAILED')
      }
    }).catch(() => {
      wx.hideLoading()
      this.error('LOGIN_RETRY')
    })
  },

  // 登录成功后回跳来源页（品牌统一体验）：优先 navigateBack（原页面状态零丢失），
  // 登录页非 navigateTo 而来时 redirectTo 携带完整 options 兜底；并通知页面刷新用户态。
  _backToSource() {
    const app = getApp()
    const ret = app && app.globalData && app.globalData.loginReturnTo
    // 先通知所有页面会话已恢复（刷新用户态/数据），再回跳
    if (app && typeof app._notifySessionRestored === 'function') {
      app._notifySessionRestored()
    }
    // 清理来源记录（避免后续误跳）；ret 已捕获到闭包，兜底路径不受影响
    if (app && app.globalData) {
      app.globalData.loginReturnTo = null
    }
    wx.navigateBack({
      fail: () => {
        if (ret && ret.route) {
          const qs = this._buildQuery(ret.options)
          wx.redirectTo({
            url: ret.route + (qs ? '?' + qs : ''),
            fail: () => wx.reLaunch({ url: '/pages/home/index' }),
          })
        } else {
          wx.reLaunch({ url: '/pages/home/index' })
        }
      },
    })
  },

  _buildQuery(options) {
    if (!options) {return ''}
    const parts = []
    Object.keys(options).forEach(k => {
      const v = options[k]
      if (v !== undefined && v !== null && v !== '') {
        parts.push(k + '=' + encodeURIComponent(v))
      }
    })
    return parts.join('&')
  },

  onCancel() {
    wx.navigateBack()
  },
})
