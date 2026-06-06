/**
 * 全局事件总线
 * 轻量级发布-订阅，用于跨页面/组件通信
 */
const listeners = new Map()

function on(event, handler) {
  if (!listeners.has(event)) {
    listeners.set(event, new Set())
  }
  listeners.get(event).add(handler)
}

function off(event, handler) {
  const handlers = listeners.get(event)
  if (handlers) {
    handlers.delete(handler)
    if (handlers.size === 0) {
      listeners.delete(event)
    }
  }
}

function emit(event, ...args) {
  const handlers = listeners.get(event)
  if (handlers) {
    handlers.forEach(handler => {
      try {
        handler(...args)
      } catch (e) {
        console.error(`[eventBus] ${event} 处理异常:`, e)
      }
    })
  }
}

function once(event, handler) {
  const wrapper = (...args) => {
    off(event, wrapper)
    handler(...args)
  }
  on(event, wrapper)
}

function clear() {
  listeners.clear()
}

module.exports = { on, off, emit, once, clear }