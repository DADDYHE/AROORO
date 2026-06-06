import { callAction } from './index'

export function webLogin(username, password) {
  return callAction('webLogin', { username, password })
}

export function createScanLogin() {
  return callAction('createScanLogin', {}, { silent: true })
}

export function pollScanLogin(loginToken) {
  return callAction('pollScanLogin', { loginToken }, { silent: true })
}

export function getAdminInfo() {
  return callAction('checkAuth')
}
