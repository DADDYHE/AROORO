import { callAction } from './index'
export function getPendingHostReviews() { return callAction('getPendingHostReviews') }
export function reviewHost(data) { return callAction('reviewHost', data) }
export function getActiveHosts(params) { return callAction('getActiveHosts', params) }
export function toggleHostStatus(hostId, status) { return callAction('toggleHostStatus', { hostId, status }) }
export function toggleHostAccepting(hostId, isAccepting) { return callAction('toggleHostAccepting', { hostId, isAccepting }) }
export function getBoardingOrders(params) { return callAction('getBoardingOrders', params) }
