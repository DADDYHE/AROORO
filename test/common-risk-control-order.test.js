/**
 * Sprint 22：大额下单 / 活动报名 / 商城下单 风控
 *   cloudfunctions/common/risk-control.js 新增函数单元测试
 *
 * 覆盖：
 *   - detectLargeAmount 阈值边界
 *   - detectNewUserLargeAmount 新用户窗口
 *   - detectOrderRisk 主入口：单笔大额 / 短期高频 / 日累计 / 新用户大额
 *   - detectMallOrderRisk / detectActivityApplyRisk 类型注入
 *   - mapActionToErrorCode 映射
 */

const {
  detectLargeAmount,
  detectNewUserLargeAmount,
  detectOrderRisk,
  detectMallOrderRisk,
  detectActivityApplyRisk,
  mapActionToErrorCode,
  ORDER_RISK_CONFIG,
} = require('../cloudfunctions/common/risk-control')

// ============ In-memory db mock ============
function createMockDb({ orders = [], users = {} } = {}) {
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
      if (name === 'users') {
        return {
          doc(uid) {
            return {
              get: async () => ({ data: users[uid] || null }),
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

const NOW = new Date('2026-06-04T12:00:00Z').getTime()

const makeOrder = (overrides = {}) => ({
  _id: `o_${Math.random().toString(36).slice(2, 8)}`,
  ownerId: 'u1',
  totalAmount: 1000,
  totalPrice: 1000,
  basicPrice: 1000,
  createdAt: NOW - 60 * 1000,
  ...overrides,
})

describe('risk-control.js (Sprint 22 大额风控)', () => {
  describe('detectLargeAmount', () => {
    test('小于阈值 → low', () => {
      const r = detectLargeAmount(100 * 100) // 100 元
      expect(r.hit).toBe(false)
      expect(r.level).toBe('low')
    })
    test('等于 LARGE_AMOUNT_FEN → medium', () => {
      const r = detectLargeAmount(ORDER_RISK_CONFIG.LARGE_AMOUNT_FEN)
      expect(r.hit).toBe(true)
      expect(r.level).toBe('medium')
    })
    test('介于 LARGE 和 HUGE 之间 → medium', () => {
      const r = detectLargeAmount(ORDER_RISK_CONFIG.LARGE_AMOUNT_FEN + 1000)
      expect(r.hit).toBe(true)
      expect(r.level).toBe('medium')
    })
    test('等于 HUGE_AMOUNT_FEN → high', () => {
      const r = detectLargeAmount(ORDER_RISK_CONFIG.HUGE_AMOUNT_FEN)
      expect(r.hit).toBe(true)
      expect(r.level).toBe('high')
    })
    test('负数/非法输入 → 0 / low', () => {
      const r = detectLargeAmount(-100)
      expect(r.amount).toBe(0)
      expect(r.hit).toBe(false)
    })
  })

  describe('detectNewUserLargeAmount', () => {
    test('注册 > 7 天 → 不触发', () => {
      const r = detectNewUserLargeAmount(NOW - 10 * 24 * 60 * 60 * 1000, 100 * 100 * 100, NOW)
      expect(r.hit).toBe(false)
    })
    test('注册 < 7 天 + 大额 → medium', () => {
      const r = detectNewUserLargeAmount(NOW - 2 * 24 * 60 * 60 * 1000, ORDER_RISK_CONFIG.NEW_USER_LARGE_FEN, NOW)
      expect(r.hit).toBe(true)
      expect(r.level).toBe('medium')
    })
    test('注册 < 7 天 + 小额 → 不触发', () => {
      const r = detectNewUserLargeAmount(NOW - 1 * 24 * 60 * 60 * 1000, 100, NOW)
      expect(r.hit).toBe(false)
    })
    test('userCreatedAt=0 → 不触发', () => {
      const r = detectNewUserLargeAmount(0, 999 * 100 * 100, NOW)
      expect(r.hit).toBe(false)
    })
  })

  describe('detectOrderRisk', () => {
    test('小金额 + 无历史 → allow', async () => {
      const db = createMockDb()
      const r = await detectOrderRisk({ db, userId: 'u1', amountFen: 100, type: 'mall_order' })
      expect(r.action).toBe('allow')
      expect(r.level).toBe('low')
      expect(r.reasons).toEqual([])
    })

    test('单笔 5 万 → review (medium)', async () => {
      const db = createMockDb()
      const r = await detectOrderRisk({
        db, userId: 'u1', amountFen: ORDER_RISK_CONFIG.LARGE_AMOUNT_FEN, type: 'mall_order',
      })
      expect(r.action).toBe('review')
      expect(r.level).toBe('medium')
      expect(r.reasons.some(s => s.startsWith('LARGE_AMOUNT'))).toBe(true)
      expect(r.details.largeAmount).toBeDefined()
    })

    test('单笔 10 万 → reject (high)', async () => {
      const db = createMockDb()
      const r = await detectOrderRisk({
        db, userId: 'u1', amountFen: ORDER_RISK_CONFIG.HUGE_AMOUNT_FEN, type: 'mall_order',
      })
      expect(r.action).toBe('reject')
      expect(r.level).toBe('high')
      expect(r.reasons.some(s => s.startsWith('HUGE_AMOUNT'))).toBe(true)
    })

    test('短期高频 → review', async () => {
      const orders = Array.from({ length: ORDER_RISK_CONFIG.SHORT_WINDOW_ORDERS }, () =>
        makeOrder({ ownerId: 'u1', totalAmount: 100, createdAt: NOW - 60 * 1000 })
      )
      const db = createMockDb({ orders })
      const r = await detectOrderRisk({ db, userId: 'u1', amountFen: 100, type: 'mall_order', now: NOW })
      expect(r.action).toBe('review')
      expect(r.reasons.some(s => s.startsWith('SHORT_BURST'))).toBe(true)
    })

    test('单日累计 10 万+ → review', async () => {
      const orders = Array.from({ length: 100 }, () =>
        makeOrder({ ownerId: 'u1', totalAmount: ORDER_RISK_CONFIG.DAILY_AMOUNT_FEN / 100, createdAt: NOW - 60 * 1000 })
      )
      const db = createMockDb({ orders })
      const r = await detectOrderRisk({ db, userId: 'u1', amountFen: 100, type: 'mall_order', now: NOW })
      expect(r.action).toBe('review')
      expect(r.reasons.some(s => s.startsWith('DAILY_TOTAL'))).toBe(true)
    })

    test('新用户大额 → review', async () => {
      const db = createMockDb({
        users: {
          u1: { _id: 'u1', createdAt: NOW - 2 * 24 * 60 * 60 * 1000 },
        },
      })
      const r = await detectOrderRisk({
        db, userId: 'u1', amountFen: ORDER_RISK_CONFIG.NEW_USER_LARGE_FEN + 1000, type: 'mall_order',
      })
      expect(r.reasons.some(s => s.startsWith('NEW_USER_LARGE'))).toBe(true)
    })

    test('超大额 + 短期高频 → reject (取最大)', async () => {
      const orders = Array.from({ length: 10 }, () =>
        makeOrder({ ownerId: 'u1', totalAmount: 100, createdAt: NOW - 60 * 1000 })
      )
      const db = createMockDb({ orders })
      const r = await detectOrderRisk({
        db, userId: 'u1', amountFen: ORDER_RISK_CONFIG.HUGE_AMOUNT_FEN + 1000, type: 'mall_order',
      })
      expect(r.action).toBe('reject')
      expect(r.level).toBe('high')
    })

    test('db 异常 → 降级为 allow（best-effort）', async () => {
      // 用户记录缺失 + 订单集合异常
      const brokenDb = {
        collection(name) {
          if (name === 'users') {
            return { doc: () => ({ get: async () => { throw new Error('users-fail') } }) }
          }
          if (name === 'orders') {
            return {
              where: () => ({
                limit: () => ({
                  get: async () => { throw new Error('orders-fail') },
                }),
              }),
            }
          }
          return null
        },
      }
      const r = await detectOrderRisk({ db: brokenDb, userId: 'u1', amountFen: 100, type: 'mall_order' })
      // 单笔 100 元不触发，db 异常被吞掉
      expect(r.action).toBe('allow')
      expect(r.level).toBe('low')
    })
  })

  describe('detectMallOrderRisk / detectActivityApplyRisk', () => {
    test('detectMallOrderRisk 应注入 type=mall_order', async () => {
      const db = createMockDb()
      const r = await detectMallOrderRisk({ db, userId: 'u1', amountFen: 100 })
      expect(r.target.type).toBe('mall_order')
    })
    test('detectActivityApplyRisk 应注入 type=activity_apply', async () => {
      const db = createMockDb()
      const r = await detectActivityApplyRisk({ db, userId: 'u1', amountFen: 100, targetId: 'a1' })
      expect(r.target.type).toBe('activity_apply')
      expect(r.target.targetId).toBe('a1')
    })
  })

  describe('mapActionToErrorCode 兼容', () => {
    test('reject → RISK_REJECT', () => {
      expect(mapActionToErrorCode('reject')).toBe('RISK_REJECT')
    })
    test('review → RISK_PENDING', () => {
      expect(mapActionToErrorCode('review')).toBe('RISK_PENDING')
    })
    test('allow / 其它 → RISK_PASS', () => {
      expect(mapActionToErrorCode('allow')).toBe('RISK_PASS')
      expect(mapActionToErrorCode(null)).toBe('RISK_PASS')
    })
  })
})
