/**
 * F19 聚焦单测：活动报名（activityService/index.js → submitRegistration）
 *
 * 覆盖：
 *   1. 重复报名被拒（幂等）：同一用户已 confirmed 报名 → 抛 BUSINESS_ERROR
 *   2. 名额扣减正确：免费活动报名成功后 activities.currentParticipants += participantCount
 *   3. 名额满后拒单：currentParticipants + participantCount > maxParticipants → 返回名额已满
 *
 * Mock 方式：沿用项目既定风格 —— jest.mock('wx-server-sdk') 返回内存版 database()，
 * 内置最小内存 db（含 startTransaction / serverDate / 事务内读写），仅覆盖本场景语义，
 * 不改任何业务代码。风控前置 performActivityApplyRiskCheck 对免费/小额报名返回 RISK_PASS。
 */

function makeCommand() {
  return {
    in: (v) => ({ _op: 'in', v }),
    ne: (v) => ({ _op: 'ne', v }),
    gte: (v) => ({ _op: 'gte', v }),
    lte: (v) => ({ _op: 'lte', v }),
    eq: (v) => ({ _op: 'eq', v }),
    inc: (v) => ({ _op: 'inc', v }),
    aggregate: {
      sum: (arg) =>
        typeof arg === 'number'
          ? { _agg: 'sum', const: arg }
          : { _agg: 'sum', field: String(arg).replace(/^\$/, '') },
      addToSet: (arg) => ({ _agg: 'addToSet', field: String(arg).replace(/^\$/, '') }),
    },
  }
}

function matchDoc(doc, query) {
  if (!query || typeof query !== 'object') return true
  return Object.entries(query).every(([k, v]) => {
    if (v && typeof v === 'object' && v._op) {
      switch (v._op) {
        case 'in':
          return Array.isArray(v.v) && v.v.includes(doc[k])
        case 'ne':
          return doc[k] !== v.v
        case 'gte':
          return doc[k] >= v.v
        case 'lte':
          return doc[k] <= v.v
        case 'eq':
          return doc[k] === v.v
        default:
          return false
      }
    }
    return doc[k] === v
  })
}

function makeCollection(store) {
  const q = { where: {}, skip: 0, limit: Infinity }
  const api = {
    where(w) {
      q.where = w || {}
      return api
    },
    field() {
      return api
    },
    orderBy() {
      return api
    },
    skip(n) {
      q.skip = Number(n) || 0
      return api
    },
    limit(n) {
      q.limit = Number(n)
      return api
    },
    async get() {
      let docs = store.docs.filter((d) => matchDoc(d, q.where))
      if (q.skip) docs = docs.slice(q.skip)
      if (Number.isFinite(q.limit)) docs = docs.slice(0, q.limit)
      return { data: docs }
    },
    async count() {
      return { total: store.docs.filter((d) => matchDoc(d, q.where)).length }
    },
    async add({ data }) {
      const doc = { ...data, _id: data._id || 'mock_' + Math.random().toString(36).slice(2) }
      store.docs.push(doc)
      return { _id: doc._id }
    },
    doc(id) {
      return {
        async get() {
          return { data: store.docs.find((d) => d._id === id) || null }
        },
        async update({ data }) {
          const doc = store.docs.find((d) => d._id === id)
          if (!doc) return { stats: { updated: 0 } }
          for (const [k, v] of Object.entries(data)) {
            if (v && typeof v === 'object' && v._op === 'inc') {
              doc[k] = (Number(doc[k]) || 0) + Number(v.v)
            } else {
              doc[k] = v
            }
          }
          return { stats: { updated: 1 } }
        },
        async set() {
          return { _id: id }
        },
        async remove() {
          return { deleted: 1 }
        },
      }
    },
    aggregate() {
      return {
        match() {
          return this
        },
        group() {
          return this
        },
        async end() {
          return { data: [] }
        },
      }
    },
  }
  return api
}

const mockDb = {
  _collections: {},
  _reset() {
    Object.keys(this._collections).forEach((k) => delete this._collections[k])
  },
  _store(name) {
    if (!this._collections[name]) this._collections[name] = { docs: [] }
    return this._collections[name]
  },
  collection(name) {
    return makeCollection(this._store(name))
  },
  command: makeCommand(),
  serverDate() {
    return new Date('2026-01-01T00:00:00Z')
  },
  async startTransaction() {
    return {
      collection(name) {
        return makeCollection(mockDb._store(name))
      },
      commit: async () => ({}),
      rollback: async () => ({}),
    }
  },
}

jest.mock('wx-server-sdk', () => ({
  init: jest.fn(),
  getWXContext: () => ({ OPENID: 'oTest' }),
  DYNAMIC_CURRENT_ENV: 'mock-env',
  database: () => mockDb,
}))

const activity = require('../cloudfunctions/activityService/index')
const { ERROR_CODES } = require('../cloudfunctions/activityService/common/utils')

const USER = 'oSignupUser'
const AUTH = { openid: USER }
const ACT_ID = 'act1'

const baseEvent = (over = {}) => ({
  activityId: ACT_ID,
  pets: [{ petName: 'Mimi' }],
  phone: '13800000000',
  ...over,
})

const seedActivity = (over = {}) => {
  mockDb._store('activities').docs = [
    {
      _id: ACT_ID,
      title: '测试活动',
      maxParticipants: 5,
      currentParticipants: 0,
      pricePerPerson: 0,
      pricePerPet: 0,
      ...over,
    },
  ]
}

beforeEach(() => {
  mockDb._reset()
  mockDb._store('users').docs = [{ _id: USER, nickName: '报名者', avatarUrl: '' }]
})

describe('submitRegistration - 重复报名 / 名额扣减 / 名额满', () => {
  test('1. 重复报名被拒（幂等）：已 confirmed 报名 → 抛 BUSINESS_ERROR', async () => {
    seedActivity()
    // 预置一条同用户同活动的 confirmed 报名
    mockDb._store('activity_registrations').docs = [
      { _id: 'r_exist', activityId: ACT_ID, ownerId: USER, status: 'confirmed' },
    ]
    const before = mockDb._store('activity_registrations').docs.length

    await expect(activity.submitRegistration(baseEvent(), {}, AUTH)).rejects.toThrow('您已报名此活动')

    // 未写入新报名
    expect(mockDb._store('activity_registrations').docs.length).toBe(before)
  })

  test('2. 名额扣减正确：免费活动报名成功，currentParticipants +1，写入报名与订单', async () => {
    seedActivity({ maxParticipants: 5, currentParticipants: 0 })
    const res = await activity.submitRegistration(baseEvent(), {}, AUTH)

    expect(res.code).toBe(0)
    expect(res.data.registrationId).toBeTruthy()

    // 名额扣减
    const act = mockDb._store('activities').docs[0]
    expect(act.currentParticipants).toBe(1)

    // 报名记录已写入且状态为 confirmed（免费活动）
    const regs = mockDb._store('activity_registrations').docs
    expect(regs.length).toBe(1)
    expect(regs[0].status).toBe('confirmed')
    expect(regs[0].ownerId).toBe(USER)

    // 同步写入活动订单
    expect(mockDb._store('orders').docs.length).toBe(1)
  })

  test('3. 名额满后拒单：currentParticipants + participantCount > maxParticipants → 返回名额已满，不写入', async () => {
    seedActivity({ maxParticipants: 2, currentParticipants: 2 })
    const before = mockDb._store('activity_registrations').docs.length

    const res = await activity.submitRegistration(baseEvent(), {}, AUTH)

    // 事务内抛出后被 handleError 包成 DATA 错误，原始原因保留在 error 字段
    expect(res.code).toBe(ERROR_CODES.DATA)
    expect(res.error).toBe('报名人数已满')

    // 未写入报名，名额不变
    expect(mockDb._store('activity_registrations').docs.length).toBe(before)
    expect(mockDb._store('activities').docs[0].currentParticipants).toBe(2)
  })

  test('4. 团体报名：participantCount=3 正确扣减 3 个名额', async () => {
    seedActivity({ maxParticipants: 10, currentParticipants: 0 })
    const res = await activity.submitRegistration(baseEvent({ participantCount: 3 }), {}, AUTH)
    expect(res.code).toBe(0)
    expect(mockDb._store('activities').docs[0].currentParticipants).toBe(3)
  })

  test('5. 付费活动报名：状态为 pending_payment，提交阶段不扣减名额', async () => {
    seedActivity({ maxParticipants: 10, currentParticipants: 0, pricePerPerson: 1, pricePerPet: 0 })
    const res = await activity.submitRegistration(baseEvent(), {}, AUTH)
    expect(res.code).toBe(0)
    const regs = mockDb._store('activity_registrations').docs
    expect(regs[0].status).toBe('pending_payment')
    // 付费活动在确认支付后才扣减名额，提交阶段 currentParticipants 不变
    expect(mockDb._store('activities').docs[0].currentParticipants).toBe(0)
  })
})
