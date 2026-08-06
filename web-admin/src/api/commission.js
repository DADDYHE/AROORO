import { callAction } from './index'

export function getCommissionList(params) { return callAction('getCommissionList', params) }
export function settleCommissions(ids) { return callAction('settleCommissions', { ids }) }
