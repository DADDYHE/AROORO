const { AdminService } = require('../../../services/CloudFunctionService')

const STATUS_MAP = {
  draft: { text: '待发布', color: '#8E8E93' },
  published: { text: '报名中', color: '#4ECDC4' },
  registration_stopped: { text: '报名截止', color: '#FF9500' },
  ended: { text: '已结束', color: '#8E8E93' },
  cancelled: { text: '已取消', color: '#FF3B30' },
}

const CATEGORY_MAP = {
  outdoor: '户外活动',
  indoor: '室内活动',
  social: '社交聚会',
  training: '培训课程',
  competition: '比赛赛事',
  adoption: '领养活动',
  other: '其他活动',
}

const pageI18n = require('../../../utils/page-i18n.js')

Page({
  ...pageI18n.mixin(),
  data: {
    activity: null,
    isLoading: true,
    statusText: '',
    statusColor: '',
    categoryText: '',
    priceDisplayText: '',
    participantPct: 0,
    participantText: '',
    dateDisplay: '',
    timeDisplay: '',
    registrations: [],
    showRegList: false,
    statusActionText: '发布',
  },

  onLoad(options) {
    if (options.id) {
      this._activityId = options.id
      this._loadActivity(options.id)
    }
  },

  onShow() {
    if (this._activityId) {
      this._loadActivity(this._activityId, true)
    }
  },

  async _loadActivity(activityId, silent) {
    if (!silent) this.setData({ isLoading: true })
    try {
      const res = await AdminService.getActivityDetail(activityId)
      if (res.code === 0 && res.data) {
        const activity = res.data
        const status = STATUS_MAP[activity.status] || { text: activity.status, color: '#8E8E93' }
        const categoryText = CATEGORY_MAP[activity.category] || ''

        let statusActionText = '发布'
        if (activity.status === 'published') {
          statusActionText = '截止报名'
        } else if (activity.status === 'registration_stopped') {
          statusActionText = '结束活动'
        } else if (activity.status === 'ended' || activity.status === 'cancelled') {
          statusActionText = '重新发布'
        }

        let priceDisplayText = '免费'
        const ppp = activity.pricePerPerson || 0
        const ppet = activity.pricePerPet || 0
        if (ppp > 0 && ppet > 0) {
          priceDisplayText = '¥' + ppp + '/人  ¥' + ppet + '/宠'
        } else if (ppp > 0) {
          priceDisplayText = '¥' + ppp + '/人'
        } else if (ppet > 0) {
          priceDisplayText = '¥' + ppet + '/宠'
        }

        const maxP = activity.maxParticipants || 0
        const curP = activity.currentParticipants || 0
        const participantPct = maxP > 0 ? Math.min(curP / maxP * 100, 100) : 0
        const participantText = curP + '/' + (maxP || '不限')

        const startTime = this._parseDate(activity.startTime)
        const endTime = this._parseDate(activity.endTime)
        let dateDisplay = '待定'
        let timeDisplay = ''
        if (startTime) {
          dateDisplay = startTime.getFullYear() + '年' + (startTime.getMonth() + 1) + '月' + startTime.getDate() + '日'
          const sh = String(startTime.getHours()).padStart(2, '0')
          const sm = String(startTime.getMinutes()).padStart(2, '0')
          timeDisplay = sh + ':' + sm
          if (endTime) {
            const eh = String(endTime.getHours()).padStart(2, '0')
            const em = String(endTime.getMinutes()).padStart(2, '0')
            timeDisplay += ' - ' + eh + ':' + em
          }
        }

        this.setData({
          activity,
          statusText: status.text,
          statusColor: status.color,
          categoryText,
          statusActionText,
          priceDisplayText,
          participantPct,
          participantText,
          dateDisplay,
          timeDisplay,
        })
      } else {
        this.error('ACTIVITY_NOT_FOUND')
      }
    } catch (e) {
      console.error('[partner/activity-detail] load error:', e)
      this.error('LOAD_FAILED')
    }
    if (!silent) this.setData({ isLoading: false })
  },

  _parseDate(str) {
    if (!str) return null
    const fixed = str.replace(/-/g, '/')
    const d = new Date(fixed)
    return isNaN(d.getTime()) ? null : d
  },

  onEdit() {
    console.log('[partner/activity-detail] onEdit, id:', this._activityId)
    wx.navigateTo({
      url: '/subpackages/partner/activity-create/index?id=' + this._activityId,
      fail: (err) => {
        console.error('[partner/activity-detail] navigateTo fail:', err)
        this.error('NAVIGATE_FAILED')
      },
    })
  },

  onChangeStatus() {
    const { activity } = this.data
    if (!activity) return

    const status = activity.status
    let newStatus = ''
    let confirmMsg = ''

    if (status === 'draft') {
      newStatus = 'published'
      confirmMsg = '确定发布此活动？'
    } else if (status === 'published') {
      newStatus = 'registration_stopped'
      confirmMsg = '确定截止报名？'
    } else if (status === 'registration_stopped') {
      newStatus = 'ended'
      confirmMsg = '确定结束此活动？'
    } else if (status === 'ended' || status === 'cancelled') {
      newStatus = 'published'
      confirmMsg = '确定重新发布此活动？'
    } else {
      this.error('STATUS_INVALID')
      return
    }

    this.showModal({ titleKey: 'BIZ_FRRM3P' })
  },

  async _updateStatus(newStatus) {
    wx.showLoading({ title: '处理中' })
    try {
      const res = await AdminService.updateActivity({
        activityId: this._activityId,
        status: newStatus,
      })
      if (res.code === 0) {
        this.toast('OPERATION_SUCCESS')
        setTimeout(() => {
          wx.navigateBack()
        }, 1500)
      } else {
        this.errorDynamic(res.message, 'OPERATION_FAILED')
      }
    } catch (e) {
      this.error('OPERATION_FAILED')
    }
    wx.hideLoading()
  },

  async onViewRegistrations() {
    wx.showLoading({ title: '加载中' })
    try {
      const res = await AdminService.getActivityRegistrations({
        activityId: this._activityId,
        page: 1,
        pageSize: 50,
      })
      if (res.code === 0 && res.data) {
        this.setData({
          registrations: res.data.list || [],
          showRegList: true,
        })
      }
    } catch (e) {
      this.error('LOAD_FAILED')
    }
    wx.hideLoading()
  },

  onCloseRegList() {
    this.setData({ showRegList: false })
  },

  onCallParticipant(e) {
    const phone = e.currentTarget.dataset.phone
    if (phone) {
      wx.makePhoneCall({ phoneNumber: phone })
    }
  },

  onPreviewImage(e) {
    const src = e.currentTarget.dataset.src
    const { activity } = this.data
    if (!activity || !activity.images) return
    wx.previewImage({
      current: src,
      urls: activity.images,
    })
  },

  goBack() {
    wx.navigateBack({
      fail: () => {
        wx.switchTab({ url: '/pages/home/index' })
      },
    })
  },

  onShareAppMessage() {
    const { activity } = this.data
    return {
      title: activity?.title || '宠物活动',
      path: '/subpackages/activity/detail?id=' + activity?._id,
      imageUrl: activity?.coverUrl,
    }
  },
})
