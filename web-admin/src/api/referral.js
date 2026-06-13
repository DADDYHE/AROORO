import { callAction } from './index'
export function getReferralStats(params) { return callAction('getReferralStats', params) }
export function getReferralList(params) { return callAction('getReferralList', params) }
export function getReferralOrders(params) { return callAction('getReferralOrders', params) }
export function getReferralOrderStats(params) { return callAction('getReferralOrderStats', params) }
export function getInvitedUsersByAdmin(params) { return callAction('getInvitedUsersByAdmin', params) }
export function getPartnerCommissionRates(params) { return callAction('getPartnerCommissionRates', params) }
export function updatePartnerCommissionRates(params) { return callAction('updatePartnerCommissionRates', params) }
