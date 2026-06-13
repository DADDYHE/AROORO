/**
 * Sprint 12: 寄养订单子链路集成测试
 *
 * 覆盖：
 *   1. 创建订单（pending）
 *   2. 状态机：pending → paid → confirmed → in_progress → completed 全链路
 *   3. 状态机反向/越级操作拒绝
 *   4. 权限校验：仅 owner / host 可操作
 *   5. 退款订单不能再次取消
 *   6. 超时未支付订单拒绝变更
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
        update: async ({ data }) => {
          const doc = self._collections[name].docs.find(d => d._id === id)
          if (doc) {Object.assign(doc, data)}
        },
      }),
      where: query => {
        const docs = self._collections[name].docs.filter(doc => {
          for (const [k, v] of Object.entries(query)) {
            if (v && typeof v === 'object' && v._op) {
              if (v._op === 'gte') {
                const dv = doc[k] instanceof Date ? doc[k].getTime() : doc[k]
                const cv = v.v instanceof Date ? v.v.getTime() : v.v
                if (!(dv >= cv)) {return false}
              } else if (v._op === 'in' && Array.isArray(v.v)) {
                if (!v.v.includes(doc[k])) {return false}
              } else {
                if (doc[k] !== v) {return false}
              }
              continue
            }
            if (doc[k] !== v) {return false}
          }
          return true
        })
        return {
          count: async () => ({ total: docs.length }),
          limit: () => ({ get: async () => ({ data: docs }) }),
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
  getWXContext: () => ({ OPENID: 'oOwner' }),
  DYNAMIC_CURRENT_ENV: 'mock-env',
  database: () => mockDb,
}))

const orders = require('../../cloudfunctions/orderService/orders')

beforeEach(() => {
  mockDb._reset()
})

/**
 * Helper: 创建一个标准寄养订单（owner = oOwner, host = oHost, status = pending）
 */
function createBoardingOrder(overrides = {}) {
  const order = {
    _id: 'ord_001',
    ownerId: 'oOwner',
    hostId: 'oHost',
    organizerId: 'oHost',
    orderType: 'hosting',
    status: 'pending',
    totalPrice: 300,
    petIds: ['pet_1'],
    startDate: '2026-06-10',
    endDate: '2026-06-13',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }
  mockDb._collections.orders = { docs: [order] }
  return order
}

describe('Sprint 12: 寄养订单子链路', () => {
  describe('updateOrderStatus：正常流转', () => {
    test('pending → paid', async () => {
      createBoardingOrder({ status: 'pending' })
      const res = await orders.updateOrderStatus(
        { orderId: 'ord_001', status: 'paid' },
        {},
        { openid: 'oOwner' }
      )
      expect(res.code).toBe(0)
      expect(res.data.status).toBe('paid')
    })

    test('pending → confirmed（host 接单）', async () => {
      createBoardingOrder({ status: 'pending' })
      const res = await orders.updateOrderStatus(
        { orderId: 'ord_001', status: 'confirmed' },
        {},
        { openid: 'oHost' }
      )
      expect(res.code).toBe(0)
      expect(res.data.status).toBe('confirmed')
    })

    test('confirmed → in_progress（开始服务）', async () => {
      createBoardingOrder({ status: 'confirmed' })
      const res = await orders.updateOrderStatus(
        { orderId: 'ord_001', status: 'in_progress' },
        {},
        { openid: 'oHost' }
      )
      expect(res.code).toBe(0)
      expect(res.data.status).toBe('in_progress')
    })

    test('in_progress → completed（完成服务）', async () => {
      createBoardingOrder({ status: 'in_progress' })
      const res = await orders.updateOrderStatus(
        { orderId: 'ord_001', status: 'completed' },
        {},
        { openid: 'oHost' }
      )
      expect(res.code).toBe(0)
      expect(res.data.status).toBe('completed')
    })

    test('完整链路：pending → paid → confirmed → in_progress → completed', async () => {
      createBoardingOrder({ status: 'pending' })

      // 1. pending → paid
      let res = await orders.updateOrderStatus(
        { orderId: 'ord_001', status: 'paid' },
        {},
        { openid: 'oOwner' }
      )
      expect(res.code).toBe(0)

      // 2. paid → confirmed
      res = await orders.updateOrderStatus(
        { orderId: 'ord_001', status: 'confirmed' },
        {},
        { openid: 'oHost' }
      )
      expect(res.code).toBe(0)

      // 3. confirmed → in_progress
      res = await orders.updateOrderStatus(
        { orderId: 'ord_001', status: 'in_progress' },
        {},
        { openid: 'oHost' }
      )
      expect(res.code).toBe(0)

      // 4. in_progress → completed
      res = await orders.updateOrderStatus(
        { orderId: 'ord_001', status: 'completed' },
        {},
        { openid: 'oHost' }
      )
      expect(res.code).toBe(0)

      // 最终状态
      const finalOrder = mockDb._collections.orders.docs[0]
      expect(finalOrder.status).toBe('completed')
    })
  })

  describe('updateOrderStatus：拒绝非法流转', () => {
    test('pending → in_progress（越级）应拒绝', async () => {
      createBoardingOrder({ status: 'pending' })
      const res = await orders.updateOrderStatus(
        { orderId: 'ord_001', status: 'in_progress' },
        {},
        { openid: 'oOwner' }
      )
      expect(res.code).not.toBe(0)
      expect(res.error?.type).toBe('BUSINESS_ERROR')
    })

    test('pending → completed（越级）应拒绝', async () => {
      createBoardingOrder({ status: 'pending' })
      const res = await orders.updateOrderStatus(
        { orderId: 'ord_001', status: 'completed' },
        {},
        { openid: 'oHost' }
      )
      expect(res.code).not.toBe(0)
    })

    test('completed → 任何状态（终态）应拒绝', async () => {
      createBoardingOrder({ status: 'completed' })
      const res = await orders.updateOrderStatus(
        { orderId: 'ord_001', status: 'cancelled' },
        {},
        { openid: 'oOwner' }
      )
      expect(res.code).not.toBe(0)
    })

    test('cancelled → confirmed 应拒绝（终态）', async () => {
      createBoardingOrder({ status: 'cancelled' })
      const res = await orders.updateOrderStatus(
        { orderId: 'ord_001', status: 'confirmed' },
        {},
        { openid: 'oHost' }
      )
      expect(res.code).not.toBe(0)
    })
  })

  describe('updateOrderStatus：权限校验', () => {
    test('非 owner / host 操作应 PERMISSION_DENIED', async () => {
      createBoardingOrder({ status: 'pending' })
      const res = await orders.updateOrderStatus(
        { orderId: 'ord_001', status: 'paid' },
        {},
        { openid: 'oStranger' }
      )
      expect(res.code).not.toBe(0)
      expect(res.error?.type).toBe('PERMISSION_DENIED')
    })

    test('未登录应 AUTH_REQUIRED', async () => {
      createBoardingOrder({ status: 'pending' })
      const res = await orders.updateOrderStatus(
        { orderId: 'ord_001', status: 'paid' },
        {},
        {}
      )
      expect(res.code).not.toBe(0)
      expect(res.error?.type).toBe('AUTH_REQUIRED')
    })

    test('订单不存在应 NOT_FOUND', async () => {
      const res = await orders.updateOrderStatus(
        { orderId: 'missing', status: 'paid' },
        {},
        { openid: 'oOwner' }
      )
      expect(res.code).not.toBe(0)
      expect(res.error?.type).toBe('NOT_FOUND')
    })
  })

  describe('updateOrderStatus：退款 / 超时', () => {
    test('已退款订单不能再次取消', async () => {
      createBoardingOrder({ status: 'confirmed', refundStatus: 'completed' })
      const res = await orders.updateOrderStatus(
        { orderId: 'ord_001', status: 'cancelled' },
        {},
        { openid: 'oOwner' }
      )
      expect(res.code).not.toBe(0)
      expect(res.error?.type).toBe('ORDER_ALREADY_REFUNDED')
    })

    test('已超时未支付的订单拒绝任何状态变更', async () => {
      createBoardingOrder({ status: 'pending', timeoutAt: Date.now() - 1000 })
      const res = await orders.updateOrderStatus(
        { orderId: 'ord_001', status: 'paid' },
        {},
        { openid: 'oOwner' }
      )
      expect(res.code).not.toBe(0)
      expect(res.error?.type).toBe('ORDER_TIMEOUT')
    })
  })

  describe('createOrder：参数校验', () => {
    test('缺 petIds 应 INVALID_PARAMS', async () => {
      mockDb._collections.hostProfiles = { docs: [{ _id: 'oHost', pricePerDay: 100 }] }
      const res = await orders.createOrder(
        { hostId: 'oHost', startDate: '2026-06-10', endDate: '2026-06-13' },
        {},
        { openid: 'oOwner' }
      )
      expect(res.code).not.toBe(0)
    })

    test('缺 hostId 应 INVALID_PARAMS', async () => {
      const res = await orders.createOrder(
        { petIds: ['pet_1'], startDate: '2026-06-10', endDate: '2026-06-13' },
        {},
        { openid: 'oOwner' }
      )
      expect(res.code).not.toBe(0)
    })
  })
})
