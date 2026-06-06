/**
 * orderService/common/boarding-state-machine.js 测试
 *
 * 替代原 orders.js 中散落的 BOARDING_STATUS_MAP / BOARDING_ORDER_TRANSITIONS
 */
const {
  boardingOrderStateMachine,
  BOARDING_OPERATION_TARGET,
  getTargetStatusByOperation,
  canPerformOperation,
} = require('../cloudfunctions/orderService/common/boarding-state-machine')

describe('orderService/common/boarding-state-machine', () => {
  describe('boardingOrderStateMachine', () => {
    test('initial 应为 pending', () => {
      expect(boardingOrderStateMachine.initial).toBe('pending')
    })

    test('应包含 7 个状态', () => {
      expect(boardingOrderStateMachine.states.sort()).toEqual(
        ['cancelled', 'completed', 'confirmed', 'in_progress', 'paid', 'pending', 'rejected']
      )
    })

    test('pending → confirmed / rejected / cancelled 应合法', () => {
      expect(boardingOrderStateMachine.canTransition('pending', 'confirmed')).toBe(true)
      expect(boardingOrderStateMachine.canTransition('pending', 'rejected')).toBe(true)
      expect(boardingOrderStateMachine.canTransition('pending', 'cancelled')).toBe(true)
    })

    test('paid → confirmed / rejected / cancelled 应合法', () => {
      expect(boardingOrderStateMachine.canTransition('paid', 'confirmed')).toBe(true)
      expect(boardingOrderStateMachine.canTransition('paid', 'rejected')).toBe(true)
      expect(boardingOrderStateMachine.canTransition('paid', 'cancelled')).toBe(true)
    })

    test('confirmed → in_progress / completed / cancelled 应合法', () => {
      expect(boardingOrderStateMachine.canTransition('confirmed', 'in_progress')).toBe(true)
      expect(boardingOrderStateMachine.canTransition('confirmed', 'completed')).toBe(true)
      expect(boardingOrderStateMachine.canTransition('confirmed', 'cancelled')).toBe(true)
    })

    test('in_progress → completed 应合法', () => {
      expect(boardingOrderStateMachine.canTransition('in_progress', 'completed')).toBe(true)
    })

    test('completed / rejected / cancelled 是终态', () => {
      expect(boardingOrderStateMachine.isTerminal('completed')).toBe(true)
      expect(boardingOrderStateMachine.isTerminal('rejected')).toBe(true)
      expect(boardingOrderStateMachine.isTerminal('cancelled')).toBe(true)
    })

    test('pending → in_progress 应非法（需先 confirmed）', () => {
      expect(boardingOrderStateMachine.canTransition('pending', 'in_progress')).toBe(false)
    })

    test('pending → completed 应非法（需先 confirmed/in_progress）', () => {
      expect(boardingOrderStateMachine.canTransition('pending', 'completed')).toBe(false)
    })

    test('completed → cancelled 应非法（终态）', () => {
      expect(boardingOrderStateMachine.canTransition('completed', 'cancelled')).toBe(false)
    })
  })

  describe('BOARDING_OPERATION_TARGET', () => {
    test('应包含 4 个操作', () => {
      expect(Object.keys(BOARDING_OPERATION_TARGET).sort()).toEqual(
        ['cancel', 'complete', 'confirm', 'reject']
      )
    })

    test('每个操作应映射到正确的目标状态', () => {
      expect(BOARDING_OPERATION_TARGET.confirm).toBe('confirmed')
      expect(BOARDING_OPERATION_TARGET.reject).toBe('rejected')
      expect(BOARDING_OPERATION_TARGET.complete).toBe('completed')
      expect(BOARDING_OPERATION_TARGET.cancel).toBe('cancelled')
    })
  })

  describe('getTargetStatusByOperation', () => {
    test('已知操作应返回目标状态', () => {
      expect(getTargetStatusByOperation('confirm')).toBe('confirmed')
      expect(getTargetStatusByOperation('reject')).toBe('rejected')
      expect(getTargetStatusByOperation('complete')).toBe('completed')
      expect(getTargetStatusByOperation('cancel')).toBe('cancelled')
    })

    test('未知操作应返回 null', () => {
      expect(getTargetStatusByOperation('unknown')).toBeNull()
      expect(getTargetStatusByOperation('')).toBeNull()
      expect(getTargetStatusByOperation(null)).toBeNull()
    })
  })

  describe('canPerformOperation', () => {
    test('pending + confirm 应合法', () => {
      expect(canPerformOperation('pending', 'confirm')).toBe(true)
    })

    test('pending + complete 应非法（需先 confirmed）', () => {
      expect(canPerformOperation('pending', 'complete')).toBe(false)
    })

    test('confirmed + complete 应合法', () => {
      expect(canPerformOperation('confirmed', 'complete')).toBe(true)
    })

    test('in_progress + confirm 应非法（已确认过）', () => {
      expect(canPerformOperation('in_progress', 'confirm')).toBe(false)
    })

    test('completed + cancel 应非法（终态）', () => {
      expect(canPerformOperation('completed', 'cancel')).toBe(false)
    })

    test('未知操作应返回 false', () => {
      expect(canPerformOperation('pending', 'unknown')).toBe(false)
    })
  })

  describe('集成场景：商家操作寄养订单', () => {
    // 寄养订单状态机只管商家操作（confirm/reject/complete/cancel），
    // pending → paid 由 paymentService 状态机处理
    const merchantFlow = ['pending', 'confirmed', 'in_progress', 'completed']
    test('完整流程应全部合法', () => {
      for (let i = 0; i < merchantFlow.length - 1; i++) {
        expect(boardingOrderStateMachine.canTransition(merchantFlow[i], merchantFlow[i + 1])).toBe(true)
      }
    })

    test('completed 之后的任何操作都应失败', () => {
      const all = boardingOrderStateMachine.states
      for (const s of all) {
        if (s === 'completed') continue
        expect(boardingOrderStateMachine.canTransition('completed', s)).toBe(false)
      }
    })
  })
})
