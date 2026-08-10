/**
 * homeMyActivitiesBehavior.js - 首页「我的活动」板块
 *
 * 用途：
 *   - 拉取当前用户已报名（confirmed）的活动，供首页「我的活动」板块展示
 *   - 支持在首页卡片上直接签到（onSignIn），或点击卡片跳转活动详情页签到
 *   - 板块只展示当前可签到的活动（canSignIn）：未签到且处于活动时间窗内。
 *     已签到 / 未开始 / 已结束的活动均不显示在此板块。
 *   - 板块显隐由 wxml 的 wx:if="{{isLoggedIn && signableActivities.length}}" 控制：
 *     未登录 / 无可签到活动时不渲染。
 *
 * 说明：为不引入主包对分包模块的依赖，这里用最小化内联转换，只产出卡片所需字段。
 */

const { ActivityService } = require('../services/CloudFunctionService')
const { parseDate } = require('../utils/dateUtils')
const { getLocation } = require('../utils/geolocation')

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const pad = (n) => String(n).padStart(2, '0')

function buildMyActivity(a) {
  const start = parseDate(a.startTime)
  const end = parseDate(a.endTime)
  const now = new Date()
  const isEnded = Boolean(end) && now > end

  let timeText = ''
  if (start) {
    const s = `${start.getMonth() + 1}月${start.getDate()}日 ${WEEKDAYS[start.getDay()]} ${pad(start.getHours())}:${pad(start.getMinutes())}`
    if (end && end.getFullYear() <= 2090 && start.toDateString() === end.toDateString()) {
      timeText = `${s}-${pad(end.getHours())}:${pad(end.getMinutes())}`
    } else {
      timeText = s
    }
  }

  const within = Boolean(start) && now >= start && (!end || now <= end)
  const signInStatus = a.signInStatus || 'unsigned'

  return {
    _id: a._id,
    _registrationId: a._registrationId,
    title: a.title || '活动',
    coverUrl: a.coverUrl || '/images/default-activity.svg',
    location: a.location || '',
    timeText,
    signInStatus,
    isEnded,
    canSignIn: signInStatus !== 'signed' && within,
  }
}

const homeMyActivitiesBehavior = Behavior({
  data: {
    signableActivities: [],
  },

  methods: {
    async _loadMyActivities() {
      try {
        const result = await ActivityService.getRegistrationList({ status: 'confirmed', pageSize: 20 })
        if (result && result.code === 0) {
          const raw = (result.data && (result.data.list || result.data)) || []
          // 首页「快速签到」板块只展示当前可签到的活动：未签到且处于活动时间窗内（canSignIn）。
          // 已签到 / 未开始 / 已结束的活动均不显示在此板块；最多 6 条。
          const items = raw
            .map(buildMyActivity)
            .filter((it) => it.canSignIn)
            .slice(0, 6)
          this.setData({ signableActivities: items })
        } else {
          this.setData({ signableActivities: [] })
        }
      } catch (error) {
        this.setData({ signableActivities: [] })
      }
    },

    async onSignIn(e) {
      const regId = e.currentTarget.dataset.regid
      if (!regId) { return }
      wx.showLoading({ title: '签到中' })
      try {
        const loc = await getLocation()
        const res = await ActivityService.signInRegistration({
          registrationId: regId,
          latitude: loc.latitude,
          longitude: loc.longitude,
        })
        wx.hideLoading()
        if (res && res.code === 0 && res.data) {
          if (res.data.tooFar) {
            wx.showToast({ title: (res.message || '距离活动地点过远') + '，请在现场签到', icon: 'none' })
            return
          }
          // 签到成功后该活动不再可签到，直接从「快速签到」板块移除
          const signableActivities = (this.data.signableActivities || [])
            .filter((it) => it._registrationId !== regId)
          this.setData({ signableActivities })
          wx.showToast({ title: '签到成功', icon: 'success' })
        } else {
          wx.showToast({ title: res && res.message ? res.message : '签到失败', icon: 'none' })
        }
      } catch (err) {
        wx.hideLoading()
        const title = (err && err.code)
          ? (err.message || '签到失败，请稍后重试')
          : '获取定位失败，请开启定位权限后重试'
        wx.showToast({ title, icon: 'none' })
      }
    },

    handleViewAllMyActivities() {
      wx.navigateTo({ url: '/subpackages/activity/my-registered' })
    },
  },
})

module.exports = homeMyActivitiesBehavior
