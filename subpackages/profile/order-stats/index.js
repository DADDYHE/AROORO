const { orderManager, ORDER_EVENTS } = require('../../../services/OrderManager')
const { OrderService } = require('../../../services/CloudFunctionService')
const cloudImageBehavior = require('../../../behaviors/cloudImageBehavior')

const STATUS_TEXT_MAP = {
  pending: '待确认',
  pending_payment: '待付款',
  paid: '已付款',
  confirmed: '已确认',
  in_progress: '进行中',
  ongoing: '进行中',
  completed: '已完成',
  cancelled: '已取消',
}

const MALL_STATUS_TEXT_MAP = {
  pending_payment: '待付款',
  pending_shipment: '待发货',
  shipped: '已发货',
  completed: '已完成',
  cancelled: '已取消',
}

const GROUP_STATUS_TEXT_MAP = {
  pending_payment: '待付款',
  pending_shipment: '待发货',
  shipped: '已发货',
  completed: '已完成',
  cancelled: '已取消',
}

const TYPE_MAP = {
  activity: { title: '活动订单', label: '活动' },
  service: { title: '服务订单', label: '服务' },
  group: { title: '团购订单', label: '团购' },
  boarding: { title: '寄养订单', label: '寄养' },
  mall: { title: '商城订单', label: '商城' },
}

const MALL_STATUS_TABS = [
  { key: 'all', label: '全部' },
  { key: 'pending_payment', label: '待支付' },
  { key: 'shipped', label: '已发货' },
  { key: 'completed', label: '已完成' },
  { key: 'cancelled', label: '已取消' },
]

const GROUP_STATUS_TABS = [
  { key: 'all', label: '全部' },
  { key: 'pending_payment', label: '待支付' },
  { key: 'shipped', label: '已发货' },
  { key: 'completed', label: '已完成' },
  { key: 'cancelled', label: '已取消' },
]

const DEFAULT_STATUS_TABS = [
  { key: 'all', label: '全部' },
  { key: 'pending_payment', label: '待支付' },
  { key: 'in_progress', label: '进行中' },
  { key: 'completed', label: '已完成' },
  { key: 'cancelled', label: '已取消' },
]

const pageI18n = require('../../../utils/page-i18n.js')

Page({
  ...pageI18n.mixin(),
  behaviors: [cloudImageBehavior],
  data: {
    orders: [],
    orderType: 'boarding',
    currentStatus: 'all',
    isLoggedIn: false,
    isLoading: false,
    total: 0,
    page: 1,
    stats: { count: 0, amount: 0, completedCount: 0, completedAmount: 0 },
    statusTabs: DEFAULT_STATUS_TABS,
    iconMapPin: 'cloud://cloudbase-d7getcjqy33b13475.636c-cloudbase-d7getcjqy33b13475-1433773870/icons/map-pin-line.svg',
    iconTimeLine: 'cloud://cloudbase-d7getcjqy33b13475.636c-cloudbase-d7getcjqy33b13475-1433773870/icons/time-line.svg',
  },

  onLoad(options) {
    if (options.outTradeNo) {
      wx.redirectTo({ url: `/subpackages/profile/order-detail/index?outTradeNo=${options.outTradeNo}` })
      return
    }

    const orderType = options.type || 'boarding'
    const typeInfo = TYPE_MAP[orderType] || TYPE_MAP.boarding
    wx.setNavigationBarTitle({ title: typeInfo.title })
    const statusTabs = orderType === 'mall' ? MALL_STATUS_TABS : orderType === 'group' ? GROUP_STATUS_TABS : DEFAULT_STATUS_TABS
    this.setData({ orderType, statusTabs })

    this._allOrders = []
    this._syncLoginStatus()
    this._orderUnsub = orderManager.on(ORDER_EVENTS.LIST_UPDATED, () => {
      this._loadOrders()
    })
  },

  onShow() {
    this._syncLoginStatus()
    if (this.data.isLoggedIn) {
      this._loadOrders()
    } else {
      console.warn('[order-stats] 未登录，跳过加载订单')
    }
  },

  onUnload() {
    if (this._orderUnsub) this._orderUnsub()
  },

  _syncLoginStatus() {
    const app = getApp()
    const isLoggedIn = !!(app.globalData && app.globalData.isLoggedIn)
    this.setData({ isLoggedIn })
  },

  async _loadOrders() {
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
        if (!item || !item._id) return null
        const normalized = this._normalizeOrder(item)
        if (!normalized) return null
        if (orderType === 'activity' && normalized.orderType !== 'activity') return null
        if (orderType === 'service' && !['feeding', 'service'].includes(normalized.orderType)) return null
        if (orderType === 'group' && normalized.orderType !== 'group_buy') return null
        if (orderType === 'boarding' && !['boarding', 'hosting'].includes(normalized.orderType)) return null
        if (orderType === 'mall' && normalized.orderType !== 'mall') return null
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
      this._applyFilter()
    } catch (error) {
      this.setData({ isLoading: false })
    }
  },

  _applyFilter() {
    const { currentStatus, orderType } = this.data
    const filtered = this._allOrders.filter(item => {
      if (orderType === 'activity') {
        if (currentStatus === 'pending_payment' && (item.status !== 'pending_payment' || item.isEnded)) return false
        if (currentStatus === 'in_progress' && (item.isEnded || item.status === 'pending_payment')) return false
        if (currentStatus === 'completed' && (!item.isEnded || item.status === 'pending_payment' || item.status === 'cancelled')) return false
        if (currentStatus === 'cancelled' && item.status !== 'cancelled' && !(item.status === 'pending_payment' && item.isEnded)) return false
      } else if (orderType === 'mall' || orderType === 'group') {
        if (currentStatus === 'pending_payment' && item.status !== 'pending_payment') return false
        if (currentStatus === 'shipped' && item.status !== 'shipped') return false
        if (currentStatus === 'completed' && item.status !== 'completed') return false
        if (currentStatus === 'cancelled' && item.status !== 'cancelled') return false
      } else {
        if (currentStatus === 'pending_payment' && item.status !== 'pending_payment') return false
        if (currentStatus === 'in_progress' && item.status !== 'in_progress' && item.status !== 'ongoing' && item.status !== 'confirmed' && item.status !== 'paid') return false
        if (currentStatus === 'completed' && item.status !== 'completed') return false
        if (currentStatus === 'cancelled' && item.status !== 'cancelled') return false
      }
      return true
    })
    this.setData({ orders: filtered })
  },

  _normalizeOrder(raw) {
    const orderType = raw.orderType || raw.type || 'boarding'
    const status = raw.status || 'pending'

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
      return {
        _id: raw._id,
        orderType,
        orderTitle: raw.productName || '商城订单',
        productCoverUrl: raw.productImage || '',
        skuText: raw.skuText || '',
        unitPrice: raw.unitPrice || 0,
        quantity: raw.quantity || 1,
        status,
        statusText: MALL_STATUS_TEXT_MAP[status] || status,
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
        statusText: GROUP_STATUS_TEXT_MAP[status] || status,
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
        address: raw.address || '',
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

  _formatDate(dateValue) {
    if (!dateValue) return ''
    const date = this._parseDate(dateValue)
    if (!date) return String(dateValue)
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  },

  _formatDateTime(dateValue) {
    if (!dateValue) return ''
    const date = this._parseDate(dateValue)
    if (!date) return String(dateValue)
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    const h = String(date.getHours()).padStart(2, '0')
    const min = String(date.getMinutes()).padStart(2, '0')
    return `${y}-${m}-${d} ${h}:${min}`
  },

  _parseDate(dateValue) {
    if (!dateValue) return null
    if (dateValue instanceof Date) {
      return isNaN(dateValue.getTime()) ? null : dateValue
    }
    if (typeof dateValue === 'number') {
      return new Date(dateValue)
    }
    if (typeof dateValue === 'string') {
      if (/^\d+$/.test(dateValue)) {
        return new Date(parseInt(dateValue, 10))
      }
      const normalized = dateValue.replace(/-/g, '/')
      const normParsed = new Date(normalized)
      if (!isNaN(normParsed.getTime())) return normParsed
      const direct = new Date(dateValue)
      if (!isNaN(direct.getTime())) return direct
    }
    if (typeof dateValue === 'object') {
      if (dateValue.$date != null) return this._parseDate(dateValue.$date)
      if (dateValue.timestamp != null) return this._parseDate(dateValue.timestamp)
      if (typeof dateValue.getTime === 'function') {
        const t = dateValue.getTime()
        if (!isNaN(t)) return new Date(t)
      }
    }
    return null
  },

  _calcStats() {
    const orders = this._allOrders || []
    const PAID_STATUSES = [
      'paid', 'confirmed', 'in_progress', 'ongoing', 'completed',
      'pending_shipment', 'shipped',
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

  switchStatus(e) {
    const status = e.currentTarget.dataset.status
    this.setData({ currentStatus: status, page: 1 })
    this._applyFilter()
  },

  onOrderTap(e) {
    const orderId = e.currentTarget.dataset.id
    const order = this.data.orders.find(o => o._id === orderId)
    if (!order) return
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
    if (!orderId) return

    this.showModal({ titleKey: 'BIZ_B1DRZ9', contentKey: 'BIZ_1DLBP94' })
  },

  onPullDownRefresh() {
    this._loadOrders().then(() => wx.stopPullDownRefresh()).catch(() => wx.stopPullDownRefresh())
  },
})
