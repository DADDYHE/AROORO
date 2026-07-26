/**
 * wallet-utils 并发单测（F1 钱包并发双入账修复）
 *
 * 目标：验证 ensureWalletBalance(openid, amount, type) 在并发首次创建钱包时
 * 余额不会翻倍（最终 == amount），以及已存在钱包时每笔精确 +amount。
 *
 * Mock 方式：沿用项目既有风格 —— jest.mock('wx-server-sdk') 返回内存版 database()，
 * 用内存 docs 模拟 collection 的 where/update/add，并在 add 命中 (openid,type) 唯一索引时
 * 抛出 errCode = -502001（与 CloudBase 真实唯一索引冲突一致）。
 * 仅覆盖本场景所需的最小 db 语义，不改动任何业务代码。
 */

const _collections = {}

const mockDb = {
  _collections,
  _reset() {
    for (const k of Object.keys(_collections)) delete _collections[k]
  },
  collection(name) {
    if (!_collections[name]) _collections[name] = { docs: [] }
    const store = _collections[name]
    const match = (doc, q) => Object.entries(q || {}).every(([k, v]) => doc[k] === v)
    return {
      where(query) {
        const docs = store.docs.filter((d) => match(d, query))
        return {
          async update({ data }) {
            const doc = store.docs.find((d) => match(d, query))
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
          async get() {
            return { data: docs }
          },
        }
      },
      async add({ data }) {
        const dup = store.docs.find((d) => d.openid === data.openid && d.type === data.type)
        if (dup) {
          const err = new Error('E11000 duplicate key (openid,type)')
          err.errCode = -502001
          throw err
        }
        const doc = { ...data, _id: 'mock_' + Math.random().toString(36).slice(2) }
        store.docs.push(doc)
        return { _id: doc._id }
      },
    }
  },
  command: {
    inc: (v) => ({ _op: 'inc', v }),
  },
  serverDate: () => new Date('2026-01-01T00:00:00Z'),
}

jest.mock('wx-server-sdk', () => ({
  init: jest.fn(),
  getWXContext: () => ({ OPENID: 'oTest_openid' }),
  DYNAMIC_CURRENT_ENV: 'mock-env',
  database: () => mockDb,
}))

const MODULES = [
  {
    label: 'orderService',
    mod: require('../cloudfunctions/orderService/common/wallet-utils'),
  },
  {
    label: 'orderTimeoutService',
    mod: require('../cloudfunctions/orderTimeoutService/common/wallet-utils'),
  },
]

beforeEach(() => {
  mockDb._reset()
})

MODULES.forEach(({ label, mod }) => {
  describe(`ensureWalletBalance 并发安全 [${label}]`, () => {
    const openid = 'oConcurrentF1'
    const type = 'commission'

    test('a. 两个并发首次请求：最终余额 == amount（非 2×）', async () => {
      await Promise.all([
        mod.ensureWalletBalance(openid, 100, type),
        mod.ensureWalletBalance(openid, 100, type),
      ])
      const docs = mockDb._collections.wallets.docs
      expect(docs.length).toBe(1)
      expect(docs[0].openid).toBe(openid)
      expect(docs[0].type).toBe(type)
      expect(docs[0].balance).toBe(100)
      expect(docs[0].totalIncome).toBe(100)
    })

    test('b. 已存在钱包：每笔精确 +amount，多笔累加正确', async () => {
      mockDb._collections.wallets = {
        docs: [
          {
            openid,
            type,
            balance: 0,
            totalIncome: 0,
            totalWithdrawn: 0,
            frozenAmount: 0,
            status: 'active',
          },
        ],
      }
      await mod.ensureWalletBalance(openid, 10, type)
      await mod.ensureWalletBalance(openid, 20, type)
      await mod.ensureWalletBalance(openid, 30, type)
      const doc = mockDb._collections.wallets.docs[0]
      expect(doc.balance).toBe(60)
      expect(doc.totalIncome).toBe(60)
    })

    test('c. 单笔首次创建：余额精确等于 amount（基线）', async () => {
      await mod.ensureWalletBalance(openid, 50, type)
      const doc = mockDb._collections.wallets.docs[0]
      expect(doc.balance).toBe(50)
      expect(doc.totalIncome).toBe(50)
    })

    test('d. 无效 type 应抛错', async () => {
      await expect(mod.ensureWalletBalance(openid, 10, 'bogus')).rejects.toThrow(
        /invalid wallet type/
      )
    })
  })
})
