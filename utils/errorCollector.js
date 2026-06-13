/**
 * 错误采集器
 *
 * 为 globalErrorManager.js 提供 wx.onError 触发的统一处理入口。
 */

const { ERROR_TYPES, ERROR_LEVELS } = require('./errorConfig')

class ErrorCollector {
  constructor(stats, config = {}) {
    this.stats = stats
    this.config = config
  }

  handleWxError(error, options = {}) {
    const entry = this._normalize(error, options)
    this.stats.record(entry)
    if (this.config.enableConsole) {
      // eslint-disable-next-line no-console
      console.error('[ErrorCollector]', entry)
    }
    return entry
  }

  _normalize(error, options = {}) {
    const message = (error && (error.message || error.errMsg)) || (typeof error === 'string' ? error : 'Unknown error')
    const stack = error && error.stack ? String(error.stack) : ''
    return {
      type: options.type || ERROR_TYPES.JS_ERROR,
      level: options.level || ERROR_LEVELS.ERROR,
      message,
      stack: stack.split('\n').slice(0, this.config.maxStackDepth || 20).join('\n'),
      timestamp: Date.now(),
      context: options.context || null,
    }
  }
}

module.exports = {
  ErrorCollector,
}
