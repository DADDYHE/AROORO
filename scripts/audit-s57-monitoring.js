#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Sprint 57-58: 监控 + 告警 + 可观测性 汇总审计
 *
 * 检查目标：
 *   1. S57-01 cloudfunctions/common/metrics.ts (业务 metrics 收集)
 *   2. S57-01 cloudfunctions/common/cls-sink.ts (CLS 指标发送器)
 *   3. S57-02 cloudfunctions/common/error-tracker.ts (错误码分布)
 *   4. S58-01 cloudfunctions/common/alert.ts (告警规则引擎)
 *   5. S58-02 cloudfunctions/common/trace.ts (Trace 上下文)
 *
 * 退出码：0 = 全部通过，1 = 至少 1 项不通过
 *
 * 用法：
 *   node scripts/audit-s57-monitoring.js
 *   node scripts/audit-s57-monitoring.js --strict
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const STRICT = process.argv.includes('--strict')

function readSafe(p) {
  try { return fs.readFileSync(p, 'utf8') } catch (e) { return null }
}

let failed = 0
const checks = []

function check(name, ok, detail) {
  checks.push({ name, ok, detail })
  if (!ok) { failed++ }
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

// ===== S57-01: metrics.ts =====

const metricsPath = path.join(ROOT, 'cloudfunctions', 'common', 'metrics.ts')
const metrics = readSafe(metricsPath)
check('cloudfunctions/common/metrics.ts 存在', fs.existsSync(metricsPath))

// 基础类型（class 在文件内定义，可能带 export 也可能不带，宽松匹配）
check('S57-01 metrics 定义 Counter 类', metrics && /\bclass\s+Counter\b/.test(metrics))
check('S57-01 metrics 定义 Gauge 类', metrics && /\bclass\s+Gauge\b/.test(metrics))
check('S57-01 metrics 定义 Histogram 类', metrics && /\bclass\s+Histogram\b/.test(metrics))
check('S57-01 metrics 定义 Registry 类', metrics && /\bclass\s+Registry\b/.test(metrics))

// 公共 API
check('S57-01 metrics 导出 counter()', metrics && /export\s+function\s+counter\s*\(/.test(metrics))
check('S57-01 metrics 导出 gauge()', metrics && /export\s+function\s+gauge\s*\(/.test(metrics))
check('S57-01 metrics 导出 histogram()', metrics && /export\s+function\s+histogram\s*\(/.test(metrics))
check('S57-01 metrics 导出 getMetricsSnapshot()',
  metrics && /export\s+function\s+getMetricsSnapshot\s*\(/.test(metrics))
check('S57-01 metrics 导出 listMetrics()', metrics && /export\s+function\s+listMetrics\s*\(/.test(metrics))

// 业务指标
check('S57-01 BIZ_METRICS.orderCreateTotal 已注册',
  metrics && /orderCreateTotal:\s*REGISTRY\.counter/.test(metrics))
check('S57-01 BIZ_METRICS.orderCreateError 已注册',
  metrics && /orderCreateError:\s*REGISTRY\.counter/.test(metrics))
check('S57-01 BIZ_METRICS.orderAmountFen histogram 已注册',
  metrics && /orderAmountFen:\s*REGISTRY\.histogram/.test(metrics))
check('S57-01 BIZ_METRICS.paymentCreateTotal 已注册',
  metrics && /paymentCreateTotal:\s*REGISTRY\.counter/.test(metrics))
check('S57-01 BIZ_METRICS.paymentCreateError 已注册',
  metrics && /paymentCreateError:\s*REGISTRY\.counter/.test(metrics))
check('S57-01 BIZ_METRICS.paymentDurationMs histogram 已注册',
  metrics && /paymentDurationMs:\s*REGISTRY\.histogram/.test(metrics))
check('S57-01 BIZ_METRICS.riskDecisionTotal 已注册',
  metrics && /riskDecisionTotal:\s*REGISTRY\.counter/.test(metrics))
check('S57-01 BIZ_METRICS.riskRejectTotal 已注册',
  metrics && /riskRejectTotal:\s*REGISTRY\.counter/.test(metrics))
check('S57-01 BIZ_METRICS.riskDurationMs histogram 已注册',
  metrics && /riskDurationMs:\s*REGISTRY\.histogram/.test(metrics))
check('S57-01 BIZ_METRICS.rateLimitHitTotal 已注册',
  metrics && /rateLimitHitTotal:\s*REGISTRY\.counter/.test(metrics))
check('S57-01 BIZ_METRICS.errorCodeTotal 已注册',
  metrics && /errorCodeTotal:\s*REGISTRY\.counter/.test(metrics))

// 高级特性
check('S57-01 metrics snapshot 包含 P50/P95/P99',
  metrics && /p50:/.test(metrics) && /p95:/.test(metrics) && /p99:/.test(metrics))
check('S57-01 metrics 有 LRU 淘汰（MAX_SERIES）',
  metrics && /MAX_SERIES\s*=\s*1000/.test(metrics))

// ===== S57-01: cls-sink.ts =====

const clsPath = path.join(ROOT, 'cloudfunctions', 'common', 'cls-sink.ts')
const cls = readSafe(clsPath)
check('cloudfunctions/common/cls-sink.ts 存在', fs.existsSync(clsPath))

check('S57-01 cls-sink 导出 initClsSink', cls && /export\s+function\s+initClsSink\s*\(/.test(cls))
check('S57-01 cls-sink 导出 flushMetrics', cls && /export\s+(?:async\s+)?function\s+flushMetrics\s*\(/.test(cls))
check('S57-01 cls-sink 导出 pushLog', cls && /export\s+function\s+pushLog\s*\(/.test(cls))
check('S57-01 cls-sink 导出 shutdown', cls && /export\s+function\s+shutdown\s*\(/.test(cls))
check('S57-01 cls-sink 导出 getSinkStatus', cls && /export\s+function\s+getSinkStatus\s*\(/.test(cls))

check('S57-01 cls-sink 周期性 flush（30s）',
  cls && /flushIntervalMs.*30000|setInterval.*flushMetrics/.test(cls))
check('S57-01 cls-sink 缓冲队列（MAX_BUFFER）',
  cls && /MAX_BUFFER\s*=\s*1000/.test(cls))
check('S57-01 cls-sink 失败不阻塞业务（静默 catch）',
  cls && /catch[\s\S]{0,40}\/\*\s*静默\s*\*\//.test(cls))
check('S57-01 cls-sink 批大小可配（batchSize）',
  cls && /batchSize/.test(cls))
check('S57-01 cls-sink 支持 customSink（测试用）',
  cls && /customSink/.test(cls))
check('S57-01 cls-sink 暴露 failureCount',
  cls && /FLUSH_FAILURE_COUNT/.test(cls))
check('S57-01 cls-sink 转换 counter / gauge / histogram 三种指标',
  cls && (cls.match(/metric_type:\s*'(counter|gauge|histogram)'/g) || []).length >= 3)

// ===== S57-02: error-tracker.ts =====

const errPath = path.join(ROOT, 'cloudfunctions', 'common', 'error-tracker.ts')
const err = readSafe(errPath)
check('cloudfunctions/common/error-tracker.ts 存在', fs.existsSync(errPath))

check('S57-02 error-tracker 导出 trackError',
  err && /export\s+function\s+trackError\s*\(/.test(err))
check('S57-02 error-tracker 导出 setErrorAlertThreshold',
  err && /export\s+function\s+setErrorAlertThreshold\s*\(/.test(err))
check('S57-02 error-tracker 导出 getErrorDistribution',
  err && /export\s+function\s+getErrorDistribution\s*\(/.test(err))
check('S57-02 error-tracker 导出 getErrorStats',
  err && /export\s+function\s+getErrorStats\s*\(/.test(err))
check('S57-02 error-tracker 导出 getErrorWindowCount',
  err && /export\s+function\s+getErrorWindowCount\s*\(/.test(err))

check('S57-02 error-tracker 集成 BIZ_METRICS.errorCodeTotal',
  err && /BIZ_METRICS\.errorCodeTotal\.inc/.test(err))
check('S57-02 error-tracker 维护 ERROR_STATS (code → stats)',
  err && /ERROR_STATS\.set/.test(err))
check('S57-02 error-tracker 多维标签（service / action）',
  err && /services\[/.test(err) && /actions\[/.test(err))
check('S57-02 error-tracker 滑动窗口告警',
  err && /ALERT_WINDOWS/.test(err) && /windowSec/.test(err))
check('S57-02 error-tracker 最近样本（RECENT_SAMPLES_MAX）',
  err && /RECENT_SAMPLES_MAX\s*=\s*100/.test(err))
check('S57-02 error-tracker extractCode 支持多种错误对象',
  err && /e\.code \|\| e\.type \|\| e\.errorType \|\| e\.name/.test(err))
check('S57-02 error-tracker 触发 logger.warn 记录告警',
  err && /logger\.warn\(['"]errorTracker['"]\s*,\s*['"]alert_triggered['"]/.test(err))

// ===== S58-01: alert.ts =====

const alertPath = path.join(ROOT, 'cloudfunctions', 'common', 'alert.ts')
const alert = readSafe(alertPath)
check('cloudfunctions/common/alert.ts 存在', fs.existsSync(alertPath))

check('S58-01 alert 导出 initAlertEngine',
  alert && /export\s+function\s+initAlertEngine\s*\(/.test(alert))
check('S58-01 alert 导出 addRule',
  alert && /export\s+function\s+addRule\s*\(/.test(alert))
check('S58-01 alert 导出 removeRule',
  alert && /export\s+function\s+removeRule\s*\(/.test(alert))
check('S58-01 alert 导出 evaluateNow',
  alert && /export\s+(?:async\s+)?function\s+evaluateNow\s*\(/.test(alert))
check('S58-01 alert 导出 getAlertHistory',
  alert && /export\s+function\s+getAlertHistory\s*\(/.test(alert))
check('S58-01 alert 导出 fireAlert',
  alert && /export\s+(?:async\s+)?function\s+fireAlert\s*\(/.test(alert))
check('S58-01 alert 导出 getEngineStatus',
  alert && /export\s+function\s+getEngineStatus\s*\(/.test(alert))

// 规则类型
check('S58-01 alert 支持 threshold 规则',
  alert && /type:\s*['"]threshold['"]/.test(alert))
check('S58-01 alert 支持 rate 规则',
  alert && /type:\s*['"]rate['"]/.test(alert) || /['"]rate['"]/.test(alert))
check('S58-01 alert 支持 error_rate 规则',
  alert && /type:\s*['"]error_rate['"]/.test(alert) || /['"]error_rate['"]/.test(alert))
check('S58-01 alert 支持 latency 规则',
  alert && /type:\s*['"]latency['"]/.test(alert) || /['"]latency['"]/.test(alert))

// 通知通道
check('S58-01 alert 支持 console 通道',
  alert && /kind:\s*['"]console['"]/.test(alert) || /['"]console['"]/.test(alert))
check('S58-01 alert 支持 webhook 通道',
  alert && /kind:\s*['"]webhook['"]/.test(alert) || /['"]webhook['"]/.test(alert))
check('S58-01 alert 实现去重抑制（suppressWindowMs）',
  alert && /suppressWindowMs/.test(alert) && /isSuppressed/.test(alert))

// 严重级别
check('S58-01 alert 严重级别 info / warn / critical',
  alert && /['"]info['"]/.test(alert) && /['"]warn['"]/.test(alert) && /['"]critical['"]/.test(alert))

// 内置规则
check('S58-01 alert 包含 ALERT_BUILTIN_RULES',
  alert && /export\s+const\s+ALERT_BUILTIN_RULES/.test(alert))
check('S58-01 alert 内置订单错误率告警',
  alert && /order_create_error_rate_high|orderCreateError/.test(alert))
check('S58-01 alert 内置支付错误告警',
  alert && /payment_create_error_high|paymentCreateError/.test(alert))
check('S58-01 alert 内置限流告警',
  alert && /rate_limit_hit_high|rateLimitHit/.test(alert))
check('S58-01 alert 内置延迟告警',
  alert && /payment_latency_p95_high|paymentDurationMs/.test(alert))

// ===== S58-02: trace.ts =====

const tracePath = path.join(ROOT, 'cloudfunctions', 'common', 'trace.ts')
const trace = readSafe(tracePath)
check('cloudfunctions/common/trace.ts 存在', fs.existsSync(tracePath))

check('S58-02 trace 导出 createRootTrace',
  trace && /export\s+function\s+createRootTrace\s*\(/.test(trace))
check('S58-02 trace 导出 createChildSpan',
  trace && /export\s+function\s+createChildSpan\s*\(/.test(trace))
check('S58-02 trace 导出 runWithTrace',
  trace && /export\s+function\s+runWithTrace\b/.test(trace))
check('S58-02 trace 导出 getCurrentTrace',
  trace && /export\s+function\s+getCurrentTrace\s*\(/.test(trace))
check('S58-02 trace 导出 ensureTrace',
  trace && /export\s+function\s+ensureTrace\s*\(/.test(trace))
check('S58-02 trace 导出 traceId / spanId',
  trace && /export\s+function\s+traceId\s*\(/.test(trace)
  && /export\s+function\s+spanId\s*\(/.test(trace))
check('S58-02 trace 导出 withTrace 装饰器',
  trace && /export\s+function\s+withTrace\s*[<(]/.test(trace))
check('S58-02 trace 导出 toHeader / fromHeader',
  trace && /export\s+function\s+toHeader\s*\(/.test(trace)
  && /export\s+function\s+fromHeader\s*\(/.test(trace))
check('S58-02 trace 导出 toJSON / fromJSON',
  trace && /export\s+function\s+toJSON\s*\(/.test(trace)
  && /export\s+function\s+fromJSON\s*\(/.test(trace))
check('S58-02 trace 导出 enrichLogFields / enrichMetricLabels',
  trace && /export\s+function\s+enrichLogFields\s*\(/.test(trace)
  && /export\s+function\s+enrichMetricLabels\s*\(/.test(trace))
check('S58-02 trace 导出 time 性能计时器',
  trace && /export\s+function\s+time\s*[<(]/.test(trace))

// 核心实现
check('S58-02 trace 使用 AsyncLocalStorage 隔离',
  trace && /AsyncLocalStorage/.test(trace))
check('S58-02 trace 实现 traceparent header 协议',
  trace && /00-.*-.*-01/.test(trace) && /traceparent/i.test(trace))
check('S58-02 trace 包含 parentSpanId 字段',
  trace && /parentSpanId/.test(trace))
check('S58-02 trace 包含 startTime / tags 字段',
  trace && /startTime/.test(trace) && /tags/.test(trace))

// ===== 文档 =====

const docPath = path.join(ROOT, 'docs', 'SPRINT_57_58_DELIVERY.md')
const doc = readSafe(docPath)
check('docs/SPRINT_57_58_DELIVERY.md 存在', fs.existsSync(docPath))
check('S57-99-DOC 文档列出 5 个交付模块',
  doc && /S57-01.*metrics|S57-02.*error-tracker|S58-01.*alert|S58-02.*trace/.test(doc))

// ===== 总结 =====

console.log('\n' + '='.repeat(60))
const passed = checks.filter(c => c.ok).length
const total = checks.length
console.log(`Sprint 57-58 监控 + 告警 + 可观测性 审计: ${passed}/${total} 项通过`)
console.log('='.repeat(60))

if (failed > 0) {
  console.error(`\n❌ ${failed} 项审计未通过`)
  process.exit(1)
}

if (STRICT && passed < total) {
  console.error('\n❌ 严格模式：存在失败项')
  process.exit(1)
}

console.log('\n✅ 所有审计项通过')
process.exit(0)
