import { callAction } from './index'
export function getTuanDealOrders(params) { return callAction('getTuanDealOrders', params) }
export function getTuanDealOrderDetail(orderId) { return callAction('getTuanDealOrderDetail', { orderId }) }
export function handleTuanOrder(orderId, operation, extra = {}) { return callAction('handleTuanOrder', { orderId, operation, ...extra }) }
export function getActivityOrders(params) { return callAction('getActivityOrders', params) }
