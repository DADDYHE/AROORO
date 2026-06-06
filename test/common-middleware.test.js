/**
 * middleware.js 单元测试
 *
 * 覆盖：
 *   - withMiddleware：成功 / 失败 / auth / metrics / alert 联动
 *   - composeMain：路由 / 未知 action / 默认 error 抛出
 *   - 慢调用自动告警
 *   - 业务异常与未知异常分流
 */

jest.mock('../cloudfunctions/common/alert', () => {
  const _isAlertable = (code) => ['REFUND_FAILED', 'DB_ERROR', 'INTERNAL_ERROR'].includes(code)
  return {
    isAlertable: _isAlertable,
    notify: jest.fn(async () => ({ sent: true, deduped: false })),
    alertOnError: () => (h) => h,
  }
})

jest.mock('../cloudfunctions/common/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}))

const middleware = require('../cloudfunctions/common/middleware')
const metrics = require('../cloudfunctions/common/performance-metrics')
const alert = require('../cloudfunctions/common/alert')
const logger = require('../cloudfunctions/common/logger')
const { err } = require('../cloudfunctions/common/errors')

describe('common/middleware', () => {
  beforeEach(() => {
    metrics.reset()
    jest.clearAllMocks()
  })

  describe('withMiddleware', () => {
    test('成功路径：业务返回值原样返回，metrics success', async () => {
      const fn = middleware.withMiddleware({
        service: 'orderService',
        handler: async () => ({ ok: true }),
      })
      const r = await fn({ action: 'createOrder' }, {})
      expect(r).toEqual({ ok: true })
      const snap = metrics.getSnapshot()
      expect(snap.timers['orderService.createOrder'].total).toBe(1)
      expect(snap.timers['orderService.createOrder'].errors).toBe(0)
    })

    test('业务抛 BusinessError：metrics 失败 + alert 触发', async () => {
      const fn = middleware.withMiddleware({
        service: 'paymentService',
        handler: async () => { throw err('REFUND_FAILED', '微信失败') },
      })
      await expect(fn({ action: 'refund' }, {})).rejects.toMatchObject({ code: 'REFUND_FAILED' })
      const snap = metrics.getSnapshot()
      expect(snap.timers['paymentService.refund'].errors).toBe(1)
      expect(alert.notify).toHaveBeenCalledWith(
        'REFUND_FAILED',
        expect.objectContaining({ service: 'paymentService', action: 'refund' }),
      )
    })

    test('业务抛普通 Error：alert.notify 不会被调用（不在 SEVERE 列表）', async () => {
      const fn = middleware.withMiddleware({
        service: 'orderService',
        handler: async () => { throw new Error('oops') },
      })
      await expect(fn({ action: 'do' }, {})).rejects.toThrow('oops')
      expect(alert.notify).not.toHaveBeenCalled()
    })

    test('显式 action 覆盖 event.action', async () => {
      const fn = middleware.withMiddleware({
        service: 'orderService',
        action: 'specialAction',
        handler: async () => 'ok',
      })
      await fn({ action: 'other' }, {})
      const snap = metrics.getSnapshot()
      expect(snap.timers['orderService.specialAction']).toBeTruthy()
    })

    test('缺 service / handler → 立即抛错', () => {
      expect(() => middleware.withMiddleware({ handler: () => {} })).toThrow(/缺少 service/)
      expect(() => middleware.withMiddleware({ service: 'x' })).toThrow(/缺少 handler/)
    })

    test('慢调用 → alert.notify(INTERNAL_ERROR, ...)', async () => {
      const fn = middleware.withMiddleware({
        service: 'orderService',
        criticalMs: 50,
        handler: async () => {
          await new Promise(r => setTimeout(r, 80))
          return 'ok'
        },
      })
      await fn({ action: 'slow' }, {})
      // 慢调用触发 INTERNAL_ERROR 告警
      expect(alert.notify).toHaveBeenCalledWith(
        'INTERNAL_ERROR',
        expect.objectContaining({
          service: 'orderService',
          action: 'slow',
          reason: expect.stringMatching(/slow_call/),
        }),
      )
    })

    test('enableMetrics=false：不打 metrics', async () => {
      const fn = middleware.withMiddleware({
        service: 's', enableMetrics: false, handler: async () => 1,
      })
      await fn({ action: 'a' }, {})
      const snap = metrics.getSnapshot()
      expect(snap.timers['s.a']).toBeFalsy()
    })

    test('enableAlert=false：失败时不调 alert', async () => {
      const fn = middleware.withMiddleware({
        service: 's', enableAlert: false, handler: async () => { throw err('REFUND_FAILED', 'x') },
      })
      await expect(fn({ action: 'a' }, {})).rejects.toMatchObject({ code: 'REFUND_FAILED' })
      expect(alert.notify).not.toHaveBeenCalled()
    })

    test('verifyAuth 自定义：auth 对象传递给 handler', async () => {
      const fn = middleware.withMiddleware({
        service: 's',
        handler: async (event, ctx, auth) => ({ got: auth.userId }),
        verifyAuth: async (event) => ({ userId: 'u1', openid: 'o1' }),
      })
      const r = await fn({}, {})
      expect(r).toEqual({ got: 'u1' })
    })

    test('无 verifyAuth：auth 默认从 event.openid 取', async () => {
      let captured = null
      const fn = middleware.withMiddleware({
        service: 's',
        handler: async (event, ctx, auth) => { captured = auth; return null },
      })
      await fn({ openid: 'oX' }, {})
      expect(captured).toEqual({ openid: 'oX' })
    })

    test('logger.info / warn 被调用', async () => {
      const fn = middleware.withMiddleware({
        service: 'testService', handler: async () => 'ok',
      })
      await fn({ action: 't' }, {})
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('-> t'),
        expect.objectContaining({ openid: undefined }),
      )
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('<- t ok'),
        expect.any(Object),
      )
    })
  })

  describe('composeMain', () => {
    test('路由到对应 handler', async () => {
      const main = middleware.composeMain({
        service: 'orderService',
        handlers: {
          a: async () => 'A',
          b: async () => 'B',
        },
      })
      expect(await main({ action: 'a' }, {})).toBe('A')
      expect(await main({ action: 'b' }, {})).toBe('B')
    })

    test('未知 action：抛 UNKNOWN_ACTION', async () => {
      const { BusinessError } = require('../cloudfunctions/common/errors')
      const main = middleware.composeMain({
        service: 's', handlers: { a: async () => 1 },
      })
      await expect(main({ action: 'unknown' }, {})).rejects.toBeInstanceOf(BusinessError)
      await expect(main({ action: 'unknown' }, {})).rejects.toMatchObject({ code: 'UNKNOWN_ACTION' })
    })

    test('缺 action：抛 UNKNOWN_ACTION', async () => {
      const main = middleware.composeMain({ service: 's', handlers: {} })
      await expect(main({}, {})).rejects.toMatchObject({ code: 'UNKNOWN_ACTION' })
    })

    test('onUnknown 自定义：可定制未知名 action 行为', async () => {
      const main = middleware.composeMain({
        service: 's',
        handlers: {},
        onUnknown: (event, action) => ({ code: -1, message: `未知 ${action}` }),
      })
      const r = await main({ action: 'X' }, {})
      expect(r).toEqual({ code: -1, message: '未知 X' })
    })

    test('composeMain 缺 service / handlers → 立即抛错', () => {
      expect(() => middleware.composeMain({ handlers: {} })).toThrow(/缺少 service/)
      expect(() => middleware.composeMain({ service: 's' })).toThrow(/缺少 handlers/)
    })

    test('composeMain 仍走 metrics 路径', async () => {
      const main = middleware.composeMain({
        service: 'orderService',
        handlers: { x: async () => 'ok' },
      })
      await main({ action: 'x' }, {})
      const snap = metrics.getSnapshot()
      expect(snap.timers['orderService.x']).toBeTruthy()
    })
  })
})
