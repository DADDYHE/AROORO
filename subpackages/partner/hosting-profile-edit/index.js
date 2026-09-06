const __i18n = require('../../../utils/i18n.js')
const __i18nT = (k) => __i18n.t(k, __i18n.getLocale())
const { HostService } = require('../../../services/CloudFunctionService')

// ⚠ Skyline 约束：wxml 绑定表达式禁止 .indexOf() 等方法调用（会编译成 WXS 调用，
//   跨作用域取 form.petTypes 求值为 null → "Array.prototype.indexOf called on null or undefined"）。
//   多选选中态一律 JS 预计算 on 字段，wxml 只做 item.on 属性访问。
const PET_TYPE_OPTIONS = [
  { key: 'dog', label: '狗狗', on: false },
  { key: 'cat', label: '猫咪', on: false },
  { key: 'other', label: '其他', on: false },
]
const SERVICE_TYPE_OPTIONS = [
  { key: 'board', label: '家庭寄养', on: false },
  { key: 'walk', label: '遛狗', on: false },
  { key: 'feed', label: '上门喂养', on: false },
]
// 寄养方式：单选（笼养/散养/按需选择）
const BOARDING_MODE_OPTIONS = [
  { key: 'cage', label: '笼养' },
  { key: 'freeRange', label: '散养' },
  { key: 'flexible', label: '按需选择' },
]
// 计费方式（勿与寄养方式 boardingMode 混淆）：hotel 酒店式按夜+超时加收 / hourly24 24小时制
const BILLING_MODE_OPTIONS = [
  { key: 'hotel', label: '酒店式' },
  { key: 'hourly24', label: '24小时制' },
]
const HOUSING_OPTIONS = ['一居室', '两居室', '三居室', '三居室以上', '别墅', '自建房']
const YES_NO_OPTIONS = [
  { key: 'yes', label: '有' },
  { key: 'no', label: '没有' },
]
const STEP_TITLES = ['基本信息', '服务与定价', '资质与相册']
const STEP_NO = ['01', '02', '03']
const MAX_PHOTOS = 9

Page({
  data: {
    step: 1,
    stepNo: STEP_NO[0],
    stepTitle: STEP_TITLES[0],
    stepTitles: STEP_TITLES,
    isEdit: false,
    isRejected: false,
    submitting: false,
    // zy-navbar transparent 模式不占位，由 hero 内 spacer 撑高；scroll-view 内滚动失效，改走 scroll-top
    _navbarHeight: 64,
    _scrollTop: 0,
    petTypeOptions: PET_TYPE_OPTIONS,
    serviceTypeOptions: SERVICE_TYPE_OPTIONS,
    boardingModeOptions: BOARDING_MODE_OPTIONS,
    billingModeOptions: BILLING_MODE_OPTIONS,
    housingOptions: HOUSING_OPTIONS,
    housingIndex: -1,
    yesNoOptions: YES_NO_OPTIONS,
    maxPhotos: MAX_PHOTOS,
    form: {
      avatarUrl: null,
      hostName: '', realName: '', phone: '', wechatId: '',
      province: '', city: '', district: '', addressDetail: '',
      housingType: '', hasYard: '', hasOtherPets: '', nativePetInfo: '',
      petTypes: [], serviceTypes: [], boardingMode: '',
      maxPets: '', pricePerDay: '', description: '',
      // 计费方式（勿与寄养方式 boardingMode 混淆）；时刻留空 → 服务端归一默认 14:00/12:00
      billingMode: 'hotel', checkInAfter: '', checkOutBefore: '',
      emergencyContactName: '', emergencyContactPhone: '',
      photos: [], videos: [],
      idCardFront: null, idCardBack: null, healthCertificate: null,
    },
    regionValue: [],
  },

  onLoad(options) {
    this._initNavbarHeight()
    if (options && options.edit === '1') {
      this.setData({ isEdit: true })
      this._loadProfile()
    }
  },

  /** 计算 zy-navbar 占位高度（transparent 模式下供 hero 顶部 spacer 使用） */
  _initNavbarHeight() {
    try {
      const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
      const menuButton = wx.getMenuButtonBoundingClientRect()
      const statusBarHeight = windowInfo.statusBarHeight || 20
      const navBarHeight = (menuButton.top - statusBarHeight) * 2 + menuButton.height
      this.setData({ _navbarHeight: statusBarHeight + navBarHeight })
    } catch (e) {
      // 降级保留默认 64
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
        const petTypes = p.petTypes ? String(p.petTypes).split(',').filter(Boolean) : []
        const serviceTypes = Array.isArray(p.serviceTypes) ? p.serviceTypes : []
        this.setData({
          isRejected: p.status === 'rejected',
          housingIndex: HOUSING_OPTIONS.indexOf(p.housingType || ''),
          regionValue: [p.province || '', p.city || '', p.district || ''],
          form: {
            // 存量 avatarUrl（串）原样透传显示与提交；新上传为 {temp, fileID}
            avatarUrl: p.avatarUrl ? { temp: p.avatarUrl, fileID: p.avatarUrl } : null,
            hostName: p.hostName || p.name || '',
            realName: p.realName || '',
            phone: p.phone || '',
            wechatId: p.wechatId || '',
            // 存量档案只有完整 address：区划留空让用户重选，详细地址用旧值兜底
            province: p.province || '',
            city: p.city || '',
            district: p.district || '',
            addressDetail: p.addressDetail || p.address || '',
            housingType: p.housingType || '',
            hasYard: p.hasYard || '',
            hasOtherPets: p.hasOtherPets || '',
            nativePetInfo: p.nativePetInfo || '',
            petTypes,
            serviceTypes,
            boardingMode: p.boardingMode || '',
            maxPets: p.maxPets ? String(p.maxPets) : '',
            pricePerDay: p.pricePerDay ? String(p.pricePerDay) : '',
            // 计费方式：老档案缺失时默认酒店式（与服务端兜底一致）
            billingMode: p.billingMode || 'hotel',
            checkInAfter: p.checkInAfter || '',
            checkOutBefore: p.checkOutBefore || '',
            description: p.description || '',
            emergencyContactName: p.emergencyContactName || '',
            emergencyContactPhone: p.emergencyContactPhone || '',
            photos, videos,
            idCardFront, idCardBack, healthCertificate,
          },
        })
        this._syncTypeOptions(petTypes, serviceTypes)
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

  /** 省市区三级选择（picker mode=region）：e.detail.value = [省, 市, 区] */
  onRegionChange(e) {
    const [province, city, district] = e.detail.value
    this.setData({
      regionValue: e.detail.value,
      'form.province': province || '',
      'form.city': city || '',
      'form.district': district || '',
    })
  },

  onYesNoChange(e) {
    const { field, key } = e.currentTarget.dataset
    this.setData({ [`form.${field}`]: key })
  },

  /** 时刻选择（picker mode=time）：入住/退房时刻，data-field 指定 form 字段 */
  onTimeChange(e) {
    const { field } = e.currentTarget.dataset
    const value = (e.detail && e.detail.value) || ''
    this.setData({ [`form.${field}`]: value })
  },

  /** Skyline：选中态预计算进 options.on，wxml 只做属性访问，不调 indexOf */
  _syncTypeOptions(petTypes, serviceTypes) {
    this.setData({
      petTypeOptions: PET_TYPE_OPTIONS.map(o => ({ ...o, on: petTypes.indexOf(o.key) > -1 })),
      serviceTypeOptions: SERVICE_TYPE_OPTIONS.map(o => ({ ...o, on: serviceTypes.indexOf(o.key) > -1 })),
    })
  },

  onTogglePetType(e) {
    const key = e.currentTarget.dataset.key
    const list = [...this.data.form.petTypes]
    const i = list.indexOf(key)
    if (i >= 0) { list.splice(i, 1) } else { list.push(key) }
    this.setData({ 'form.petTypes': list })
    this._syncTypeOptions(list, this.data.form.serviceTypes)
  },

  onToggleServiceType(e) {
    const key = e.currentTarget.dataset.key
    const list = [...this.data.form.serviceTypes]
    const i = list.indexOf(key)
    if (i >= 0) { list.splice(i, 1) } else { list.push(key) }
    this.setData({ 'form.serviceTypes': list })
    this._syncTypeOptions(this.data.form.petTypes, list)
  },

  // ---------- 步骤流转 ----------

  nextStep() {
    const step = this.data.step
    const err = this._validateStep(step)
    if (err) {
      wx.showToast({ title: err, icon: 'none' })
      return
    }
    this._setStep(step + 1)
  },

  prevStep() {
    if (this.data.step > 1) {
      this._setStep(this.data.step - 1)
    }
  },

  /**
   * 切步并回到顶部。
   * scroll-top 是控制属性、不同步用户滚动，故值需真正变化才会触发滚动：
   * 先置 1 制造差值，切完 step 再在 nextTick 置 0。
   */
  _setStep(n) {
    this.setData({ _scrollTop: 1 })
    this.setData({ step: n, stepNo: STEP_NO[n - 1], stepTitle: STEP_TITLES[n - 1] })
    wx.nextTick(() => this.setData({ _scrollTop: 0 }))
  },

  _validateStep(step) {
    const f = this.data.form
    if (step === 1) {
      if (!f.hostName.trim()) { return '请填写寄养家庭名称' }
      if (!f.phone.trim()) { return '请填写联系电话' }
      if (!/^1\d{10}$/.test(f.phone.trim())) { return '手机号格式不正确' }
      if (!f.province || !f.city) { return '请选择所在省市' }
      if (!f.district) { return '请选择所在区县' }
      if (!f.addressDetail.trim()) { return '请填写街道/小区等详细地址' }
    } else if (step === 2) {
      if (!f.petTypes.length) { return '请选择可接宠物类型' }
      if (!f.serviceTypes.length) { return '请选择提供服务' }
      if (!f.boardingMode) { return '请选择寄养方式' }
      if (!Number(f.maxPets) || Number(f.maxPets) < 1) { return '请填写最大接宠数' }
      if (!Number(f.pricePerDay) || Number(f.pricePerDay) <= 0) { return '请填写正确的日单价' }
    }
    return ''
  },

  // ---------- 相册 / 资质上传 ----------

  /** 家庭头像：单张，复用通用单文件上传（field=avatarUrl） */
  onChooseAvatar() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: res => this._uploadFile(res.tempFiles[0].tempFilePath, 'avatarUrl'),
    })
  },

  onRemoveAvatar() {
    this.setData({ 'form.avatarUrl': null })
  },

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
        this._setStep(s)
        wx.showToast({ title: err, icon: 'none' })
        return
      }
    }
    const f = this.data.form
    if (!f.photos.length) {
      this._setStep(3)
      wx.showToast({ title: '请至少上传 1 张环境照片', icon: 'none' })
      return
    }
    if (this.data.submitting) { return }
    this.setData({ submitting: true })

    const payload = {
      updateType: 'basicInfo',
      avatarUrl: f.avatarUrl ? f.avatarUrl.fileID : '',
      hostName: f.hostName.trim(),
      realName: f.realName.trim(),
      phone: f.phone.trim(),
      wechatId: f.wechatId.trim(),
      // 结构化三级区划 + 详细地址（隐私，仅平台/接单可见）
      province: f.province,
      city: f.city,
      district: f.district,
      addressDetail: f.addressDetail.trim(),
      // addressPublic 仅到区县 → 用户端展示源；address 为完整串（向后兼容 + 搜索命中）
      addressPublic: `${f.province}${f.city}${f.district}`,
      address: `${f.province}${f.city}${f.district}${f.addressDetail.trim()}`,
      housingType: f.housingType,
      hasYard: f.hasYard,
      hasOtherPets: f.hasOtherPets,
      nativePetInfo: f.nativePetInfo,
      petTypes: f.petTypes.join(','),
      serviceTypes: f.serviceTypes,
      boardingMode: f.boardingMode,
      maxPets: Number(f.maxPets) || 0,
      pricePerDay: Number(f.pricePerDay) || 0,
      // 计费方式（勿与寄养方式 boardingMode 混淆）；时刻空串 → 服务端归一默认 14:00/12:00
      billingMode: f.billingMode || 'hotel',
      checkInAfter: f.checkInAfter || '',
      checkOutBefore: f.checkOutBefore || '',
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
