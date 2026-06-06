/**
 * 云函数统一中间件（Sprint 11 新增）
 *
 * 把"错误处理 / 性能埋点 / 告警 / 日志"四件事打包成一个装饰器，
 * 减少业务 handler 中的样板代码。
 *
 * 用法：
 *   const { withMiddleware } = require('./common/middleware')
 *
 *   exports.main = withMiddleware({
 *     service: 'orderService',
 *     handler: async (event, context, auth) => {
 *       // 业务逻辑（无需 try/catch）
 *     },
 *   })
 *
 * 行为：
 *   1. auth 校验：先 verifyAuth
 *   2. 计时：自动 wrap 到 metrics（service.action 维度）
 *   3. 错误处理：BusinessError → toResponse；其他 Error → wrapUnknown + toResponse
 *   4. 慢调用告警：duration > criticalMs → alert.notify('INTERNAL_ERROR', ...)
 *   5. SEVERE 错误告警：自动调用 alert.notify
 *   6. 日志：开始/结束都打一条（含 duration / openid / action）
 *
 * 也支持「只套错误处理 + 告警，不要 metrics」：
 *   withMiddleware({ service: 'x', handler, enableMetrics: false })
 */

const { withErrorHandling } = require('./errors')
const alert = require('./alert')
const metrics = require('./performance-metrics')
const logger = require('./logger')

/**
 * @typedef {Object} MiddlewareOptions
 * @property {string} service - 服务名（指标 / 告警的命名空间）
 * @property {string} [action] - 显式 action 名（默认取 event.action）
 * @property {function} handler - 业务 handler (event, context, auth) => Promise<any>
 * @property {boolean} [enableMetrics=true] - 是否埋点
 * @property {boolean} [enableAlert=true] - 是否告警
 * @property {function} [verifyAuth] - 自定义 auth 校验；不传则降级为 auth.openid 透传
 * @property {number} [slowMs] - 自定义慢调用阈值
 * @property {number} [criticalMs] - 自定义严重阈值
 */

/**
 * 装饰业务 handler
 * @param {MiddlewareOptions} opts
 * @returns {function} 装饰后的 handler
 */
function withMiddleware(opts) {
  const {
    service,
    action: explicitAction,
    handler,
    enableMetrics = true,
    enableAlert = true,
    verifyAuth,
    slowMs,
    criticalMs,
  } = opts

  if (!service) {throw new Error('withMiddleware: 缺少 service')}
  if (typeof handler !== 'function') {throw new Error('withMiddleware: 缺少 handler')}

  // 临时改阈值
  if (slowMs !== undefined || criticalMs !== undefined) {
    metrics.setThresholds({ slowMs, criticalMs })
  }

  const wrapped = async function (event, context) {
    const action = explicitAction || (event && event.action) || 'unknown'
    const metricName = `${service}.${action}`

    // 1) auth
    let auth
    if (verifyAuth) {
      auth = await verifyAuth(event)
    } else {
      auth = { openid: event && event.openid }
    }

    // 2) metrics start
    const t = enableMetrics ? metrics.start(metricName) : null

    // 3) log start
    logger.info(`[${service}] -> ${action}`, {
      openid: auth.openid,
      method: (event && event.method) || (event && event.httpMethod),
    })

    try {
      const result = await handler(event, context, auth)
      const dur = t ? Date.now() - t.startedAt : 0
      if (t) {metrics.success(t)}
      // 慢调用检测（成功路径也检测）
      if (enableAlert && t) {
        const criticalMs2 = criticalMs || metrics.DEFAULT_CRITICAL_MS
        if (dur > criticalMs2) {
          alert.notify('INTERNAL_ERROR', {
            service,
            action,
            openid: auth.openid,
            reason: `slow_call_${Math.round(dur)}ms`,
          }).catch(() => {})
        }
      }
      logger.info(`[${service}] <- ${action} ok`, {
        openid: auth.openid,
        durationMs: Math.round(dur),
      })
      return result
    } catch (e) {
      if (t) {metrics.failure(t, e)}
      logger.warn(`[${service}] x ${action} err`, {
        openid: auth.openid,
        code: e && e.code,
        msg: e && e.message,
      })

      // 失败路径的慢调用告警
      if (enableAlert && t) {
        const dur = t.startedAt ? Date.now() - t.startedAt : 0
        const criticalMs2 = criticalMs || metrics.DEFAULT_CRITICAL_MS
        if (dur > criticalMs2) {
          alert.notify('INTERNAL_ERROR', {
            service,
            action,
            openid: auth.openid,
            reason: `slow_call_${Math.round(dur)}ms: ${e.message}`,
            stack: e.stack,
          }).catch(() => {})
        }
      }
      // SEVERE 错误告警
      if (enableAlert && e && e.code && alert.isAlertable(e.code)) {
        alert.notify(e.code, {
          service,
          action,
          openid: auth.openid,
          reason: e.message,
          stack: e.stack,
        }).catch(() => {})
      }
      throw e
    }
  }

  return wrapped
}

/**
 * 一站式"入口函数"装饰器
 *
 * 适用于 exports.main 写法：
 *   exports.main = composeMain({
 *     service: 'orderService',
 *     verifyAuth,
 *     handlers,  // action -> handler
 *   })
 *
 * @param {object} opts
 * @param {string} opts.service
 * @param {object} opts.handlers - action 名 → 业务 handler (event, context, auth) => Promise
 * @param {function} [opts.verifyAuth] - 认证函数 (event) => Promise<auth>
 * @param {function} [opts.onUnknown] - 未知 action 处理（默认抛 UNKNOWN_ACTION）
 * @param {boolean} [opts.enableMetrics=true]
 * @param {boolean} [opts.enableAlert=true]
 * @returns {function} main 函数
 */
function composeMain(opts) {
  const {
    service,
    handlers,
    verifyAuth,
    onUnknown,
    enableMetrics = true,
    enableAlert = true,
  } = opts
  if (!service) {throw new Error('composeMain: 缺少 service')}
  if (!handlers || typeof handlers !== 'object') {throw new Error('composeMain: 缺少 handlers')}

  return async function main(event, context) {
    const action = event && event.action
    const handler = action && handlers[action]
    if (!handler) {
      if (onUnknown) {return onUnknown(event, action)}
      const { err } = require('./errors')
      throw err('UNKNOWN_ACTION', action ? `未知的操作：${action}` : '缺少 action 参数')
    }

    return withMiddleware({
      service,
      action,
      handler,
      enableMetrics,
      enableAlert,
      verifyAuth,
    })(event, context)
  }
}

module.exports = {
  withMiddleware,
  composeMain,
}
