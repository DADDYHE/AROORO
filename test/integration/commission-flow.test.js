/**
 * 集成测试 - 佣金子链路
 *
 * 流程：订单完成 → 触发 _createCommissionRecord → 写入 tuan_commissions
 *
 * 覆盖：
 *   - 邀请人存在 + 配置存在 → 写入 commission 记录
 *   - 重复订单 → 不重复写
 *   - 邀请人不存在 → 静默跳过
 *   - 邀请人存在但配置无该 orderType 费率 → 跳过
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
        return {
          count: async () => ({ total: docs.length }),
          limit: () => ({ get: async () => ({ data: docs }) }),
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
  command: {
    in: arr => ({ _op: 'in', v: arr }),
    eq: v => ({ _op: 'eq', v }),
  },
  serverDate: () => 'MOCK_DATE',
}

jest.mock('wx-server-sdk', () => ({
  init: jest.fn(),
  getWXContext: () => ({ OPENID: 'oCommTest' }),
  DYNAMIC_CURRENT_ENV: 'mock-env',
  database: () => mockDb,
}))

beforeEach(() => {
  for (const k of Object.keys(mockDb._collections)) {
    mockDb._collections[k] = { docs: [] }
  }
})

const createCommission = require('../../cloudfunctions/paymentService/services/commission').createCommissionRecord

describe('集成测试：佣金子链路', () => {
  const setupCommonData = ({
    ownerId = 'oOwner',
    inviterId = 'oInviter',
    orderType = 'hosting',
    orderAmount = 1000,
    configRate = 10,
  } = {}) => {
    mockDb._collections.users = { docs: [
      { _id: ownerId, openid: ownerId, nickName: '宠物主', inviterId },
      { _id: inviterId, openid: inviterId, nickName: '邀请人' },
    ] }
    mockDb._collections.system_config = { docs: [
      { _id: 'commission_rates', [orderType]: configRate },
    ] }
    mockDb._collections.tuan_commissions = { docs: [] }
  }

  test('正常流程：邀请人存在 + 费率配置存在 → 写入 commission 记录', async () => {
    setupCommonData({ orderAmount: 1000, configRate: 10 })

    await createCommission('hosting', {
      _id: 'o1',
      ownerId: 'oOwner',
      totalPrice: 1000,
    })

    const records = mockDb._collections.tuan_commissions.docs
    expect(records.length).toBe(1)
    expect(records[0].orderId).toBe('o1')
    expect(records[0].inviterId).toBe('oInviter')
    expect(records[0].inviterNickName).toBe('邀请人')
    expect(records[0].ownerId).toBe('oOwner')
    expect(records[0].orderType).toBe('hosting')
    expect(records[0].orderAmount).toBe(1000)
    expect(records[0].commissionRate).toBe(10)
    expect(records[0].commissionAmount).toBe(100) // 1000 * 10% = 100
    expect(records[0].status).toBe('pending')
  })

  test('去重：同一订单不能写入多次 commission', async () => {
    setupCommonData()
    const order = { _id: 'o1', ownerId: 'oOwner', totalPrice: 1000 }

    await createCommission('hosting', order)
    await createCommission('hosting', order)
    await createCommission('hosting', order)

    const records = mockDb._collections.tuan_commissions.docs
    expect(records.length).toBe(1)
  })

  test('跳过：用户无 inviterId 时不写 commission', async () => {
    setupCommonData()
    // 覆盖：把 inviterId 去掉
    mockDb._collections.users.docs[0].inviterId = ''

    await createCommission('hosting', { _id: 'o1', ownerId: 'oOwner', totalPrice: 1000 })

    expect(mockDb._collections.tuan_commissions.docs.length).toBe(0)
  })

  test('跳过：邀请人用户记录不存在时静默退出', async () => {
    setupCommonData()
    // 移除邀请人记录
    mockDb._collections.users.docs = mockDb._collections.users.docs.filter(u => u._id !== 'oInviter')

    await createCommission('hosting', { _id: 'o1', ownerId: 'oOwner', totalPrice: 1000 })

    expect(mockDb._collections.tuan_commissions.docs.length).toBe(0)
  })

  test('跳过：system_config 缺失该 orderType 费率时', async () => {
    setupCommonData({ orderType: 'hosting', configRate: 10 })
    // 把 system_config 改成不含 hosting 字段
    mockDb._collections.system_config.docs[0] = { _id: 'commission_rates', mall: 5 }

    await createCommission('hosting', { _id: 'o1', ownerId: 'oOwner', totalPrice: 1000 })

    expect(mockDb._collections.tuan_commissions.docs.length).toBe(0)
  })

  test('跳过：orderAmount 为 0 时不写 commission', async () => {
    setupCommonData({ orderAmount: 0 })

    await createCommission('hosting', { _id: 'o1', ownerId: 'oOwner', totalPrice: 0 })

    expect(mockDb._collections.tuan_commissions.docs.length).toBe(0)
  })

  test('多 orderType 独立费率：mall 与 hosting 同时启用', async () => {
    setupCommonData({ orderType: 'hosting' })
    // 调整 config 支持多 orderType
    mockDb._collections.system_config.docs[0] = { _id: 'commission_rates', hosting: 10, mall: 5 }

    await createCommission('hosting', { _id: 'o1', ownerId: 'oOwner', totalPrice: 1000 })
    await createCommission('mall', { _id: 'o2', ownerId: 'oOwner', totalPrice: 2000 })

    const records = mockDb._collections.tuan_commissions.docs
    expect(records.length).toBe(2)
    expect(records.find(r => r.orderType === 'hosting').commissionAmount).toBe(100)
    expect(records.find(r => r.orderType === 'mall').commissionAmount).toBe(100) // 2000 * 5% = 100
  })

  test('计算精度：金额 × 费率结果保留 2 位小数（不引入浮点误差）', async () => {
    setupCommonData({ orderAmount: 333, configRate: 7 })

    await createCommission('hosting', { _id: 'o1', ownerId: 'oOwner', totalPrice: 333 })

    const record = mockDb._collections.tuan_commissions.docs[0]
    // 333 * 7% = 23.31
    expect(record.commissionAmount).toBe(23.31)
  })
})
