/**
 * Sprint 50 - rate-limit-bootstrap.ts 单元测试
 *
 * 覆盖：
 *   1. 文件存在性 + .d.ts 完整性
 *   2. bootstrapRateLimit 正常路径（db 注入）
 *   3. bootstrapRateLimit 异常路径（db 不可用）
 *   4. bootstrapRateLimit 自定义集合名
 *   5. getLastBootstrap 返回最近一次结果
 *   6. tsconfig + build 引用
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const SRC = path.join(ROOT, 'cloudfunctions', 'common', 'rate-limit-bootstrap.ts')
const JS = path.join(ROOT, 'cloudfunctions', 'common', 'rate-limit-bootstrap.js')
const DTS = path.join(ROOT, 'cloudfunctions', 'common', 'rate-limit-bootstrap.d.ts')

function readSafe(p) {
  try { return fs.readFileSync(p, 'utf8') } catch (e) { return null }
}

const api = require(JS)
const { bootstrapRateLimit, getLastBootstrap, listBootstrappedServices } = api

describe('Sprint 50: rate-limit-bootstrap 统一初始化', () => {
  describe('文件存在性', () => {
    test('.ts 源文件存在', () => expect(fs.existsSync(SRC)).toBe(true))
    test('.js 编译产物存在', () => expect(fs.existsSync(JS)).toBe(true))
    test('.d.ts 声明文件存在', () => expect(fs.existsSync(DTS)).toBe(true))
  })

  describe('.ts 源码契约', () => {
    let ts
    beforeAll(() => { ts = readSafe(SRC) })
    test('导出 bootstrapRateLimit', () => {
      expect(ts).toMatch(/export\s+function\s+bootstrapRateLimit/)
    })
    test('导出 getLastBootstrap', () => {
      expect(ts).toMatch(/export\s+function\s+getLastBootstrap/)
    })
    test('导出 BootstrapOptions 接口', () => {
      expect(ts).toMatch(/export\s+interface\s+BootstrapOptions/)
    })
    test('导出 BootstrapResult 接口', () => {
      expect(ts).toMatch(/export\s+interface\s+BootstrapResult/)
    })
  })

  describe('bootstrapRateLimit 正常路径', () => {
    afterEach(() => {
      // 重置全局状态：清空 store 和 last bootstrap
      const rrl = require(path.join(ROOT, 'cloudfunctions/common/risk-rate-limit'))
      rrl.setGlobalRateLimitStore(null)
      const cfg = require(path.join(ROOT, 'cloudfunctions/common/rate-limit-config'))
      cfg.initRateLimitConfigStore(null)
      cfg.clearRateLimitConfigCache()
    })

    test('db 不可用时降级到内存', () => {
      const result = bootstrapRateLimit(null, {})
      expect(result.countStoreInjected).toBe(false)
      expect(result.configStoreInjected).toBe(false)
      expect(result.injectedAt).toBeGreaterThan(0)
    })

    test('db 不可用时使用 logger 回调', () => {
      const warn = jest.fn()
      bootstrapRateLimit(null, { logger: { info: () => {}, warn, error: () => {} } })
      expect(warn).toHaveBeenCalled()
    })

    test('db 有效时成功注入', () => {
      const fakeDb = {
        collection: (name) => ({ doc: () => ({ get: () => Promise.resolve({ data: [] }) }) }),
        command: { inc: n => ({ op: 'inc', n }) },
      }
      const result = bootstrapRateLimit(fakeDb, {})
      expect(result.countStoreInjected).toBe(true)
      expect(result.configStoreInjected).toBe(true)
    })

    test('自定义集合名', () => {
      const fakeDb = {
        collection: (name) => ({ doc: () => ({ get: () => Promise.resolve({ data: [] }) }), name }),
        command: { inc: n => ({ op: 'inc', n }) },
      }
      const result = bootstrapRateLimit(fakeDb, {
        rateLimitsCollection: 'my_rate_limits',
        rateLimitConfigsCollection: 'my_rate_limit_configs',
        configCacheTtlMs: 60000,
      })
      expect(result.summary.rateLimitsCollection).toBe('my_rate_limits')
      expect(result.summary.rateLimitConfigsCollection).toBe('my_rate_limit_configs')
      expect(result.summary.configCacheTtlMs).toBe(60000)
    })
  })

  describe('getLastBootstrap', () => {
    test('未调用时返回 null 或 BootstrapResult', () => {
      // 由于测试顺序问题，先清空
      const rrl = require(path.join(ROOT, 'cloudfunctions/common/risk-rate-limit'))
      rrl.setGlobalRateLimitStore(null)
      const cfg = require(path.join(ROOT, 'cloudfunctions/common/rate-limit-config'))
      cfg.initRateLimitConfigStore(null)
      const last = getLastBootstrap()
      if (last !== null) {
        expect(typeof last.injectedAt).toBe('number')
        expect(typeof last.countStoreInjected).toBe('boolean')
      }
    })

    test('调用后返回 BootstrapResult', () => {
      const fakeDb = {
        collection: () => ({ doc: () => ({ get: () => Promise.resolve({ data: [] }) }) }),
        command: { inc: n => ({ op: 'inc', n }) },
      }
      bootstrapRateLimit(fakeDb, {})
      const last = getLastBootstrap()
      expect(last).not.toBe(null)
      expect(last.injectedAt).toBeGreaterThan(0)
    })
  })

  describe('listBootstrappedServices', () => {
    test('返回数组', () => {
      const list = listBootstrappedServices()
      expect(Array.isArray(list)).toBe(true)
    })
  })

  describe('tsconfig + build 引用', () => {
    test('tsconfig.common.json include rate-limit-bootstrap.ts', () => {
      const cfg = JSON.parse(readSafe(path.join(ROOT, 'tsconfig.common.json')))
      expect(cfg.include).toContain('cloudfunctions/common/rate-limit-bootstrap.ts')
    })
    test('scripts/build-all-services.js TARGETS 含 rate-limit-bootstrap.js', () => {
      const code = readSafe(path.join(ROOT, 'scripts', 'build-all-services.js'))
      expect(code).toMatch(/rate-limit-bootstrap\.js/)
    })
  })
})
