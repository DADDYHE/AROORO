/**
 * Sprint 14 - date-holidays.js → .ts 迁移验证测试
 */

const fs = require('fs')
const path = require('path')

const COMMON = path.resolve(__dirname, '..', 'cloudfunctions', 'common')

describe('Sprint 14: date-holidays.js → .ts 迁移', () => {
  test('date-holidays.ts 源文件应存在', () => {
    expect(fs.existsSync(path.join(COMMON, 'date-holidays.ts'))).toBe(true)
  })

  test('编译产物 date-holidays.js 应存在', () => {
    expect(fs.existsSync(path.join(COMMON, 'date-holidays.js'))).toBe(true)
  })

  test('类型声明 date-holidays.d.ts 应存在', () => {
    expect(fs.existsSync(path.join(COMMON, 'date-holidays.d.ts'))).toBe(true)
  })

  test('date-holidays.js 顶部应有 eslint-disable 标记（tsc 产物）', () => {
    const js = fs.readFileSync(path.join(COMMON, 'date-holidays.js'), 'utf8')
    expect(js.startsWith('/* eslint-disable')).toBe(true)
  })

  test('编译后的 .js 仍能正确导出所有公共 API', () => {
    const api = require(path.join(COMMON, 'date-holidays.js'))
    expect(typeof api.isHoliday).toBe('function')
    expect(typeof api.isWorkday).toBe('function')
    expect(typeof api.isBusinessDay).toBe('function')
    expect(typeof api.getHolidayInfo).toBe('function')
    expect(typeof api.countBusinessDays).toBe('function')
    expect(typeof api.getDayPriceMultiplier).toBe('function')
    expect(typeof api.registerHolidays).toBe('function')
    expect(typeof api.HOLIDAYS_2025).toBe('object')
    expect(typeof api.HOLIDAYS_2026).toBe('object')
    expect(typeof api.HOLIDAYS_2027).toBe('object')
    expect(typeof api.WORKDAYS).toBe('object')
  })

  test('.d.ts 应包含核心导出', () => {
    const dts = fs.readFileSync(path.join(COMMON, 'date-holidays.d.ts'), 'utf8')
    expect(dts).toContain('isHoliday')
    expect(dts).toContain('isBusinessDay')
    expect(dts).toContain('getDayPriceMultiplier')
    expect(dts).toContain('HolidayEntry')
  })

  test('tsconfig.common.json 应包含 date-holidays.ts', () => {
    const cfg = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '..', 'tsconfig.common.json'), 'utf8')
    )
    expect(cfg.include).toContain('cloudfunctions/common/date-holidays.ts')
  })

  test('build:common 应处理 date-holidays.js', () => {
    const buildScript = fs.readFileSync(
      path.resolve(__dirname, '..', 'scripts', 'build-common.js'),
      'utf8'
    )
    expect(buildScript).toContain("'date-holidays.js'")
  })

  test('行为与迁移前完全一致：isHoliday 真实场景', () => {
    const { isHoliday, isBusinessDay, getDayPriceMultiplier } = require(path.join(COMMON, 'date-holidays.js'))
    expect(isHoliday('2025-10-01')).toBe(true)
    expect(isHoliday('2025-10-06')).toBe(true) // 中秋
    expect(isHoliday('2026-02-16')).toBe(true)
    expect(isHoliday('2025-03-15')).toBe(false)

    // 国庆 10-01 是周三
    expect(getDayPriceMultiplier('2025-10-01')).toBe(1.5)
    // 周六
    expect(getDayPriceMultiplier('2025-10-04')).toBe(1.5) // 国庆期内按节假日
    // 工作日
    expect(getDayPriceMultiplier('2025-10-20')).toBe(1.0)
  })

  test('getDayPriceMultiplier 自定义倍率', () => {
    const { getDayPriceMultiplier } = require(path.join(COMMON, 'date-holidays.js'))
    const m = getDayPriceMultiplier('2025-10-01', {
      weekendMultiplier: 1.1,
      holidayMultiplier: 2.0,
      regularMultiplier: 0.9,
    })
    expect(m).toBe(2.0)
  })

  test('registerHolidays 校验参数', () => {
    const { registerHolidays } = require(path.join(COMMON, 'date-holidays.js'))
    expect(() => registerHolidays(1999, {})).toThrow()
    expect(() => registerHolidays(2200, {})).toThrow()
    expect(() => registerHolidays(2028, null)).toThrow()
    // 合法参数应能成功注册
    expect(() => registerHolidays(2028, { '2028-01-01': { name: '元旦', type: 'holiday' } })).not.toThrow()
  })
})
