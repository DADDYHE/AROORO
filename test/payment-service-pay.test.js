/**
 * cloudfunctions/paymentService/services/pay.js 单元测试
 * 重点覆盖：参数校验、订单类型解析、状态机集成
 * 跳过：实际微信支付API调用（需通过 mock wechatPayUtils 处理）
 */

// ===== Mock wechatPayUtils =====
const mockWechatPayUtils = {
  randomString: jest.fn(len => 'RAND'.repeat(Math.ceil((len || 6) / 4)).substring(0, len || 6)),
  rsaSign: jest.fn(() => 'MOCK_SIGN'),
  httpsRequest: jest.fn(),
  generateAuthorization: jest.fn(() => 'MOCK_AUTH'),
}

jest.mock('../cloudfunctions/paymentService/services/wechatPayUtils', () => mockWechatPayUtils)

// ===== Mock payment-state-machine =====
// 注意：必须把 paymentStateMachine / resolveOrderStatus / isKnownOrderType 都作为命名导出
const mockPaymentStateMachine = {
  canTransition: jest.fn(() => true),
  assertTransition: jest.fn(),
  STATES: ['unpaid', 'paying', 'paid', 'refunded', 'closed'],
}
const mockResolveOrderStatus = jest.fn((orderType, fallback = 'paid') => 'paid')
const mockIsKnownOrderType = jest.fn(() => true)

jest.mock('../cloudfunctions/paymentService/common/payment-state-machine', () => ({
  __esModule: true,
  paymentStateMachine: mockPaymentStateMachine,
  resolveOrderStatus: mockResolveOrderStatus,
  isKnownOrderType: mockIsKnownOrderType,
}))

// ===== Mock config（提供 WECHAT_PAY + ENDPOINTS 桩）=====
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
          if (doc) {Object.assign(doc, data)}
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
          limit: n => ({ get: async () => ({ data: docs }), update: async ({ data }) => docs.forEach(d => Object.assign(d, data)) }),
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
  getWXContext: () => ({ OPENID: 'oTest_openid' }),
  DYNAMIC_CURRENT_ENV: 'mock-env',
  database: () => mockDb,
}))

// 加载被测模块
const pay = require('../cloudfunctions/paymentService/services/pay')

beforeEach(() => {
  mockDb._reset()
  jest.clearAllMocks()
})

describe('paymentService/pay', () => {
  describe('createPayment - 参数校验', () => {
    test('缺少 type / orderId / amount 应抛 INVALID_PARAMS', async () => {
      // createPayment 在 withErrorHandling 装饰后，throw err 会被转成 code 1001 返回
      const result = await pay.createPayment({ type: '', orderId: '', amount: 0 }, {}, { openid: 'oTest' })
      expect(result.code).not.toBe(0)
      expect(result.error?.type).toBe('INVALID_PARAMS')
    })

    test('amount <= 0 应抛 INVALID_PARAMS', async () => {
      const r1 = await pay.createPayment({ type: 'order', orderId: 'o1', amount: 0 }, {}, { openid: 'oTest' })
      expect(r1.code).not.toBe(0)
      const r2 = await pay.createPayment({ type: 'order', orderId: 'o1', amount: -1 }, {}, { openid: 'oTest' })
      expect(r2.code).not.toBe(0)
    })

    test('未登录应抛 AUTH_REQUIRED', async () => {
      const result = await pay.createPayment({ type: 'order', orderId: 'o1', amount: 100 }, {}, {})
      expect(result.code).not.toBe(0)
      expect(result.error?.type).toBe('AUTH_REQUIRED')
    })

    test('不支持的 type 应抛 INVALID_PARAMS', async () => {
      const result = await pay.createPayment({ type: 'unknown', orderId: 'o1', amount: 100 }, {}, { openid: 'oTest' })
      expect(result.code).not.toBe(0)
    })

    test('订单不存在应抛 ORDER_NOT_FOUND', async () => {
      mockDb._collections.orders = { docs: [] }
      // 该抛点在 try 块内，函数统一 catch 后返回 handleError
      const result = await pay.createPayment({ type: 'order', orderId: 'o404', amount: 10000 }, {}, { openid: 'oTest' })
      expect(result.code).not.toBe(0)
    })

    test('订单已支付应抛 ORDER_ALREADY_PAID', async () => {
      mockDb._collections.orders = { docs: [{ _id: 'o1', totalPrice: 100, paymentStatus: 'paid' }] }
      // 该抛点在 try 块内，函数统一 catch 后返回 handleError
      const result = await pay.createPayment({ type: 'order', orderId: 'o1', amount: 10000 }, {}, { openid: 'oTest' })
      expect(result.code).not.toBe(0)
    })

    test('金额不符应抛 PAYMENT_AMOUNT_MISMATCH', async () => {
      mockDb._collections.orders = { docs: [{ _id: 'o1', totalPrice: 100, paymentStatus: 'unpaid' }] }
      // amount 单位是分；totalPrice=100元，应为 10000 分
      const result = await pay.createPayment({ type: 'order', orderId: 'o1', amount: 9999 }, {}, { openid: 'oTest' })
      expect(result.code).not.toBe(0)
    })
  })

  describe('createPayment - 正常流程', () => {
    test('成功创建支付单应返回 prepay 参数', async () => {
      mockDb._collections.orders = { docs: [{ _id: 'o1', totalPrice: 100, paymentStatus: 'unpaid' }] }
      mockWechatPayUtils.httpsRequest.mockResolvedValueOnce({ prepay_id: 'PREPAY_X' })

      const result = await pay.createPayment(
        { type: 'order', orderId: 'o1', amount: 10000 },
        {},
        { openid: 'oTest' }
      )
      // Sprint 25: WrappedHandler 成功路径直接返回 CreatePaymentResult 原始数据
      expect(result).toMatchObject({
        orderId: 'o1',
        paymentParams: {
          package: 'prepay_id=PREPAY_X',
          signType: 'RSA',
          paySign: 'MOCK_SIGN',
        },
      })
      expect(result.outTradeNo.startsWith('ORDER_')).toBe(true)
      // 订单状态应更新为 paying
      const updated = mockDb._collections.orders.docs[0]
      expect(updated.paymentStatus).toBe('paying')
      expect(updated.outTradeNo.startsWith('ORDER_')).toBe(true)
    })

    test('未获取到 prepay_id 应抛 WECHAT_API_ERROR', async () => {
      mockDb._collections.orders = { docs: [{ _id: 'o1', totalPrice: 100, paymentStatus: 'unpaid' }] }
      mockWechatPayUtils.httpsRequest.mockResolvedValueOnce({})
      const result = await pay.createPayment(
        { type: 'order', orderId: 'o1', amount: 10000 },
        {},
        { openid: 'oTest' }
      )
      expect(result.code).not.toBe(0)
    })

    test('微信支付 API 抛错应返回 handleError（不抛）', async () => {
      mockDb._collections.orders = { docs: [{ _id: 'o1', totalPrice: 100, paymentStatus: 'unpaid' }] }
      mockWechatPayUtils.httpsRequest.mockRejectedValueOnce(new Error('network error'))
      const result = await pay.createPayment(
        { type: 'order', orderId: 'o1', amount: 10000 },
        {},
        { openid: 'oTest' }
      )
      expect(result.code).not.toBe(0) // 错误码非成功
    })
  })

  describe('getOrderType (内部函数通过 outTradeNo 推断)', () => {
    // 通过 confirmPayment 的参数路径间接测试
    test('未知前缀应抛 INVALID_PARAMS', async () => {
      // confirmPayment 在 trade_state 成功但 outTradeNo 前缀未知时抛错（try 块内 → handleError 返回）
      mockWechatPayUtils.httpsRequest.mockResolvedValueOnce({
        trade_state: 'SUCCESS',
        transaction_id: 'TX_X',
      })
      mockDb._collections.orders = { docs: [] }
      const result = await pay.confirmPayment({ outTradeNo: 'UNKNOWN_123' }, {}, { openid: 'oTest' })
      expect(result.code).not.toBe(0)
    })
  })

  describe('confirmPayment', () => {
    test('未支付完成返回 paid=false', async () => {
      mockWechatPayUtils.httpsRequest.mockResolvedValueOnce({
        trade_state: 'NOTPAY',
      })
      const result = await pay.confirmPayment({ outTradeNo: 'ORDER_123' }, {}, { openid: 'oTest' })
      // Sprint 25: 成功路径直接返回 ConfirmPaymentResult 原始数据
      expect(result.paid).toBe(false)
    })

    test('合法转移 unpaid → paid 成功', async () => {
      mockDb._collections.orders = { docs: [{ _id: 'o1', outTradeNo: 'ORDER_X', paymentStatus: 'unpaid', totalPrice: 100 }] }
      mockWechatPayUtils.httpsRequest.mockResolvedValueOnce({
        trade_state: 'SUCCESS',
        transaction_id: 'TX_001',
      })
      const result = await pay.confirmPayment({ outTradeNo: 'ORDER_X' }, {}, { openid: 'oTest' })
      // Sprint 25: 成功路径直接返回 ConfirmPaymentResult 原始数据
      expect(result.paid).toBe(true)
      const updated = mockDb._collections.orders.docs[0]
      expect(updated.paymentStatus).toBe('paid')
      expect(updated.transactionId).toBe('TX_001')
    })

    test('已 paid 重复确认返回 alreadyConfirmed=true', async () => {
      mockDb._collections.orders = { docs: [{ _id: 'o1', outTradeNo: 'ORDER_X', paymentStatus: 'paid' }] }
      mockWechatPayUtils.httpsRequest.mockResolvedValueOnce({
        trade_state: 'SUCCESS',
        transaction_id: 'TX_001',
      })
      const result = await pay.confirmPayment({ outTradeNo: 'ORDER_X' }, {}, { openid: 'oTest' })
      // Sprint 25: 成功路径直接返回 ConfirmPaymentResult 原始数据
      expect(result.alreadyConfirmed).toBe(true)
    })

    test('状态机拒绝非法转移抛 STATE_INVALID', async () => {
      mockDb._collections.orders = { docs: [{ _id: 'o1', outTradeNo: 'ORDER_X', paymentStatus: 'refunded' }] }
      mockWechatPayUtils.httpsRequest.mockResolvedValueOnce({
        trade_state: 'SUCCESS',
        transaction_id: 'TX_001',
      })
      mockPaymentStateMachine.canTransition.mockReturnValueOnce(false)
      const result = await pay.confirmPayment({ outTradeNo: 'ORDER_X' }, {}, { openid: 'oTest' })
      expect(result.code).not.toBe(0)
    })
  })

  describe('closePayment', () => {
    test('缺少 outTradeNo 抛 INVALID_PARAMS', async () => {
      const result = await pay.closePayment({}, {}, { openid: 'oTest' })
      expect(result.code).not.toBe(0)
    })

    test('正常关单返回成功', async () => {
      mockWechatPayUtils.httpsRequest.mockResolvedValueOnce({})
      const result = await pay.closePayment({ outTradeNo: 'ORDER_X' }, {}, { openid: 'oTest' })
      // Sprint 25: 成功路径返回 null（无 data 包装）
      expect(result).toBeNull()
    })
  })

  describe('queryPayment', () => {
    test('缺少 outTradeNo / transactionId 抛 INVALID_PARAMS', async () => {
      const result = await pay.queryPayment({}, {}, { openid: 'oTest' })
      expect(result.code).not.toBe(0)
    })

    test('按 outTradeNo 查询成功', async () => {
      mockWechatPayUtils.httpsRequest.mockResolvedValueOnce({ trade_state: 'SUCCESS' })
      const result = await pay.queryPayment({ outTradeNo: 'ORDER_X' }, {}, { openid: 'oTest' })
      // Sprint 25: 成功路径直接返回 WechatPayQueryResult 原始数据
      expect(result.trade_state).toBe('SUCCESS')
    })

    test('按 transactionId 查询时路径正确', async () => {
      mockWechatPayUtils.httpsRequest.mockResolvedValueOnce({ trade_state: 'SUCCESS' })
      await pay.queryPayment({ transactionId: 'TX_X' }, {}, { openid: 'oTest' })
      expect(mockWechatPayUtils.httpsRequest).toHaveBeenCalledWith(
        expect.stringContaining('/v3/pay/transactions/id/TX_X'),
        null,
        expect.any(String),
        'GET'
      )
    })
  })
})
