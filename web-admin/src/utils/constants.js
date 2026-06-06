export const ORDER_STATUS_LABELS = {
  pending: '待确认',
  paid: '已支付',
  confirmed: '已确认',
  in_progress: '进行中',
  completed: '已完成',
  cancelled: '已取消',
  pending_payment: '待支付',
  shipped: '已发货',
  rejected: '已拒绝',
  refunded: '已退款',
}

export const ORDER_STATUS_TAG_TYPE = {
  pending: 'warning',
  paid: 'primary',
  confirmed: 'primary',
  in_progress: '',
  completed: 'success',
  cancelled: 'info',
  pending_payment: 'warning',
  shipped: '',
  rejected: 'danger',
  refunded: 'info',
}

export const PAYMENT_STATUS_LABELS = {
  unpaid: '未支付',
  pending: '支付中',
  paid: '已支付',
  refunded: '已退款',
  failed: '支付失败',
}

export const PAYMENT_STATUS_TAG_TYPE = {
  unpaid: 'info',
  pending: 'warning',
  paid: 'success',
  refunded: 'info',
  failed: 'danger',
}

export const WITHDRAWAL_STATUS_LABELS = {
  pending: '待审核',
  approved: '已通过',
  processing: '处理中',
  completed: '已完成',
  rejected: '已拒绝',
}

export const HOST_SERVICE_STATUS_LABELS = {
  pending_review: '待审核',
  active: '正常',
  suspended: '已暂停',
  inactive: '已停用',
  rejected: '已拒绝',
}

export const SIDEBAR_MENUS = [
  { title: '数据看板', icon: 'DataAnalysis', path: '/dashboard' },

  { type: 'section', title: '商品与内容' },
  { title: '商品和团购', icon: 'Goods', path: '/product-menu', children: [
    { title: '团购列表', path: '/tuan/list' },
    { title: '商品列表', path: '/product' },
    { title: '分类管理', path: '/product/category' },
  ]},
  { title: '优惠券', icon: 'Ticket', path: '/coupon', children: [
    { title: '模板管理', path: '/coupon' },
    { title: '优惠券统计', path: '/coupon/stats' },
  ]},
  { title: '轮播图管理', icon: 'Picture', path: '/banner' },

  { type: 'section', title: '订单' },
  { title: '全部订单', icon: 'List', path: '/order' },
  { title: '订单统计', icon: 'TrendCharts', path: '/order/stats' },
  { title: '商城订单', icon: 'ShoppingCartFull', path: '/order/mall' },
  { title: '团购订单', icon: 'PriceTag', path: '/order/tuan' },
  { title: '上门服务订单', icon: 'Service', path: '/order/feeding' },
  { title: '寄养订单', icon: 'House', path: '/order/boarding' },
  { title: '活动订单', icon: 'Flag', path: '/order/activity' },

  { type: 'section', title: '运营' },
  { title: '寄养管理', icon: 'House', path: '/hosting', children: [
    { title: '家庭审核', path: '/hosting/review' },
    { title: '档案管理', path: '/hosting/profile' },
  ]},
  { title: '服务师管理', icon: 'UserFilled', path: '/feeding/feeders' },
  { title: '合作伙伴管理', icon: 'Share', path: '/referral', children: [
    { title: '审批中心', path: '/admin/approval' },
    { title: '伙伴管理', path: '/referral' },
  ]},

  { type: 'section', title: '财务与用户' },
  { title: '用户管理', icon: 'User', path: '/user' },
  { title: '营收情况', icon: 'Money', path: '/finance' },
  { title: '提现审核', icon: 'WalletFilled', path: '/withdrawal' },
]
