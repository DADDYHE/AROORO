/**
 * 订单管理服务
 * 封装订单相关云函数调用，并通过事件总线通知订单状态变化
 *
 * 历史：原本在 subpackages/booking/utils 与 subpackages/profile/utils
 * 各存在一份相同实现，Sprint 2 归并至此处。
 */

const { OrderService } = require('./CloudFunctionService')
const { eventEmitter } = require('../utils/eventEmitter')
const { createLogger } = require('../utils/logger')

const logger = createLogger('OrderManager')

/** 订单领域事件 */
const ORDER_EVENTS = {
  LIST_UPDATED: 'list_updated',
  STATUS_CHANGED: 'status_changed',
  ORDER_CREATED: 'order_created',
}

const orderManager = {
  /**
   * 创建订单
   * @param {object} orderData 订单数据
   * @returns {Promise<{code:number, data?:object, message?:string}>}
   */
  async createOrder(orderData) {
    try {
      const result = await OrderService.createOrder(orderData)
      if (result && result.code === 0) {
        eventEmitter.emit(ORDER_EVENTS.ORDER_CREATED, result.data)
        eventEmitter.emit(ORDER_EVENTS.LIST_UPDATED, null)
      }
      return result
    } catch (error) {
      logger.error('创建订单失败', { error: error.message || String(error) })
      return { code: -1, message: error.message || '创建订单失败' }
    }
  },

  /**
   * 获取订单列表
   * @param {string} role 角色
   * @param {string} [status] 订单状态过滤
   * @param {number} [page=1] 页码
   * @param {number} [size=20] 页大小
   * @returns {Promise<{list:Array, total:number}>}
   */
  async getOrders(role, status = '', page = 1, size = 20) {
    try {
      const result = await OrderService.getOrders({
        role,
        status: status || undefined,
        page,
        size,
      })
      if (result && result.code === 0) {
        return result.data
      }
      return { list: [], total: 0 }
    } catch (error) {
      logger.error('获取订单列表失败', { error: error.message || String(error) })
      return { list: [], total: 0 }
    }
  },

  /**
   * 取消订单
   * @param {string} orderId 订单 ID
   * @returns {Promise<{code:number, data?:object, message?:string}>}
   */
  async cancelOrder(orderId) {
    try {
      const result = await OrderService.cancelOrder({ orderId })
      if (result && result.code === 0) {
        eventEmitter.emit(ORDER_EVENTS.STATUS_CHANGED, { orderId, status: 'cancelled' })
        eventEmitter.emit(ORDER_EVENTS.LIST_UPDATED, null)
      }
      return result
    } catch (error) {
      logger.error('取消订单失败', { error: error.message || String(error) })
      return { code: -1, message: error.message || '取消订单失败' }
    }
  },

  /** @see eventEmitter.on */
  on(event, callback) {
    return eventEmitter.on(event, callback)
  },

  /** @see eventEmitter.off */
  off(event, callback) {
    eventEmitter.off(event, callback)
  },
}

module.exports = { orderManager, ORDER_EVENTS }
