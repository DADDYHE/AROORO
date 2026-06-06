const { ActivityService } = require('./services/ActivityService')
const { ListBehavior } = require('./behaviors/listBehavior')
const cloudImageBehavior = require('../../behaviors/cloudImageBehavior')

Page({
  behaviors: [ListBehavior, cloudImageBehavior],

  data: {
    activities: [],
    currentCategory: 'all',
    iconTimeLine: 'cloud://cloudbase-d7getcjqy33b13475.636c-cloudbase-d7getcjqy33b13475-1433773870/icons/time-line.svg',
    iconMapPin: 'cloud://cloudbase-d7getcjqy33b13475.636c-cloudbase-d7getcjqy33b13475-1433773870/icons/map-pin-line.svg',
    categories: [
      { key: 'all', label: '全部' },
      { key: 'outdoor', label: '户外' },
      { key: 'social', label: '社交' },
      { key: 'training', label: '训练' },
      { key: 'health', label: '健康' },
      { key: 'joined', label: '我报名的' },
    ],
  },

  onLoad() {
    this._initListBehavior(
      params => this._doFetch(params),
      { pageSize: 10, listKey: 'activities', sortFn: this._sortActivities }
    )
    this._loadPageData()
  },

  onShow() {
    if (this.data.currentCategory !== 'joined') {
      this._resetAndLoad()
    }
  },

  onHide() {
  },

  onUnload() {
  },

  async _doFetch(params) {
    const action = this.data.currentCategory === 'joined' ? 'getRegistrationList' : 'getActivityList'
    const reqData = { action, page: params.page, pageSize: params.pageSize }
    if (this.data.currentCategory !== 'all' && this.data.currentCategory !== 'joined') {
      reqData.category = this.data.currentCategory
    }
    const result = await ActivityService.call(action, reqData)
    if (result && result.code === 0 && result.data) {
      return result.data.list || result.data || []
    }
    return []
  },

  async onAvatarImageError(e) {
    const index = e.currentTarget.dataset.index
    const key = `activities[${index}].organizer.hasValidAvatar`
    this.setData({ [key]: false })
  },

  _toDate(str) {
    if (!str) return null
    try {
      const normalized = String(str).replace(/-/g, '/')
      const d = new Date(normalized)
      return isNaN(d.getTime()) ? null : d
    } catch (e) {
      return null
    }
  },

  _formatDateTime(date) {
    if (!date) return ''
    const month = date.getMonth() + 1
    const day = date.getDate()
    const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    const hour = date.getHours().toString().padStart(2, '0')
    const minute = date.getMinutes().toString().padStart(2, '0')
    return `${month}月${day}日 ${weekDays[date.getDay()]} ${hour}:${minute}`
  },

  _transformListItem(a) {
    const startDate = this._toDate(a.startTime)
    const endDate = this._toDate(a.endTime)
    const isUnlimited = endDate && endDate.getFullYear() > 2090

    let timeText = ''
    if (startDate && endDate && !isUnlimited) {
      const startStr = this._formatDateTime(startDate)
      const endStr = this._formatDateTime(endDate)

      const isSameDay = startDate.toDateString() === endDate.toDateString()
      if (isSameDay) {
        const month = startDate.getMonth() + 1
        const day = startDate.getDate()
        const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
        const startH = startDate.getHours().toString().padStart(2, '0')
        const startM = startDate.getMinutes().toString().padStart(2, '0')
        const endH = endDate.getHours().toString().padStart(2, '0')
        const endM = endDate.getMinutes().toString().padStart(2, '0')
        timeText = `${month}月${day}日 ${weekDays[startDate.getDay()]} ${startH}:${startM}-${endH}:${endM}`
      } else {
        timeText = `${startStr} - ${endStr}`
      }
    } else if (startDate) {
      timeText = this._formatDateTime(startDate)
    }

    let activityStatus = 'upcoming'
    if (a.status === 'registration_stopped') {
      activityStatus = 'registration_stopped'
    } else if (a.status === 'ended' || (endDate && new Date() > endDate)) {
      activityStatus = 'ended'
    } else if (startDate && new Date() > startDate) {
      activityStatus = 'registration_stopped'
    }
    const organizerAvatar = (a.organizer && a.organizer.avatar) || ''
    const hasValidAvatar = !!organizerAvatar
    let priceText = '免费'
    const ppp = a.pricePerPerson || 0
    const ppet = a.pricePerPet || 0
    if (ppp > 0 && ppet > 0) {
      priceText = `¥${ppp}/人 ¥${ppet}/宠`
    } else if (ppp > 0) {
      priceText = `¥${ppp}/人`
    } else if (ppet > 0) {
      priceText = `¥${ppet}/宠`
    }

    return {
      ...a,
      timeText,
      priceText,
      activityStatus,
      coverUrl: a.coverUrl || '/images/default-activity.svg',
      organizer: {
        name: (a.organizer && a.organizer.name) || '宠团团',
        avatar: organizerAvatar,
        hasValidAvatar,
      },
    }
  },

  _sortActivities(a, b) {
    const order = { upcoming: 0, registration_stopped: 1, ended: 2 }
    const aOrder = order[a.activityStatus] ?? 0
    const bOrder = order[b.activityStatus] ?? 0
    if (aOrder !== bOrder) return aOrder - bOrder
    return (b.startTime || '').localeCompare(a.startTime || '')
  },

  _onListError() {
    this.setData({ activities: [] })
  },

  onCategoryTap(e) {
    const category = e.currentTarget.dataset.key
    this.setData({ currentCategory: category })
    this._resetAndLoad()
  },

  onActivityTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/subpackages/activity/detail?id=${id}` })
  },

  onJoinActivity(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/subpackages/activity/register?id=${id}` })
  },

  onPullDownRefresh() { this._onPullDownRefresh() },
  onReachBottom() { this._onReachBottom() },

  onShareAppMessage() {
    const userInfo = getApp().globalData.userInfo
    const inviterId = ((userInfo?.isPartner || userInfo?.permissions?.length) && userInfo?.openid) ? userInfo.openid : ''
    return {
      title: 'AROORO 宠团活动 - 精彩宠物社区活动等你来',
      path: inviterId ? `/subpackages/activity/list?inviterId=${inviterId}` : '/subpackages/activity/list',
    }
  },
})
