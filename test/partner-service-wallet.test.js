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
                if (!v.v.includes(doc[k])) return false
              } else if (v._op === 'gte') {
                const docVal = doc[k] instanceof Date ? doc[k].getTime() : doc[k]
                const cmpVal = v.v instanceof Date ? v.v.getTime() : v.v
                if (!(docVal >= cmpVal)) return false
              } else if (v._op === 'lte') {
                const docVal = doc[k] instanceof Date ? doc[k].getTime() : doc[k]
                const cmpVal = v.v instanceof Date ? v.v.getTime() : v.v
                if (!(docVal <= cmpVal)) return false
              } else if (v._op === 'eq') {
                if (doc[k] !== v.v) return false
              }
              continue
            }
            if (doc[k] !== v) return false
          }
          return true
        })
        return {
          count: async () => ({ total: docs.length }),
          limit: n => ({ get: async () => ({ data: docs }) }),
          get: async () => ({ data: docs }),
          orderBy: () => ({
            skip: () => ({
              limit: n => ({ get: async () => ({ data: docs }) }),
            }),
          }),
        }
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
    gte: v => ({ _op: 'gte', v }),
    lte: v => ({ _op: 'lte', v }),
    inc: v => ({ _op: 'inc', v }),
  },
  serverDate: () => 'MOCK_DATE',
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
    test('首次获取应自动创建钱包', async () => {
      mockDb._collections.users = { docs: [{ _id: 'oTest_openid' }] }
      const result = await wallet.getMyWallet({}, {}, { openid: 'oTest_openid' })
      expect(result.data.balance).toBe(0)
      expect(mockDb._collections.wallets.docs.length).toBe(1)
    })

    test('已有钱包应返回现有数据', async () => {
      mockDb._collections.wallets = { docs: [{ _id: 'w1', openid: 'oTest_openid', balance: 100, totalIncome: 500, totalWithdrawn: 400, frozenAmount: 0, status: 'active' }] }
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
      mockDb._collections.tuan_commissions = { docs: [
        { _id: 'c1', inviterId: 'oTest_openid', commissionAmount: 10, status: 'pending', createdAt: new Date() },
        { _id: 'c2', inviterId: 'oTest_openid', commissionAmount: 30, status: 'settled', createdAt: new Date() },
      ]}
      mockDb._collections.orders = { docs: [
        { _id: 'o1', hostId: 'oTest_openid', status: 'completed', type: 'boarding', totalPrice: 200, completedAt: new Date() },
      ]}
      mockDb._collections.wallets = { docs: [{ openid: 'oTest_openid', balance: 150, totalIncome: 300, totalWithdrawn: 100, frozenAmount: 0 }] }

      const result = await wallet.getMyIncomeOverview({}, {}, { openid: 'oTest_openid' })
      expect(result.data.commission.total).toBe(40)
      expect(result.data.commission.pending).toBe(10)
      expect(result.data.commission.settled).toBe(30)
      expect(result.data.hosting.total).toBe(200)
      expect(result.data.wallet.balance).toBe(150)
    })
  })

  describe('getMyIncomeDetails', () => {
    test('默认 all 类型应合并多源数据', async () => {
      mockDb._collections.users = { docs: [{ _id: 'oTest_openid' }] }
      mockDb._collections.tuan_commissions = { docs: [
        { _id: 'c1', inviterId: 'oTest_openid', commissionAmount: 50, orderType: 'mall', status: 'settled', createdAt: new Date() },
      ]}
      const result = await wallet.getMyIncomeDetails({}, {}, { openid: 'oTest_openid' })
      expect(result.data.list.length).toBe(1)
      expect(result.data.list[0].type).toBe('commission')
      expect(result.data.list[0].amount).toBe(50)
    })

    test('type=commission 只返回佣金', async () => {
      mockDb._collections.users = { docs: [{ _id: 'oTest_openid' }] }
      mockDb._collections.tuan_commissions = { docs: [
        { _id: 'c1', inviterId: 'oTest_openid', commissionAmount: 50, status: 'settled', createdAt: new Date() },
      ]}
      mockDb._collections.orders = { docs: [
        { _id: 'o1', hostId: 'oTest_openid', status: 'completed', type: 'boarding', totalPrice: 200, completedAt: new Date() },
      ]}
      const result = await wallet.getMyIncomeDetails({ type: 'commission' }, {}, { openid: 'oTest_openid' })
      expect(result.data.list.every(i => i.type === 'commission')).toBe(true)
    })

    test('分页参数应生效', async () => {
      mockDb._collections.users = { docs: [{ _id: 'oTest_openid' }] }
      const items = Array.from({ length: 25 }, (_, i) => ({
        _id: `c${i}`, inviterId: 'oTest_openid', commissionAmount: 10, status: 'settled',
        createdAt: new Date(Date.now() - i * 1000),
      }))
      mockDb._collections.tuan_commissions = { docs: items }
      const result = await wallet.getMyIncomeDetails({ type: 'commission', page: 2, pageSize: 10 }, {}, { openid: 'oTest_openid' })
      expect(result.data.list.length).toBe(10)
      expect(result.data.total).toBe(25)
    })
  })

  describe('getMyWithdrawals', () => {
    test('应返回当前用户的提现记录', async () => {
      mockDb._collections.withdrawals = { docs: [
        { _id: 'wd1', openid: 'oTest_openid', amount: 100, status: 'completed' },
        { _id: 'wd2', openid: 'oTest', amount: 50, status: 'pending' },
      ]}
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
    test('低于 10 元应抛 INVALID_PARAMS', async () => {
      await expect(wallet.requestWithdrawal({ amount: 5 }, {}, { openid: 'oTest_openid' }))
        .rejects.toMatchObject({ code: 'INVALID_PARAMS' })
    })

    test('钱包不存在应抛 NOT_FOUND', async () => {
      mockDb._collections.wallets = { docs: [] }
      // 抛点在 try 块内，被 catch 转为 handleError
      const result = await wallet.requestWithdrawal({ amount: 50 }, {}, { openid: 'oTest_openid' })
      expect(result.code).not.toBe(0)
    })

    test('余额不足应抛 BUSINESS_ERROR', async () => {
      mockDb._collections.wallets = { docs: [{ _id: 'w1', openid: 'oTest_openid', balance: 5, status: 'active' }] }
      const result = await wallet.requestWithdrawal({ amount: 50 }, {}, { openid: 'oTest_openid' })
      expect(result.code).not.toBe(0)
    })

    test('钱包已冻结应抛 BUSINESS_ERROR', async () => {
      mockDb._collections.wallets = { docs: [{ _id: 'w1', openid: 'oTest_openid', balance: 100, status: 'frozen' }] }
      const result = await wallet.requestWithdrawal({ amount: 50 }, {}, { openid: 'oTest_openid' })
      expect(result.code).not.toBe(0)
    })

    test('今日已提现应抛每日限额', async () => {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      mockDb._collections.wallets = { docs: [{ _id: 'w1', openid: 'oTest_openid', balance: 100, status: 'active' }] }
      mockDb._collections.withdrawals = { docs: [
        { openid: 'oTest_openid', amount: 50, status: 'pending', createdAt: new Date(today.getTime() + 3600_000) },
      ]}
      const result = await wallet.requestWithdrawal({ amount: 50 }, {}, { openid: 'oTest_openid' })
      expect(result.code).not.toBe(0)
    })

    test('正常提现应扣减余额并创建记录', async () => {
      mockDb._collections.wallets = { docs: [{ _id: 'w1', openid: 'oTest_openid', balance: 100, status: 'active' }] }
      const result = await wallet.requestWithdrawal({ amount: 30 }, {}, { openid: 'oTest_openid' })
      expect(result.code).toBe(0)
      const walletDoc = mockDb._collections.wallets.docs[0]
      expect(walletDoc.balance).toBe(70) // 100 - 30
      expect(walletDoc.frozenAmount).toBe(30) // +30 frozen
      expect(mockDb._collections.withdrawals.docs.length).toBe(1)
      expect(mockDb._collections.withdrawals.docs[0].amount).toBe(30)
      expect(mockDb._collections.withdrawals.docs[0].status).toBe('pending')
    })
  })
})
