import { callAction } from './index'
export function getUserList(params) { return callAction('getUserList', params) }
export function getUserDetail(targetOpenid) { return callAction('getUserDetail', { targetOpenid }) }
export function updateUserStatus(targetOpenid, status) { return callAction('updateUserStatus', { targetOpenid, status }) }
