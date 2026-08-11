/* eslint-disable */
/** 支付状态：所有订单类型共用 */
export type PaymentStatus = 'unpaid' | 'paying' | 'paid' | 'refunded' | 'closed'

/** 业务状态：统一命名规范 */
export type OrderStatus =
  | 'pending_payment'
  | 'paid'
  | 'confirmed'
  | 'in_progress'
  | 'shipped'
  | 'completed'
  | 'cancelled'
  | 'refunded'
  | 'deleted'
  | 'rejected'

/** 提现状态 */
export type WithdrawalStatus = 'pending' | 'processing' | 'approved' | 'completed' | 'rejected' | 'cancelled'

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: '待支付',
  paid: '已支付',
  confirmed: '已确认',
  in_progress: '进行中',
  shipped: '已发货',
  completed: '已完成',
  cancelled: '已取消',
  refunded: '已退款',
  deleted: '已删除',
  rejected: '已拒绝',
}

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: '未支付',
  paying: '支付中',
  paid: '已支付',
  refunded: '已退款',
  closed: '已关闭',
}

export const WITHDRAWAL_STATUS_LABELS: Record<WithdrawalStatus, string> = {
  pending: '待审核',
  processing: '转账中',
  approved: '待人工转账',
  completed: '已完成',
  rejected: '已拒绝',
  cancelled: '已取消',
}
