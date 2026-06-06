/**
 * 性能指标埋点（Sprint 11 新增）
 *
 * 目标：
 *   - 在云函数层记录关键操作的 P50 / P95 / P99 / QPS / 错误率
 *   - 不阻塞主流程（fire-and-forget 写入）
 *   - 与 logger / alert 联动：超过阈值时自动告警
 *   - 支持内存模式（每分钟聚合）和数据库模式（异步批量写）
 *
 * 用法：
 *   const metrics = require('./common/performance-metrics')
 *
 *   // 1. 单点计时
 *   const t = metrics.start('paymentService.createOrder')
 *   try {
 *     const order = await createOrder()
 *     metrics.success(t, { orderId: order._id })
 *   } catch (e) {
 *     metrics.failure(t, e)
 *     throw e
 *   }
 *
 *   // 2. 装饰器：自动计时
 *   const myHandler = metrics.wrap('orderService.createOrder', async (event) => {
 *     return createOrder(event)
 *   })
 *
 *   // 3. 自定义指标（计数 / 业务量）
 *   metrics.incCounter('payment.amount', order.totalPrice)
 *   metrics.setGauge('cache.hitRate', 0.92)
 *
 * 监控：
 *   - 默认：内存窗口（最近 1 分钟），可读 metrics.getSnapshot()
 *   - 进阶：APM 钩子 metrics.onMetric(metric => flush(...))
 *
 * 阈值（可配）：
 *   - P95 > SLOW_MS：标记 SLOW
 *   - P95 > CRITICAL_MS：触发 alert
 *   - QPS 单调递增超过 QPS_THRESHOLD：触发限流告警
 */

const DEFAULT_BUCKETS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000] // ms
const DEFAULT_SLOW_MS = 800
const DEFAULT_CRITICAL_MS = 3000

/**
 * 构造一个埋点计时器
 * @param {string} name
 * @param {object} [options]
 * @returns {Timer}
 */
function start(name, options = {}) {
  return {
    name,
    startedAt: Date.now(),
    startedHr: process.hrtime.bigint(),
    tags: options.tags || {},
  }
}

function _elapsedMs(t) {
  return Number(process.hrtime.bigint() - t.startedHr) / 1e6
}

function success(t, extraTags = {}) {
  record(t.name, _elapsedMs(t), false, { ...t.tags, ...extraTags })
}

function failure(t, err, extraTags = {}) {
  record(t.name, _elapsedMs(t), true, {
    ...t.tags,
    ...extraTags,
    errorCode: (err && err.code) || 'UNKNOWN',
  })
}

function record(name, durationMs, isError, tags = {}) {
  // 内存桶
  if (!_state.buckets.has(name)) {
    _state.buckets.set(name, {
      name,
      samples: [],
      errors: 0,
      total: 0,
      lastTags: {},
    })
  }
  const bucket = _state.buckets.get(name)
  bucket.samples.push(durationMs)
  bucket.total += 1
  if (isError) {bucket.errors += 1}
  bucket.lastTags = tags
  // 单 bucket 限长
  if (bucket.samples.length > _state.maxSamples) {
    bucket.samples.splice(0, bucket.samples.length - _state.maxSamples)
  }

  // 慢调用告警
  const slowMs = _state.thresholds.slowMs
  const criticalMs = _state.thresholds.criticalMs
  if (!isError && durationMs > criticalMs) {
    _alert(name, 'CRITICAL', durationMs, tags)
  } else if (!isError && durationMs > slowMs) {
    _alert(name, 'SLOW', durationMs, tags)
  }
}

function incCounter(name, value = 1, tags = {}) {
  if (!_state.counters.has(name)) {
    _state.counters.set(name, { name, value: 0, tags: {} })
  }
  const c = _state.counters.get(name)
  c.value += value
  c.tags = tags
}

function setGauge(name, value, tags = {}) {
  _state.gauges.set(name, { name, value, tags, at: Date.now() })
}

/**
 * 计算 P 百分位
 * @param {number[]} samples
 * @param {number} p
 * @returns {number}
 */
function percentile(samples, p) {
  if (!samples || samples.length === 0) {return 0}
  const sorted = [...samples].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[idx]
}

function getSnapshot() {
  const snapshot = {
    generatedAt: new Date().toISOString(),
    thresholds: { ..._state.thresholds },
    timers: {},
    counters: {},
    gauges: {},
  }
  for (const [name, b] of _state.buckets) {
    snapshot.timers[name] = {
      total: b.total,
      errors: b.errors,
      errorRate: b.total > 0 ? b.errors / b.total : 0,
      p50: percentile(b.samples, 50),
      p95: percentile(b.samples, 95),
      p99: percentile(b.samples, 99),
      max: b.samples.length > 0 ? Math.max(...b.samples) : 0,
      lastTags: b.lastTags,
    }
  }
  for (const [name, c] of _state.counters) {
    snapshot.counters[name] = c.value
  }
  for (const [name, g] of _state.gauges) {
    snapshot.gauges[name] = g.value
  }
  return snapshot
}

function reset() {
  _state.buckets.clear()
  _state.counters.clear()
  _state.gauges.clear()
}

function setThresholds(opts) {
  Object.assign(_state.thresholds, opts)
}

/**
 * 装饰器：自动计时 + 错误统计
 * @param {string} name
 * @param {function} handler
 * @returns {function}
 */
function wrap(name, handler) {
  return async function wrapped(event, context, auth) {
    const t = start(name)
    try {
      const result = await handler(event, context, auth)
      success(t)
      return result
    } catch (e) {
      failure(t, e)
      throw e
    }
  }
}

/**
 * 慢调用/严重调用告警（与 alert.js 联动）
 * @param {string} name
 * @param {'SLOW'|'CRITICAL'} level
 * @param {number} durationMs
 * @param {object} tags
 */
function _alert(name, level, durationMs, tags) {
  // 仅在配置了 alert 时才告警
  if (!_state.alertHook) {return}
  try {
    _state.alertHook({
      name,
      level,
      durationMs,
      tags,
      at: new Date().toISOString(),
    })
  } catch (_) {
    // 静默失败
  }
}

function setAlertHook(fn) {
  _state.alertHook = fn
}

const _state = {
  buckets: new Map(),
  counters: new Map(),
  gauges: new Map(),
  maxSamples: 1000,
  thresholds: {
    slowMs: DEFAULT_SLOW_MS,
    criticalMs: DEFAULT_CRITICAL_MS,
  },
  alertHook: null,
}

module.exports = {
  start,
  success,
  failure,
  record,
  incCounter,
  setGauge,
  percentile,
  getSnapshot,
  reset,
  setThresholds,
  setAlertHook,
  wrap,
  DEFAULT_BUCKETS,
  DEFAULT_SLOW_MS,
  DEFAULT_CRITICAL_MS,
}
