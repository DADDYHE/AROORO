/**
 * Sprint 50 - rate-limit-monitor.ts 单元测试
 *
 * 覆盖：
 *   1. 文件存在性 + .d.ts 完整性
 *   2. recordRateLimitHit / recordRateLimitConsume / recordRateLimitFallback
 *   3. getMetricsSnapshot 数据正确性
 *   4. 告警 webhook 触发
 *   5. 告警阈值可配置
 *   6. _resetMetrics
 *   7. tsconfig + build 引用
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const SRC = path.join(ROOT, 'cloudfunctions', 'common', 'rate-limit-monitor.ts')
const JS = path.join(ROOT, 'cloudfunctions', 'common', 'rate-limit-monitor.js')
const DTS = path.join(ROOT, 'cloudfunctions', 'common', 'rate-limit-monitor.d.ts')

function readSafe(p) {
  try { return fs.readFileSync(p, 'utf8') } catch (e) { return null }
}

const api = require(JS)
const {
  recordRateLimitHit,
  recordRateLimitConsume,
  recordRateLimitFallback,
  recordRateLimitConfigSource,
  getMetrics,
  getMetricsSnapshot,
  _resetMetrics,
  setAlertWebhook,
  getAlertWebhook,
  setAlertThresholds,
  getAlertThresholds,
  getAlertHistory,
  DEFAULT_ALERT_THRESHOLDS,
} = api

describe('Sprint 50: rate-limit-monitor 监控', () => {
  beforeEach(() => {
    _resetMetrics()
    setAlertWebhook(null)
    setAlertThresholds(DEFAULT_ALERT_THRESHOLDS)
  })

  describe('文件存在性', () => {
    test('.ts 源文件存在', () => expect(fs.existsSync(SRC)).toBe(true))
    test('.js 编译产物存在', () => expect(fs.existsSync(JS)).toBe(true))
    test('.d.ts 声明文件存在', () => expect(fs.existsSync(DTS)).toBe(true))
  })

  describe('.ts 源码契约', () => {
    let ts
    beforeAll(() => { ts = readSafe(SRC) })
    test('导出 recordRateLimitHit', () => {
      expect(ts).toMatch(/export\s+function\s+recordRateLimitHit/)
    })
    test('导出 recordRateLimitConsume', () => {
      expect(ts).toMatch(/export\s+function\s+recordRateLimitConsume/)
    })
    test('导出 recordRateLimitFallback', () => {
      expect(ts).toMatch(/export\s+function\s+recordRateLimitFallback/)
    })
    test('导出 getMetricsSnapshot', () => {
      expect(ts).toMatch(/export\s+function\s+getMetricsSnapshot/)
    })
    test('导出 setAlertWebhook', () => {
      expect(ts).toMatch(/export\s+function\s+setAlertWebhook/)
    })
    test('导出 RateLimitMetricsSnapshot 接口', () => {
      expect(ts).toMatch(/export\s+interface\s+RateLimitMetricsSnapshot/)
    })
    test('导出 AlertWebhook 类型', () => {
      expect(ts).toMatch(/export\s+type\s+AlertWebhook/)
    })
  })

  describe('recordRateLimitHit', () => {
    test('记录命中并写入 metrics', () => {
      recordRateLimitHit({ type: 'payment', scope: 'global' })
      recordRateLimitHit({ type: 'payment', scope: 'global' })
      recordRateLimitHit({ type: 'payment', scope: 'target' })
      const m = getMetrics()
      expect(m.hits.payment.global).toBe(2)
      expect(m.hits.payment.target).toBe(1)
      expect(m.totalHits).toBe(3)
    })

    test('支持多类型', () => {
      recordRateLimitHit({ type: 'payment', scope: 'global' })
      recordRateLimitHit({ type: 'refund', scope: 'global' })
      const m = getMetrics()
      expect(m.hits.payment.global).toBe(1)
      expect(m.hits.refund.global).toBe(1)
    })
  })

  describe('recordRateLimitConsume', () => {
    test('记录允许/拒绝', () => {
      recordRateLimitConsume({ type: 'payment', scope: 'global', allowed: true })
      recordRateLimitConsume({ type: 'payment', scope: 'global', allowed: true })
      recordRateLimitConsume({ type: 'payment', scope: 'global', allowed: false })
      const m = getMetrics()
      expect(m.totalConsumes).toBe(3)
    })
  })

  describe('recordRateLimitFallback', () => {
    test('记录降级次数', () => {
      recordRateLimitFallback({ source: 'global', reason: 'db error' })
      recordRateLimitFallback({ source: 'global', reason: 'timeout' })
      recordRateLimitFallback({ source: 'memory', reason: 'init failed' })
      const m = getMetrics()
      expect(m.fallbacks.global).toBe(2)
      expect(m.fallbacks.memory).toBe(1)
      expect(m.totalFallbacks).toBe(3)
    })
  })

  describe('recordRateLimitConfigSource', () => {
    test('记录配置来源', () => {
      recordRateLimitConfigSource({ type: 'payment', source: 'db' })
      recordRateLimitConfigSource({ type: 'payment', source: 'db' })
      recordRateLimitConfigSource({ type: 'payment', source: 'business_default' })
      const m = getMetrics()
      expect(m.configSources.payment.db).toBe(2)
      expect(m.configSources.payment.business_default).toBe(1)
    })
  })

  describe('getMetricsSnapshot', () => {
    test('windowStart 在 windowEnd 之前', () => {
      const m = getMetricsSnapshot()
      expect(m.windowEnd).toBeGreaterThanOrEqual(m.windowStart)
    })

    test('reset=true 时清空指标', () => {
      recordRateLimitHit({ type: 'payment', scope: 'global' })
      const m1 = getMetricsSnapshot(true)
      expect(m1.totalHits).toBe(1)
      const m2 = getMetricsSnapshot(false)
      expect(m2.totalHits).toBe(0)
    })

    test('hitRate 计算正确', () => {
      recordRateLimitHit({ type: 'payment', scope: 'global' })
      recordRateLimitConsume({ type: 'payment', scope: 'global', allowed: true })
      recordRateLimitConsume({ type: 'payment', scope: 'global', allowed: true })
      const m = getMetricsSnapshot()
      expect(m.hitRate).toBeCloseTo(1 / 2, 5)
    })
  })

  describe('告警 webhook', () => {
    test('setAlertWebhook(null) 清空', () => {
      setAlertWebhook(() => {})
      setAlertWebhook(null)
      expect(getAlertWebhook()).toBe(null)
    })

    test('高频命中触发 warn 告警', async () => {
      const alert = jest.fn()
      setAlertWebhook(alert)
      // 默认阈值 100/分钟；强制触发：注入大量命中
      for (let i = 0; i < 200; i++) {
        recordRateLimitHit({ type: 'payment', scope: 'global' })
      }
      // 等待微任务
      await new Promise(resolve => setImmediate(resolve))
      expect(alert).toHaveBeenCalled()
      const event = alert.mock.calls[0][0]
      expect(event.level).toBe('warn')
      expect(event.title).toContain('payment')
    })

    test('降级高频触发 critical 告警', async () => {
      const alert = jest.fn()
      setAlertWebhook(alert)
      for (let i = 0; i < 20; i++) {
        recordRateLimitFallback({ source: 'global', reason: 'test' })
      }
      await new Promise(resolve => setImmediate(resolve))
      expect(alert).toHaveBeenCalled()
      const event = alert.mock.calls[0][0]
      expect(event.level).toBe('critical')
    })
  })

  describe('告警阈值可配置', () => {
    test('setAlertThresholds 修改', () => {
      setAlertThresholds({ hitsPerMinute: 10 })
      expect(getAlertThresholds().hitsPerMinute).toBe(10)
    })
    test('getAlertThresholds 返回副本', () => {
      const t1 = getAlertThresholds()
      t1.hitsPerMinute = 999
      const t2 = getAlertThresholds()
      expect(t2.hitsPerMinute).not.toBe(999)
    })
  })

  describe('getAlertHistory', () => {
    test('返回数组', () => {
      const h = getAlertHistory()
      expect(Array.isArray(h)).toBe(true)
    })
  })

  describe('_resetMetrics', () => {
    test('清空所有指标', () => {
      recordRateLimitHit({ type: 'a', scope: 'global' })
      recordRateLimitConsume({ type: 'a', scope: 'global', allowed: true })
      recordRateLimitFallback({ source: 'global', reason: 'r' })
      recordRateLimitConfigSource({ type: 'a', source: 'db' })
      _resetMetrics()
      const m = getMetrics()
      expect(m.totalHits).toBe(0)
      expect(m.totalConsumes).toBe(0)
      expect(m.totalFallbacks).toBe(0)
    })
  })

  describe('tsconfig + build 引用', () => {
    test('tsconfig.common.json include rate-limit-monitor.ts', () => {
      const cfg = JSON.parse(readSafe(path.join(ROOT, 'tsconfig.common.json')))
      expect(cfg.include).toContain('cloudfunctions/common/rate-limit-monitor.ts')
    })
    test('scripts/build-all-services.js TARGETS 含 rate-limit-monitor.js', () => {
      const code = readSafe(path.join(ROOT, 'scripts', 'build-all-services.js'))
      expect(code).toMatch(/rate-limit-monitor\.js/)
    })
  })
})
