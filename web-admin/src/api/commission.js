import { callAction } from './index'

export function getCommissionList(params) { return callAction('getCommissionList', params) }
export function settleCommissions(ids) { return callAction('settleCommissions', { ids }) }
export function inspectPartnerFinance(inviterId) { return callAction('inspectPartnerFinance', { inviterId }) }
export function settleCommissionLegacy(commissionId) { return callAction('settleCommissionLegacy', { commissionId }) }
