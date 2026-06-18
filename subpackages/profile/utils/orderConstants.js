const STATUS_TEXT_MAP = {
  pending_payment: '待支付',
  paid: '已支付',
  confirmed: '已确认',
  in_progress: '进行中',
  completed: '已完成',
  cancelled: '已取消',
  refunded: '已退款',
  deleted: '已删除',
  rejected: '已拒绝',
}

const MALL_STATUS_TEXT_MAP = {
  pending_payment: '待支付',
  paid: '已支付',
  pending_shipment: '待发货',
  shipped: '已发货',
  completed: '已完成',
  cancelled: '已取消',
  refunded: '已退款',
  deleted: '已删除',
}

const GROUP_STATUS_TEXT_MAP = {
  pending_payment: '待支付',
  paid: '已支付',
  pending_shipment: '待发货',
  shipped: '已发货',
  completed: '已完成',
  cancelled: '已取消',
  refunded: '已退款',
  deleted: '已删除',
}

module.exports = { STATUS_TEXT_MAP, MALL_STATUS_TEXT_MAP, GROUP_STATUS_TEXT_MAP }
