/**
 * alert.js 单元测试
 *
 * 覆盖：
 *   - isAlertable：白名单判断
 *   - buildDedupeKey：业务 ID 优先
 *   - notify：禁用 / 无 webhook / 不可告警 / 去重
 *   - notify：成功发送（用 mock http）
 *   - notify：webhook 失败不抛
 *   - alertOnError：handler 抛 SEVERE → 触发 notify
 *   - alertOnError：handler 抛普通错误 → 不触发
 *   - alertOnError：handler 成功 → 不触发
 *   - formatMessage：可读文本构造
 *   - 统计：_getStats
 */

const alert = require('../cloudfunctions/common/alert')

describe('common/alert', () => {
  let originalEnv
  beforeEach(() => {
    originalEnv = { ...process.env }
    alert._reset()
  })
  afterEach(() => {
    process.env = originalEnv
  })

  describe('isAlertable', () => {
    test('SEVERE 错误码返回 true', () => {
      expect(alert.isAlertable('PAYMENT_AMOUNT_MISMATCH')).toBe(true)
      expect(alert.isAlertable('REFUND_FAILED')).toBe(true)
      expect(alert.isAlertable('DB_ERROR')).toBe(true)
      expect(alert.isAlertable('WECHAT_API_ERROR')).toBe(true)
    })

    test('非 SEVERE 错误码返回 false', () => {
      expect(alert.isAlertable('INVALID_PARAMS')).toBe(false)
      expect(alert.isAlertable('AUTH_REQUIRED')).toBe(false)
      expect(alert.isAlertable('NOT_FOUND')).toBe(false)
      expect(alert.isAlertable('UNKNOWN_CODE')).toBe(false)
    })
  })

  describe('buildDedupeKey', () => {
    test('优先用 orderId', () => {
      expect(alert.buildDedupeKey('REFUND_FAILED', { orderId: 'o1' })).toBe('REFUND_FAILED:o1')
    })

    test('其次用 outTradeNo', () => {
      expect(alert.buildDedupeKey('REFUND_FAILED', { outTradeNo: 'OTN_1' })).toBe('REFUND_FAILED:OTN_1')
    })

    test('其次用 userId / openid', () => {
      expect(alert.buildDedupeKey('DB_ERROR', { userId: 'u1' })).toBe('DB_ERROR:u1')
      expect(alert.buildDedupeKey('DB_ERROR', { openid: 'o1' })).toBe('DB_ERROR:o1')
    })

    test('无业务 ID 时只用 code', () => {
      expect(alert.buildDedupeKey('DB_ERROR', {})).toBe('DB_ERROR')
    })
  })

  describe('formatMessage', () => {
    test('包含 code + 时间', () => {
      const msg = alert.formatMessage('REFUND_FAILED', { reason: '微信返回 FAIL' })
      expect(msg).toMatch(/REFUND_FAILED/)
      expect(msg).toMatch(/微信返回 FAIL/)
      expect(msg).toMatch(/时间: /)
    })

    test('包含业务字段', () => {
      const msg = alert.formatMessage('PAYMENT_AMOUNT_MISMATCH', {
        orderId: 'o1', outTradeNo: 'OTN_1', userId: 'u1',
        service: 'paymentService', action: 'wechatPay',
        amount: 9999, reason: 'amount mismatch',
      })
      expect(msg).toMatch(/订单: o1/)
      expect(msg).toMatch(/商户单号: OTN_1/)
      expect(msg).toMatch(/用户: u1/)
      expect(msg).toMatch(/服务: paymentService/)
      expect(msg).toMatch(/操作: wechatPay/)
      expect(msg).toMatch(/金额: 9999/)
      expect(msg).toMatch(/原因: amount mismatch/)
    })

    test('stack 截断前 3 行', () => {
      const stack = 'line1\nline2\nline3\nline4\nline5'
      const msg = alert.formatMessage('INTERNAL_ERROR', { stack })
      expect(msg).toMatch(/line1 \| line2 \| line3/)
      expect(msg).not.toMatch(/line4/)
    })
  })

  describe('notify：禁用 / 缺失配置', () => {
    test('ALERT_DISABLE=1 → 不发送', async () => {
      process.env.ALERT_DISABLE = '1'
      process.env.ALERT_WEBHOOK_URL = 'https://example.com/webhook'
      const r = await alert.notify('REFUND_FAILED', { orderId: 'o1' })
      expect(r.sent).toBe(false)
      expect(r.reason).toBe('disabled')
    })

    test('缺 ALERT_WEBHOOK_URL → 不发送', async () => {
      delete process.env.ALERT_WEBHOOK_URL
      const r = await alert.notify('REFUND_FAILED', { orderId: 'o1' })
      expect(r.sent).toBe(false)
      expect(r.reason).toBe('no_webhook')
    })

    test('非 SEVERE code → 不发送', async () => {
      process.env.ALERT_WEBHOOK_URL = 'https://example.com/webhook'
      const r = await alert.notify('INVALID_PARAMS', { orderId: 'o1' })
      expect(r.sent).toBe(false)
      expect(r.reason).toBe('not_alertable')
    })
  })

  describe('notify：去重窗口', () => {
    test('同 key 在窗口内重复 → deduped', async () => {
      // 通过 mock https 让 sendWebhook 看起来成功
      const https = require('https')
      const origRequest = https.request
      https.request = jest.fn((opts, cb) => {
        const fakeRes = { statusCode: 200, on: jest.fn((ev, h) => { if (ev === 'end') h() }) }
        process.nextTick(() => cb(fakeRes))
        return { on: jest.fn(), write: jest.fn(), end: jest.fn() }
      })

      process.env.ALERT_WEBHOOK_URL = 'https://example.com/webhook'
      process.env.ALERT_DEDUPE_WINDOW_MS = '60000'

      const r1 = await alert.notify('REFUND_FAILED', { orderId: 'o1' })
      expect(r1.sent).toBe(true)

      const r2 = await alert.notify('REFUND_FAILED', { orderId: 'o1' })
      expect(r2.sent).toBe(false)
      expect(r2.deduped).toBe(true)

      const stats = alert._getStats()
      expect(stats.sent).toBe(1)
      expect(stats.deduped).toBe(1)

      https.request = origRequest
    })

    test('窗口过期后重新发送', async () => {
      const https = require('https')
      const origRequest = https.request
      https.request = jest.fn((opts, cb) => {
        const fakeRes = { statusCode: 200, on: jest.fn((ev, h) => { if (ev === 'end') h() }) }
        process.nextTick(() => cb(fakeRes))
        return { on: jest.fn(), write: jest.fn(), end: jest.fn() }
      })

      process.env.ALERT_WEBHOOK_URL = 'https://example.com/webhook'
      process.env.ALERT_DEDUPE_WINDOW_MS = '100'

      const r1 = await alert.notify('REFUND_FAILED', { orderId: 'o1' })
      expect(r1.sent).toBe(true)

      await new Promise(r => setTimeout(r, 150))

      const r2 = await alert.notify('REFUND_FAILED', { orderId: 'o1' })
      expect(r2.sent).toBe(true)

      https.request = origRequest
    })
  })

  describe('notify：webhook 失败', () => {
    test('webhook 返回 500 → sent=false，failed 计数+1', async () => {
      const https = require('https')
      const origRequest = https.request
      https.request = jest.fn((opts, cb) => {
        const fakeRes = { statusCode: 500, on: jest.fn((ev, h) => { if (ev === 'end') h() }) }
        process.nextTick(() => cb(fakeRes))
        return { on: jest.fn(), write: jest.fn(), end: jest.fn() }
      })

      process.env.ALERT_WEBHOOK_URL = 'https://example.com/webhook'
      const r = await alert.notify('REFUND_FAILED', { orderId: 'o1' })
      expect(r.sent).toBe(false)
      expect(alert._getStats().failed).toBe(1)

      https.request = origRequest
    })

    test('网络错误 → sent=false', async () => {
      const https = require('https')
      const origRequest = https.request
      https.request = jest.fn(() => {
        return {
          on: jest.fn((ev, h) => { if (ev === 'error') h(new Error('ECONNREFUSED')) }),
          write: jest.fn(), end: jest.fn(),
        }
      })

      process.env.ALERT_WEBHOOK_URL = 'https://example.com/webhook'
      const r = await alert.notify('REFUND_FAILED', { orderId: 'o1' })
      expect(r.sent).toBe(false)
      expect(r.reason).toMatch(/ECONNREFUSED/)

      https.request = origRequest
    })
  })

  describe('alertOnError 装饰器', () => {
    test('handler 抛 SEVERE 错误 → 触发 notify', async () => {
      process.env.ALERT_WEBHOOK_URL = 'https://example.com/webhook'
      const https = require('https')
      const origRequest = https.request
      https.request = jest.fn((opts, cb) => {
        const fakeRes = { statusCode: 200, on: jest.fn((ev, h) => { if (ev === 'end') h() }) }
        process.nextTick(() => cb(fakeRes))
        return { on: jest.fn(), write: jest.fn(), end: jest.fn() }
      })

      // 业务错误对象（与 BusinessError 形状一致）
      const sevError = new Error('微信返回 FAIL')
      sevError.code = 'REFUND_FAILED'

      const handler = alert.alertOnError('paymentService')(async () => {
        throw sevError
      })

      await expect(handler({ action: 'createRefund', outTradeNo: 'OTN_1' }, {}, { openid: 'u1' }))
        .rejects.toBe(sevError)

      // 等待 fire-and-forget
      await new Promise(r => setTimeout(r, 30))
      expect(alert._getStats().sent).toBe(1)

      https.request = origRequest
    })

    test('handler 抛非 SEVERE 错误 → 不触发', async () => {
      process.env.ALERT_WEBHOOK_URL = 'https://example.com/webhook'
      const https = require('https')
      const origRequest = https.request
      https.request = jest.fn()

      const err = new Error('invalid param')
      err.code = 'INVALID_PARAMS'

      const handler = alert.alertOnError('paymentService')(async () => {
        throw err
      })

      await expect(handler({}, {}, {})).rejects.toBe(err)
      await new Promise(r => setTimeout(r, 20))
      expect(https.request).not.toHaveBeenCalled()

      https.request = origRequest
    })

    test('handler 成功 → 不触发', async () => {
      process.env.ALERT_WEBHOOK_URL = 'https://example.com/webhook'
      const https = require('https')
      const origRequest = https.request
      https.request = jest.fn()

      const handler = alert.alertOnError('paymentService')(async () => {
        return { ok: true }
      })

      const r = await handler({}, {}, {})
      expect(r).toEqual({ ok: true })
      expect(https.request).not.toHaveBeenCalled()

      https.request = origRequest
    })
  })

  describe('SEVERE_CODES 列表', () => {
    test('至少包含 8 个常用严重错误码', () => {
      expect(alert.SEVERE_CODES.size).toBeGreaterThanOrEqual(8)
      for (const code of ['PAYMENT_AMOUNT_MISMATCH', 'REFUND_FAILED', 'DB_ERROR', 'WECHAT_API_ERROR']) {
        expect(alert.SEVERE_CODES.has(code)).toBe(true)
      }
    })
  })
})
