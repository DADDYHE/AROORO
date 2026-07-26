import { callAction } from './index'
export function getMallOrders(params) { return callAction('getMallOrders', params) }
export function getMallOrderDetail(orderId) { return callAction('getMallOrderDetail', { orderId }) }
export function shipMallOrder(orderId, expressNo, expressCompany) { return callAction('shipMallOrder', { orderId, expressNo, expressCompany }) }
