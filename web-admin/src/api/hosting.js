import { callAction } from './index'
export function getPendingHostReviews() { return callAction('getPendingHostReviews') }
export function reviewHost(data) { return callAction('reviewHost', data) }
export function getActiveHosts(params) { return callAction('getActiveHosts', params) }
export function toggleHostStatus(hostId, status) { return callAction('toggleHostStatus', { hostId, status }) }
export function toggleHostAccepting(hostId, accepting) { return callAction('toggleHostAccepting', { hostId, accepting }) }
export function getBoardingOrders(params) { return callAction('getBoardingOrders', params) }
export function handleBoardingOrder(orderId, operation) { return callAction('handleBoardingOrder', { orderId, operation }) }
