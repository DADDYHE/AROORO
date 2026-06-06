/**
 * services/OrderManager.js 测试
 * 验证 OrderManager 在统一归并后仍保持原有行为
 */
jest.mock('../services/CloudFunctionService', () => ({
  OrderService: {
    createOrder: jest.fn(),
    getOrders: jest.fn(),
    cancelOrder: jest.fn(),
  },
}))

const { OrderService } = require('../services/CloudFunctionService')
const { orderManager, ORDER_EVENTS } = require('../services/OrderManager')
const { eventEmitter } = require('../utils/eventEmitter')

describe('services/OrderManager', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('createOrder', () => {
    test('成功时触发 ORDER_CREATED 与 LIST_UPDATED 事件', async () => {
      OrderService.createOrder.mockResolvedValue({ code: 0, data: { id: 'o1' } })
      const createdHandler = jest.fn()
      const listHandler = jest.fn()
      eventEmitter.on(ORDER_EVENTS.ORDER_CREATED, createdHandler)
      eventEmitter.on(ORDER_EVENTS.LIST_UPDATED, listHandler)

      const result = await orderManager.createOrder({ sku: 'x' })

      expect(result).toEqual({ code: 0, data: { id: 'o1' } })
      expect(createdHandler).toHaveBeenCalledWith({ id: 'o1' })
      expect(listHandler).toHaveBeenCalledWith(null)
    })

    test('失败时返回错误码并捕获异常', async () => {
      OrderService.createOrder.mockRejectedValue(new Error('network'))
      const consoleErr = jest.spyOn(console, 'error').mockImplementation(() => {})
      const result = await orderManager.createOrder({})
      expect(result).toEqual({ code: -1, message: 'network' })
      consoleErr.mockRestore()
    })

    test('非 code:0 结果不应触发事件', async () => {
      OrderService.createOrder.mockResolvedValue({ code: 999, message: 'no' })
      const createdHandler = jest.fn()
      eventEmitter.on(ORDER_EVENTS.ORDER_CREATED, createdHandler)
      await orderManager.createOrder({})
      expect(createdHandler).not.toHaveBeenCalled()
    })
  })

  describe('getOrders', () => {
    test('成功时返回 data', async () => {
      OrderService.getOrders.mockResolvedValue({ code: 0, data: { list: [{ id: 1 }], total: 1 } })
      const result = await orderManager.getOrders('host', 'paid', 1, 20)
      expect(OrderService.getOrders).toHaveBeenCalledWith({ role: 'host', status: 'paid', page: 1, size: 20 })
      expect(result).toEqual({ list: [{ id: 1 }], total: 1 })
    })

    test('空状态时 status 字段应为 undefined', async () => {
      OrderService.getOrders.mockResolvedValue({ code: 0, data: { list: [], total: 0 } })
      await orderManager.getOrders('host', '', 1, 20)
      expect(OrderService.getOrders).toHaveBeenCalledWith({ role: 'host', status: undefined, page: 1, size: 20 })
    })

    test('失败时返回空结构', async () => {
      OrderService.getOrders.mockRejectedValue(new Error('boom'))
      const consoleErr = jest.spyOn(console, 'error').mockImplementation(() => {})
      const result = await orderManager.getOrders('host')
      expect(result).toEqual({ list: [], total: 0 })
      consoleErr.mockRestore()
    })
  })

  describe('cancelOrder', () => {
    test('成功时触发 STATUS_CHANGED 与 LIST_UPDATED', async () => {
      OrderService.cancelOrder.mockResolvedValue({ code: 0 })
      const statusHandler = jest.fn()
      const listHandler = jest.fn()
      eventEmitter.on(ORDER_EVENTS.STATUS_CHANGED, statusHandler)
      eventEmitter.on(ORDER_EVENTS.LIST_UPDATED, listHandler)

      await orderManager.cancelOrder('o1')

      expect(statusHandler).toHaveBeenCalledWith({ orderId: 'o1', status: 'cancelled' })
      expect(listHandler).toHaveBeenCalled()
    })

    test('失败时返回错误码', async () => {
      OrderService.cancelOrder.mockRejectedValue(new Error('fail'))
      const consoleErr = jest.spyOn(console, 'error').mockImplementation(() => {})
      const result = await orderManager.cancelOrder('o1')
      expect(result).toEqual({ code: -1, message: 'fail' })
      consoleErr.mockRestore()
    })
  })

  describe('on / off', () => {
    test('on 应代理到 eventEmitter', () => {
      const cb = jest.fn()
      const unbind = orderManager.on('foo', cb)
      eventEmitter.emit('foo', 'x')
      expect(cb).toHaveBeenCalledWith('x')
      unbind()
      eventEmitter.emit('foo', 'y')
      expect(cb).toHaveBeenCalledTimes(1)
    })

    test('off 应解除注册', () => {
      const cb = jest.fn()
      orderManager.on('foo', cb)
      orderManager.off('foo', cb)
      eventEmitter.emit('foo', 'x')
      expect(cb).not.toHaveBeenCalled()
    })
  })
})
