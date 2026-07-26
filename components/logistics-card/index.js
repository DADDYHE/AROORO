/**
 * logistics-card - 物流卡片组件
 *
 * 职责：
 *   1. 展示快递单号 + 发货时间
 *   2. 点击拉起 wx.openBusinessView({businessType:'logisticsDetail'}) 官方半屏组件
 *   3. 失败降级：调本服务 mallService.getLogisticsTrack 拉取轨迹并展示
 *   4. 支持展开/收起轨迹列表
 *
 * 使用方式（父页面）：
 *   <logistics-card
 *     order-id="{{order._id}}"
 *     express-company="{{order.expressCompany}}"
 *     express-no="{{order.expressNo}}"
 *     shipped-at="{{order.shippedAt}}"
 *     transaction-id="{{order.transactionId}}"
 *     wx-transaction-id="{{order.wxTransactionId}}"
 *   />
 *
 * 依赖：
 *   - services/CloudFunctionService.js 中的 OrderService.getLogisticsTrack
 *   - wx.openBusinessView（基础库 ≥ 2.27）
 */
const { OrderService } = require('../../services/CloudFunctionService')

Component({
  options: {
    multipleSlots: false,
    addGlobalClass: true, // 让组件内样式可被页面 wxss 覆盖（如暗色模式）
  },

  properties: {
    // 订单 _id（用于调本服务 getLogisticsTrack）
    orderId: { type: String, value: '' },
    // 快递公司编码（如 'ZTO'）
    expressCompany: { type: String, value: '' },
    // 快递单号
    expressNo: { type: String, value: '' },
    // 发货时间（已格式化的字符串）
    shippedAt: { type: String, value: '' },
    // 微信支付订单号（用于拉起 wx logisticsDetail 组件）
    transactionId: { type: String, value: '' },
    // wxTransactionId 优先级高于 transactionId
    wxTransactionId: { type: String, value: '' },
    // 是否默认展开轨迹列表
    defaultExpanded: { type: Boolean, value: false },
  },

  data: {
    logisticsTrack: [],         // 降级方案下展示的轨迹列表 [{time, desc}]
    logisticsLoading: false,    // 拉取轨迹中
    logisticsExpanded: false,   // 是否展开轨迹列表
    hasFetchedTrack: false,     // 是否已经拉过一次轨迹（避免重复拉）
  },

  lifetimes: {
    attached() {
      this.setData({ logisticsExpanded: this.data.defaultExpanded })
    },
  },

  methods: {
    /**
     * 点击「查看物流」按钮：
     * - 优先调 wx.openBusinessView({businessType:'logisticsDetail'}) 拉起官方半屏组件；
     * - 失败（低版本基础库 / 用户取消 / 微信侧未生成物流卡）则降级调本服务 getLogisticsTrack 自建展示。
     */
    onViewLogistics() {
      if (!this.data.expressNo) {
        this._toast('该订单暂无快递单号')
        return
      }
      this._openWxLogisticsView()
    },

    /**
     * 拉起微信官方物流详情半屏组件。
     * - 文档：https://developers.weixin.qq.com/miniprogram/dev/platform-capabilities/business-capabilities/order-shipping/order-shipping-half.html
     * - 拉起前提：商家发货时已调 uploadShippingInfo 把快递信息推到微信侧。
     */
    _openWxLogisticsView() {
      if (typeof wx.openBusinessView !== 'function') {
        // 低版本基础库，直接降级
        this._fallbackGetTrack()
        return
      }
      const transactionId = this.data.wxTransactionId || this.data.transactionId || ''
      if (!transactionId) {
        // 无微信支付订单号，无法拉起官方组件，降级
        this._fallbackGetTrack()
        return
      }
      wx.openBusinessView({
        businessType: 'logisticsDetail',
        extraData: {
          transaction_id: transactionId,
        },
        success: () => {
          // 拉起成功即可，无需刷新
        },
        fail: (e) => {
          console.warn('[logistics-card] wx.openBusinessView logisticsDetail fail', e)
          // 降级到自建轨迹
          this._fallbackGetTrack()
        },
      })
    },

    /**
     * 降级方案：调本服务 getLogisticsTrack 拉取轨迹，本地展示。
     * 已拉过则只切换展开状态，不重复请求。
     */
    async _fallbackGetTrack() {
      if (this.data.hasFetchedTrack) {
        this.setData({ logisticsExpanded: true })
        return
      }
      const orderId = this.data.orderId
      if (!orderId) {
        this._toast('缺少订单ID')
        return
      }
      this.setData({ logisticsLoading: true, logisticsExpanded: true })
      try {
        const res = await OrderService.getLogisticsTrack(orderId)
        if (res && res.code === 0 && res.data) {
          this.setData({
            logisticsTrack: Array.isArray(res.data.track) ? res.data.track : [],
            logisticsLoading: false,
            hasFetchedTrack: true,
          })
          if (!res.data.track || res.data.track.length === 0) {
            this._toast('暂无轨迹')
          }
        } else {
          this.setData({ logisticsLoading: false })
          this._toast((res && res.message) || '获取轨迹失败')
        }
      } catch (e) {
        this.setData({ logisticsLoading: false })
        this._toast((e && e.message) || '获取轨迹失败')
      }
    },

    onToggleLogistics() {
      this.setData({ logisticsExpanded: !this.data.logisticsExpanded })
    },

    _toast(text, icon = 'none') {
      wx.showToast({ title: text, icon, duration: 2000 })
    },
  },
})
