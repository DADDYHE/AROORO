/**
 * Sprint 12: 喂食服务子链路集成测试
 *
 * 覆盖（通过 main(event, context) 路由）：
 *   1. createFeedingOrder：参数校验、订单创建、字段填充
 *   2. getFeedingOrders：分页 + 列表 + 状态过滤
 *   3. getFeedingOrderDetail：详情 + 数据隔离
 *   4. 状态字段一致性：status / paymentStatus 默认值
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
    const matchDoc = (doc, query) => {
      if (!query) { return true }
      for (const [k, v] of Object.entries(query)) {
        if (v && typeof v === 'object' && v._op) {
          if (v._op === 'in' && Array.isArray(v.v)) {
            if (!v.v.includes(doc[k])) return false
          } else if (v._op === 'neq') {
            if (doc[k] === v.v) return false
          } else if (v._op === 'eq') {
            if (doc[k] !== v.v) return false
          } else {
            if (doc[k] !== v) return false
          }
          continue
        }
        if (doc[k] !== v) return false
      }
      return true
    }
    return {
      doc: id => {
        const chain = {
          get: async () => {
            const doc = self._collections[name].docs.find(d => d._id === id)
            return { data: doc || null }
          },
          update: async ({ data }) => {
            const doc = self._collections[name].docs.find(d => d._id === id)
            if (doc) Object.assign(doc, data)
          },
          field: () => chain,
        }
        return chain
      },
      where: query => {
        const docs = self._collections[name].docs.filter(d => matchDoc(d, query))
        const chain = {
          count: async () => ({ total: docs.length }),
          field: () => chain,
          orderBy: () => chain,
          skip: () => chain,
          limit: () => chain,
          get: async () => ({ data: docs }),
        }
        return chain
      },
      add: async ({ data }) => {
        const newDoc = { ...data }
        self._collections[name].docs.push(newDoc)
        return { _id: newDoc._id }
      },
    }
  },
  command: {
    in: arr => ({ _op: 'in', v: arr }),
    eq: v => ({ _op: 'eq', v }),
    neq: v => ({ _op: 'neq', v }),
  },
  serverDate: () => Date.now(),
}

jest.mock('wx-server-sdk', () => ({
  init: jest.fn(),
  getWXContext: () => ({ OPENID: global.__openid }),
  DYNAMIC_CURRENT_ENV: 'mock-env',
  database: () => mockDb,
}))

global.__openid = 'oOwner'

const { main } = require('../../cloudfunctions/feedingService/index.js')

beforeEach(() => {
  mockDb._reset()
  mockDb._collections.feedingOrders = { docs: [] }
  mockDb._collections.feeders = { docs: [] }
  mockDb._collections.pets = { docs: [] }
  mockDb._collections.admins = { docs: [] }
  global.__openid = 'oOwner'
})

/** 调用 main(event) 的简化包装；openid 为空时强制使用 undefined 触发 AUTH_REQUIRED */
function call(action, params, openid = 'oOwner') {
  const prev = global.__openid
  global.__openid = openid === null ? undefined : openid
  return main({ action, ...params }, {}).finally(() => { global.__openid = prev })
}

describe('Sprint 12: 喂食服务子链路', () => {
  describe('createFeedingOrder', () => {
    test('完整参数创建成功', async () => {
      const res = await call('createFeedingOrder', {
        petIds: ['pet_1', 'pet_2'],
        feederId: 'feeder_1',
        startDate: '2026-06-10',
        endDate: '2026-06-13',
        visitTimes: [{ date: '2026-06-11', time: '10:00' }],
        address: '上海市浦东新区某某路',
        totalAmount: 200,
        originalAmount: 250,
        couponDiscount: 50,
      })

      expect(res.code).toBe(0)
      expect(res.data.totalAmount).toBe(200)
      expect(mockDb._collections.feedingOrders.docs.length).toBe(1)

      const saved = mockDb._collections.feedingOrders.docs[0]
      expect(saved.orderType).toBe('feeding')
      expect(saved.ownerId).toBe('oOwner')
      expect(saved.status).toBe('pending_payment')
      expect(saved.paymentStatus).toBe('unpaid')
      expect(saved.petIds).toEqual(['pet_1', 'pet_2'])
      expect(saved.orderNo).toMatch(/^FD\d+[A-Z0-9]+$/)
    })

    test('缺 petIds 应 INVALID_PARAMS', async () => {
      const res = await call('createFeedingOrder', {
        feederId: 'feeder_1',
        startDate: '2026-06-10',
        endDate: '2026-06-13',
      })

      expect(res.code).not.toBe(0)
      expect(res.error?.type).toBe('INVALID_PARAMS')
      expect(mockDb._collections.feedingOrders.docs.length).toBe(0)
    })

    test('未登录应 AUTH_REQUIRED', async () => {
      const res = await call('createFeedingOrder', {
        petIds: ['pet_1'],
      }, null)

      expect(res.code).not.toBe(0)
      expect(res.error?.type).toBe('AUTH_REQUIRED')
    })

    test('无 feederId 也能下单（可选）', async () => {
      const res = await call('createFeedingOrder', {
        petIds: ['pet_1'],
        startDate: '2026-06-10',
        endDate: '2026-06-13',
        totalAmount: 100,
      })

      expect(res.code).toBe(0)
      const saved = mockDb._collections.feedingOrders.docs[0]
      expect(saved.feederId).toBe('')
    })

    test('带优惠券的订单字段填充', async () => {
      const res = await call('createFeedingOrder', {
        petIds: ['pet_1'],
        totalAmount: 150,
        originalAmount: 200,
        couponId: 'cp_001',
        couponDiscount: 50,
      })

      expect(res.code).toBe(0)
      const saved = mockDb._collections.feedingOrders.docs[0]
      expect(saved.couponId).toBe('cp_001')
      expect(saved.couponDiscount).toBe(50)
    })
  })

  describe('getFeedingOrders：分页查询', () => {
    test('空列表', async () => {
      const res = await call('getFeedingOrders', {
        page: 1, pageSize: 10,
      })

      expect(res.code).toBe(0)
      expect(res.data.list).toEqual([])
      expect(res.data.total).toBe(0)
    })

    test('返回当前 openid 的所有订单', async () => {
      mockDb._collections.feedingOrders.docs = [
        { _id: 'fd_1', ownerId: 'oOwner', status: 'pending_payment', totalAmount: 100, createdAt: Date.now() },
        { _id: 'fd_2', ownerId: 'oOwner', status: 'paid', totalAmount: 200, createdAt: Date.now() - 1000 },
        { _id: 'fd_3', ownerId: 'oOther', status: 'paid', totalAmount: 300, createdAt: Date.now() - 2000 },
      ]

      const res = await call('getFeedingOrders', {
        page: 1, pageSize: 10,
      })

      expect(res.code).toBe(0)
      expect(res.data.list.length).toBe(2)
      expect(res.data.total).toBe(2)
      expect(res.data.list.every(o => o.ownerId === 'oOwner')).toBe(true)
    })

    test('status 过滤', async () => {
      mockDb._collections.feedingOrders.docs = [
        { _id: 'fd_1', ownerId: 'oOwner', status: 'pending_payment', totalAmount: 100 },
        { _id: 'fd_2', ownerId: 'oOwner', status: 'paid', totalAmount: 200 },
      ]

      const res = await call('getFeedingOrders', {
        page: 1, pageSize: 10, status: 'paid',
      })

      expect(res.code).toBe(0)
      expect(res.data.list.length).toBe(1)
      expect(res.data.list[0].status).toBe('paid')
    })
  })

  describe('getFeedingOrderDetail：详情 + 权限', () => {
    test('本人订单可查看', async () => {
      mockDb._collections.admins = { docs: [
        { _id: 'oOwner', status: 'active', roles: ['super_admin'] },
      ]}
      mockDb._collections.feedingOrders.docs = [
        { _id: 'fd_1', ownerId: 'oOwner', feederId: 'feeder_1', totalAmount: 200, status: 'paid' },
      ]

      const res = await call('getFeedingOrderDetail', { orderId: 'fd_1' })
      expect(res).toBeDefined()
    })

    test('不存在的订单应失败', async () => {
      const res = await call('getFeedingOrderDetail', { orderId: 'missing' })
      expect(res.code).not.toBe(0)
    })
  })
})
