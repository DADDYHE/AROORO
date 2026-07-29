/**
 * cloudfunctions/partnerService/services/wallet.js 单元测试
 * 覆盖：getMyIncomeOverview / getMyIncomeDetails / getMyWallet / getMyWithdrawals / requestWithdrawal
 */

// ===== Mock wx-server-sdk =====
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
          if (doc) {
            for (const [k, v] of Object.entries(data)) {
              if (v && typeof v === 'object' && v._op === 'inc') {
                doc[k] = (Number(doc[k]) || 0) + Number(v.v)
              } else {
                doc[k] = v
              }
            }
          }
        },
      }),
      where: query => {
        const docs = self._collections[name].docs.filter(doc => {
          for (const [k, v] of Object.entries(query || {})) {
            if (v && typeof v === 'object' && v._op) {
              if (v._op === 'in' && Array.isArray(v.v)) {
                if (!v.v.includes(doc[k])) {return false}
              } else if (v._op === 'gte') {
                const docVal = doc[k] instanceof Date ? doc[k].getTime() : doc[k]
                const cmpVal = v.v instanceof Date ? v.v.getTime() : v.v
                if (!(docVal >= cmpVal)) {return false}
              } else if (v._op === 'lte') {
                const docVal = doc[k] instanceof Date ? doc[k].getTime() : doc[k]
                const cmpVal = v.v instanceof Date ? v.v.getTime() : v.v
                if (!(docVal <= cmpVal)) {return false}
              } else if (v._op === 'eq') {
                if (doc[k] !== v.v) {return false}
              } else if (v._op === 'neq') {
                if (doc[k] === v.v) {return false}
              }
              continue
            }
            if (doc[k] !== v) {return false}
          }
          return true
        })
        return {
          count: async () => ({ total: docs.length }),
          // M3: limit 实际截断（支持分页/限流查询）
          limit: n => ({ get: async () => ({ data: docs.slice(0, n) }) }),
          get: async () => ({ data: docs }),
          // M1: field 投影——根据传入字段对象过滤文档字段
          field: (proj) => {
            const project = (d) => {
              if (!proj) return d
              const out = {}
              for (const [k, v] of Object.entries(proj)) {
                if (v && d[k] !== undefined) { out[k] = d[k] }
              }
              return out
            }
            return {
              limit: n => ({ get: async () => ({ data: docs.slice(0, n).map(project) }) }),
              get: async () => ({ data: docs.map(project) }),
              orderBy: () => ({
                skip: offset => ({
                  limit: n => ({ get: async () => ({ data: docs.slice(offset, offset + n).map(project) }) }),
                }),
              }),
            }
          },
          orderBy: () => ({
            // M3: skip/limit 真正生效以支持数据库分页
            skip: offset => ({
              limit: n => ({ get: async () => ({ data: docs.slice(offset, offset + n) }) }),
            }),
          }),
        }
      },
      // H1: aggregate mock——支持 match + group({ _id, total: $.sum('$field') }) + end()
      aggregate: () => {
        // 链式调用：match(query) -> group(spec) -> end()
        // match 复用 where 的过滤逻辑
        let matchedDocs = self._collections[name].docs
        const chain = {
          match: (query) => {
            matchedDocs = self._collections[name].docs.filter(doc => {
              for (const [k, v] of Object.entries(query || {})) {
                if (v && typeof v === 'object' && v._op) {
                  if (v._op === 'in' && Array.isArray(v.v)) {
                    if (!v.v.includes(doc[k])) {return false}
                  } else if (v._op === 'gte') {
                    const docVal = doc[k] instanceof Date ? doc[k].getTime() : doc[k]
                    const cmpVal = v.v instanceof Date ? v.v.getTime() : v.v
                    if (!(docVal >= cmpVal)) {return false}
                  } else if (v._op === 'neq') {
                    if (doc[k] === v.v) {return false}
                  }
                  continue
                }
                if (doc[k] !== v) {return false}
              }
              return true
            })
            return chain
          },
          group: (spec) => {
            // spec: { _id: '$fieldName' | { k1: '$f1', k2: '$f2' } | null, total: $.sum('$field'), count: $.sum(1) }
            // M5: 支持 2D 分组——_id 为对象时按多字段笛卡尔积分组
            let groupByFields = null // 单维度：string；2D：{ k1: field, k2: field }
            if (spec._id == null) {
              groupByFields = null
            } else if (typeof spec._id === 'string') {
              groupByFields = spec._id.replace(/^\$/, '')
            } else if (typeof spec._id === 'object') {
              // 2D 分组：{ k1: '$field1', k2: '$field2' }
              groupByFields = {}
              for (const [k, v] of Object.entries(spec._id)) {
                if (typeof v === 'string') {
                  groupByFields[k] = v.replace(/^\$/, '')
                }
              }
            }
            const sumFields = Object.keys(spec).filter(k => k !== '_id')
            const groups = new Map()
            for (const doc of matchedDocs) {
              let key
              if (groupByFields === null) {
                key = null
              } else if (typeof groupByFields === 'string') {
                key = doc[groupByFields] ?? null
              } else {
                // 2D：key 为对象 { k1: val1, k2: val2 }
                key = {}
                for (const [k, f] of Object.entries(groupByFields)) {
                  key[k] = doc[f] ?? null
                }
                // 用 JSON 序列化作为 Map key
                key = JSON.stringify(key)
              }
              if (!groups.has(key)) {
                const init = {}
                for (const sf of sumFields) { init[sf] = 0 }
                groups.set(key, init)
              }
              const g = groups.get(key)
              for (const sf of sumFields) {
                // spec[sf] 形如 $.sum('$field') 或 $.sum(1)
                const sumExpr = spec[sf]
                if (sumExpr && typeof sumExpr === 'object' && sumExpr._sumField) {
                  g[sf] += Number(doc[sumExpr._sumField]) || 0
                } else if (sumExpr === 1 || (typeof sumExpr === 'number' && sumExpr === 1)) {
                  g[sf] += 1
                }
              }
            }
            const list = []
            for (const [key, g] of groups.entries()) {
              // 2D 分组时还原 _id 为对象
              let id = key
              if (typeof groupByFields === 'object' && groupByFields !== null && typeof key === 'string') {
                try { id = JSON.parse(key) } catch (e) { id = key }
              }
              list.push({ _id: id, ...g })
            }
            return { end: async () => ({ list }) }
          },
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
    gte: v => ({ _op: 'gte', v }),
    lte: v => ({ _op: 'lte', v }),
    inc: v => ({ _op: 'inc', v }),
    // H1: aggregate 命令——$.sum('$field') 返回带 _sumField 标记的对象供 mock 解析
    aggregate: {
      sum: (expr) => {
        if (typeof expr === 'string' && expr.startsWith('$')) {
          return { _sumField: expr.slice(1) }
        }
        // $.sum(1) 返回数字 1（mock group 中直接计数）
        return expr
      },
    },
  },
  serverDate: () => 'MOCK_DATE',
  // P1-4: 事务 mock（与 db.collection 共享同一数据集）
  startTransaction: async () => {
    const self = mockDb
    return {
      collection: self.collection.bind(self),
      // H4: 事务内 command（transaction.command.inc 用于原子扣减）
      command: self.command,
      commit: async () => {},
      rollback: async () => {},
    }
  },
}

jest.mock('wx-server-sdk', () => ({
  init: jest.fn(),
  getWXContext: () => ({ OPENID: 'oTest_openid' }),
  DYNAMIC_CURRENT_ENV: 'mock-env',
  database: () => mockDb,
}))

const wallet = require('../cloudfunctions/partnerService/services/wallet')

beforeEach(() => {
  mockDb._reset()
})

describe('partnerService/wallet', () => {
  describe('getMyWallet', () => {
    test('首次获取应返回空钱包（不自动创建）', async () => {
      // H8: GET 请求不再创建钱包，避免违反幂等性；钱包在首次佣金入账时由 commission-utils 创建
      mockDb._collections.users = { docs: [{ _id: 'oTest_openid' }] }
      const result = await wallet.getMyWallet({}, {}, { openid: 'oTest_openid' })
      expect(result.data.balance).toBe(0)
      expect(result.data.totalIncome).toBe(0)
      expect(mockDb._collections.wallets.docs.length).toBe(0)
    })

    test('已有钱包应返回现有数据', async () => {
      mockDb._collections.wallets = { docs: [{ _id: 'w1', openid: 'oTest_openid', type: 'commission', balance: 100, totalIncome: 500, totalWithdrawn: 400, frozenAmount: 0, status: 'active' }] }
      const result = await wallet.getMyWallet({}, {}, { openid: 'oTest_openid' })
      expect(result.data.balance).toBe(100)
      expect(result.data.totalIncome).toBe(500)
      expect(result.data.totalWithdrawn).toBe(400)
    })
  })

  describe('getMyIncomeOverview', () => {
    test('用户不存在应返回全零数据', async () => {
      mockDb._collections.users = { docs: [] }
      const result = await wallet.getMyIncomeOverview({}, {}, { openid: 'oTest_openid' })
      expect(result.data.commission.total).toBe(0)
      expect(result.data.hosting.total).toBe(0)
      expect(result.data.feeding.total).toBe(0)
      expect(result.data.wallet.balance).toBe(0)
    })

    test('完整数据应正确汇总', async () => {
      mockDb._collections.users = { docs: [{ _id: 'oTest_openid' }] }
      mockDb._collections.commissions = { docs: [
        { _id: 'c1', inviterId: 'oTest_openid', commissionAmount: 10, status: 'pending', orderType: 'tuan', createdAt: new Date() },
        { _id: 'c2', inviterId: 'oTest_openid', commissionAmount: 30, status: 'settled', orderType: 'mall', createdAt: new Date() },
      ] }
      mockDb._collections.orders = { docs: [
        { _id: 'o1', organizerId: 'oTest_openid', status: 'completed', type: 'boarding', totalPrice: 200, completedAt: new Date() },
      ] }
      mockDb._collections.wallets = { docs: [
        { openid: 'oTest_openid', type: 'commission', balance: 150, totalIncome: 300, totalWithdrawn: 100, frozenAmount: 0 },
        { openid: 'oTest_openid', type: 'serviceIncome', balance: 50, totalIncome: 100, totalWithdrawn: 20, frozenAmount: 0 },
      ] }

      const result = await wallet.getMyIncomeOverview({}, {}, { openid: 'oTest_openid' })
      // commission 汇总
      expect(result.data.commission.total).toBe(40)
      expect(result.data.commission.pending).toBe(10)
      expect(result.data.commission.settled).toBe(30)
      // H3: commission 按 orderType 分组
      expect(result.data.commission.byOrderType.tuan.total).toBe(10)
      expect(result.data.commission.byOrderType.mall.total).toBe(30)
      // hosting/feeding
      expect(result.data.hosting.total).toBe(200)
      // H3: serviceIncome 按 type 分组
      expect(result.data.serviceIncome.total).toBe(200) // 仅 hosting（无 feeding）
      expect(result.data.serviceIncome.byType.boarding.total).toBe(200)
      // H2: wallet 汇总 commission+serviceIncome
      expect(result.data.wallet.balance).toBe(200) // 150 + 50
      expect(result.data.wallet.totalIncome).toBe(400) // 300 + 100
      expect(result.data.wallet.totalWithdrawn).toBe(120) // 100 + 20
      // 钱包明细
      expect(result.data.wallet.commission.balance).toBe(150)
      expect(result.data.wallet.serviceIncome.balance).toBe(50)
    })
  })

  describe('getMyIncomeDetails', () => {
    test('默认 all 类型应合并多源数据', async () => {
      mockDb._collections.users = { docs: [{ _id: 'oTest_openid' }] }
      mockDb._collections.commissions = { docs: [
        { _id: 'c1', inviterId: 'oTest_openid', commissionAmount: 50, orderType: 'mall', status: 'settled', createdAt: new Date() },
      ] }
      const result = await wallet.getMyIncomeDetails({}, {}, { openid: 'oTest_openid' })
      expect(result.data.list.length).toBe(1)
      // WIP 重构：佣金按 orderType 拆分为 tuan/mall 子类型（orderType='mall' → type='mall'）
      expect(result.data.list[0].type).toBe('mall')
      expect(result.data.list[0].amount).toBe(50)
    })

    test('type=commission 应被拒绝（H4: 已移除该选项，与 all 行为重复）', async () => {
      // H4: 'commission' 类型已从 ALLOWED_TYPES 移除，避免与 'all' 行为重复
      //   'all' 已仅查询 commissions 集合（H7），等价于原 'commission' 语义
      mockDb._collections.users = { docs: [{ _id: 'oTest_openid' }] }
      await expect(
        wallet.getMyIncomeDetails({ type: 'commission' }, {}, { openid: 'oTest_openid' })
      ).rejects.toThrow(/无效的 type/)
    })

    test('分页参数应生效', async () => {
      mockDb._collections.users = { docs: [{ _id: 'oTest_openid' }] }
      const items = Array.from({ length: 25 }, (_, i) => ({
        _id: `c${i}`, inviterId: 'oTest_openid', commissionAmount: 10, status: 'settled',
        createdAt: new Date(Date.now() - i * 1000),
      }))
      mockDb._collections.commissions = { docs: items }
      const result = await wallet.getMyIncomeDetails({ type: 'all', page: 2, pageSize: 10 }, {}, { openid: 'oTest_openid' })
      expect(result.data.list.length).toBe(10)
      expect(result.data.total).toBe(25)
    })
  })

  describe('getMyWithdrawals', () => {
    test('应返回当前用户的提现记录', async () => {
      mockDb._collections.withdrawals = { docs: [
        { _id: 'wd1', openid: 'oTest_openid', amount: 100, status: 'completed' },
        { _id: 'wd2', openid: 'oTest', amount: 50, status: 'pending' },
      ] }
      const result = await wallet.getMyWithdrawals({}, {}, { openid: 'oTest_openid' })
      expect(result.data.list.length).toBe(1)
      expect(result.data.list[0]._id).toBe('wd1')
    })

    test('空记录返回空列表', async () => {
      const result = await wallet.getMyWithdrawals({}, {}, { openid: 'oTest_openid' })
      expect(result.data.list).toEqual([])
      expect(result.data.total).toBe(0)
    })
  })

  describe('requestWithdrawal', () => {
    test('低于 1 元应抛 INVALID_PARAMS', async () => {
      await expect(wallet.requestWithdrawal({ amount: 0.5 }, {}, { openid: 'oTest_openid' }))
        .rejects.toMatchObject({ code: 'INVALID_PARAMS' })
    })

    test('钱包不存在应抛 NOT_FOUND', async () => {
      mockDb._collections.wallets = { docs: [] }
      // 抛点在 try 块内，被 catch 转为 handleError
      const result = await wallet.requestWithdrawal({ amount: 50 }, {}, { openid: 'oTest_openid' })
      expect(result.code).not.toBe(0)
    })

    test('余额不足应抛 BUSINESS_ERROR', async () => {
      mockDb._collections.wallets = { docs: [{ _id: 'w1', openid: 'oTest_openid', type: 'commission', balance: 5, status: 'active' }] }
      const result = await wallet.requestWithdrawal({ amount: 50 }, {}, { openid: 'oTest_openid' })
      expect(result.code).not.toBe(0)
    })

    test('钱包已冻结应抛 BUSINESS_ERROR', async () => {
      mockDb._collections.wallets = { docs: [{ _id: 'w1', openid: 'oTest_openid', type: 'commission', balance: 100, status: 'frozen' }] }
      const result = await wallet.requestWithdrawal({ amount: 50 }, {}, { openid: 'oTest_openid' })
      expect(result.code).not.toBe(0)
    })

    test('今日已提现10次应抛每日限额', async () => {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      mockDb._collections.wallets = { docs: [{ _id: 'w1', openid: 'oTest_openid', type: 'commission', balance: 1000, status: 'active' }] }
      // P1-4: 每日限额从 1 次调整为 10 次
      // H3: 状态枚举为 awaiting_confirm（硬约束）
      mockDb._collections.withdrawals = { docs: Array.from({ length: 10 }, (_, i) => ({
        openid: 'oTest_openid', walletType: 'commission', amount: 50, status: 'awaiting_confirm', createdAt: new Date(today.getTime() + 3600_000 * (i + 1)),
      })) }
      const result = await wallet.requestWithdrawal({ amount: 50 }, {}, { openid: 'oTest_openid' })
      expect(result.code).not.toBe(0)
    })

    test('正常提现应扣减余额并创建记录', async () => {
      mockDb._collections.wallets = { docs: [{ _id: 'w1', openid: 'oTest_openid', type: 'commission', balance: 100, status: 'active' }] }
      const result = await wallet.requestWithdrawal({ amount: 30 }, {}, { openid: 'oTest_openid' })
      expect(result.code).toBe(0)
      const walletDoc = mockDb._collections.wallets.docs[0]
      expect(walletDoc.balance).toBe(70) // 100 - 30
      expect(walletDoc.frozenAmount).toBe(30) // +30 frozen
      expect(mockDb._collections.withdrawals.docs.length).toBe(1)
      expect(mockDb._collections.withdrawals.docs[0].amount).toBe(30)
      // H3: 状态枚举为 awaiting_confirm（硬约束）
      expect(mockDb._collections.withdrawals.docs[0].status).toBe('awaiting_confirm')
    })
  })
})
