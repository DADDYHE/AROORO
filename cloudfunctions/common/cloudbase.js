// cloudfunctions/common/cloudbase.js - 腾讯云开发Node.js SDK初始化配置

// 引入腾讯云开发Node.js SDK
const { initialize, CloudBase } = require('@cloudbase/node-sdk')

// 配置1: 使用AppID+Secret初始化方式（推荐用于云函数环境）
const configAppSecret = {
  appid: process.env.CLOUDBASE_APPID || '',
  secret: process.env.CLOUDBASE_SECRET || '',
  env: process.env.CLOUDBASE_ENV || '',
}

// 配置2: 使用API Key初始化方式（适用于需要自定义baseURL的场景）
const configApiKey = {
  baseURL: process.env.CLOUDBASE_BASE_URL || 'https://api.tcloudbasegateway.com/v1/',
  apiKey: process.env.CLOUDBASE_API_KEY || 'your-cloudbase-api-key',
}

// 根据需要选择初始化方式
let cloudbase
if (process.env.CLOUDBASE_USE_API_KEY === 'true' || configApiKey.apiKey !== 'your-cloudbase-api-key') {
  // 使用API Key方式初始化
  cloudbase = new CloudBase(configApiKey)
  console.log('[APP] 腾讯云开发SDK初始化: 使用API Key方式')
} else {
  // 使用AppID+Secret方式初始化（默认）
  cloudbase = initialize(configAppSecret)
  console.log('[APP] 腾讯云开发SDK初始化: 使用AppID+Secret方式')
}

// 导出云开发SDK实例
module.exports = cloudbase

// 导出两种初始化方式，方便特殊场景使用
module.exports.initializeAppSecret = () => initialize(configAppSecret)
module.exports.initializeApiKey = () => new CloudBase(configApiKey)

