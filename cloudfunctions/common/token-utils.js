const jwt = require('jsonwebtoken')

// JWT密钥配置
const JWT_SECRET = 'your-secret-key-here' // 与login云函数保持一致

/**
 * 验证token并解析用户信息
 * @param {string} token - JWT token
 * @returns {Object} - 解析后的用户信息，包含openid、userId和role
 */
function verifyToken(token) {
  try {
    if (!token) {
      throw new Error('token不能为空')
    }
    
    const decoded = jwt.verify(token, JWT_SECRET)
    return decoded
  } catch (error) {
    console.error('token验证失败:', error)
    throw error
  }
}

/**
 * 从请求头或请求体中获取token
 * @param {Object} event - 云函数事件对象
 * @returns {string} - token字符串
 */
function getTokenFromEvent(event) {
  // 尝试从请求头获取token
  if (event.headers && event.headers.Authorization) {
    return event.headers.Authorization.replace('Bearer ', '')
  }
  
  // 尝试从请求体获取token
  if (event.data && event.data.token) {
    return event.data.token
  }
  
  // 尝试直接从事件对象获取token
  if (event.token) {
    return event.token
  }
  
  return null
}

/**
 * 生成token
 * @param {Object} userInfo - 用户信息对象，包含openid、userId和role
 * @returns {string} - 生成的JWT token
 */
function generateToken(userInfo) {
  try {
    const token = jwt.sign({
      openid: userInfo.openid,
      userId: userInfo.userId || userInfo.id || userInfo._id,
      role: userInfo.role || 'owner'
    }, JWT_SECRET, { expiresIn: '7d' })
    
    return token
  } catch (error) {
    console.error('生成token失败:', error)
    throw error
  }
}

module.exports = {
  verifyToken,
  getTokenFromEvent,
  generateToken
}