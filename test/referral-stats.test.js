/**
 * F19 聚焦单测：邀请统计（userService/referral.ts）
 *
 * 覆盖：
 *   a. 同一邀请人多个被邀请人 → totalInvited 正确；分页不丢/不重复（getInvitedUsers）
 *   b. consumingCount 按「去重消费用户」统计；totalSpent 跨多集合聚合正确
 *
 * Mock 方式：沿用项目既定风格 —— jest.mock('wx-server-sdk') 返回内存版 database()
 * （与 test/wallet-utils-concurrent.test.js 一致）。本文件内置最小内存 db，支持
 * where/field/orderBy/skip/limit/count/doc 以及 aggregate().match().group().end()，
 * 仅实现本场景所需语义，不改任何业务代码。
 */

// ---- 最小内存 db 实现 -------------------------------------------------
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
          : (arg && typeof arg === 'object' && arg.$ifNull)
            ? { _agg: 'sum', ifNullExpr: arg }
            : { _agg: 'sum', field: String(arg).replace(/^\$/, '') },
      addToSet: (arg) => ({ _agg: 'addToSet', field: String(arg).replace(/^\$/, '') }),
    },
  }
}

// 解析聚合金额表达式 totalAmount || totalPrice || price（模拟 $ifNull 链）
function resolveExpr(doc, expr) {
  if (expr && typeof expr === 'object' && expr.$ifNull) {
    const [primary, fallback] = expr.$ifNull
    const field = String(primary).replace(/^\$/, '')
    const val = doc[field]
    if (val !== undefined && val !== null) {return Number(val) || 0}
    return resolveExpr(doc, fallback)
  }
  return 0
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

function pickFields(doc, fields) {
  if (!fields || typeof fields !== 'object') return doc
  const out = {}
  for (const [k, keep] of Object.entries(fields)) {
    if (keep && doc[k] !== undefined) out[k] = doc[k]
  }
  return out
}

function applyAgg(agg, docs) {
  if (!agg || !agg._agg) return 0
  if (agg._agg === 'sum') {
    if (agg.const !== undefined) return docs.length
    if (agg.ifNullExpr) return docs.reduce((s, d) => s + resolveExpr(d, agg.ifNullExpr), 0)
    return docs.reduce((s, d) => s + (Number(d[agg.field]) || 0), 0)
  }
  if (agg._agg === 'addToSet') {
    const set = []
    for (const d of docs) {
      const val = d[agg.field]
      if (val !== undefined && val !== null && !set.includes(val)) set.push(val)
    }
    return set
  }
  return 0
}

function makeAggregate(store) {
  const state = { match: {}, group: null }
  return {
    match(q) {
      state.match = q
      return this
    },
    group(g) {
      state.group = g
      return this
    },
    async end() {
      const docs = store.docs.filter((d) => matchDoc(d, state.match))
      const g = state.group
      if (!g) return { data: [] }
      if (g._id === null || g._id === undefined) {
        const row = {}
        for (const [key, agg] of Object.entries(g)) {
          if (key === '_id') continue
          row[key] = applyAgg(agg, docs)
        }
        return { data: [row] }
      }
      const keyField = String(g._id).replace(/^\$/, '')
      const groups = {}
      for (const d of docs) {
        const k = d[keyField]
        if (!groups[k]) groups[k] = []
        groups[k].push(d)
      }
      const rows = Object.keys(groups).map((k) => {
        const row = { _id: k }
        for (const [key, agg] of Object.entries(g)) {
          if (key === '_id') continue
          row[key] = applyAgg(agg, groups[k])
        }
        return row
      })
      return { data: rows }
    },
  }
}

function makeCollection(store) {
  const q = { where: {}, skip: 0, limit: Infinity, orderBy: null, fields: null }
  const api = {
    where(w) {
      q.where = w || {}
      return api
    },
    field(f) {
      q.fields = f
      return api
    },
    orderBy(f, dir) {
      q.orderBy = { f, dir: dir || 'desc' }
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
      if (q.orderBy) {
        const { f, dir } = q.orderBy
        docs = [...docs].sort((a, b) => {
          if (a[f] < b[f]) return dir === 'asc' ? -1 : 1
          if (a[f] > b[f]) return dir === 'asc' ? 1 : -1
          return 0
        })
      }
      if (q.skip) docs = docs.slice(q.skip)
      if (Number.isFinite(q.limit)) docs = docs.slice(0, q.limit)
      if (q.fields) docs = docs.map((d) => pickFields(d, q.fields))
      return { data: docs }
    },
    async count() {
      return { total: store.docs.filter((d) => matchDoc(d, q.where)).length }
    },
    doc(id) {
      return {
        async get() {
          return { data: store.docs.find((d) => d._id === id) || null }
        },
        async update() {
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
      return makeAggregate(store)
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
}

jest.mock('wx-server-sdk', () => ({
  init: jest.fn(),
  getWXContext: () => ({ OPENID: 'oTest' }),
  DYNAMIC_CURRENT_ENV: 'mock-env',
  database: () => mockDb,
}))

const referral = require('../cloudfunctions/userService/referral')

const INVITER = 'inv_openid'
const AUTH = { openid: INVITER }

// 三个被邀请人
const INVITED = [
  { _id: 'inv_u1', inviterId: INVITER, nickName: 'A', avatarUrl: '', createdAt: new Date('2026-01-01T00:00:00Z') },
  { _id: 'inv_u2', inviterId: INVITER, nickName: 'B', avatarUrl: '', createdAt: new Date('2026-01-02T00:00:00Z') },
  { _id: 'inv_u3', inviterId: INVITER, nickName: 'C', avatarUrl: '', createdAt: new Date('2026-01-03T00:00:00Z') },
]

beforeEach(() => {
  mockDb._reset()
  mockDb._store('users').docs = [{ _id: INVITER, nickName: 'inviter' }, ...INVITED]
})

describe('getReferralStats - 邀请统计核心断言', () => {
  test('a. 同一邀请人多个被邀请人：totalInvited 正确；consumingCount 按去重消费用户计；totalSpent 跨集合聚合', async () => {
    // 2026-08-04 治理：orders 用 type 字段区分板块（mall / group_buy / boarding），金额统一 totalAmount
    // inv_u1 有两笔已完成寄养单，inv_u2 一笔已完成商城单，inv_u3 仅一笔未完成（应被排除）
    mockDb._store('orders').docs = [
      { _id: 'o1', ownerId: 'inv_u1', status: 'completed', type: 'boarding', totalAmount: 100 },
      { _id: 'o2', ownerId: 'inv_u1', status: 'completed', type: 'boarding', totalAmount: 50 },
      { _id: 'o3', ownerId: 'inv_u2', status: 'completed', type: 'mall', totalAmount: 30 },
      { _id: 'o4', ownerId: 'inv_u3', status: 'pending', type: 'mall', totalAmount: 999 },
    ]

    const res = await referral.getReferralStats({}, {}, AUTH)
    expect(res.code).toBe(0)
    const { totalInvited, consumingCount, totalSpent } = res.data

    // 3 个被邀请人全部计入
    expect(totalInvited).toBe(3)
    // inv_u1 虽有两笔订单，但只算 1 个消费用户；inv_u2 算 1 个 → 共 2
    expect(consumingCount).toBe(2)
    // orders 桶(100+50) + mall 桶(30) = 180
    expect(totalSpent).toBe('180.00')
  })

  test('b. 无被邀请人：统计全为 0，不触发任何聚合', async () => {
    mockDb._store('users').docs = [{ _id: INVITER, nickName: 'inviter' }]

    const res = await referral.getReferralStats({}, {}, AUTH)
    expect(res.code).toBe(0)
    expect(res.data.totalInvited).toBe(0)
    expect(res.data.consumingCount).toBe(0)
    expect(res.data.totalSpent).toBe('0.00')
  })

  test('c. 未登录：抛 AUTH_REQUIRED', async () => {
    await expect(referral.getReferralStats({}, {}, {})).rejects.toThrow(/未登录/)
  })
})

describe('getInvitedUsers - 分页不丢不重复 + 每用户订单聚合', () => {
  test('a. 分页跨页不丢不重复，total 正确（5 人，pageSize=2）', async () => {
    // 覆盖 beforeEach 的 3 人，改为 5 个被邀请人（createdAt 递增，便于校验排序）
    const five = Array.from({ length: 5 }, (_, i) => ({
      _id: 'inv_p' + (i + 1),
      inviterId: INVITER,
      nickName: 'U' + (i + 1),
      avatarUrl: '',
      createdAt: new Date('2026-01-0' + (i + 1) + 'T00:00:00Z'),
    }))
    mockDb._store('users').docs = [{ _id: INVITER, nickName: 'inviter' }, ...five]

    const seen = new Set()
    let total = 0
    for (let page = 1; page <= 3; page++) {
      const res = await referral.getInvitedUsers({ page, pageSize: 2 }, {}, AUTH)
      expect(res.code).toBe(0)
      const { list, total: t } = res.data
      if (page === 1) {
        total = t
        // createdAt desc：第一页首位应为最近注册的 inv_p5
        expect(list[0]._id).toBe('inv_p5')
      }
      list.forEach((u) => {
        expect(seen.has(u._id)).toBe(false) // 不重复
        seen.add(u._id)
      })
    }
    expect(total).toBe(5)
    expect(seen.size).toBe(5) // 不丢
  })

  test('b. 每用户 orderCount / totalSpent 由 per-user 聚合得出', async () => {
    // 2026-08-04 治理：orders 用 type 字段区分板块（mall / group_buy / boarding），金额统一 totalAmount
    mockDb._store('orders').docs = [
      { _id: 'o1', ownerId: 'inv_u1', status: 'completed', type: 'boarding', totalAmount: 100 },
      { _id: 'o2', ownerId: 'inv_u1', status: 'completed', type: 'boarding', totalAmount: 50 },
      { _id: 'o3', ownerId: 'inv_u2', status: 'completed', type: 'mall', totalAmount: 30 },
    ]
    const res = await referral.getInvitedUsers({ page: 1, pageSize: 20 }, {}, AUTH)
    expect(res.code).toBe(0)
    const byId = Object.fromEntries(res.data.list.map((u) => [u._id, u]))
    expect(byId.inv_u1.orderCount).toBe(2)
    expect(byId.inv_u1.totalSpent).toBe('150.00')
    expect(byId.inv_u2.orderCount).toBe(1)
    expect(byId.inv_u2.totalSpent).toBe('30.00')
    expect(byId.inv_u3.orderCount).toBe(0)
    expect(byId.inv_u3.totalSpent).toBe('0.00')
  })
})
