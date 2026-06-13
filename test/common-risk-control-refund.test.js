/**
 * cloudfunctions/common/risk-control.js 退款滥用检测（Sprint 11）
 */

const {
  detectRefundAbuse,
  detectRefundHighFrequency,
  detectRefundRate,
  detectFullRefund,
  detectSameAmountPattern,
  REFUND_CONFIG,
} = require('../cloudfunctions/common/risk-control')

const NOW = new Date('2026-06-04T12:00:00Z').getTime()

const ref = (overrides = {}) => ({
  _id: `r_${Math.random().toString(36).slice(2, 8)}`,
  ownerId: 'oU1',
  orderId: `ord_${Math.random().toString(36).slice(2, 6)}`,
  refundAmount: 10000, // 100 元 = 10000 分
  totalAmount: 10000,
  reason: '不想要了',
  status: 'success',
  createdAt: NOW - 1000,
  ...overrides,
})

const ord = (overrides = {}) => ({
  _id: `o_${Math.random().toString(36).slice(2, 8)}`,
  ownerId: 'oU1',
  status: 'completed',
  totalPrice: 10000,
  createdAt: NOW - 1000,
  ...overrides,
})

// ============ 通用 mock：支持多个集合 ============
function createMockDb({ refunds = [], orders = [] } = {}) {
  const data = { refunds, orders }
  return {
    collection(name) {
      return {
        where(query) {
          const filterFn = doc => {
            for (const [k, v] of Object.entries(query || {})) {
              if (v && typeof v === 'object' && v._op) {
                if (v._op === 'gte') {
                  const dv = doc[k] instanceof Date ? doc[k].getTime() : doc[k]
                  const cv = v.v instanceof Date ? v.v.getTime() : v.v
                  if (!(dv >= cv)) {return false}
                }
                continue
              }
              if (doc[k] !== v) {return false}
            }
            return true
          }
          const chain = {
            limit: () => chain,
            get: async () => ({ data: (data[name] || []).filter(filterFn) }),
          }
          return chain
        },
      }
    },
  }
}

describe('risk-control：退款滥用检测', () => {
  describe('detectRefundHighFrequency（短时间高频）', () => {
    test('24h 内 0 笔 → low', () => {
      const r = detectRefundHighFrequency([], NOW)
      expect(r.level).toBe('low')
    })

    test('24h 内 2 笔 → low', () => {
      const list = [
        ref({ createdAt: NOW - 1000 }),
        ref({ createdAt: NOW - 2000 }),
      ]
      const r = detectRefundHighFrequency(list, NOW)
      expect(r.level).toBe('low')
    })

    test('24h 内 3 笔 → medium', () => {
      const list = [
        ref({ createdAt: NOW - 1000 }),
        ref({ createdAt: NOW - 2000 }),
        ref({ createdAt: NOW - 3000 }),
      ]
      const r = detectRefundHighFrequency(list, NOW)
      expect(r.level).toBe('medium')
    })

    test('24h 内 5 笔 → high', () => {
      const list = Array.from({ length: 5 }, (_, i) => ref({ createdAt: NOW - i * 1000 }))
      const r = detectRefundHighFrequency(list, NOW)
      expect(r.level).toBe('high')
    })

    test('窗口外不计入', () => {
      const list = [
        ref({ createdAt: NOW - 1000 }),
        ref({ createdAt: NOW - 25 * 60 * 60 * 1000 }),
        ref({ createdAt: NOW - 48 * 60 * 60 * 1000 }),
      ]
      const r = detectRefundHighFrequency(list, NOW)
      expect(r.count).toBe(1)
      expect(r.level).toBe('low')
    })
  })

  describe('detectRefundRate（退款率）', () => {
    test('样本不足 → low', () => {
      const r = detectRefundRate([], 2, NOW)
      expect(r.level).toBe('low')
    })

    test('3 单 0 退款 → 0% / low', () => {
      const r = detectRefundRate([], 3, NOW)
      expect(r.rate).toBe(0)
      expect(r.level).toBe('low')
    })

    test('4 单 2 退款 = 50% → medium', () => {
      const refunds = [
        ref({ createdAt: NOW - 1000 }),
        ref({ createdAt: NOW - 2000 }),
      ]
      const r = detectRefundRate(refunds, 4, NOW)
      expect(r.rate).toBe(0.5)
      expect(r.level).toBe('medium')
    })

    test('5 单 4 退款 = 80% → high', () => {
      const refunds = Array.from({ length: 4 }, (_, i) => ref({ createdAt: NOW - i * 1000 }))
      const r = detectRefundRate(refunds, 5, NOW)
      expect(r.rate).toBe(0.8)
      expect(r.level).toBe('high')
    })

    test('窗口外退款不计入', () => {
      const refunds = [
        ref({ createdAt: NOW - 1000 }),
        ref({ createdAt: NOW - 31 * 24 * 60 * 60 * 1000 }), // 31 天前
      ]
      const r = detectRefundRate(refunds, 5, NOW)
      expect(r.refunds).toBe(1)
    })
  })

  describe('detectFullRefund（全额退款）', () => {
    test('refundAmount = 0 / totalAmount = 0 → low', () => {
      const r = detectFullRefund({ refundAmount: 0, totalAmount: 0 })
      expect(r.level).toBe('low')
    })

    test('50% → low', () => {
      const r = detectFullRefund({ refundAmount: 5000, totalAmount: 10000 })
      expect(r.ratio).toBe(0.5)
      expect(r.level).toBe('low')
    })

    test('95% → medium', () => {
      const r = detectFullRefund({ refundAmount: 9500, totalAmount: 10000 })
      expect(r.ratio).toBe(0.95)
      expect(r.level).toBe('medium')
    })

    test('99% → high', () => {
      const r = detectFullRefund({ refundAmount: 9900, totalAmount: 10000 })
      expect(r.ratio).toBe(0.99)
      expect(r.level).toBe('high')
    })

    test('100% → high', () => {
      const r = detectFullRefund({ refundAmount: 10000, totalAmount: 10000 })
      expect(r.level).toBe('high')
    })
  })

  describe('detectSameAmountPattern（同金额拆单）', () => {
    test('当前金额为 0 → low', () => {
      const r = detectSameAmountPattern([], 0, NOW)
      expect(r.level).toBe('low')
    })

    test('窗口内 0 笔同金额 → low', () => {
      const r = detectSameAmountPattern([], 5000, NOW)
      expect(r.level).toBe('low')
    })

    test('1h 内 3 笔同金额 → medium', () => {
      const list = Array.from({ length: 3 }, (_, i) =>
        ref({ refundAmount: 5000, createdAt: NOW - i * 1000 })
      )
      const r = detectSameAmountPattern(list, 5000, NOW)
      expect(r.count).toBe(3)
      expect(r.level).toBe('medium')
    })

    test('1h 内 5 笔同金额 → high', () => {
      const list = Array.from({ length: 5 }, (_, i) =>
        ref({ refundAmount: 5000, createdAt: NOW - i * 1000 })
      )
      const r = detectSameAmountPattern(list, 5000, NOW)
      expect(r.level).toBe('high')
    })

    test('不同金额不计入', () => {
      const list = [
        ref({ refundAmount: 5000, createdAt: NOW - 1000 }),
        ref({ refundAmount: 6000, createdAt: NOW - 2000 }),
        ref({ refundAmount: 7000, createdAt: NOW - 3000 }),
      ]
      const r = detectSameAmountPattern(list, 5000, NOW)
      expect(r.count).toBe(1)
    })
  })

  describe('detectRefundAbuse（主入口）', () => {
    test('正常退款 → low / allow', async () => {
      const db = createMockDb({ refunds: [], orders: [ord(), ord(), ord()] })
      const r = await detectRefundAbuse({
        db, userId: 'oU1', orderId: 'oNew', refundAmount: 5000, totalAmount: 10000, now: NOW,
      })
      expect(r.level).toBe('low')
      expect(r.action).toBe('allow')
      expect(r.reasons.length).toBe(0)
    })

    test('24h 5 笔退款 → high / reject', async () => {
      const refunds = Array.from({ length: 5 }, (_, i) =>
        ref({ createdAt: NOW - i * 1000 })
      )
      const orders = Array.from({ length: 10 }, () => ord())
      const db = createMockDb({ refunds, orders })
      const r = await detectRefundAbuse({
        db, userId: 'oU1', orderId: 'oNew', refundAmount: 1000, totalAmount: 10000, now: NOW,
      })
      expect(r.reasons.some(x => x.startsWith('REFUND_HIGH_FREQ'))).toBe(true)
    })

    test('80% 退款率 + 全额 → high', async () => {
      const refunds = Array.from({ length: 4 }, (_, i) =>
        ref({ refundAmount: 10000, totalAmount: 10000, createdAt: NOW - i * 1000 })
      )
      const orders = Array.from({ length: 5 }, () => ord())
      const db = createMockDb({ refunds, orders })
      const r = await detectRefundAbuse({
        db, userId: 'oU1', orderId: 'oNew', refundAmount: 10000, totalAmount: 10000, now: NOW,
      })
      expect(r.level).toBe('high')
      expect(r.action).toBe('reject')
      expect(r.reasons.some(x => x.startsWith('REFUND_RATE'))).toBe(true)
      expect(r.reasons.some(x => x.startsWith('FULL_REFUND'))).toBe(true)
    })

    test('1h 内 5 笔同金额 → high（同金额拆单）', async () => {
      const refunds = Array.from({ length: 5 }, (_, i) =>
        ref({ refundAmount: 5000, totalAmount: 10000, createdAt: NOW - i * 100 })
      )
      const db = createMockDb({ refunds, orders: [] })
      const r = await detectRefundAbuse({
        db, userId: 'oU1', orderId: 'oNew', refundAmount: 5000, totalAmount: 10000, now: NOW,
      })
      expect(r.reasons.some(x => x.startsWith('SAME_AMOUNT'))).toBe(true)
    })

    test('中风险：3 笔 24h + 50% 率 → medium / review', async () => {
      const refunds = Array.from({ length: 3 }, (_, i) =>
        ref({ createdAt: NOW - i * 1000 })
      )
      const orders = Array.from({ length: 6 }, () => ord())
      const db = createMockDb({ refunds, orders })
      const r = await detectRefundAbuse({
        db, userId: 'oU1', orderId: 'oNew', refundAmount: 1000, totalAmount: 10000, now: NOW,
      })
      expect(r.level).toBe('medium')
      expect(r.action).toBe('review')
    })

    test('report.target 应回填退款关键字段', async () => {
      const db = createMockDb({})
      const r = await detectRefundAbuse({
        db, userId: 'oU1', orderId: 'oNew', refundAmount: 1000, totalAmount: 10000, reason: '商家原因', now: NOW,
      })
      expect(r.target).toEqual({
        userId: 'oU1', orderId: 'oNew',
        refundAmount: 1000, totalAmount: 10000, reason: '商家原因',
      })
    })

    test('多检测项同时触发 → 取最高', async () => {
      // 3 笔 24h + 4 笔同金额 + 95% 全额
      const refunds = [
        ref({ refundAmount: 10000, totalAmount: 10000, createdAt: NOW - 1000 }),
        ref({ refundAmount: 10000, totalAmount: 10000, createdAt: NOW - 2000 }),
        ref({ refundAmount: 10000, totalAmount: 10000, createdAt: NOW - 3000 }),
        ref({ refundAmount: 10000, totalAmount: 10000, createdAt: NOW - 400 }),
        ref({ refundAmount: 10000, totalAmount: 10000, createdAt: NOW - 500 }),
        ref({ refundAmount: 10000, totalAmount: 10000, createdAt: NOW - 600 }),
      ]
      const orders = Array.from({ length: 6 }, () => ord())
      const db = createMockDb({ refunds, orders })
      const r = await detectRefundAbuse({
        db, userId: 'oU1', orderId: 'oNew', refundAmount: 10000, totalAmount: 10000, now: NOW,
      })
      expect(r.level).toBe('high')
      expect(r.action).toBe('reject')
      expect(r.reasons.length).toBeGreaterThanOrEqual(3)
    })
  })

  describe('REFUND_CONFIG 暴露', () => {
    test('关键阈值都应存在', () => {
      expect(REFUND_CONFIG.REFUND_HIGH_FREQ_WINDOW_MS).toBeDefined()
      expect(REFUND_CONFIG.REFUND_RATE_THRESHOLD).toBeDefined()
      expect(REFUND_CONFIG.FULL_REFUND_THRESHOLD).toBeDefined()
      expect(REFUND_CONFIG.SAME_AMOUNT_THRESHOLD).toBeDefined()
    })
  })
})
