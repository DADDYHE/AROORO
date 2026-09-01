const __i18n = require('../../../utils/i18n.js')
const __pageI18n = require('../../../utils/page-i18n.js')
const __i18nT = (k) => __i18n.t(k, __i18n.getLocale())
const CloudFunctionService = require('../../../services/CloudFunctionService')
const { ListBehavior } = require('../../behaviors/listBehavior')
const cloudImageBehavior = require('../../../behaviors/cloudImageBehavior')
const { buildSharePath } = require('../../../utils/share')

Page({
  behaviors: [ListBehavior, cloudImageBehavior],

  data: {
  ...__pageI18n.buildTMap(__i18n.getLocale()),
    stats: { totalInvited: 0, consumingCount: 0, totalSpent: '0' },
  },

  onLoad() {
    this._initNavbarHeight()
    const userInfo = getApp()?.globalData?.userInfo
    this._isPartner = Boolean(userInfo?.isPartner || userInfo?.permissions?.length)
    this._initListBehavior(
      params => this._doFetch(params),
      { defaultPageSize: 20, listKey: 'invitedUsers' }
    )
    this._loadPageData()
    this._loadStats()
  },

  onShow() {
    this._loadStats()
  },

  async _loadStats() {
    try {
      const result = await CloudFunctionService.call('userService', {
        action: 'getReferralStats',
      })
      if (result && result.code === 0 && result.data) {
        this.setData({ stats: result.data })
      }
    } catch (error) {
      console.error('[Referral] 加载统计失败:', error)
    }
  },

  async _doFetch(params) {
    try {
      const result = await CloudFunctionService.call('userService', {
        action: 'getInvitedUsers',
        page: params.page,
        pageSize: params.pageSize,
      })
      if (result && result.code === 0 && result.data) {
        return result.data.list || []
      }
      return []
    } catch (error) {
      console.error('[Referral] 加载用户列表失败:', error)
      return []
    }
  },

  _onListError(error) {
    console.error('[Referral] 列表加载错误:', error)
  },

  onShareAppMessage() {
    return {
      title: __i18nT('BIZ_54TFDI'),
      path: buildSharePath('/pages/home/index'),
    }
  },

  onPullDownRefresh() {
    this._loadStats()
    this._onPullDownRefresh()
  },
  onReachBottom() { this._onReachBottom() },
})
