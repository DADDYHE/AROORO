/**
 * 分享工具
 *
 * 设计原则：
 * - 普通用户（isPartner=false 且 permissions 空）不能带 inviterId
 * - 合伙人（isPartner=true 或 permissions 非空）带自己的 openid 作为 inviterId
 * - 合伙人页（partner/ 子包）不提供分享（普通用户无法访问，无意义）
 *
 * 双重语义已去除：所有页面统一通过 getInviterId()/buildSharePath() 决定是否带 inviterId。
 */

const app = getApp()

/**
 * 获取当前用户作为邀请人的 ID
 * @returns {string} 合伙人 → openid；普通用户 → ''
 */
function getInviterId() {
  const userInfo = (app && app.globalData) ? app.globalData.userInfo : null
  if (!userInfo) {return ''}
  const isPartner = Boolean(userInfo.isPartner || (userInfo.permissions && userInfo.permissions.length))
  return isPartner && userInfo.openid ? userInfo.openid : ''
}

/**
 * 构造分享 path：合伙人时附加 inviterId，普通用户时不附加
 * @param {string} path 分享目标页面路径
 * @returns {string} 带 query 的完整路径
 */
function buildSharePath(path) {
  const inviterId = getInviterId()
  if (!inviterId) { return path }
  const separator = path.includes('?') ? '&' : '?'
  return `${path}${separator}inviterId=${inviterId}`
}

/**
 * 构造朋友圈分享 query 串：合伙人时附加 inviterId，普通用户时不附加
 * @param {string} baseQuery 已有 query（如 "id=xxx"），可不传
 * @returns {string} 完整 query 串（无前导 ?）
 */
function buildShareQuery(baseQuery) {
  const inviterId = getInviterId()
  if (!inviterId) {return baseQuery || ''}
  return baseQuery ? `${baseQuery}&inviterId=${inviterId}` : `inviterId=${inviterId}`
}

module.exports = { getInviterId, buildSharePath, buildShareQuery }
