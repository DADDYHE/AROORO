/**
 * cloudfunctions/common/date-range.js 单元测试
 */

const {
  RANGE_TYPES,
  startOfDay,
  endOfDay,
  startOfWeek,
  startOfMonth,
  startOfQuarter,
  startOfYear,
  getDateRange,
  buildRangeQuery,
  diffDays,
  formatDate,
  lastNDates,
} = require('../cloudfunctions/common/date-range')

// 固定测试时间：2026-03-18（周三）12:30:00
const FIXED_NOW = new Date('2026-03-18T12:30:00.000Z')

describe('date-range.js', () => {
  describe('RANGE_TYPES', () => {
    test('应列出所有支持的 range', () => {
      expect(RANGE_TYPES).toEqual(expect.arrayContaining([
        'today', 'yesterday', 'week', 'month', 'last7', 'last30',
        'quarter', 'year', 'all',
      ]))
    })
  })

  describe('startOfDay / endOfDay', () => {
    test('startOfDay 应归零时分秒', () => {
      const d = startOfDay(FIXED_NOW)
      expect(d.getHours()).toBe(0)
      expect(d.getMinutes()).toBe(0)
      expect(d.getSeconds()).toBe(0)
      expect(d.getMilliseconds()).toBe(0)
    })

    test('endOfDay 应设为 23:59:59.999', () => {
      const d = endOfDay(FIXED_NOW)
      expect(d.getHours()).toBe(23)
      expect(d.getMinutes()).toBe(59)
      expect(d.getSeconds()).toBe(59)
      expect(d.getMilliseconds()).toBe(999)
    })
  })

  describe('startOfWeek（中国习惯，周一为一周第一天）', () => {
    test('周三应返回本周一', () => {
      const wed = new Date('2026-03-18T12:00:00.000Z') // 周三
      const mon = startOfWeek(wed)
      // 应当是 2026-03-16
      expect(mon.getDay()).toBe(1)
    })

    test('周日应返回上周一（向前 6 天）', () => {
      const sun = new Date('2026-03-22T12:00:00.000Z') // 周日
      const mon = startOfWeek(sun)
      // 应当是 2026-03-16
      expect(mon.getDate()).toBeLessThan(sun.getDate())
    })
  })

  describe('startOfMonth / startOfQuarter / startOfYear', () => {
    test('startOfMonth 应为当月 1 日', () => {
      const d = startOfMonth(FIXED_NOW)
      expect(d.getDate()).toBe(1)
      expect(d.getMonth()).toBe(FIXED_NOW.getMonth())
    })

    test('startOfQuarter 应回到季度首月 1 日', () => {
      // 3 月 18 日 → Q1 = 1 月
      expect(startOfQuarter(FIXED_NOW).getMonth()).toBe(0)
      const aug = new Date('2026-08-15T00:00:00.000Z')
      expect(startOfQuarter(aug).getMonth()).toBe(6) // Q3 = 7 月
    })

    test('startOfYear 应回到 1 月 1 日', () => {
      const d = startOfYear(FIXED_NOW)
      expect(d.getMonth()).toBe(0)
      expect(d.getDate()).toBe(1)
    })
  })

  describe('getDateRange', () => {
    test('all 应返回 null', () => {
      expect(getDateRange('all')).toBeNull()
      expect(getDateRange(null)).toBeNull()
    })

    test('today 跨度应为 1 天', () => {
      const r = getDateRange('today', FIXED_NOW)
      const days = (r.end - r.start) / 86400000
      expect(days).toBe(1)
      expect(startOfDay(r.start).getTime()).toBe(r.start.getTime())
    })

    test('yesterday 应是 [昨天 00:00, 今天 00:00)', () => {
      const r = getDateRange('yesterday', FIXED_NOW)
      const today = startOfDay(FIXED_NOW)
      const yesterday = new Date(today.getTime() - 86400000)
      expect(r.start.getTime()).toBe(yesterday.getTime())
      expect(r.end.getTime()).toBe(today.getTime())
    })

    test('week 应为 [本周一, 下周一)', () => {
      const r = getDateRange('week', FIXED_NOW)
      expect(r.start.getDay()).toBe(1) // 周一
      expect((r.end - r.start) / 86400000).toBe(7)
    })

    test('month 应为 [本月 1 日, 下月 1 日)', () => {
      const r = getDateRange('month', FIXED_NOW)
      expect(r.start.getDate()).toBe(1)
      expect(r.end.getDate()).toBe(1)
      expect(r.end.getMonth()).toBe((FIXED_NOW.getMonth() + 1) % 12)
    })

    test('last7 跨度应为 7 天', () => {
      const r = getDateRange('last7', FIXED_NOW)
      expect((r.end - r.start) / 86400000).toBe(7)
    })

    test('last30 跨度应为 30 天', () => {
      const r = getDateRange('last30', FIXED_NOW)
      expect((r.end - r.start) / 86400000).toBe(30)
    })

    test('quarter 跨度应为 3 个月', () => {
      const r = getDateRange('quarter', FIXED_NOW)
      const months = (r.end.getFullYear() - r.start.getFullYear()) * 12
        + (r.end.getMonth() - r.start.getMonth())
      expect(months).toBe(3)
    })

    test('year 跨度应为 1 年', () => {
      const r = getDateRange('year', FIXED_NOW)
      expect(r.end.getFullYear() - r.start.getFullYear()).toBe(1)
    })

    test('未知 range 应抛错', () => {
      expect(() => getDateRange('unknown_range')).toThrow(/不支持/)
    })
  })

  describe('buildRangeQuery', () => {
    test('all 应返回 null', () => {
      expect(buildRangeQuery('createdAt', 'all')).toBeNull()
    })

    test('应返回包含 _field / _gte / _lt 的描述符', () => {
      const q = buildRangeQuery('paidAt', 'today', FIXED_NOW)
      expect(q._field).toBe('paidAt')
      expect(q.range).toBe('today')
      expect(q._gte).toBeInstanceOf(Date)
      expect(q._lt).toBeInstanceOf(Date)
    })
  })

  describe('diffDays', () => {
    test('应正确计算天差', () => {
      const a = new Date('2026-03-20T00:00:00.000Z')
      const b = new Date('2026-03-18T00:00:00.000Z')
      expect(diffDays(a, b)).toBe(2)
    })

    test('同日应为 0', () => {
      // 使用本地时区的「同一天」字符串，避免时区干扰
      const a = new Date(2026, 2, 18, 10, 0, 0) // March 18, 10:00 local
      const b = new Date(2026, 2, 18, 20, 0, 0) // March 18, 20:00 local
      expect(diffDays(a, b)).toBe(0)
    })

    test('应接受字符串（YYYY-MM-DD）', () => {
      expect(diffDays('2026-03-25', '2026-03-18')).toBe(7)
    })

    test('应接受 ISO 字符串', () => {
      // 使用 12:00 UTC 以避免跨时区偏移
      expect(diffDays('2026-03-25T12:00:00Z', '2026-03-18T12:00:00Z')).toBe(7)
    })

    test('无效日期应抛错', () => {
      expect(() => diffDays('not-a-date', '2026-01-01')).toThrow()
    })
  })

  describe('formatDate', () => {
    test('应输出 YYYY-MM-DD', () => {
      const d = new Date('2026-03-05T15:00:00.000Z')
      const out = formatDate(d)
      expect(out).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(out).toContain('2026')
    })
  })

  describe('lastNDates', () => {
    test('应返回 N 个日期（按时间正序）', () => {
      const dates = lastNDates(7, FIXED_NOW)
      expect(dates).toHaveLength(7)
      expect(dates[0] < dates[6]).toBe(true)
    })

    test('天数错误应抛错', () => {
      expect(() => lastNDates(0)).toThrow()
      expect(() => lastNDates(-1)).toThrow()
      expect(() => lastNDates(1.5)).toThrow()
    })
  })
})
