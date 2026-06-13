/**
 * k6 性能基线脚本 - 活动报名场景
 *
 * 目标：建立活动报名的 P50/P95/P99 响应时间基线。
 *
 * 用法：
 *   k6 run --out json=results/activity-register-baseline.json \
 *          --env BASE_URL=https://staging.example.com \
 *          --env CLOUDBASE_ENV=staging-1 \
 *          scripts/perf/activity-register-flow.js
 */

import http from 'k6/http'
import { check, sleep } from 'k6'
import { Trend, Rate } from 'k6/metrics'

// ===== 自定义指标 =====
const activityListDuration = new Trend('activity_list_duration', true)
const activityDetailDuration = new Trend('activity_detail_duration', true)
const registerDuration = new Trend('register_duration', true)
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
    activity_flow: {
      executor: 'constant-vus',
      vus: STAGE_CONFIG[STAGES].vus,
      duration: STAGE_CONFIG[STAGES].duration,
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    'http_req_duration{scenario:activity_flow}': ['p(95)<2000'],
    http_req_failed: ['rate<0.01'],
    business_error_rate: ['rate<0.10'],
  },
  noConnectionReuse: false,
  userAgent: 'k6-perf-test/1.0 (activity register baseline)',
}

// ===== 辅助函数 =====
function callCloudFunction(serviceName, action, body, openid) {
  const url = `${BASE_URL}/api/${CLOUDBASE_ENV}-${serviceName}`
  return http.post(url, JSON.stringify({ action, data: body, openid }), {
    headers: {
      'Content-Type': 'application/json',
      'X-Test-Source': 'k6-perf-activity',
    },
  })
}

// ===== 主流程 =====
export default function () {
  const openid = `test_user_${__VU}_${__ITER}`

  // 1. 获取活动列表
  const listRes = callCloudFunction('activityService', 'getActivityList', {
    status: 'published',
    page: 1,
    pageSize: 10,
  })

  activityListDuration.add(listRes.timings.duration)

  const listSuccess = check(listRes, {
    'activity list status is 200': (r) => r.status === 200,
    'activity list code is 0': (r) => {
      try {
        const body = JSON.parse(r.body)
        return body.code === 0
      } catch (e) {
        return false
      }
    },
  })

  if (!listSuccess) {
    errorRate.add(1)
    sleep(1)
    return
  }

  // 2. 获取活动详情（随机选择一个）
  try {
    const listBody = JSON.parse(listRes.body)
    const activities = listBody.data?.list || []
    if (activities.length > 0) {
      const randomIndex = Math.floor(Math.random() * activities.length)
      const activityId = activities[randomIndex]._id

      const detailRes = callCloudFunction('activityService', 'getActivityDetail', {
        activityId,
      })

      activityDetailDuration.add(detailRes.timings.duration)

      const detailSuccess = check(detailRes, {
        'activity detail status is 200': (r) => r.status === 200,
        'activity detail code is 0': (r) => {
          try {
            const body = JSON.parse(r.body)
            return body.code === 0
          } catch (e) {
            return false
          }
        },
      })

      if (!detailSuccess) {
        errorRate.add(1)
        sleep(1)
        return
      }

      // 3. 提交报名（可能失败，如已报名）
      const registerRes = callCloudFunction('activityService', 'submitRegistration', {
        activityId,
        petIds: [`pet_${__VU}`],
        petDetails: [{ name: 'TestPet', type: 'dog' }],
      })

      registerDuration.add(registerRes.timings.duration)

      // 报名可能失败（已报名/活动已满），只统计 HTTP 错误
      const registerHttpSuccess = check(registerRes, {
        'register status is 200': (r) => r.status === 200,
      })

      if (!registerHttpSuccess) {
        errorRate.add(1)
      } else {
        errorRate.add(0)
      }
    }
  } catch (e) {
    errorRate.add(1)
  }

  sleep(1)
}

// ===== 汇总输出 =====
export function handleSummary(data) {
  const summary = {
    timestamp: new Date().toISOString(),
    scenario: 'activity_flow',
    stage: STAGES,
    metrics: {
      activity_list_duration: {
        avg: data.metrics.activity_list_duration?.values?.avg || 0,
        min: data.metrics.activity_list_duration?.values?.min || 0,
        max: data.metrics.activity_list_duration?.values?.max || 0,
        p50: data.metrics.activity_list_duration?.values?.['p(50)'] || 0,
        p90: data.metrics.activity_list_duration?.values?.['p(90)'] || 0,
        p95: data.metrics.activity_list_duration?.values?.['p(95)'] || 0,
        p99: data.metrics.activity_list_duration?.values?.['p(99)'] || 0,
      },
      activity_detail_duration: {
        avg: data.metrics.activity_detail_duration?.values?.avg || 0,
        min: data.metrics.activity_detail_duration?.values?.min || 0,
        max: data.metrics.activity_detail_duration?.values?.max || 0,
        p50: data.metrics.activity_detail_duration?.values?.['p(50)'] || 0,
        p90: data.metrics.activity_detail_duration?.values?.['p(90)'] || 0,
        p95: data.metrics.activity_detail_duration?.values?.['p(95)'] || 0,
        p99: data.metrics.activity_detail_duration?.values?.['p(99)'] || 0,
      },
      register_duration: {
        avg: data.metrics.register_duration?.values?.avg || 0,
        min: data.metrics.register_duration?.values?.min || 0,
        max: data.metrics.register_duration?.values?.max || 0,
        p50: data.metrics.register_duration?.values?.['p(50)'] || 0,
        p90: data.metrics.register_duration?.values?.['p(90)'] || 0,
        p95: data.metrics.register_duration?.values?.['p(95)'] || 0,
        p99: data.metrics.register_duration?.values?.['p(99)'] || 0,
      },
      http_req_failed: data.metrics.http_req_failed?.values?.rate || 0,
      business_error_rate: data.metrics.business_error_rate?.values?.rate || 0,
    },
  }

  return {
    stdout: JSON.stringify(summary, null, 2),
    [`results/activity-register-${STAGES}-summary.json`]: JSON.stringify(summary, null, 2),
  }
}
