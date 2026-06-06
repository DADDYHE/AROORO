const jwt = require('jsonwebtoken')
const { JWT_SECRET } = require('./config')
const { err } = require('./errors')

function verifyToken(token) {
  if (!JWT_SECRET) {throw err('INTERNAL_ERROR', 'JWT_SECRET 未配置')}
  if (!token) {throw err('TOKEN_INVALID', 'token 不能为空')}
  try {
    return jwt.verify(token, JWT_SECRET)
  } catch (e) {
    if (e.name === 'TokenExpiredError') {
      throw err('TOKEN_EXPIRED', '登录已过期')
    }
    throw err('TOKEN_INVALID', 'token 无效或已损坏')
  }
}

function getTokenFromEvent(event) {
  if (event.headers && event.headers.Authorization) {
    return event.headers.Authorization.replace('Bearer ', '')
  }
  return null
}

function generateToken(userInfo) {
  if (!JWT_SECRET) {throw new Error('JWT_SECRET 未配置')}
  // users._id = openid，统一使用 openid；超级管理员无 openid，使用 adminId
  const payload = {
    openid: userInfo.openid || '',
    role: userInfo.role || 'owner',
  }
  if (userInfo.adminId) {payload.adminId = userInfo.adminId}
  if (userInfo.roles) {payload.roles = userInfo.roles}
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' })
}

module.exports = { verifyToken, getTokenFromEvent, generateToken }
