/**
 * homeHostInviteBehavior.js - 首页「寄养开单」入口板块
 *
 * 用途：
 *   - 仅对「已开通家庭寄养」的用户显示入口（与合作伙伴身份无关）：
 *     判定依据 = hostService.getHostProfile 返回有效档案
 *   - 入口点击进入主动开单页；「管理开单」进入家庭档案（含开单/订单台账）
 *
 * 用法：
 *   const homeHostInviteBehavior = require('../../behaviors/homeHostInviteBehavior')
 *   Page({ behaviors: [homeHostInviteBehavior], ... })
 */

const { HostService, CloudFunctionService } = require('../services/CloudFunctionService')

const homeHostInviteBehavior = Behavior({
  data: {
    hasHostInvite: false,
  },

  methods: {
    /** 判定寄养开单功能是否可用（有家庭寄养档案即可；30s 缓存，下拉 forceRefresh 穿透） */
    async _loadHostInvite(forceRefresh) {
      try {
        const res = forceRefresh
          ? await HostService.getMyProfile()
          : await CloudFunctionService.call('hostService', { action: 'getHostProfile' }, { useCache: true, cacheTime: 30000 })
        const d = res && res.data
        const hasHostInvite = !!(res && res.code === 0 && d && (d._id || d.openid))
        if (hasHostInvite !== this.data.hasHostInvite) {
          this.setData({ hasHostInvite })
        }
      } catch (e) {
        console.warn('[homeHostInvite] _loadHostInvite error:', e)
        if (this.data.hasHostInvite) {
          this.setData({ hasHostInvite: false })
        }
      }
    },

    /** 清空板块数据（登出/接口异常时） */
    _clearHostInvite() {
      if (this.data.hasHostInvite) {
        this.setData({ hasHostInvite: false })
      }
    },

    /** 主动开单：创建邀请分享给客户填写 */
    handleHostInviteTap() {
      wx.navigateTo({ url: '/subpackages/partner/invitation-create/index' })
    },

    /** 管理开单/订单台账（家庭寄养档案页） */
    handleHostInviteManage() {
      wx.navigateTo({ url: '/subpackages/partner/hosting-profile/index' })
    },
  },
})

module.exports = homeHostInviteBehavior
