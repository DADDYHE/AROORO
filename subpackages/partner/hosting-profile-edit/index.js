const __i18n = require('../../../utils/i18n.js')
const __i18nT = (k) => __i18n.t(k, __i18n.getLocale())
const { HostService } = require('../../../services/CloudFunctionService')

const PET_TYPE_OPTIONS = [
  { key: 'dog', label: '狗狗' },
  { key: 'cat', label: '猫咪' },
  { key: 'other', label: '其他' },
]
const SERVICE_TYPE_OPTIONS = [
  { key: 'board', label: '家庭寄养' },
  { key: 'walk', label: '遛狗' },
  { key: 'feed', label: '上门喂养' },
]
const HOUSING_OPTIONS = ['一居室', '两居室', '三居室', '三居室以上', '别墅', '自建房']
const YES_NO_OPTIONS = [
  { key: 'yes', label: '有' },
  { key: 'no', label: '没有' },
]
const STEP_TITLES = ['基本信息', '服务与定价', '资质与相册']
const MAX_PHOTOS = 9

Page({
  data: {
    step: 1,
    stepTitles: STEP_TITLES,
    isEdit: false,
    isRejected: false,
    submitting: false,
    petTypeOptions: PET_TYPE_OPTIONS,
    serviceTypeOptions: SERVICE_TYPE_OPTIONS,
    housingOptions: HOUSING_OPTIONS,
    housingIndex: -1,
    yesNoOptions: YES_NO_OPTIONS,
    maxPhotos: MAX_PHOTOS,
    form: {
      hostName: '', realName: '', phone: '', address: '',
      housingType: '', hasYard: '', hasOtherPets: '', nativePetInfo: '',
      petTypes: [], serviceTypes: [],
      maxPets: '', pricePerDay: '', description: '',
      emergencyContactName: '', emergencyContactPhone: '',
      photos: [], videos: [],
      idCardFront: null, idCardBack: null, healthCertificate: null,
    },
  },

  onLoad(options) {
    if (options && options.edit === '1') {
      this.setData({ isEdit: true })
      this._loadProfile()
    }
  },

  // ---------- 档案回填 ----------

  async _loadProfile() {
    wx.showLoading({ title: __i18nT('BIZ_CSIK0') })
    try {
      const res = await HostService.getMyProfile()
      if (res.code === 0 && res.data && (res.data._id || res.data.openid)) {
        const p = res.data
        const [photos, videos] = await Promise.all([
          this._resolveExisting(p.photos),
          this._resolveExisting(p.videos),
        ])
        const [idCardFront, idCardBack, healthCertificate] = await Promise.all([
          this._resolveSingle(p.idCardFront),
          this._resolveSingle(p.idCardBack),
          this._resolveSingle(p.healthCertificate),
        ])
        this.setData({
          isRejected: p.status === 'rejected',
          housingIndex: HOUSING_OPTIONS.indexOf(p.housingType || ''),
          form: {
            hostName: p.hostName || p.name || '',
            realName: p.realName || '',
            phone: p.phone || '',
            address: p.address || '',
            housingType: p.housingType || '',
            hasYard: p.hasYard || '',
            hasOtherPets: p.hasOtherPets || '',
            nativePetInfo: p.nativePetInfo || '',
            petTypes: p.petTypes ? String(p.petTypes).split(',').filter(Boolean) : [],
            serviceTypes: Array.isArray(p.serviceTypes) ? p.serviceTypes : [],
            maxPets: p.maxPets ? String(p.maxPets) : '',
            pricePerDay: p.pricePerDay ? String(p.pricePerDay) : '',
            description: p.description || '',
            emergencyContactName: p.emergencyContactName || '',
            emergencyContactPhone: p.emergencyContactPhone || '',
            photos, videos,
            idCardFront, idCardBack, healthCertificate,
          },
        })
      }
    } catch (e) {
      console.error('[hosting-profile-edit] load profile error:', e)
      wx.showToast({ title: '档案加载失败', icon: 'none' })
    }
    wx.hideLoading()
  },

  /** 存量 fileID → https 临时链接（Skyline 下 <image> 不直喂 cloud://） */
  async _resolveExisting(paths) {
    const list = (paths || []).filter(Boolean)
    if (!list.length) { return [] }
    try {
      const res = await wx.cloud.getTempFileURL({ fileList: list })
      return (res.fileList || [])
        .filter(f => f.tempFileURL)
        .map(f => ({ temp: f.tempFileURL, fileID: f.fileID }))
    } catch (e) {
      console.error('[hosting-profile-edit] getTempFileURL error:', e)
      return []
    }
  },

  async _resolveSingle(fileID) {
    const list = await this._resolveExisting([fileID])
    return list.length ? list[0] : null
  },

  // ---------- 表单输入 ----------

  onInput(e) {
    this.setData({ [`form.${e.currentTarget.dataset.field}`]: e.detail.value })
  },

  onHousingChange(e) {
    const index = Number(e.detail.value)
    this.setData({ housingIndex: index, 'form.housingType': HOUSING_OPTIONS[index] || '' })
  },

  onYesNoChange(e) {
    const { field, key } = e.currentTarget.dataset
    this.setData({ [`form.${field}`]: key })
  },

  onTogglePetType(e) {
    const key = e.currentTarget.dataset.key
    const list = [...this.data.form.petTypes]
    const i = list.indexOf(key)
    if (i >= 0) { list.splice(i, 1) } else { list.push(key) }
    this.setData({ 'form.petTypes': list })
  },

  onToggleServiceType(e) {
    const key = e.currentTarget.dataset.key
    const list = [...this.data.form.serviceTypes]
    const i = list.indexOf(key)
    if (i >= 0) { list.splice(i, 1) } else { list.push(key) }
    this.setData({ 'form.serviceTypes': list })
  },

  // ---------- 步骤流转 ----------

  nextStep() {
    const step = this.data.step
    const err = this._validateStep(step)
    if (err) {
      wx.showToast({ title: err, icon: 'none' })
      return
    }
    this.setData({ step: step + 1 })
    wx.pageScrollTo({ scrollTop: 0, duration: 200 })
  },

  prevStep() {
    if (this.data.step > 1) {
      this.setData({ step: this.data.step - 1 })
      wx.pageScrollTo({ scrollTop: 0, duration: 200 })
    }
  },

  _validateStep(step) {
    const f = this.data.form
    if (step === 1) {
      if (!f.hostName.trim()) { return '请填写寄养家庭名称' }
      if (!f.phone.trim()) { return '请填写联系电话' }
      if (!/^1\d{10}$/.test(f.phone.trim())) { return '手机号格式不正确' }
      if (!f.address.trim()) { return '请填写所在地址' }
    } else if (step === 2) {
      if (!f.petTypes.length) { return '请选择可接宠物类型' }
      if (!f.serviceTypes.length) { return '请选择提供服务' }
      if (!Number(f.maxPets) || Number(f.maxPets) < 1) { return '请填写最大接宠数' }
      if (!Number(f.pricePerDay) || Number(f.pricePerDay) <= 0) { return '请填写正确的日单价' }
    }
    return ''
  },

  // ---------- 相册 / 资质上传 ----------

  onChoosePhotos() {
    const remaining = MAX_PHOTOS - this.data.form.photos.length
    if (remaining <= 0) {
      wx.showToast({ title: `最多 ${MAX_PHOTOS} 张`, icon: 'none' })
      return
    }
    wx.chooseMedia({
      count: Math.min(remaining, 9),
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: res => this._uploadPhotos(res.tempFiles.map(f => f.tempFilePath)),
    })
  },

  onRemovePhoto(e) {
    const photos = [...this.data.form.photos]
    photos.splice(Number(e.currentTarget.dataset.index), 1)
    this.setData({ 'form.photos': photos })
  },

  onChooseVideo() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['video'],
      maxDuration: 30,
      success: res => {
        const file = res.tempFiles[0]
        this._uploadFile(file.tempFilePath, 'videos', file.thumbTempFilePath)
      },
    })
  },

  onRemoveVideo() {
    this.setData({ 'form.videos': [] })
  },

  onChooseCert(e) {
    const field = e.currentTarget.dataset.field
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: res => this._uploadFile(res.tempFiles[0].tempFilePath, field),
    })
  },

  onRemoveCert(e) {
    this.setData({ [`form.${e.currentTarget.dataset.field}`]: null })
  },

  async _uploadPhotos(tempPaths) {
    wx.showLoading({ title: __i18nT('BIZ_BTDW7') })
    const uploaded = []
    for (const path of tempPaths) {
      try {
        const cloudPath = `hostProfiles/photos/${Date.now()}_${Math.random().toString(36).slice(2, 10)}.jpg`
        const r = await wx.cloud.uploadFile({ cloudPath, filePath: path })
        uploaded.push({ temp: path, fileID: r.fileID })
      } catch (e) {
        console.error('[hosting-profile-edit] upload photo error:', e)
      }
    }
    wx.hideLoading()
    if (!uploaded.length) {
      wx.showToast({ title: '上传失败，请重试', icon: 'none' })
      return
    }
    this.setData({ 'form.photos': [...this.data.form.photos, ...uploaded] })
  },

  async _uploadFile(tempPath, field, thumbPath) {
    wx.showLoading({ title: __i18nT('BIZ_BTDW7') })
    try {
      const ext = field === 'videos' ? '.mp4' : '.jpg'
      const cloudPath = `hostProfiles/${field}/${Date.now()}_${Math.random().toString(36).slice(2, 10)}${ext}`
      const r = await wx.cloud.uploadFile({ cloudPath, filePath: tempPath })
      const item = { temp: thumbPath || tempPath, fileID: r.fileID }
      if (field === 'videos') {
        this.setData({ 'form.videos': [item] })
      } else {
        this.setData({ [`form.${field}`]: item })
      }
    } catch (e) {
      console.error('[hosting-profile-edit] upload file error:', e)
      wx.showToast({ title: '上传失败，请重试', icon: 'none' })
    }
    wx.hideLoading()
  },

  // ---------- 提交 ----------

  async onSubmit() {
    for (let s = 1; s <= 2; s++) {
      const err = this._validateStep(s)
      if (err) {
        this.setData({ step: s })
        wx.showToast({ title: err, icon: 'none' })
        return
      }
    }
    const f = this.data.form
    if (!f.photos.length) {
      this.setData({ step: 3 })
      wx.showToast({ title: '请至少上传 1 张环境照片', icon: 'none' })
      return
    }
    if (this.data.submitting) { return }
    this.setData({ submitting: true })

    const payload = {
      updateType: 'basicInfo',
      hostName: f.hostName.trim(),
      realName: f.realName.trim(),
      phone: f.phone.trim(),
      address: f.address.trim(),
      housingType: f.housingType,
      hasYard: f.hasYard,
      hasOtherPets: f.hasOtherPets,
      nativePetInfo: f.nativePetInfo,
      petTypes: f.petTypes.join(','),
      serviceTypes: f.serviceTypes,
      maxPets: Number(f.maxPets) || 0,
      pricePerDay: Number(f.pricePerDay) || 0,
      description: f.description,
      emergencyContactName: f.emergencyContactName.trim(),
      emergencyContactPhone: f.emergencyContactPhone.trim(),
      photos: f.photos.map(x => x.fileID),
      videos: f.videos.map(x => x.fileID),
      idCardFront: f.idCardFront ? f.idCardFront.fileID : '',
      idCardBack: f.idCardBack ? f.idCardBack.fileID : '',
      healthCertificate: f.healthCertificate ? f.healthCertificate.fileID : '',
    }

    try {
      const res = this.data.isEdit
        ? await HostService.updateHostProfile({ ...payload, resubmit: this.data.isRejected })
        : await HostService.createHostProfile(payload)
      if (res.code === 0) {
        wx.showToast({ title: '已提交，等待审核', icon: 'success' })
        setTimeout(() => wx.navigateBack({ fail: () => wx.reLaunch({ url: '/subpackages/partner/hosting-profile/index' }) }), 1500)
      } else {
        wx.showToast({ title: res.msg || '提交失败，请重试', icon: 'none' })
      }
    } catch (e) {
      console.error('[hosting-profile-edit] submit error:', e)
      wx.showToast({ title: '提交失败，请重试', icon: 'none' })
    }
    this.setData({ submitting: false })
  },
})
