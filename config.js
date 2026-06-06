/**
 * 应用配置入口
 * 从环境配置中导出，供 app.js 等模块使用
 * 仅导出必要的公开配置，敏感/内部字段不暴露
 */
const envConfig = require('./config/env.js')

module.exports = {
  envId: envConfig.envId,
  appId: envConfig.appId,
  imSdkAppId: envConfig.imSdkAppId,
  qqMapKey: envConfig.qqMapKey,
  customerServicePhone: envConfig.customerServicePhone,
}
