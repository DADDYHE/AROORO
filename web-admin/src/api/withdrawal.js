import { callAction } from './index'
export function getWithdrawalList(params) { return callAction('getWithdrawalList', params) }
export function approveWithdrawal(withdrawalId, mode = 'auto') { return callAction('approveWithdrawal', { withdrawalId, mode }) }
export function rejectWithdrawal(withdrawalId, rejectReason) { return callAction('rejectWithdrawal', { withdrawalId, rejectReason }) }
export function retryTransfer(withdrawalId) { return callAction('retryTransfer', { withdrawalId }) }
export function confirmManualTransfer(data) { return callAction('confirmManualTransfer', data) }
export function getFullPayeeInfo(withdrawalId) { return callAction('getFullPayeeInfo', { withdrawalId }) }
export function getPayoutConfig() { return callAction('getPayoutConfig') }
export function cancelWithdrawal(withdrawalId, reason) { return callAction('cancelWithdrawal', { withdrawalId, reason }) }
export function convertToManual(withdrawalId) { return callAction('convertToManual', { withdrawalId }) }
export function inspectWithdrawal(withdrawalId) { return callAction('inspectWithdrawal', { withdrawalId }) }
export function repairWithdrawalBalance(withdrawalId) { return callAction('repairWithdrawalBalance', { withdrawalId }) }
