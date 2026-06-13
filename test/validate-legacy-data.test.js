/**
 * 存量数据校验脚本测试
 *
 * 覆盖：
 *   1. P0 引用完整性
 *   2. P0 业务数据合法性
 *   3. P1 字段命名一致性
 *   4. P2 软问题
 *   5. strict / report 模式
 *   6. CLI 参数解析
 *   7. 报告渲染
 */

const { runValidate, renderReport, CHECKS, parseArgs } = require('../scripts/validate-legacy-data')

/**
 * 构造 mock db：每个 collection 是一个返回 get() / count() 的对象。
 * 让每个 doc 既可按 _id 命中，也可被 where({}).field().get() 全量返回。
 */
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

describe('存量数据校验 validate-legacy-data', () => {
  describe('P0 关键引用完整性', () => {
    test('orders.hostId 引用不存在的 hostProfile → P0', async () => {
      const db = makeDb({
        orders: [{ _id: 'o1', hostId: 'h-missing' }],
        hostProfiles: [],
        users: [{ _id: 'u1' }],
        tuan_deals: [],
        tuan_orders: [],
        pets: [],
        notifications: [],
      })

      const { summary } = await runValidate({ envId: 'test-env', db })
      const found = summary.issues.find(i => i.code === 'ORDER_HOST_REF')
      expect(found).toBeTruthy()
      expect(found.level).toBe('P0')
      expect(found.context.hostId).toBe('h-missing')
    })

    test('orders.ownerId 引用不存在的 user → P0', async () => {
      const db = makeDb({
        orders: [{ _id: 'o1', ownerId: 'u-missing' }],
        hostProfiles: [],
        users: [{ _id: 'u1' }],
        tuan_deals: [],
        tuan_orders: [],
        pets: [],
        notifications: [],
      })

      const { summary } = await runValidate({ envId: 'test-env', db })
      const found = summary.issues.find(i => i.code === 'ORDER_OWNER_REF')
      expect(found).toBeTruthy()
      expect(found.level).toBe('P0')
    })

    test('orders.organizerId 引用不存在的 user → P0', async () => {
      const db = makeDb({
        orders: [{ _id: 'o1', organizerId: 'u-missing' }],
        hostProfiles: [],
        users: [{ _id: 'u1' }],
        tuan_deals: [],
        tuan_orders: [],
        pets: [],
        notifications: [],
      })

      const { summary } = await runValidate({ envId: 'test-env', db })
      const found = summary.issues.find(i => i.code === 'ORDER_ORGANIZER_REF')
      expect(found).toBeTruthy()
      expect(found.level).toBe('P0')
    })

    test('所有引用都完整 → 无 P0 异常', async () => {
      const db = makeDb({
        orders: [
          { _id: 'o1', hostId: 'h1', ownerId: 'u1', organizerId: 'u2', totalPrice: 100, startDate: '2026-09-01', endDate: '2026-09-04' },
        ],
        hostProfiles: [{ _id: 'h1', status: 'active' }],
        users: [{ _id: 'u1' }, { _id: 'u2' }],
        tuan_deals: [],
        tuan_orders: [],
        pets: [],
        notifications: [],
      })

      const { summary } = await runValidate({ envId: 'test-env', db })
      expect(summary.byLevel.P0).toBe(0)
    })
  })

  describe('P0 业务数据合法性', () => {
    test('orders.totalPrice < 0 → P0', async () => {
      const db = makeDb({
        orders: [{ _id: 'o1', totalPrice: -1 }],
        hostProfiles: [],
        users: [],
        tuan_deals: [],
        tuan_orders: [],
        pets: [],
        notifications: [],
      })

      const { summary } = await runValidate({ envId: 'test-env', db })
      const found = summary.issues.find(i => i.code === 'ORDER_NEGATIVE_PRICE')
      expect(found).toBeTruthy()
      expect(found.context.totalPrice).toBe(-1)
    })

    test('orders.startDate > orders.endDate → P0', async () => {
      const db = makeDb({
        orders: [{ _id: 'o1', startDate: '2026-09-10', endDate: '2026-09-05' }],
        hostProfiles: [],
        users: [],
        tuan_deals: [],
        tuan_orders: [],
        pets: [],
        notifications: [],
      })

      const { summary } = await runValidate({ envId: 'test-env', db })
      const found = summary.issues.find(i => i.code === 'ORDER_INVALID_DATERANGE')
      expect(found).toBeTruthy()
    })

    test('hostProfiles.status 非法值 → P0', async () => {
      const db = makeDb({
        orders: [],
        hostProfiles: [{ _id: 'h1', status: 'weird-value' }],
        users: [],
        tuan_deals: [],
        tuan_orders: [],
        pets: [],
        notifications: [],
      })

      const { summary } = await runValidate({ envId: 'test-env', db })
      const found = summary.issues.find(i => i.code === 'HOST_INVALID_STATUS')
      expect(found).toBeTruthy()
    })

    test('hostProfiles.status 合法值（active/pending_review/rejected/disabled）→ 无 P0', async () => {
      const db = makeDb({
        orders: [],
        hostProfiles: [
          { _id: 'h1', status: 'active' },
          { _id: 'h2', status: 'pending_review' },
          { _id: 'h3', status: 'rejected' },
          { _id: 'h4', status: 'disabled' },
        ],
        users: [],
        tuan_deals: [],
        tuan_orders: [],
        pets: [],
        notifications: [],
      })

      const { summary } = await runValidate({ envId: 'test-env', db })
      const found = summary.issues.find(i => i.code === 'HOST_INVALID_STATUS')
      expect(found).toBeFalsy()
    })
  })

  describe('P1 字段命名一致性', () => {
    test('用户同时存在 nickname 与 nickName → P1', async () => {
      const db = makeDb({
        orders: [],
        hostProfiles: [],
        users: [{ _id: 'u1', nickName: 'A', nickname: 'B' }],
        tuan_deals: [],
        tuan_orders: [],
        pets: [],
        notifications: [],
      })

      const { summary } = await runValidate({ envId: 'test-env', db })
      const found = summary.issues.find(i => i.code === 'USER_NICKNAME_INCONSISTENT')
      expect(found).toBeTruthy()
      expect(found.level).toBe('P1')
    })

    test('用户仅有 nickname → P1', async () => {
      const db = makeDb({
        orders: [],
        hostProfiles: [],
        users: [{ _id: 'u1', nickname: 'B' }],
        tuan_deals: [],
        tuan_orders: [],
        pets: [],
        notifications: [],
      })

      const { summary } = await runValidate({ envId: 'test-env', db })
      const found = summary.issues.find(i => i.code === 'USER_MISSING_NICKNAME')
      expect(found).toBeTruthy()
    })

    test('orders 缺少 organizerId → P1', async () => {
      const db = makeDb({
        orders: [{ _id: 'o1' }],
        hostProfiles: [],
        users: [],
        tuan_deals: [],
        tuan_orders: [],
        pets: [],
        notifications: [],
      })

      const { summary } = await runValidate({ envId: 'test-env', db })
      const found = summary.issues.find(i => i.code === 'MISSING_ORGANIZER_ID')
      expect(found).toBeTruthy()
    })

    test('pets 仅有 petInfo → P1', async () => {
      const db = makeDb({
        orders: [],
        hostProfiles: [],
        users: [],
        tuan_deals: [],
        tuan_orders: [],
        pets: [{ _id: 'p1', petInfo: { name: '旺财' } }],
        notifications: [],
      })

      const { summary } = await runValidate({ envId: 'test-env', db })
      const found = summary.issues.find(i => i.code === 'PETS_INFO_LEGACY')
      expect(found).toBeTruthy()
    })

    test('*.createAt 存在但缺 createdAt → P1', async () => {
      const db = makeDb({
        orders: [{ _id: 'o1', createAt: '2026-09-01' }],
        hostProfiles: [],
        users: [],
        tuan_deals: [],
        tuan_orders: [],
        pets: [],
        notifications: [],
      })

      const { summary } = await runValidate({ envId: 'test-env', db })
      const found = summary.issues.find(i => i.code === 'MISSING_CREATED_AT' && i.collection === 'orders')
      expect(found).toBeTruthy()
    })
  })

  describe('P2 软问题', () => {
    test('phone 非 11 位数字 → P2', async () => {
      const db = makeDb({
        orders: [],
        hostProfiles: [],
        users: [{ _id: 'u1', phone: '12345' }],
        tuan_deals: [],
        tuan_orders: [],
        pets: [],
        notifications: [],
      })

      const { summary } = await runValidate({ envId: 'test-env', db })
      const found = summary.issues.find(i => i.code === 'PHONE_FORMAT')
      expect(found).toBeTruthy()
      expect(found.level).toBe('P2')
    })

    test('user._id !== user.openid → P2（仅供参考）', async () => {
      const db = makeDb({
        orders: [],
        hostProfiles: [],
        users: [{ _id: 'u1', openid: 'wx-openid-123' }],
        tuan_deals: [],
        tuan_orders: [],
        pets: [],
        notifications: [],
      })

      const { summary } = await runValidate({ envId: 'test-env', db })
      const found = summary.issues.find(i => i.code === 'OPENID_MISMATCH')
      expect(found).toBeTruthy()
      expect(found.level).toBe('P2')
    })

    test('phone 11 位数字 → 不报 P2', async () => {
      const db = makeDb({
        orders: [],
        hostProfiles: [],
        users: [{ _id: 'u1', phone: '13800138000' }],
        tuan_deals: [],
        tuan_orders: [],
        pets: [],
        notifications: [],
      })

      const { summary } = await runValidate({ envId: 'test-env', db })
      const found = summary.issues.find(i => i.code === 'PHONE_FORMAT')
      expect(found).toBeFalsy()
    })
  })

  describe('strict / report 模式', () => {
    test('strict=true 且有 P0 异常 → exitCode=1', async () => {
      const db = makeDb({
        orders: [{ _id: 'o1', hostId: 'h-missing' }],
        hostProfiles: [],
        users: [],
        tuan_deals: [],
        tuan_orders: [],
        pets: [],
        notifications: [],
      })

      const { exitCode, summary } = await runValidate({ envId: 'test-env', strict: true, db })
      expect(summary.byLevel.P0).toBeGreaterThan(0)
      expect(exitCode).toBe(1)
    })

    test('strict=true 但无 P0 异常 → exitCode=0', async () => {
      const db = makeDb({
        orders: [],
        hostProfiles: [],
        users: [{ _id: 'u1', nickName: 'A' }], // P1 而已
        tuan_deals: [],
        tuan_orders: [],
        pets: [],
        notifications: [],
      })

      const { exitCode, summary } = await runValidate({ envId: 'test-env', strict: true, db })
      expect(summary.byLevel.P0).toBe(0)
      expect(exitCode).toBe(0)
    })

    test('report=true 即便有 P0 也不退出非零', async () => {
      const db = makeDb({
        orders: [{ _id: 'o1', hostId: 'h-missing' }],
        hostProfiles: [],
        users: [],
        tuan_deals: [],
        tuan_orders: [],
        pets: [],
        notifications: [],
      })

      const { exitCode } = await runValidate({ envId: 'test-env', strict: true, report: true, db })
      expect(exitCode).toBe(0)
    })

    test('默认（无 strict/report）→ 总是 exitCode=0', async () => {
      const db = makeDb({
        orders: [{ _id: 'o1', hostId: 'h-missing' }],
        hostProfiles: [],
        users: [],
        tuan_deals: [],
        tuan_orders: [],
        pets: [],
        notifications: [],
      })

      const { exitCode } = await runValidate({ envId: 'test-env', db })
      expect(exitCode).toBe(0)
    })
  })

  describe('报告渲染', () => {
    test('空异常报告含 "全部通过"', () => {
      const out = renderReport({
        generatedAt: '2026-06-04T00:00:00Z',
        envId: 'test',
        strict: false,
        scanned: { orders: 0 },
        issueCount: 0,
        byLevel: { P0: 0, P1: 0, P2: 0 },
        issues: [],
      })
      expect(out).toMatch(/全部通过/)
    })

    test('P0 异常报告中含 "P0 异常"', () => {
      const out = renderReport({
        generatedAt: '2026-06-04T00:00:00Z',
        envId: 'test',
        strict: false,
        scanned: { orders: 1 },
        issueCount: 1,
        byLevel: { P0: 1, P1: 0, P2: 0 },
        issues: [{
          level: 'P0', code: 'ORDER_HOST_REF', desc: 'desc',
          collection: 'orders', docId: 'o1', context: { hostId: 'h-missing' },
        }],
      })
      expect(out).toMatch(/P0 异常/)
      expect(out).toMatch(/ORDER_HOST_REF/)
      expect(out).toMatch(/orders\/o1/)
    })

    test('超 20 条同类异常时省略', () => {
      const issues = Array.from({ length: 25 }, (_, i) => ({
        level: 'P1', code: 'MISSING_ORGANIZER_ID', desc: 'd',
        collection: 'orders', docId: `o${i}`,
      }))
      const out = renderReport({
        generatedAt: '2026-06-04T00:00:00Z',
        envId: 'test',
        strict: false,
        scanned: {},
        issueCount: 25,
        byLevel: { P0: 0, P1: 25, P2: 0 },
        issues,
      })
      expect(out).toMatch(/还有 5 条未列出/)
    })
  })

  describe('CLI 参数解析', () => {
    test('--env=xxx 解析为 envId', () => {
      expect(parseArgs(['node', 'script.js', '--env=foo-1'])).toEqual({
        envId: 'foo-1', strict: false, report: false,
        since: 0, whitelist: [], collections: [],
      })
    })

    test('--strict / --report 解析为布尔', () => {
      expect(parseArgs(['node', 'script.js', '--env=x', '--strict', '--report'])).toEqual({
        envId: 'x', strict: true, report: true,
        since: 0, whitelist: [], collections: [],
      })
    })

    test('无参数时 envId 为空（用环境变量兜底）', () => {
      const orig = process.env.CLOUDBASE_ENV
      delete process.env.CLOUDBASE_ENV
      try {
        expect(parseArgs(['node', 'script.js'])).toEqual({
          envId: '', strict: false, report: false,
          since: 0, whitelist: [], collections: [],
        })
      } finally {
        if (orig !== undefined) {process.env.CLOUDBASE_ENV = orig}
      }
    })
  })

  describe('CHECKS 注册表', () => {
    test('所有 P0 检查项都有 level / code / desc', () => {
      for (const [k, v] of Object.entries(CHECKS)) {
        expect(['P0', 'P1', 'P2']).toContain(v.level)
        expect(v.code).toBeTruthy()
        expect(v.desc).toBeTruthy()
        // key 与 code 应保持一致
        expect(v.code).toBe(k)
      }
    })
  })
})
