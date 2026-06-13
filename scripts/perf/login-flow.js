/**
 * k6 性能基线脚本 - 用户登录场景
 *
 * 目标：建立用户登录的 P50/P95/P99 响应时间基线。
 *
 * 用法：
 *   k6 run --out json=results/login-baseline.json \
 *          --env BASE_URL=https://staging.example.com \
 *          --env CLOUDBASE_ENV=staging-1 \
 *          scripts/perf/login-flow.js
 */

import http from 'k6/http'
import { check, sleep } from 'k6'
import { Trend, Rate } from 'k6/metrics'

// ===== 自定义指标 =====
const loginDuration = new Trend('login_duration', true)
const errorRate = new Rate('business_error_rate')

// ===== 配置 =====
const BASE_URL = __ENV.BASE_URL || 'https://cloudbase.example.com'
const CLOUDBASE_ENV = __ENV.CLOUDBASE_ENV || 'staging-1'
const STAGES = __ENV.STAGES || 'baseline'

const STAGE_CONFIG = {
  smoke: { vus: 1, duration: '10s' },
  baseline: { vus: 10, duration: '30s' },
  stress: { vus: 50, duration: '1m' },
  limit: { vus: 100, duration: '1m' },
}

export const options = {
  scenarios: {
    login_flow: {
      executor: 'constant-vus',
      vus: STAGE_CONFIG[STAGES].vus,
      duration: STAGE_CONFIG[STAGES].duration,
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    'http_req_duration{scenario:login_flow}': ['p(95)<2000'],
    http_req_failed: ['rate<0.01'],
    business_error_rate: ['rate<0.05'],
  },
  noConnectionReuse: false,
  userAgent: 'k6-perf-test/1.0 (login baseline)',
}

// ===== 辅助函数 =====
function callCloudFunction(serviceName, action, body) {
  const url = `${BASE_URL}/api/${CLOUDBASE_ENV}-${serviceName}`
  return http.post(url, JSON.stringify({ action, data: body }), {
    headers: {
      'Content-Type': 'application/json',
      'X-Test-Source': 'k6-perf-login',
    },
  })
}

// ===== 主流程 =====
export default function () {
  const openid = `test_user_${__VU}_${__ITER}`

  // 1. 登录
  const loginRes = callCloudFunction('userService', 'login', {
    userInfo: {
      nickName: `TestUser${__VU}`,
      avatarUrl: '',
    },
    inviterId: '',
  })

  loginDuration.add(loginRes.timings.duration)

  const loginSuccess = check(loginRes, {
    'login status is 200': (r) => r.status === 200,
    'login code is 0': (r) => {
      try {
        const body = JSON.parse(r.body)
        return body.code === 0
      } catch (e) {
        return false
      }
    },
  })

  if (!loginSuccess) {
    errorRate.add(1)
  } else {
    errorRate.add(0)
  }

  sleep(1)
}

// ===== 汇总输出 =====
export function handleSummary(data) {
  const summary = {
    timestamp: new Date().toISOString(),
    scenario: 'login_flow',
    stage: STAGES,
    metrics: {
      login_duration: {
        avg: data.metrics.login_duration?.values?.avg || 0,
        min: data.metrics.login_duration?.values?.min || 0,
        max: data.metrics.login_duration?.values?.max || 0,
        p50: data.metrics.login_duration?.values?.['p(50)'] || 0,
        p90: data.metrics.login_duration?.values?.['p(90)'] || 0,
        p95: data.metrics.login_duration?.values?.['p(95)'] || 0,
        p99: data.metrics.login_duration?.values?.['p(99)'] || 0,
      },
      http_req_failed: data.metrics.http_req_failed?.values?.rate || 0,
      business_error_rate: data.metrics.business_error_rate?.values?.rate || 0,
    },
  }

  return {
    stdout: JSON.stringify(summary, null, 2),
    [`results/login-${STAGES}-summary.json`]: JSON.stringify(summary, null, 2),
  }
}
