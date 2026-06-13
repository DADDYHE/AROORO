/**
 * k6 性能基线脚本 - 商品列表查询场景
 *
 * 目标：建立商品列表查询的 P50/P95/P99 响应时间基线。
 *
 * 用法：
 *   k6 run --out json=results/product-list-baseline.json \
 *          --env BASE_URL=https://staging.example.com \
 *          --env CLOUDBASE_ENV=staging-1 \
 *          scripts/perf/product-list-flow.js
 */

import http from 'k6/http'
import { check, sleep } from 'k6'
import { Trend, Rate } from 'k6/metrics'

// ===== 自定义指标 =====
const productListDuration = new Trend('product_list_duration', true)
const productDetailDuration = new Trend('product_detail_duration', true)
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
    product_flow: {
      executor: 'constant-vus',
      vus: STAGE_CONFIG[STAGES].vus,
      duration: STAGE_CONFIG[STAGES].duration,
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    'http_req_duration{scenario:product_flow}': ['p(95)<1000'],
    http_req_failed: ['rate<0.01'],
    business_error_rate: ['rate<0.05'],
  },
  noConnectionReuse: false,
  userAgent: 'k6-perf-test/1.0 (product list baseline)',
}

// ===== 辅助函数 =====
function callCloudFunction(serviceName, action, body) {
  const url = `${BASE_URL}/api/${CLOUDBASE_ENV}-${serviceName}`
  return http.post(url, JSON.stringify({ action, data: body }), {
    headers: {
      'Content-Type': 'application/json',
      'X-Test-Source': 'k6-perf-product',
    },
  })
}

// ===== 主流程 =====
export default function () {
  // 1. 获取商品列表
  const listRes = callCloudFunction('mallService', 'getProductList', {
    page: 1,
    pageSize: 10,
  })

  productListDuration.add(listRes.timings.duration)

  const listSuccess = check(listRes, {
    'product list status is 200': (r) => r.status === 200,
    'product list code is 0': (r) => {
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

  // 2. 获取商品详情（随机选择一个）
  try {
    const listBody = JSON.parse(listRes.body)
    const products = listBody.data?.list || []
    if (products.length > 0) {
      const randomIndex = Math.floor(Math.random() * products.length)
      const productId = products[randomIndex]._id

      const detailRes = callCloudFunction('mallService', 'getProductDetail', {
        productId,
      })

      productDetailDuration.add(detailRes.timings.duration)

      const detailSuccess = check(detailRes, {
        'product detail status is 200': (r) => r.status === 200,
        'product detail code is 0': (r) => {
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
    scenario: 'product_flow',
    stage: STAGES,
    metrics: {
      product_list_duration: {
        avg: data.metrics.product_list_duration?.values?.avg || 0,
        min: data.metrics.product_list_duration?.values?.min || 0,
        max: data.metrics.product_list_duration?.values?.max || 0,
        p50: data.metrics.product_list_duration?.values?.['p(50)'] || 0,
        p90: data.metrics.product_list_duration?.values?.['p(90)'] || 0,
        p95: data.metrics.product_list_duration?.values?.['p(95)'] || 0,
        p99: data.metrics.product_list_duration?.values?.['p(99)'] || 0,
      },
      product_detail_duration: {
        avg: data.metrics.product_detail_duration?.values?.avg || 0,
        min: data.metrics.product_detail_duration?.values?.min || 0,
        max: data.metrics.product_detail_duration?.values?.max || 0,
        p50: data.metrics.product_detail_duration?.values?.['p(50)'] || 0,
        p90: data.metrics.product_detail_duration?.values?.['p(90)'] || 0,
        p95: data.metrics.product_detail_duration?.values?.['p(95)'] || 0,
        p99: data.metrics.product_detail_duration?.values?.['p(99)'] || 0,
      },
      http_req_failed: data.metrics.http_req_failed?.values?.rate || 0,
      business_error_rate: data.metrics.business_error_rate?.values?.rate || 0,
    },
  }

  return {
    stdout: JSON.stringify(summary, null, 2),
    [`results/product-list-${STAGES}-summary.json`]: JSON.stringify(summary, null, 2),
  }
}
