/**
 * cloudfunctions/common/logger.js 测试
 * 验证日志记录器各级别行为与 createLogger 工厂
 */
const {
  logger,
  createLogger,
  setLogLevel,
  getLogLevel,
  LOG_LEVELS,
} = require('../cloudfunctions/common/logger')

describe('common/logger', () => {
  let consoleLog
  let consoleWarn
  let consoleError

  beforeEach(() => {
    consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {})
    consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    setLogLevel(LOG_LEVELS.DEBUG)
  })

  afterEach(() => {
    consoleLog.mockRestore()
    consoleWarn.mockRestore()
    consoleError.mockRestore()
    setLogLevel(LOG_LEVELS.INFO)
  })

  describe('logger.info', () => {
    test('应输出到 console.log 并带时间戳前缀', () => {
      logger.info('svc', 'act', { foo: 1 })
      expect(consoleLog).toHaveBeenCalledTimes(1)
      const [prefix, data] = consoleLog.mock.calls[0]
      expect(prefix).toMatch(/\[INFO\] \[svc\] \[act\]/)
      expect(data).toEqual({ foo: 1 })
    })
  })

  describe('logger.debug', () => {
    test('DEBUG 级别开启时应输出', () => {
      logger.debug('svc', 'act', 'x')
      expect(consoleLog).toHaveBeenCalled()
    })

    test('提升到 INFO 级别后 DEBUG 不应输出', () => {
      setLogLevel(LOG_LEVELS.INFO)
      logger.debug('svc', 'act', 'x')
      expect(consoleLog).not.toHaveBeenCalled()
    })
  })

  describe('logger.warn', () => {
    test('应输出到 console.warn', () => {
      logger.warn('svc', 'act', { msg: 'be careful' })
      expect(consoleWarn).toHaveBeenCalledTimes(1)
      const [prefix] = consoleWarn.mock.calls[0]
      expect(prefix).toMatch(/\[WARN\]/)
    })
  })

  describe('logger.error', () => {
    test('应输出 message / name / stack', () => {
      const err = new Error('boom')
      logger.error('svc', 'act', err)
      expect(consoleError).toHaveBeenCalledTimes(1)
      const [, data] = consoleError.mock.calls[0]
      expect(data.message).toBe('boom')
      expect(data.name).toBe('Error')
      expect(data.stack).toBeDefined()
    })
  })

  describe('logger.errorWithContext', () => {
    test('应附加 context 字段', () => {
      const err = new Error('boom')
      logger.errorWithContext('svc', 'act', err, { userId: 'u1' })
      const [, data] = consoleError.mock.calls[0]
      expect(data.context).toEqual({ userId: 'u1' })
    })
  })

  describe('logger.performance', () => {
    test('应输出 duration 字段', () => {
      logger.performance('svc', 'act', 123, { extra: 'x' })
      const [, data] = consoleLog.mock.calls[0]
      expect(data.duration).toBe('123ms')
      expect(data.extra).toBe('x')
    })
  })

  describe('logger.database', () => {
    test('应输出 collection / operation / result', () => {
      logger.database('svc', 'act', 'users', 'query', { count: 5 })
      const [, data] = consoleLog.mock.calls[0]
      expect(data.collection).toBe('users')
      expect(data.operation).toBe('query')
      expect(data.result).toEqual({ count: 5 })
    })
  })

  describe('createLogger', () => {
    test('应返回绑定了 serviceName 的 logger', () => {
      const log = createLogger('myService')
      log.info('act', { x: 1 })
      const [prefix] = consoleLog.mock.calls[0]
      expect(prefix).toMatch(/\[myService\]/)
    })

    test('应支持所有方法', () => {
      const log = createLogger('svc')
      expect(typeof log.info).toBe('function')
      expect(typeof log.debug).toBe('function')
      expect(typeof log.warn).toBe('function')
      expect(typeof log.error).toBe('function')
      expect(typeof log.errorWithContext).toBe('function')
      expect(typeof log.performance).toBe('function')
      expect(typeof log.database).toBe('function')
    })
  })

  describe('setLogLevel / getLogLevel', () => {
    test('setLogLevel 应改变 getLogLevel 返回值', () => {
      setLogLevel(LOG_LEVELS.WARN)
      expect(getLogLevel()).toBe(LOG_LEVELS.WARN)
    })

    test('WARN 级别时 INFO 不应输出', () => {
      setLogLevel(LOG_LEVELS.WARN)
      logger.info('svc', 'act', 'x')
      expect(consoleLog).not.toHaveBeenCalled()
    })

    test('ERROR 级别时 WARN 不应输出', () => {
      setLogLevel(LOG_LEVELS.ERROR)
      logger.warn('svc', 'act', 'x')
      expect(consoleWarn).not.toHaveBeenCalled()
    })
  })

  describe('LOG_LEVELS 常量', () => {
    test('应包含 4 个标准级别', () => {
      expect(LOG_LEVELS.DEBUG).toBe(0)
      expect(LOG_LEVELS.INFO).toBe(1)
      expect(LOG_LEVELS.WARN).toBe(2)
      expect(LOG_LEVELS.ERROR).toBe(3)
    })
  })
})
