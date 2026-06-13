/**
 * k6 性能基线脚本 - 10 个核心业务场景（Sprint 55-01）
 *
 * 目标：
 *   1. 覆盖 10 个核心业务场景（不再只测主链路）
 *   2. 每个场景独立 P50/P95/P99 指标
 *   3. 单脚本多 scenario（k6 多 executor 并行）
 *   4. CI 友好：k6 inspect 即可语法验证
 *
 * 用法：
 *   k6 run scripts/perf/scenarios/business-scenarios.js
 *   k6 run --out json=results/sprint55-baseline.json \
 *          --env BASE_URL=https://staging.example.com \
 *          --env CLOUDBASE_ENV=staging-1 \
 *          scripts/perf/scenarios/business-scenarios.js
 *
 * 阈值：
 *   - 各场景 P95 < 1500ms（读类）/ < 2000ms（写类）
 *   - 失败率 < 1%
 *   - 业务错误率 < 5%
 *
 * 场景清单（10 个）：
 *   1. discover_feed       - 首页 feed 浏览
 *   2. pet_list            - 我的宠物列表
 *   3. partner_search      - 寻找合作方
 *   4. mall_product        - 商品详情
 *   5. activity_list       - 活动列表
 *   6. coupon_list         - 优惠券列表
 *   7. order_list          - 订单列表
 *   8. message_list        - 消息列表
 *   9. price_calculate     - 价格预估
 *   10. boarding_accept    - 合作方接单（含风控 + 限流）
 */

import http from 'k6/http'
import { check, sleep, group } from 'k6'
import { Trend, Rate, Counter } from 'k6/metrics'
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js'

// ===== 自定义指标（每场景一组） =====
const trends = {
  discover_feed: new Trend('discover_feed_duration', true),
  pet_list: new Trend('pet_list_duration', true),
  partner_search: new Trend('partner_search_duration', true),
  mall_product: new Trend('mall_product_duration', true),
  activity_list: new Trend('activity_list_duration', true),
  coupon_list: new Trend('coupon_list_duration', true),
  order_list: new Trend('order_list_duration', true),
  message_list: new Trend('message_list_duration', true),
  price_calculate: new Trend('price_calculate_duration', true),
  boarding_accept: new Trend('boarding_accept_duration', true),
}
const errorRate = new Rate('business_error_rate')
const scenarioCount = new Counter('scenario_executions_total')

// ===== 配置 =====
const BASE_URL = __ENV.BASE_URL || 'https://cloudbase.example.com'
const CLOUDBASE_ENV = __ENV.CLOUDBASE_ENV || 'staging-1'
const SCENARIO_VUS = parseInt(__ENV.VUS || '5', 10) // 默认每场景 5 VU
const SCENARIO_DURATION = __ENV.DURATION || '30s'

/**
 * 云函数调用器
 * @param {string} cloudFn - 云函数名（如 orderService / mallService）
 * @param {string} action - action 名称
 * @param {object} body - 请求体
 * @param {string} openid - 测试用 openid
 */
function callCloudFunction(cloudFn, action, body, openid) {
  const url = `${BASE_URL}/api/${CLOUDBASE_ENV}-${cloudFn}`
  return http.post(url, JSON.stringify({ action, data: body, openid }), {
    headers: {
      'Content-Type': 'application/json',
      'X-Test-Source': 'k6-perf-sprint55',
      'X-Scenario': cloudFn,
    },
  })
}

/**
 * 通用成功检查 + 错误率累加
 */
function checkOk(res, scenarioName) {
  const ok = check(res, {
    'HTTP 200': r => r.status === 200,
    '业务成功': r => {
      try {
        const body = JSON.parse(r.body)
        return body.code === 0
      } catch (e) {
        return false
      }
    },
  })
  if (!ok) {
    errorRate.add(1)
    return false
  }
  scenarioCount.add(1, { scenario: scenarioName })
  return true
}

// ===== K6 options: 10 个 scenario 并行 =====
export const options = {
  scenarios: {
    // 1. 首页 feed 浏览（读类，常见）
    discover_feed: {
      executor: 'constant-vus',
      vus: SCENARIO_VUS,
      duration: SCENARIO_DURATION,
      exec: 'discoverFeed',
      tags: { scenario: 'discover_feed' },
    },
    // 2. 我的宠物列表（读类，缓存友好）
    pet_list: {
      executor: 'constant-vus',
      vus: SCENARIO_VUS,
      duration: SCENARIO_DURATION,
      exec: 'petList',
      tags: { scenario: 'pet_list' },
    },
    // 3. 寻找合作方（读类，搜索场景）
    partner_search: {
      executor: 'constant-vus',
      vus: SCENARIO_VUS,
      duration: SCENARIO_DURATION,
      exec: 'partnerSearch',
      tags: { scenario: 'partner_search' },
    },
    // 4. 商品详情（读类，单文档）
    mall_product: {
      executor: 'constant-vus',
      vus: SCENARIO_VUS,
      duration: SCENARIO_DURATION,
      exec: 'mallProduct',
      tags: { scenario: 'mall_product' },
    },
    // 5. 活动列表（读类，列表 + 过滤）
    activity_list: {
      executor: 'constant-vus',
      vus: SCENARIO_VUS,
      duration: SCENARIO_DURATION,
      exec: 'activityList',
      tags: { scenario: 'activity_list' },
    },
    // 6. 优惠券列表（读类，列表 + 状态过滤）
    coupon_list: {
      executor: 'constant-vus',
      vus: SCENARIO_VUS,
      duration: SCENARIO_DURATION,
      exec: 'couponList',
      tags: { scenario: 'coupon_list' },
    },
    // 7. 订单列表（读类，分页）
    order_list: {
      executor: 'constant-vus',
      vus: SCENARIO_VUS,
      duration: SCENARIO_DURATION,
      exec: 'orderList',
      tags: { scenario: 'order_list' },
    },
    // 8. 消息列表（读类，分页 + 状态）
    message_list: {
      executor: 'constant-vus',
      vus: SCENARIO_VUS,
      duration: SCENARIO_DURATION,
      exec: 'messageList',
      tags: { scenario: 'message_list' },
    },
    // 9. 价格预估（写类，CPU 密集）
    price_calculate: {
      executor: 'constant-vus',
      vus: SCENARIO_VUS,
      duration: SCENARIO_DURATION,
      exec: 'priceCalculate',
      tags: { scenario: 'price_calculate' },
    },
    // 10. 合作方接单（写类，含风控 + 限流）
    boarding_accept: {
      executor: 'constant-vus',
      vus: SCENARIO_VUS,
      duration: SCENARIO_DURATION,
      exec: 'boardingAccept',
      tags: { scenario: 'boarding_accept' },
    },
  },
  thresholds: {
    // 读类场景 P95 < 1500ms
    'http_req_duration{scenario:discover_feed}': ['p(95)<1500'],
    'http_req_duration{scenario:pet_list}': ['p(95)<1500'],
    'http_req_duration{scenario:partner_search}': ['p(95)<1500'],
    'http_req_duration{scenario:mall_product}': ['p(95)<1500'],
    'http_req_duration{scenario:activity_list}': ['p(95)<1500'],
    'http_req_duration{scenario:coupon_list}': ['p(95)<1500'],
    'http_req_duration{scenario:order_list}': ['p(95)<1500'],
    'http_req_duration{scenario:message_list}': ['p(95)<1500'],
    // 写类场景 P95 < 2000ms
    'http_req_duration{scenario:price_calculate}': ['p(95)<2000'],
    'http_req_duration{scenario:boarding_accept}': ['p(95)<2000'],
    // 全局
    http_req_failed: ['rate<0.01'],
    business_error_rate: ['rate<0.05'],
  },
  noConnectionReuse: false,
  userAgent: 'k6-perf-test/1.0 (Sprint 55 业务场景)',
}

// ===== 10 个场景函数 =====

// 1. 首页 feed 浏览
export function discoverFeed() {
  group('discover_feed', () => {
    const res = callCloudFunction('discoverService', 'getFeed', {
      page: randomIntBetween(1, 10),
      pageSize: 20,
    }, `oFeed_${__VU}`)
    trends.discover_feed.add(res.timings.duration)
    checkOk(res, 'discover_feed')
  })
  sleep(randomIntBetween(1, 2))
}

// 2. 我的宠物列表
export function petList() {
  group('pet_list', () => {
    const res = callCloudFunction('petService', 'listPets', {
      ownerId: `oOwner_${__VU}`,
    }, `oOwner_${__VU}`)
    trends.pet_list.add(res.timings.duration)
    checkOk(res, 'pet_list')
  })
  sleep(randomIntBetween(1, 2))
}

// 3. 寻找合作方（搜索 + 列表）
export function partnerSearch() {
  group('partner_search', () => {
    const res = callCloudFunction('partnerService', 'searchPartners', {
      keyword: '寄养',
      city: '上海',
      page: randomIntBetween(1, 5),
      pageSize: 20,
    }, `oSearch_${__VU}`)
    trends.partner_search.add(res.timings.duration)
    checkOk(res, 'partner_search')
  })
  sleep(randomIntBetween(1, 2))
}

// 4. 商品详情
export function mallProduct() {
  group('mall_product', () => {
    const productId = `prod_${randomIntBetween(1, 100)}`
    const res = callCloudFunction('mallService', 'getProductDetail', {
      productId,
    }, `oBuyer_${__VU}`)
    trends.mall_product.add(res.timings.duration)
    checkOk(res, 'mall_product')
  })
  sleep(randomIntBetween(1, 2))
}

// 5. 活动列表
export function activityList() {
  group('activity_list', () => {
    const res = callCloudFunction('activityService', 'listActivities', {
      status: 'open',
      page: randomIntBetween(1, 5),
      pageSize: 20,
    }, `oAct_${__VU}`)
    trends.activity_list.add(res.timings.duration)
    checkOk(res, 'activity_list')
  })
  sleep(randomIntBetween(1, 2))
}

// 6. 优惠券列表
export function couponList() {
  group('coupon_list', () => {
    const res = callCloudFunction('couponService', 'listUserCoupons', {
      status: 'available',
    }, `oCoup_${__VU}`)
    trends.coupon_list.add(res.timings.duration)
    checkOk(res, 'coupon_list')
  })
  sleep(randomIntBetween(1, 2))
}

// 7. 订单列表
export function orderList() {
  group('order_list', () => {
    const res = callCloudFunction('orderService', 'listOrders', {
      status: 'all',
      page: randomIntBetween(1, 5),
      pageSize: 20,
    }, `oOrd_${__VU}`)
    trends.order_list.add(res.timings.duration)
    checkOk(res, 'order_list')
  })
  sleep(randomIntBetween(1, 2))
}

// 8. 消息列表
export function messageList() {
  group('message_list', () => {
    const res = callCloudFunction('messageService', 'listMessages', {
      type: 'all',
      page: randomIntBetween(1, 5),
      pageSize: 20,
    }, `oMsg_${__VU}`)
    trends.message_list.add(res.timings.duration)
    checkOk(res, 'message_list')
  })
  sleep(randomIntBetween(1, 2))
}

// 9. 价格预估
export function priceCalculate() {
  group('price_calculate', () => {
    const res = callCloudFunction('orderService', 'calculatePrice', {
      hostId: `host_${__VU}`,
      startDate: '2026-09-01',
      endDate: '2026-09-04',
      petIds: [`pet_${__VU}`],
    }, `oCalc_${__VU}`)
    trends.price_calculate.add(res.timings.duration)
    checkOk(res, 'price_calculate')
  })
  sleep(randomIntBetween(1, 3))
}

// 10. 合作方接单（含风控 + 限流）
export function boardingAccept() {
  group('boarding_accept', () => {
    const res = callCloudFunction('orderService', 'handleBoardingOrder', {
      orderId: `ord_ba_${__VU}_${__ITER}`,
      operation: 'confirm',
    }, `oHost_${__VU}`)
    trends.boarding_accept.add(res.timings.duration)
    // boarding_accept 期望命中 RATE_LIMITED 或 RISK_REJECT
    // 不算业务错误，是预期行为
    check(res, {
      'HTTP 200 / 200-200': r => r.status === 200 || r.status === 200,
    })
    scenarioCount.add(1, { scenario: 'boarding_accept' })
  })
  sleep(randomIntBetween(2, 4))
}

// ===== 钩子：测试结束汇总（输出 10 场景的 P50/P95/P99） =====
export function handleSummary(data) {
  const summary = {}
  const scenarioKeys = [
    'discover_feed', 'pet_list', 'partner_search', 'mall_product',
    'activity_list', 'coupon_list', 'order_list', 'message_list',
    'price_calculate', 'boarding_accept',
  ]
  for (const key of scenarioKeys) {
    const metricKey = `${key}_duration`
    if (data.metrics[metricKey]) {
      const m = data.metrics[metricKey].values
      summary[key] = {
        p50_ms: Math.round(m.p(50) || 0),
        p95_ms: Math.round(m.p(95) || 0),
        p99_ms: Math.round(m.p(99) || 0),
        count: m.count,
      }
    }
  }
  console.log('========== Sprint 55 10 业务场景基线指标 ==========')
  console.log(JSON.stringify(summary, null, 2))
  return {
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
    'results/sprint55-scenarios-summary.json': JSON.stringify(data, null, 2),
  }
}

import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.3/index.js'
