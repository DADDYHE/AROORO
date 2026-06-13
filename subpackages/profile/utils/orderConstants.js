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
  paid: '已付款',
  pending_shipment: '待发货',
  shipped: '已发货',
  completed: '已完成',
  cancelled: '已取消',
}

const GROUP_STATUS_TEXT_MAP = {
  pending_payment: '待付款',
  paid: '已付款',
  pending_shipment: '待发货',
  shipped: '已发货',
  completed: '已完成',
  cancelled: '已取消',
}

module.exports = { STATUS_TEXT_MAP, MALL_STATUS_TEXT_MAP, GROUP_STATUS_TEXT_MAP }
