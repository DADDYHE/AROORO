import { callAction } from './index'
export function getFeedingOrders(params) { return callAction('getFeedingOrders', params) }
export function handleFeedingOrder(orderId, operation) { return callAction('handleFeedingOrder', { orderId, operation }) }
export function getFeedingOrderDetail(orderId) { return callAction('getFeedingOrderDetail', { orderId }) }
