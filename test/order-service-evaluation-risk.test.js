/**
 * Sprint 12: submitEvaluation 风险控制接入测试
 *
 * 验证：
 *   1. 正常评价（allow）→ 落库 + pendingReview=false
 *   2. 中等风险（review）→ 落库 + pendingReview=true
 *   3. 高风险（reject）→ 抛出 RATE_LIMITED
 *   4. 风控模块自身异常不应阻塞主流程
 *   5. 业务校验（订单不存在、未完成、缺权限）仍优先于风控
 */

const mockDb = {
  _collections: {},
  _reset() {
    for (const key of Object.keys(this._collections)) {
      this._collections[key] = { docs: [] }
    }
  },
  collection(name) {
    if (!this._collections[name]) {
      this._collections[name] = { docs: [] }
    }
    const self = this
    return {
      doc: id => ({
        get: async () => {
          const doc = self._collections[name].docs.find(d => d._id === id)
          return { data: doc || null }
        },
      }),
      where: query => {
        const docs = self._collections[name].docs.filter(doc => {
          for (const [k, v] of Object.entries(query)) {
            if (v && typeof v === 'object' && v._op) {
              if (v._op === 'gte') {
                const dv = doc[k] instanceof Date ? doc[k].getTime() : doc[k]
                const cv = v.v instanceof Date ? v.v.getTime() : v.v
                if (!(dv >= cv)) return false
              } else if (v._op === 'lte') {
                const dv = doc[k] instanceof Date ? doc[k].getTime() : doc[k]
                const cv = v.v instanceof Date ? v.v.getTime() : v.v
                if (!(dv <= cv)) return false
              } else if (v._op === 'in' && Array.isArray(v.v)) {
                if (!v.v.includes(doc[k])) return false
              } else {
                if (doc[k] !== v) return false
              }
              continue
            }
            if (doc[k] !== v) return false
          }
          return true
        })
        return {
          count: async () => ({ total: docs.length }),
          limit: () => ({ get: async () => ({ data: docs }) }),
          field: () => ({ limit: () => ({ get: async () => ({ data: docs }) }) }),
          get: async () => ({ data: docs }),
        }
      },
      add: async ({ data }) => {
        const newDoc = { ...data }
        self._collections[name].docs.push(newDoc)
        return { _id: newDoc._id }
      },
    }
  },
  command: { in: arr => ({ _op: 'in', v: arr }) },
  serverDate: () => Date.now(),
}

jest.mock('wx-server-sdk', () => ({
  init: jest.fn(),
  getWXContext: () => ({ OPENID: 'oTest' }),
  DYNAMIC_CURRENT_ENV: 'mock-env',
  database: () => mockDb,
}))

const orders = require('../cloudfunctions/orderService/orders')

beforeEach(() => {
  mockDb._reset()
  // 注入一个已完成订单作为前置
  mockDb._collections.orders = {
    docs: [{
      _id: 'ord_001',
      ownerId: 'oTest',
      hostId: 'host_001',
      organizerId: 'host_001',
      status: 'completed',
    }],
  }
  mockDb._collections.evaluations = { docs: [] }
})

describe('Sprint 12: submitEvaluation 风险控制接入', () => {
  test('正常评价（无风险）→ 落库 + pendingReview=false', async () => {
    const result = await orders.submitEvaluation({
      orderId: 'ord_001',
      rating: 5,
      comment: '服务很棒，宠物很开心，下次还来。',
    }, {}, { openid: 'oTest' })

    expect(result.code).toBe(0)
    expect(result.data.pendingReview).toBe(false)
    expect(mockDb._collections.evaluations.docs.length).toBe(1)
  })

  test('5 星 + 重复文案（触发 DUP_COMMENT）→ 落库 + pendingReview=true', async () => {
    // 预置 2 条同文案评价（确保 count >= DUP_COMMENT_THRESHOLD=2）
    mockDb._collections.evaluations.docs.push(
      {
        _id: 'eval_existing_1',
        ownerId: 'oTest',
        hostId: 'host_002',
        orderId: 'ord_other_1',
        rating: 5,
        comment: '服务很棒，宠物很开心，下次还来。',
        createdAt: Date.now() - 2 * 24 * 60 * 60 * 1000, // 2 天前
      },
      {
        _id: 'eval_existing_2',
        ownerId: 'oTest',
        hostId: 'host_003',
        orderId: 'ord_other_2',
        rating: 5,
        comment: '服务很棒，宠物很开心，下次还来。',
        createdAt: Date.now() - 1 * 24 * 60 * 60 * 1000, // 1 天前
      }
    )

    const result = await orders.submitEvaluation({
      orderId: 'ord_001',
      rating: 5,
      comment: '服务很棒，宠物很开心，下次还来。',
    }, {}, { openid: 'oTest' })

    expect(result.code).toBe(0)
    expect(result.data.pendingReview).toBe(true)
    expect(result.message).toContain('抽检')
  })

  test('极端高频：60s 内 5 条评价（用户历史 5 条 + 此次 = 6，HIGH_FREQ_THRESHOLD+3）→ reject', async () => {
    // 预置 5 条同用户近 1 分钟评价
    const now = Date.now()
    mockDb._collections.evaluations.docs = [
      { _id: 'e1', ownerId: 'oTest', hostId: 'h1', orderId: 'o1', rating: 5, comment: 'a', createdAt: now - 30 * 1000 },
      { _id: 'e2', ownerId: 'oTest', hostId: 'h2', orderId: 'o2', rating: 5, comment: 'b', createdAt: now - 25 * 1000 },
      { _id: 'e3', ownerId: 'oTest', hostId: 'h3', orderId: 'o3', rating: 5, comment: 'c', createdAt: now - 20 * 1000 },
      { _id: 'e4', ownerId: 'oTest', hostId: 'h4', orderId: 'o4', rating: 5, comment: 'd', createdAt: now - 15 * 1000 },
      { _id: 'e5', ownerId: 'oTest', hostId: 'h5', orderId: 'o5', rating: 5, comment: 'e', createdAt: now - 10 * 1000 },
    ]

    const result = await orders.submitEvaluation({
      orderId: 'ord_001',
      rating: 5,
      comment: '好',
    }, {}, { openid: 'oTest' })

    expect(result.code).not.toBe(0)
    // Sprint 16: 升级为 RISK_REJECT 错误码（替代旧的 RATE_LIMITED）
    expect(result.error?.type).toBe('RISK_REJECT')
    expect(result.message).toContain('风控')
    // 评价不应被写入
    expect(mockDb._collections.evaluations.docs.length).toBe(5)
  })

  test('订单不存在应优先于风控抛出 ORDER_NOT_FOUND', async () => {
    const result = await orders.submitEvaluation({
      orderId: 'ord_not_exist',
      rating: 5,
      comment: '很好',
    }, {}, { openid: 'oTest' })

    expect(result.code).not.toBe(0)
    expect(result.error?.type).toBe('ORDER_NOT_FOUND')
  })

  test('未完成订单应优先于风控抛出 BUSINESS_ERROR', async () => {
    mockDb._collections.orders.docs[0].status = 'in_progress'
    const result = await orders.submitEvaluation({
      orderId: 'ord_001',
      rating: 5,
      comment: '很好',
    }, {}, { openid: 'oTest' })

    expect(result.code).not.toBe(0)
    expect(result.error?.type).toBe('BUSINESS_ERROR')
  })

  test('非本人订单应优先于风控抛出 PERMISSION_DENIED', async () => {
    mockDb._collections.orders.docs[0].ownerId = 'oOther'
    const result = await orders.submitEvaluation({
      orderId: 'ord_001',
      rating: 5,
      comment: '很好',
    }, {}, { openid: 'oTest' })

    expect(result.code).not.toBe(0)
    expect(result.error?.type).toBe('PERMISSION_DENIED')
  })

  test('已评价订单返回 duplicate=true（不触发风控重算）', async () => {
    mockDb._collections.evaluations.docs.push({
      _id: 'eval_existing',
      orderId: 'ord_001',
      ownerId: 'oTest',
      hostId: 'host_001',
      rating: 5,
      comment: 'old',
    })

    const result = await orders.submitEvaluation({
      orderId: 'ord_001',
      rating: 5,
      comment: 'new comment',
    }, {}, { openid: 'oTest' })

    expect(result.code).toBe(0)
    expect(result.data.duplicate).toBe(true)
    // 不应该新建
    expect(mockDb._collections.evaluations.docs.length).toBe(1)
  })

  test('无 hostId 的订单也能正常完成风控检查（无 host 集中维度命中）', async () => {
    mockDb._collections.orders.docs[0].hostId = ''
    const result = await orders.submitEvaluation({
      orderId: 'ord_001',
      rating: 4,
      comment: '还行',
    }, {}, { openid: 'oTest' })

    // 不应被风控拦截
    expect(result.code).toBe(0)
  })
})
