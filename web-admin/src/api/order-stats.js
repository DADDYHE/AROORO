import { callAction } from './index'

export function getOrderStats(params) {
  return callAction('getOrderStats', params)
}

export function exportOrders(params) {
  return callAction('exportOrders', params)
}

export function getOrderTrend(params) {
  return callAction('getOrderTrend', params)
}

export function getOrderTypeStats(params) {
  return callAction('getOrderTypeStats', params)
}
