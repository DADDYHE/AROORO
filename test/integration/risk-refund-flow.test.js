/**
 * Sprint 15: 退款风控子链路集成测试
 *
 * 端到端：detectRefundAbuse 拉真实 db 快照，输出风险报告，
 *   联动 assertRiskDecision 抛出 / 透传。
 *
 * 覆盖：
 *   1. 正常退款：低风险 → allow → RISK_PASS
 *   2. 短时间高频：5 笔 24h → high → RISK_REJECT
 *   3. 退款率过高：8 笔 / 10 单 30 天 → high → RISK_REJECT
 *   4. 全额退款（用户首次全退）：medium → RISK_PENDING
 *   5. 全额退款（用户已有 ≥1 次全退）：保留 high → RISK_REJECT
 *   6. 相同金额拆分：5 笔 / 1h → high → RISK_REJECT
 *   7. 复合：高频 + 同金额 → level 升级取 max
 *   8. 边界：零金额不触发 same-amount
 *   9. 业务集成：assertRiskDecision 三档抛错
 */

const path = require('path')
const riskControl = require(path.join(__dirname, '..', '..', 'cloudfunctions', 'common', 'risk-control.js'))
const { BusinessError } = require(path.join(__dirname, '..', '..', 'cloudfunctions', 'common', 'errors.js'))

const {
  detectRefundAbuse,
  detectRefundHighFrequency,
  detectRefundRate,
  detectFullRefund,
  detectSameAmountPattern,
  assertRiskDecision,
  mapActionToErrorCode,
  REFUND_CONFIG,
} = riskControl

// ===== Mock DB =====
function makeMockDb(initial = {}) {
  const collections = {}
  for (const [name, docs] of Object.entries(initial)) {
    collections[name] = { docs: [...docs] }
  }
  const db = {
    collection: (name) => {
      if (!collections[name]) {collections[name] = { docs: [] }}
      const col = collections[name]
      return {
        where: (q) => makeQuery(col, q),
      }
    },
  }
  function makeQuery(col, q) {
    const matchFn = (doc) => {
      for (const [k, v] of Object.entries(q || {})) {
        if (v && typeof v === 'object' && v._op === 'gte') {
          if (doc[k] < v.v) {return false}
        } else if (doc[k] !== v) {
          return false
        }
      }
      return true
    }
    return {
      where: (q2) => makeQuery(col, { ...q, ...q2 }),
      limit: () => makeQuery(col, q),
      get: () => Promise.resolve({ data: col.docs.filter(matchFn) }),
    }
  }
  return db
}

function makeRefund(overrides) {
  return {
    _id: 'r_' + Math.random().toString(36).slice(2, 8),
    ownerId: 'u1',
    orderId: 'o1',
    refundAmount: 1000,  // 分
    totalAmount: 2000,
    reason: '不想要了',
    status: 'success',
    createdAt: Date.now() - 60_000,
    ...overrides,
  }
}

const NOW = 1_700_000_000_000

describe('Sprint 15: 退款风控子链路', () => {
  describe('单项检测（unit-like）', () => {
    test('detectRefundHighFrequency 5 笔 24h → high', () => {
      const list = Array.from({ length: 5 }, () =>
        makeRefund({ createdAt: NOW - 60 * 60_000 }))
      const r = detectRefundHighFrequency(list, NOW)
      expect(r.hit).toBe(true)
      expect(r.level).toBe('high')
    })

    test('detectRefundHighFrequency 3 笔 24h → medium', () => {
      const list = Array.from({ length: 3 }, () =>
        makeRefund({ createdAt: NOW - 60 * 60_000 }))
      const r = detectRefundHighFrequency(list, NOW)
      expect(r.hit).toBe(true)
      expect(r.level).toBe('medium')
    })

    test('detectRefundHighFrequency 2 笔 → low', () => {
      const list = Array.from({ length: 2 }, () =>
        makeRefund({ createdAt: NOW - 60 * 60_000 }))
      const r = detectRefundHighFrequency(list, NOW)
      expect(r.hit).toBe(false)
    })

    test('detectRefundRate 8/10 30 天 → high', () => {
      const list = Array.from({ length: 8 }, () =>
        makeRefund({ createdAt: NOW - 15 * 86400_000 }))
      const r = detectRefundRate(list, 10, NOW)
      expect(r.hit).toBe(true)
      expect(r.level).toBe('high')
      expect(r.rate).toBe(0.8)
    })

    test('detectRefundRate 5/10 → medium (50%)', () => {
      const list = Array.from({ length: 5 }, () =>
        makeRefund({ createdAt: NOW - 15 * 86400_000 }))
      const r = detectRefundRate(list, 10, NOW)
      expect(r.hit).toBe(true)
      expect(r.level).toBe('medium')
    })

    test('detectRefundRate 样本不足（1/2）→ low', () => {
      const list = [makeRefund({ createdAt: NOW - 86400_000 })]
      const r = detectRefundRate(list, 2, NOW)
      expect(r.hit).toBe(false)
    })

    test('detectFullRefund 100% → high（无历史全退样本时降级为 medium）', () => {
      const cur = makeRefund({ refundAmount: 2000, totalAmount: 2000 })
      const r = detectFullRefund(cur)
      expect(r.hit).toBe(true)
      expect(r.level).toBe('high')
      expect(r.ratio).toBe(1)
    })

    test('detectFullRefund 95% → medium', () => {
      const cur = makeRefund({ refundAmount: 1900, totalAmount: 2000 })
      const r = detectFullRefund(cur)
      expect(r.hit).toBe(true)
      expect(r.level).toBe('medium')
    })

    test('detectSameAmountPattern 5 笔 1h → high', () => {
      const list = Array.from({ length: 5 }, () =>
        makeRefund({ refundAmount: 1000, createdAt: NOW - 10 * 60_000 }))
      const r = detectSameAmountPattern(list, 1000, NOW)
      expect(r.hit).toBe(true)
      expect(r.level).toBe('high')
    })

    test('detectSameAmountPattern 3 笔 1h → medium', () => {
      const list = Array.from({ length: 3 }, () =>
        makeRefund({ refundAmount: 1000, createdAt: NOW - 10 * 60_000 }))
      const r = detectSameAmountPattern(list, 1000, NOW)
      expect(r.hit).toBe(true)
      expect(r.level).toBe('medium')
    })

    test('detectSameAmountPattern 零金额不触发', () => {
      const r = detectSameAmountPattern([], 0, NOW)
      expect(r.hit).toBe(false)
    })
  })

  describe('主入口 detectRefundAbuse（集成）', () => {
    test('空 db：低风险 → allow', async () => {
      const db = makeMockDb({ refunds: [], orders: [] })
      const r = await detectRefundAbuse({
        db, userId: 'u1', orderId: 'o1', refundAmount: 1000, totalAmount: 2000,
        now: NOW,
      })
      expect(r.level).toBe('low')
      expect(r.action).toBe('allow')
    })

    test('高频 5 笔 24h → reject', async () => {
      const list = Array.from({ length: 5 }, () =>
        makeRefund({ createdAt: NOW - 60 * 60_000 }))
      const db = makeMockDb({ refunds: list, orders: [] })
      const r = await detectRefundAbuse({
        db, userId: 'u1', orderId: 'o1', refundAmount: 1000, totalAmount: 2000,
        now: NOW,
      })
      expect(r.action).toBe('reject')
      expect(r.reasons.some(s => s.startsWith('REFUND_HIGH_FREQ'))).toBe(true)
    })

    test('复合：高频 medium + 同金额 medium → review（取 max）', async () => {
      const list = Array.from({ length: 3 }, () =>
        makeRefund({
          createdAt: NOW - 10 * 60_000,
          refundAmount: 1000,
        }))
      const db = makeMockDb({ refunds: list, orders: [] })
      const r = await detectRefundAbuse({
        db, userId: 'u1', orderId: 'o1', refundAmount: 1000, totalAmount: 2000,
        now: NOW,
      })
      expect(r.action).toBe('review')
      expect(r.reasons.some(s => s.startsWith('REFUND_HIGH_FREQ'))).toBe(true)
      expect(r.reasons.some(s => s.startsWith('SAME_AMOUNT'))).toBe(true)
    })

    test('全额退款（无历史全退样本）→ review（首次全退降级）', async () => {
      const db = makeMockDb({ refunds: [], orders: [] })
      const r = await detectRefundAbuse({
        db, userId: 'u1', orderId: 'o1',
        refundAmount: 2000, totalAmount: 2000,
        now: NOW,
      })
      expect(r.action).toBe('review')
      expect(r.reasons.some(s => s.startsWith('FULL_REFUND'))).toBe(true)
    })

    test('全额退款（已有 1 次全退）→ reject（保留 high）', async () => {
      const list = [
        makeRefund({ refundAmount: 2000, totalAmount: 2000, createdAt: NOW - 86400_000 }),
      ]
      const db = makeMockDb({ refunds: list, orders: [] })
      const r = await detectRefundAbuse({
        db, userId: 'u1', orderId: 'o1',
        refundAmount: 2000, totalAmount: 2000,
        now: NOW,
      })
      expect(r.action).toBe('reject')
    })

    test('退款率过高 → reject', async () => {
      const refunds = Array.from({ length: 9 }, () =>
        makeRefund({ createdAt: NOW - 15 * 86400_000 }))
      // 需要 orders 中有 10 个 completed 订单，让 9/10 触发高退款率
      const orders = Array.from({ length: 10 }, (_, i) => ({
        _id: `o${i}`,
        ownerId: 'u1',
        status: 'completed',
        createdAt: NOW - 20 * 86400_000,
      }))
      const db = makeMockDb({ refunds, orders })
      const r = await detectRefundAbuse({
        db, userId: 'u1', orderId: 'o1',
        refundAmount: 1000, totalAmount: 2000,
        now: NOW,
      })
      expect(r.action).toBe('reject')
      expect(r.reasons.some(s => s.startsWith('REFUND_RATE'))).toBe(true)
    })

    test('details 含各子项结果', async () => {
      const db = makeMockDb({ refunds: [], orders: [] })
      const r = await detectRefundAbuse({
        db, userId: 'u1', orderId: 'o1',
        refundAmount: 1000, totalAmount: 2000,
        now: NOW,
      })
      expect(r.details).toBeDefined()
      expect(r.target).toBeDefined()
    })
  })

  describe('业务集成 assertRiskDecision', () => {
    test('allow → 返回 RISK_PASS', () => {
      const risk = { level: 'low', action: 'allow', reasons: [], details: {}, target: {} }
      expect(assertRiskDecision(risk).code).toBe('RISK_PASS')
    })

    test('review → 抛 RISK_PENDING', () => {
      const risk = { level: 'medium', action: 'review', reasons: ['FULL_REFUND:100%'], details: {}, target: {} }
      try {
        assertRiskDecision(risk)
        throw new Error('should throw')
      } catch (e) {
        expect(e).toBeInstanceOf(BusinessError)
        expect(e.code).toBe('RISK_PENDING')
      }
    })

    test('reject → 抛 RISK_REJECT', () => {
      const risk = { level: 'high', action: 'reject', reasons: ['REFUND_RATE:80%'], details: {}, target: {} }
      try {
        assertRiskDecision(risk)
        throw new Error('should throw')
      } catch (e) {
        expect(e.code).toBe('RISK_REJECT')
      }
    })
  })

  describe('mapActionToErrorCode', () => {
    test.each([
      ['reject', 'RISK_REJECT'],
      ['review', 'RISK_PENDING'],
      ['allow', 'RISK_PASS'],
    ])("mapActionToErrorCode('%s') === '%s'", (action, expected) => {
      expect(mapActionToErrorCode(action)).toBe(expected)
    })
  })
})
