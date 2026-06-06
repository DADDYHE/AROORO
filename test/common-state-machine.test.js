/**
 * cloudfunctions/common/state-machine.js 单元测试
 */

const {
  createStateMachine,
  validateConfig,
  applyEvent,
  IllegalTransitionError,
} = require('../cloudfunctions/common/state-machine')
const { BusinessError } = require('../cloudfunctions/common/errors')

describe('state-machine.js', () => {
  describe('validateConfig', () => {
    test('合法配置应通过', () => {
      expect(() => validateConfig({
        initial: 'a',
        states: ['a', 'b'],
        transitions: { a: ['b'], b: [] },
      })).not.toThrow()
    })

    test('缺少 initial 应抛错', () => {
      expect(() => validateConfig({ states: ['a'], transitions: {} })).toThrow(BusinessError)
    })

    test('initial 不在 states 中应抛错', () => {
      expect(() => validateConfig({
        initial: 'x',
        states: ['a', 'b'],
        transitions: { a: [], b: [] },
      })).toThrow(BusinessError)
    })

    test('transitions 源状态未声明应抛错', () => {
      expect(() => validateConfig({
        initial: 'a',
        states: ['a'],
        transitions: { a: [], b: [] },
      })).toThrow(BusinessError)
    })

    test('transitions 目标未声明应抛错', () => {
      expect(() => validateConfig({
        initial: 'a',
        states: ['a', 'b'],
        transitions: { a: ['b', 'c'] },
      })).toThrow(BusinessError)
    })

    test('null / 非对象应抛错', () => {
      expect(() => validateConfig(null)).toThrow(BusinessError)
      expect(() => validateConfig('x')).toThrow(BusinessError)
    })
  })

  describe('createStateMachine', () => {
    const sm = createStateMachine({
      initial: 'pending',
      states: ['pending', 'paid', 'shipped', 'completed', 'cancelled'],
      transitions: {
        pending: ['paid', 'cancelled'],
        paid: ['shipped', 'cancelled'],
        shipped: ['completed'],
        completed: [],
        cancelled: [],
      },
    })

    test('should expose states / transitions', () => {
      expect(sm.states).toContain('pending')
      expect(sm.transitions.pending).toEqual(['paid', 'cancelled'])
    })

    test('isValidState', () => {
      expect(sm.isValidState('pending')).toBe(true)
      expect(sm.isValidState('unknown')).toBe(false)
    })

    test('canTransition 合法', () => {
      expect(sm.canTransition('pending', 'paid')).toBe(true)
    })

    test('canTransition 非法', () => {
      expect(sm.canTransition('pending', 'shipped')).toBe(false)
    })

    test('canTransition 跨未知状态', () => {
      expect(sm.canTransition('xx', 'pending')).toBe(false)
    })

    test('assertTransition 合法不应抛错', () => {
      expect(() => sm.assertTransition('pending', 'paid')).not.toThrow()
    })

    test('assertTransition 非法应抛 IllegalTransitionError', () => {
      expect(() => sm.assertTransition('pending', 'shipped')).toThrow(IllegalTransitionError)
    })

    test('assertTransition 异常应携带 from/to/allowed', () => {
      try {
        sm.assertTransition('pending', 'shipped')
        throw new Error('should not reach')
      } catch (e) {
        expect(e.from).toBe('pending')
        expect(e.to).toBe('shipped')
        expect(e.allowed).toEqual(['paid', 'cancelled'])
      }
    })

    test('nextStates 应返回数组副本', () => {
      const ns = sm.nextStates('pending')
      expect(ns).toEqual(['paid', 'cancelled'])
      ns.push('mutated')
      expect(sm.nextStates('pending')).toEqual(['paid', 'cancelled']) // 不影响内部
    })

    test('isTerminal', () => {
      expect(sm.isTerminal('completed')).toBe(true)
      expect(sm.isTerminal('cancelled')).toBe(true)
      expect(sm.isTerminal('pending')).toBe(false)
      expect(sm.isTerminal('unknown')).toBe(false)
    })

    test('getMetadata 返回元数据', () => {
      const sm2 = createStateMachine({
        initial: 'a', states: ['a', 'b'],
        transitions: { a: ['b'], b: [] },
        metadata: { a: { label: '开始' }, b: { label: '结束' } },
      })
      expect(sm2.getMetadata('a')).toEqual({ label: '开始' })
      expect(sm2.getMetadata('b')).toEqual({ label: '结束' })
      expect(sm2.getMetadata('c')).toBeNull()
    })
  })

  describe('applyEvent', () => {
    const sm = createStateMachine({
      initial: 'pending',
      states: ['pending', 'confirmed', 'cancelled'],
      transitions: { pending: ['confirmed', 'cancelled'], confirmed: [], cancelled: [] },
    })

    test('合法事件应返回目标', () => {
      expect(applyEvent(sm, 'pending', 'confirmed', {})).toBe('confirmed')
    })

    test('非法事件应返回 null', () => {
      expect(applyEvent(sm, 'pending', 'unknown', {})).toBeNull()
      expect(applyEvent(sm, 'confirmed', 'pending', {})).toBeNull()
    })
  })

  describe('IllegalTransitionError', () => {
    test('应继承 Error 并携带字段', () => {
      const e = new IllegalTransitionError('a', 'b', ['c'])
      expect(e).toBeInstanceOf(Error)
      expect(e.from).toBe('a')
      expect(e.to).toBe('b')
      expect(e.allowed).toEqual(['c'])
      expect(e.message).toContain('a → b')
    })

    test('支持自定义 message', () => {
      const e = new IllegalTransitionError('a', 'b', [], '自定义消息')
      expect(e.message).toBe('自定义消息')
    })
  })

  describe('真实场景：订单状态机', () => {
    test('应支持完整订单生命周期', () => {
      const order = createStateMachine({
        initial: 'pending',
        states: ['pending', 'paid', 'shipped', 'completed', 'refunding', 'refunded', 'cancelled'],
        transitions: {
          pending: ['paid', 'cancelled'],
          paid: ['shipped', 'refunding', 'cancelled'],
          shipped: ['completed', 'refunding'],
          completed: ['refunding'],
          refunding: ['refunded'],
          refunded: [],
          cancelled: [],
        },
      })

      expect(order.canTransition('pending', 'paid')).toBe(true)
      expect(order.canTransition('paid', 'completed')).toBe(false)
      expect(order.canTransition('completed', 'refunding')).toBe(true)
      expect(order.isTerminal('refunded')).toBe(true)
      expect(order.isTerminal('cancelled')).toBe(true)
    })
  })
})
