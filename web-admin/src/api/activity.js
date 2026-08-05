import { callAction } from './index'

export function getActivityList(params) { return callAction('getActivityList', params) }
export function getActivityDetail(activityId) { return callAction('getActivityDetail', { activityId }) }
export function createActivity(data) { return callAction('createActivity', data) }
export function updateActivity(data) { return callAction('updateActivity', data) }
export function deleteActivity(activityId) { return callAction('deleteActivity', { activityId }) }
export function getActivityRegistrations(params) { return callAction('getActivityRegistrations', params) }
export function exportActivityRegistrations(activityId) { return callAction('exportActivityRegistrations', { activityId }) }
export function getActivityOrders(params) { return callAction('getActivityOrders', params) }
export function getActivityOrderDetail(orderId) { return callAction('getActivityOrderDetail', { orderId }) }
