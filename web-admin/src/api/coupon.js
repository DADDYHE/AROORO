import { callAction } from './index'
export function getTemplateList(params) { return callAction('getTemplateList', params) }
export function getTemplateDetail(templateId) { return callAction('getTemplateDetail', { templateId }) }
export function createCouponTemplate(data) { return callAction('createCouponTemplate', data) }
export function updateCouponTemplate(data) { return callAction('updateCouponTemplate', data) }
export function deleteCouponTemplate(templateId) { return callAction('deleteCouponTemplate', { templateId }) }
export function toggleCouponTemplateStatus(templateId, operation) { return callAction('toggleCouponTemplateStatus', { templateId, operation }) }
export function getGrantList(params) { return callAction('getGrantList', params) }
export function createCouponGrant(data) { return callAction('createCouponGrant', data) }
