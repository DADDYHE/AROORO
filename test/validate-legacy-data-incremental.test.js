/**
 * 存量数据校验脚本测试 - Sprint 11 增量模式 + 白名单
 *
 * 覆盖：
 *   1. --since 增量模式：只校验 updatedAt >= since 的文档
 *   2. --whitelist 忽略指定 code 的问题
 *   3. --collections 只校验指定集合
 *   4. 组合使用
 *   5. parseArgs 解析新参数
 */

const { runValidate, renderReport, parseArgs } = require('../scripts/validate-legacy-data')

function makeDb(collections) {
  const _collections = {}
  for (const [name, docs] of Object.entries(collections)) {
    _collections[name] = docs
  }
  return {
    _collections,
    collection(name) {
      const all = _collections[name] || []
      return {
        where() { return this },
        field() { return this },
        orderBy() { return this },
        limit() { return this },
        async get() { return { data: all } },
        async count() { return { total: all.length } },
      }
    },
  }
}

const T1 = new Date('2026-01-01T00:00:00Z').getTime()
const T2 = new Date('2026-03-01T00:00:00Z').getTime()
const T3 = new Date('2026-06-01T00:00:00Z').getTime()

describe('存量数据校验 Sprint 11：增量模式 + 白名单', () => {
  describe('--since 增量模式', () => {
    test('since=0 等价于全量', async () => {
      const db = makeDb({
        orders: [
          { _id: 'o1', updatedAt: T1, totalPrice: 100 },
        ],
      })
      const { summary } = await runValidate({ db })
      expect(summary.scanned.orders).toBe(1)
    })

    test('since=T2 只保留 updatedAt >= T2 的文档', async () => {
      const db = makeDb({
        orders: [
          { _id: 'o1', updatedAt: T1, totalPrice: -1 }, // 旧 + P0
          { _id: 'o2', updatedAt: T2, totalPrice: -1 }, // 边界 - 应被保留
          { _id: 'o3', updatedAt: T3, totalPrice: -1 }, // 新 - 应被保留
        ],
      })
      const { summary } = await runValidate({ db, since: T2 })
      // scanned 应为 2（o2 + o3）
      expect(summary.scanned.orders).toBe(2)
      // P0 应来自 o2 + o3
      const p0 = summary.issues.filter(i => i.code === 'ORDER_NEGATIVE_PRICE')
      expect(p0.length).toBe(2)
    })

    test('since=now 全为空', async () => {
      const db = makeDb({
        orders: [{ _id: 'o1', updatedAt: T1 }],
      })
      const { summary } = await runValidate({ db, since: Date.now() + 1e10 })
      expect(summary.scanned.orders).toBe(0)
    })

    test('缺 updatedAt 时回退到 createdAt', async () => {
      const db = makeDb({
        orders: [
          { _id: 'o1', createdAt: T3, totalPrice: -1 }, // 无 updatedAt，用 createdAt
        ],
      })
      const { summary } = await runValidate({ db, since: T2 })
      expect(summary.scanned.orders).toBe(1)
    })
  })

  describe('--whitelist 白名单', () => {
    test('白名单内的 code 不计入 issues', async () => {
      const db = makeDb({
        orders: [
          { _id: 'o1', totalPrice: -1, ownerId: 'u-missing' },
        ],
        users: [],
      })
      const { summary } = await runValidate({ db, whitelist: ['ORDER_NEGATIVE_PRICE'] })
      const neg = summary.issues.find(i => i.code === 'ORDER_NEGATIVE_PRICE')
      expect(neg).toBeUndefined()
      // 但 ORDER_OWNER_REF 仍应被发现
      const owner = summary.issues.find(i => i.code === 'ORDER_OWNER_REF')
      expect(owner).toBeDefined()
    })

    test('多个白名单 code 全部忽略', async () => {
      const db = makeDb({
        orders: [
          { _id: 'o1', totalPrice: -1, hostId: 'h-missing', ownerId: 'u-missing', organizerId: 'u-missing' },
        ],
        users: [],
      })
      const { summary } = await runValidate({
        db,
        whitelist: ['ORDER_NEGATIVE_PRICE', 'ORDER_HOST_REF', 'ORDER_OWNER_REF', 'ORDER_ORGANIZER_REF', 'MISSING_ORGANIZER_ID'],
      })
      expect(summary.issues.length).toBe(0)
    })

    test('summary.byWhitelist 应统计被白名单忽略的次数', async () => {
      const db = makeDb({
        orders: [
          { _id: 'o1', totalPrice: -1 },
          { _id: 'o2', totalPrice: -1 },
        ],
      })
      const { summary } = await runValidate({ db, whitelist: ['ORDER_NEGATIVE_PRICE'] })
      expect(summary.byWhitelist).toBe(2)
      expect(summary.byLevel.P0).toBe(0)
    })

    test('未在白名单的 code 仍被报告', async () => {
      const db = makeDb({
        orders: [{ _id: 'o1', totalPrice: -1 }],
      })
      const { summary } = await runValidate({ db, whitelist: ['MISSING_CREATED_AT'] })
      const neg = summary.issues.find(i => i.code === 'ORDER_NEGATIVE_PRICE')
      expect(neg).toBeDefined()
    })
  })

  describe('--collections 只校验指定集合', () => {
    test('collections=["users"] 时只校验 users', async () => {
      const db = makeDb({
        orders: [{ _id: 'o1', totalPrice: -1 }], // 故意 P0
        users: [{ _id: 'u1', phone: '12345' }], // 故意 P2
      })
      const { summary } = await runValidate({ db, collections: ['users'] })
      // 不应有 ORDER_NEGATIVE_PRICE
      expect(summary.issues.find(i => i.code === 'ORDER_NEGATIVE_PRICE')).toBeUndefined()
      // 应有 PHONE_FORMAT
      expect(summary.issues.find(i => i.code === 'PHONE_FORMAT')).toBeDefined()
    })

    test('不存在的集合名 → 应安全处理（不抛错）', async () => {
      const db = makeDb({})
      const { summary } = await runValidate({ db, collections: ['nonExistent'] })
      expect(summary).toBeDefined()
    })
  })

  describe('组合使用 since + whitelist + collections', () => {
    test('三者联用，精确只校验关心的部分', async () => {
      const db = makeDb({
        orders: [
          { _id: 'o1', totalPrice: -1, updatedAt: T1 }, // 旧 + P0 - 应被 since 过滤
          { _id: 'o2', totalPrice: -1, updatedAt: T3 }, // 新 + P0 - 应被 whitelist 忽略
        ],
        users: [
          { _id: 'u1', phone: 'bad', updatedAt: T3 }, // 新 + P2 - 应被发现
        ],
      })
      const { summary } = await runValidate({
        db,
        since: T2,
        whitelist: ['ORDER_NEGATIVE_PRICE'],
        collections: ['orders', 'users'],
      })
      // o1 被 since 过滤
      // o2 被 whitelist 忽略
      // u1 被发现
      const phone = summary.issues.find(i => i.code === 'PHONE_FORMAT')
      expect(phone).toBeDefined()
      expect(summary.issues.find(i => i.code === 'ORDER_NEGATIVE_PRICE')).toBeUndefined()
    })
  })

  describe('parseArgs', () => {
    test('应解析 --since=<ms>', () => {
      const args = parseArgs(['node', 'x.js', '--since=1700000000000'])
      expect(args.since).toBe(1700000000000)
    })

    test('应解析 --whitelist=code1,code2', () => {
      const args = parseArgs(['node', 'x.js', '--whitelist=MISSING_CREATED_AT,PETS_INFO_LEGACY'])
      expect(args.whitelist).toEqual(['MISSING_CREATED_AT', 'PETS_INFO_LEGACY'])
    })

    test('应解析 --collections=orders,users', () => {
      const args = parseArgs(['node', 'x.js', '--collections=orders,users'])
      expect(args.collections).toEqual(['orders', 'users'])
    })

    test('空参数应给出空数组', () => {
      const args = parseArgs(['node', 'x.js'])
      expect(args.whitelist).toEqual([])
      expect(args.collections).toEqual([])
      expect(args.since).toBe(0)
    })
  })

  describe('renderReport 应包含新字段', () => {
    test('增量模式应显示 since', () => {
      const summary = {
        generatedAt: '2026-06-04T00:00:00Z',
        envId: 'test',
        since: 1700000000000,
        whitelist: [],
        collections: '(all)',
        scanned: { orders: 10 },
        issueCount: 0,
        byLevel: { P0: 0, P1: 0, P2: 0 },
        byWhitelist: 0,
        issues: [],
      }
      const out = renderReport(summary)
      expect(out).toContain('增量模式')
      expect(out).toContain('1700000000000')
    })

    test('白名单应显示', () => {
      const summary = {
        generatedAt: '2026-06-04T00:00:00Z',
        envId: 'test',
        since: 0,
        whitelist: ['MISSING_CREATED_AT'],
        collections: '(all)',
        scanned: { orders: 10 },
        issueCount: 0,
        byLevel: { P0: 0, P1: 0, P2: 0 },
        byWhitelist: 3,
        issues: [],
      }
      const out = renderReport(summary)
      expect(out).toContain('白名单:')
      expect(out).toContain('MISSING_CREATED_AT')
      expect(out).toContain('白名单忽略: 3')
    })

    test('限定集合应显示', () => {
      const summary = {
        generatedAt: '2026-06-04T00:00:00Z',
        envId: 'test',
        since: 0,
        whitelist: [],
        collections: ['orders', 'users'],
        scanned: { orders: 10 },
        issueCount: 0,
        byLevel: { P0: 0, P1: 0, P2: 0 },
        byWhitelist: 0,
        issues: [],
      }
      const out = renderReport(summary)
      expect(out).toContain('限定集合')
      expect(out).toContain('orders,users')
    })
  })
})
