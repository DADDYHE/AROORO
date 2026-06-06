/**
 * Sprint 16: submitEvaluation 风控接入验证
 *
 * 覆盖：
 *   1. action=allow → 落库，response.riskDecision='RISK_PASS'
 *   2. action=review → 落库，pendingReview=true，response.riskDecision='RISK_PENDING'
 *   3. action=reject → response.error.type='RISK_REJECT'，不落库
 *   4. RISK_REJECT 错误含 details.reasons / details.level
 *   5. 评分 1-5 范围校验
 *   6. 订单所有权 / 状态校验
 *   7. 重复评价去重
 *
 * 重要：submitEvaluation 用 withErrorHandling 包装，不会 throw，
 *       错误以 response.error.type 形式返回。
 */

const mockDb = {
  _collections: {},
  collection(name) {
    if (!this._collections[name]) {this._collections[name] = { docs: [] }}
    const self = this
    return {
      doc: id => ({
        get: async () => {
          const doc = self._collections[name].docs.find(d => d._id === id)
          return { data: doc || null }
        },
        update: async ({ data }) => {
          const doc = self._collections[name].docs.find(d => d._id === id)
          if (doc) Object.assign(doc, data)
        },
      }),
      where: query => {
        const docs = self._collections[name].docs.filter(doc => {
          for (const [k, v] of Object.entries(query || {})) {
            if (v && typeof v === 'object' && v._op) {
              if (v._op === 'in' && Array.isArray(v.v)) {
                if (!v.v.includes(doc[k])) return false
              } else if (v._op === 'eq') {
                if (doc[k] !== v.v) return false
              } else if (v._op === 'gte') {
                if (doc[k] < v.v) return false
              } else if (v._op === 'lte') {
                if (doc[k] > v.v) return false
              }
              continue
            }
            if (doc[k] !== v) return false
          }
          return true
        })
        const chain = {
          count: async () => ({ total: docs.length }),
          limit: () => chain,
          orderBy: () => chain,
          skip: () => chain,
          field: () => chain,
          get: async () => ({ data: docs }),
        }
        return chain
      },
      add: async ({ data }) => {
        // Sprint 18: 抛 BusinessError 实例（与生产 errors.js 对齐），让 isBusinessError 类型守卫可命中
        if (data && data._id) {
          const exists = self._collections[name].docs.find(d => d._id === data._id)
          if (exists) {
            const { err } = require('../../cloudfunctions/common/errors')
            throw err('DUPLICATE_KEY', '记录已存在', { _id: data._id })
          }
        }
        const newDoc = { ...data }
        self._collections[name].docs.push(newDoc)
        return { _id: newDoc._id }
      },
    }
  },
  command: {
    in: arr => ({ _op: 'in', v: arr }),
    eq: v => ({ _op: 'eq', v }),
    gte: v => ({ _op: 'gte', v }),
    lte: v => ({ _op: 'lte', v }),
    and: (...args) => ({ _op: 'and', args }),
    or: (...args) => ({ _op: 'or', args }),
  },
  serverDate: () => 'MOCK_DATE',
}

jest.mock('wx-server-sdk', () => ({
  init: jest.fn(),
  getWXContext: () => ({ OPENID: 'oTest' }),
  DYNAMIC_CURRENT_ENV: 'mock-env',
  database: () => mockDb,
}))

beforeEach(() => {
  for (const k of Object.keys(mockDb._collections)) {
    mockDb._collections[k] = { docs: [] }
  }
  // Sprint 17：重置风控限流 store，避免跨测试用例相互污染
  const { _resetStore } = require('../../cloudfunctions/common/risk-rate-limit')
  _resetStore()
})

const orders = require('../../cloudfunctions/orderService/orders')

function setupCompletedOrder({
  orderId = 'o1', ownerId = 'oOwner', hostId = 'h1',
  organizerId = 'oHost', status = 'completed',
} = {}) {
  mockDb._collections.orders = { docs: [
    { _id: orderId, ownerId, hostId, organizerId, status, totalPrice: 1000 },
  ]}
  mockDb._collections.hostProfiles = { docs: [
    { _id: hostId, openid: organizerId, hostName: '阳光之家', rating: 0, ratingCount: 0 },
  ]}
  mockDb._collections.evaluations = { docs: [] }
}

describe('Sprint 16: submitEvaluation 风控接入', () => {
  describe('基础校验（错误码响应）', () => {
    test('缺 orderId → error.type=INVALID_PARAMS', async () => {
      setupCompletedOrder()
      const res = await orders.submitEvaluation(
        { rating: 5, comment: '好' },
        {},
        { openid: 'oOwner' }
      )
      expect(res.error.type).toBe('INVALID_PARAMS')
    })

    test('订单不存在 → error.type=ORDER_NOT_FOUND', async () => {
      mockDb._collections.orders = { docs: [] }
      mockDb._collections.evaluations = { docs: [] }
      const res = await orders.submitEvaluation(
        { orderId: 'o_missing', rating: 5, comment: '好' },
        {},
        { openid: 'oOwner' }
      )
      expect(res.error.type).toBe('ORDER_NOT_FOUND')
    })

    test('订单非本人 → error.type=PERMISSION_DENIED', async () => {
      setupCompletedOrder({ ownerId: 'u_other' })
      const res = await orders.submitEvaluation(
        { orderId: 'o1', rating: 5, comment: '好' },
        {},
        { openid: 'oOwner' }
      )
      expect(res.error.type).toBe('PERMISSION_DENIED')
    })

    test('订单未完成 → error.type=BUSINESS_ERROR', async () => {
      setupCompletedOrder({ status: 'pending' })
      const res = await orders.submitEvaluation(
        { orderId: 'o1', rating: 5, comment: '好' },
        {},
        { openid: 'oOwner' }
      )
      expect(res.error.type).toBe('BUSINESS_ERROR')
    })

    test('评分非法（非整数）→ error.type=INVALID_PARAMS', async () => {
      setupCompletedOrder()
      const res = await orders.submitEvaluation(
        { orderId: 'o1', rating: 3.5, comment: '好' },
        {},
        { openid: 'oOwner' }
      )
      expect(res.error.type).toBe('INVALID_PARAMS')
    })

    test('评分非法（> 5）→ error.type=INVALID_PARAMS', async () => {
      setupCompletedOrder()
      const res = await orders.submitEvaluation(
        { orderId: 'o1', rating: 6, comment: '好' },
        {},
        { openid: 'oOwner' }
      )
      expect(res.error.type).toBe('INVALID_PARAMS')
    })
  })

  describe('Sprint 16：风控决策码透传', () => {
    test('action=allow → response.riskDecision=RISK_PASS', async () => {
      setupCompletedOrder()
      const res = await orders.submitEvaluation(
        { orderId: 'o1', rating: 5, comment: '很棒的寄养' },
        {},
        { openid: 'oOwner' }
      )
      expect(res.code).toBe(0)
      expect(res.data.riskDecision).toBe('RISK_PASS')
      expect(res.data.pendingReview).toBe(false)
      expect(res.data.riskReasons).toEqual([])
    })

    test('action=review（高频3次）→ response.riskDecision=RISK_PENDING', async () => {
      setupCompletedOrder()
      // 在 setupCompletedOrder 之后注入历史评价，避免被 setup 重置
      const now = Date.now()
      mockDb._collections.evaluations.docs.push(
        { _id: 'e_p1', ownerId: 'oOwner', hostId: 'h1', orderId: 'o_p1',
          rating: 5, comment: '之前的好评', createdAt: now - 5_000 },
        { _id: 'e_p2', ownerId: 'oOwner', hostId: 'h1', orderId: 'o_p2',
          rating: 5, comment: '之前的好评', createdAt: now - 10_000 },
        { _id: 'e_p3', ownerId: 'oOwner', hostId: 'h1', orderId: 'o_p3',
          rating: 5, comment: '之前的好评', createdAt: now - 15_000 },
      )

      const res = await orders.submitEvaluation(
        { orderId: 'o1', rating: 5, comment: '这次的好评' },
        {},
        { openid: 'oOwner' }
      )
      expect(res.code).toBe(0)
      expect(res.data.riskDecision).toBe('RISK_PENDING')
      expect(res.data.pendingReview).toBe(true)
      expect(res.data.riskReasons.length).toBeGreaterThan(0)
      expect(res.message).toMatch(/抽检/)
    })

    test('action=reject（5 条 1 分钟内）→ error.type=RISK_REJECT', async () => {
      setupCompletedOrder()
      const now = Date.now()
      mockDb._collections.evaluations.docs.push(
        { _id: 'e_p1', ownerId: 'oOwner', hostId: 'h1', orderId: 'o_p1',
          rating: 5, comment: '之前的1', createdAt: now - 5_000 },
        { _id: 'e_p2', ownerId: 'oOwner', hostId: 'h1', orderId: 'o_p2',
          rating: 5, comment: '之前的2', createdAt: now - 10_000 },
        { _id: 'e_p3', ownerId: 'oOwner', hostId: 'h1', orderId: 'o_p3',
          rating: 5, comment: '之前的3', createdAt: now - 15_000 },
        { _id: 'e_p4', ownerId: 'oOwner', hostId: 'h1', orderId: 'o_p4',
          rating: 5, comment: '之前的4', createdAt: now - 20_000 },
        { _id: 'e_p5', ownerId: 'oOwner', hostId: 'h1', orderId: 'o_p5',
          rating: 5, comment: '之前的5', createdAt: now - 25_000 },
      )

      const res = await orders.submitEvaluation(
        { orderId: 'o1', rating: 5, comment: '这次' },
        {},
        { openid: 'oOwner' }
      )
      expect(res.error.type).toBe('RISK_REJECT')
      expect(res.data).toBe(null)
    })

    test('RISK_REJECT 错误含 details.reasons + level', async () => {
      setupCompletedOrder()
      const now = Date.now()
      mockDb._collections.evaluations.docs.push(
        { _id: 'e_p1', ownerId: 'oOwner', hostId: 'h1', orderId: 'o_p1',
          rating: 5, comment: '之前的1', createdAt: now - 5_000 },
        { _id: 'e_p2', ownerId: 'oOwner', hostId: 'h1', orderId: 'o_p2',
          rating: 5, comment: '之前的2', createdAt: now - 10_000 },
        { _id: 'e_p3', ownerId: 'oOwner', hostId: 'h1', orderId: 'o_p3',
          rating: 5, comment: '之前的3', createdAt: now - 15_000 },
        { _id: 'e_p4', ownerId: 'oOwner', hostId: 'h1', orderId: 'o_p4',
          rating: 5, comment: '之前的4', createdAt: now - 20_000 },
        { _id: 'e_p5', ownerId: 'oOwner', hostId: 'h1', orderId: 'o_p5',
          rating: 5, comment: '之前的5', createdAt: now - 25_000 },
      )

      const res = await orders.submitEvaluation(
        { orderId: 'o1', rating: 5, comment: '这次' },
        {},
        { openid: 'oOwner' }
      )
      expect(res.error.type).toBe('RISK_REJECT')
      expect(res.error.details).toBeDefined()
      expect(res.error.details.reasons).toBeDefined()
      expect(Array.isArray(res.error.details.reasons)).toBe(true)
      expect(res.error.details.level).toBe('high')
      expect(res.error.details.orderId).toBe('o1')
    })

    test('action=reject 不写库', async () => {
      setupCompletedOrder()
      const now = Date.now()
      mockDb._collections.evaluations.docs.push(
        { _id: 'e_p1', ownerId: 'oOwner', hostId: 'h1', orderId: 'o_p1',
          rating: 5, comment: '1', createdAt: now - 5_000 },
        { _id: 'e_p2', ownerId: 'oOwner', hostId: 'h1', orderId: 'o_p2',
          rating: 5, comment: '2', createdAt: now - 10_000 },
        { _id: 'e_p3', ownerId: 'oOwner', hostId: 'h1', orderId: 'o_p3',
          rating: 5, comment: '3', createdAt: now - 15_000 },
        { _id: 'e_p4', ownerId: 'oOwner', hostId: 'h1', orderId: 'o_p4',
          rating: 5, comment: '4', createdAt: now - 20_000 },
        { _id: 'e_p5', ownerId: 'oOwner', hostId: 'h1', orderId: 'o_p5',
          rating: 5, comment: '5', createdAt: now - 25_000 },
      )
      const beforeCount = mockDb._collections.evaluations.docs.length

      await orders.submitEvaluation(
        { orderId: 'o1', rating: 5, comment: '这次' },
        {},
        { openid: 'oOwner' }
      )

      expect(mockDb._collections.evaluations.docs.length).toBe(beforeCount)
    })
  })

  describe('兼容：重复评价', () => {
    test('同 orderId 已评价 → 透传 + duplicate=true', async () => {
      setupCompletedOrder()
      mockDb._collections.evaluations.docs.push({
        _id: 'e_existing', orderId: 'o1', ownerId: 'oOwner',
        rating: 5, comment: '之前', createdAt: Date.now() - 60_000,
      })
      const res = await orders.submitEvaluation(
        { orderId: 'o1', rating: 5, comment: '这次' },
        {},
        { openid: 'oOwner' }
      )
      expect(res.data.duplicate).toBe(true)
    })
  })
})
