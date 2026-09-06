const __i18n = require('../../../utils/i18n.js')
const __pageI18n = require('../../../utils/page-i18n.js')
const __i18nT = (k) => __i18n.t(k, __i18n.getLocale())
const { orderManager, ORDER_EVENTS } = require('../../../services/OrderManager')
const { OrderService } = require('../../../services/CloudFunctionService')
const { TuanService } = require('../../../services/TuanService')
const cloudImageBehavior = require('../../../behaviors/cloudImageBehavior')
const { STATUS_TEXT_MAP, LOGISTICS_STATUS_TEXT_MAP } = require('../utils/orderConstants')
const { formatDate, formatDateTime, parseDate } = require('../utils/dateUtils')

const TYPE_MAP = {
  activity: { title: __i18nT('BIZ_E4R43K'), label: '活动' },
  service: { title: __i18nT('BIZ_DCOTNR'), label: '服务' },
  group: { title: __i18nT('BIZ_BJUOQM'), label: '团购' },
  boarding: { title: __i18nT('BIZ_BXA2JU'), label: '寄养' },
  mall: { title: __i18nT('BIZ_B4Q6UZ'), label: '商城' },
}

const pageI18n = require('../../../utils/page-i18n.js')
const { ListBehavior } = require('../../../behaviors/listBehavior')

Page({
  ...pageI18n.mixin(),
  behaviors: [ListBehavior, cloudImageBehavior],
  data: {
    t: __pageI18n.buildTMap(__i18n.getLocale()),
    orders: [],
  orderSections: [],
    orderType: 'boarding',
      isLoggedIn: false,
    isLoading: false,
    total: 0,
    page: 1,
    stats: { count: 0, amount: 0, completedCount: 0, completedAmount: 0 },
      iconMapPin: '/images/icons/map-pin-line.svg',
    iconTimeLine: '/images/icons/time-line.svg',
  },

  onLoad(options) {
    this._initNavbarHeight()
    if (options.outTradeNo) {
      wx.redirectTo({ url: `/subpackages/profile/order-detail/index?outTradeNo=${options.outTradeNo}` })
      return
    }

    const orderType = options.type || 'boarding'
    const typeInfo = TYPE_MAP[orderType] || TYPE_MAP.boarding
    wx.setNavigationBarTitle({ title: typeInfo.title })
    this.setData({ orderType })

    this._allOrders = []
    this._syncLoginStatus()
    this._orderUnsub = orderManager.on(ORDER_EVENTS.LIST_UPDATED, () => {
      this._loadOrders()
    })
  },

  onShow() {
    this._syncLoginStatus()
    if (!this.data.isLoggedIn) {
      console.warn('[order-stats] 未登录，跳过加载订单')
      return
    }
    // 30s 节流：窗口内返回不再全量重拉（订单状态变更另有 orderManager
    // LIST_UPDATED 事件兜底，onLoad 已订阅）；下拉刷新/操作后刷新不走节流
    const now = Date.now()
    if (this._lastLoadedAt && now - this._lastLoadedAt < 30000) { return }
    this._lastLoadedAt = now
    this._loadOrders()
  },

  onUnload() {
    if (this._orderUnsub) {this._orderUnsub()}
  },

  _syncLoginStatus() {
    const app = getApp()
    const isLoggedIn = Boolean(app.globalData && app.globalData.isLoggedIn)
    this.setData({ isLoggedIn })
  },

  async _loadOrders() {
    // 防重入：onShow 与 LIST_UPDATED 事件并发触发时只发一次请求
    if (this.data.isLoading) {return}
    this.setData({ isLoading: true })
    try {
      const { orderType, page } = this.data
      let result

      if (orderType === 'activity') {
        const res = await OrderService.getActivityOrders({
          status: undefined,
          page,
          pageSize: 20,
        })
        result = {
          list: res.data?.list || [],
          total: res.data?.total || 0,
          page: res.data?.page || 1,
        }
      } else if (orderType === 'mall') {
        const res = await OrderService.getMallOrders({
          status: undefined,
          page,
          pageSize: 20,
        })
        result = {
          list: res.data?.list || [],
          total: res.data?.total || 0,
          page: res.data?.page || 1,
        }
      } else if (orderType === 'group') {
        const res = await OrderService.getGroupBuyOrders({
          status: undefined,
          page,
          pageSize: 20,
        })
        result = {
          list: res.data?.list || [],
          total: res.data?.total || 0,
          page: res.data?.page || 1,
        }
      } else if (orderType === 'service') {
        const res = await OrderService.getFeedingOrders({
          status: undefined,
          page,
          pageSize: 20,
        })
        result = {
          list: res.data?.list || [],
          total: res.data?.total || 0,
          page: res.data?.page || 1,
        }
      } else {
        result = await orderManager.getOrders('owner', 'all', page, 20)
      }

      const now = new Date()
      this._allOrders = (result.list || []).map(item => {
        if (!item || !item._id) {return null}
        const normalized = this._normalizeOrder(item)
        if (!normalized) {return null}
        if (orderType === 'activity' && normalized.orderType !== 'activity') {return null}
        if (orderType === 'service' && !['feeding', 'service'].includes(normalized.orderType)) {return null}
        if (orderType === 'group' && normalized.orderType !== 'group_buy') {return null}
        if (orderType === 'boarding' && !['boarding', 'hosting'].includes(normalized.orderType)) {return null}
        if (orderType === 'mall' && normalized.orderType !== 'mall') {return null}
        if (normalized.orderType === 'activity') {
          let rawEnd = normalized._rawEndDate || ''
          if (rawEnd && typeof rawEnd === 'object' && rawEnd instanceof Date) {
            rawEnd = rawEnd.toISOString().replace('T', ' ').slice(0, 19)
          }
          if (rawEnd && rawEnd !== '') {
            const endTime = new Date(String(rawEnd).replace(/-/g, '/'))
            if (!isNaN(endTime.getTime())) {
              normalized.isEnded = endTime <= now
              if (normalized.isEnded && normalized.status === 'pending_payment') {
                normalized.statusText = '已过期'
              }
            }
          }
        }
        return normalized
      }).filter(Boolean)

      this.setData({
        total: result.total || 0,
        page: result.page || 1,
        isLoading: false,
      })
      this._calcStats()
      this._regroup()
      // 异步增强 wx 发货状态：paid 订单可能已在微信平台后台发货
      this._enrichWxShippingStatus()
        .then(() => {
          // wx 状态回来后重算每个订单的 status（shipped），再渲染
          this._recountOrders()
          this._calcStats()
          this._regroup()
        })
        .catch(() => {/* 静默降级 */})
    } catch (error) {
      this.setData({ isLoading: false })
    }
  },

  /**
   * 2026-09-06 分节台账：状态收拢为三节（进行中/已完成/已关闭），替代按业务线的多套筛选 tab。
   * 仅展示层映射——底层 status 不变；章文案仍显示精确状态（statusText）。
   */
  _regroup() {
    const groupOf = (item) => {
      if (item.isEnded || item.status === 'completed') {return 'completed'}
      if (item.status === 'cancelled' || item.status === 'rejected' || item.status === 'refunded') {return 'closed'}
      // pending_payment / pending / paid / deposit_paid / confirmed / in_progress / pending_shipment
      return 'processing'
    }
    const sections = [
      { key: 'processing', label: '进行中', list: [] },
      { key: 'completed', label: '已完成', list: [] },
      { key: 'closed', label: '已关闭', list: [] },
    ]
    for (const item of (this._allOrders || [])) {
      const g = groupOf(item)
      item._group = g
      const sec = sections.find(s => s.key === g)
      if (sec) {sec.list.push(item)}
    }
    // 折叠状态跨刷新保留（首次：进行中展开，其余收起）
    this._sectionExpanded = this._sectionExpanded || {}
    sections.forEach(s => {
      if (!(s.key in this._sectionExpanded)) {
        this._sectionExpanded[s.key] = s.key === 'processing'
      }
      s.expanded = !!this._sectionExpanded[s.key]
    })
    this.setData({ orderSections: sections, orders: this._allOrders || [] })
  },

  /** 点击节头：手风琴互斥——目标节展开，其余自动收起（点已展开节则全收起） */
  onToggleSection(e) {
    const key = e.currentTarget && e.currentTarget.dataset.key
    if (!key) {return}
    this._sectionExpanded = this._sectionExpanded || {}
    const wasOpen = !!this._sectionExpanded[key]
    const sections = this.data.orderSections || []
    const updates = {}
    sections.forEach((s, i) => {
      const open = (s.key === key) ? !wasOpen : false
      this._sectionExpanded[s.key] = open
      updates['orderSections[' + i + '].expanded'] = open
    })
    this.setData(updates)
  },

  _normalizeOrder(raw) {
    const orderType = raw.orderType || raw.type || 'boarding'
    const status = this._resolveShippingStatus(raw) || raw.status || 'pending_payment'

    if (orderType === 'activity') {
      const endTime = raw.endDate || raw.activityEndTime || ''
      return {
        _id: raw._id,
        orderType,
        orderTitle: raw.activityTitle || '活动订单',
        activityId: raw.activityId || '',
        activityCoverUrl: raw.activityCoverUrl || '',
        activityLocation: raw.activityLocation || '',
        startDate: this._formatDate(raw.startDate || raw.activityStartTime),
        endDate: this._formatDate(endTime),
        _rawEndDate: endTime,
        status,
        statusText: STATUS_TEXT_MAP[status] || status,
        totalPrice: raw.totalPrice || 0,
        createdAt: this._formatDateTime(raw.createdAt),
        phone: raw.phone || '',
        notes: raw.notes || '',
        pets: (raw.petsInfo || []).map(p => ({
          name: p.name || '',
          breed: p.breed || '',
        })),
        isEnded: false,
      }
    }

    if (orderType === 'mall') {
      const items = Array.isArray(raw.items) ? raw.items : []
      return {
        _id: raw._id,
        orderType,
        orderTitle: raw.productName || '商城订单',
        productCoverUrl: raw.productImage || '',
        skuText: raw.skuText || '',
        unitPrice: raw.unitPrice || 0,
        quantity: raw.quantity || 1,
        // P1-C: 合并单 items 提示（列表显示"首件 ×N 等 M 件"）
        itemCount: items.length,
        hasMultiItems: items.length > 1,
        status,
        statusText: LOGISTICS_STATUS_TEXT_MAP[status] || status,
        totalPrice: raw.totalAmount || 0,
        createdAt: this._formatDateTime(raw.createdAt),
        receiverName: raw.receiverName || '',
        receiverPhone: raw.receiverPhone || '',
        receiverAddress: raw.receiverAddress || '',
        orderNo: raw.orderNo || '',
        isEnded: false,
      }
    }

    if (orderType === 'group_buy') {
      return {
        _id: raw._id,
        orderType,
        orderTitle: raw.productName || '团购订单',
        productCoverUrl: raw.productImage || '',
        unitPrice: raw.unitPrice || 0,
        quantity: raw.quantity || 1,
        status,
        statusText: LOGISTICS_STATUS_TEXT_MAP[status] || status,
        totalPrice: raw.totalAmount || 0,
        createdAt: this._formatDateTime(raw.createdAt),
        receiverName: raw.receiverName || '',
        receiverPhone: raw.receiverPhone || '',
        receiverAddress: raw.receiverAddress || '',
        orderNo: raw.orderNo || '',
        isEnded: false,
      }
    }

    if (orderType === 'feeding' || raw.orderType === 'feeding') {
      const petNames = (raw.petDetails || []).map(p => p.name || '').filter(Boolean).join('、')
      const serviceDates = raw.petServices
        ? Object.values(raw.petServices).flatMap(svc => (svc.serviceDates || []).map(d => d.shortDate || d.date)).filter(Boolean)
        : []
      const dateRange = serviceDates.length > 0
        ? serviceDates.join('、')
        : (raw.startDate || '')
      return {
        _id: raw._id,
        orderType: 'feeding',
        orderTitle: petNames ? `${petNames}的喂养服务` : '上门喂养服务',
        status,
        statusText: STATUS_TEXT_MAP[status] || status,
        totalPrice: raw.totalAmount || raw.totalPrice || 0,
        originalAmount: raw.originalAmount || 0,
        couponDiscount: raw.couponDiscount || 0,
        createdAt: this._formatDateTime(raw.createdAt),
        startDate: this._formatDate(raw.startDate),
        endDate: this._formatDate(raw.endDate),
        dateRange,
        address: this._stringifyAddress(raw.address),
        notes: raw.notes || '',
        keyMethod: raw.keyMethod || '',
        visitTime: raw.visitTime || '',
        familiarityText: raw.familiarityText || '',
        multiVisitText: raw.multiVisitText || '',
        petDetails: raw.petDetails || [],
        orderNo: raw.orderNo || '',
        isEnded: false,
      }
    }

    return {
      _id: raw._id,
      orderType,
      orderTitle: raw.hostName || '寄养订单',
      status,
      statusText: STATUS_TEXT_MAP[status] || status,
      totalPrice: raw.totalPrice || 0,
      createdAt: this._formatDateTime(raw.createdAt),
      startDate: this._formatDate(raw.startDate),
      endDate: this._formatDate(raw.endDate),
      isEnded: false,
    }
  },

  _formatDate(dateValue) { return formatDate(dateValue) },

  /**
   * 把地址字段归一化为字符串。
   * 历史订单曾把整个地址对象存进 address 字段，直接渲染会得到 [object Object]。
   * - 字符串：原样返回
   * - 对象：优先取 fullAddress；否则按 province+city+district+detail 拼接
   * - 其他：返回空串
   */
  _stringifyAddress(addr) {
    if (!addr) {return ''}
    if (typeof addr === 'string') {return addr}
    if (typeof addr === 'object') {
      if (typeof addr.fullAddress === 'string' && addr.fullAddress) {return addr.fullAddress}
      return [addr.province, addr.city, addr.district, addr.detail]
        .filter(v => v && typeof v === 'string')
        .join('')
    }
    return ''
  },

  _formatDateTime(dateValue) { return formatDateTime(dateValue) },

  _parseDate(dateValue) { return parseDate(dateValue) },

  /**
   * 兜底识别 wx 平台"发货管理"标记：返回归一化状态 'shipped'，未识别则返回 ''
   *
   * 微信小程序 https://mp.weixin.qq.com/wxamp/order 后台发货后，订单在我们后端
   * 仍是 paid（不会自动回写），但通过 wx getOrder 接口可识别。
   * _enrichWxShippingStatus 会把 wxOrderState / wxShipping 字段附加到订单上，
   * 这里直接读取。
   */
  _resolveShippingStatus(raw) {
    if (!raw) {return ''}
    if (raw.status === 'shipped' || raw.status === 'completed' || raw.status === 'cancelled') {
      return ''
    }
    // wx 平台发货状态：order_state === 2 表示已发货，3/4 表示已确认收货/交易完成
    if (raw._wxOrderState != null) {
      if (raw._wxOrderState === 2 || raw._wxOrderState === 3 || raw._wxOrderState === 4) {
        return 'shipped'
      }
    }
    if (raw._wxShipping && raw._wxShipping.finish_shipping === true) {return 'shipped'}
    // 兜底：原生字段（如果后端有写）
    const candidateKeys = ['wxShippingState', 'shippingState', 'wxDeliveryStatus', 'deliveryState', 'wxShipped', 'isWxShipped']
    for (const key of candidateKeys) {
      const v = raw[key]
      if (v === true) {return 'shipped'}
      if (v === 1 || v === '1') {return 'shipped'}
      if (typeof v === 'string' && /^(shipped|delivered|已发货)$/i.test(v)) {return 'shipped'}
    }
    if (raw.shippedAt && raw.status === 'paid') {
      return 'shipped'
    }
    return ''
  },

  /**
   * 对 mall / group 订单中"已付款但未在我们后端发货"的订单，调 wx getOrder
   * 批量查询发货状态，把结果写到订单的 _wxOrderState / _wxShipping 字段。
   * 失败/超时静默降级，不影响页面主流程。
   */
  async _enrichWxShippingStatus() {
    if (!this._allOrders || this._allOrders.length === 0) {return}
    const targets = this._allOrders.filter(o => {
      if (o.orderType !== 'mall' && o.orderType !== 'group_buy') {return false}
      return o.status === 'paid'
    })
    if (targets.length === 0) {return}

    // 按 orderType 拆分批量查询（mall 和 group_buy 集合不同）
    const groups = { mall: [], group_buy: [] }
    for (const t of targets) {
      const k = t.orderType === 'group_buy' ? 'group_buy' : 'mall'
      groups[k].push(t._id)
    }
    const tasks = []
    for (const k of Object.keys(groups)) {
      const ids = groups[k]
      // 单次最多 50 个（后端限制），超出时分批
      for (let i = 0; i < ids.length; i += 50) {
        const chunk = ids.slice(i, i + 50)
        tasks.push(
          OrderService.getWxShippingStatus({ orderIds: chunk, orderType: k })
            .then(res => {
              if (!res || res.code !== 0 || !res.data || !Array.isArray(res.data.items)) {return}
              for (const it of res.data.items) {
                const order = this._allOrders.find(o => o._id === it.orderId)
                if (!order) {continue}
                order._wxOrderState = it.order_state
                order._wxShipping = it.shipping
                order._wxCheckedAt = Date.now()
                // 立即重算该订单的 status
                const newStatus = this._resolveShippingStatus(order)
                if (newStatus && newStatus !== order.status) {
                  order.status = newStatus
                  if (order.orderType === 'mall') {
                    order.statusText = LOGISTICS_STATUS_TEXT_MAP[newStatus] || newStatus
                  } else if (order.orderType === 'group_buy') {
                    order.statusText = LOGISTICS_STATUS_TEXT_MAP[newStatus] || newStatus
                  } else {
                    order.statusText = STATUS_TEXT_MAP[newStatus] || newStatus
                  }
                }
              }
            })
            .catch(() => {/* 静默降级 */})
        )
      }
    }
    await Promise.all(tasks)
  },

  /**
   * _recountOrders：wx 状态增强后，重新检查所有订单的 status。
   * 用于 _enrichWxShippingStatus 完成后触发整体重算。
   * 注意：只修改内存中的 order.status，UI 更新交给后续 _regroup。
   */
  _recountOrders() {
    if (!this._allOrders) {return}
    for (const order of this._allOrders) {
      if (order.orderType !== 'mall' && order.orderType !== 'group_buy') {continue}
      if (order._wxOrderState == null && !order._wxShipping) {continue}
      const newStatus = this._resolveShippingStatus(order)
      if (newStatus && newStatus !== order.status) {
        order.status = newStatus
        if (order.orderType === 'mall') {
          order.statusText = LOGISTICS_STATUS_TEXT_MAP[newStatus] || newStatus
        } else if (order.orderType === 'group_buy') {
          order.statusText = LOGISTICS_STATUS_TEXT_MAP[newStatus] || newStatus
        } else {
          order.statusText = STATUS_TEXT_MAP[newStatus] || newStatus
        }
      }
    }
  },

  _calcStats() {
    const orders = this._allOrders || []
    const PAID_STATUSES = [
      'paid', 'confirmed', 'in_progress', 'completed',
      'shipped',
    ]
    const paidOrders = orders.filter(o => PAID_STATUSES.includes(o.status))
    const count = paidOrders.length
    const amount = paidOrders.reduce((sum, o) => sum + (o.totalPrice || 0), 0)
    const completedOrders = orders.filter(o => o.status === 'completed' || (o.isEnded && PAID_STATUSES.includes(o.status)))
    const completedCount = completedOrders.length
    const completedAmount = completedOrders.reduce((sum, o) => sum + (o.totalPrice || 0), 0)

    this.setData({
      stats: { count, amount, completedCount, completedAmount },
    })
  },



  onOrderTap(e) {
    const orderId = e.currentTarget.dataset.id
    const order = this.data.orders.find(o => o._id === orderId)
    if (!order) {return}
    if (order.orderType === 'mall' || order.orderType === 'group_buy') {
      wx.navigateTo({ url: `/subpackages/profile/mall-order-detail/index?id=${orderId}` })
    } else if (order.orderType === 'activity') {
      if (order.isEnded && order.status === 'pending_payment') {
        this.error('ACTIVITY_EXPIRED_PAYMENT_TEXT')
        return
      }
      wx.navigateTo({ url: `/subpackages/activity/payment?registrationId=${orderId}` })
    } else if (order.orderType === 'feeding') {
      wx.navigateTo({ url: `/subpackages/feeding/order-status?orderId=${orderId}` })
    } else {
      wx.navigateTo({ url: `/subpackages/profile/order-detail/index?id=${orderId}` })
    }
  },

  onCancelMallOrder(e) {
    const orderId = e.currentTarget.dataset.id
    if (!orderId) {return}
    // 注意：showModal 的 success 回调必须传；否则用户点"确定"后只关闭弹窗，
    // 真正的取消操作不会触发——和之前 mall-order-detail 的 onConfirmReceive
    // 是同一种 anti-pattern。
    this.showModal({
      titleKey: 'BIZ_B1DRZ9',
      contentKey: 'BIZ_1DLBP94',
      success: (confirmed) => {
        if (!confirmed) {return}
        this._doCancelMallOrder(orderId)
      },
    })
  },

  async _doCancelMallOrder(orderId) {
    try {
      const target = (this._allOrders || []).find(o => o._id === orderId)
      // P1-2: 团购订单走 tuanService.cancelTuanOrder（含 tuan_orders 同步 + 库存回退 + 退款）
      const res = target && target.orderType === 'group_buy'
        ? await TuanService.cancelTuanOrder(orderId)
        : await OrderService.cancelMallOrder(orderId)
      if (res && res.code === 0) {
        this.toast('CANCEL_SUCCESS')
        // 刷新列表：本地内存中把该订单 status 改为 cancelled
        if (target) {
          target.status = 'cancelled'
          if (target.orderType === 'mall') {
            target.statusText = LOGISTICS_STATUS_TEXT_MAP.cancelled
          } else if (target.orderType === 'group_buy') {
            target.statusText = LOGISTICS_STATUS_TEXT_MAP.cancelled
          } else {
            target.statusText = STATUS_TEXT_MAP.cancelled
          }
        }
        this._calcStats()
        this._regroup()
        // 异步从云端再拉一次最新状态，保证强一致
        // （同步更新节流时间戳，避免紧随其后的一次 onShow 被节流窗口挡住）
        this._lastLoadedAt = Date.now()
        this._loadOrders().catch(() => {/* 静默降级 */})
      } else {
        this.errorDynamic((res && res.message) || '', 'CANCEL_FAILED')
      }
    } catch (err) {
      this.errorDynamic((err && err.message) || '', 'CANCEL_FAILED')
    }
  },

  onPullDownRefresh() {
    // 手动下拉刷新不受 30s 节流限制，始终立即生效
    this._lastLoadedAt = Date.now()
    this._loadOrders().then(() => wx.stopPullDownRefresh()).catch(() => wx.stopPullDownRefresh())
  },
})
