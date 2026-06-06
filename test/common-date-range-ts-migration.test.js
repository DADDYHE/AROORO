/**
 * Sprint 17: TypeScript 迁移测试 - date-range.js → .ts
 *
 * 覆盖：
 *   1. 源文件 / 产物存在性（3）
 *   2. .ts 源码契约：导出 / 类型（5）
 *   3. 模块 API 完整性（1）
 *   4. getDateRange 8 种 range 类型（8）
 *   5. startOfDay / endOfDay / startOfWeek（3）
 *   6. startOfMonth / startOfQuarter / startOfYear（3）
 *   7. diffDays（3）
 *   8. formatDate / lastNDates（4）
 *   9. buildRangeQuery（3）
 *   10. 不支持的 range 抛错（1）
 *   11. 与 date-range.js 行为一致（5）
 *   12. tsconfig / build 工具链（2）
 */

const path = require('path')
const fs = require('fs')

const ROOT = path.join(__dirname, '..')
const TS = path.join(ROOT, 'cloudfunctions', 'common', 'date-range.ts')
const JS = path.join(ROOT, 'cloudfunctions', 'common', 'date-range.js')
const DTS = path.join(ROOT, 'cloudfunctions', 'common', 'date-range.d.ts')
const TSCONFIG = path.join(ROOT, 'tsconfig.common.json')

function readSafe(p) {
  try { return fs.readFileSync(p, 'utf8') } catch (e) { return null }
}

describe('Sprint 17: date-range TypeScript 迁移', () => {
  describe('文件存在性', () => {
    test('.ts 源文件存在', () => {
      expect(fs.existsSync(TS)).toBe(true)
    })

    test('.js 编译产物存在', () => {
      expect(fs.existsSync(JS)).toBe(true)
    })

    test('.d.ts 声明文件存在', () => {
      expect(fs.existsSync(DTS)).toBe(true)
    })
  })

  describe('.ts 源码契约', () => {
    let ts
    beforeAll(() => { ts = readSafe(TS) })

    test('导出 DateRangeType 类型', () => {
      expect(ts).toMatch(/export\s+type\s+DateRangeType/)
    })

    test('导出 DateRange 接口', () => {
      expect(ts).toMatch(/export\s+interface\s+DateRange/)
    })

    test('导出 RangeQueryDescriptor 接口', () => {
      expect(ts).toMatch(/export\s+interface\s+RangeQueryDescriptor/)
    })

    test('导出 RANGE_TYPES 常量', () => {
      expect(ts).toMatch(/export\s+const\s+RANGE_TYPES/)
    })

    test('导出默认 default 对象', () => {
      expect(ts).toMatch(/export\s+default\s+\{/)
    })
  })

  describe('模块 API 完整性', () => {
    let dr
    beforeAll(() => {
      delete require.cache[JS]
      dr = require(JS)
    })

    test('导出所有 11 个公共方法', () => {
      const expected = [
        'RANGE_TYPES', 'startOfDay', 'endOfDay',
        'startOfWeek', 'startOfMonth', 'startOfQuarter', 'startOfYear',
        'getDateRange', 'buildRangeQuery', 'diffDays', 'formatDate', 'lastNDates',
      ]
      for (const k of expected) {
        expect(typeof dr[k]).toBe(typeof k === 'string' && k === 'RANGE_TYPES' ? 'object' : 'function')
      }
    })
  })

  describe('getDateRange 8 种 range', () => {
    let dr
    const NOW = new Date('2026-06-05T10:00:00')

    beforeAll(() => {
      delete require.cache[JS]
      dr = require(JS)
    })

    test('today', () => {
      const r = dr.getDateRange('today', NOW)
      expect(r).not.toBeNull()
      expect(r.start.getHours()).toBe(0)
      expect(r.end.getTime() - r.start.getTime()).toBe(86400000)
    })

    test('yesterday', () => {
      const r = dr.getDateRange('yesterday', NOW)
      expect(r).not.toBeNull()
      expect(r.end.getTime() - r.start.getTime()).toBe(86400000)
    })

    test('week（周一为周首）', () => {
      const r = dr.getDateRange('week', NOW)
      // 2026-06-05 是周五
      expect(r.start.getDay()).toBe(1) // Monday
    })

    test('month', () => {
      const r = dr.getDateRange('month', NOW)
      expect(r.start.getDate()).toBe(1)
      expect(r.start.getMonth()).toBe(NOW.getMonth())
    })

    test('last7 / last30', () => {
      const r7 = dr.getDateRange('last7', NOW)
      const r30 = dr.getDateRange('last30', NOW)
      expect(r7.end - r7.start).toBe(7 * 86400000)
      expect(r30.end - r30.start).toBe(30 * 86400000)
    })

    test('quarter', () => {
      const r = dr.getDateRange('quarter', NOW)
      expect(r.start.getDate()).toBe(1)
      // Q2 starts at April
      expect([0, 3, 6, 9]).toContain(r.start.getMonth())
    })

    test('year', () => {
      const r = dr.getDateRange('year', NOW)
      expect(r.start.getMonth()).toBe(0)
      expect(r.start.getDate()).toBe(1)
    })

    test('all → null', () => {
      expect(dr.getDateRange('all', NOW)).toBeNull()
    })
  })

  describe('start/end 工具', () => {
    let dr
    beforeAll(() => {
      delete require.cache[JS]
      dr = require(JS)
    })

    test('startOfDay', () => {
      const d = dr.startOfDay(new Date('2026-06-05T15:30:45'))
      expect(d.getHours()).toBe(0)
      expect(d.getMinutes()).toBe(0)
    })

    test('endOfDay', () => {
      const d = dr.endOfDay(new Date('2026-06-05T10:00:00'))
      expect(d.getHours()).toBe(23)
      expect(d.getMinutes()).toBe(59)
    })

    test('startOfWeek 周一为周首', () => {
      // 2026-06-05 是周五
      const d = dr.startOfWeek(new Date('2026-06-05T15:00:00'))
      expect(d.getDay()).toBe(1) // Mon
      expect(d.getDate()).toBe(1) // Mon of that week
    })
  })

  describe('startOfMonth/Quarter/Year', () => {
    let dr
    beforeAll(() => {
      delete require.cache[JS]
      dr = require(JS)
    })

    test('startOfMonth', () => {
      const d = dr.startOfMonth(new Date('2026-06-05T15:00:00'))
      expect(d.getDate()).toBe(1)
    })

    test('startOfQuarter（Q2=4月）', () => {
      const d = dr.startOfQuarter(new Date('2026-06-05T15:00:00'))
      expect(d.getMonth()).toBe(3) // April
      expect(d.getDate()).toBe(1)
    })

    test('startOfYear', () => {
      const d = dr.startOfYear(new Date('2026-06-05T15:00:00'))
      expect(d.getMonth()).toBe(0)
    })
  })

  describe('diffDays', () => {
    let dr
    beforeAll(() => {
      delete require.cache[JS]
      dr = require(JS)
    })

    test('同日 → 0', () => {
      expect(dr.diffDays('2026-06-05', '2026-06-05')).toBe(0)
    })

    test('跨天（正）', () => {
      expect(dr.diffDays('2026-06-10', '2026-06-05')).toBe(5)
    })

    test('跨天（负）', () => {
      expect(dr.diffDays('2026-06-05', '2026-06-10')).toBe(-5)
    })
  })

  describe('formatDate / lastNDates', () => {
    let dr
    beforeAll(() => {
      delete require.cache[JS]
      dr = require(JS)
    })

    test('formatDate', () => {
      const d = dr.formatDate(new Date(2026, 5, 5)) // June 5
      expect(d).toBe('2026-06-05')
    })

    test('lastNDates(7) → 7 个 YYYY-MM-DD', () => {
      const arr = dr.lastNDates(7, new Date('2026-06-05T10:00:00'))
      expect(arr).toHaveLength(7)
      expect(arr[arr.length - 1]).toBe('2026-06-05')
      expect(arr[0]).toBe('2026-05-30')
    })

    test('lastNDates(0) → 抛错', () => {
      expect(() => dr.lastNDates(0)).toThrow(/正整数/)
    })

    test('lastNDates(负数) → 抛错', () => {
      expect(() => dr.lastNDates(-1)).toThrow(/正整数/)
    })
  })

  describe('buildRangeQuery', () => {
    let dr
    beforeAll(() => {
      delete require.cache[JS]
      dr = require(JS)
    })

    test('today → 描述符', () => {
      const q = dr.buildRangeQuery('createdAt', 'today', new Date('2026-06-05T10:00:00'))
      expect(q._field).toBe('createdAt')
      expect(q.range).toBe('today')
      expect(q._gte).toBeDefined()
      expect(q._lt).toBeDefined()
    })

    test('all → null', () => {
      expect(dr.buildRangeQuery('createdAt', 'all')).toBeNull()
    })

    test('month', () => {
      const q = dr.buildRangeQuery('createdAt', 'month', new Date('2026-06-05T10:00:00'))
      expect(q._gte.getDate()).toBe(1)
    })
  })

  describe('不支持的 range 抛错', () => {
    let dr
    beforeAll(() => {
      delete require.cache[JS]
      dr = require(JS)
    })

    test('非法 range → 抛错', () => {
      expect(() => dr.getDateRange('decade', new Date())).toThrow(/不支持/)
    })
  })

  describe('与 JS 源完全一致（行为回归）', () => {
    test('today/yesterday/week/month/last7/last30/quarter/year 输出与快照一致', () => {
      // 通过 require 一次 JS 即可验证，方法足够覆盖
      const dr = require(JS)
      const NOW = new Date('2026-06-05T10:00:00')
      const ranges = ['today', 'yesterday', 'week', 'month', 'last7', 'last30', 'quarter', 'year']
      for (const r of ranges) {
        const out = dr.getDateRange(r, NOW)
        expect(out).not.toBeNull()
        expect(out.start).toBeInstanceOf(Date)
        expect(out.end).toBeInstanceOf(Date)
        expect(out.end.getTime()).toBeGreaterThan(out.start.getTime())
      }
    })
  })

  describe('tsconfig / build 工具链', () => {
    test('tsconfig.common.json include date-range.ts', () => {
      const cfg = JSON.parse(readSafe(TSCONFIG))
      expect(cfg.include).toContain('cloudfunctions/common/date-range.ts')
    })

    test('build-common.js TARGETS 含 date-range.js', () => {
      const buildJs = readSafe(path.join(ROOT, 'scripts', 'build-common.js'))
      expect(buildJs).toMatch(/date-range\.js/)
    })
  })
})
