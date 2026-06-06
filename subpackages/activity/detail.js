const { ActivityService } = require('./services/ActivityService')
const { parseDate } = require('../../utils/dateUtils')
const cloudImageBehavior = require('../../behaviors/cloudImageBehavior')

const CATEGORY_MAP = {
  outdoor: '户外活动',
  indoor: '室内活动',
  social: '社交聚会',
  training: '培训课程',
  competition: '比赛赛事',
  adoption: '领养活动',
  other: '其他活动',
}

const STATUS_TEXT_MAP = {
  upcoming: '即将开始',
  ongoing: '进行中',
  ended: '已结束',
}

const pageI18n = require('../../utils/page-i18n.js')

Page({
  ...pageI18n.mixin(),
  behaviors: [cloudImageBehavior],
  data: {
    activity: null,
    isLoading: true,
    isRegistered: false,
    activityStatus: 'upcoming',
    registrationEnded: false,
    statusText: '即将开始',
    categoryText: '',
    displayDate: '',
    displayTime: '',
    isMultiDay: false,
    startTimeDisplay: '',
    endTimeDisplay: '',
    highlightTags: [],
    btnStatus: '',
    btnText: '立即报名',
  },

  onLoad(options) {
    if (options.id) {
      this._activityId = options.id
      this._loadActivity(options.id)
    } else {
      this.setData({ isLoading: false })
      this.error('INVALID_PARAMS')
    }
  },

  onShow() {
    if (this._activityId) {
      this._loadActivity(this._activityId, true)
    }
  },

  onHide() {
  },

  onUnload() {
  },

  _updateRegisteredState() {
    this.setData({
      isRegistered: true,
      btnStatus: 'registered',
      btnText: '已报名',
    })
  },

  /** 加载活动详情，设置展示数据并随时注册状态 */
  async _loadActivity(activityId, silent = false) {
    if (!silent) {
      this.setData({ isLoading: true })
    }
    try {
      const result = await ActivityService.getActivityDetail(activityId)
      if (result && result.code === 0 && result.data) {
        const activity = result.data
        activity.coverUrl = activity.coverUrl || '/images/default-activity.svg'
        if (activity.organizer) {
          const avatar = activity.organizer.avatar || ''
          activity.organizer.avatar = avatar
          activity.organizer.hasValidAvatar = !!avatar
        } else {
          activity.organizer = { name: '宠团团', avatar: '', hasValidAvatar: false, activityCount: 0 }
        }

        const activityStatus = this._getActivityStatus(activity)
        const registrationEnded = this._isRegistrationEnded(activity)
        const isRegistered = activity.isRegistered || false

        const displayDate = this._formatDateRange(activity.startTime, activity.endTime)
        const { displayTime, isMultiDay, startTimeDisplay, endTimeDisplay } = this._formatTimeRange(activity.startTime, activity.endTime)
        const categoryText = CATEGORY_MAP[activity.category] || ''
        const statusText = STATUS_TEXT_MAP[activityStatus] || '即将开始'
        const highlightTags = this._generateHighlightTags(activity)

        let priceDisplayText = '免费'
        const ppp = activity.pricePerPerson || 0
        const ppet = activity.pricePerPet || 0
        if (ppp > 0 && ppet > 0) {
          priceDisplayText = `¥${ppp}/人 ¥${ppet}/宠`
        } else if (ppp > 0) {
          priceDisplayText = `¥${ppp}/人`
        } else if (ppet > 0) {
          priceDisplayText = `¥${ppet}/宠`
        }

        const { btnStatus, btnText } = this._getButtonState(activityStatus, registrationEnded, isRegistered)

        this.setData({
          activity,
          activityStatus,
          registrationEnded,
          isRegistered,
          displayDate,
          displayTime,
          isMultiDay,
          startTimeDisplay,
          endTimeDisplay,
          categoryText,
          statusText,
          highlightTags,
          priceDisplayText,
          btnStatus,
          btnText,
        })
      } else {
        this.setData({ activity: null })
        if (!silent) {
          this.error('ACTIVITY_NOT_FOUND')
        }
      }
    } catch (error) {
      console.error('加载活动详情失败:', error)
      this.setData({ activity: null })
      if (!silent) {
        this.error('LOAD_FAILED')
      }
    }
    if (!silent) {
      this.setData({ isLoading: false })
    }
  },

  /** 根据活动起止时间判断状态：upcoming/ongoing/ended */
  _getActivityStatus(activity) {
    const now = new Date()
    const endDate = parseDate(activity.endTime)
    const startDate = parseDate(activity.startTime)

    if (endDate && now > endDate) {
      return 'ended'
    }
    if (startDate && now >= startDate && (!endDate || now <= endDate)) {
      return 'ongoing'
    }
    return 'upcoming'
  },

  /** 判断活动是否已开始（开始即截止报名） */
  _isRegistrationEnded(activity) {
    const startDate = parseDate(activity.startTime)
    return startDate && new Date() > startDate
  },

  _getButtonState(activityStatus, registrationEnded, isRegistered) {
    if (activityStatus === 'ended') {
      return { btnStatus: 'ended', btnText: '已结束' }
    }
    if (isRegistered) {
      return { btnStatus: 'registered', btnText: '已报名' }
    }
    if (registrationEnded) {
      return { btnStatus: 'stopped', btnText: '已停止报名' }
    }
    return { btnStatus: '', btnText: '立即报名' }
  },

  _formatDateRange(startTime, endTime) {
    const startDate = parseDate(startTime)
    if (!startDate) return '待定'
    
    const year = startDate.getFullYear()
    const month = startDate.getMonth() + 1
    const day = startDate.getDate()
    const weekDay = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][startDate.getDay()]
    
    const endDate = parseDate(endTime)
    if (endDate && (endDate.getFullYear() !== year || endDate.getMonth() !== month || endDate.getDate() !== day)) {
      const endMonth = endDate.getMonth() + 1
      const endDay = endDate.getDate()
      return `${month}月${day}日 - ${endMonth}月${endDay}日`
    }
    
    return `${year}年${month}月${day}日 ${weekDay}`
  },

  _formatTimeRange(startTime, endTime) {
    const startDate = parseDate(startTime)
    if (!startDate) return { displayTime: '待定', isMultiDay: false, startTimeDisplay: '', endTimeDisplay: '' }
    
    const month = startDate.getMonth() + 1
    const day = startDate.getDate()
    const startHours = String(startDate.getHours()).padStart(2, '0')
    const startMinutes = String(startDate.getMinutes()).padStart(2, '0')
    const startTimeDisplay = `${month}月${day}日 ${startHours}:${startMinutes}`
    
    const endDate = parseDate(endTime)
    if (endDate && endDate.getFullYear() <= 2090) {
      const endHours = String(endDate.getHours()).padStart(2, '0')
      const endMinutes = String(endDate.getMinutes()).padStart(2, '0')
      
      const isSameDay = startDate.getFullYear() === endDate.getFullYear() &&
                        startDate.getMonth() === endDate.getMonth() &&
                        startDate.getDate() === endDate.getDate()
      
      if (isSameDay) {
        return {
          displayTime: `${month}月${day}日 ${startHours}:${startMinutes} - ${endHours}:${endMinutes}`,
          isMultiDay: false,
          startTimeDisplay: '',
          endTimeDisplay: ''
        }
      } else {
        const endMonth = endDate.getMonth() + 1
        const endDay = endDate.getDate()
        const endTimeDisplay = `${endMonth}月${endDay}日 ${endHours}:${endMinutes}`
        return {
          displayTime: `开始 ${month}月${day}日 ${startHours}:${startMinutes}\n结束 ${endMonth}月${endDay}日 ${endHours}:${endMinutes}`,
          isMultiDay: true,
          startTimeDisplay,
          endTimeDisplay
        }
      }
    }
    
    return {
      displayTime: `${month}月${day}日 ${startHours}:${startMinutes}`,
      isMultiDay: false,
      startTimeDisplay: '',
      endTimeDisplay: ''
    }
  },

  _generateHighlightTags(activity) {
    const tags = []
    if (activity.category) {
      const categoryTag = CATEGORY_MAP[activity.category]
      if (categoryTag) tags.push(categoryTag)
    }
    if ((activity.pricePerPerson || 0) === 0 && (activity.pricePerPet || 0) === 0) {
      tags.push('免费参加')
    }
    if (activity.maxParticipants && activity.currentParticipants) {
      const remaining = activity.maxParticipants - activity.currentParticipants
      if (remaining > 0 && remaining <= 5) {
        tags.push(`仅剩${remaining}个名额`)
      }
    }
    if (activity.tags && Array.isArray(activity.tags)) {
      tags.push(...activity.tags.slice(0, 3))
    }
    return tags.slice(0, 5)
  },

  onShare() {
    const { activity } = this.data
    if (!activity) return

    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline'],
    })
  },

  onContact() {
    const { activity } = this.data
    if (!activity) return

    const contactPhone = activity.contactPhone || activity.organizer?.phone || ''
    if (!contactPhone) {
      this.error('CONTACT_MISSING')
      return
    }

    wx.makePhoneCall({ phoneNumber: contactPhone })
  },

  onLocationTap() {
    const { activity } = this.data
    if (!activity || !activity.location) {
      this.error('LOCATION_MISSING')
      return
    }

    if (activity.latitude && activity.longitude) {
      wx.navigateTo({
        url: `/subpackages/activity/map-view?latitude=${activity.latitude}&longitude=${activity.longitude}&name=${encodeURIComponent(activity.location)}&address=${encodeURIComponent(activity.location)}`,
      })
    } else {
      this.error('LOCATION_PRECISE_MISSING')
    }
  },

  async onOrganizerAvatarError() {
    this.setData({ 'activity.organizer.hasValidAvatar': false })
  },

  onRegister() {
    const { activity, isRegistered, activityStatus, registrationEnded } = this.data
    if (!activity) return

    if (activityStatus === 'ended') {
      this.error('ACTIVITY_ENDED_TOAST')
      return
    }

    if (isRegistered) {
      this.error('ALREADY_REGISTERED_LONG')
      return
    }

    if (registrationEnded) {
      this.error('REGISTRATION_CLOSED')
      return
    }

    wx.navigateTo({ url: `/subpackages/activity/register?id=${activity._id}` })
  },

  previewImage(e) {
    const { activity } = this.data
    if (!activity || !activity.images || activity.images.length === 0) return
    const index = e.currentTarget.dataset.index || 0
    wx.previewImage({ current: activity.images[index], urls: activity.images })
  },

  onScroll(e) {
    const scrollTop = e.detail.scrollTop
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
    const userInfo = getApp().globalData.userInfo
    const inviterId = ((userInfo?.isPartner || userInfo?.permissions?.length) && userInfo?.openid) ? userInfo.openid : ''
    const basePath = `/subpackages/activity/detail?id=${activity?._id}`
    return {
      title: activity?.title || '宠物活动',
      path: inviterId ? `${basePath}&inviterId=${inviterId}` : basePath,
      imageUrl: activity?.coverUrl,
    }
  },

  onShareTimeline() {
    const { activity } = this.data
    const userInfo = getApp().globalData.userInfo
    const inviterId = ((userInfo?.isPartner || userInfo?.permissions?.length) && userInfo?.openid) ? userInfo.openid : ''
    const queryParts = [`id=${activity?._id}`]
    if (inviterId) queryParts.push(`inviterId=${inviterId}`)
    return {
      title: activity?.title || '宠物活动',
      query: queryParts.join('&'),
      imageUrl: activity?.coverUrl,
    }
  },
})
