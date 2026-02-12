// 关键：在文件最开始初始化全局a变量
a = a || {};
a.functions = a.functions || {};
a.functions.getAuthCode = a.functions.getAuthCode || function() { return Promise.resolve(''); };

// 使用require语句代替import语句
// 注意：不要重新声明console，因为它会覆盖全局console对象
const customConsole = require('./console');
const { isArrayOrObject, TimeUtil, isInstanceOfError, stringifyError } = require('./common-utils');

customConsole.log('logger: 全局a.functions 已初始化');

const LOGLEVEL_DEBUG = -1
const LOGLEVEL_LOG = 0
const LOGLEVEL_INFO = 1
const LOGLEVEL_WARN = 2
const LOGLEVEL_ERROR = 3
const LOGLEVEL_NON_LOGGING = 4 // 无日志记录级别，sdk将不打印任何日志
const MAX_LOG_LENGTH = 1000
let globalLevel = LOGLEVEL_LOG
// 暂停使用 wx.getLogManager，没发现它能起到什么作用
const bCanIUseWxLog = false
const timerMap = new Map()

/**
 * 对齐毫秒字符串
 * @param {*} ms 毫秒
 * @returns {String} 对齐后的毫秒时间字符串
 */
function padMs(ms) {
  const len = ms.toString().length
  let ret
  switch (len) {
    case 1:
      ret = `00${ms}`
      break
    case 2:
      ret = `0${ms}`
      break
    default:
      ret = ms
      break
  }

  return ret
}

/**
 * log前缀
 * @returns {String} 日志前缀
 */
function getPrefix() {
  const date = new Date()
  return `TUIKit ${date.toLocaleTimeString('en-US', { hour12: false })}.${padMs(date.getMilliseconds())}:`
}



const logger = {
  _data: [],
  _length: 0,
  _visible: false,

  // 将函数参数拼成字符串
  arguments2String(args) {
    let s
    if (args.length === 1) {
      s = getPrefix() + args[0]
    } else {
      s = getPrefix()
      for (let i = 0, { length } = args; i < length; i++) {
        if (isArrayOrObject(args[i])) {
          if (isInstanceOfError(args[i])) {
            s += stringifyError(args[i])
          } else {
            s += JSON.stringify(args[i])
          }
        } else {
          s += args[i]
        }
        s += ' '
      }
    }
    return s
  },

  /**
   * 打印调试日志
   */
  debug() {
    if (globalLevel <= LOGLEVEL_DEBUG) {
      // 对参数使用slice会阻止某些JavaScript引擎中的优化 (比如 V8 - 更多信息)
      // see:https://github.com/petkaantonov/bluebird/wiki/Optimization-killers#3-managing-arguments
      const s = this.arguments2String(arguments)
      logger.record(s, 'debug')
      customConsole.debug(s)
      if (bCanIUseWxLog) {
        wx.getLogManager().debug(s)
      }
    }
  },

  /**
   * 打印普通日志
   */
  log() {
    if (globalLevel <= LOGLEVEL_LOG) {
      const s = this.arguments2String(arguments)
      logger.record(s, 'log')
      customConsole.log(s)
      if (bCanIUseWxLog) {
        wx.getLogManager().log(s)
      }
    }
  },

  /**
   * 打印release日志
   */
  info() {
    if (globalLevel <= LOGLEVEL_INFO) {
      const s = this.arguments2String(arguments)
      logger.record(s, 'info')
      customConsole.info(s)
      if (bCanIUseWxLog) {
        wx.getLogManager().info(s)
      }
    }
  },

  /**
   * 打印告警日志
   */
  warn() {
    if (globalLevel <= LOGLEVEL_WARN) {
      const s = this.arguments2String(arguments)
      logger.record(s, 'warn')
      customConsole.warn(s)
      if (bCanIUseWxLog) {
        wx.getLogManager().warn(s)
      }
    }
  },

  /**
   * 打印错误日志
   */
  error() {
    if (globalLevel <= LOGLEVEL_ERROR) {
      const s = this.arguments2String(arguments)
      logger.record(s, 'error')
      customConsole.error(s)
      // 微信写不了error日志，就用warn代替了
      if (bCanIUseWxLog) {
        wx.getLogManager().warn(s)
      }
    }
  },

  time(label) {
    timerMap.set(label, TimeUtil.now())
  },

  timeEnd(label) {
    if (timerMap.has(label)) {
      const cost = TimeUtil.now() - timerMap.get(label)
      timerMap.delete(label)
      return cost
    }
    customConsole.warn(`未找到对应label: ${label}, 请在调用 logger.timeEnd 前，调用 logger.time`)
    return 0
  },

  setLevel(newLevel) {
    if (newLevel < LOGLEVEL_NON_LOGGING) {
      customConsole.log(`${getPrefix()} set level to ${newLevel}`)
    }
    globalLevel = newLevel
  },

  record(s, type) {
    if (bCanIUseWxLog) {
      // 小程序环境不在内存缓存日志
      return
    }

    if (logger._length === MAX_LOG_LENGTH + 100) {
      logger._data.splice(0, 100)
      logger._length = MAX_LOG_LENGTH
    }
    logger._length++
    logger._data.push(`${s} [${type}] \n`)
  },

  getLog() {
    return logger._data
  },
}

module.exports = logger
