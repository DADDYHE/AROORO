const CloudFunctionService = require('../../../services/CloudFunctionService')
const { ListBehavior } = require('../../behaviors/listBehavior')
const cloudImageBehavior = require('../../../behaviors/cloudImageBehavior')
const { buildSharePath } = require('../../../utils/share')

Page({
  behaviors: [ListBehavior, cloudImageBehavior],

  data: {
    stats: { totalInvited: 0, consumingCount: 0, totalSpent: '0' },
  },

  onLoad() {
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
      title: 'AROORO - 安心寄养，让爱宠如家',
      path: buildSharePath('/pages/home/index'),
    }
  },

  onPullDownRefresh() {
    this._loadStats()
    this._onPullDownRefresh()
  },
  onReachBottom() { this._onReachBottom() },
})
