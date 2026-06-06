/**
 * Sprint 17: 风控检测限流模块测试
 *
 * 覆盖：
 *   1. peekRateLimit 不消费配额
 *   2. consumeRateLimit 消费配额
 *   3. 全局限流（每用户每分钟 N 次）
 *   4. 目标级限流（每用户对同一目标 N 次）
 *   5. 滑动窗口：窗口外的请求被释放
 *   6. 超限抛 RATE_LIMITED 错误
 *   7. 错误响应含 remaining + resetAt
 *   8. withRateLimit 包裹函数
 *   9. _resetStore / getStoreStats
 *   10. 真实业务场景：评价刷量检测 / 退款滥用检测
 *   11. 与风险控制集成：每个被风控拦截的请求不应超过限流
 *   12. tsconfig / build 工具链
 */

const path = require('path')
const fs = require('fs')

const ROOT = path.join(__dirname, '..')
const TS = path.join(ROOT, 'cloudfunctions', 'common', 'risk-rate-limit.ts')
const JS = path.join(ROOT, 'cloudfunctions', 'common', 'risk-rate-limit.js')
const DTS = path.join(ROOT, 'cloudfunctions', 'common', 'risk-rate-limit.d.ts')
const TSCONFIG = path.join(ROOT, 'tsconfig.common.json')

function readSafe(p) {
  try { return fs.readFileSync(p, 'utf8') } catch (e) { return null }
}

const {
  DEFAULT_RISK_RATE_LIMIT_CONFIG,
  peekRateLimit,
  consumeRateLimit,
  withRateLimit,
  _resetStore,
  getStoreStats,
} = require(JS)

function freshStore() {
  return {
    global: new Map(),
    target: new Map(),
    lastCleanup: 0,
  }
}

describe('Sprint 17: risk-rate-limit 限流模块', () => {
  // 重置默认 store（每次 test 隔离）
  beforeEach(() => {
    _resetStore()
  })

  describe('文件存在性', () => {
    test('.ts 源文件存在', () => expect(fs.existsSync(TS)).toBe(true))
    test('.js 编译产物存在', () => expect(fs.existsSync(JS)).toBe(true))
    test('.d.ts 声明文件存在', () => expect(fs.existsSync(DTS)).toBe(true))
  })

  describe('.ts 源码契约', () => {
    let ts
    beforeAll(() => { ts = readSafe(TS) })

    test('导出 RateLimitConfig 接口', () => {
      expect(ts).toMatch(/export\s+interface\s+RateLimitConfig/)
    })

    test('导出 RateLimitCheckInput / RateLimitResult', () => {
      expect(ts).toMatch(/export\s+interface\s+RateLimitCheckInput/)
      expect(ts).toMatch(/export\s+interface\s+RateLimitResult/)
    })

    test('导出 peekRateLimit / consumeRateLimit / withRateLimit', () => {
      expect(ts).toMatch(/export\s+function\s+peekRateLimit/)
      expect(ts).toMatch(/export\s+function\s+consumeRateLimit/)
      expect(ts).toMatch(/export\s+async\s+function\s+withRateLimit/)
    })

    test('导出 DEFAULT_RISK_RATE_LIMIT_CONFIG 常量', () => {
      expect(ts).toMatch(/export\s+const\s+DEFAULT_RISK_RATE_LIMIT_CONFIG/)
    })
  })

  describe('模块 API 完整性', () => {
    test('导出所有公共 API', () => {
      expect(typeof peekRateLimit).toBe('function')
      expect(typeof consumeRateLimit).toBe('function')
      expect(typeof withRateLimit).toBe('function')
      expect(typeof _resetStore).toBe('function')
      expect(typeof getStoreStats).toBe('function')
    })

    test('DEFAULT_RISK_RATE_LIMIT_CONFIG 字段', () => {
      expect(DEFAULT_RISK_RATE_LIMIT_CONFIG.perUserPerMinute).toBe(10)
      expect(DEFAULT_RISK_RATE_LIMIT_CONFIG.perUserPerTargetPerMinute).toBe(5)
      expect(DEFAULT_RISK_RATE_LIMIT_CONFIG.windowMs).toBe(60 * 1000)
    })
  })

  describe('peekRateLimit 不消费配额', () => {
    let store
    beforeEach(() => { store = freshStore() })

    test('首次查询：allowed=true，remaining=10', () => {
      const r = peekRateLimit({ userId: 'u1', type: 'evaluation' }, undefined, store)
      expect(r.allowed).toBe(true)
      expect(r.remaining).toBe(10)
    })

    test('连续 peek 5 次 remaining 始终 = 10', () => {
      for (let i = 0; i < 5; i++) {
        const r = peekRateLimit({ userId: 'u1', type: 'evaluation' }, undefined, store)
        expect(r.allowed).toBe(true)
        expect(r.remaining).toBe(10)
      }
    })

    test('peekRateLimit 不修改 store', () => {
      peekRateLimit({ userId: 'u1', type: 'evaluation' }, undefined, store)
      expect(store.global.size).toBe(0)
    })
  })

  describe('consumeRateLimit 消费配额', () => {
    let store
    beforeEach(() => { store = freshStore() })

    test('consume 后 store 记录 +1', () => {
      consumeRateLimit({ userId: 'u1', type: 'evaluation' }, undefined, store)
      expect(store.global.size).toBe(1)
    })

    test('consume 5 次后 remaining=5', () => {
      for (let i = 0; i < 5; i++) {
        consumeRateLimit({ userId: 'u1', type: 'evaluation' }, undefined, store)
      }
      const r = peekRateLimit({ userId: 'u1', type: 'evaluation' }, undefined, store)
      expect(r.remaining).toBe(5)
    })

    test('consume 10 次后第 11 次抛 RATE_LIMIT_GLOBAL', () => {
      for (let i = 0; i < 10; i++) {
        consumeRateLimit({ userId: 'u1', type: 'evaluation' }, undefined, store)
      }
      try {
        consumeRateLimit({ userId: 'u1', type: 'evaluation' }, undefined, store)
        fail('should throw')
      } catch (e) {
        expect(e.code).toBe('RATE_LIMITED')
        expect(e.message).toMatch(/RATE_LIMIT_GLOBAL/)
      }
    })
  })

  describe('全局限流（每用户每分钟 N 次）', () => {
    let store, config
    beforeEach(() => {
      store = freshStore()
      config = { perUserPerMinute: 3, perUserPerTargetPerMinute: 2, windowMs: 60000 }
    })

    test('前 3 次允许', () => {
      for (let i = 0; i < 3; i++) {
        const r = consumeRateLimit({ userId: 'u1', type: 'evaluation' }, config, store)
        expect(r.allowed).toBe(true)
      }
    })

    test('第 4 次拒绝', () => {
      for (let i = 0; i < 3; i++) {
        consumeRateLimit({ userId: 'u1', type: 'evaluation' }, config, store)
      }
      expect(() => consumeRateLimit({ userId: 'u1', type: 'evaluation' }, config, store))
        .toThrow(/RATE_LIMIT_GLOBAL/)
    })

    test('不同 user 互不影响', () => {
      for (let i = 0; i < 3; i++) {
        consumeRateLimit({ userId: 'u1', type: 'evaluation' }, config, store)
      }
      const r = consumeRateLimit({ userId: 'u2', type: 'evaluation' }, config, store)
      expect(r.allowed).toBe(true)
    })

    test('不同 type 互不影响', () => {
      for (let i = 0; i < 3; i++) {
        consumeRateLimit({ userId: 'u1', type: 'evaluation' }, config, store)
      }
      const r = consumeRateLimit({ userId: 'u1', type: 'refund' }, config, store)
      expect(r.allowed).toBe(true)
    })
  })

  describe('目标级限流（perUserPerTargetPerMinute）', () => {
    let store, config
    beforeEach(() => {
      store = freshStore()
      config = { perUserPerMinute: 100, perUserPerTargetPerMinute: 2, windowMs: 60000 }
    })

    test('同一目标 ≤ 2 次允许', () => {
      consumeRateLimit({ userId: 'u1', type: 'evaluation', targetId: 'h1' }, config, store)
      consumeRateLimit({ userId: 'u1', type: 'evaluation', targetId: 'h1' }, config, store)
      expect(() => consumeRateLimit({ userId: 'u1', type: 'evaluation', targetId: 'h1' }, config, store))
        .toThrow(/RATE_LIMIT_TARGET/)
    })

    test('不同目标独立计数', () => {
      consumeRateLimit({ userId: 'u1', type: 'evaluation', targetId: 'h1' }, config, store)
      consumeRateLimit({ userId: 'u1', type: 'evaluation', targetId: 'h1' }, config, store)
      // h1 满了，但 h2 仍允许
      const r = consumeRateLimit({ userId: 'u1', type: 'evaluation', targetId: 'h2' }, config, store)
      expect(r.allowed).toBe(true)
    })

    test('全局限流先于目标限流', () => {
      const smallGlobal = { perUserPerMinute: 2, perUserPerTargetPerMinute: 100, windowMs: 60000 }
      consumeRateLimit({ userId: 'u1', type: 'evaluation', targetId: 'h1' }, smallGlobal, store)
      consumeRateLimit({ userId: 'u1', type: 'evaluation', targetId: 'h1' }, smallGlobal, store)
      // 全局超限（2 次）
      expect(() => consumeRateLimit({ userId: 'u1', type: 'evaluation', targetId: 'h2' }, smallGlobal, store))
        .toThrow(/RATE_LIMIT_GLOBAL/)
    })

    test('remaining 取全局与目标中较小值', () => {
      consumeRateLimit({ userId: 'u1', type: 'evaluation', targetId: 'h1' }, config, store)
      const r = peekRateLimit({ userId: 'u1', type: 'evaluation', targetId: 'h1' }, config, store)
      // 全局剩余 99，目标剩余 1 → 取 1
      expect(r.remaining).toBe(1)
    })
  })

  describe('滑动窗口', () => {
    test('窗口外的请求自动释放', () => {
      const store = freshStore()
      const config = { perUserPerMinute: 3, perUserPerTargetPerMinute: 3, windowMs: 60000 }
      const T0 = new Date('2026-06-05T10:00:00').getTime()
      // T0 时刻 3 次
      consumeRateLimit({ userId: 'u1', type: 'evaluation', now: T0 }, config, store)
      consumeRateLimit({ userId: 'u1', type: 'evaluation', now: T0 + 1000 }, config, store)
      consumeRateLimit({ userId: 'u1', type: 'evaluation', now: T0 + 2000 }, config, store)
      // T0+3s 还在窗口内
      try {
        consumeRateLimit({ userId: 'u1', type: 'evaluation', now: T0 + 3000 }, config, store)
        fail('should throw')
      } catch (e) {
        expect(e.code).toBe('RATE_LIMITED')
      }
      // T0+61s 已过窗口，可重新消费
      const r = consumeRateLimit({ userId: 'u1', type: 'evaluation', now: T0 + 61000 }, config, store)
      expect(r.allowed).toBe(true)
    })
  })

  describe('错误响应', () => {
    test('超限抛 RATE_LIMITED BusinessError', () => {
      const store = freshStore()
      const config = { perUserPerMinute: 1, perUserPerTargetPerMinute: 1, windowMs: 60000 }
      consumeRateLimit({ userId: 'u1', type: 'evaluation' }, config, store)
      try {
        consumeRateLimit({ userId: 'u1', type: 'evaluation' }, config, store)
        fail('should throw')
      } catch (e) {
        expect(e.code).toBe('RATE_LIMITED')
      }
    })

    test('错误 details 含 remaining + resetAt', () => {
      const store = freshStore()
      const config = { perUserPerMinute: 1, perUserPerTargetPerMinute: 1, windowMs: 60000 }
      consumeRateLimit({ userId: 'u1', type: 'evaluation' }, config, store)
      try {
        consumeRateLimit({ userId: 'u1', type: 'evaluation' }, config, store)
        fail('should throw')
      } catch (e) {
        expect(e.details).toBeDefined()
        expect(e.details.remaining).toBe(0)
        expect(e.details.resetAt).toBeGreaterThan(Date.now())
      }
    })
  })

  describe('withRateLimit 包裹函数', () => {
    let store
    beforeEach(() => { store = freshStore() })

    test('正常执行：返回 fn 结果', async () => {
      const result = await withRateLimit(
        { userId: 'u1', type: 'evaluation' },
        async () => 'ok',
        undefined,
        store
      )
      expect(result).toBe('ok')
    })

    test('超限：fn 不被调用，抛错', async () => {
      const config = { perUserPerMinute: 1, perUserPerTargetPerMinute: 1, windowMs: 60000 }
      const fn = jest.fn(async () => 'ok')
      await withRateLimit({ userId: 'u1', type: 'evaluation' }, fn, config, store)
      await expect(
        withRateLimit({ userId: 'u1', type: 'evaluation' }, fn, config, store)
      ).rejects.toMatchObject({ code: 'RATE_LIMITED' })
      expect(fn).toHaveBeenCalledTimes(1)
    })

    test('fn 抛错：限流配额仍被消费', async () => {
      const config = { perUserPerMinute: 2, perUserPerTargetPerMinute: 2, windowMs: 60000 }
      const fn = jest.fn(async () => { throw new Error('inner err') })
      await expect(
        withRateLimit({ userId: 'u1', type: 'evaluation' }, fn, config, store)
      ).rejects.toThrow(/inner err/)
      // 配额已被消费
      const r = peekRateLimit({ userId: 'u1', type: 'evaluation' }, config, store)
      expect(r.remaining).toBe(1)
    })
  })

  describe('store 工具', () => {
    test('_resetStore 清空所有 key', () => {
      const store = freshStore()
      store.global.set('k1', [Date.now()])
      store.target.set('k2', [Date.now()])
      _resetStore(store)
      expect(store.global.size).toBe(0)
      expect(store.target.size).toBe(0)
      expect(store.lastCleanup).toBe(0)
    })

    test('getStoreStats 返回统计', () => {
      const store = freshStore()
      store.global.set('k1', [Date.now()])
      store.target.set('k2', [Date.now()])
      store.lastCleanup = 12345
      const stats = getStoreStats(store)
      expect(stats.globalKeys).toBe(1)
      expect(stats.targetKeys).toBe(1)
      expect(stats.lastCleanup).toBe(12345)
    })
  })

  describe('Sprint 21: 全局 store 注入', () => {
    const { setGlobalRateLimitStore, getGlobalRateLimitStore, initGlobalRateLimitFromDb } = require(JS)
    afterEach(() => { setGlobalRateLimitStore(null) })

    test('setGlobalRateLimitStore / getGlobalRateLimitStore', () => {
      expect(getGlobalRateLimitStore()).toBeNull()
      setGlobalRateLimitStore({ collection: { foo: 1 }, command: { inc: () => 1 } })
      expect(getGlobalRateLimitStore()).not.toBeNull()
    })

    test('initGlobalRateLimitFromDb 接受 mock db', () => {
      const mockDb = {
        collection: (name) => ({ __name: name }),
        command: { inc: () => 1 },
      }
      const ok = initGlobalRateLimitFromDb(mockDb, { collectionName: 'rate_limits' })
      expect(ok).toBe(true)
      const store = getGlobalRateLimitStore()
      expect(store).not.toBeNull()
      expect(store.collection.__name).toBe('rate_limits')
    })

    test('initGlobalRateLimitFromDb 接受 null 返回 false', () => {
      const ok = initGlobalRateLimitFromDb(null)
      expect(ok).toBe(false)
      expect(getGlobalRateLimitStore()).toBeNull()
    })
  })

  describe('真实业务场景', () => {
    test('评价刷量检测：用户对同一 host 限流', () => {
      const store = freshStore()
      const config = { perUserPerMinute: 100, perUserPerTargetPerMinute: 2, windowMs: 60000 }
      // 用户对 host1 检测 2 次
      consumeRateLimit({ userId: 'u1', type: 'evaluation', targetId: 'h1' }, config, store)
      consumeRateLimit({ userId: 'u1', type: 'evaluation', targetId: 'h1' }, config, store)
      // 第 3 次被拦截
      expect(() => consumeRateLimit({ userId: 'u1', type: 'evaluation', targetId: 'h1' }, config, store))
        .toThrow(/RATE_LIMIT/)
    })

    test('退款滥用检测：全局 + 目标双层保护', () => {
      const store = freshStore()
      const config = { perUserPerMinute: 2, perUserPerTargetPerMinute: 2, windowMs: 60000 }
      consumeRateLimit({ userId: 'u1', type: 'refund' }, config, store)
      consumeRateLimit({ userId: 'u1', type: 'refund', targetId: 'order1' }, config, store)
      // 第 3 次全局拒绝
      expect(() => consumeRateLimit({ userId: 'u1', type: 'refund' }, config, store))
        .toThrow(/RATE_LIMIT_GLOBAL/)
    })

    test('不同 type（evaluation / refund）互不影响', () => {
      const store = freshStore()
      const config = { perUserPerMinute: 1, perUserPerTargetPerMinute: 1, windowMs: 60000 }
      consumeRateLimit({ userId: 'u1', type: 'evaluation' }, config, store)
      // evaluation 已满
      try {
        consumeRateLimit({ userId: 'u1', type: 'evaluation' }, config, store)
        fail('should throw')
      } catch (e) {
        expect(e.code).toBe('RATE_LIMITED')
      }
      // refund 仍可
      const r = consumeRateLimit({ userId: 'u1', type: 'refund' }, config, store)
      expect(r.allowed).toBe(true)
    })
  })

  describe('与风控集成：拦截的请求不应触发 db 查询', () => {
    test('withRateLimit 拦截后 fn 不被调用', async () => {
      const store = freshStore()
      const config = { perUserPerMinute: 1, perUserPerTargetPerMinute: 1, windowMs: 60000 }
      const fakeDetect = jest.fn(async () => ({
        level: 'high',
        action: 'reject',
        reasons: ['test'],
        details: {},
      }))
      // 第 1 次调用检测
      const r1 = await withRateLimit(
        { userId: 'u1', type: 'evaluation', targetId: 'h1' },
        fakeDetect,
        config,
        store
      )
      expect(r1.action).toBe('reject')
      expect(fakeDetect).toHaveBeenCalledTimes(1)
      // 第 2 次：被限流，detect 不被调用
      await expect(
        withRateLimit(
          { userId: 'u1', type: 'evaluation', targetId: 'h1' },
          fakeDetect,
          config,
          store
        )
      ).rejects.toMatchObject({ code: 'RATE_LIMITED' })
      expect(fakeDetect).toHaveBeenCalledTimes(1)  // 没增加
    })
  })

  describe('tsconfig / build 工具链', () => {
    test('tsconfig.common.json include risk-rate-limit.ts', () => {
      const cfg = JSON.parse(readSafe(TSCONFIG))
      expect(cfg.include).toContain('cloudfunctions/common/risk-rate-limit.ts')
    })

    test('build-common.js TARGETS 含 risk-rate-limit.js', () => {
      const buildJs = readSafe(path.join(ROOT, 'scripts', 'build-common.js'))
      expect(buildJs).toMatch(/risk-rate-limit\.js/)
    })
  })
})
