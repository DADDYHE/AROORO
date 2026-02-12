// 网络请求工具类，自动携带token

/**
 * 封装网络请求，自动携带token
 * @param {Object} options - 请求配置选项
 * @returns {Promise} - 请求结果的Promise
 */
function request(options) {
  // 获取本地存储的token
  const token = wx.getStorageSync('token')
  
  // 创建请求头
  const header = {
    ...options.header || {},
  }
  
  // 如果有token，添加到请求头
  if (token) {
    header['Authorization'] = `Bearer ${token}`
  }
  
  // 返回微信小程序的网络请求
  return wx.request({
    ...options,
    header: header
  })
}

/**
 * 封装云函数调用，自动携带token
 * @param {Object} options - 云函数调用配置选项
 * @returns {Promise} - 云函数调用结果的Promise
 */
function callCloudFunction(options) {
  // 获取本地存储的token
  const token = wx.getStorageSync('token')
  
  // 创建请求数据
  const data = {
    ...options.data || {},
  }
  
  // 如果有token，添加到请求数据中
  if (token) {
    data.token = token
  }
  
  // 返回微信小程序的云函数调用
  return wx.cloud.callFunction({
    ...options,
    data: data
  })
}

module.exports = {
  request,
  callCloudFunction
}