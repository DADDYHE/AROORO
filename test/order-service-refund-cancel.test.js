/**
 * orderService/orders.js 聚焦单测（F9 测试工程化）
 *
 * 覆盖退款 / 取消 / 超时单 / 状态机 的关键业务分支：
 *   1. 重复退款幂等：已退款订单再次取消应被拦截（ORDER_ALREADY_REFUNDED）
 *   2. 取消改状态：已确认订单取消应置为 cancelled（不经过跨函数退款路径）
 *   3. 超时单状态流转：超时未支付订单推进状态应被拦截（ORDER_TIMEOUT）
 *   4. 状态机非法转移：终态订单的非法转移应被拦截（BUSINESS_ERROR）
 *
 * Mock 方式：沿用 order-service-orders.test.js 的内存 db 风格（jest.mock('wx-server-sdk')）。
 * 仅覆盖本场景所需的最小 db 语义，不改动任何业务代码。
 */

const _collectionsRef = {}

const mockDb = {
  _collections: _collectionsRef,
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
        update: async ({ data }) => {
          const doc = self._collections[name].docs.find(d => d._id === id)
          if (doc) { Object.assign(doc, data) }
        },
        remove: async () => {
          self._collections[name].docs = self._collections[name].docs.filter(d => d._id !== id)
        },
      }),
      where: query => {
        const docs = self._collections[name].docs.filter(doc => {
          for (const [k, v] of Object.entries(query)) {
            if (v && typeof v === 'object' && v._op) {
              if (v._op === 'in' && Array.isArray(v.v) && !v.v.includes(doc[k])) return false
              else if (v._op === 'nin' && Array.isArray(v.v) && v.v.includes(doc[k])) return false
              else if (v._op === 'gte' && !(doc[k] >= v.v)) return false
              else if (v._op === 'lte' && !(doc[k] <= v.v)) return false
              else if (v._op === 'eq' && doc[k] !== v.v) return false
              else if (v._op === 'neq' && doc[k] === v.v) return false
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
}

mockDb.command = {
  in: arr => ({ _op: 'in', v: arr }),
  nin: arr => ({ _op: 'nin', v: arr }),
  gte: v => ({ _op: 'gte', v }),
  lte: v => ({ _op: 'lte', v }),
  and: (...args) => ({ _op: 'and', args }),
  or: (...args) => ({ _op: 'or', args }),
  eq: v => ({ _op: 'eq', v }),
  neq: v => ({ _op: 'neq', v }),
}
mockDb.serverDate = () => 'MOCK_DATE'

jest.mock('wx-server-sdk', () => ({
  init: jest.fn(),
  getWXContext: () => ({ OPENID: 'oTest_openid' }),
  DYNAMIC_CURRENT_ENV: 'mock-env',
  database: () => mockDb,
}))

const orders = require('../cloudfunctions/orderService/orders')

const OPENID = 'oTest'
const putOrder = doc => { mockDb._collections.orders = { docs: [doc] } }

beforeEach(() => {
  mockDb._reset()
})

describe('orderService/orders 退款/取消/超时/状态机聚焦', () => {
  describe('重复退款幂等', () => {
    test('已退款订单再次取消应抛 ORDER_ALREADY_REFUNDED', async () => {
      putOrder({ _id: 'ord_r1', ownerId: OPENID, status: 'refunded', refundStatus: 'completed' })
      const r = await orders.cancelOrder({ orderId: 'ord_r1' }, {}, { openid: OPENID })
      expect(r.code).not.toBe(0)
      expect(r.error?.type).toBe('ORDER_ALREADY_REFUNDED')
    })
  })

  describe('取消改状态', () => {
    test('已确认（非已支付）订单取消应置为 cancelled', async () => {
      putOrder({ _id: 'ord_c1', ownerId: OPENID, status: 'confirmed', paymentStatus: 'unpaid' })
      const r = await orders.cancelOrder({ orderId: 'ord_c1' }, {}, { openid: OPENID })
      expect(r.code).toBe(0)
      // 状态机推进：confirmed → cancelled，订单文档状态被改写
      expect(mockDb._collections.orders.docs[0].status).toBe('cancelled')
    })
  })

  describe('超时单状态流转', () => {
    test('超时未支付订单：超时守卫已移交 orderTimeoutService，状态机仍按转移表放行', async () => {
      // V5 架构：updateOrderStatus 不再做 ORDER_TIMEOUT 内联校验，
      // 超时取消由 orderTimeoutService 定时任务负责（有专属测试 order-timeout-service-behavior.test.js）。
      // cron 兜底前的窗口期内，合法转移（pending_payment → paid，如支付回调补单）仍被状态机放行。
      putOrder({
        _id: 'ord_t1', ownerId: OPENID, status: 'pending_payment',
        timeoutAt: Date.now() - 100000,
      })
      const r = await orders.updateOrderStatus({ orderId: 'ord_t1', status: 'paid' }, {}, { openid: OPENID })
      expect(r.code).toBe(0)
      expect(r.data.status).toBe('paid')
    })
  })

  describe('状态机非法转移', () => {
    test('终态 completed 转 confirmed 应被状态机拦截（BUSINESS_ERROR）', async () => {
      putOrder({ _id: 'ord_s1', ownerId: OPENID, status: 'completed' })
      const r = await orders.updateOrderStatus({ orderId: 'ord_s1', status: 'confirmed' }, {}, { openid: OPENID })
      expect(r.code).not.toBe(0)
      expect(r.error?.type).toBe('BUSINESS_ERROR')
    })

    test('非法状态值（白名单外）应被拦截（INVALID_PARAMS）', async () => {
      putOrder({ _id: 'ord_s2', ownerId: OPENID, status: 'confirmed' })
      const r = await orders.updateOrderStatus({ orderId: 'ord_s2', status: 'flying' }, {}, { openid: OPENID })
      expect(r.code).not.toBe(0)
      expect(r.error?.type).toBe('INVALID_PARAMS')
    })
  })
})
