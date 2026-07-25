/**
 * Sprint 17 + Sprint 24: paymentService/refund 风险控制 + 限流集成测试
 *
 * 验证：
 *   1. 正常退款（allow）→ pendingReview=false
 *   2. 中等风险（review）→ pendingReview=true
 *   3. 高风险（reject）→ 抛出 RISK_REJECT
 *   4. 限流（同一用户对同一 outTradeNo 短时间内多次）→ 抛出 RATE_LIMITED
 *   5. 风控模块自身异常不应阻塞主流程（降级为放行）
 *   6. 业务校验（参数不全、退款金额异常）仍优先于风控
 *
 * Sprint 24 迁移说明：
 *   - refund 改为 withErrorHandling 包装
 *   - 成功路径直接返回 raw data（不再有 {code, data, error} 包装）
 *   - 错误路径返回 ApiResponse<null>（带 code + error）
 */

// ===== Mock wechatPayUtils =====
const mockWechatPayUtils = {
  randomString: jest.fn(() => 'RANDOM123'),
  httpsRequest: jest.fn(async () => ({ status: 'SUCCESS', refund_id: 'rf_123' })),
  generateAuthorization: jest.fn(() => 'MOCK_AUTH'),
}

jest.mock('../cloudfunctions/paymentService/services/wechatPayUtils', () => mockWechatPayUtils)

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

// ===== Mock risk-control =====
const mockDetectRefundAbuse = jest.fn()
const mockMapActionToErrorCode = jest.fn(action => {
  if (action === 'reject') {return 'RISK_REJECT'}
  if (action === 'review') {return 'RISK_PENDING'}
  return 'RISK_PASS'
})

jest.mock('../cloudfunctions/common/risk-control', () => ({
  detectRefundAbuse: (...args) => mockDetectRefundAbuse(...args),
  mapActionToErrorCode: (...args) => mockMapActionToErrorCode(...args),
}))

// ===== Mock risk-rate-limit（spy 真实模块，统计调用）=====
jest.mock('../cloudfunctions/common/risk-rate-limit', () => {
  // 这里不能引用外部变量，必须用 require
  const real = jest.requireActual('../cloudfunctions/common/risk-rate-limit')
  return {
    withRateLimit: jest.fn(async (input, fn) => real.withRateLimit(input, fn)),
    consumeRateLimit: jest.fn(input => real.consumeRateLimit(input)),
    peekRateLimit: jest.fn(input => real.peekRateLimit(input)),
    _resetStore: jest.fn(() => real._resetStore()),
    DEFAULT_RISK_RATE_LIMIT_CONFIG: real.DEFAULT_RISK_RATE_LIMIT_CONFIG,
  }
})

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
            if (doc[k] !== v) {return false}
          }
          return true
        })
        return {
          // H4: 添加 field 支持（refund.ts 事务前查询 _id 列表用）
          field: _projection => ({
            limit: _n => ({ get: async () => ({ data: docs }) }),
            get: async () => ({ data: docs }),
          }),
          limit: n => ({ get: async () => ({ data: docs }) }),
          get: async () => ({ data: docs }),
        }
      },
    }
  },
  // P4-1-1: 支持事务——refund.ts 退款时使用 db.startTransaction() 原子更新订单/业务表/佣金
  startTransaction: async () => {
    const txCollection = (name) => mockDb.collection(name)
    return {
      collection: txCollection,
      commit: async () => ({}),
      rollback: async () => ({}),
    }
  },
  command: { inc: n => ({ _inc: n }) },
  serverDate: () => 'MOCK_DATE',
}

jest.mock('wx-server-sdk', () => ({
  init: jest.fn(),
  getWXContext: () => ({ OPENID: 'oTest_openid' }),
  DYNAMIC_CURRENT_ENV: 'mock-env',
  database: () => mockDb,
}))

// 加载被测模块
const refund = require('../cloudfunctions/paymentService/services/refund')

// mock 的 _resetStore 会调用真实的 _resetStore
const mockRateLimit = require('../cloudfunctions/common/risk-rate-limit')
const mockWithRateLimit = mockRateLimit.withRateLimit

beforeEach(() => {
  mockDb._reset()
  jest.clearAllMocks()
  mockRateLimit._resetStore() // 重置真实限流 store，确保测试隔离
})

describe('Sprint 17: paymentService/refund 风险控制 + 限流集成', () => {
  describe('业务校验优先于风控', () => {
    test('缺少参数应抛 INVALID_PARAMS', async () => {
      const result = await refund.createRefund({}, {}, { openid: 'oTest' })
      // Sprint 24: 错误路径返回 ApiResponse<null>
      expect(result.code).not.toBe(0)
      expect(result.data).toBeNull()
      expect(result.error?.type).toBe('INVALID_PARAMS')
      expect(mockDetectRefundAbuse).not.toHaveBeenCalled()
    })

    test('未登录时应抛 PERMISSION_DENIED（缺 openid 视为非订单所有者）', async () => {
      mockDb._collections.orders = {
        docs: [{ _id: 'ord_1', outTradeNo: 'T1', ownerId: 'oTest', totalPrice: 10000, status: 'completed' }],
      }
      const result = await refund.createRefund(
        { outTradeNo: 'T1', refundAmount: 100, totalAmount: 100 },
        {},
        {}
      )
      expect(result.code).not.toBe(0)
      expect(result.data).toBeNull()
      expect(mockDetectRefundAbuse).not.toHaveBeenCalled()
    })
  })

  describe('风控决策映射', () => {
    test('allow → pendingReview=false，riskDecision=RISK_PASS', async () => {
      mockDb._collections.orders = {
        docs: [{ _id: 'ord_1', outTradeNo: 'T1', ownerId: 'oTest_openid', totalPrice: 10000, status: 'completed' }],
      }
      mockDetectRefundAbuse.mockResolvedValueOnce({
        action: 'allow', level: 'none', reasons: [],
      })

      const result = await refund.createRefund(
        { outTradeNo: 'T1', refundAmount: 100, totalAmount: 100, reason: '不想要了' },
        {},
        { openid: 'oTest_openid' }
      )
      // Sprint 24: 成功路径直接返回 raw data
      expect(result).toMatchObject({
        pendingReview: false,
        riskDecision: 'RISK_PASS',
      })
      expect(result.outRefundNo).toBeDefined()
    })

    test('review → pendingReview=true，riskDecision=RISK_PENDING', async () => {
      mockDb._collections.orders = {
        docs: [{ _id: 'ord_1', outTradeNo: 'T1', ownerId: 'oTest_openid', totalPrice: 10000, status: 'completed' }],
      }
      mockDetectRefundAbuse.mockResolvedValueOnce({
        action: 'review', level: 'medium', reasons: ['退款频率偏高'],
      })

      const result = await refund.createRefund(
        { outTradeNo: 'T1', refundAmount: 100, totalAmount: 100 },
        {},
        { openid: 'oTest_openid' }
      )
      // Sprint 24: 成功路径直接返回 raw data
      expect(result).toMatchObject({
        pendingReview: true,
        riskDecision: 'RISK_PENDING',
      })
      expect(result.riskReasons).toContain('退款频率偏高')
    })

    test('reject → 抛 RISK_REJECT', async () => {
      mockDb._collections.orders = {
        docs: [{ _id: 'ord_1', outTradeNo: 'T1', ownerId: 'oTest_openid', totalPrice: 10000, status: 'completed' }],
      }
      mockDetectRefundAbuse.mockResolvedValueOnce({
        action: 'reject', level: 'high', reasons: ['疑似套现'],
      })

      const result = await refund.createRefund(
        { outTradeNo: 'T1', refundAmount: 100, totalAmount: 100 },
        {},
        { openid: 'oTest_openid' }
      )
      // Sprint 24: 错误路径返回 ApiResponse<null>
      expect(result.code).not.toBe(0)
      expect(result.data).toBeNull()
      expect(result.error?.type).toBe('RISK_REJECT')
    })
  })

  describe('风控模块自身异常降级', () => {
    test('detectRefundAbuse 抛错时不应阻塞主流程（降级为 RISK_PASS）', async () => {
      mockDb._collections.orders = {
        docs: [{ _id: 'ord_1', outTradeNo: 'T1', ownerId: 'oTest_openid', totalPrice: 10000, status: 'completed' }],
      }
      mockDetectRefundAbuse.mockRejectedValueOnce(new Error('db down'))

      const result = await refund.createRefund(
        { outTradeNo: 'T1', refundAmount: 100, totalAmount: 100 },
        {},
        { openid: 'oTest_openid' }
      )
      // Sprint 24: 异常降级时返回 raw data
      expect(result).toMatchObject({
        pendingReview: false,
        riskDecision: 'RISK_PASS',
      })
    })
  })

  describe('限流集成', () => {
    test('withRateLimit 应被调用且传入 userId/type/targetId', async () => {
      mockDb._collections.orders = {
        docs: [{ _id: 'ord_1', outTradeNo: 'T1', ownerId: 'oTest_openid', totalPrice: 10000, status: 'completed' }],
      }
      mockDetectRefundAbuse.mockResolvedValue({
        action: 'allow', level: 'none', reasons: [],
      })

      await refund.createRefund(
        { outTradeNo: 'T1', refundAmount: 100, totalAmount: 100 },
        {},
        { openid: 'oTest_openid' }
      )
      expect(mockWithRateLimit).toHaveBeenCalledTimes(1)
      const input = mockWithRateLimit.mock.calls[0][0]
      expect(input.userId).toBe('oTest_openid')
      expect(input.type).toBe('refund')
      expect(input.targetId).toBe('T1')
    })

    test('限流：同一用户对同一 outTradeNo 短时间内连续请求应被拦截', async () => {
      mockDb._collections.orders = {
        docs: [{ _id: 'ord_1', outTradeNo: 'T1', ownerId: 'oTest_openid', totalPrice: 10000, status: 'completed' }],
      }
      mockDetectRefundAbuse.mockResolvedValue({
        action: 'allow', level: 'none', reasons: [],
      })

      // BUSINESS_TYPE_DEFAULT_CONFIG.refund: perUserPerTargetPerMinute=2，先发 2 次
      for (let i = 0; i < 2; i++) {
        const r = await refund.createRefund(
          { outTradeNo: 'T1', refundAmount: 100, totalAmount: 100 },
          {},
          { openid: 'oTest_openid' }
        )
        // Sprint 24: 成功路径直接返回 raw data（含 outRefundNo）
        expect(r.outRefundNo).toBeDefined()
        expect(r.pendingReview).toBe(false)
      }

      // 第 3 次应被限流
      const blocked = await refund.createRefund(
        { outTradeNo: 'T1', refundAmount: 100, totalAmount: 100 },
        {},
        { openid: 'oTest_openid' }
      )
      // Sprint 24: 限流错误返回 ApiResponse<null>
      expect(blocked.code).not.toBe(0)
      expect(blocked.data).toBeNull()
      expect(blocked.error?.type).toBe('RATE_LIMITED')
    })

    test('限流：不同用户对同一 outTradeNo 不应互相影响', async () => {
      // 用户 oU1 和 oU2 各自有匹配自己 ownerId 的订单
      // 测试通过 mockDb 的 find 行为来模拟多用户场景
      mockDb._collections.orders = {
        docs: [
          { _id: 'ord_1', outTradeNo: 'T1', ownerId: 'oU1', totalPrice: 10000, status: 'completed' },
        ],
      }
      mockDetectRefundAbuse.mockResolvedValue({
        action: 'allow', level: 'none', reasons: [],
      })

      // 用户 oU1 用满 2 次（refund 类型 perUserPerTargetPerMinute=2）
      for (let i = 0; i < 2; i++) {
        const r = await refund.createRefund(
          { outTradeNo: 'T1', refundAmount: 100, totalAmount: 100 },
          {},
          { openid: 'oU1' }
        )
        // Sprint 24: 成功路径直接返回 raw data
        expect(r.outRefundNo).toBeDefined()
      }

      // 切换到 oU2，单独提供匹配 oU2 的订单
      mockDb._collections.orders = {
        docs: [
          { _id: 'ord_2', outTradeNo: 'T1', ownerId: 'oU2', totalPrice: 10000, status: 'completed' },
        ],
      }
      // oU2 第一次仍应通过（与 oU1 互不影响）
      const r2 = await refund.createRefund(
        { outTradeNo: 'T1', refundAmount: 100, totalAmount: 100 },
        {},
        { openid: 'oU2' }
      )
      // Sprint 24: 成功路径直接返回 raw data
      expect(r2.outRefundNo).toBeDefined()
    })
  })
})
