/**
 * cloudfunctions/common/logger.js — 关键分支补充测试 (F28)
 *
 * 目标：在不拉高 jest.config.js 现有门禁（logger b50/f65）的前提下，
 * 补充结构化日志 / perf 采样 / 异常兜底 等关键分支的覆盖。
 *
 * 覆盖的现有测试未触达的分支：
 *   - _serializeLogPayload：null / undefined / 普通对象(非 Error) / 字符串 / 数字
 *   - perf() 采样开关：默认 rate=0 早返回；rate=1 时按概率输出 PERF-SAMPLE
 *   - installGlobalExceptionHandlers：测试环境下早返回（不注册进程监听）
 *   - createLogger().child()：子 logger 拼接 serviceName:subTag 前缀
 */
const {
  logger,
  createLogger,
  setLogLevel,
  LOG_LEVELS,
} = require('../cloudfunctions/common/logger')

describe('common/logger 结构化分支补充 (F28)', () => {
  let logSpy
  let warnSpy
  let errorSpy

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    setLogLevel(LOG_LEVELS.DEBUG)
  })

  afterEach(() => {
    logSpy.mockRestore()
    warnSpy.mockRestore()
    errorSpy.mockRestore()
    setLogLevel(LOG_LEVELS.INFO)
    delete process.env.PERF_SAMPLING_RATE
  })

  describe('_serializeLogPayload 分支', () => {
    test('null -> { message: "null" }', () => {
      logger.error('svc', 'act', null)
      const [, data] = errorSpy.mock.calls[0]
      expect(data).toEqual({ message: 'null' })
    })

    test('undefined -> { message: "undefined" }', () => {
      logger.error('svc', 'act', undefined)
      const [, data] = errorSpy.mock.calls[0]
      expect(data).toEqual({ message: 'undefined' })
    })

    test('普通对象(非 Error) 原样透传，保留 errMsg/errCode', () => {
      logger.error('svc', 'act', { errMsg: 'boom', errCode: 1001 })
      const [, data] = errorSpy.mock.calls[0]
      expect(data).toEqual({ errMsg: 'boom', errCode: 1001 })
    })

    test('字符串 -> { message }', () => {
      logger.error('svc', 'act', 'plain string')
      const [, data] = errorSpy.mock.calls[0]
      expect(data).toEqual({ message: 'plain string' })
    })

    test('数字 -> { message }', () => {
      logger.error('svc', 'act', 500)
      const [, data] = errorSpy.mock.calls[0]
      expect(data).toEqual({ message: '500' })
    })
  })

  describe('perf() 采样开关', () => {
    test('默认 rate=0 时 perf() 静默（早返回，不输出）', () => {
      createLogger('test').perf('act', 12, { a: 1 })
      expect(logSpy).not.toHaveBeenCalled()
    })

    test('rate=1 时按概率输出 PERF-SAMPLE（绕过 LOG_LEVEL）', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.5)
      jest.isolateModules(() => {
        process.env.PERF_SAMPLING_RATE = '1'
        const lg = require('../cloudfunctions/common/logger')
        lg.createLogger('test').perf('act', 12, { a: 1 })
      })
      expect(logSpy).toHaveBeenCalledTimes(1)
      const [prefix] = logSpy.mock.calls[0]
      expect(prefix).toMatch(/\[PERF-SAMPLE\]/)
    })
  })

  describe('installGlobalExceptionHandlers', () => {
    test('测试环境下应早返回且不抛错（不污染测试进程）', () => {
      const m = require('../cloudfunctions/common/logger')
      expect(() => m.installGlobalExceptionHandlers()).not.toThrow()
    })
  })

  describe('createLogger().child()', () => {
    test('子 logger 应拼接 serviceName:subTag 前缀', () => {
      const log = createLogger('svc').child('sub')
      log.info('act', { x: 1 })
      const [prefix] = logSpy.mock.calls[0]
      expect(prefix).toMatch(/\[svc:sub\]/)
    })
  })
})
