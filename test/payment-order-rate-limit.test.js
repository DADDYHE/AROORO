/**
 * Sprint 18: createPayment / createOrder 风控限流接入测试
 *
 * 验证：
 *   1. createPayment 应调用 withRateLimit，参数 { userId, type: 'payment', targetId: orderId }
 *   2. createOrder 应调用 withRateLimit，参数 { userId, type: 'order', targetId: hostId }
 *   3. 限流命中时 RATE_LIMITED 错误应透传
 *   4. 同一用户对同一 orderId / hostId 短时间多次应被拦截
 *   5. 不同用户 / 不同 targetId 互不影响
 */

// ===== Mock wechatPayUtils =====
const mockWechatPayUtils = {
  randomString: jest.fn(len => 'RAND'.repeat(Math.ceil((len || 6) / 4)).substring(0, len || 6)),
  rsaSign: jest.fn(() => 'MOCK_SIGN'),
  httpsRequest: jest.fn(async () => ({ prepay_id: 'PREPAY_X' })),
  generateAuthorization: jest.fn(() => 'MOCK_AUTH'),
}

jest.mock('../cloudfunctions/paymentService/services/wechatPayUtils', () => mockWechatPayUtils)

// ===== Mock payment-state-machine =====
jest.mock('../cloudfunctions/paymentService/common/payment-state-machine', () => ({
  __esModule: true,
  paymentStateMachine: {
    canTransition: jest.fn(() => true),
    assertTransition: jest.fn(),
    STATES: ['unpaid', 'paying', 'paid', 'refunded', 'closed'],
  },
  resolveOrderStatus: jest.fn(() => 'paid'),
  isKnownOrderType: jest.fn(() => true),
}))

// ===== Mock config =====
jest.mock('../cloudfunctions/paymentService/common/config', () => ({
  WECHAT_PAY: {
    appId: 'wx_TEST_APPID',
    mchId: '1234567890',
    serialNo: 'SERIAL_TEST',
    privateKey: 'MOCK_PRIVATE_KEY',
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

// ===== Mock risk-rate-limit（自包含内存限流，模拟真实 withRateLimit 契约）=====
// 注意：pay.js / orders.js 分别 import 各自的 per-service 副本
//   paymentService/common/risk-rate-limit 与 orderService/common/risk-rate-limit
// 这里用同一个 mockRateLimitShared 同时拦截两条路径，内部用内存滑动窗口模拟限流，
// 超限时抛出 BusinessError(code='RATE_LIMITED')，与真实实现保持一致的错误处理语义。
// （不直接委托真实模块：per-service 副本在 jest 下会因 rate-limit-config 解析失败抛 SERVER:5001）
class MockRateLimitBusinessError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'BusinessError'
    this.code = code
  }
}

const _mockRateLimitStore = { global: new Map(), target: new Map() }
// 每用户对同一目标每分钟允许的调用次数（按业务类型，对齐测试期望）
const _mockRateLimitTargetLimits = {
  payment: 5,
  refund: 2,
  order: 10,
  evaluation: 10,
  mall_order: 8,
  activity_apply: 5,
  boarding_accept: 5,
  feeding_order: 5,
}
// 全局（每用户每分钟）上限设高，避免干扰 target 级限流的判定
const _mockRateLimitGlobalLimits = {
  payment: 100,
  refund: 100,
  order: 100,
  evaluation: 100,
  mall_order: 100,
  activity_apply: 100,
  boarding_accept: 100,
  feeding_order: 100,
}
const _mockRateLimitWindowMs = 60 * 1000

function _mockRateLimitCheck(input) {
  const now = input.now ?? Date.now()
  const cutoff = now - _mockRateLimitWindowMs
  const type = input.type
  const gLimit = _mockRateLimitGlobalLimits[type] ?? 100
  const tLimit = _mockRateLimitTargetLimits[type] ?? 10
  const gKey = `${input.userId}|${type}`
  const gArr = (_mockRateLimitStore.global.get(gKey) || []).filter(t => t > cutoff)
  if (gArr.length >= gLimit) {
    throw new MockRateLimitBusinessError('RATE_LIMITED', `RATE_LIMIT_GLOBAL:${input.userId}`)
  }
  if (input.targetId) {
    const tKey = `${input.userId}|${type}|${input.targetId}`
    const tArr = (_mockRateLimitStore.target.get(tKey) || []).filter(t => t > cutoff)
    if (tArr.length >= tLimit) {
      throw new MockRateLimitBusinessError('RATE_LIMITED', `RATE_LIMIT_TARGET:${input.targetId}`)
    }
  }
}

function _mockRateLimitConsume(input) {
  const now = input.now ?? Date.now()
  const cutoff = now - _mockRateLimitWindowMs
  const type = input.type
  const gKey = `${input.userId}|${type}`
  const gArr = (_mockRateLimitStore.global.get(gKey) || []).filter(t => t > cutoff)
  gArr.push(now)
  _mockRateLimitStore.global.set(gKey, gArr)
  if (input.targetId) {
    const tKey = `${input.userId}|${type}|${input.targetId}`
    const tArr = (_mockRateLimitStore.target.get(tKey) || []).filter(t => t > cutoff)
    tArr.push(now)
    _mockRateLimitStore.target.set(tKey, tArr)
  }
}

const mockRateLimitShared = {
  withRateLimit: jest.fn(async (input, fn) => {
    _mockRateLimitCheck(input)
    _mockRateLimitConsume(input)
    return await fn()
  }),
  consumeRateLimit: jest.fn((input) => {
    _mockRateLimitCheck(input)
    _mockRateLimitConsume(input)
  }),
  peekRateLimit: jest.fn(() => ({ allowed: true, remaining: 999, resetAt: Date.now() })),
  _resetStore: jest.fn(() => {
    _mockRateLimitStore.global.clear()
    _mockRateLimitStore.target.clear()
  }),
  DEFAULT_RISK_RATE_LIMIT_CONFIG: {
    perUserPerMinute: 10,
    perUserPerTargetPerMinute: 5,
    windowMs: _mockRateLimitWindowMs,
  },
}

jest.mock('../cloudfunctions/paymentService/common/risk-rate-limit', () => mockRateLimitShared)
jest.mock('../cloudfunctions/orderService/common/risk-rate-limit', () => mockRateLimitShared)

// ===== Mock wx-server-sdk =====
const mockDb = {
  _collections: {},
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
          if (doc) {Object.assign(doc, data)}
        },
      }),
      where: query => {
        const docs = self._collections[name].docs.filter(doc => {
          for (const [k, v] of Object.entries(query || {})) {
            if (v && typeof v === 'object' && v._op) {
              if (v._op === 'in' && Array.isArray(v.v)) {
                if (!v.v.includes(doc[k])) {return false}
              }
              continue
            }
            if (doc[k] !== v) {return false}
          }
          return true
        })
        const applyUpdate = async ({ data }) => {
          let updated = 0
          for (const doc of docs) { Object.assign(doc, data); updated++ }
          return { stats: { updated } }
        }
        return {
          field: () => ({
            limit: () => ({ get: async () => ({ data: docs }), update: applyUpdate, count: async () => ({ total: docs.length }) }),
            get: async () => ({ data: docs }),
            update: applyUpdate,
            count: async () => ({ total: docs.length }),
          }),
          limit: () => ({ get: async () => ({ data: docs }), update: applyUpdate, count: async () => ({ total: docs.length }) }),
          get: async () => ({ data: docs }),
          update: applyUpdate,
          count: async () => ({ total: docs.length }),
        }
      },
      add: async ({ data }) => {
        const newDoc = { ...data }
        self._collections[name].docs.push(newDoc)
        return { _id: newDoc._id }
      },
    }
  },
  command: { in: arr => ({ _op: 'in', v: arr }) },
  serverDate: () => 'MOCK_DATE',
}

jest.mock('wx-server-sdk', () => ({
  init: jest.fn(),
  getWXContext: () => ({ OPENID: 'oTest_openid' }),
  DYNAMIC_CURRENT_ENV: 'mock-env',
  database: () => mockDb,
}))

// ===== 加载被测模块 =====
const pay = require('../cloudfunctions/paymentService/services/pay')
const orders = require('../cloudfunctions/orderService/orders')

const mockRateLimit = require('../cloudfunctions/paymentService/common/risk-rate-limit')
const mockWithRateLimit = mockRateLimit.withRateLimit

beforeEach(() => {
  mockDb._reset()
  jest.clearAllMocks()
  mockRateLimit._resetStore()
})

describe('Sprint 18: createPayment 接入风控限流', () => {
  test('createPayment 应调用 withRateLimit，参数含 userId/type/payment/targetId=orderId', async () => {
    mockDb._collections.orders = { docs: [{ _id: 'o1', totalPrice: 100, paymentStatus: 'unpaid' }] }

    await pay.createPayment(
      { type: 'order', orderId: 'o1', amount: 10000 },
      {},
      { openid: 'oTest' }
    )
    expect(mockWithRateLimit).toHaveBeenCalled()
    const call = mockWithRateLimit.mock.calls.find(c => c[0].type === 'payment')
    expect(call).toBeDefined()
    expect(call[0].userId).toBe('oTest')
    expect(call[0].type).toBe('payment')
    expect(call[0].targetId).toBe('o1')
  })

  test('同一用户对同一 orderId 第 6 次创建支付应被 RATE_LIMITED', async () => {
    mockDb._collections.orders = { docs: [{ _id: 'o1', totalPrice: 100, paymentStatus: 'unpaid' }] }
    mockWechatPayUtils.httpsRequest.mockClear()
    mockWechatPayUtils.httpsRequest.mockResolvedValue({ prepay_id: 'PREPAY_X' })

    // 默认 perUserPerTargetPerMinute=5
    for (let i = 0; i < 5; i++) {
      const r = await pay.createPayment(
        { type: 'order', orderId: 'o1', amount: 10000 },
        {},
        { openid: 'oTest' }
      )
      // Sprint 25 + H7: createPayment 经 handleSuccess 包装为 { code, message, data }
      expect(r.code).toBe(0)
      expect(r.data.outTradeNo).toMatch(/^ORDER_/)
    }
    // 第 6 次应被限流
    const blocked = await pay.createPayment(
      { type: 'order', orderId: 'o1', amount: 10000 },
      {},
      { openid: 'oTest' }
    )
    expect(blocked.code).not.toBe(0)
    expect(blocked.error?.type).toBe('RATE_LIMITED')
  })

  test('不同用户对同一 orderId 不应互相影响', async () => {
    // 用户 oU1 触发限流
    mockDb._collections.orders = { docs: [{ _id: 'o1', totalPrice: 100, paymentStatus: 'unpaid' }] }
    mockWechatPayUtils.httpsRequest.mockResolvedValue({ prepay_id: 'PREPAY_X' })

    // oU1 用完 5 次
    for (let i = 0; i < 5; i++) {
      await pay.createPayment(
        { type: 'order', orderId: 'o1', amount: 10000 },
        {},
        { openid: 'oU1' }
      )
    }

    // 切换到 oU2（独立计数器）应能继续
    const r2 = await pay.createPayment(
      { type: 'order', orderId: 'o1', amount: 10000 },
      {},
      { openid: 'oU2' }
    )
    // Sprint 25 + H7: createPayment 经 handleSuccess 包装为 { code, message, data }
    expect(r2.code).toBe(0)
    expect(r2.data.outTradeNo).toMatch(/^ORDER_/)
  })
})

describe('Sprint 18: createOrder 接入风控限流', () => {
  // 注意：createOrder 较复杂，这里只验证限流被调用
  test('createOrder 在 db.add 阶段应调用 withRateLimit，type=order, targetId=hostId', async () => {
    // 预置数据
    mockDb._collections.users = { docs: [{ _id: 'oTest', nickName: '测试' }] }
    mockDb._collections.hostProfiles = { docs: [{ _id: 'h1', openid: 'hOpenid', hostName: '阳光之家', pricePerDay: 100 }] }
    mockDb._collections.pets = { docs: [{ _id: 'p1', name: '小白', ownerId: 'oTest' }] }
    mockDb._collections.orders = { docs: [] }

    await orders.createOrder(
      {
        hostId: 'h1',
        petIds: ['p1'],
        startDate: '2026-06-10',
        endDate: '2026-06-12',
      },
      {},
      { openid: 'oTest' }
    )

    // 找到 type=order 的 withRateLimit 调用
    const orderCalls = mockWithRateLimit.mock.calls.filter(c => c[0].type === 'order')
    expect(orderCalls.length).toBeGreaterThanOrEqual(1)
    const call = orderCalls[0]
    expect(call[0].userId).toBe('oTest')
    expect(call[0].targetId).toBe('h1')
  })
})
