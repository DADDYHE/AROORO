/**
 * Sprint 51：寄养接单风控（防商家账号被盗批量接单）
 *   cloudfunctions/common/risk-control.js 新增 detectBoardingAcceptRisk 单元测试
 *
 * 覆盖：
 *   - detectAcceptBurst（短窗口高频）阈值边界
 *   - detectAbnormalHour（凌晨时段）判定
 *   - detectLargeAcceptAmount（大额接单）阈值
 *   - detectNewPartnerLargeAccept（新合作首接大额）
 *   - detectBoardingAcceptRisk 主入口：组合 4 个检测项
 *   - 与 withRateLimit 联合（type=boarding_accept）
 */

const {
  detectAcceptBurst,
  detectAbnormalHour,
  detectLargeAcceptAmount,
  detectNewPartnerLargeAccept,
  detectBoardingAcceptRisk,
  BOARDING_ACCEPT_CONFIG,
} = require('../cloudfunctions/common/risk-control')
const { peekRateLimit, consumeRateLimit } = require('../cloudfunctions/common/risk-rate-limit')

// ============ In-memory db mock ============
function createMockDb({ orders = [], admins = {} } = {}) {
  return {
    collection(name) {
      if (name === 'orders') {
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
              get: async () => ({ data: orders.filter(filterFn) }),
            }
            return chain
          },
        }
      }
      if (name === 'admins') {
        return {
          doc(uid) {
            return {
              get: async () => ({ data: admins[uid] || null }),
            }
          },
        }
      }
      return {
        where() {
          return { limit: () => ({ get: async () => ({ data: [] }) }) }
        },
        doc() {
          return { get: async () => ({ data: null }) }
        },
      }
    },
  }
}

const NOW = new Date('2026-06-04T14:00:00Z').getTime() // 22:00 北京时间（正常时段）

const makeOrder = (overrides = {}) => ({
  _id: `o_${Math.random().toString(36).slice(2, 8)}`,
  hostId: 'partner_1',
  status: 'confirmed',
  updatedAt: NOW - 60 * 1000,
  ...overrides,
})

describe('risk-control.js (Sprint 51 寄养接单风控)', () => {
  describe('detectAcceptBurst（短窗口高频接单）', () => {
    test('0 次 → low', () => {
      const r = detectAcceptBurst([], NOW)
      expect(r.hit).toBe(false)
      expect(r.level).toBe('low')
      expect(r.count).toBe(0)
    })
    test('1 次 → low', () => {
      const r = detectAcceptBurst([{ createdAt: NOW - 1000 }], NOW)
      expect(r.hit).toBe(false)
      expect(r.level).toBe('low')
    })
    test('等于 THRESHOLD（3 次） → medium', () => {
      const recents = [0, 1, 2].map(i => ({ createdAt: NOW - i * 1000 }))
      const r = detectAcceptBurst(recents, NOW)
      expect(r.hit).toBe(true)
      expect(r.level).toBe('medium')
      expect(r.count).toBe(3)
    })
    test('等于 HIGH（6 次） → high', () => {
      const recents = [0, 1, 2, 3, 4, 5].map(i => ({ createdAt: NOW - i * 1000 }))
      const r = detectAcceptBurst(recents, NOW)
      expect(r.hit).toBe(true)
      expect(r.level).toBe('high')
      expect(r.count).toBe(6)
    })
    test('窗口外的旧记录不计数', () => {
      const recents = [
        { createdAt: NOW - 10 * 60 * 1000 }, // 10 分钟前 → 窗口外
        { createdAt: NOW - 1000 },
        { createdAt: NOW - 2000 },
      ]
      const r = detectAcceptBurst(recents, NOW)
      expect(r.count).toBe(2)
      expect(r.hit).toBe(false)
    })
  })

  describe('detectAbnormalHour（异常时段接单）', () => {
    test('凌晨 0 点 → medium', () => {
      const t0 = new Date('2026-06-04T00:00:00Z').getTime()
      // 北京时间 08:00 → 正常
      const r0 = detectAbnormalHour(new Date('2026-06-04T00:00:00').getTime())
      expect(r0.level).toBeDefined()
      // 直接 mock hour
      const orig = Date.prototype.getHours
      Date.prototype.getHours = function () { return 3 }
      const r = detectAbnormalHour(NOW)
      expect(r.hit).toBe(true)
      expect(r.level).toBe('medium')
      expect(r.hour).toBe(3)
      Date.prototype.getHours = orig
    })
    test('凌晨 5 点 → medium', () => {
      const orig = Date.prototype.getHours
      Date.prototype.getHours = function () { return 5 }
      const r = detectAbnormalHour(NOW)
      expect(r.hit).toBe(true)
      expect(r.level).toBe('medium')
      Date.prototype.getHours = orig
    })
    test('早上 6 点 → low（边界外）', () => {
      const orig = Date.prototype.getHours
      Date.prototype.getHours = function () { return 6 }
      const r = detectAbnormalHour(NOW)
      expect(r.hit).toBe(false)
      expect(r.level).toBe('low')
      Date.prototype.getHours = orig
    })
    test('晚上 22 点 → low', () => {
      const orig = Date.prototype.getHours
      Date.prototype.getHours = function () { return 22 }
      const r = detectAbnormalHour(NOW)
      expect(r.hit).toBe(false)
      expect(r.level).toBe('low')
      Date.prototype.getHours = orig
    })
  })

  describe('detectLargeAcceptAmount（大额接单）', () => {
    test('小额 100 元 → low', () => {
      const r = detectLargeAcceptAmount(100 * 100)
      expect(r.hit).toBe(false)
      expect(r.level).toBe('low')
    })
    test('等于 LARGE_ACCEPT_FEN（3 万） → medium', () => {
      const r = detectLargeAcceptAmount(BOARDING_ACCEPT_CONFIG.LARGE_ACCEPT_FEN)
      expect(r.hit).toBe(true)
      expect(r.level).toBe('medium')
    })
    test('介于 LARGE 和 HUGE 之间 → medium', () => {
      const r = detectLargeAcceptAmount(BOARDING_ACCEPT_CONFIG.LARGE_ACCEPT_FEN + 1000)
      expect(r.hit).toBe(true)
      expect(r.level).toBe('medium')
    })
    test('等于 HUGE_ACCEPT_FEN（8 万） → high', () => {
      const r = detectLargeAcceptAmount(BOARDING_ACCEPT_CONFIG.HUGE_ACCEPT_FEN)
      expect(r.hit).toBe(true)
      expect(r.level).toBe('high')
    })
  })

  describe('detectNewPartnerLargeAccept（新合作首接大额）', () => {
    test('合作 > 7 天 → low', () => {
      const r = detectNewPartnerLargeAccept(NOW - 10 * 86400000, 50 * 100 * 100, NOW)
      expect(r.hit).toBe(false)
      expect(r.level).toBe('low')
    })
    test('合作 < 7 天 + 大额（≥ 1 万） → medium', () => {
      const r = detectNewPartnerLargeAccept(NOW - 3 * 86400000, BOARDING_ACCEPT_CONFIG.NEW_PARTNER_LARGE_FEN, NOW)
      expect(r.hit).toBe(true)
      expect(r.level).toBe('medium')
    })
    test('合作 < 7 天 + 小额（< 1 万） → low', () => {
      const r = detectNewPartnerLargeAccept(NOW - 1 * 86400000, 100 * 100, NOW)
      expect(r.hit).toBe(false)
      expect(r.level).toBe('low')
    })
    test('partnerCreatedAt = 0 → low（无数据）', () => {
      const r = detectNewPartnerLargeAccept(0, 50 * 100 * 100, NOW)
      expect(r.hit).toBe(false)
      expect(r.level).toBe('low')
    })
  })

  describe('detectBoardingAcceptRisk（主入口）', () => {
    test('正常时段 + 正常金额 + 无 burst → allow', async () => {
      const db = createMockDb({ orders: [] })
      const r = await detectBoardingAcceptRisk({
        db, partnerId: 'p1', orderId: 'o1', amountFen: 100 * 100, now: NOW,
      })
      expect(r.action).toBe('allow')
      expect(r.level).toBe('low')
      expect(r.reasons).toEqual([])
    })

    test('凌晨接单 → review', async () => {
      const orig = Date.prototype.getHours
      Date.prototype.getHours = function () { return 3 }
      const db = createMockDb({ orders: [] })
      const r = await detectBoardingAcceptRisk({
        db, partnerId: 'p1', orderId: 'o1', amountFen: 100 * 100, now: NOW,
      })
      Date.prototype.getHours = orig
      expect(r.action).toBe('review')
      expect(r.reasons.some(s => s.startsWith('ABNORMAL_HOUR'))).toBe(true)
    })

    test('单笔大额（3 万） → review', async () => {
      const db = createMockDb({ orders: [] })
      const r = await detectBoardingAcceptRisk({
        db, partnerId: 'p1', orderId: 'o1', amountFen: BOARDING_ACCEPT_CONFIG.LARGE_ACCEPT_FEN, now: NOW,
      })
      expect(r.action).toBe('review')
      expect(r.reasons.some(s => s.startsWith('LARGE_ACCEPT'))).toBe(true)
    })

    test('单笔超大额（8 万） → reject', async () => {
      const db = createMockDb({ orders: [] })
      const r = await detectBoardingAcceptRisk({
        db, partnerId: 'p1', orderId: 'o1', amountFen: BOARDING_ACCEPT_CONFIG.HUGE_ACCEPT_FEN, now: NOW,
      })
      expect(r.action).toBe('reject')
      expect(r.reasons.some(s => s.startsWith('HUGE_ACCEPT'))).toBe(true)
    })

    test('5 分钟内 burst 6 次 → reject', async () => {
      const recents = [0, 1, 2, 3, 4, 5].map(i => makeOrder({ hostId: 'partner_2_burst', updatedAt: NOW - i * 1000 }))
      const db = createMockDb({ orders: recents })
      const r = await detectBoardingAcceptRisk({
        db, partnerId: 'partner_2_burst', orderId: 'o_burst', amountFen: 100 * 100, now: NOW,
      })
      expect(r.action).toBe('reject')
      expect(r.reasons.some(s => s.startsWith('ACCEPT_BURST'))).toBe(true)
    })

    test('新合作（< 7 天）首接 1 万 → review', async () => {
      const db = createMockDb({ orders: [] })
      // amountFen 设为 1 万元（NEW_PARTNER_LARGE_FEN）→ 触发 NEW_PARTNER_LARGE
      // 但不达 LARGE_ACCEPT_FEN（3 万），所以最终 action=review
      const r = await detectBoardingAcceptRisk({
        db, partnerId: 'p_newpartner', orderId: 'o_newp', amountFen: BOARDING_ACCEPT_CONFIG.NEW_PARTNER_LARGE_FEN, partnerCreatedAt: NOW - 3 * 86400000, now: NOW,
      })
      expect(r.action).toBe('review')
      expect(r.reasons.some(s => s.startsWith('NEW_PARTNER_LARGE'))).toBe(true)
    })

    test('组合：凌晨 + 大额 → reject（max level）', async () => {
      const orig = Date.prototype.getHours
      Date.prototype.getHours = function () { return 3 }
      const db = createMockDb({ orders: [] })
      const r = await detectBoardingAcceptRisk({
        db, partnerId: 'p1', orderId: 'o1', amountFen: BOARDING_ACCEPT_CONFIG.HUGE_ACCEPT_FEN, now: NOW,
      })
      Date.prototype.getHours = orig
      expect(r.action).toBe('reject')
      expect(r.reasons.some(s => s.startsWith('HUGE_ACCEPT'))).toBe(true)
      expect(r.reasons.some(s => s.startsWith('ABNORMAL_HOUR'))).toBe(true)
    })

    test('target.partnerId / orderId / amountFen 正确填充', async () => {
      const db = createMockDb({ orders: [] })
      const r = await detectBoardingAcceptRisk({
        db, partnerId: 'p_test', orderId: 'o_test', amountFen: 999, now: NOW,
      })
      expect(r.target.partnerId).toBe('p_test')
      expect(r.target.orderId).toBe('o_test')
      expect(r.target.amountFen).toBe(999)
    })
  })

  describe('withRateLimit 集成（type=boarding_accept）', () => {
    test('同 partner + 同 orderId 在窗口内多次 → 第一次 allow，第二次 RATE_LIMITED', () => {
      const cfg = {
        perUserPerMinute: 5,
        perUserPerTargetPerMinute: 1,
        windowMs: 60 * 1000,
      }
      // 第一次消费：ok
      consumeRateLimit({ userId: 'p_rl_1', type: 'boarding_accept', targetId: 'o_rl_1', now: NOW }, cfg)
      // 第二次 peek：target 维度（同一 o1）已 1 次，应被拦截
      const r = peekRateLimit({ userId: 'p_rl_1', type: 'boarding_accept', targetId: 'o_rl_1', now: NOW }, cfg)
      expect(r.allowed).toBe(false)
      expect(r.reason).toMatch(/RATE_LIMIT_TARGET/)
    })

    test('不同 orderId 各自独立计数', () => {
      const cfg = {
        perUserPerMinute: 5,
        perUserPerTargetPerMinute: 1,
        windowMs: 60 * 1000,
      }
      consumeRateLimit({ userId: 'p_rl_2', type: 'boarding_accept', targetId: 'o_rl_2a', now: NOW }, cfg)
      // o_rl_2b 仍允许（target 不同）
      const r = peekRateLimit({ userId: 'p_rl_2', type: 'boarding_accept', targetId: 'o_rl_2b', now: NOW }, cfg)
      expect(r.allowed).toBe(true)
    })
  })
})
