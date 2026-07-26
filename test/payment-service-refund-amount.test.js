/**
 * paymentService/refund 聚焦单测（F9 测试工程化）
 *
 * 覆盖退款金额正确性 + 安全校验 + 幂等语义：
 *   1. 退款请求体金额精确等于入参（分；Math.round 取整）
 *   2. 非整数金额应被取整
 *   3. 退款金额 > 支付总额应被拒（INVALID_PARAMS）
 *   4. 非正数 / 非数字退款金额应被拒
 *   5. 退款成功后订单状态更新为 refunded，refundAmount = 金额/100（元）
 *   6. 重复调用对同一 outTradeNo 各生成唯一 out_refund_no（功能层无去重，幂等由调用方 orders.js 保证）
 *
 * Mock 方式：沿用 payment-service-refund-risk.test.js（wechatPayUtils / config / risk-control /
 * risk-rate-limit / wx-server-sdk 事务内存 db）。仅覆盖本场景所需的最小语义，不改动业务代码。
 */

// ===== Mock wechatPayUtils（每次调用返回唯一 randomString，便于校验幂等语义）=====
const mockWechatPayUtils = {
  randomString: jest.fn(() => 'RND' + Math.random().toString(36).slice(2, 10).toUpperCase()),
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
  if (action === 'reject') { return 'RISK_REJECT' }
  if (action === 'review') { return 'RISK_PENDING' }
  return 'RISK_PASS'
})

jest.mock('../cloudfunctions/common/risk-control', () => ({
  detectRefundAbuse: (...args) => mockDetectRefundAbuse(...args),
  mapActionToErrorCode: (...args) => mockMapActionToErrorCode(...args),
}))

// ===== Mock risk-rate-limit（spy 真实模块，统计调用）=====
jest.mock('../cloudfunctions/common/risk-rate-limit', () => {
  const real = jest.requireActual('../cloudfunctions/common/risk-rate-limit')
  return {
    withRateLimit: jest.fn(async (input, fn) => real.withRateLimit(input, fn)),
    consumeRateLimit: jest.fn(input => real.consumeRateLimit(input)),
    peekRateLimit: jest.fn(input => real.peekRateLimit(input)),
    _resetStore: jest.fn(() => real._resetStore()),
    DEFAULT_RISK_RATE_LIMIT_CONFIG: real.DEFAULT_RISK_RATE_LIMIT_CONFIG,
  }
})

// ===== Mock wx-server-sdk（含事务支持）=====
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
          if (doc) { Object.assign(doc, data) }
        },
      }),
      where: query => {
        const docs = self._collections[name].docs.filter(doc => {
          for (const [k, v] of Object.entries(query || {})) {
            if (doc[k] !== v) { return false }
          }
          return true
        })
        return {
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
  startTransaction: async () => {
    const txCollection = name => mockDb.collection(name)
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

const refund = require('../cloudfunctions/paymentService/services/refund')
const mockRateLimit = require('../cloudfunctions/common/risk-rate-limit')

function putOrder(doc) {
  mockDb._collections.orders = { docs: [doc] }
}
function allowRisk() {
  mockDetectRefundAbuse.mockResolvedValue({ action: 'allow', level: 'none', reasons: [] })
}

beforeEach(() => {
  mockDb._reset()
  jest.clearAllMocks()
  mockRateLimit._resetStore()
})

describe('paymentService/refund 金额正确 + 安全校验', () => {
  test('退款请求体金额应精确等于入参（分，取整）', async () => {
    putOrder({ _id: 'ord_1', outTradeNo: 'T1', ownerId: 'oTest_openid', totalPrice: 5000, status: 'completed' })
    allowRisk()
    await refund.createRefund({ outTradeNo: 'T1', refundAmount: 1234, totalAmount: 5000 }, {}, { openid: 'oTest_openid' })
    expect(mockWechatPayUtils.httpsRequest).toHaveBeenCalledTimes(1)
    const reqBody = mockWechatPayUtils.httpsRequest.mock.calls[0][1]
    expect(reqBody.amount.refund).toBe(1234)
    expect(reqBody.amount.total).toBe(5000)
    expect(reqBody.amount.currency).toBe('CNY')
  })

  test('非整数退款金额应被取整（Math.round）', async () => {
    putOrder({ _id: 'ord_1', outTradeNo: 'T1', ownerId: 'oTest_openid', totalPrice: 5000, status: 'completed' })
    allowRisk()
    await refund.createRefund({ outTradeNo: 'T1', refundAmount: 999.5, totalAmount: 5000 }, {}, { openid: 'oTest_openid' })
    const reqBody = mockWechatPayUtils.httpsRequest.mock.calls[0][1]
    expect(reqBody.amount.refund).toBe(1000)
  })

  test('退款金额超过支付总额应拒（INVALID_PARAMS，不调微信）', async () => {
    putOrder({ _id: 'ord_1', outTradeNo: 'T1', ownerId: 'oTest_openid', totalPrice: 5000, status: 'completed' })
    allowRisk()
    const r = await refund.createRefund({ outTradeNo: 'T1', refundAmount: 6000, totalAmount: 5000 }, {}, { openid: 'oTest_openid' })
    expect(r.code).not.toBe(0)
    expect(r.error?.type).toBe('INVALID_PARAMS')
    expect(mockWechatPayUtils.httpsRequest).not.toHaveBeenCalled()
  })

  test('非正数 / 非数字退款金额应拒', async () => {
    const r1 = await refund.createRefund({ outTradeNo: 'T1', refundAmount: -1, totalAmount: 5000 }, {}, { openid: 'oTest_openid' })
    expect(r1.error?.type).toBe('INVALID_PARAMS')
    const r2 = await refund.createRefund({ outTradeNo: 'T1', refundAmount: 'abc', totalAmount: 5000 }, {}, { openid: 'oTest_openid' })
    expect(r2.error?.type).toBe('INVALID_PARAMS')
  })

  test('退款成功后订单状态应更新为 refunded，refundAmount = 金额/100（元）', async () => {
    putOrder({ _id: 'ord_1', outTradeNo: 'T1', ownerId: 'oTest_openid', totalPrice: 5000, status: 'completed' })
    allowRisk()
    await refund.createRefund({ outTradeNo: 'T1', refundAmount: 1234, totalAmount: 5000 }, {}, { openid: 'oTest_openid' })
    const updated = mockDb._collections.orders.docs[0]
    expect(updated.status).toBe('refunded')
    expect(updated.refundAmount).toBe(12.34)
  })

  test('重复调用同一 outTradeNo 生成唯一 out_refund_no（幂等由调用方保证）', async () => {
    putOrder({ _id: 'ord_1', outTradeNo: 'T1', ownerId: 'oTest_openid', totalPrice: 5000, status: 'completed' })
    allowRisk()
    const r1 = await refund.createRefund({ outTradeNo: 'T1', refundAmount: 100, totalAmount: 5000 }, {}, { openid: 'oTest_openid' })
    const r2 = await refund.createRefund({ outTradeNo: 'T1', refundAmount: 100, totalAmount: 5000 }, {}, { openid: 'oTest_openid' })
    expect(r1.outRefundNo).toBeDefined()
    expect(r2.outRefundNo).toBeDefined()
    expect(r1.outRefundNo).not.toBe(r2.outRefundNo)
    // 功能层不内置去重，每次都真实发起微信退款；幂等须由 orders.js 调用方保证
    expect(mockWechatPayUtils.httpsRequest).toHaveBeenCalledTimes(2)
  })
})
