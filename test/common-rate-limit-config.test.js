/**
 * Sprint 50 - rate-limit-config.ts 单元测试
 *
 * 覆盖：
 *   1. 文件存在性 + .d.ts 完整性
 *   2. BUSINESS_TYPE_DEFAULT_CONFIG 内置 6 个业务类型
 *   3. getRateLimitConfigSync 在缓存未命中时返回兜底
 *   4. 缓存 TTL 控制
 *   5. clearRateLimitConfigCache 清空
 *   6. initRateLimitConfigStore 注入
 *   7. listKnownBusinessTypes
 *   8. validateConfig 数值合法性
 *   9. getConfigSnapshot
 *  10. tsconfig + build TARGETS 引用
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const SRC = path.join(ROOT, 'cloudfunctions', 'common', 'rate-limit-config.ts')
const JS = path.join(ROOT, 'cloudfunctions', 'common', 'rate-limit-config.js')
const DTS = path.join(ROOT, 'cloudfunctions', 'common', 'rate-limit-config.d.ts')

function readSafe(p) {
  try { return fs.readFileSync(p, 'utf8') } catch (e) { return null }
}

const api = require(JS)
const {
  BUSINESS_TYPE_DEFAULT_CONFIG,
  getRateLimitConfig,
  getRateLimitConfigSync,
  clearRateLimitConfigCache,
  setRateLimitConfigCacheTtl,
  getRateLimitConfigCacheTtl,
  getCacheStats,
  initRateLimitConfigStore,
  getRateLimitConfigStore,
  getConfigSnapshot,
  listKnownBusinessTypes,
  initRateLimitConfigFromDb,
} = api

describe('Sprint 50: rate-limit-config 配置中心', () => {
  beforeEach(() => {
    clearRateLimitConfigCache()
    setRateLimitConfigCacheTtl(30000)
  })

  describe('文件存在性', () => {
    test('.ts 源文件存在', () => expect(fs.existsSync(SRC)).toBe(true))
    test('.js 编译产物存在', () => expect(fs.existsSync(JS)).toBe(true))
    test('.d.ts 声明文件存在', () => expect(fs.existsSync(DTS)).toBe(true))
  })

  describe('.ts 源码契约', () => {
    let ts
    beforeAll(() => { ts = readSafe(SRC) })
    test('导出 BUSINESS_TYPE_DEFAULT_CONFIG', () => {
      expect(ts).toMatch(/export\s+const\s+BUSINESS_TYPE_DEFAULT_CONFIG/)
    })
    test('导出 getRateLimitConfig', () => {
      expect(ts).toMatch(/export\s+(?:async\s+)?function\s+getRateLimitConfig/)
    })
    test('导出 getRateLimitConfigSync', () => {
      expect(ts).toMatch(/export\s+function\s+getRateLimitConfigSync/)
    })
    test('导出 clearRateLimitConfigCache', () => {
      expect(ts).toMatch(/export\s+function\s+clearRateLimitConfigCache/)
    })
    test('导出 initRateLimitConfigStore', () => {
      expect(ts).toMatch(/export\s+function\s+initRateLimitConfigStore/)
    })
    test('导出 getConfigSnapshot', () => {
      expect(ts).toMatch(/export\s+(?:async\s+)?function\s+getConfigSnapshot/)
    })
    test('导出 listKnownBusinessTypes', () => {
      expect(ts).toMatch(/export\s+function\s+listKnownBusinessTypes/)
    })
    test('导出 initRateLimitConfigFromDb', () => {
      expect(ts).toMatch(/export\s+function\s+initRateLimitConfigFromDb/)
    })
  })

  describe('.d.ts 类型完整性', () => {
    let dts
    beforeAll(() => { dts = readSafe(DTS) })
    test('导出 RateLimitConfigRecord', () => {
      expect(dts).toMatch(/RateLimitConfigRecord/)
    })
    test('导出 RateLimitConfigStore', () => {
      expect(dts).toMatch(/RateLimitConfigStore/)
    })
    test('导出 RateLimitConfigResult', () => {
      expect(dts).toMatch(/RateLimitConfigResult/)
    })
    test('导出 KnownBusinessType', () => {
      expect(dts).toMatch(/KnownBusinessType/)
    })
  })

  describe('BUSINESS_TYPE_DEFAULT_CONFIG 完整性', () => {
    test('包含 6 个已知业务类型', () => {
      const keys = Object.keys(BUSINESS_TYPE_DEFAULT_CONFIG).sort()
      expect(keys).toEqual(['activity_apply', 'evaluation', 'mall_order', 'order', 'payment', 'refund'])
    })
    test('payment 配 5 次/分钟（防滥用）', () => {
      expect(BUSINESS_TYPE_DEFAULT_CONFIG.payment.perUserPerMinute).toBe(5)
      expect(BUSINESS_TYPE_DEFAULT_CONFIG.payment.perUserPerTargetPerMinute).toBe(3)
    })
    test('refund 配 3 次/分钟（更严）', () => {
      expect(BUSINESS_TYPE_DEFAULT_CONFIG.refund.perUserPerMinute).toBe(3)
      expect(BUSINESS_TYPE_DEFAULT_CONFIG.refund.perUserPerTargetPerMinute).toBe(2)
    })
    test('order 配 10 次/分钟', () => {
      expect(BUSINESS_TYPE_DEFAULT_CONFIG.order.perUserPerMinute).toBe(10)
    })
    test('evaluation 配 10 次/分钟', () => {
      expect(BUSINESS_TYPE_DEFAULT_CONFIG.evaluation.perUserPerMinute).toBe(10)
    })
    test('mall_order 配 8 次/分钟', () => {
      expect(BUSINESS_TYPE_DEFAULT_CONFIG.mall_order.perUserPerMinute).toBe(8)
    })
    test('activity_apply 配 5 次/分钟', () => {
      expect(BUSINESS_TYPE_DEFAULT_CONFIG.activity_apply.perUserPerMinute).toBe(5)
    })
    test('所有配置 windowMs = 60s', () => {
      for (const c of Object.values(BUSINESS_TYPE_DEFAULT_CONFIG)) {
        expect(c.windowMs).toBe(60 * 1000)
      }
    })
  })

  describe('getRateLimitConfigSync 行为', () => {
    test('payment 返回 business_default', () => {
      const r = getRateLimitConfigSync('payment')
      expect(r.source).toBe('business_default')
      expect(r.config.perUserPerMinute).toBe(5)
      expect(r.enabled).toBe(true)
    })
    test('refund 返回 business_default', () => {
      const r = getRateLimitConfigSync('refund')
      expect(r.source).toBe('business_default')
      expect(r.config.perUserPerMinute).toBe(3)
    })
    test('未知类型返回 fallback', () => {
      const r = getRateLimitConfigSync('unknown_type')
      expect(r.source).toBe('fallback')
      expect(r.config.perUserPerMinute).toBe(10)
    })
    test('null 输入返回 fallback', () => {
      const r = getRateLimitConfigSync(null)
      expect(r.source).toBe('fallback')
    })
    test('空字符串输入返回 fallback', () => {
      const r = getRateLimitConfigSync('')
      expect(r.source).toBe('fallback')
    })
  })

  describe('缓存 TTL 控制', () => {
    test('默认 TTL = 30s', () => {
      expect(getRateLimitConfigCacheTtl()).toBe(30 * 1000)
    })
    test('setRateLimitConfigCacheTtl 修改 TTL', () => {
      setRateLimitConfigCacheTtl(5000)
      expect(getRateLimitConfigCacheTtl()).toBe(5000)
    })
    test('setRateLimitConfigCacheTtl 限制最小 1000ms', () => {
      setRateLimitConfigCacheTtl(100)
      expect(getRateLimitConfigCacheTtl()).toBe(1000)
    })
    test('缓存统计返回 keys 数', () => {
      clearRateLimitConfigCache()
      getRateLimitConfigSync('payment')
      getRateLimitConfigSync('refund')
      const stats = getCacheStats()
      expect(stats.keys).toBeGreaterThanOrEqual(2)
    })
  })

  describe('clearRateLimitConfigCache', () => {
    test('指定 type 清空单个', () => {
      getRateLimitConfigSync('payment')
      getRateLimitConfigSync('refund')
      clearRateLimitConfigCache('payment')
      const stats = getCacheStats()
      expect(stats.keys).toBe(1)  // 只剩 refund
    })
    test('无参清空全部', () => {
      getRateLimitConfigSync('payment')
      getRateLimitConfigSync('refund')
      getRateLimitConfigSync('order')
      clearRateLimitConfigCache()
      expect(getCacheStats().keys).toBe(0)
    })
  })

  describe('store 注入', () => {
    afterEach(() => {
      initRateLimitConfigStore(null)
    })
    test('initRateLimitConfigStore(null) 清空 store', () => {
      initRateLimitConfigStore({ collection: null, command: null })
      initRateLimitConfigStore(null)
      expect(getRateLimitConfigStore()).toBe(null)
    })
    test('initRateLimitConfigFromDb(null) 返回 false', () => {
      const ok = initRateLimitConfigFromDb(null)
      expect(ok).toBe(false)
    })
    test('initRateLimitConfigFromDb(fakeDb) 返回 true', () => {
      const fakeDb = {
        collection: (name) => ({ doc: () => ({ get: () => Promise.resolve({ data: [] }) }) }),
        command: { inc: n => ({ op: 'inc', n }) },
      }
      const ok = initRateLimitConfigFromDb(fakeDb)
      expect(ok).toBe(true)
      expect(getRateLimitConfigStore()).not.toBe(null)
    })
  })

  describe('listKnownBusinessTypes', () => {
    test('返回 6 个类型', () => {
      const list = listKnownBusinessTypes()
      expect(list.length).toBe(6)
      expect(list).toContain('payment')
      expect(list).toContain('refund')
      expect(list).toContain('order')
      expect(list).toContain('evaluation')
      expect(list).toContain('mall_order')
      expect(list).toContain('activity_apply')
    })
  })

  describe('getConfigSnapshot', () => {
    test('无 store 时返回 business_default 快照', async () => {
      initRateLimitConfigStore(null)
      clearRateLimitConfigCache()
      const snap = await getConfigSnapshot('payment')
      expect(snap.type).toBe('payment')
      expect(snap.source).toBe('business_default')
      expect(snap.enabled).toBe(true)
      expect(snap.dbRecord).toBe(null)
      expect(snap.cached).toBe(true)
    })
  })

  describe('getRateLimitConfig（异步）', () => {
    test('payment 无 store 时返回 business_default', async () => {
      initRateLimitConfigStore(null)
      clearRateLimitConfigCache()
      const r = await getRateLimitConfig('payment')
      expect(r.source).toBe('business_default')
      expect(r.config.perUserPerMinute).toBe(5)
      expect(r.enabled).toBe(true)
    })
    test('未知类型无 store 时返回 fallback', async () => {
      initRateLimitConfigStore(null)
      clearRateLimitConfigCache()
      const r = await getRateLimitConfig('unknown_xyz')
      expect(r.source).toBe('fallback')
    })
    test('null/空 输入返回 fallback', async () => {
      const r1 = await getRateLimitConfig(null)
      const r2 = await getRateLimitConfig('')
      expect(r1.source).toBe('fallback')
      expect(r2.source).toBe('fallback')
    })
  })

  describe('tsconfig + build 引用', () => {
    test('tsconfig.common.json include rate-limit-config.ts', () => {
      const cfg = JSON.parse(readSafe(path.join(ROOT, 'tsconfig.common.json')))
      expect(cfg.include).toContain('cloudfunctions/common/rate-limit-config.ts')
    })
    test('scripts/build-all-services.js TARGETS 含 rate-limit-config.js', () => {
      const code = readSafe(path.join(ROOT, 'scripts', 'build-all-services.js'))
      expect(code).toMatch(/rate-limit-config\.js/)
    })
    test('scripts/build-all-services.js TARGETS 含 rate-limit-bootstrap.js', () => {
      const code = readSafe(path.join(ROOT, 'scripts', 'build-all-services.js'))
      expect(code).toMatch(/rate-limit-bootstrap\.js/)
    })
  })
})
