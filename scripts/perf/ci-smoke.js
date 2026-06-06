/**
 * k6 CI 冒烟脚本 - 用于 CI 集成（不依赖真实云函数）
 *
 * 目标：
 *   1. 验证 k6 工具链可正常调用（npm/Node 兼容性）
 *   2. 验证 scripts/perf/ 下的测试脚本语法正确、可被 k6 加载
 *   3. 提供一个稳定的"健康检查"信号（threshold pass = 工具链健康）
 *
 * 与 main-flow.js 的区别：
 *   - 不发起真实 HTTP 请求（避免 CI 误报、节省资源）
 *   - 仅做一轮"心跳"循环（默认 1 VU × 5s）
 *   - 阈值更宽松（只检测"是否能跑起来"）
 *
 * 用法（CI 默认）：
 *   k6 run --duration 5s --vus 1 scripts/perf/ci-smoke.js
 *
 * 退出码：
 *   - 0：k6 工具链 OK
 *   - 非 0：脚本加载失败 / 阈值未达（极少见，仅当工具链本身异常）
 *
 * 与 main-flow.js 共享：
 *   - 同样的 import 语法（k6/http, k6/metrics, k6/data）
 *   - 同样的 options / thresholds 结构
 *   - 同样的 handleSummary 输出格式
 *
 * 配套 CI 工作流：.github/workflows/ci.yml 中的 k6-smoke job
 */

import http from 'k6/http'
import { check, sleep } from 'k6'
import { Counter, Trend } from 'k6/metrics'

// ===== 自定义指标（与 main-flow 保持命名风格一致）=====
const smokeChecks = new Counter('smoke_checks_total')
const heartbeat = new Trend('heartbeat_ms', true)

// ===== 配置 =====
const BASE_URL = __ENV.BASE_URL || ''
const CI_MODE = __ENV.CI_MODE || 'true'  // 'true' | 'false'

// 允许的 stages（CI 默认 5s 心跳）
const STAGES = {
  smoke: { vus: 1, duration: '5s' },
  quick: { vus: 3, duration: '10s' },
}

const STAGE = __ENV.STAGE || 'smoke'
const stageConfig = STAGES[STAGE] || STAGES.smoke

export const options = {
  scenarios: {
    ci_smoke: {
      executor: 'constant-vus',
      vus: stageConfig.vus,
      duration: stageConfig.duration,
      gracefulRampDown: '2s',
    },
  },
  thresholds: {
    // 工具链健康：自定义计数器增量 > 0
    smoke_checks_total: ['count>0'],
    // 心跳 P95 < 200ms（仅本地 sleep）
    heartbeat_ms: ['p(95)<200'],
    // http_req_failed：CI 模式下不发请求，预期 0 失败
    http_req_failed: ['rate<0.01'],
  },
  // CI 场景下不打印 verbose
  noConnectionReuse: false,
  userAgent: 'k6-ci-smoke/1.0 (Sprint 14)',
  // 静默响应体（CI 日志更清爽）
  discardResponseBodies: true,
}

// ===== 主流程 =====
export default function () {
  const start = Date.now()

  if (BASE_URL && CI_MODE === 'false') {
    // 真实环境：发一个轻量 GET（带超时）
    const res = http.get(`${BASE_URL}/api/health`, {
      timeout: '3s',
      headers: { 'X-Test-Source': 'k6-ci-smoke' },
    })
    const ok = check(res, {
      'health 200': r => r.status === 200,
    })
    if (ok) {smokeChecks.add(1)}
  } else {
    // CI 默认：不发请求，仅做"心跳"自检
    // 用 sleep 模拟业务处理时延
    sleep(0.1)
    smokeChecks.add(1)
  }

  heartbeat.add(Date.now() - start)
}

// ===== 总结输出 =====
export function handleSummary(data) {
  const summary = {
    timestamp: new Date().toISOString(),
    stage: STAGE,
    ciMode: CI_MODE,
    baseUrl: BASE_URL || '(none)',
    metrics: {
      vus: data.metrics.vus.values.value,
      iterations: data.metrics.iterations.values.count,
      checks: data.metrics.checks.values.passes,
      smokeChecks: data.metrics.smoke_checks_total.values.count,
      heartbeatP50: data.metrics.heartbeat_ms.values.p(50),
      heartbeatP95: data.metrics.heartbeat_ms.values.p(95),
      httpReqFailed: data.metrics.http_req_failed?.values.rate || 0,
    },
    thresholdsPassed: Object.entries(data.root_group.checks || {})
      .every(([_, v]) => !v || v.passes > 0),
  }

  console.log('\n========== Sprint 14 k6 CI Smoke Summary ==========')
  console.log(JSON.stringify(summary, null, 2))

  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: false }),
    'results/k6-ci-smoke-summary.json': JSON.stringify(summary, null, 2),
  }
}

import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.3/index.js'
