export const ORDER_STATUS_LABELS = {
  pending_payment: '待支付',
  paid: '已支付',
  confirmed: '已确认',
  in_progress: '进行中',
  pending_shipment: '待发货',
  shipped: '已发货',
  completed: '已完成',
  cancelled: '已取消',
  refunded: '已退款',
  deleted: '已删除',
  rejected: '已拒绝',
}

export const ORDER_STATUS_TAG_TYPE = {
  pending_payment: 'warning',
  paid: 'primary',
  confirmed: 'primary',
  in_progress: '',
  pending_shipment: 'warning',
  shipped: '',
  completed: 'success',
  cancelled: 'info',
  refunded: 'info',
  deleted: 'info',
  rejected: 'danger',
}

export const PAYMENT_STATUS_LABELS = {
  unpaid: '未支付',
  paying: '支付中',
  paid: '已支付',
  refunded: '已退款',
  closed: '已关闭',
}

export const PAYMENT_STATUS_TAG_TYPE = {
  unpaid: 'info',
  paying: 'warning',
  paid: 'success',
  refunded: 'info',
  closed: 'info',
}

export const WITHDRAWAL_STATUS_LABELS = {
  pending: '待审核',
  processing: '转账中',
  approved: '待人工转账',
  completed: '已完成',
  rejected: '已拒绝',
}

export const HOST_SERVICE_STATUS_LABELS = {
  pending_review: '待审核',
  active: '正常',
  suspended: '已暂停',
  inactive: '已停用',
  disabled: '已停用',
  rejected: '已拒绝',
}

export const ORDER_TYPE_LABELS = {
  all: '全部',
  boarding: '寄养',
  mall: '商城',
  feeding: '上门服务',
  tuan: '团购',
  activity: '活动',
  group_buy: '团购',
  hosting: '寄养',
}

export const SIDEBAR_MENUS = [
  { title: '数据看板', icon: 'DataAnalysis', path: '/dashboard' },

  { type: 'section', title: '商品与内容' },
  { title: '商品和团购', icon: 'Goods', path: '/product-menu', children: [
    { title: '团购列表', path: '/tuan/list' },
    { title: '商品列表', path: '/product' },
    { title: '分类管理', path: '/product/category' },
  ] },
  { title: '优惠券', icon: 'Ticket', path: '/coupon', children: [
    { title: '模板管理', path: '/coupon' },
    { title: '优惠券统计', path: '/coupon/stats' },
  ] },
  { title: '轮播图管理', icon: 'Picture', path: '/banner' },

  { type: 'section', title: '订单' },
  { title: '全部订单', icon: 'List', path: '/order' },
  { title: '取消订单', icon: 'CircleClose', path: '/order/cancelled' },
  { title: '订单统计', icon: 'TrendCharts', path: '/order/stats' },
  { title: '订单类型', icon: 'Operation', path: '/order-type-menu', children: [
    { title: '商城订单', path: '/order/mall' },
    { title: '团购订单', path: '/order/tuan' },
    { title: '上门服务订单', path: '/order/feeding' },
    { title: '寄养订单', path: '/order/boarding' },
    { title: '活动订单', path: '/order/activity' },
  ] },

  { type: 'section', title: '运营' },
  { title: '寄养管理', icon: 'House', path: '/hosting', children: [
    { title: '家庭审核', path: '/hosting/review' },
    { title: '档案管理', path: '/hosting/profile' },
  ] },
  { title: '合作伙伴管理', icon: 'Share', path: '/referral', children: [
    { title: '审批中心', path: '/admin/approval' },
    { title: '伙伴管理', path: '/referral' },
  ] },

  { type: 'section', title: '财务与用户' },
  { title: '用户管理', icon: 'User', path: '/user' },
  { title: '营收情况', icon: 'Money', path: '/finance' },
  { title: '提现审核', icon: 'WalletFilled', path: '/withdrawal' },
]
