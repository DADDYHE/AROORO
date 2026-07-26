/**
 * logistics-card - 物流卡片组件
 *
 * 职责：
 *   1. 展示快递单号 + 发货时间
 *   2. 点击调本服务 mallService.getLogisticsTrack 拉取轨迹并展开展示
 *   3. 支持展开/收起轨迹列表
 *
 * 设计说明：
 *   - 微信官方 wx.openBusinessView 在「发货信息管理」场景下仅提供 weappOrderConfirm
 *     （确认收货）一种 businessType，没有 logisticsDetail 半屏组件。
 *   - 用户在微信「服务通知」点发货通知会跳到小程序指定页面（由 upload_shipping_info
 *     的 path 参数配置），物流详情由小程序自建展示。
 *
 * 使用方式（父页面）：
 *   <logistics-card
 *     order-id="{{order._id}}"
 *     express-company="{{order.expressCompany}}"
 *     express-no="{{order.expressNo}}"
 *     shipped-at="{{order.shippedAt}}"
 *   />
 *
 * 依赖：
 *   - services/CloudFunctionService.js 中的 OrderService.getLogisticsTrack
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
    // 微信支付订单号（已废弃：原用于拉起 wx logisticsDetail 组件，但该 businessType 不存在）
    // 保留属性定义避免父页面传参报错，后续可移除
    transactionId: { type: String, value: '' },
    // wxTransactionId（已废弃，同上）
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
     * 点击「查看物流」按钮：调本服务 getLogisticsTrack 拉取轨迹并展开自建展示。
     *
     * 设计说明：
     *   - 微信官方 wx.openBusinessView 在「发货信息管理」场景下仅提供 weappOrderConfirm
     *     （确认收货）一种 businessType，没有 logisticsDetail 半屏组件。
     *   - 用户在微信「服务通知」点发货通知会跳到小程序指定页面（由 upload_shipping_info
     *     的 path 参数配置），物流详情由小程序自建展示。
     *   - 已拉过则只切换展开状态，不重复请求。
     */
    onViewLogistics() {
      if (!this.data.expressNo) {
        this._toast('该订单暂无快递单号')
        return
      }
      this._fallbackGetTrack()
    },

    /**
     * 拉取物流轨迹并展开本地展示。
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
