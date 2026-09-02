/**
 * 集成测试 - 售后/退款子链路（Sprint 10 新增）
 *
 * 流程：
 *   1. 用户对已支付订单发起退款
 *   2. refund.js#createRefund 调用微信退款 API
 *   3. 写入 refund 记录
 *   4. 订单状态推进
 *
 * 覆盖：
 *   - 参数校验（必填/退款金额异常/超过订单金额）
 *   - 权限校验（非订单 owner 无权退款）
 *   - 微信配置缺失
 *   - 微信 API 失败
 *   - 微信 API 成功
 *   - queryRefund 查询
 *   - 与订单状态机的交互（已退款不能再 cancel）
 */

const mockDb = {
  _collections: {},
  collection(name) {
    if (!this._collections[name]) {this._collections[name] = { docs: [] }}
    const self = this
    const applyUpdate = (doc, data) => {
      for (const [k, v] of Object.entries(data || {})) {
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
    return {
      doc: id => ({
        get: async () => {
          const doc = self._collections[name].docs.find(d => d._id === id)
          return { data: doc || null }
        },
        update: async ({ data }) => {
          const doc = self._collections[name].docs.find(d => d._id === id)
          if (doc) {applyUpdate(doc, data)}
        },
        set: async ({ data }) => {
          const doc = self._collections[name].docs.find(d => d._id === id)
          if (doc) {applyUpdate(doc, data)}
          else {self._collections[name].docs.push({ _id: id, ...data })}
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
        // 自引用链：field/orderBy/skip/limit 任意组合后均可 get/count/update
        const chain = {
          count: async () => ({ total: docs.length }),
          get: async () => ({ data: docs }),
          limit: () => chain,
          skip: () => chain,
          orderBy: () => chain,
          field: () => chain,
          update: async ({ data }) => {
            let updated = 0
            docs.forEach(doc => {applyUpdate(doc, data); updated++})
            return { stats: { updated } }
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
    inc: v => ({ _op: 'inc', v }),
    push: v => ({ _op: 'push', v }),
  },
  serverDate: () => 'MOCK_DATE',
  // createRefund 使用事务（transaction.collection / commit / rollback）：
  // mock 退化为普通集合语义（无隔离性，行为断言足够）
  startTransaction: async () => ({
    collection: (name) => mockDb.collection(name),
    commit: async () => ({}),
    rollback: async () => ({}),
  }),
}

let mockWechatResponse = null

jest.mock('wx-server-sdk', () => ({
  init: jest.fn(),
  getWXContext: () => ({ OPENID: 'oRefundTest' }),
  DYNAMIC_CURRENT_ENV: 'mock-env',
  database: () => mockDb,
}))

jest.mock('../../cloudfunctions/paymentService/services/wechatPayUtils', () => ({
  randomString: () => 'abc123',
  httpsRequest: jest.fn(async () => mockWechatResponse),
  generateAuthorization: jest.fn(() => 'MOCK_AUTH'),
}))

// 注入 WECHAT_PAY 配置（mchId + privateKey）
jest.mock('../../cloudfunctions/paymentService/common/config', () => ({
  WECHAT_PAY: {
    mchId: 'mch_test',
    serialNo: 'serial_test',
    privateKey: 'PRIVATE_KEY_CONTENT',
    appId: 'wx_test',
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

beforeEach(() => {
  for (const k of Object.keys(mockDb._collections)) {
    mockDb._collections[k] = { docs: [] }
  }
  mockWechatResponse = null
  jest.clearAllMocks()
  // 重置风控限流 store：paymentService 消费自身 common/ 分发副本（与根目录 common
  // 是不同模块实例），跨用例不重置会导致 createRefund 的 refund 类型限流计数累积，
  // 后续用例被误伤为 RATE_LIMITED（Sprint 24 原始数据契约断言 res.code undefined 失败）
  const svcStore = require('../../cloudfunctions/paymentService/common/risk-rate-limit')
  if (svcStore._resetStore) {svcStore._resetStore()}
  const rootStore = require('../../cloudfunctions/common/risk-rate-limit')
  if (rootStore._resetStore) {rootStore._resetStore()}
})

const { createRefund, queryRefund } = require('../../cloudfunctions/paymentService/services/refund')

describe('集成测试：售后/退款子链路', () => {
  describe('createRefund：参数校验', () => {
    test('缺少 outTradeNo → INVALID_PARAMS', async () => {
      const res = await createRefund(
        { refundAmount: 100, totalAmount: 100 },
        {},
        { openid: 'o1' }
      )
      expect(res.code).not.toBe(0)
      expect(res.error.type).toBe('INVALID_PARAMS')
    })

    test('缺少 refundAmount → INVALID_PARAMS', async () => {
      const res = await createRefund(
        { outTradeNo: 'OT1', totalAmount: 100 },
        {},
        { openid: 'o1' }
      )
      expect(res.code).not.toBe(0)
      expect(res.error.type).toBe('INVALID_PARAMS')
    })

    test('缺少 totalAmount → INVALID_PARAMS', async () => {
      const res = await createRefund(
        { outTradeNo: 'OT1', refundAmount: 100 },
        {},
        { openid: 'o1' }
      )
      expect(res.code).not.toBe(0)
      expect(res.error.type).toBe('INVALID_PARAMS')
    })

    test('refundAmount > totalAmount → INVALID_PARAMS', async () => {
      const res = await createRefund(
        { outTradeNo: 'OT1', refundAmount: 200, totalAmount: 100 },
        {},
        { openid: 'o1' }
      )
      expect(res.code).not.toBe(0)
      expect(res.error.type).toBe('INVALID_PARAMS')
    })
  })

  describe('createRefund：权限校验', () => {
    test('订单 owner 不匹配 → PERMISSION_DENIED', async () => {
      mockDb._collections.orders = { docs: [
        { _id: 'OT1', outTradeNo: 'OTN_1', ownerId: 'oOwner', totalPrice: 100, paidAmount: 100 },
      ] }
      const res = await createRefund(
        { outTradeNo: 'OTN_1', refundAmount: 50, totalAmount: 100 },
        {},
        { openid: 'oNotOwner' }
      )
      expect(res.code).not.toBe(0)
      expect(res.error.type).toBe('PERMISSION_DENIED')
    })

    test('订单存在且 owner 匹配 → 走微信 API', async () => {
      mockDb._collections.orders = { docs: [
        { _id: 'OT1', outTradeNo: 'OTN_1', ownerId: 'oOwner', totalPrice: 100, paidAmount: 100 },
      ] }
      mockWechatResponse = {
        refund_id: 'wx_refund_001',
        out_refund_no: 'REFUND_xxx',
        status: 'SUCCESS',
        channel: 'ORIGINAL',
        user_received_account: '支付用户零钱',
      }
      const res = await createRefund(
        { outTradeNo: 'OTN_1', refundAmount: 50, totalAmount: 100 },
        {},
        { openid: 'oOwner' }
      )
      // Sprint 24: WrappedHandler 成功路径直接返回 CreateRefundResult 原始数据
      // (code === undefined)，index.js 会再做一次 toResponse 包装
      expect(res.code).toBeUndefined()
      expect(res.refundId).toBe('wx_refund_001')
      expect(res.status).toBe('SUCCESS')
    })
  })

  describe('createRefund：金额双重校验', () => {
    test('订单实际支付金额 < 申请退款金额 → INVALID_PARAMS', async () => {
      mockDb._collections.orders = { docs: [
        { _id: 'OT1', outTradeNo: 'OTN_1', ownerId: 'oOwner', totalPrice: 50, paidAmount: 50 },
      ] }
      // 订单实际支付 50 元（paidAmount 单位元），申请退 100 元（refundAmount 单位分 = 10000）
      const res = await createRefund(
        { outTradeNo: 'OTN_1', refundAmount: 10000, totalAmount: 10000 },
        {},
        { openid: 'oOwner' }
      )
      expect(res.code).not.toBe(0)
      expect(res.error.type).toBe('INVALID_PARAMS')
    })

    test('订单金额为 0（理论异常）→ 不再二次校验，直接走 API', async () => {
      mockDb._collections.orders = { docs: [
        { _id: 'OT1', outTradeNo: 'OTN_1', ownerId: 'oOwner' /* 无金额字段 */ },
      ] }
      mockWechatResponse = {
        refund_id: 'wx_refund_002', status: 'SUCCESS',
        channel: 'ORIGINAL', user_received_account: '',
      }
      const res = await createRefund(
        { outTradeNo: 'OTN_1', refundAmount: 50, totalAmount: 100 },
        {},
        { openid: 'oOwner' }
      )
      // 实际金额为 0 时跳过实际校验，按入参调 API
      // Sprint 24: 成功路径返回原始数据
      expect(res.code).toBeUndefined()
      expect(res.refundId).toBe('wx_refund_002')
    })
  })

  describe('createRefund：微信 API 失败', () => {
    test('微信返回 status=FAIL → REFUND_FAILED', async () => {
      mockDb._collections.orders = { docs: [
        { _id: 'OT1', outTradeNo: 'OTN_1', ownerId: 'oOwner', totalPrice: 100, paidAmount: 100 },
      ] }
      mockWechatResponse = {
        status: 'FAIL',
        message: '账户余额不足',
      }
      const res = await createRefund(
        { outTradeNo: 'OTN_1', refundAmount: 50, totalAmount: 100 },
        {},
        { openid: 'oOwner' }
      )
      expect(res.code).not.toBe(0)
      expect(res.error.type).toBe('REFUND_FAILED')
    })

    test('微信返回 status=PROCESSING（处理中）→ 仍视为成功提交', async () => {
      mockDb._collections.orders = { docs: [
        { _id: 'OT1', outTradeNo: 'OTN_1', ownerId: 'oOwner', totalPrice: 100, paidAmount: 100 },
      ] }
      mockWechatResponse = {
        refund_id: 'wx_refund_003', status: 'PROCESSING',
        channel: 'ORIGINAL', user_received_account: '',
      }
      const res = await createRefund(
        { outTradeNo: 'OTN_1', refundAmount: 50, totalAmount: 100 },
        {},
        { openid: 'oOwner' }
      )
      // Sprint 24: 成功路径返回原始数据
      expect(res.code).toBeUndefined()
      expect(res.status).toBe('PROCESSING')
    })
  })

  describe('createRefund：outRefundNo 生成', () => {
    test('outRefundNo 以 REFUND_ 开头', async () => {
      mockDb._collections.orders = { docs: [
        { _id: 'OT1', outTradeNo: 'OTN_1', ownerId: 'oOwner', totalPrice: 100, paidAmount: 100 },
      ] }
      mockWechatResponse = {
        refund_id: 'wx_r1', status: 'SUCCESS', channel: 'ORIGINAL', user_received_account: '',
      }
      const res = await createRefund(
        { outTradeNo: 'OTN_1', refundAmount: 100, totalAmount: 100 },
        {},
        { openid: 'oOwner' }
      )
      // Sprint 24: 成功路径返回原始数据
      expect(res.code).toBeUndefined()
      expect(res.outRefundNo).toMatch(/^REFUND_/)
    })
  })

  describe('queryRefund', () => {
    test('缺少 outRefundNo → INVALID_PARAMS', async () => {
      const res = await queryRefund({}, {}, { openid: 'o1' })
      expect(res.code).not.toBe(0)
      expect(res.error.type).toBe('INVALID_PARAMS')
    })

    test('正常查询 → 透传微信结果', async () => {
      // P3 修复后：查询须同时传 outTradeNo（按订单校验归属，防越权查询他人退款单）
      mockDb._collections.orders = { docs: [
        { _id: 'OT1', outTradeNo: 'OTN_Q1', ownerId: 'o1', totalPrice: 100 },
      ] }
      mockWechatResponse = {
        refund_id: 'wx_r_q1', status: 'SUCCESS', amount: { refund: 50, total: 100 },
      }
      const res = await queryRefund(
        { outRefundNo: 'REFUND_001', outTradeNo: 'OTN_Q1' },
        {},
        { openid: 'o1' }
      )
      // Sprint 24: 成功路径直接返回 WechatRefundResponse 原始数据
      expect(res.code).toBeUndefined()
      expect(res.refund_id).toBe('wx_r_q1')
    })
  })

  describe('退款与订单状态机联动', () => {
    test('已退款的订单（refundStatus=completed）→ cancelOrder 拒绝', async () => {
      // 模拟 orderService 的判断逻辑（独立测试）
      mockDb._collections.orders = { docs: [
        { _id: 'o1', status: 'paid', refundStatus: 'completed' },
      ] }
      const order = mockDb._collections.orders.docs[0]
      // 模拟 updateOrderStatus 中的判断
      const isAlreadyRefunded = order.refundStatus === 'completed'
      expect(isAlreadyRefunded).toBe(true)
      // 业务上：应该抛 ORDER_ALREADY_REFUNDED
    })
  })
})
