/**
 * utils/eventEmitter.js 测试
 * 验证 EventEmitter 类的发布-订阅行为
 */
const { EventEmitter, eventEmitter } = require('../utils/eventEmitter')

describe('utils/eventEmitter', () => {
  describe('EventEmitter class', () => {
    test('on 注册回调，emit 触发回调', () => {
      const ee = new EventEmitter()
      const cb = jest.fn()
      ee.on('foo', cb)
      ee.emit('foo', 'data')
      expect(cb).toHaveBeenCalledWith('data')
    })

    test('off 解绑指定回调', () => {
      const ee = new EventEmitter()
      const cb1 = jest.fn()
      const cb2 = jest.fn()
      ee.on('foo', cb1)
      ee.on('foo', cb2)
      ee.off('foo', cb1)
      ee.emit('foo', 'x')
      expect(cb1).not.toHaveBeenCalled()
      expect(cb2).toHaveBeenCalledWith('x')
    })

    test('on 返回解绑函数', () => {
      const ee = new EventEmitter()
      const cb = jest.fn()
      const unbind = ee.on('foo', cb)
      unbind()
      ee.emit('foo', 'y')
      expect(cb).not.toHaveBeenCalled()
    })

    test('未注册事件时 emit 不应报错', () => {
      const ee = new EventEmitter()
      expect(() => ee.emit('nope', 1)).not.toThrow()
    })

    test('监听器抛错不应影响其他监听器', () => {
      const ee = new EventEmitter()
      const errCb = jest.fn(() => {
        throw new Error('boom')
      })
      const goodCb = jest.fn()
      // 抑制 expected error 输出
      const consoleErr = jest.spyOn(console, 'error').mockImplementation(() => {})
      ee.on('evt', errCb)
      ee.on('evt', goodCb)
      ee.emit('evt', 'd')
      expect(errCb).toHaveBeenCalled()
      expect(goodCb).toHaveBeenCalledWith('d')
      consoleErr.mockRestore()
    })

    test('同一事件可注册多个回调，按顺序触发', () => {
      const ee = new EventEmitter()
      const order = []
      ee.on('evt', () => order.push('a'))
      ee.on('evt', () => order.push('b'))
      ee.on('evt', () => order.push('c'))
      ee.emit('evt', null)
      expect(order).toEqual(['a', 'b', 'c'])
    })
  })

  describe('eventEmitter 单例', () => {
    test('应导出可用的全局实例', () => {
      expect(eventEmitter).toBeInstanceOf(EventEmitter)
    })
  })
})
