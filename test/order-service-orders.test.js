/**
 * cloudfunctions/orderService/orders.js 单元测试
 * 重点测试 calculatePrice / checkDateAvailability 等纯业务逻辑
 */

const path = require('path')

// 配置 mock wx-server-sdk
// 注意：orders.js 通过 initCloud() 缓存了 db 实例，因此 database() 必须始终返回同一个对象引用
const _collectionsRef = {}

const mockDb = {
  _collections: _collectionsRef,
  _reset() {
    // 清空集合内容，但保持 _collections 引用稳定（避免 orders.js 缓存的 db 失效）
    for (const key of Object.keys(this._collections)) {
      this._collections[key] = { docs: [] }
    }
  },
  collection(name) {
    if (!this._collections[name]) {
      this._collections[name] = { docs: [] }
    }
    // 捕获外层 this（mockDb），避免方法内部 this 指向子对象导致 _collections 找不到
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
        remove: async () => {
          self._collections[name].docs = self._collections[name].docs.filter(d => d._id !== id)
        },
      }),
      where: query => {
        const docs = self._collections[name].docs.filter(doc => {
          for (const [k, v] of Object.entries(query)) {
            // 兼容 db.command.* 操作符
            if (v && typeof v === 'object' && v._op) {
              if (v._op === 'in' && Array.isArray(v.v)) {
                if (!v.v.includes(doc[k])) {return false}
              } else if (v._op === 'nin' && Array.isArray(v.v)) {
                if (v.v.includes(doc[k])) {return false}
              } else if (v._op === 'gte') {
                if (!(doc[k] >= v.v)) {return false}
              } else if (v._op === 'lte') {
                if (!(doc[k] <= v.v)) {return false}
              } else if (v._op === 'eq') {
                if (doc[k] !== v.v) {return false}
              } else if (v._op === 'neq') {
                if (doc[k] === v.v) {return false}
              }
              // 其他操作符（and/or）默认通过
              continue
            }
            // 兼容真实 db.command 的 MongoDB 风格操作符（{ $in: [...] } / { $nin: [...] }）
            if (v && typeof v === 'object' && Array.isArray(v.$in)) {
              if (!v.$in.includes(doc[k])) {return false}
              continue
            }
            if (v && typeof v === 'object' && Array.isArray(v.$nin)) {
              if (v.$nin.includes(doc[k])) {return false}
              continue
            }
            if (doc[k] !== v) {return false}
          }
          return true
        })
        return {
          count: async () => ({ total: docs.length }),
          limit: () => ({ get: async () => ({ data: docs }) }),
          // field(selection)：实现字段投影（仅保留 selection 中为 true 的字段），
          // 并支持链式 .get() / .limit().get()
          field: (selection) => {
            let projected = docs
            if (selection && typeof selection === 'object') {
              const keys = Object.keys(selection).filter(k => selection[k])
              if (keys.length) {
                projected = docs.map(d => {
                  const p = {}
                  for (const k of keys) { p[k] = d[k] }
                  return p
                })
              }
            }
            return {
              get: async () => ({ data: projected }),
              limit: () => ({ get: async () => ({ data: projected }) }),
            }
          },
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

// 提供 db.command 的最小桩（与 cloudfunctions/common/ 下的真实用法对齐）
const dbCommand = {
  in: arr => ({ _op: 'in', v: arr }),
  nin: arr => ({ _op: 'nin', v: arr }),
  gte: v => ({ _op: 'gte', v }),
  lte: v => ({ _op: 'lte', v }),
  and: (...args) => ({ _op: 'and', args }),
  or: (...args) => ({ _op: 'or', args }),
  eq: v => ({ _op: 'eq', v }),
  neq: v => ({ _op: 'neq', v }),
}

// 给 mockDb 注入 command
mockDb.command = dbCommand

jest.mock('wx-server-sdk', () => ({
  init: jest.fn(),
  getWXContext: () => ({ OPENID: 'oTest_openid' }),
  DYNAMIC_CURRENT_ENV: 'mock-env',
  // 始终返回同一个对象引用（订单模块 initCloud() 会缓存结果）
  database: () => mockDb,
}))

const orders = require('../cloudfunctions/orderService/orders')

beforeEach(() => {
  mockDb._reset()
})

describe('orderService/orders', () => {
  describe('calculatePrice', () => {
    test('基础计算：100元/天 × 3天 × 1只 = 300元', async () => {
      mockDb._collections.hostProfiles = { docs: [{ _id: 'host_1', pricePerDay: 100 }] }
      const result = await orders.calculatePrice({
        hostId: 'host_1',
        startDate: '2026-06-01',
        endDate: '2026-06-03',
        petIds: ['pet_a'],
      }, {}, { openid: 'oTest' })
      expect(result).toMatchObject({
        code: 0, // handleSuccess 默认 code
        data: {
          pricePerDay: 100,
          days: 3,
          totalPrice: 300,
        },
      })
    })

    test('多只宠物：100元/天 × 2天 × 3只 = 600元', async () => {
      mockDb._collections.hostProfiles = { docs: [{ _id: 'host_1', pricePerDay: 100 }] }
      const result = await orders.calculatePrice({
        hostId: 'host_1',
        startDate: '2026-06-01',
        endDate: '2026-06-02',
        petIds: ['pet_a', 'pet_b', 'pet_c'],
      }, {}, { openid: 'oTest' })
      expect(result.data.totalPrice).toBe(600)
    })

    test('缺 hostId 应抛 BusinessError', async () => {
      // withErrorHandling 包装后，throw err 被转成 code 1001 响应
      const result = await orders.calculatePrice({ startDate: '2026-06-01', endDate: '2026-06-03' })
      expect(result.code).not.toBe(0)
      expect(result.error?.type).toBe('INVALID_PARAMS')
    })

    test('不存在的 hostId 应抛 NOT_FOUND', async () => {
      mockDb._collections.hostProfiles = { docs: [] }
      const result = await orders.calculatePrice({
        hostId: 'non_existent',
        startDate: '2026-06-01',
        endDate: '2026-06-03',
      })
      expect(result.code).not.toBe(0)
      expect(result.error?.type).toBe('NOT_FOUND')
    })
  })

  describe('checkDateAvailability', () => {
    function setupOrders(initialOrders) {
      mockDb._collections.orders = { docs: initialOrders }
    }

    test('无冲突日期返回 available=true', async () => {
      setupOrders([])
      const result = await orders.checkDateAvailability({
        hostId: 'h1',
        startDate: '2026-06-10',
        endDate: '2026-06-15',
      })
      expect(result.data.available).toBe(true)
    })

    test('完全重叠的订单返回 available=false', async () => {
      setupOrders([
        { hostId: 'h1', startDate: '2026-06-10', endDate: '2026-06-15', status: 'confirmed' },
      ])
      const result = await orders.checkDateAvailability({
        hostId: 'h1',
        startDate: '2026-06-12',
        endDate: '2026-06-14',
      })
      expect(result.data.available).toBe(false)
    })

    test('部分重叠的订单返回 available=false', async () => {
      setupOrders([
        { hostId: 'h1', startDate: '2026-06-10', endDate: '2026-06-15', status: 'confirmed' },
      ])
      const result = await orders.checkDateAvailability({
        hostId: 'h1',
        startDate: '2026-06-14',
        endDate: '2026-06-20',
      })
      expect(result.data.available).toBe(false)
    })

    test('连续但不重叠的订单返回 available=true', async () => {
      setupOrders([
        { hostId: 'h1', startDate: '2026-06-10', endDate: '2026-06-15', status: 'confirmed' },
      ])
      const result = await orders.checkDateAvailability({
        hostId: 'h1',
        startDate: '2026-06-16',
        endDate: '2026-06-20',
      })
      expect(result.data.available).toBe(true)
    })

    test('缺日期参数应返回 available=false', async () => {
      const result = await orders.checkDateAvailability({ hostId: 'h1' })
      expect(result.data.available).toBe(false)
    })

    test('已完成（completed）的订单不阻塞', async () => {
      setupOrders([
        { hostId: 'h1', startDate: '2026-06-10', endDate: '2026-06-15', status: 'completed' },
      ])
      const result = await orders.checkDateAvailability({
        hostId: 'h1',
        startDate: '2026-06-12',
        endDate: '2026-06-14',
      })
      expect(result.data.available).toBe(true)
    })
  })
})
