const __i18n = require('../../../utils/i18n.js')
const __pageI18n = require('../../../utils/page-i18n.js')
const __i18nT = (k) => __i18n.t(k, __i18n.getLocale())
const { AdminService } = require('../../../services/CloudFunctionService')

const pageI18n = require('../../../utils/page-i18n.js')
const { ListBehavior } = require('../../../behaviors/listBehavior')

Page({
  ...pageI18n.mixin(),
  behaviors: [ListBehavior],
  data: {
  ...__pageI18n.buildTMap(__i18n.getLocale()),
    isEdit: false,
    activityId: '',
    pageTitle: '创建活动',
    pageSubtitle: __i18nT('BIZ_14GI85L'),
    isSubmitting: false,
    formData: {
      title: '',
      category: 'outdoor',
      description: '',
      pricePerPerson: '',
      pricePerPet: '',
      maxParticipants: '',
      location: '',
      locationName: '',
      latitude: null,
      longitude: null,
      startDate: '',
      startTime: '',
      endDate: '',
      endTime: '',
      contactName: '',
      contactPhone: '',
      wechatId: '',
      coverUrl: '',
      images: [],
    },
    categories: [
      { key: 'outdoor', label: '户外活动' },
      { key: 'indoor', label: '室内活动' },
      { key: 'social', label: '社交聚会' },
      { key: 'training', label: '培训课程' },
      { key: 'competition', label: '比赛赛事' },
      { key: 'adoption', label: '领养活动' },
      { key: 'other', label: '其他活动' },
    ],
    showCategoryPicker: false,
    categoryText: '户外活动',
    today: '',
  },

  onLoad(options) {
    this._initNavbarHeight()
    const now = new Date()
    const today = this._formatDate(now)
    this.setData({ today })

    if (options.id) {
      this.setData({
        isEdit: true,
        activityId: options.id,
        pageTitle: '编辑活动',
        pageSubtitle: __i18nT('BIZ_BQGK3Q'),
      })
      wx.setNavigationBarTitle({ title: __i18nT('BIZ_GMLT8O') })
      this._loadActivity(options.id)
    }
  },

  async _loadActivity(activityId) {
    wx.showLoading({ title: __i18nT('BIZ_CSIK0') })
    try {
      const res = await AdminService.getActivityDetail(activityId)
      if (res.code === 0 && res.data) {
        const a = res.data
        const startDate = a.startTime ? a.startTime.split(' ')[0] : ''
        const startTime = a.startTime ? a.startTime.split(' ')[1] : ''
        const endDate = a.endTime ? a.endTime.split(' ')[0] : ''
        const endTime = a.endTime ? a.endTime.split(' ')[1] : ''
        const catItem = this.data.categories.find(c => c.key === a.category)

        this.setData({
          'formData.title': a.title || '',
          'formData.category': a.category || 'outdoor',
          'formData.description': a.description || '',
          'formData.pricePerPerson': a.pricePerPerson || '',
          'formData.pricePerPet': a.pricePerPet || '',
          'formData.maxParticipants': a.maxParticipants || '',
          'formData.location': a.location || '',
          'formData.locationName': a.location || '',
          'formData.latitude': a.latitude || null,
          'formData.longitude': a.longitude || null,
          'formData.startDate': startDate,
          'formData.startTime': startTime,
          'formData.endDate': endDate,
          'formData.endTime': endTime,
          'formData.contactName': a.contactName || '',
          'formData.contactPhone': a.contactPhone || '',
          'formData.wechatId': a.wechatId || '',
          'formData.coverUrl': a.coverUrl || '',
          'formData.images': a.images || [],
          categoryText: catItem ? catItem.label : '户外活动',
        })
      } else {
        this.error('LOAD_FAILED')
      }
    } catch (e) {
      console.error('[activity-create] load error:', e)
      this.error('LOAD_FAILED')
    }
    wx.hideLoading()
  },

  onInputTitle(e) {
    this.setData({ 'formData.title': e.detail.value })
  },

  onInputDescription(e) {
    this.setData({ 'formData.description': e.detail.value })
  },

  onInputPricePerPerson(e) {
    this.setData({ 'formData.pricePerPerson': e.detail.value })
  },

  onInputPricePerPet(e) {
    this.setData({ 'formData.pricePerPet': e.detail.value })
  },

  onInputMaxParticipants(e) {
    this.setData({ 'formData.maxParticipants': e.detail.value })
  },

  onInputContactName(e) {
    this.setData({ 'formData.contactName': e.detail.value })
  },

  onInputContactPhone(e) {
    this.setData({ 'formData.contactPhone': e.detail.value })
  },

  onInputWechatId(e) {
    this.setData({ 'formData.wechatId': e.detail.value })
  },

  onShowCategoryPicker() {
    this.setData({ showCategoryPicker: true })
  },

  onCloseCategoryPicker() {
    this.setData({ showCategoryPicker: false })
  },

  noop() {},

  onCategorySelect(e) {
    const key = e.currentTarget.dataset.key
    const item = this.data.categories.find(c => c.key === key)
    this.setData({
      'formData.category': key,
      categoryText: item ? item.label : '',
      showCategoryPicker: false,
    })
  },

  onStartDateChange(e) {
    this.setData({ 'formData.startDate': e.detail.value })
  },

  onStartTimeChange(e) {
    this.setData({ 'formData.startTime': e.detail.value })
  },

  onEndDateChange(e) {
    this.setData({ 'formData.endDate': e.detail.value })
  },

  onEndTimeChange(e) {
    this.setData({ 'formData.endTime': e.detail.value })
  },

  onChooseLocation() {
    wx.chooseLocation({
      success: res => {
        this.setData({
          'formData.location': res.name || res.address,
          'formData.locationName': res.name || res.address,
          'formData.latitude': res.latitude,
          'formData.longitude': res.longitude,
        })
      },
      fail: () => {
        wx.getSetting({
          success: settingRes => {
            if (!settingRes.authSetting['scope.userLocation']) {
              this.showModal({ titleKey: 'BIZ_AJ90BY', contentKey: 'BIZ_GLVXQO', confirmText: '去设置' })
            }
          },
        })
      },
    })
  },

  onClearLocation() {
    this.setData({ 'formData.location': '', 'formData.locationName': '', 'formData.latitude': null, 'formData.longitude': null })
  },

  onChooseCover() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: res => {
        const tempPath = res.tempFiles[0].tempFilePath
        this._uploadImage(tempPath, 'coverUrl')
      },
    })
  },

  onChooseImages() {
    const remaining = 15 - this.data.formData.images.length
    if (remaining <= 0) {
      this.error('MAX_15_IMAGES')
      return
    }
    wx.chooseMedia({
      count: Math.min(remaining, 9),
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: res => {
        const paths = res.tempFiles.map(f => f.tempFilePath)
        this._uploadImages(paths)
      },
    })
  },

  onRemoveImage(e) {
    const index = e.currentTarget.dataset.index
    const images = [...this.data.formData.images]
    images.splice(index, 1)
    this.setData({ 'formData.images': images })
  },

  async _uploadImage(tempPath, targetField) {
    wx.showLoading({ title: __i18nT('BIZ_BTDW7') })
    try {
      const cloudPath = `activities/${Date.now()}_${Math.random().toString(36).substr(2, 8)}.jpg`
      const uploadRes = await wx.cloud.uploadFile({
        cloudPath,
        filePath: tempPath,
      })
      this.setData({ [`formData.${targetField}`]: uploadRes.fileID })
    } catch (e) {
      this.error('UPLOAD_FAILED')
    }
    wx.hideLoading()
  },

  async _uploadImages(tempPaths) {
    wx.showLoading({ title: __i18nT('BIZ_BTDW7') })
    const results = []
    for (const path of tempPaths) {
      try {
        const cloudPath = `activities/${Date.now()}_${Math.random().toString(36).substr(2, 8)}.jpg`
        const uploadRes = await wx.cloud.uploadFile({
          cloudPath,
          filePath: path,
        })
        results.push(uploadRes.fileID)
      } catch (e) {
        console.error('[activity-create] upload image error:', e)
      }
    }
    if (tempPaths.length > 0 && results.length === 0) {
      wx.hideLoading()
      this.error('UPLOAD_FAILED')
      return
    }
    this.setData({ 'formData.images': [...this.data.formData.images, ...results] })
    wx.hideLoading()
  },

  _formatDate(date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  },

  async onSubmit() {
    this._doSubmit('draft')
  },

  onSubmitAndPublish() {
    this._doSubmit('published')
  },

  async _doSubmit(status) {
    const { formData, isEdit, activityId } = this.data
    if (this.data.isSubmitting) return
    if (!formData.title.trim()) {
      this.error('ACTIVITY_TITLE_REQUIRED')
      return
    }
    if (!formData.startDate) {
      this.error('DATE_START_REQUIRED')
      return
    }
    if (!formData.startTime) {
      this.error('DATE_START_TIME_REQUIRED')
      return
    }
    if (!formData.location.trim()) {
      this.error('ACTIVITY_LOCATION_REQUIRED')
      return
    }
    if (!formData.contactPhone.trim()) {
      this.error('ACTIVITY_PHONE_REQUIRED')
      return
    }
    if (!/^1\d{10}$/.test(formData.contactPhone.trim())) {
      this.error('PHONE_INVALID')
      return
    }
    const startDT = `${formData.startDate} ${formData.startTime}`
    const endDT = formData.endDate && formData.endTime ? `${formData.endDate} ${formData.endTime}` : ''
    if (endDT && endDT <= startDT) {
      this.error('DATE_END_INVALID')
      return
    }

    this.setData({ isSubmitting: true })

    try {
      const startDateTime = `${formData.startDate} ${formData.startTime}`
      const endDateTime = formData.endDate && formData.endTime
        ? `${formData.endDate} ${formData.endTime}`
        : ''

      const submitData = {
        title: formData.title.trim(),
        category: formData.category,
        description: formData.description.trim(),
        pricePerPerson: Number(formData.pricePerPerson) || 0,
        pricePerPet: Number(formData.pricePerPet) || 0,
        maxParticipants: Number(formData.maxParticipants) || 0,
        location: formData.location.trim(),
        latitude: formData.latitude || null,
        longitude: formData.longitude || null,
        startTime: startDateTime,
        endTime: endDateTime,
        coverUrl: formData.coverUrl || '',
        images: formData.images || [],
        contactName: formData.contactName.trim(),
        contactPhone: formData.contactPhone.trim(),
        wechatId: formData.wechatId.trim(),
        status,
      }

      let res
      if (isEdit) {
        submitData.activityId = activityId
        res = await AdminService.updateActivity(submitData)
      } else {
        res = await AdminService.createActivity(submitData)
      }

      if (res.code === 0) {
        this.toast(isEdit ? 'SAVED' : (status === 'published' ? 'PUBLISHED' : 'SAVED'))
        setTimeout(() => {
          wx.navigateBack()
        }, 1500)
      } else {
        this.errorDynamic(res.message, 'OPERATION_FAILED')
      }
    } catch (e) {
      this.error('OPERATION_RETRY')
    }

    this.setData({ isSubmitting: false })
  },
})
