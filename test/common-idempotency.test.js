/**
 * cloudfunctions/common/idempotency.js 单元测试
 */

const {
  buildIdempotencyKey,
  buildPaymentIdempotencyKey,
  isIdempotentHit,
  registerIdempotencyKey,
  checkRateLimit,
} = require('../cloudfunctions/common/idempotency')

describe('idempotency.js', () => {
  describe('buildIdempotencyKey', () => {
    test('相同输入应产生相同 key', () => {
      const a = buildIdempotencyKey({ userId: 'u1', action: 'createOrder', payload: { x: 1 } })
      const b = buildIdempotencyKey({ userId: 'u1', action: 'createOrder', payload: { x: 1 } })
      expect(a).toBe(b)
    })

    test('不同 payload 应产生不同 key', () => {
      const a = buildIdempotencyKey({ userId: 'u1', action: 'createOrder', payload: { x: 1 } })
      const b = buildIdempotencyKey({ userId: 'u1', action: 'createOrder', payload: { x: 2 } })
      expect(a).not.toBe(b)
    })

    test('不同 userId 应隔离', () => {
      const a = buildIdempotencyKey({ userId: 'u1', action: 'x', payload: {} })
      const b = buildIdempotencyKey({ userId: 'u2', action: 'x', payload: {} })
      expect(a).not.toBe(b)
    })

    test('未传 userId 应使用 anonymous', () => {
      const k = buildIdempotencyKey({ action: 'ping' })
      expect(k).toMatch(/^anonymous:ping:/)
    })

    test('显式 scope 应覆盖 userId', () => {
      const k = buildIdempotencyKey({ userId: 'u1', scope: 'global', action: 'x' })
      expect(k).toMatch(/^global:x:/)
    })

    test('action 必填', () => {
      expect(() => buildIdempotencyKey({ payload: {} })).toThrow()
    })

    test('字符串 payload 应取前 32 字符', () => {
      const a = buildIdempotencyKey({ action: 'x', payload: 'short' })
      const b = buildIdempotencyKey({ action: 'x', payload: 'short_xxxxx_yyyyy_zzzzz' })
      // 都截前 32 字符，但内容不同
      expect(a).not.toBe(b)
    })
  })

  describe('buildPaymentIdempotencyKey', () => {
    test('outTradeNo + transactionId 应组成稳定 key', () => {
      const k1 = buildPaymentIdempotencyKey({ outTradeNo: 'O1', transactionId: 'T1' })
      expect(k1).toBe('wxpay:pay:O1:T1')
    })

    test('event 应默认为 pay，可指定 refund', () => {
      const k = buildPaymentIdempotencyKey({ outTradeNo: 'O1', transactionId: 'T1', event: 'refund' })
      expect(k).toBe('wxpay:refund:O1:T1')
    })

    test('outTradeNo / transactionId 至少需一个', () => {
      expect(() => buildPaymentIdempotencyKey({})).toThrow()
    })

    test('仅 transactionId 也能构造', () => {
      const k = buildPaymentIdempotencyKey({ transactionId: 'T1' })
      expect(k).toBe('wxpay:pay:na:T1')
    })
  })

  describe('isIdempotentHit', () => {
    test('集合不存在应返回 false', async () => {
      const db = {
        collection: jest.fn(() => ({
          where: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          get: jest.fn().mockRejectedValue({ errCode: 'DATABASE_COLLECTION_NOT_EXIST' }),
        })),
      }
      expect(await isIdempotentHit(db, 'idempotency_keys', 'k1')).toBe(false)
    })

    test('有数据应返回 true', async () => {
      const db = {
        collection: jest.fn(() => ({
          where: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({ data: [{ _id: 'k1' }] }),
        })),
      }
      expect(await isIdempotentHit(db, 'idempotency_keys', 'k1')).toBe(true)
    })

    test('空数据应返回 false', async () => {
      const db = {
        collection: jest.fn(() => ({
          where: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({ data: [] }),
        })),
      }
      expect(await isIdempotentHit(db, 'idempotency_keys', 'k1')).toBe(false)
    })

    test('其他错误应上抛', async () => {
      const db = {
        collection: jest.fn(() => ({
          where: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          get: jest.fn().mockRejectedValue(new Error('unknown')),
        })),
      }
      await expect(isIdempotentHit(db, 'idempotency_keys', 'k1')).rejects.toThrow('unknown')
    })

    test('db / collection / key 缺失应返回 false', async () => {
      expect(await isIdempotentHit(null, 'x', 'k')).toBe(false)
      expect(await isIdempotentHit({}, '', 'k')).toBe(false)
      expect(await isIdempotentHit({}, 'x', '')).toBe(false)
    })
  })

  describe('registerIdempotencyKey', () => {
    test('新 key 应返回 { ok: true, duplicate: false }', async () => {
      const add = jest.fn().mockResolvedValue({ _id: 'k1' })
      const db = { collection: jest.fn(() => ({ add })) }
      const r = await registerIdempotencyKey(db, 'idem', 'k1', { orderId: 'o1' })
      expect(r).toEqual({ ok: true, duplicate: false })
      expect(add).toHaveBeenCalledWith(expect.objectContaining({
        _id: 'k1',
        meta: { orderId: 'o1' },
      }))
    })

    test('DUPLICATE_KEY 应返回 { ok: false, duplicate: true }', async () => {
      const add = jest.fn().mockRejectedValue({ errCode: 'DUPLICATE_KEY' })
      const db = { collection: jest.fn(() => ({ add })) }
      const r = await registerIdempotencyKey(db, 'idem', 'k1')
      expect(r.duplicate).toBe(true)
      expect(r.ok).toBe(false)
    })

    test('其他错误应上抛', async () => {
      const add = jest.fn().mockRejectedValue(new Error('mongo fail'))
      const db = { collection: jest.fn(() => ({ add })) }
      await expect(registerIdempotencyKey(db, 'idem', 'k1')).rejects.toThrow('mongo fail')
    })

    test('TTL 默认 24h', async () => {
      const add = jest.fn().mockResolvedValue({ _id: 'k1' })
      const db = { collection: jest.fn(() => ({ add })) }
      await registerIdempotencyKey(db, 'idem', 'k1')
      const doc = add.mock.calls[0][0]
      const gap = new Date(doc.expiresAt).getTime() - new Date(doc.createdAt).getTime()
      expect(gap).toBe(24 * 60 * 60 * 1000)
    })
  })

  describe('checkRateLimit', () => {
    function makeDb(total) {
      const chain = {
        where: jest.fn().mockReturnThis(),
        count: jest.fn().mockResolvedValue({ total }),
      }
      return {
        collection: jest.fn(() => chain),
        command: { gte: jest.fn(v => ({ _op: 'gte', v })) },
      }
    }

    test('count < maxCount 应允许', async () => {
      const r = await checkRateLimit(makeDb(2), 'idem', 'k', 3, 60000)
      expect(r.allowed).toBe(true)
      expect(r.count).toBe(2)
    })

    test('count >= maxCount 应拒绝', async () => {
      const r = await checkRateLimit(makeDb(3), 'idem', 'k', 3, 60000)
      expect(r.allowed).toBe(false)
    })

    test('resetAt 应在未来', async () => {
      const before = Date.now()
      const r = await checkRateLimit(makeDb(0), 'idem', 'k', 3, 60000)
      expect(r.resetAt.getTime()).toBeGreaterThanOrEqual(before + 60000)
    })

    test('非法参数应抛错', async () => {
      await expect(checkRateLimit({}, 'idem', 'k', 0, 1000)).rejects.toThrow(/maxCount/)
      await expect(checkRateLimit({}, 'idem', 'k', 1, 0)).rejects.toThrow(/windowMs/)
      await expect(checkRateLimit({}, 'idem', 'k', 1.5, 1000)).rejects.toThrow()
    })
  })
})
