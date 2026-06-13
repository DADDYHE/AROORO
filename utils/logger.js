const LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, NONE: 4 }
const LEVEL_NAMES = ['DEBUG', 'INFO', 'WARN', 'ERROR']

let currentLevel = LEVELS.DEBUG

function init(level) {
  if (typeof level === 'number' && level >= 0 && level <= 4) {
    currentLevel = level
  }
}

function _shouldLog(level) {
  return level >= currentLevel
}

function _formatMessage(tag, args) {
  const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  const prefix = `[${timestamp}][${tag}]`
  return [prefix, ...args]
}

function createLogger(tag) {
  return {
    debug(...args) {
      if (_shouldLog(LEVELS.DEBUG)) {console.log(..._formatMessage(tag, args))}
    },
    info(...args) {
      if (_shouldLog(LEVELS.INFO)) {console.info(..._formatMessage(tag, args))}
    },
    warn(...args) {
      if (_shouldLog(LEVELS.WARN)) {console.warn(..._formatMessage(tag, args))}
    },
    error(...args) {
      if (_shouldLog(LEVELS.ERROR)) {console.error(..._formatMessage(tag, args))}
    },
    log(...args) { this.debug(...args) },
  }
}

module.exports = { LEVELS, init, createLogger }
