/**
 * 事件发射器（EventEmitter）
 * 基于 class 的发布-订阅实现，支持解绑函数和异常隔离
 *
 * 实例化形式，可在模块内创建独立作用域的事件通道
 */

class EventEmitter {
  constructor() {
    this._listeners = Object.create(null)
  }

  /**
   * 注册事件监听
   * @param {string} event 事件名
   * @param {Function} callback 回调函数
   * @returns {Function} 解绑函数（off）
   */
  on(event, callback) {
    if (!this._listeners[event]) {this._listeners[event] = []}
    this._listeners[event].push(callback)
    return () => this.off(event, callback)
  }

  /**
   * 解绑事件监听
   * @param {string} event 事件名
   * @param {Function} callback 要解绑的回调
   */
  off(event, callback) {
    if (!this._listeners[event]) {return}
    this._listeners[event] = this._listeners[event].filter(cb => cb !== callback)
  }

  /**
   * 触发事件
   * 监听器抛出异常会被捕获，避免影响其他监听器
   * @param {string} event 事件名
   * @param {*} data 事件参数
   */
  emit(event, data) {
    if (!this._listeners[event]) {return}
    this._listeners[event].forEach(cb => {
      try {
        cb(data)
      } catch (err) {
        // 监听器执行异常隔离，不阻断其他监听器
        // eslint-disable-next-line no-console
        console.error('[EventEmitter] 监听器执行失败:', err)
      }
    })
  }
}

const eventEmitter = new EventEmitter()

module.exports = { EventEmitter, eventEmitter }
