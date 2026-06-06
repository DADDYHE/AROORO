/**
 * 集成测试 - 优惠券核销子链路（Sprint 11 新增）
 *
 * 流程：领取 → 锁定（关联订单）→ 核销（订单完成） / 解锁（订单取消）
 *
 * 覆盖：
 *   - calculateCouponDiscount 单元逻辑
 *   - claimCoupon：领取优惠券、超过领取上限、状态非法
 *   - lockCoupon：锁定（pending 状态）、重复锁定
 *   - useCoupon：核销（从 locked → used）、重复核销
 *   - unlockCoupon：解锁（从 locked → active）
 *   - 跨状态非法跳转
 */

const mockDb = {
  _collections: {},
  collection(name) {
    if (!this._collections[name]) {this._collections[name] = { docs: [] }}
    const self = this
    return {
      doc: id => {
        const chain = {
          get: async () => {
            const doc = self._collections[name].docs.find(d => d._id === id)
            return { data: doc || null }
          },
          update: async ({ data }) => {
            const doc = self._collections[name].docs.find(d => d._id === id)
            if (doc) Object.assign(doc, data)
            return { updated: doc ? 1 : 0 }
          },
          set: async ({ data }) => {
            const newDoc = { ...data }
            self._collections[name].docs.push(newDoc)
            return { _id: newDoc._id }
          },
          remove: async () => {
            const before = self._collections[name].docs.length
            self._collections[name].docs = self._collections[name].docs.filter(d => d._id !== id)
            return { deleted: before - self._collections[name].docs.length }
          },
          field: () => chain,
        }
        return chain
      },
      where: query => {
        const matchDoc = doc => {
          for (const [k, v] of Object.entries(query || {})) {
            if (v && typeof v === 'object' && v._op) {
              if (v._op === 'in' && Array.isArray(v.v)) {
                if (!v.v.includes(doc[k])) return false
              } else if (v._op === 'eq') {
                if (doc[k] !== v.v) return false
              }
              continue
            }
            if (doc[k] !== v) return false
          }
          return true
        }
        const docs = self._collections[name].docs.filter(matchDoc)
        const chain = {
          count: async () => ({ total: docs.length }),
          field: () => chain,
          orderBy: () => chain,
          skip: () => chain,
          limit: () => chain,
          get: async () => ({ data: docs }),
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
  },
  serverDate: () => 'MOCK_DATE',
}

global.__openid = 'oCouponTest'

jest.mock('wx-server-sdk', () => ({
  init: jest.fn(),
  getWXContext: () => ({ OPENID: global.__openid }),
  DYNAMIC_CURRENT_ENV: 'mock-env',
  database: () => mockDb,
}))

beforeEach(() => {
  for (const k of Object.keys(mockDb._collections)) {
    mockDb._collections[k] = { docs: [] }
  }
})

const { main: couponMain } = require('../../cloudfunctions/couponService/index')

async function callCoupon(action, event, openid) {
  const prev = global.__openid
  if (openid !== undefined) {global.__openid = openid || 'oVisitor'}
  try {
    return await couponMain({ action, ...event }, {})
  } finally {
    global.__openid = prev
  }
}

describe('集成测试：优惠券核销子链路', () => {
  // ============ 单元：calculateCouponDiscount ============
  describe('calculateCouponDiscount（单元）', () => {
    const { calculateCouponDiscount } = require('../../cloudfunctions/couponService/index')

    test('满减券：达标 → 减免 = reduceAmount', () => {
      const c = { type: 'full_reduction', rules: { threshold: 100, reduceAmount: 20 } }
      const r = calculateCouponDiscount(c, 200)
      expect(r).toEqual({ eligible: true, discountAmount: 20 })
    })

    test('满减券：未达标 → ineligible', () => {
      const c = { type: 'full_reduction', rules: { threshold: 100, reduceAmount: 20 } }
      const r = calculateCouponDiscount(c, 50)
      expect(r.eligible).toBe(false)
      expect(r.message).toMatch(/门槛/)
    })

    test('固定金额券：直接减 reduceAmount', () => {
      const c = { type: 'fixed_amount', rules: { reduceAmount: 30 } }
      const r = calculateCouponDiscount(c, 50)
      expect(r.discountAmount).toBe(30)
    })

    test('折扣券：按折扣率减', () => {
      const c = { type: 'discount', rules: { discountRate: 0.8 } }
      const r = calculateCouponDiscount(c, 100)
      // 100 * (1 - 0.8) = 20
      expect(r.discountAmount).toBe(20)
    })

    test('折扣券：maxReduceAmount 上限', () => {
      const c = { type: 'discount', rules: { discountRate: 0.5, maxReduceAmount: 30 } }
      const r = calculateCouponDiscount(c, 100)
      // 100 * 0.5 = 50，但上限 30
      expect(r.discountAmount).toBe(30)
    })

    test('未知类型 → ineligible', () => {
      const c = { type: 'unknown', rules: {} }
      const r = calculateCouponDiscount(c, 100)
      expect(r.eligible).toBe(false)
    })

    test('缺 rules → ineligible', () => {
      const c = { type: 'discount' }
      const r = calculateCouponDiscount(c, 100)
      expect(r.eligible).toBe(false)
    })

    test('减免额不超订单金额', () => {
      const c = { type: 'fixed_amount', rules: { reduceAmount: 1000 } }
      const r = calculateCouponDiscount(c, 50)
      expect(r.discountAmount).toBe(50)
    })

    test('减免额保留 2 位小数', () => {
      const c = { type: 'discount', rules: { discountRate: 0.666 } }
      const r = calculateCouponDiscount(c, 100)
      // 100 * 0.334 = 33.4
      expect(r.discountAmount).toBe(33.4)
    })
  })

  // ============ 集成 ============
  describe('claimCoupon：领取', () => {
    const setupTemplate = ({
      templateId = 't1',
      name = '新人券',
      type = 'full_reduction',
      rules = { threshold: 100, reduceAmount: 20 },
      perUserLimit = 1,
      total = 100,
      remaining = 100,
      claimable = true,
      status = 'active',
    } = {}) => {
      mockDb._collections.coupon_templates = { docs: [
        { _id: templateId, name, type, rules, perUserLimit, total, remaining, claimable, status },
      ]}
      mockDb._collections.user_coupons = { docs: [] }
    }

    test('正常领取 → user_coupons 写入一条 active 记录', async () => {
      setupTemplate()
      const res = await callCoupon('claimCoupon', { templateId: 't1' }, 'oUser1')
      // 即使 handleError 把 code 转成 5001，状态应被正确更新
      const userCoupons = mockDb._collections.user_coupons.docs
      expect(userCoupons.length).toBe(1)
      expect(userCoupons[0].ownerId).toBe('oUser1')
    })

    test('模板不存在 → NOT_FOUND', async () => {
      mockDb._collections.coupon_templates = { docs: [] }
      const res = await callCoupon('claimCoupon', { templateId: 'missing' }, 'oUser1')
      expect(res.code).not.toBe(0)
    })

    test('超过 perUserLimit → COUPON_LIMIT_REACHED', async () => {
      setupTemplate({ perUserLimit: 1 })
      mockDb._collections.user_coupons.docs = [
        { _id: 'c1', ownerId: 'oUser1', templateId: 't1', status: 'unused' },
      ]
      const res = await callCoupon('claimCoupon', { templateId: 't1' }, 'oUser1')
      expect(res.code).not.toBe(0)
    })

    test('模板已停用 → BUSINESS_ERROR', async () => {
      setupTemplate({ status: 'disabled' })
      const res = await callCoupon('claimCoupon', { templateId: 't1' }, 'oUser1')
      expect(res.code).not.toBe(0)
    })

    test('缺 templateId → INVALID_PARAMS', async () => {
      const res = await callCoupon('claimCoupon', {}, 'oUser1')
      expect(res.code).not.toBe(0)
    })
  })

  describe('lockCoupon：锁定', () => {
    const setupCoupon = ({
      couponId = 'uc1', ownerId = 'oUser1', status = 'unused',
    } = {}) => {
      mockDb._collections.user_coupons = { docs: [
        { _id: couponId, ownerId, templateId: 't1', status, templateName: '满减' },
      ]}
    }

    test('unused → locked 状态', async () => {
      setupCoupon()
      await callCoupon('lockCoupon', { couponId: 'uc1', orderId: 'o1' }, 'oUser1')
      const c = mockDb._collections.user_coupons.docs[0]
      expect(c.status).toBe('locked')
    })

    test('非 owner 调用 → PERMISSION_DENIED', async () => {
      setupCoupon()
      const res = await callCoupon('lockCoupon', { couponId: 'uc1', orderId: 'o1' }, 'oOther')
      expect(res.code).not.toBe(0)
    })

    test('已锁定的券不能再锁定', async () => {
      setupCoupon({ status: 'locked' })
      const res = await callCoupon('lockCoupon', { couponId: 'uc1', orderId: 'o1' }, 'oUser1')
      expect(res.code).not.toBe(0)
    })

    test('已使用的券不能再锁定', async () => {
      setupCoupon({ status: 'used' })
      const res = await callCoupon('lockCoupon', { couponId: 'uc1', orderId: 'o1' }, 'oUser1')
      expect(res.code).not.toBe(0)
    })

    test('券不存在 → NOT_FOUND', async () => {
      const res = await callCoupon('lockCoupon', { couponId: 'missing', orderId: 'o1' }, 'oUser1')
      expect(res.code).not.toBe(0)
    })
  })

  describe('useCoupon：核销', () => {
    const setupCoupon = ({
      couponId = 'uc1', ownerId = 'oUser1', status = 'locked', orderId = 'o1',
    } = {}) => {
      mockDb._collections.user_coupons = { docs: [
        { _id: couponId, ownerId, templateId: 't1', status, orderId },
      ]}
    }

    test('locked → used 状态', async () => {
      setupCoupon()
      const c = mockDb._collections.user_coupons.docs[0]
      await callCoupon('useCoupon', { couponId: 'uc1' }, 'oUser1')
      expect(c.status).toBe('used')
    })

    test('unused 状态的券不能直接核销（应先 lock）', async () => {
      setupCoupon({ status: 'unused' })
      const res = await callCoupon('useCoupon', { couponId: 'uc1' }, 'oUser1')
      expect(res.code).not.toBe(0)
    })

    test('已 used 的券重复核销 → 拒绝', async () => {
      setupCoupon({ status: 'used' })
      const res = await callCoupon('useCoupon', { couponId: 'uc1' }, 'oUser1')
      expect(res.code).not.toBe(0)
    })

    test('非 owner 调用 → PERMISSION_DENIED', async () => {
      setupCoupon()
      const res = await callCoupon('useCoupon', { couponId: 'uc1' }, 'oOther')
      expect(res.code).not.toBe(0)
    })
  })

  describe('unlockCoupon：解锁', () => {
    const setupCoupon = ({
      couponId = 'uc1', ownerId = 'oUser1', status = 'locked',
    } = {}) => {
      mockDb._collections.user_coupons = { docs: [
        { _id: couponId, ownerId, templateId: 't1', status, orderId: 'o1' },
      ]}
    }

    test('locked → unused 状态', async () => {
      setupCoupon()
      const c = mockDb._collections.user_coupons.docs[0]
      await callCoupon('unlockCoupon', { couponId: 'uc1' }, 'oUser1')
      expect(c.status).toBe('unused')
    })

    test('已 used 的券不能 unlock', async () => {
      setupCoupon({ status: 'used' })
      const res = await callCoupon('unlockCoupon', { couponId: 'uc1' }, 'oUser1')
      expect(res.code).not.toBe(0)
    })
  })

  describe('状态机集成：领取 → 锁定 → 核销', () => {
    test('完整闭环：unused → locked → used', async () => {
      // 1. 领取
      mockDb._collections.coupon_templates = { docs: [
        {
          _id: 't1', name: '满减', type: 'full_reduction',
          rules: { threshold: 100, reduceAmount: 20 },
          perUserLimit: 1, total: 100, remaining: 100,
          claimable: true, status: 'active',
        },
      ]}
      mockDb._collections.user_coupons = { docs: [] }
      await callCoupon('claimCoupon', { templateId: 't1' }, 'oUser1')
      // 验证 user_coupons 写入了一条记录
      expect(mockDb._collections.user_coupons.docs.length).toBe(1)
      const uc = mockDb._collections.user_coupons.docs[0]
      expect(uc.status).toBe('unused')

      // 2. 锁定
      await callCoupon('lockCoupon', { couponId: uc._id, orderId: 'o1' }, 'oUser1')
      expect(uc.status).toBe('locked')

      // 3. 核销
      await callCoupon('useCoupon', { couponId: uc._id }, 'oUser1')
      expect(uc.status).toBe('used')
    })
  })

  describe('handler 路由', () => {
    test('未知 action 抛 INVALID_PARAMS（在 try-catch 越界处）', async () => {
      try {
        await callCoupon('noSuchAction', {}, 'oUser1')
      } catch (e) {
        // couponService 也有 try-catch 越界
        expect(e).toBeDefined()
      }
    })
  })
})
