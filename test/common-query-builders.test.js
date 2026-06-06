/**
 * cloudfunctions/common/query-builders.js 单元测试
 */

const qb = require('../cloudfunctions/common/query-builders')

function makeDb() {
  const chain = {
    where: jest.fn(() => chain),
    field: jest.fn(() => chain),
    orderBy: jest.fn(() => chain),
    skip: jest.fn(() => chain),
    limit: jest.fn(() => chain),
    get: jest.fn(() => Promise.resolve({ data: [] })),
    count: jest.fn(() => Promise.resolve({ total: 0 })),
  }
  return {
    collection: jest.fn(() => chain),
    command: {
      gte: jest.fn(v => ({ _op: 'gte', v })),
      lte: jest.fn(v => ({ _op: 'lte', v })),
      lt: jest.fn(v => ({ _op: 'lt', v })),
      and: jest.fn((...args) => ({ _op: 'and', args })),
      or: jest.fn((...args) => ({ _op: 'or', args })),
    },
    _chain: chain,
  }
}

describe('query-builders.js', () => {
  describe('COLLECTION 常量', () => {
    test('应暴露关键集合名', () => {
      expect(qb.COLLECTION.USERS).toBe('users')
      expect(qb.COLLECTION.HOSTS).toBe('hostProfiles')
      expect(qb.COLLECTION.ORDERS).toBe('orders')
      expect(qb.COLLECTION.TUAN).toBe('tuanActivities')
    })
  })

  describe('builder', () => {
    test('无预设 where 时不应调用 where', () => {
      const db = makeDb()
      qb.builder(db, 'orders')
      expect(db._chain.where).not.toHaveBeenCalled()
    })

    test('有预设 where 时应调用 where', () => {
      const db = makeDb()
      qb.builder(db, 'orders', { status: 'pending' })
      expect(db._chain.where).toHaveBeenCalledWith({ status: 'pending' })
    })

    test('缺 db 应抛错', () => {
      expect(() => qb.builder(null, 'orders')).toThrow(/db 必填/)
    })

    test('缺 collection 应抛错', () => {
      expect(() => qb.builder(makeDb(), '')).toThrow(/collection 必填/)
    })
  })

  describe('userByOpenId', () => {
    test('应使用 _openid 字段', () => {
      const db = makeDb()
      qb.userByOpenId(db, 'openid_x')
      expect(db._chain.where).toHaveBeenCalledWith({ _openid: 'openid_x' })
    })
  })

  describe('userById', () => {
    test('应使用 userId 字段', () => {
      const db = makeDb()
      qb.userById(db, 'u1')
      expect(db._chain.where).toHaveBeenCalledWith({ userId: 'u1' })
    })
  })

  describe('hostProfile', () => {
    test('应支持多过滤器', () => {
      const db = makeDb()
      qb.hostProfile(db, { status: 'active', city: '上海', hostId: 'h1' })
      expect(db._chain.where).toHaveBeenCalledWith({
        status: 'active', city: '上海', hostId: 'h1',
      })
    })

    test('空过滤器应不调用 where', () => {
      const db = makeDb()
      qb.hostProfile(db, {})
      expect(db._chain.where).not.toHaveBeenCalled()
    })
  })

  describe('ordersByStatus', () => {
    test('应按 userId / hostId / status / payStatus 过滤', () => {
      const db = makeDb()
      qb.ordersByStatus(db, { userId: 'u1', status: 'paid' })
      expect(db._chain.where).toHaveBeenCalledWith({ userId: 'u1', status: 'paid' })
    })
  })

  describe('activeProducts', () => {
    test('应默认 status=active', () => {
      const db = makeDb()
      qb.activeProducts(db)
      expect(db._chain.where).toHaveBeenCalledWith({ status: 'active' })
    })

    test('category 过滤', () => {
      const db = makeDb()
      qb.activeProducts(db, { category: 'food' })
      expect(db._chain.where).toHaveBeenCalledWith({ status: 'active', category: 'food' })
    })
  })

  describe('userCouponsAvailable', () => {
    test('应同时过滤 status + expiresAt', () => {
      const db = makeDb()
      const now = new Date('2026-06-03T00:00:00Z')
      qb.userCouponsAvailable(db, 'u1', now)
      expect(db._chain.where).toHaveBeenCalledWith({
        userId: 'u1',
        status: 'unused',
        expiresAt: expect.objectContaining({ _op: 'gte' }),
      })
    })
  })

  describe('activityRegistration / tuanParticipants / favorite', () => {
    test('activityRegistration', () => {
      const db = makeDb()
      qb.activityRegistration(db, 'a1', 'u1')
      expect(db._chain.where).toHaveBeenCalledWith({ activityId: 'a1', userId: 'u1' })
    })

    test('tuanParticipants', () => {
      const db = makeDb()
      qb.tuanParticipants(db, 't1')
      expect(db._chain.where).toHaveBeenCalledWith({ tuanId: 't1' })
    })

    test('favorite', () => {
      const db = makeDb()
      qb.favorite(db, 'u1', 'host_1')
      expect(db._chain.where).toHaveBeenCalledWith({ userId: 'u1', targetId: 'host_1' })
    })
  })

  describe('inDateRange', () => {
    test('无 rangeQuery 且无 extraWhere 应直接 collection()', () => {
      const db = makeDb()
      qb.inDateRange(db, 'orders', 'createdAt', null)
      expect(db.collection).toHaveBeenCalledWith('orders')
      expect(db._chain.where).not.toHaveBeenCalled()
    })

    test('有 rangeQuery 应使用 and(gte, lt)', () => {
      const db = makeDb()
      const start = new Date('2026-03-01T00:00:00Z')
      const end = new Date('2026-03-31T00:00:00Z')
      qb.inDateRange(db, 'orders', 'createdAt', {
        _field: 'createdAt', _gte: start, _lt: end, range: 'month',
      })
      expect(db._chain.where).toHaveBeenCalledWith(expect.objectContaining({
        createdAt: expect.objectContaining({ _op: 'and' }),
      }))
    })

    test('extraWhere 应与日期合并', () => {
      const db = makeDb()
      qb.inDateRange(db, 'orders', 'createdAt', {
        _gte: new Date(), _lt: new Date(), range: 'today',
      }, { status: 'paid' })
      expect(db._chain.where).toHaveBeenCalledWith(expect.objectContaining({
        status: 'paid',
        createdAt: expect.any(Object),
      }))
    })
  })
})
