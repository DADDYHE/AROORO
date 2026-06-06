const ENV_ID = process.env.ENV_ID || process.env.CLOUDBASE_ENV || ''
const APP_ID = process.env.APP_ID || process.env.WECHAT_APPID || ''
const JWT_SECRET = process.env.JWT_SECRET || ''
const IS_PRODUCTION = process.env.ENV === 'production'

const WECHAT_PAY = {
  appId: process.env.WECHAT_APPID || APP_ID,
  mchId: process.env.WECHAT_MCHID || '',
  serialNo: process.env.WECHAT_SERIAL_NO || '',
  privateKey: process.env.WECHAT_PRIVATE_KEY || '',
  notifyUrl: process.env.WECHAT_NOTIFY_URL || '',
  certificate: process.env.WECHAT_PAY_CERTIFICATE || '',
  apiV3Key: process.env.WECHAT_API_V3_KEY || '',
}

// =====================================================================
// 外部 API 端点配置（Sprint 17：硬编码 URL 收口）
// 目的：把代码中所有硬编码的 https://... 集中到 config，
//       便于多环境切换、灰度切流、灾备切换
// =====================================================================
const ENDPOINTS = {
  // 微信支付 v3 API 基础域名
  WECHAT_PAY_API_BASE: process.env.WECHAT_PAY_API_BASE || 'https://api.mch.weixin.qq.com',
  // 微信支付 v3 业务路径
  WECHAT_PAY_JSAPI: '/v3/pay/transactions/jsapi',
  WECHAT_PAY_REFUND: '/v3/refund/domestic/refunds',
  // 微信支付 v2 兼容接口（activityService/index.js 仍在使用）
  WECHAT_PAY_UNIFIEDORDER: '/pay/unifiedorder',
  // 留作扩展：腾讯云对象存储 / CDN 域名（未来静态资源统一入口）
  COS_BASE: process.env.COS_BASE || '',
  CDN_BASE: process.env.CDN_BASE || '',
}

const CLOUDBASE = {
  env: ENV_ID,
  appid: APP_ID,
  secret: process.env.CLOUDBASE_SECRET || '',
  baseUrl: process.env.CLOUDBASE_BASE_URL || 'https://api.tcloudbasegateway.com/v1/',
  apiKey: process.env.CLOUDBASE_API_KEY || '',
}

module.exports = {
  ENV_ID,
  APP_ID,
  JWT_SECRET,
  IS_PRODUCTION,
  WECHAT_PAY,
  ENDPOINTS,
  CLOUDBASE,
}
