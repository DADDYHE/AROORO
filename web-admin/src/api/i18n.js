import { callAction } from './index'

export function listI18nOverrides(params) { return callAction('listI18nOverrides', params) }
export function upsertI18nOverride(data) { return callAction('upsertI18nOverride', data) }
export function deleteI18nOverride(overrideId) { return callAction('deleteI18nOverride', { overrideId }) }
export function toggleI18nOverrideStatus(overrideId, status) { return callAction('toggleI18nOverrideStatus', { overrideId, status }) }
