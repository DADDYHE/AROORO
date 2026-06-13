import { callAction } from './index'
export function getTuanDealOrders(params) { return callAction('getTuanDealOrders', params) }
export function getTuanDealOrderDetail(orderId) { return callAction('getTuanDealOrderDetail', { orderId }) }
export function getActivityOrders(params) { return callAction('getActivityOrders', params) }
