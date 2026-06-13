import { callAction } from './index'

export function getCouponStats(params) {
  return callAction('getCouponStatistics', params)
}
