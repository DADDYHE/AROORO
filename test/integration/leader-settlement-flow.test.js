/**
 * 集成测试 - 团长结算子链路（Sprint 11 新增）
 *
 * 流程：订单完成 → 写入 commission 记录 → 团长列表聚合 → 团长佣金列表
 *      → 团长结算统计 → 触发结算 → 状态由 pending → settled
 *
 * 覆盖：
 *   - getTuanLeaderList：团长画像聚合（邀请数 / 订单数 / 累计 / 待结 / 已结）
 *   - getTuanLeaderCommissions：按团长/状态/订单类型过滤
 *   - getTuanCommissionStats：全局聚合（按 orderType 拆分）
 *   - settleTuanCommissions：批量把 pending → settled
 *   - 状态机：pending → settled 单向不回退
 *   - 异常：ids 为空 → INVALID_PARAMS
 *   - 完整闭环：createCommission → 列表 → 统计 → 结算 → 验证
 */

const mockDb = {
  _collections: {},
  collection(name) {
    if (!this._collections[name]) {this._collections[name] = { docs: [] }}
    const self = this
    const allDocs = () => self._collections[name].docs
    return {
      doc: id => {
        const docChain = {
          get: async () => {
            const doc = self._collections[name].docs.find(d => d._id === id)
            return { data: doc || null }
          },
          update: async ({ data }) => {
            const doc = self._collections[name].docs.find(d => d._id === id)
            if (doc) {Object.assign(doc, data)}
            return { updated: doc ? 1 : 0 }
          },
          field: () => docChain,
          remove: async () => {
            self._collections[name].docs = self._collections[name].docs.filter(d => d._id !== id)
          },
        }
        return docChain
      },
      where: query => {
        const matchDoc = (doc, q) => {
          for (const [k, v] of Object.entries(q || {})) {
            if (v && typeof v === 'object' && v._op) {
              if (v._op === 'in' && Array.isArray(v.v)) {
                if (!v.v.includes(doc[k])) {return false}
              } else if (v._op === 'eq') {
                if (doc[k] !== v.v) {return false}
              } else if (v._op === 'ne' || v._op === 'neq') {
                if (doc[k] === v.v) {return false}
              } else if (v._op === 'lte') {
                if (!(doc[k] <= v.v)) {return false}
              } else if (v._op === 'gte') {
                if (!(doc[k] >= v.v)) {return false}
              }
              continue
            }
            if (doc[k] !== v) {return false}
          }
          return true
        }
        const docs = allDocs().filter(doc => matchDoc(doc, query))
        const chain = {
          count: async () => ({ total: docs.length }),
          field: () => chain,
          orderBy: () => chain,
          skip: () => chain,
          limit: () => chain,
          get: async () => ({ data: docs }),
          // P1-B: 条件更新 — 返回 { stats: { updated: <count> } } 以匹配 CloudBase SDK 行为
          update: async ({ data }) => {
            let updated = 0
            for (const doc of docs) {
              Object.assign(doc, data)
              updated += 1
            }
            return { stats: { updated } }
          },
          remove: async () => {
            const ids = new Set(docs.map(d => d._id))
            self._collections[name].docs = self._collections[name].docs.filter(d => !ids.has(d._id))
            return { stats: { removed: docs.length } }
          },
        }
        return chain
      },
      // 集合级别 limit：用于 db.collection('xxx').limit(N).get() 这类直接调用的场景
      limit: n => ({
        get: async () => ({ data: allDocs().slice(0, n) }),
        field: () => ({
          get: async () => ({ data: allDocs().slice(0, n) }),
        }),
        orderBy: () => ({
          get: async () => ({ data: allDocs().slice(0, n) }),
        }),
      }),
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
    ne: v => ({ _op: 'ne', v }),
    neq: v => ({ _op: 'neq', v }),
    lte: v => ({ _op: 'lte', v }),
    gte: v => ({ _op: 'gte', v }),
    lt: v => ({ _op: 'lt', v }),
    gt: v => ({ _op: 'gt', v }),
    inc: n => ({ _op: 'inc', v: n }),
  },
  serverDate: () => new Date(),
  RegExp: opts => ({ _regexp: opts }),
}

jest.mock('wx-server-sdk', () => ({
  init: jest.fn(),
  getWXContext: () => ({ OPENID: 'oLeaderTest' }),
  DYNAMIC_CURRENT_ENV: 'mock-env',
  database: () => mockDb,
}))

beforeEach(() => {
  for (const k of Object.keys(mockDb._collections)) {
    mockDb._collections[k] = { docs: [] }
  }
})

const createCommission = require('../../cloudfunctions/paymentService/services/commission').createCommissionRecord
const tuanAdmin = require('../../cloudfunctions/adminService/services/tuan')

describe('集成测试：团长结算子链路', () => {
  // ============ 工具：构建测试数据 ============
  const setupScenario = ({
    leaders = [],
    invited = [],
    commissions = [],
    config = { hosting: 10, mall: 5, activity: 8, feeding: 6 },
  } = {}) => {
    mockDb._collections.users = { docs: [...leaders, ...invited] }
    mockDb._collections.system_config = { docs: [{ _id: 'commission_rates', ...config }] }
    // 佣金已统一写入 commissions 集合（原 tuan_commissions 已废弃）
    mockDb._collections.commissions = { docs: commissions }
  }

  // ============ getTuanLeaderList ============
  describe('getTuanLeaderList：团长画像聚合', () => {
    test('无团长 → 返回空列表', async () => {
      setupScenario()
      const res = await tuanAdmin.getTuanLeaderList({}, {}, { openid: 'admin' })
      expect(res.code).toBe(0)
      expect(res.data.list).toEqual([])
      expect(res.data.total).toBe(0)
    })

    test('1 个团长 + 0 邀请 + 0 佣金 → 基础画像', async () => {
      setupScenario({
        leaders: [{ _id: 'L1', nickName: '团长一', role: 'super_admin' }],
      })
      const res = await tuanAdmin.getTuanLeaderList({}, {}, { openid: 'admin' })
      expect(res.data.list.length).toBe(1)
      const l = res.data.list[0]
      expect(l._id).toBe('L1')
      expect(l.invitedCount).toBe(0)
      expect(l.orderCount).toBe(0)
      expect(l.totalCommission).toBe(0)
      expect(l.pendingAmount).toBe(0)
      expect(l.settledAmount).toBe(0)
    })

    test('团长按 totalCommission 倒序', async () => {
      setupScenario({
        leaders: [
          { _id: 'L1', nickName: '低额团长', role: 'super_admin' },
          { _id: 'L2', nickName: '高额团长', role: 'host_admin' },
        ],
        commissions: [
          { _id: 'c1', inviterId: 'L1', commissionAmount: 30, status: 'pending', orderType: 'hosting' },
          { _id: 'c2', inviterId: 'L2', commissionAmount: 200, status: 'pending', orderType: 'hosting' },
        ],
      })
      const res = await tuanAdmin.getTuanLeaderList({}, {}, { openid: 'admin' })
      expect(res.data.list[0]._id).toBe('L2')
      expect(res.data.list[1]._id).toBe('L1')
    })

    test('按 orderType 拆分累计 / 待结 / 已结', async () => {
      setupScenario({
        leaders: [{ _id: 'L1', nickName: '团长', role: 'host_admin' }],
        commissions: [
          { _id: 'c1', inviterId: 'L1', commissionAmount: 50, status: 'pending', orderType: 'hosting' },
          { _id: 'c2', inviterId: 'L1', commissionAmount: 30, status: 'pending', orderType: 'mall' },
          { _id: 'c3', inviterId: 'L1', commissionAmount: 100, status: 'settled', orderType: 'hosting' },
          { _id: 'c4', inviterId: 'L1', commissionAmount: 20, status: 'settled', orderType: 'activity' },
        ],
      })
      const res = await tuanAdmin.getTuanLeaderList({}, {}, { openid: 'admin' })
      const l = res.data.list[0]
      expect(l.totalCommission).toBe(200)
      expect(l.pendingAmount).toBe(80)
      expect(l.settledAmount).toBe(120)
      // 历史 hosting 文档经 normalizeOrderType 归并到 boarding 口径
      expect(l.orderTypeStats.boarding.totalAmount).toBe(150)
      expect(l.orderTypeStats.boarding.pendingAmount).toBe(50)
      expect(l.orderTypeStats.boarding.settledAmount).toBe(100)
      expect(l.orderTypeStats.mall.totalAmount).toBe(30)
      expect(l.orderTypeStats.activity.totalAmount).toBe(20)
    })

    test('邀请数准确：invited 中只统计有 inviterId 指向团长的 user', async () => {
      setupScenario({
        leaders: [{ _id: 'L1', role: 'super_admin' }],
        invited: [
          { _id: 'u1', inviterId: 'L1' },
          { _id: 'u2', inviterId: 'L1' },
          { _id: 'u3', inviterId: 'OTHER' },
        ],
      })
      const res = await tuanAdmin.getTuanLeaderList({}, {}, { openid: 'admin' })
      expect(res.data.list[0].invitedCount).toBe(2)
    })
  })

  // ============ getTuanLeaderCommissions ============
  describe('getTuanLeaderCommissions：佣金列表', () => {
    test('按 leaderId 过滤', async () => {
      setupScenario({
        commissions: [
          { _id: 'c1', inviterId: 'L1', commissionAmount: 10, status: 'pending', orderType: 'hosting' },
          { _id: 'c2', inviterId: 'L2', commissionAmount: 20, status: 'pending', orderType: 'hosting' },
        ],
      })
      const res = await tuanAdmin.getTuanLeaderCommissions({ leaderId: 'L1' }, {}, {})
      expect(res.data.list.length).toBe(1)
      expect(res.data.list[0]._id).toBe('c1')
    })

    test('按 status 过滤', async () => {
      setupScenario({
        commissions: [
          { _id: 'c1', inviterId: 'L1', status: 'pending', commissionAmount: 10 },
          { _id: 'c2', inviterId: 'L1', status: 'settled', commissionAmount: 20 },
        ],
      })
      const res = await tuanAdmin.getTuanLeaderCommissions({ status: 'settled' }, {}, {})
      expect(res.data.list.length).toBe(1)
      expect(res.data.list[0]._id).toBe('c2')
    })

    test('按 orderType 过滤', async () => {
      setupScenario({
        commissions: [
          { _id: 'c1', inviterId: 'L1', orderType: 'hosting', commissionAmount: 10 },
          { _id: 'c2', inviterId: 'L1', orderType: 'mall', commissionAmount: 20 },
        ],
      })
      const res = await tuanAdmin.getTuanLeaderCommissions({ orderType: 'mall' }, {}, {})
      expect(res.data.list.length).toBe(1)
      expect(res.data.list[0]._id).toBe('c2')
    })

    test('组合过滤：leaderId + status + orderType', async () => {
      setupScenario({
        commissions: [
          { _id: 'c1', inviterId: 'L1', status: 'pending', orderType: 'hosting', commissionAmount: 10 },
          { _id: 'c2', inviterId: 'L1', status: 'settled', orderType: 'hosting', commissionAmount: 20 },
          { _id: 'c3', inviterId: 'L2', status: 'settled', orderType: 'hosting', commissionAmount: 30 },
        ],
      })
      const res = await tuanAdmin.getTuanLeaderCommissions(
        { leaderId: 'L1', status: 'settled', orderType: 'hosting' },
        {},
        {}
      )
      expect(res.data.list.length).toBe(1)
      expect(res.data.list[0]._id).toBe('c2')
    })
  })

  // ============ getTuanCommissionStats ============
  describe('getTuanCommissionStats：全局统计', () => {
    test('全空数据 → 全 0', async () => {
      setupScenario()
      const res = await tuanAdmin.getTuanCommissionStats({}, {}, {})
      expect(res.data.totalCommissions).toBe(0)
      expect(res.data.totalAmount).toBe(0)
      expect(res.data.pendingCount).toBe(0)
      expect(res.data.settledCount).toBe(0)
    })

    test('多种订单类型 + pending/settled 拆分', async () => {
      setupScenario({
        commissions: [
          { _id: 'c1', inviterId: 'L1', commissionAmount: 100, status: 'pending', orderType: 'hosting' },
          { _id: 'c2', inviterId: 'L1', commissionAmount: 50, status: 'settled', orderType: 'hosting' },
          { _id: 'c3', inviterId: 'L1', commissionAmount: 30, status: 'pending', orderType: 'mall' },
        ],
      })
      const res = await tuanAdmin.getTuanCommissionStats({}, {}, {})
      expect(res.data.totalCommissions).toBe(3)
      expect(res.data.totalAmount).toBe(180)
      expect(res.data.pendingCount).toBe(2)
      expect(res.data.pendingAmount).toBe(130)
      expect(res.data.settledCount).toBe(1)
      expect(res.data.settledAmount).toBe(50)
      expect(res.data.orderTypeStats.boarding.totalAmount).toBe(150)
      expect(res.data.orderTypeStats.mall.totalAmount).toBe(30)
    })

    test('orderTypeStats 含完整字段：rate / totalCount / pendingCount / settledCount / 金额', async () => {
      setupScenario({
        commissions: [
          { _id: 'c1', inviterId: 'L1', commissionAmount: 100, status: 'pending', orderType: 'hosting' },
        ],
      })
      const res = await tuanAdmin.getTuanCommissionStats({}, {}, {})
      const boarding = res.data.orderTypeStats.boarding
      expect(boarding.rate).toBe(10)
      expect(boarding.totalCount).toBe(1)
      expect(boarding.pendingCount).toBe(1)
      expect(boarding.settledCount).toBe(0)
      expect(boarding.totalAmount).toBe(100)
    })

    test('金额小数位精度：0.1 + 0.2 不应等于 0.30000000000000004', async () => {
      setupScenario({
        commissions: [
          { _id: 'c1', inviterId: 'L1', commissionAmount: 0.1, status: 'pending', orderType: 'mall' },
          { _id: 'c2', inviterId: 'L1', commissionAmount: 0.2, status: 'settled', orderType: 'mall' },
        ],
      })
      const res = await tuanAdmin.getTuanCommissionStats({}, {}, {})
      expect(res.data.totalAmount).toBe(0.3)
      expect(res.data.orderTypeStats.mall.totalAmount).toBe(0.3)
    })
  })

  // ============ settleTuanCommissions ============
  describe('settleTuanCommissions：批量结算', () => {
    test('正常：批量把 pending → settled，记录 settledBy / settledAt', async () => {
      setupScenario({
        commissions: [
          { _id: 'c1', inviterId: 'L1', status: 'pending', commissionAmount: 50 },
          { _id: 'c2', inviterId: 'L1', status: 'pending', commissionAmount: 80 },
        ],
      })
      const res = await tuanAdmin.settleCommissions(
        { ids: ['c1', 'c2'] },
        {},
        { openid: 'admin001' }
      )
      expect(res.code).toBe(0)
      expect(res.data.settledCount).toBe(2)
      const c1 = mockDb._collections.commissions.docs.find(d => d._id === 'c1')
      expect(c1.status).toBe('settled')
      expect(c1.settledBy).toBe('admin001')
      expect(c1.settledAt).toBeDefined()
    })

    test('ids 为空 → INVALID_PARAMS（抛 BusinessError）', async () => {
      let caught = null
      try {
        await tuanAdmin.settleCommissions(
          { ids: [] },
          {},
          { openid: 'admin001' }
        )
      } catch (e) {
        caught = e
      }
      expect(caught).toBeTruthy()
      expect(caught.code).toBe('INVALID_PARAMS')
    })

    test('ids 缺字段 → INVALID_PARAMS（抛 BusinessError）', async () => {
      let caught = null
      try {
        await tuanAdmin.settleCommissions(
          {},
          {},
          { openid: 'admin001' }
        )
      } catch (e) {
        caught = e
      }
      expect(caught).toBeTruthy()
      expect(caught.code).toBe('INVALID_PARAMS')
    })

    test('已 settled 的记录再次结算：status 保持 settled，settledBy 不被覆盖（P1-B 并发安全）', async () => {
      setupScenario({
        commissions: [
          { _id: 'c1', inviterId: 'L1', status: 'settled', commissionAmount: 50, settledAt: new Date(0), settledBy: 'old' },
        ],
      })
      await tuanAdmin.settleCommissions({ ids: ['c1'] }, {}, { openid: 'newAdmin' })
      const c1 = mockDb._collections.commissions.docs.find(d => d._id === 'c1')
      expect(c1.status).toBe('settled')
      // P1-B: 已结算记录被跳过（where status=pending 命中 0 条），原 settledBy 保留
      expect(c1.settledBy).toBe('old')
    })

    test('混合 pending + settled：仅 pending 记录被结算，settled 记录保持原状（P1-B 并发安全）', async () => {
      const oldTime = new Date(1000)
      setupScenario({
        commissions: [
          { _id: 'c1', inviterId: 'L1', status: 'pending', commissionAmount: 50 },
          { _id: 'c2', inviterId: 'L1', status: 'settled', commissionAmount: 30, settledAt: oldTime, settledBy: 'prev' },
        ],
      })
      await tuanAdmin.settleCommissions({ ids: ['c1', 'c2'] }, {}, { openid: 'adminX' })
      const c1 = mockDb._collections.commissions.docs.find(d => d._id === 'c1')
      const c2 = mockDb._collections.commissions.docs.find(d => d._id === 'c2')
      // c1 之前是 pending，现在有 settledAt/settledBy
      expect(c1.settledBy).toBe('adminX')
      expect(c1.settledAt).toBeDefined()
      // P1-B: c2 已 settled，where status=pending 不命中，保留原 settledBy/settledAt
      expect(c2.settledBy).toBe('prev')
      expect(c2.settledAt.getTime()).toBe(oldTime.getTime())
    })
  })

  // ============ 完整闭环 ============
  describe('端到端：佣金产生 → 列表 → 统计 → 结算', () => {
    test('完整闭环：pending → settled', async () => {
      // 1. 准备团长与邀请关系
      setupScenario({
        leaders: [
          { _id: 'L1', nickName: '团长一', role: 'super_admin' },
        ],
        invited: [
          { _id: 'oBuyer1', inviterId: 'L1' },
        ],
        config: { hosting: 10, mall: 5, activity: 8, feeding: 6 },
      })
      // 2. 触发佣金写入
      await createCommission('hosting', {
        _id: 'ord_001',
        ownerId: 'oBuyer1',
        totalPrice: 1000,
      })
      await createCommission('mall', {
        _id: 'ord_002',
        ownerId: 'oBuyer1',
        totalPrice: 2000,
      })
      const comms = mockDb._collections.commissions.docs
      expect(comms.length).toBe(2)
      expect(comms.every(c => c.status === 'pending')).toBe(true)

      // 3. 团长列表能看到这笔佣金
      const leaderList = await tuanAdmin.getTuanLeaderList({}, {}, { openid: 'admin' })
      const l = leaderList.data.list[0]
      expect(l.totalCommission).toBe(200) // 100 + 100
      expect(l.pendingAmount).toBe(200)
      expect(l.settledAmount).toBe(0)

      // 4. 统计
      const stats = await tuanAdmin.getTuanCommissionStats({}, {}, {})
      expect(stats.data.totalCommissions).toBe(2)
      expect(stats.data.pendingCount).toBe(2)
      expect(stats.data.settledCount).toBe(0)

      // 5. 批量结算
      const ids = comms.map(c => c._id)
      const settleRes = await tuanAdmin.settleCommissions(
        { ids },
        {},
        { openid: 'admin001' }
      )
      expect(settleRes.data.settledCount).toBe(2)

      // 6. 验证：再查统计应该全部 settled
      const stats2 = await tuanAdmin.getTuanCommissionStats({}, {}, {})
      expect(stats2.data.pendingCount).toBe(0)
      expect(stats2.data.settledCount).toBe(2)
      expect(stats2.data.settledAmount).toBe(200)

      // 7. 验证：团长画像更新
      const leaderList2 = await tuanAdmin.getTuanLeaderList({}, {}, { openid: 'admin' })
      const l2 = leaderList2.data.list[0]
      expect(l2.pendingAmount).toBe(0)
      expect(l2.settledAmount).toBe(200)
    })

    test('多团长：结算只影响指定的 ids 集合', async () => {
      setupScenario({
        leaders: [
          { _id: 'L1', nickName: '团长一', role: 'super_admin' },
          { _id: 'L2', nickName: '团长二', role: 'host_admin' },
        ],
        invited: [
          { _id: 'oBuyer1', inviterId: 'L1' },
          { _id: 'oBuyer2', inviterId: 'L2' },
        ],
        config: { hosting: 10, mall: 5, activity: 8, feeding: 6 },
      })
      await createCommission('hosting', { _id: 'o1', ownerId: 'oBuyer1', totalPrice: 1000 })
      await createCommission('mall', { _id: 'o2', ownerId: 'oBuyer2', totalPrice: 2000 })

      const comms = mockDb._collections.commissions.docs
      expect(comms.length).toBe(2)
      const l1CommId = comms.find(c => c.inviterId === 'L1')._id

      // 只结算 L1 的那笔
      await tuanAdmin.settleCommissions({ ids: [l1CommId] }, {}, { openid: 'admin' })

      // 验证：L1 全部 settled，L2 仍 pending
      const stats = await tuanAdmin.getTuanCommissionStats({}, {}, {})
      expect(stats.data.pendingCount).toBe(1)
      expect(stats.data.settledCount).toBe(1)

      const leaderList = await tuanAdmin.getTuanLeaderList({}, {}, { openid: 'admin' })
      const l1 = leaderList.data.list.find(l => l._id === 'L1')
      const l2 = leaderList.data.list.find(l => l._id === 'L2')
      expect(l1.settledAmount).toBe(100)
      expect(l1.pendingAmount).toBe(0)
      expect(l2.settledAmount).toBe(0)
      expect(l2.pendingAmount).toBe(100)
    })
  })

  // ============ 状态机：pending → settled 单向 ============
  describe('状态机语义：pending 不可回退', () => {
    test('settled 记录不再回到 pending', async () => {
      setupScenario({
        commissions: [
          { _id: 'c1', inviterId: 'L1', status: 'settled', commissionAmount: 50, settledBy: 'old' },
        ],
      })
      const before = mockDb._collections.commissions.docs[0]
      await tuanAdmin.settleCommissions({ ids: ['c1'] }, {}, { openid: 'new' })
      const after = mockDb._collections.commissions.docs[0]
      expect(after.status).toBe('settled')
      expect(after.status).not.toBe('pending')
    })
  })
})
