/**
 * Sprint 21: 全局限流存储 rate-limit-store 测试
 *
 * 覆盖：
 *   1. 文件存在性 + TS 源码契约
 *   2. buildKey 函数
 *   3. consumeGlobalRateLimit（mock cloudbase collection）
 *   4. peekGlobalRateLimit
 *   5. cleanupExpiredRateLimits
 *   6. getGlobalRateLimitStats
 *   7. 错误处理（collection 缺失、doc 不存在等）
 *   8. 集成测试：与 risk-rate-limit.ts 配合
 */

const path = require('path')
const fs = require('fs')

const ROOT = path.join(__dirname, '..')
const TS = path.join(ROOT, 'cloudfunctions', 'common', 'rate-limit-store.ts')
const JS = path.join(ROOT, 'cloudfunctions', 'common', 'rate-limit-store.js')
const DTS = path.join(ROOT, 'cloudfunctions', 'common', 'rate-limit-store.d.ts')

function readSafe(p) {
  try { return fs.readFileSync(p, 'utf8') } catch (e) { return null }
}

// ===== 模拟 cloudbase db collection =====

/**
 * 一个 in-memory 模拟 db collection
 * - 记录 _id → record 的 map
 * - 支持 doc(_id).get() / .update() / .remove() / .set() / add()
 * - 支持 where().get() / limit().get()
 * - 支持 db.command.inc / .lt
 */
function createMockCollection() {
  const data = new Map()
  const _ = {
    inc(n = 1) { return { __op: 'inc', value: n } },
    lt(v) { return { __op: 'lt', value: v } },
  }
  const records = () => Array.from(data.values())
  return {
    _,
    _data: data,
    _records: records,
    doc(id) {
      return {
        async get() {
          if (!data.has(id)) {return { data: null }}
          return { data: data.get(id) }
        },
        async update({ data: upd }) {
          if (!data.has(id)) {throw new Error('doc not found')}
          const r = data.get(id)
          for (const [k, v] of Object.entries(upd)) {
            if (v && typeof v === 'object' && v.__op === 'inc') {
              r[k] = (r[k] || 0) + v.value
            } else {
              r[k] = v
            }
          }
          return { updated: 1 }
        },
        async remove() {
          data.delete(id)
          return { deleted: 1 }
        },
        async set({ data: d }) {
          data.set(id, { ...d, _id: id })
          return { updated: 1 }
        },
      }
    },
    async add({ data: d }) {
      if (!d._id) {throw new Error('add requires _id')}
      if (data.has(d._id)) {throw new Error('duplicate _id')}
      data.set(d._id, { ...d })
      return { _id: d._id }
    },
    where(query) {
      return {
        async get() {
          const list = records().filter(r => {
            for (const [k, v] of Object.entries(query)) {
              if (v && typeof v === 'object' && v.__op === 'lt') {
                if (!(r[k] < v.value)) {return false}
              } else {
                if (r[k] !== v) {return false}
              }
            }
            return true
          })
          return { data: list }
        },
        limit(n) {
          return {
            async get() {
              const list = records().filter(r => {
                for (const [k, v] of Object.entries(query)) {
                  if (v && typeof v === 'object' && v.__op === 'lt') {
                    if (!(r[k] < v.value)) {return false}
                  } else {
                    if (r[k] !== v) {return false}
                  }
                }
                return true
              }).slice(0, n)
              return { data: list }
            },
          }
        },
      }
    },
    limit(n) {
      return {
        async get() {
          return { data: records().slice(0, n) }
        },
      }
    },
  }
}

const {
  buildKey,
  consumeGlobalRateLimit,
  peekGlobalRateLimit,
  cleanupExpiredRateLimits,
  getGlobalRateLimitStats,
} = require(JS)

describe('Sprint 21: rate-limit-store 全局限流存储', () => {
  describe('文件存在性', () => {
    test('.ts 源文件存在', () => expect(fs.existsSync(TS)).toBe(true))
    test('.js 编译产物存在', () => expect(fs.existsSync(JS)).toBe(true))
    test('.d.ts 声明文件存在', () => expect(fs.existsSync(DTS)).toBe(true))
  })

  describe('TS 源码契约', () => {
    let ts
    beforeAll(() => { ts = readSafe(TS) })

    test('导出 GlobalRateLimitRecord 接口', () => {
      expect(ts).toMatch(/export\s+interface\s+GlobalRateLimitRecord/)
    })
    test('导出 GlobalRateLimitInput 接口', () => {
      expect(ts).toMatch(/export\s+interface\s+GlobalRateLimitInput/)
    })
    test('导出 GlobalRateLimitResult 接口', () => {
      expect(ts).toMatch(/export\s+interface\s+GlobalRateLimitResult/)
    })
    test('导出 GlobalRateLimitStore 接口', () => {
      expect(ts).toMatch(/export\s+interface\s+GlobalRateLimitStore/)
    })
    test('导出 buildKey 函数', () => {
      expect(ts).toMatch(/export\s+function\s+buildKey/)
    })
    test('导出 consumeGlobalRateLimit 函数', () => {
      expect(ts).toMatch(/export\s+async\s+function\s+consumeGlobalRateLimit/)
    })
    test('导出 peekGlobalRateLimit 函数', () => {
      expect(ts).toMatch(/export\s+async\s+function\s+peekGlobalRateLimit/)
    })
    test('导出 cleanupExpiredRateLimits 函数', () => {
      expect(ts).toMatch(/export\s+async\s+function\s+cleanupExpiredRateLimits/)
    })
  })

  describe('buildKey 函数', () => {
    test('global scope：g:userId|type', () => {
      const k = buildKey({ userId: 'u1', type: 'order', windowMs: 60000, limit: 10 }, 'global')
      expect(k).toBe('g:u1|order')
    })
    test('target scope：t:userId|type|targetId', () => {
      const k = buildKey({ userId: 'u1', type: 'order', targetId: 'h1', windowMs: 60000, limit: 10 }, 'target')
      expect(k).toBe('t:u1|order|h1')
    })
    test('target scope 无 targetId 退化为空串', () => {
      const k = buildKey({ userId: 'u1', type: 'order', windowMs: 60000, limit: 10 }, 'target')
      expect(k).toBe('t:u1|order|')
    })
  })

  describe('consumeGlobalRateLimit', () => {
    test('未配置 store 抛 INTERNAL_ERROR', async () => {
      await expect(
        consumeGlobalRateLimit(
          { userId: 'u1', type: 'order', windowMs: 60000, limit: 10 },
          null
        )
      ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' })
    })

    test('首次消费：allowed=true，count=1', async () => {
      const coll = createMockCollection()
      const r = await consumeGlobalRateLimit(
        { userId: 'u1', type: 'order', windowMs: 60000, limit: 10 },
        { collection: coll, command: coll._ }
      )
      expect(r.allowed).toBe(true)
      expect(r.count).toBe(1)
      expect(r.remaining).toBe(9)
      expect(r.key).toBe('g:u1|order')
      expect(coll._records()).toHaveLength(1)
    })

    test('窗口内连续消费：count 累加', async () => {
      const coll = createMockCollection()
      const input = { userId: 'u1', type: 'order', windowMs: 60000, limit: 10 }
      const store = { collection: coll, command: coll._ }
      const T0 = new Date('2026-06-05T10:00:00').getTime()
      for (let i = 0; i < 5; i++) {
        const r = await consumeGlobalRateLimit({ ...input, now: T0 + i * 1000 }, store)
        expect(r.count).toBe(i + 1)
      }
    })

    test('窗口内第 N+1 次：allowed=false', async () => {
      const coll = createMockCollection()
      const input = { userId: 'u1', type: 'order', windowMs: 60000, limit: 2 }
      const store = { collection: coll, command: coll._ }
      const T0 = new Date('2026-06-05T10:00:00').getTime()
      await consumeGlobalRateLimit({ ...input, now: T0 }, store)
      await consumeGlobalRateLimit({ ...input, now: T0 + 100 }, store)
      const r3 = await consumeGlobalRateLimit({ ...input, now: T0 + 200 }, store)
      expect(r3.allowed).toBe(false)
      expect(r3.count).toBe(2)
    })

    test('窗口过期后重新计数', async () => {
      const coll = createMockCollection()
      const input = { userId: 'u1', type: 'order', windowMs: 60000, limit: 1 }
      const store = { collection: coll, command: coll._ }
      const T0 = new Date('2026-06-05T10:00:00').getTime()
      const r1 = await consumeGlobalRateLimit({ ...input, now: T0 }, store)
      expect(r1.allowed).toBe(true)
      const r2 = await consumeGlobalRateLimit({ ...input, now: T0 + 1000 }, store)
      expect(r2.allowed).toBe(false)
      // 跨窗口
      const r3 = await consumeGlobalRateLimit({ ...input, now: T0 + 70000 }, store)
      expect(r3.allowed).toBe(true)
      expect(r3.count).toBe(1)
    })

    test('target 维度：targetId 不同时互不影响', async () => {
      const coll = createMockCollection()
      const store = { collection: coll, command: coll._ }
      const T0 = new Date('2026-06-05T10:00:00').getTime()
      // limit=10 让 global 有余量，重点测 target 维度
      const baseInput = { userId: 'u1', type: 'order', windowMs: 60000, limit: 10 }
      const r1 = await consumeGlobalRateLimit(
        { ...baseInput, targetId: 'h1', now: T0 },
        store
      )
      expect(r1.allowed).toBe(true)
      // 同样 limit=10 的 h1，再消费（不超 limit）
      const r2 = await consumeGlobalRateLimit(
        { ...baseInput, targetId: 'h1', now: T0 + 100 },
        store
      )
      expect(r2.allowed).toBe(true)
      // h2 仍允许（target 维度独立）
      const r3 = await consumeGlobalRateLimit(
        { ...baseInput, targetId: 'h2', now: T0 + 200 },
        store
      )
      expect(r3.allowed).toBe(true)
    })

    test('不同 user 互不影响', async () => {
      const coll = createMockCollection()
      const store = { collection: coll, command: coll._ }
      const T0 = new Date('2026-06-05T10:00:00').getTime()
      for (let i = 0; i < 3; i++) {
        await consumeGlobalRateLimit(
          { userId: 'u1', type: 'order', windowMs: 60000, limit: 3, now: T0 + i * 100 },
          store
        )
      }
      // u1 满了
      const r4 = await consumeGlobalRateLimit(
        { userId: 'u1', type: 'order', windowMs: 60000, limit: 3, now: T0 + 400 },
        store
      )
      expect(r4.allowed).toBe(false)
      // u2 不受影响
      const r5 = await consumeGlobalRateLimit(
        { userId: 'u2', type: 'order', windowMs: 60000, limit: 3, now: T0 + 500 },
        store
      )
      expect(r5.allowed).toBe(true)
    })
  })

  describe('peekGlobalRateLimit', () => {
    test('无记录返回 null', async () => {
      const coll = createMockCollection()
      const r = await peekGlobalRateLimit(
        { userId: 'u1', type: 'order', windowMs: 60000, limit: 10 },
        { collection: coll, command: coll._ }
      )
      expect(r).toBeNull()
    })

    test('有记录但未消费：返回当前 count', async () => {
      const coll = createMockCollection()
      const store = { collection: coll, command: coll._ }
      const T0 = new Date('2026-06-05T10:00:00').getTime()
      // 先消耗 1 次
      await consumeGlobalRateLimit(
        { userId: 'u1', type: 'order', windowMs: 60000, limit: 10, now: T0 },
        store
      )
      // peek 不应改变 count
      const r = await peekGlobalRateLimit(
        { userId: 'u1', type: 'order', windowMs: 60000, limit: 10, now: T0 + 1000 },
        store
      )
      expect(r).not.toBeNull()
      expect(r.count).toBe(1)
    })

    test('窗口外返回 null', async () => {
      const coll = createMockCollection()
      const store = { collection: coll, command: coll._ }
      const T0 = new Date('2026-06-05T10:00:00').getTime()
      await consumeGlobalRateLimit(
        { userId: 'u1', type: 'order', windowMs: 60000, limit: 10, now: T0 },
        store
      )
      const r = await peekGlobalRateLimit(
        { userId: 'u1', type: 'order', windowMs: 60000, limit: 10, now: T0 + 70000 },
        store
      )
      expect(r).toBeNull()
    })
  })

  describe('cleanupExpiredRateLimits', () => {
    test('清理 expireAt < now 的记录', async () => {
      const coll = createMockCollection()
      const store = { collection: coll, command: coll._ }
      const T0 = new Date('2026-06-05T10:00:00').getTime()
      // 写入 3 条记录
      await consumeGlobalRateLimit(
        { userId: 'u1', type: 'order', windowMs: 60000, limit: 100, now: T0 },
        store
      )
      await consumeGlobalRateLimit(
        { userId: 'u2', type: 'order', windowMs: 60000, limit: 100, now: T0 + 100 },
        store
      )
      await consumeGlobalRateLimit(
        { userId: 'u3', type: 'order', windowMs: 60000, limit: 100, now: T0 + 200 },
        store
      )
      expect(coll._records()).toHaveLength(3)
      // 跑 cleanup（now 是当前时间，记录都已过期）
      const cleaned = await cleanupExpiredRateLimits(store, 100)
      expect(cleaned).toBe(3)
      expect(coll._records()).toHaveLength(0)
    })

    test('未配置 store 返回 0', async () => {
      const cleaned = await cleanupExpiredRateLimits(null, 100)
      expect(cleaned).toBe(0)
    })
  })

  describe('getGlobalRateLimitStats', () => {
    test('空 store 返回全 0', async () => {
      const coll = createMockCollection()
      const stats = await getGlobalRateLimitStats({ collection: coll, command: coll._ })
      expect(stats.totalRecords).toBe(0)
      expect(stats.globalKeys).toBe(0)
      expect(stats.targetKeys).toBe(0)
    })

    test('混合 global + target 记录统计正确', async () => {
      const coll = createMockCollection()
      const store = { collection: coll, command: coll._ }
      const T0 = new Date('2026-06-05T10:00:00').getTime()
      // 2 条 global
      await consumeGlobalRateLimit(
        { userId: 'u1', type: 'order', windowMs: 60000, limit: 10, now: T0 },
        store
      )
      await consumeGlobalRateLimit(
        { userId: 'u2', type: 'order', windowMs: 60000, limit: 10, now: T0 + 100 },
        store
      )
      // 1 条 target
      await consumeGlobalRateLimit(
        { userId: 'u1', type: 'order', targetId: 'h1', windowMs: 60000, limit: 10, now: T0 + 200 },
        store
      )
      const stats = await getGlobalRateLimitStats(store)
      expect(stats.totalRecords).toBe(3)
      expect(stats.globalKeys).toBe(2)
      expect(stats.targetKeys).toBe(1)
    })
  })

  describe('与 risk-rate-limit.ts 集成', () => {
    test('setGlobalRateLimitStore 后 withRateLimit 使用全局 store', async () => {
      const { setGlobalRateLimitStore, withRateLimit, _resetStore: _resetMem, getGlobalRateLimitStore } = require(path.join(ROOT, 'cloudfunctions/common/risk-rate-limit.js'))
      const coll = createMockCollection()
      setGlobalRateLimitStore({ collection: coll, command: coll._ })
      expect(getGlobalRateLimitStore()).not.toBeNull()
      _resetMem()
      // 执行 3 次 fn
      const fn = jest.fn(async () => 'ok')
      for (let i = 0; i < 3; i++) {
        await withRateLimit({ userId: 'u1', type: 'order' }, fn)
      }
      expect(fn).toHaveBeenCalledTimes(3)
      // 清理
      setGlobalRateLimitStore(null)
    })
  })
})
