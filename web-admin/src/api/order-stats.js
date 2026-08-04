import { callAction } from './index'

export function getOrderStats(params) {
  return callAction('getOrderStats', params)
}

export function getOrderTrend(params) {
  return callAction('getOrderTrend', params)
}
