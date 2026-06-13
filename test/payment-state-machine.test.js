/**
 * paymentService/common/payment-state-machine.js 测试
 *
 * 覆盖：
 *   1. 支付状态机的转移合法性
 *   2. ORDER_STATUS_ON_PAID 映射
 *   3. resolveOrderStatus 兜底
 *   4. isKnownOrderType
 */
const {
  paymentStateMachine,
  resolveOrderStatus,
  isKnownOrderType,
  ORDER_STATUS_ON_PAID,
} = require('../cloudfunctions/paymentService/common/payment-state-machine')

describe('paymentService/common/payment-state-machine', () => {
  describe('paymentStateMachine', () => {
    test('initial 应为 unpaid', () => {
      expect(paymentStateMachine.initial).toBe('unpaid')
    })

    test('应包含 5 个状态', () => {
      expect(paymentStateMachine.states.sort()).toEqual(
        ['closed', 'paid', 'paying', 'refunded', 'unpaid']
      )
    })

    test('unpaid → paying 应合法', () => {
      expect(paymentStateMachine.canTransition('unpaid', 'paying')).toBe(true)
    })

    test('unpaid → paid 应合法（回调早于预支付记录的场景）', () => {
      expect(paymentStateMachine.canTransition('unpaid', 'paid')).toBe(true)
    })

    test('unpaid → refunded 应非法', () => {
      expect(paymentStateMachine.canTransition('unpaid', 'refunded')).toBe(false)
    })

    test('paying → paid 应合法', () => {
      expect(paymentStateMachine.canTransition('paying', 'paid')).toBe(true)
    })

    test('paying → unpaid 应合法（支付失败回退）', () => {
      expect(paymentStateMachine.canTransition('paying', 'unpaid')).toBe(true)
    })

    test('paid → refunded 应合法', () => {
      expect(paymentStateMachine.canTransition('paid', 'refunded')).toBe(true)
    })

    test('refunded 终态不能再转移', () => {
      expect(paymentStateMachine.isTerminal('refunded')).toBe(true)
      expect(paymentStateMachine.nextStates('refunded')).toEqual([])
    })

    test('closed 终态不能再转移', () => {
      expect(paymentStateMachine.isTerminal('closed')).toBe(true)
    })

    test('paid → paid 非法（防止重复确认）', () => {
      expect(paymentStateMachine.canTransition('paid', 'paid')).toBe(false)
    })

    test('非法状态应抛 IllegalTransitionError', () => {
      expect(() => paymentStateMachine.assertTransition('refunded', 'paid')).toThrow()
    })

    test('metadata 应包含 5 个状态', () => {
      const meta = ['unpaid', 'paying', 'paid', 'refunded', 'closed']
      for (const s of meta) {
        expect(paymentStateMachine.getMetadata(s)).toBeDefined()
        expect(paymentStateMachine.getMetadata(s).label).toBeDefined()
        // 颜色值可能是 3/6/8 位 hex（带 alpha）
        expect(paymentStateMachine.getMetadata(s).color).toMatch(/^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/)
      }
    })
  })

  describe('ORDER_STATUS_ON_PAID 映射', () => {
    test('应包含 5 个订单类型', () => {
      expect(Object.keys(ORDER_STATUS_ON_PAID).sort()).toEqual(
        ['activity', 'feeding', 'mall', 'order', 'tuan']
      )
    })

    test('order / mall / tuan 支付成功应进入 paid', () => {
      expect(ORDER_STATUS_ON_PAID.order).toBe('paid')
      expect(ORDER_STATUS_ON_PAID.mall).toBe('paid')
      expect(ORDER_STATUS_ON_PAID.tuan).toBe('paid')
    })

    test('feeding / activity 支付成功应进入 confirmed', () => {
      expect(ORDER_STATUS_ON_PAID.feeding).toBe('confirmed')
      expect(ORDER_STATUS_ON_PAID.activity).toBe('confirmed')
    })
  })

  describe('resolveOrderStatus', () => {
    test('已知类型应返回正确 status', () => {
      expect(resolveOrderStatus('order')).toBe('paid')
      expect(resolveOrderStatus('mall')).toBe('paid')
      expect(resolveOrderStatus('tuan')).toBe('paid')
      expect(resolveOrderStatus('feeding')).toBe('confirmed')
      expect(resolveOrderStatus('activity')).toBe('confirmed')
    })

    test('未知类型应返回兜底值', () => {
      expect(resolveOrderStatus('unknown')).toBe('paid')
      expect(resolveOrderStatus('unknown', 'custom-fallback')).toBe('custom-fallback')
    })

    test('undefined / null 应返回兜底值', () => {
      expect(resolveOrderStatus(undefined)).toBe('paid')
      expect(resolveOrderStatus(null)).toBe('paid')
    })
  })

  describe('isKnownOrderType', () => {
    test('已知类型应返回 true', () => {
      expect(isKnownOrderType('order')).toBe(true)
      expect(isKnownOrderType('mall')).toBe(true)
      expect(isKnownOrderType('tuan')).toBe(true)
      expect(isKnownOrderType('feeding')).toBe(true)
      expect(isKnownOrderType('activity')).toBe(true)
    })

    test('未知类型应返回 false', () => {
      expect(isKnownOrderType('unknown')).toBe(false)
      expect(isKnownOrderType('')).toBe(false)
      expect(isKnownOrderType(null)).toBe(false)
    })
  })

  describe('集成场景：支付回调', () => {
    test('order 类型 + paymentStatus paying → paid + status paid', () => {
      const from = 'paying'
      const orderType = 'order'
      expect(paymentStateMachine.canTransition(from, 'paid')).toBe(true)
      expect(resolveOrderStatus(orderType)).toBe('paid')
    })

    test('feeding 类型 + paymentStatus unpaid → paid + status confirmed', () => {
      const from = 'unpaid'
      const orderType = 'feeding'
      expect(paymentStateMachine.canTransition(from, 'paid')).toBe(true)
      expect(resolveOrderStatus(orderType)).toBe('confirmed')
    })

    test('已 refund 的订单再次回调应被状态机拦截', () => {
      const from = 'refunded'
      const orderType = 'order'
      expect(paymentStateMachine.canTransition(from, 'paid')).toBe(false)
    })

    test('已 closed 的订单再次回调应被状态机拦截', () => {
      const from = 'closed'
      expect(paymentStateMachine.canTransition(from, 'paid')).toBe(false)
    })
  })
})
