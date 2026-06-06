import { callAction } from './index'
export function getWithdrawalList(params) { return callAction('getWithdrawalList', params) }
export function approveWithdrawal(withdrawalId) { return callAction('approveWithdrawal', { withdrawalId }) }
export function rejectWithdrawal(withdrawalId, rejectReason) { return callAction('rejectWithdrawal', { withdrawalId, rejectReason }) }
