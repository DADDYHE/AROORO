/**
 * k6 性能基线脚本 - 「下单 → 价格预估 → 调起支付」主链路
 *
 * 目标：建立 P50/P95/P99 响应时间基线，监控后续迭代中的回归。
 *
 * 用法：
 *   # 1. 安装 k6: https://k6.io/docs/getting-started/installation/
 *   # 2. 部署 staging 环境（或在本地用 cloudbase 本地调试）
 *   # 3. 运行基线测试：
 *      k6 run --out json=results/sprint9-baseline.json \
 *             --env BASE_URL=https://staging.example.com \
 *             --env CLOUDBASE_ENV=staging-1 \
 *             scripts/perf/main-flow.js
 *
 * 阈值（生产环境基线，可在 Sprint 9 后调整）：
 *   - http_req_duration P95 < 1500ms（主链路）
 *   - http_req_failed rate < 1%
 *   - 单实例 50 VU 持续 30s 不触发 5xx 雪崩
 *
 * 建议阶梯：
 *   - 阶段 1：冒烟（1 VU × 10 次）—— 验证环境正常
 *   - 阶段 2：基线（10 VU × 30s）—— 记录稳态指标
 *   - 阶段 3：压力（50 VU × 60s ramp-up 30s）—— 探明拐点
 *   - 阶段 4：极限（100 VU × 60s）—— 仅在容量评估时使用
 */

import http from 'k6/http'
import { check, sleep } from 'k6'
import { Trend, Rate } from 'k6/metrics'
import { SharedArray } from 'k6/data'
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js'

// ===== 自定义指标 =====
const calculatePriceDuration = new Trend('calculate_price_duration', true)
const createOrderDuration = new Trend('create_order_duration', true)
const payDuration = new Trend('pay_duration', true)
const errorRate = new Rate('business_error_rate')

// ===== 测试数据集（用 SharedArray 在 VU 间共享，避免每 VU 重新加载） =====
const testData = new SharedArray('test-data', function () {
  return [
    { ownerId: `oOwner_${__VU}`, petId: `pet_${__VU}`, hostId: `host_${__VU}` },
    // 更多 fixture... 生产中通常从 CSV 加载
  ]
})

// ===== 配置 =====
const BASE_URL = __ENV.BASE_URL || 'https://cloudbase.example.com'
const CLOUDBASE_ENV = __ENV.CLOUDBASE_ENV || 'staging-1'
const STAGES = __ENV.STAGES || 'baseline'  // smoke | baseline | stress | limit

const STAGE_CONFIG = {
  smoke:    { vus: 1,  duration: '10s' },
  baseline: { vus: 10, duration: '30s' },
  stress:   { vus: 50, duration: '1m' },
  limit:    { vus: 100, duration: '1m' },
}

export const options = {
  scenarios: {
    main_flow: {
      executor: 'constant-vus',
      vus: STAGE_CONFIG[STAGES].vus,
      duration: STAGE_CONFIG[STAGES].duration,
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    // 1. 主链路 P95 < 1.5s
    'http_req_duration{scenario:main_flow}': ['p(95)<1500'],
    'http_req_duration{group:::main_flow}': ['p(95)<1500'],
    // 2. 失败率 < 1%
    http_req_failed: ['rate<0.01'],
    // 3. 业务错误率 < 5%（业务层 4xx 不算 HTTP 失败，但要统计）
    business_error_rate: ['rate<0.05'],
  },
  // k6 推荐开启详细 timing
  noConnectionReuse: false,
  userAgent: 'k6-perf-test/1.0 (Sprint 9 baseline)',
}

// ===== 辅助函数 =====

/**
 * 调起云函数
 * @param {string} action - 云函数 action 名称
 * @param {object} body - 请求体
 * @param {string} openid - 测试用 openid
 */
function callCloudFunction(action, body, openid) {
  const url = `${BASE_URL}/api/${CLOUDBASE_ENV}-order-service`
  return http.post(url, JSON.stringify({ action, data: body, openid }), {
    headers: {
      'Content-Type': 'application/json',
      'X-Test-Source': 'k6-perf-sprint9',
    },
  })
}

// ===== 主流程 =====
export default function () {
  const fixture = testData[__VU % testData.length]
  const openid = fixture.ownerId

  // ===== 阶段 1：价格预估 =====
  const startDate = '2026-09-01'
  const endDate = '2026-09-04'

  const calcRes = callCloudFunction('calculatePrice', {
    hostId: fixture.hostId,
    startDate,
    endDate,
    petIds: [fixture.petId],
  }, openid)

  calculatePriceDuration.add(calcRes.timings.duration)
  const calcOk = check(calcRes, {
    'calculatePrice 200': r => r.status === 200,
    'calculatePrice 业务成功': r => {
      try {
        const body = JSON.parse(r.body)
        return body.code === 0 && body.data && body.data.totalPrice > 0
      } catch (e) {
        return false
      }
    },
  })
  if (!calcOk) {errorRate.add(1); return}

  // ===== 阶段 2：下单 =====
  const createStart = Date.now()
  const createRes = callCloudFunction('createOrder', {
    hostId: fixture.hostId,
    petIds: [fixture.petId],
    startDate,
    endDate,
    note: `k6 perf test VU=${__VU} iter=${__ITER}`,
  }, openid)
  createOrderDuration.add(Date.now() - createStart)

  const createOk = check(createRes, {
    'createOrder 200': r => r.status === 200,
    'createOrder 返回 orderId': r => {
      try {
        const body = JSON.parse(r.body)
        return body.code === 0 && body.data && body.data.orderId
      } catch (e) {
        return false
      }
    },
  })
  if (!createOk) {errorRate.add(1); return}

  const orderId = JSON.parse(createRes.body).data.orderId

  // ===== 阶段 3：调起支付 =====
  const payStart = Date.now()
  const payRes = callCloudFunction('createPayment', {
    type: 'order',
    orderId,
    amount: JSON.parse(calcRes.body).data.totalPrice * 100, // 转换为分
  }, openid)
  payDuration.add(Date.now() - payStart)

  const payOk = check(payRes, {
    'createPayment 200': r => r.status === 200,
    'createPayment 返回 prepay_id': r => {
      try {
        const body = JSON.parse(r.body)
        return body.code === 0 && body.data && body.data.paymentParams
      } catch (e) {
        return false
      }
    },
  })
  if (!payOk) {errorRate.add(1)}

  // 模拟真实用户：每个 VU 完成一次主流程后短暂停顿
  sleep(randomIntBetween(1, 3))
}

// ===== 钩子：测试结束汇总 =====
export function handleSummary(data) {
  const customMetrics = {
    p50_calculatePrice: data.metrics.calculate_price_duration.values.p(50),
    p95_calculatePrice: data.metrics.calculate_price_duration.values.p(95),
    p99_calculatePrice: data.metrics.calculate_price_duration.values.p(99),
    p50_createOrder:    data.metrics.create_order_duration.values.p(50),
    p95_createOrder:    data.metrics.create_order_duration.values.p(95),
    p99_createOrder:    data.metrics.create_order_duration.values.p(99),
    p50_pay:            data.metrics.pay_duration.values.p(50),
    p95_pay:            data.metrics.pay_duration.values.p(95),
    p99_pay:            data.metrics.pay_duration.values.p(99),
  }
  console.log('========== Sprint 9 主链路基线指标 ==========')
  console.log(JSON.stringify(customMetrics, null, 2))
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'results/sprint9-baseline-summary.json': JSON.stringify(data, null, 2),
  }
}

import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.3/index.js'
