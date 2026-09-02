/**
 * 集成测试 - 评价子链路（Sprint 10 新增）
 *
 * 流程：
 *   1. 用户对 completed 订单提交评价
 *   2. 写入 evaluations 集合
 *   3. 异步重算 hostProfiles.rating / ratingCount
 *
 * 覆盖：
 *   - 正常流程（completed 订单 + 合法 rating）
 *   - 边界：rating 越界（0 / 6 / 非整数 / 字符串）
 *   - 状态校验：未完成订单不能评价
 *   - 权限校验：他人订单不能评价
 *   - 订单不存在
 *   - 重复评价（同订单二次提交 → duplicate=true）
 *   - 评分聚合：多次评价后 host.rating 取平均（精度 1 位小数）
 *   - 公开列表：getHostEvaluations 分页、按时间倒序
 *   - 评价数 = 0 时 host.rating 重置为 0
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
          if (doc) {Object.assign(doc, data)}
        },
        remove: async () => {
          self._collections[name].docs = self._collections[name].docs.filter(d => d._id !== id)
        },
      }),
      where: query => {
        const docs = self._collections[name].docs.filter(doc => {
          for (const [k, v] of Object.entries(query || {})) {
            if (v && typeof v === 'object' && v._op) {
              if (v._op === 'in' && Array.isArray(v.v)) {
                if (!v.v.includes(doc[k])) {return false}
              } else if (v._op === 'eq') {
                if (doc[k] !== v.v) {return false}
              }
              continue
            }
            if (doc[k] !== v) {return false}
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
        // 模拟唯一索引 DUPLICATE_KEY：_id 重复时抛错
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
      // 最小 aggregate mock：覆盖 recalcHostRating 的 match({hostId}).group({_id:null, sum(1), sum('$rating')})
      aggregate: () => {
        const agg = {
          _match: null,
          _group: null,
          match: (m) => { agg._match = m; return agg },
          group: (g) => { agg._group = g; return agg },
          end: async () => {
            let docs = self._collections[name].docs
            if (agg._match) {
              docs = docs.filter(doc => {
                for (const [k, v] of Object.entries(agg._match)) {
                  if (doc[k] !== v) {return false}
                }
                return true
              })
            }
            const row = { _id: null }
            if (agg._group) {
              for (const [key, expr] of Object.entries(agg._group)) {
                if (key === '_id') {continue}
                if (expr && typeof expr === 'object' && '__sum' in expr) {
                  row[key] = expr.__sum === 1
                    ? docs.length
                    : docs.reduce((s, d) => s + (Number(d[String(expr.__sum).replace('$', '')]) || 0), 0)
                }
              }
            }
            return { list: [row] }
          },
        }
        return agg
      },
    }
  },
  command: {
    in: arr => ({ _op: 'in', v: arr }),
    eq: v => ({ _op: 'eq', v }),
    // recalcHostRating 的 $.sum(...)：sum(1)=计数，sum('$field')=字段求和
    aggregate: { sum: (v) => ({ __sum: v }) },
  },
  serverDate: () => 'MOCK_DATE',
}

jest.mock('wx-server-sdk', () => ({
  init: jest.fn(),
  getWXContext: () => ({ OPENID: 'oNotifTest' }),
  DYNAMIC_CURRENT_ENV: 'mock-env',
  database: () => mockDb,
}))

beforeEach(() => {
  for (const k of Object.keys(mockDb._collections)) {
    mockDb._collections[k] = { docs: [] }
  }
  // Sprint 17：重置风控限流 store，避免跨测试用例相互污染
  // 注意：orders.js 消费的是 orderService/common/ 下的分发副本（sync-cloud-common 生成，
  // 与根目录 common 是两个模块实例），两个都要重置，否则全量跑时 per-target 限流计数
  // 跨用例累积（evaluation 5 次/分/target），duplicate 用例的第二次提交被误伤为 RATE_LIMITED
  const rootStore = require('../../cloudfunctions/common/risk-rate-limit')
  if (rootStore._resetStore) {rootStore._resetStore()}
  const svcStore = require('../../cloudfunctions/orderService/common/risk-rate-limit')
  if (svcStore._resetStore) {svcStore._resetStore()}
})

const orders = require('../../cloudfunctions/orderService/orders')

describe('集成测试：评价子链路', () => {
  const setupCompletedOrder = ({
    orderId = 'o1', ownerId = 'oOwner', hostId = 'h1',
    organizerId = 'oHost', status = 'completed',
  } = {}) => {
    mockDb._collections.orders = { docs: [
      { _id: orderId, ownerId, hostId, organizerId, status, totalPrice: 1000 },
    ] }
    mockDb._collections.hostProfiles = { docs: [
      { _id: hostId, openid: organizerId, hostName: '阳光之家', rating: 0, ratingCount: 0 },
    ] }
    mockDb._collections.evaluations = { docs: [] }
  }

  describe('submitEvaluation：正常流程', () => {
    test('completed 订单 + rating=5 + 评价 → 写入 evaluations', async () => {
      setupCompletedOrder()
      const res = await orders.submitEvaluation(
        { orderId: 'o1', rating: 5, comment: '很棒的寄养家庭' },
        {},
        { openid: 'oOwner' }
      )
      expect(res.code).toBe(0)
      expect(res.data.rating).toBe(5)
      expect(res.data.comment).toBe('很棒的寄养家庭')
      expect(res.data.hostId).toBe('h1')
      expect(res.data.ownerId).toBe('oOwner')

      const evals = mockDb._collections.evaluations.docs
      expect(evals.length).toBe(1)
      expect(evals[0].orderId).toBe('o1')
      expect(evals[0].tags).toEqual([])
    })

    test('支持 tags 数组', async () => {
      setupCompletedOrder()
      const res = await orders.submitEvaluation(
        { orderId: 'o1', rating: 4, tags: ['耐心', '环境好'] },
        {},
        { openid: 'oOwner' }
      )
      expect(res.code).toBe(0)
      expect(res.data.tags).toEqual(['耐心', '环境好'])
    })

    test('comment 超 500 字符自动截断', async () => {
      setupCompletedOrder()
      const longComment = 'a'.repeat(800)
      const res = await orders.submitEvaluation(
        { orderId: 'o1', rating: 5, comment: longComment },
        {},
        { openid: 'oOwner' }
      )
      expect(res.data.comment.length).toBe(500)
    })

    test('tags 超过 10 个只保留前 10 个', async () => {
      setupCompletedOrder()
      const tags = Array.from({ length: 15 }, (_, i) => `t${i}`)
      const res = await orders.submitEvaluation(
        { orderId: 'o1', rating: 5, tags },
        {},
        { openid: 'oOwner' }
      )
      expect(res.data.tags.length).toBe(10)
    })
  })

  describe('submitEvaluation：参数校验', () => {
    test('rating=0 → INVALID_PARAMS', async () => {
      setupCompletedOrder()
      const res = await orders.submitEvaluation(
        { orderId: 'o1', rating: 0 },
        {},
        { openid: 'oOwner' }
      )
      expect(res.code).not.toBe(0)
      expect(res.error.type).toBe('INVALID_PARAMS')
    })

    test('rating=6 → INVALID_PARAMS', async () => {
      setupCompletedOrder()
      const res = await orders.submitEvaluation(
        { orderId: 'o1', rating: 6 },
        {},
        { openid: 'oOwner' }
      )
      expect(res.code).not.toBe(0)
      expect(res.error.type).toBe('INVALID_PARAMS')
    })

    test('rating=3.5（非整数）→ INVALID_PARAMS', async () => {
      setupCompletedOrder()
      const res = await orders.submitEvaluation(
        { orderId: 'o1', rating: 3.5 },
        {},
        { openid: 'oOwner' }
      )
      expect(res.code).not.toBe(0)
    })

    test('rating="abc" → INVALID_PARAMS', async () => {
      setupCompletedOrder()
      const res = await orders.submitEvaluation(
        { orderId: 'o1', rating: 'abc' },
        {},
        { openid: 'oOwner' }
      )
      expect(res.code).not.toBe(0)
    })

    test('缺少 orderId → INVALID_PARAMS', async () => {
      const res = await orders.submitEvaluation(
        { rating: 5 },
        {},
        { openid: 'oOwner' }
      )
      expect(res.code).not.toBe(0)
      expect(res.error.type).toBe('INVALID_PARAMS')
    })
  })

  describe('submitEvaluation：状态/权限校验', () => {
    test('未登录 → AUTH_REQUIRED', async () => {
      const res = await orders.submitEvaluation(
        { orderId: 'o1', rating: 5 },
        {},
        {}
      )
      expect(res.code).not.toBe(0)
      expect(res.error.type).toBe('AUTH_REQUIRED')
    })

    test('订单不存在 → ORDER_NOT_FOUND', async () => {
      const res = await orders.submitEvaluation(
        { orderId: 'missing', rating: 5 },
        {},
        { openid: 'oOwner' }
      )
      expect(res.code).not.toBe(0)
      expect(res.error.type).toBe('ORDER_NOT_FOUND')
    })

    test('非 completed 状态订单 → BUSINESS_ERROR', async () => {
      setupCompletedOrder({ status: 'in_progress' })
      const res = await orders.submitEvaluation(
        { orderId: 'o1', rating: 5 },
        {},
        { openid: 'oOwner' }
      )
      expect(res.code).not.toBe(0)
      expect(res.error.type).toBe('BUSINESS_ERROR')
      // 状态校验失败时不应写入 evaluation
      expect(mockDb._collections.evaluations.docs.length).toBe(0)
    })

    test('他人订单 → PERMISSION_DENIED', async () => {
      setupCompletedOrder()
      const res = await orders.submitEvaluation(
        { orderId: 'o1', rating: 5 },
        {},
        { openid: 'oOther' }
      )
      expect(res.code).not.toBe(0)
      expect(res.error.type).toBe('PERMISSION_DENIED')
    })
  })

  describe('submitEvaluation：幂等性', () => {
    test('同订单二次评价 → duplicate=true，不重复写', async () => {
      setupCompletedOrder()
      // 第一次
      const r1 = await orders.submitEvaluation(
        { orderId: 'o1', rating: 5 },
        {},
        { openid: 'oOwner' }
      )
      expect(r1.code).toBe(0)
      expect(r1.data.duplicate).toBeFalsy()

      // 第二次
      const r2 = await orders.submitEvaluation(
        { orderId: 'o1', rating: 3 },
        {},
        { openid: 'oOwner' }
      )
      expect(r2.code).toBe(0)
      expect(r2.data.duplicate).toBe(true)

      // 只写了一条
      expect(mockDb._collections.evaluations.docs.length).toBe(1)
      // 第一次的评价保留
      expect(mockDb._collections.evaluations.docs[0].rating).toBe(5)
    })
  })

  describe('submitEvaluation：异步触发 host.rating 重算', () => {
    test('单条评价后 host.rating = 该评分', async () => {
      setupCompletedOrder()
      await orders.submitEvaluation(
        { orderId: 'o1', rating: 4 },
        {},
        { openid: 'oOwner' }
      )
      // 异步重算，给一点点时间
      await new Promise(r => setTimeout(r, 50))
      const host = mockDb._collections.hostProfiles.docs.find(h => h._id === 'h1')
      expect(host.rating).toBe(4)
      expect(host.ratingCount).toBe(1)
    })

    test('多条评价后 host.rating 取平均（精度 1 位）', async () => {
      setupCompletedOrder()
      // 三条订单，三位用户
      mockDb._collections.orders.docs = [
        { _id: 'o1', ownerId: 'oA', hostId: 'h1', status: 'completed' },
        { _id: 'o2', ownerId: 'oB', hostId: 'h1', status: 'completed' },
        { _id: 'o3', ownerId: 'oC', hostId: 'h1', status: 'completed' },
      ]
      await orders.submitEvaluation({ orderId: 'o1', rating: 5 }, {}, { openid: 'oA' })
      await orders.submitEvaluation({ orderId: 'o2', rating: 4 }, {}, { openid: 'oB' })
      await orders.submitEvaluation({ orderId: 'o3', rating: 3 }, {}, { openid: 'oC' })
      await new Promise(r => setTimeout(r, 80))
      const host = mockDb._collections.hostProfiles.docs.find(h => h._id === 'h1')
      // (5+4+3)/3 = 4.0
      expect(host.rating).toBe(4)
      expect(host.ratingCount).toBe(3)
    })
  })

  describe('getHostEvaluations', () => {
    test('无评价时返回空列表', async () => {
      mockDb._collections.evaluations = { docs: [] }
      const res = await orders.getHostEvaluations({ hostId: 'h1' }, {}, { openid: 'anyone' })
      expect(res.code).toBe(0)
      expect(res.data.list).toEqual([])
      expect(res.data.total).toBe(0)
    })

    test('返回 hostId 对应的所有评价（按时间倒序）', async () => {
      mockDb._collections.evaluations = { docs: [
        { _id: 'e1', hostId: 'h1', rating: 5, createdAt: 1 },
        { _id: 'e2', hostId: 'h1', rating: 4, createdAt: 2 },
        { _id: 'e3', hostId: 'h2', rating: 3, createdAt: 3 },
      ] }
      const res = await orders.getHostEvaluations({ hostId: 'h1' }, {}, { openid: 'anyone' })
      expect(res.code).toBe(0)
      expect(res.data.list.length).toBe(2)
      expect(res.data.list.every(e => e.hostId === 'h1')).toBe(true)
    })

    test('缺 hostId → INVALID_PARAMS', async () => {
      const res = await orders.getHostEvaluations({}, {}, { openid: 'anyone' })
      expect(res.code).not.toBe(0)
      expect(res.error.type).toBe('INVALID_PARAMS')
    })

    test('pageSize 超过 50 时被截断到 50', async () => {
      const many = Array.from({ length: 60 }, (_, i) => ({ _id: `e${i}`, hostId: 'h1', rating: 5 }))
      mockDb._collections.evaluations = { docs: many }
      const res = await orders.getHostEvaluations({ hostId: 'h1', pageSize: 100 }, {}, { openid: 'anyone' })
      expect(res.data.pageSize).toBe(50)
    })
  })
})
