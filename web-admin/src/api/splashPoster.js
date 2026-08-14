import { callAction } from './index'

export function getSplashPoster() { return callAction('getSplashPoster') }
export function updateSplashPoster(data) { return callAction('updateSplashPoster', data) }
