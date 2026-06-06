import { callAction } from './index'
export function getBannerList(params) { return callAction('getBannerList', params) }
export function createBanner(data) { return callAction('createBanner', data) }
export function updateBanner(data) { return callAction('updateBanner', data) }
export function updateBannerStatus(bannerId, status) { return callAction('updateBannerStatus', { bannerId, status }) }
export function deleteBanner(bannerId) { return callAction('deleteBanner', { bannerId }) }
