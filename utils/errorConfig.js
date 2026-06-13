/**
 * 错误类型与上报配置
 *
 * 为 globalErrorManager.js 提供运行所需的配置常量。
 */

const ERROR_TYPES = {
  JS_ERROR: 'js_error',
  PROMISE_REJECTION: 'promise_rejection',
  WX_API_ERROR: 'wx_api_error',
  NETWORK_ERROR: 'network_error',
  UNKNOWN: 'unknown',
}

const ERROR_LEVELS = {
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
  FATAL: 'fatal',
}

const ERROR_REPORT_CONFIG = {
  // 错误采样率（0 ~ 1）
  sampleRate: 1,
  // 是否上报到 wx.reportMonitor
  enableMonitor: false,
  // 是否本地 console 输出
  enableConsole: true,
  // 单次会话最大错误数
  maxErrorsPerSession: 100,
  // 错误堆栈最大深度
  maxStackDepth: 20,
  // 是否包含系统信息
  includeSystemInfo: true,
}

module.exports = {
  ERROR_TYPES,
  ERROR_LEVELS,
  ERROR_REPORT_CONFIG,
}
