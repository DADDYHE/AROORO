/**
 * cloudfunctions/common/date-holidays.js 单元测试
 */

const {
  HOLIDAYS_2025,
  HOLIDAYS_2026,
  HOLIDAYS_2027,
  WORKDAYS,
  isHoliday,
  isWorkday,
  isBusinessDay,
  getHolidayInfo,
  countBusinessDays,
  getDayPriceMultiplier,
  registerHolidays,
} = require('../cloudfunctions/common/date-holidays')

describe('date-holidays.js', () => {
  describe('isHoliday', () => {
    test('应识别 2025 春节', () => {
      expect(isHoliday(new Date('2025-01-29T12:00:00'))).toBe(true)
    })

    test('应识别 2026 国庆', () => {
      expect(isHoliday(new Date('2026-10-01T00:00:00'))).toBe(true)
    })

    test('应识别 2027 元旦', () => {
      expect(isHoliday(new Date('2027-01-01T00:00:00'))).toBe(true)
    })

    test('非节假日应返回 false', () => {
      expect(isHoliday(new Date('2026-03-18T12:00:00'))).toBe(false) // 普通周三
    })

    test('字符串输入应可识别', () => {
      expect(isHoliday('2025-05-01')).toBe(true)
    })

    test('无效日期应返回 false', () => {
      expect(isHoliday('not-a-date')).toBe(false)
    })

    test('未声明年份应返回 false', () => {
      expect(isHoliday(new Date('2024-10-01T00:00:00'))).toBe(false)
    })
  })

  describe('isWorkday（调休上班）', () => {
    test('应识别调休上班日', () => {
      expect(isWorkday(new Date('2025-01-26T00:00:00'))).toBe(true)
    })

    test('非调休日应返回 false', () => {
      expect(isWorkday(new Date('2025-01-25T00:00:00'))).toBe(false)
    })
  })

  describe('isBusinessDay', () => {
    test('普通工作日应返回 true', () => {
      expect(isBusinessDay(new Date('2026-03-18T00:00:00'))).toBe(true) // 周三
    })

    test('周末非调休应返回 false', () => {
      expect(isBusinessDay(new Date('2026-03-22T00:00:00'))).toBe(false) // 周日
    })

    test('周末调休应返回 true', () => {
      expect(isBusinessDay(new Date('2025-01-26T00:00:00'))).toBe(true)
    })

    test('工作日但被设为节假日应返回 false', () => {
      // 2025-10-06 是周一，且是中秋节
      expect(isBusinessDay(new Date('2025-10-06T00:00:00'))).toBe(false)
    })
  })

  describe('getHolidayInfo', () => {
    test('节假日应返回 name + type', () => {
      const info = getHolidayInfo(new Date('2025-05-01T00:00:00'))
      expect(info).toEqual({ name: '劳动节', type: 'holiday' })
    })

    test('调休上班应返回 workday', () => {
      const info = getHolidayInfo(new Date('2025-01-26T00:00:00'))
      expect(info).toEqual({ name: '春节调休上班', type: 'workday' })
    })

    test('普通日应返回 null', () => {
      expect(getHolidayInfo(new Date('2026-03-18T00:00:00'))).toBeNull()
    })
  })

  describe('countBusinessDays', () => {
    test('同日起止应返回 1（含起始当日）', () => {
      const a = new Date('2026-03-18T00:00:00')
      const b = new Date('2026-03-19T00:00:00')
      expect(countBusinessDays(a, b)).toBe(1)
    })

    test('跨周一到周五应返回 5', () => {
      const a = new Date('2026-03-16T00:00:00') // 周一
      const b = new Date('2026-03-23T00:00:00') // 下周一
      // 周一~周五 = 5 天
      expect(countBusinessDays(a, b)).toBe(5)
    })

    test('start >= end 应返回 0', () => {
      const a = new Date('2026-03-20T00:00:00')
      const b = new Date('2026-03-18T00:00:00')
      expect(countBusinessDays(a, b)).toBe(0)
    })

    test('应剔除节假日', () => {
      // 2026-04-04 周六至 2026-04-08 周三（清明假期）
      const a = new Date('2026-04-04T00:00:00')
      const b = new Date('2026-04-08T00:00:00')
      // 04-04 周六假, 04-05 周日假, 04-06 周一假, 04-07 周二（工作日）
      expect(countBusinessDays(a, b)).toBe(1)
    })

    test('应支持字符串', () => {
      expect(countBusinessDays('2026-03-16', '2026-03-20')).toBe(4) // 周一到周五
    })

    test('无效日期应抛错', () => {
      expect(() => countBusinessDays('bad', '2026-03-20')).toThrow()
    })
  })

  describe('getDayPriceMultiplier', () => {
    test('工作日应使用 regularMultiplier', () => {
      expect(getDayPriceMultiplier(new Date('2026-03-18T00:00:00'))).toBe(1.0)
    })

    test('周末应使用 weekendMultiplier', () => {
      expect(getDayPriceMultiplier(new Date('2026-03-21T00:00:00'))).toBe(1.2) // 周六
    })

    test('节假日应使用 holidayMultiplier', () => {
      expect(getDayPriceMultiplier(new Date('2026-10-01T00:00:00'))).toBe(1.5)
    })

    test('应支持自定义倍率', () => {
      const m = getDayPriceMultiplier(new Date('2026-10-01T00:00:00'), {
        holidayMultiplier: 2.0,
      })
      expect(m).toBe(2.0)
    })

    test('无效日期应返回 regular', () => {
      expect(getDayPriceMultiplier('bad')).toBe(1.0)
    })
  })

  describe('registerHolidays', () => {
    test('应支持动态注册新年份', () => {
      registerHolidays(2028, { '2028-01-01': { name: '元旦', type: 'holiday' } })
      expect(isHoliday(new Date('2028-01-01T00:00:00'))).toBe(true)
    })

    test('应与已有年份合并', () => {
      registerHolidays(2025, { '2025-12-31': { name: '特别假', type: 'holiday' } })
      expect(isHoliday(new Date('2025-12-31T00:00:00'))).toBe(true)
      expect(isHoliday(new Date('2025-05-01T00:00:00'))).toBe(true) // 不影响原有
    })

    test('非法 year 应抛错', () => {
      expect(() => registerHolidays(1999, {})).toThrow(/year/)
      expect(() => registerHolidays(2026, null)).toThrow(/holidays/)
    })
  })

  describe('数据完整性', () => {
    test('HOLIDAYS_2025 应至少包含春节 / 清明 / 劳动 / 端午 / 国庆 5 大节日', () => {
      const names = new Set(Object.values(HOLIDAYS_2025).map(v => v.name))
      expect(names.has('春节')).toBe(true)
      expect(names.has('清明节')).toBe(true)
      expect(names.has('劳动节')).toBe(true)
      expect(names.has('端午节')).toBe(true)
      expect(names.has('国庆节')).toBe(true)
    })

    test('HOLIDAYS_2026 与 2027 应有合理节假日数量', () => {
      expect(Object.keys(HOLIDAYS_2026).length).toBeGreaterThan(20)
      expect(Object.keys(HOLIDAYS_2027).length).toBeGreaterThan(20)
    })

    test('WORKDAYS 应至少声明 3 条调休', () => {
      expect(Object.keys(WORKDAYS).length).toBeGreaterThanOrEqual(3)
    })
  })
})
