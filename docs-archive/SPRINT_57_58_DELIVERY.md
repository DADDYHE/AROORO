# Sprint 57-58 交付说明：监控 + 告警 + 可观测性

> 主题：构建完整的可观测性系统（Metrics + Logs + Traces），覆盖业务指标采集、CLS 落地、错误码分布、告警规则、Trace 上下文。

## 1. 交付清单

| 模块 | 任务 | 文件 | 说明 |
|------|------|------|------|
| S57-01 | 业务 metrics 收集 | `cloudfunctions/common/metrics.ts` | Counter / Gauge / Histogram，标签维度，内置业务指标 |
| S57-01 | CLS 指标发送器 | `cloudfunctions/common/cls-sink.ts` | 30s 周期 flush、缓冲队列、失败降级、customSink 注入 |
| S57-02 | 错误码分布追踪 | `cloudfunctions/common/error-tracker.ts` | 多维标签、滑动窗口告警、最近样本 |
| S58-01 | 告警规则引擎 | `cloudfunctions/common/alert.ts` | 4 种规则类型、3 个通知通道、抑制去重 |
| S58-02 | Trace 上下文 | `cloudfunctions/common/trace.ts` | AsyncLocalStorage 隔离、header 协议、日志注入 |
| S57-99 | 汇总 CI 审计 | `scripts/audit-s57-monitoring.js` | 88 项检查 |
| S57-99-DOC | 交付文档 | `docs/SPRINT_57_58_DELIVERY.md` | 本文档 |

## 2. 核心设计

### 2.1 三支柱可观测性

```
┌─────────────────┐     ┌──────────────┐     ┌──────────────┐
│  Business Code  │ ──▶ │  Metrics     │ ──▶ │   CLS / 告警  │
│  (业务埋点)     │     │  (聚合)      │     │              │
└────────┬────────┘     └──────────────┘     └──────────────┘
         │                     ▲
         │   trackError()      │
         ▼                     │
┌─────────────────┐     ┌──────────────┐
│  ErrorTracker   │ ──▶ │  Alert Engine│
│  (错误码分布)   │     │  (规则评估)  │
└─────────────────┘     └──────────────┘
         ▲
         │   trace_id / span_id
┌─────────────────┐
│  Trace Context  │ ──▶ 注入到 logger / metrics labels
│  (调用链追踪)   │
└─────────────────┘
```

### 2.2 模块依赖关系

```
metrics.ts  ◀── cls-sink.ts (发送指标)
       ▲
       │ trackError → BIZ_METRICS.errorCodeTotal
       │
error-tracker.ts
       │ 滑动窗口告警
       ▼
   alert.ts (规则评估)
       ▲
       │ trace_id 注入
       │
   trace.ts
```

## 3. 详细模块说明

### 3.1 S57-01 metrics.ts — 业务 metrics 收集

**类型系统：**
- **Counter** — 单调递增计数器（订单创建数、错误数）
- **Gauge** — 瞬时值（在线用户数、队列长度）
- **Histogram** — 桶分布 + P50/P95/P99（订单金额、支付耗时）

**关键能力：**
- LRU 淘汰：每个 metric 名最多 1000 个 series
- 标签维度：每个 series 可附加任意 KV 标签
- 快照导出：`getMetricsSnapshot()` 拉取全部指标状态
- 业务预设：`BIZ_METRICS` 暴露订单/支付/风控/限流/错误码共 11 个内置指标

**典型用法：**
```typescript
import { BIZ_METRICS } from './common/metrics'

BIZ_METRICS.orderCreateTotal.inc()
BIZ_METRICS.orderAmountFen.observe(12300)
BIZ_METRICS.paymentDurationMs.observe(elapsedMs)
```

### 3.2 S57-01 cls-sink.ts — CLS 落地

**缓冲策略：**
- 30s 周期 flush（可配）
- 批大小 100 条/次（可配）
- 内存缓冲上限 1000 条（超出截断尾部）
- 失败保留在缓冲，下次重试

**优雅降级：**
- 静默 catch，不阻塞业务
- 暴露 `FLUSH_FAILURE_COUNT` 供上层检测
- 失败不丢弃数据（保留重试）

**可测试性：**
- `customSink` 注入：单元测试无需 mock fetch
- `getSinkStatus()` 返回运行状态

**CLS entry 格式：**
```json
{
  "timestamp": 1717000000000,
  "topicId": "metrics-prod",
  "source": "metrics",
  "metric_name": "order_create_total",
  "metric_type": "counter",
  "value": 1234,
  "labels": { "service": "orderService" },
  "service": "orderService",
  "level": "INFO"
}
```

### 3.3 S57-02 error-tracker.ts — 错误码分布

**数据结构：**
```
ERROR_STATS: Map<code, ErrorStats>
  ├─ count: 累计次数
  ├─ firstSeen / lastSeen: 时间戳
  ├─ services: { serviceName → count }（多维分布）
  ├─ actions: { actionName → count }（多维分布）
  └─ recentSamples: ErrorSample[] (最近 100 条)
```

**滑动窗口告警：**
```typescript
setErrorAlertThreshold('RATE_LIMITED', {
  windowSec: 60,
  maxCount: 100,
  onAlert: (code, count, windowSec) => {
    // 触发自定义通知
  }
})
```

**集成 BIZ_METRICS：**
- 每次 `trackError()` 自动 +1 到 `error_code_total{code, service, action}`
- 告警同时记录到 `logger.warn`

### 3.4 S58-01 alert.ts — 告警规则引擎

**4 种规则类型：**

| 类型 | 用途 | 评估方式 |
|------|------|----------|
| `threshold` | 简单阈值（如错误数 > 100） | 读取 counter / gauge 当前值 |
| `rate` | 速率（如每分钟错误数 / 60s） | counter / windowSec |
| `error_rate` | 错误率（如 5xx / total > 5%） | (errors / total) × 100 |
| `latency` | 延迟（如 P95 > 5000ms） | histogram.p95 / p99 |

**3 个通知通道：**
- `console` — 直接 console.log/warn/error
- `webhook` — HTTP POST 到指定 URL
- `noop` — 占位（生产可扩展 SMS / 企微 / 钉钉）

**抑制去重：**
- 同一 `ruleId` 在 `suppressWindowMs`（默认 5 分钟）内只触发一次
- 避免告警风暴

**内置 5 条业务规则：**
- `order_create_error_rate_high` — 订单错误率 > 10%
- `payment_create_error_high` — 支付错误 > 50/min
- `rate_limit_hit_high` — 限流命中 > 1000/min
- `payment_latency_p95_high` — 支付 P95 > 5000ms
- `risk_duration_p95_high` — 风控 P95 > 250ms

### 3.5 S58-02 trace.ts — Trace 上下文

**核心数据结构：**
```typescript
interface TraceContextData {
  traceId: string       // UUID v4
  spanId: string        // 16 字符 hex
  parentSpanId?: string // 父 span（子 span 时存在）
  startTime: number     // ms
  openid?: string       // 关联用户
  action?: string       // 关联 action / route
  tags: Record<string, string>  // 自由标签
}
```

**AsyncLocalStorage 隔离：**
- Node 18+ 原生支持
- 高并发场景下不会上下文串扰
- 失败时 fallback 到 process 全局（单请求场景安全）

**跨服务传播：**
- header 协议：`00-{traceId}-{spanId}-01`
- 解析 `fromHeader(event.traceparent)`
- 子 span：`createChildSpan(parent)` 保留 traceId，生成新 spanId

**日志注入：**
```typescript
const fields = enrichLogFields({ foo: 'bar' })
// → { foo: 'bar', trace_id: '...', span_id: '...', openid: '...', duration_ms: 12 }
```

**装饰器：**
```typescript
exports.main = withTrace(async (event, context) => {
  // 自动从 event.traceparent 恢复，否则创建根 trace
  // 自动 runWithTrace
})
```

## 4. 数据流示例（一次订单创建）

```
1. 请求进入云函数
   └─▶ withTrace 创建根 trace（trace_id=T1, span_id=S1）
       └─▶ 业务处理
           ├─▶ BIZ_METRICS.orderCreateTotal.inc()
           ├─▶ BIZ_METRICS.orderAmountFen.observe(12300)
           ├─▶ (异常时) trackError(e, { service, action })
           │   └─▶ BIZ_METRICS.errorCodeTotal.inc()
           │   └─▶ ERROR_STATS 更新（可能触发滑动窗口告警）
           └─▶ logger.warn(..., enrichLogFields(...))  ← 自动注入 trace_id

2. 30s 后 cls-sink 周期 flush
   └─▶ 读取 metrics snapshot
       └─▶ 批量发送 CLS

3. 30s 后 alert engine 评估规则
   └─▶ 检查所有规则阈值
       └─▶ 触发时通过 console / webhook 通知
```

## 5. 集成方式

### 5.1 云函数入口初始化

```typescript
// cloudfunctions/orderService/index.ts
import { initClsSink, flushMetrics, shutdown } from './common/cls-sink'
import { initAlertEngine, ALERT_BUILTIN_RULES, BIZ_METRICS } from './common/alert'
import { withTrace } from './common/trace'

// 1. 初始化 CLS
initClsSink({
  endpoint: process.env.CLS_ENDPOINT,
  topicId: process.env.CLS_TOPIC_ID,
})

// 2. 初始化告警
initAlertEngine({
  evaluationIntervalMs: 30000,
  channels: [
    { kind: 'console' },
    { kind: 'webhook', url: process.env.ALERT_WEBHOOK_URL },
  ],
})
ALERT_BUILTIN_RULES.forEach(r => addRule(r))

// 3. handler 包裹 trace
export const main = withTrace(async (event, context) => {
  // 业务处理
  BIZ_METRICS.orderCreateTotal.inc()

  // 退出前 flush
  await flushMetrics()

  return { code: 0, message: 'ok' }
})
```

### 5.2 Admin 查询接口（示例）

```typescript
// 错误码分布
const dist = getErrorDistribution({ topN: 10 })
// → { totalErrors, uniqueCodes, topErrors: [{ code, count, ... }] }

// 指标快照
const snap = getMetricsSnapshot()
// → { counters, gauges, histograms, P50/P95/P99 }

// 告警历史
const history = getAlertHistory({ sinceMs: Date.now() - 3600_000, limit: 50 })
```

## 6. 性能与可扩展性

| 维度 | 指标 | 备注 |
|------|------|------|
| metrics 内存占用 | ~1000 series × ~200B/series ≈ 200KB | LRU 淘汰 |
| metrics 写吞吐 | ~100K ops/s | 纯 Map 操作 |
| CLS flush 耗时 | < 100ms（100 条） | 异步 HTTP |
| alert 评估耗时 | < 10ms（10 条规则） | 纯 Map 操作 |
| trace ALS 开销 | ~1μs / call | Node 18 原生 |

## 7. 后续优化方向

- [ ] 接入 Prometheus exporter（替换 customSink）
- [ ] OTLP trace 协议支持
- [ ] 告警分组 + 升级（severity → oncall）
- [ ] 慢查询自动 trace 关联
- [ ] Dashboard 模板（Grafana JSON）

## 8. CI 审计

```bash
node scripts/audit-s57-monitoring.js
```

当前 **88 项检查全部通过**：
- S57-01 metrics.ts 26 项
- S57-01 cls-sink.ts 13 项
- S57-02 error-tracker.ts 13 项
- S58-01 alert.ts 19 项
- S58-02 trace.ts 15 项
- S57-99 文档 2 项

## 9. 参考资料

- OpenTelemetry — https://opentelemetry.io/
- Prometheus Metric Types — https://prometheus.io/docs/concepts/metric_types/
- W3C Trace Context — https://www.w3.org/TR/trace-context/
- 腾讯云 CLS — https://cloud.tencent.com/document/product/614
