/**
 * performance-metrics 单元测试
 *
 * 覆盖：
 *   - start / success / failure 基本流程
 *   - record 与桶聚合
 *   - 百分位计算
 *   - 计数器 / 仪表盘
 *   - getSnapshot 序列化
 *   - 装饰器 wrap
 *   - 阈值告警
 *   - 重置
 */

const metrics = require('../cloudfunctions/common/performance-metrics')

describe('common/performance-metrics', () => {
  beforeEach(() => {
    metrics.reset()
    metrics.setThresholds({ slowMs: 800, criticalMs: 3000 })
    metrics.setAlertHook(null)
  })

  describe('start / success / failure', () => {
    test('success 累计一次样本，错误计数为 0', () => {
      const t = metrics.start('test.op1')
      metrics.success(t, { userId: 'u1' })
      const snap = metrics.getSnapshot()
      expect(snap.timers['test.op1']).toBeTruthy()
      expect(snap.timers['test.op1'].total).toBe(1)
      expect(snap.timers['test.op1'].errors).toBe(0)
      expect(snap.timers['test.op1'].lastTags.userId).toBe('u1')
    })

    test('failure 累计一次样本 + errors 计数', () => {
      const t = metrics.start('test.op1')
      const err = new Error('boom')
      err.code = 'BANG'
      metrics.failure(t, err)
      const snap = metrics.getSnapshot()
      expect(snap.timers['test.op1'].total).toBe(1)
      expect(snap.timers['test.op1'].errors).toBe(1)
      expect(snap.timers['test.op1'].lastTags.errorCode).toBe('BANG')
    })

    test('failure 缺 code 时记为 UNKNOWN', () => {
      const t = metrics.start('test.op1')
      metrics.failure(t, new Error('x'))
      const snap = metrics.getSnapshot()
      expect(snap.timers['test.op1'].lastTags.errorCode).toBe('UNKNOWN')
    })
  })

  describe('record（直接调用）', () => {
    test('直接 record 也能聚合', () => {
      metrics.record('test.rec1', 10, false)
      metrics.record('test.rec1', 20, true)
      const snap = metrics.getSnapshot()
      expect(snap.timers['test.rec1'].total).toBe(2)
      expect(snap.timers['test.rec1'].errors).toBe(1)
    })

    test('elapsedMs 测量准确度', async () => {
      const t = metrics.start('test.acc')
      await new Promise(r => setTimeout(r, 50))
      metrics.success(t)
      const snap = metrics.getSnapshot()
      // 至少 45ms 以上（容忍定时器误差）
      expect(snap.timers['test.acc'].max).toBeGreaterThanOrEqual(45)
    })
  })

  describe('percentile', () => {
    test('P50 / P95 / P99 计算', () => {
      const arr = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
      expect(metrics.percentile(arr, 50)).toBe(60)
      expect(metrics.percentile(arr, 95)).toBe(100)
      expect(metrics.percentile(arr, 99)).toBe(100)
    })

    test('空数组返回 0', () => {
      expect(metrics.percentile([], 50)).toBe(0)
      expect(metrics.percentile(null, 50)).toBe(0)
    })

    test('单元素', () => {
      expect(metrics.percentile([42], 95)).toBe(42)
    })
  })

  describe('incCounter / setGauge', () => {
    test('incCounter 累加', () => {
      metrics.incCounter('payment.amount', 100)
      metrics.incCounter('payment.amount', 50)
      expect(metrics.getSnapshot().counters['payment.amount']).toBe(150)
    })

    test('incCounter 默认 +1', () => {
      metrics.incCounter('orders.created')
      metrics.incCounter('orders.created')
      expect(metrics.getSnapshot().counters['orders.created']).toBe(2)
    })

    test('setGauge 覆盖写', () => {
      metrics.setGauge('cache.hitRate', 0.5)
      metrics.setGauge('cache.hitRate', 0.9)
      expect(metrics.getSnapshot().gauges['cache.hitRate']).toBe(0.9)
    })
  })

  describe('getSnapshot', () => {
    test('空 snapshot 包含结构化字段', () => {
      const s = metrics.getSnapshot()
      expect(s.generatedAt).toMatch(/T.*Z/)
      expect(s.timers).toEqual({})
      expect(s.counters).toEqual({})
      expect(s.gauges).toEqual({})
      expect(s.thresholds.slowMs).toBe(800)
    })

    test('errorRate = errors / total', () => {
      for (let i = 0; i < 7; i += 1) {metrics.record('mix', 10, false)}
      for (let i = 0; i < 3; i += 1) {metrics.record('mix', 20, true)}
      const s = metrics.getSnapshot()
      expect(s.timers.mix.errorRate).toBeCloseTo(0.3, 2)
    })

    test('max 取样本最大值', () => {
      for (const v of [10, 50, 100, 5]) {metrics.record('m', v, false)}
      expect(metrics.getSnapshot().timers.m.max).toBe(100)
    })
  })

  describe('wrap 装饰器', () => {
    test('成功路径 → total+=1, errors=0', async () => {
      const wrapped = metrics.wrap('wrap.ok', async () => 'ok')
      const r = await wrapped({}, {}, {})
      expect(r).toBe('ok')
      const s = metrics.getSnapshot()
      expect(s.timers['wrap.ok'].total).toBe(1)
      expect(s.timers['wrap.ok'].errors).toBe(0)
    })

    test('失败路径 → total+=1, errors+=1，并抛错', async () => {
      const wrapped = metrics.wrap('wrap.err', async () => {
        const e = new Error('down'); e.code = 'OOM'; throw e
      })
      await expect(wrapped({}, {}, {})).rejects.toThrow('down')
      const s = metrics.getSnapshot()
      expect(s.timers['wrap.err'].errors).toBe(1)
      expect(s.timers['wrap.err'].lastTags.errorCode).toBe('OOM')
    })
  })

  describe('阈值告警', () => {
    test('duration > criticalMs → alert level=CRITICAL', () => {
      const calls = []
      metrics.setAlertHook(m => calls.push(m))
      metrics.record('slow.op', 4000, false)
      expect(calls.length).toBe(1)
      expect(calls[0].level).toBe('CRITICAL')
      expect(calls[0].durationMs).toBe(4000)
      expect(calls[0].name).toBe('slow.op')
    })

    test('slowMs < duration < criticalMs → alert level=SLOW', () => {
      const calls = []
      metrics.setAlertHook(m => calls.push(m))
      metrics.record('med.op', 1500, false)
      expect(calls.length).toBe(1)
      expect(calls[0].level).toBe('SLOW')
    })

    test('duration < slowMs → 不告警', () => {
      const calls = []
      metrics.setAlertHook(m => calls.push(m))
      metrics.record('fast.op', 100, false)
      expect(calls.length).toBe(0)
    })

    test('isError=true 不触发告警（仅统计）', () => {
      const calls = []
      metrics.setAlertHook(m => calls.push(m))
      metrics.record('err.op', 5000, true)
      expect(calls.length).toBe(0)
    })

    test('无 alertHook → 不抛错', () => {
      expect(() => metrics.record('noHook', 5000, false)).not.toThrow()
    })

    test('setThresholds 改阈值后告警判断变化', () => {
      const calls = []
      metrics.setAlertHook(m => calls.push(m))
      metrics.setThresholds({ slowMs: 50, criticalMs: 100 })
      metrics.record('t', 60, false) // > 50 但 < 100 → SLOW
      expect(calls.length).toBe(1)
      expect(calls[0].level).toBe('SLOW')
    })
  })

  describe('reset / maxSamples', () => {
    test('reset 清空 buckets/counters/gauges', () => {
      metrics.record('r1', 10, false)
      metrics.incCounter('c1', 5)
      metrics.setGauge('g1', 1)
      metrics.reset()
      const s = metrics.getSnapshot()
      expect(Object.keys(s.timers).length).toBe(0)
      expect(Object.keys(s.counters).length).toBe(0)
      expect(Object.keys(s.gauges).length).toBe(0)
    })
  })

  describe('默认常量', () => {
    test('DEFAULT_SLOW_MS=800, DEFAULT_CRITICAL_MS=3000', () => {
      expect(metrics.DEFAULT_SLOW_MS).toBe(800)
      expect(metrics.DEFAULT_CRITICAL_MS).toBe(3000)
    })
  })
})
