const BOARDING_ORDER_TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  paid: ['confirmed', 'cancelled'],
  confirmed: ['completed', 'cancelled'],
  in_progress: ['completed'],
}

const FEEDING_ORDER_TRANSITIONS = {
  pending_payment: ['confirmed', 'cancelled'],
  paid: ['confirmed', 'cancelled'],
  pending: ['confirmed', 'rejected', 'cancelled'],
  rejected: ['pending', 'cancelled'],
  confirmed: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
}

const MALL_ORDER_TRANSITIONS = {
  pending_payment: ['confirmed', 'cancelled'],
  paid: ['shipped', 'cancelled'],
  confirmed: ['shipped', 'cancelled'],
  shipped: ['completed'],
}

const HOST_SERVICE_TRANSITIONS = {
  pending_review: ['active', 'rejected'],
  active: ['suspended', 'inactive'],
  suspended: ['active'],
  inactive: ['active'],
  rejected: [],
}

const STATUS_LABELS = {
  pending: '待确认',
  paid: '已支付',
  confirmed: '已确认',
  in_progress: '进行中',
  completed: '已完成',
  cancelled: '已取消',
  pending_payment: '待支付',
  shipped: '已发货',
  pending_review: '待审核',
  active: '已激活',
  suspended: '已暂停',
  inactive: '未激活',
  rejected: '已拒绝',
}

const BOARDING_STATUS_MAP = { confirm: 'confirmed', reject: 'cancelled', complete: 'completed' }
const FEEDING_STATUS_MAP = { confirm: 'confirmed', reject: 'rejected', complete: 'completed', start: 'in_progress', cancel: 'cancelled' }
const FEEDING_OPERATION_LABELS = { confirm: '确认', reject: '拒绝', complete: '完成', start: '开始', cancel: '取消' }
const MALL_STATUS_MAP = { confirm: 'confirmed', ship: 'shipped', complete: 'completed', cancel: 'cancelled' }

function canTransition(transitions, from, to) {
  const allowed = transitions[from]
  if (!allowed) {return false}
  return allowed.includes(to)
}

function validateTransition(transitions, from, to) {
  if (!canTransition(transitions, from, to)) {
    const fromLabel = STATUS_LABELS[from] || from
    throw new Error(`无法从"${fromLabel}"变更为"${STATUS_LABELS[to] || to}"`)
  }
  return true
}

module.exports = {
  BOARDING_ORDER_TRANSITIONS,
  FEEDING_ORDER_TRANSITIONS,
  MALL_ORDER_TRANSITIONS,
  HOST_SERVICE_TRANSITIONS,
  STATUS_LABELS,
  BOARDING_STATUS_MAP,
  FEEDING_STATUS_MAP,
  FEEDING_OPERATION_LABELS,
  MALL_STATUS_MAP,
  canTransition,
  validateTransition,
}
