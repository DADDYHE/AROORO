import { callAction } from './index'
export function getTuanDealList(params) { return callAction('getTuanDealList', params) }
export function getTuanDealDetail(id) { return callAction('getTuanDealDetail', { id }) }
export function createTuanDeal(data) { return callAction('createTuanDeal', data) }
export function updateTuanDeal(data) { return callAction('updateTuanDeal', data) }
export function deleteTuanDeal(id) { return callAction('deleteTuanDeal', { id }) }
export function publishTuanDeal(id) { return callAction('publishTuanDeal', { id }) }
export function endTuanDeal(id) { return callAction('endTuanDeal', { id }) }
export function getTuanLeaderList(params) { return callAction('getTuanLeaderList', params) }
