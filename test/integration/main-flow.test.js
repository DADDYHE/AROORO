/**
 * 集成测试 - 端到端主链路
 * 流程：浏览寄养家庭 → 创建订单 → 计算价格 → 支付下单 → 模拟支付完成 → 订单状态流转 → 评价
 *
 * 这是「真实世界路径」的端到端测试，验证服务之间的接口、状态机、数据流。
 * 单个函数的边界已在单元测试中验证（见 payment-service-pay.test.js 等）。
 */

// ===== 共享 mock setup（与单测保持一致）=====
const _collectionsRef = {}
const mockDb = {
  _collections: _collectionsRef,
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
              } else if (v && typeof v === 'object' && v._op === 'push') {
                if (!Array.isArray(doc[k])) {doc[k] = []}
                doc[k].push(...(v.v || []))
              } else {
                doc[k] = v
              }
            }
          }
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
              } else if (v._op === 'gte') {
                if (!(doc[k] >= v.v)) {return false}
              } else if (v._op === 'lte') {
                if (!(doc[k] <= v.v)) {return false}
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
          field: () => ({ limit: () => ({ get: async () => ({ data: docs }) }) }),
          get: async () => ({ data: docs }),
          orderBy: () => ({
            skip: () => ({ limit: n => ({ get: async () => ({ data: docs }) }) }),
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
    push: v => ({ _op: 'push', v }),
  },
  serverDate: () => 'MOCK_DATE',
}

// ===== Mock 外部依赖 =====
const mockWechatPayUtils = {
  randomString: jest.fn(len => 'RAND'.padEnd(len || 6, 'X').substring(0, len || 6)),
  rsaSign: jest.fn(() => 'MOCK_SIGN'),
  httpsRequest: jest.fn(),
  generateAuthorization: jest.fn(() => 'MOCK_AUTH'),
}

jest.mock('../../cloudfunctions/paymentService/services/wechatPayUtils', () => mockWechatPayUtils)

jest.mock('../../cloudfunctions/paymentService/common/config', () => ({
  WECHAT_PAY: {
    appId: 'wx_TEST',
    mchId: '1234567890',
    serialNo: 'SERIAL',
    privateKey: 'MOCK_KEY',
    notifyUrl: 'https://example.com/notify',
  },
  ENDPOINTS: {
    WECHAT_PAY_API_BASE: 'https://api.mch.weixin.qq.com',
    WECHAT_PAY_JSAPI: '/v3/pay/transactions/jsapi',
    WECHAT_PAY_REFUND: '/v3/refund/domestic/refunds',
    WECHAT_PAY_UNIFIEDORDER: '/pay/unifiedorder',
    COS_BASE: '',
    CDN_BASE: '',
  },
}))

jest.mock('wx-server-sdk', () => ({
  init: jest.fn(),
  getWXContext: () => ({ OPENID: 'oIntegrationTest' }),
  DYNAMIC_CURRENT_ENV: 'mock-env',
  database: () => mockDb,
}))

beforeEach(() => {
  for (const k of Object.keys(mockDb._collections)) {
    mockDb._collections[k] = { docs: [] }
  }
  jest.clearAllMocks()
})

// ===== 加载被测模块 =====
const orders = require('../../cloudfunctions/orderService/orders')
const pay = require('../../cloudfunctions/paymentService/services/pay')
const { paymentStateMachine } = require('../../cloudfunctions/paymentService/common/payment-state-machine')

describe('集成测试：寄养订单主链路', () => {
  test('下单 → 计算价格 → 支付下单 → 状态推进 → 完成 全流程', async () => {
    // ========== 阶段 1: 准备数据 ==========
    const hostId = 'host_intg_1'
    const ownerId = 'oIntgOwner'
    const hostOpenid = 'oIntgHost'
    const petId = 'pet_intg_1'

    mockDb._collections.users = { docs: [
      { _id: ownerId, openid: ownerId, nickName: '宠物主', phone: '13800000001' },
      { _id: hostOpenid, openid: hostOpenid, nickName: '寄养家庭', phone: '13800000002' },
    ] }
    mockDb._collections.pets = { docs: [
      { _id: petId, ownerId, name: '豆豆', type: 'dog', weight: 8 },
    ] }
    mockDb._collections.hostProfiles = { docs: [
      { _id: hostId, openid: hostOpenid, hostName: '阳光之家', pricePerDay: 150, status: 'active' },
    ] }

    // ========== 阶段 2: 价格预估 ==========
    const price = await orders.calculatePrice({
      hostId, startDate: '2026-07-01', endDate: '2026-07-04', petIds: [petId],
    }, {}, { openid: ownerId })

    expect(price.data.totalPrice).toBe(600) // 4 天 × 150 元
    expect(price.data.days).toBe(4)

    // ========== 阶段 3: 创建订单 ==========
    const orderRes = await orders.createOrder({
      hostId, petIds: [petId], startDate: '2026-07-01', endDate: '2026-07-04',
      note: '请多陪它玩',
    }, {}, { openid: ownerId })

    const orderId = orderRes.data.orderId
    expect(orderId).toBeDefined()
    expect(orderRes.data.status).toBe('pending')
    expect(orderRes.data.paymentStatus).toBe('unpaid')
    expect(orderRes.data.totalPrice).toBe(600)
    expect(orderRes.data.ownerId).toBe(ownerId)
    expect(orderRes.data.petsInfo[0]._id).toBe(petId)
    expect(orderRes.data.hostInfo.hostName).toBe('阳光之家')

    // ========== 阶段 4: 支付下单 ==========
    mockWechatPayUtils.httpsRequest.mockResolvedValueOnce({ prepay_id: 'PREPAY_INTG' })
    const payRes = await pay.createPayment({
      type: 'order', orderId, amount: 60000,
    }, {}, { openid: ownerId })

    // Sprint 25: WrappedHandler 成功路径直接返回原始数据
    expect(payRes.outTradeNo).toMatch(/^ORDER_/)
    expect(payRes.paymentParams.package).toBe('prepay_id=PREPAY_INTG')

    // 订单状态：paymentStatus = paying
    let orderDoc = mockDb._collections.orders.docs.find(o => o._id === orderId)
    expect(orderDoc.paymentStatus).toBe('paying')
    expect(orderDoc.outTradeNo).toMatch(/^ORDER_/)

    // ========== 阶段 5: 状态机驱动支付完成 ==========
    expect(paymentStateMachine.canTransition('paying', 'paid')).toBe(true)
    // 模拟 confirmPayment 后的状态写入
    await mockDb.collection('orders').doc(orderId).update({
      data: {
        paymentStatus: 'paid',
        transactionId: 'MOCK_TXN_INTG',
        paidAt: 'MOCK_DATE',
        status: 'paid',
      },
    })

    // ========== 阶段 6: 寄养家庭确认订单 ==========
    const confirmRes = await orders.updateOrderStatus({
      orderId, status: 'confirmed',
    }, {}, { openid: hostOpenid })
    expect(confirmRes.data.status).toBe('confirmed')

    // ========== 阶段 7: 入住中 ==========
    const ongoingRes = await orders.updateOrderStatus({
      orderId, status: 'in_progress',
    }, {}, { openid: hostOpenid })
    expect(ongoingRes.data.status).toBe('in_progress')

    // ========== 阶段 8: 寄养完成 ==========
    const completedRes = await orders.updateOrderStatus({
      orderId, status: 'completed',
    }, {}, { openid: hostOpenid })
    expect(completedRes.data.status).toBe('completed')

    // 验证最终状态
    orderDoc = mockDb._collections.orders.docs.find(o => o._id === orderId)
    expect(orderDoc.status).toBe('completed')
    expect(orderDoc.paymentStatus).toBe('paid')
    expect(orderDoc.transactionId).toBe('MOCK_TXN_INTG')
  })

  test('订单取消路径：pending → cancelled 正常', async () => {
    const hostId = 'host_cancel_intg'
    const ownerId = 'oCancelIntg'
    const hostOpenid = 'oCancelHost'
    const petId = 'pet_cancel_intg'

    mockDb._collections.users = { docs: [{ _id: ownerId, openid: ownerId }] }
    mockDb._collections.pets = { docs: [{ _id: petId, ownerId, name: '小灰' }] }
    mockDb._collections.hostProfiles = { docs: [
      { _id: hostId, openid: hostOpenid, hostName: '取消测试家庭', pricePerDay: 100, status: 'active' },
    ] }

    const orderRes = await orders.createOrder({
      hostId, petIds: [petId], startDate: '2026-08-01', endDate: '2026-08-03',
    }, {}, { openid: ownerId })
    const orderId = orderRes.data.orderId

    const cancelRes = await orders.cancelOrder({ orderId }, {}, { openid: ownerId })
    expect(cancelRes.data.status).toBe('cancelled')

    const orderDoc = mockDb._collections.orders.docs.find(o => o._id === orderId)
    expect(orderDoc.status).toBe('cancelled')
  })

  test('日期冲突：第二次下单应识别出与已确认订单的冲突', async () => {
    const hostId = 'host_conflict_intg'
    const ownerId = 'oConflictIntg'
    const hostOpenid = 'oConflictHost'
    const petId = 'pet_conflict_intg'

    mockDb._collections.users = { docs: [{ _id: ownerId, openid: ownerId }] }
    mockDb._collections.pets = { docs: [{ _id: petId, ownerId, name: '小雪' }] }
    mockDb._collections.hostProfiles = { docs: [
      { _id: hostId, openid: hostOpenid, hostName: '冲突测试家庭', pricePerDay: 100, status: 'active' },
    ] }

    // 第一次下单
    const first = await orders.createOrder({
      hostId, petIds: [petId], startDate: '2026-09-01', endDate: '2026-09-05',
    }, {}, { openid: ownerId })
    const firstId = first.data.orderId

    // 推进到 confirmed
    await mockDb.collection('orders').doc(firstId).update({
      data: { status: 'confirmed' },
    })

    // 第二次查询（重叠）
    const overlapCheck = await orders.checkDateAvailability({
      hostId, startDate: '2026-09-03', endDate: '2026-09-08',
    })
    expect(overlapCheck.data.available).toBe(false)

    // 第三次查询（连续但首日重叠：9/5 是首次订单末日，9/6 开始才算完全无重叠）
    const adjacentCheck = await orders.checkDateAvailability({
      hostId, startDate: '2026-09-05', endDate: '2026-09-10',
    })
    // 当前实现为「orderEnd > requestStart」半开区间，9/5 == 9/5 不算冲突 → available
    expect(adjacentCheck.data.available).toBe(true)

    // 第四次查询（完全不重叠）
    const futureCheck = await orders.checkDateAvailability({
      hostId, startDate: '2026-09-06', endDate: '2026-09-10',
    })
    expect(futureCheck.data.available).toBe(true)
  })

  test('支付状态机：不合法转移应被拒绝', async () => {
    // 直接通过 withErrorHandling 包装的 updateOrderStatus 测试状态机
    const hostId = 'host_sm_intg'
    const ownerId = 'oSmIntg'
    const hostOpenid = 'oSmHost'
    const petId = 'pet_sm_intg'

    mockDb._collections.users = { docs: [{ _id: ownerId, openid: ownerId }] }
    mockDb._collections.pets = { docs: [{ _id: petId, ownerId, name: '小白' }] }
    mockDb._collections.hostProfiles = { docs: [
      { _id: hostId, openid: hostOpenid, hostName: '状态机家庭', pricePerDay: 100, status: 'active' },
    ] }

    // 创建并完成
    const orderRes = await orders.createOrder({
      hostId, petIds: [petId], startDate: '2026-10-01', endDate: '2026-10-02',
    }, {}, { openid: ownerId })
    const orderId = orderRes.data.orderId

    await orders.updateOrderStatus({ orderId, status: 'completed' }, {}, { openid: hostOpenid })

    // 尝试从 completed 跳回 in_progress（应被状态机拒绝）
    const invalidRes = await orders.updateOrderStatus(
      { orderId, status: 'in_progress' },
      {},
      { openid: hostOpenid }
    )
    expect(invalidRes.code).not.toBe(0)
  })
})
