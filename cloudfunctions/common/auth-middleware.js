const { verifyToken, getTokenFromEvent } = require('./token-utils')
const cloud = require('wx-server-sdk')

/**
 * 云函数身份验证中间件
 * @param {Function} handler - 云函数处理函数
 * @param {Object} options - 配置选项
 * @returns {Function} - 包装后的云函数处理函数
 */
function authMiddleware(handler, options = {}) {
  // 默认配置
  const defaultOptions = {
    requireAuth: true, // 是否需要身份验证
    allowTokenOnly: true, // 是否允许只使用token进行身份验证
    allowOpenidOnly: true // 是否允许只使用openid进行身份验证
  }
  
  const config = { ...defaultOptions, ...options }
  
  return async (event, context) => {
    let userInfo = null
    let openid = null
    let userId = null
    let role = null
    
    try {
      // 优先从token获取用户信息
      try {
        const token = getTokenFromEvent(event)
        if (token) {
          console.log('检测到token，开始验证')
          const decodedToken = verifyToken(token)
          openid = decodedToken.openid
          userId = decodedToken.userId
          role = decodedToken.role
          console.log('token验证成功，openid:', openid, 'userId:', userId, 'role:', role)
          
          userInfo = {
            openid: openid,
            userId: userId,
            role: role
          }
        } else if (!config.allowOpenidOnly) {
          console.error('没有检测到token，且不允许只使用openid进行身份验证')
          throw new Error('需要token进行身份验证')
        }
      } catch (tokenError) {
        console.error('token验证失败:', tokenError)
        if (config.allowOpenidOnly) {
          // token验证失败，尝试从wxContext获取openid
          console.log('token验证失败，尝试从wxContext获取openid')
        } else {
          throw new Error('身份验证失败：' + tokenError.message)
        }
      }
      
      // 如果token验证失败或没有token，从wxContext获取openid
      if (!openid && config.allowOpenidOnly) {
        const wxContext = cloud.getWXContext()
        openid = wxContext.OPENID
        console.log('从wxContext获取的openid:', openid)
        
        if (openid) {
          userInfo = {
            openid: openid
          }
        }
      }
      
      // 检查用户是否已登录
      if (config.requireAuth && !openid) {
        return {
          code: -1,
          message: '用户未登录'
        }
      }
      
      // 将用户信息添加到事件对象中，供后续处理函数使用
      event.userInfo = userInfo
      event.openid = openid
      event.userId = userId
      event.role = role
      
      // 调用原始处理函数
      return await handler(event, context)
    } catch (error) {
      console.error('身份验证中间件错误:', error)
      return {
        code: -1,
        message: error.message || '身份验证失败'
      }
    }
  }
}

module.exports = authMiddleware