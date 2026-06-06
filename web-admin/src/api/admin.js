import { callAction } from './index'
export function getAdminList(params) { return callAction('getAdminList', params) }
export function getAdminDetail(openid) { return callAction('getAdminDetail', { openid }) }
export function updateAdminStatus(openid, status) { return callAction('updateAdminStatus', { openid, status }) }
export function getApplicationList(params) { return callAction('getApplicationList', params) }
export function approveApplication(applicationId) { return callAction('approveApplication', { applicationId }) }
export function rejectApplication(applicationId, reason) { return callAction('rejectApplication', { applicationId, rejectReason: reason }) }
export function getPendingApplicationCount() { return callAction('getApplicationList', { status: 'pending', pageSize: 1 }) }
