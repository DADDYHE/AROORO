/**
 * 法定节假日工具（TypeScript 源文件 - Sprint 14 迁移）
 *
 * 目标：
 *   - 替代 subpackages/booking/confirm.js 中硬编码的 HOLIDAYS_2025 / HOLIDAYS_2026
 *   - 提供假期判定、调价倍率、工作日计算等能力
 *
 * 数据源：
 *   - 内置 2025 / 2026 / 2027 三年国家法定节假日
 *   - v2.0 计划：迁至 CloudBase 集合 `system_config/holidays_YYYY` 由后台维护
 *
 * 注意：
 *   - 国务院每年 11 月左右发布下一年节假日，本模块需每年更新
 *   - 调休上班日（如周末上班）应使用 `WORKDAYS` 显式声明
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.common.json
 */

const HOLIDAYS_2025: HolidayEntryMap = {
  '2025-01-01': { name: '元旦', type: 'holiday' },
  '2025-01-28': { name: '春节', type: 'holiday' },
  '2025-01-29': { name: '春节', type: 'holiday' },
  '2025-01-30': { name: '春节', type: 'holiday' },
  '2025-01-31': { name: '春节', type: 'holiday' },
  '2025-02-01': { name: '春节', type: 'holiday' },
  '2025-02-02': { name: '春节', type: 'holiday' },
  '2025-02-03': { name: '春节', type: 'holiday' },
  '2025-02-04': { name: '春节', type: 'holiday' },
  '2025-04-04': { name: '清明节', type: 'holiday' },
  '2025-04-05': { name: '清明节', type: 'holiday' },
  '2025-04-06': { name: '清明节', type: 'holiday' },
  '2025-05-01': { name: '劳动节', type: 'holiday' },
  '2025-05-02': { name: '劳动节', type: 'holiday' },
  '2025-05-03': { name: '劳动节', type: 'holiday' },
  '2025-05-04': { name: '劳动节', type: 'holiday' },
  '2025-05-05': { name: '劳动节', type: 'holiday' },
  '2025-05-31': { name: '端午节', type: 'holiday' },
  '2025-06-01': { name: '端午节', type: 'holiday' },
  '2025-06-02': { name: '端午节', type: 'holiday' },
  '2025-10-01': { name: '国庆节', type: 'holiday' },
  '2025-10-02': { name: '国庆节', type: 'holiday' },
  '2025-10-03': { name: '国庆节', type: 'holiday' },
  '2025-10-04': { name: '国庆节', type: 'holiday' },
  '2025-10-05': { name: '国庆节', type: 'holiday' },
  '2025-10-06': { name: '中秋节', type: 'holiday' },
  '2025-10-07': { name: '国庆节', type: 'holiday' },
  '2025-10-08': { name: '国庆节', type: 'holiday' },
}

const HOLIDAYS_2026: HolidayEntryMap = {
  '2026-01-01': { name: '元旦', type: 'holiday' },
  '2026-01-02': { name: '元旦', type: 'holiday' },
  '2026-01-03': { name: '元旦', type: 'holiday' },
  '2026-02-16': { name: '春节', type: 'holiday' },
  '2026-02-17': { name: '春节', type: 'holiday' },
  '2026-02-18': { name: '春节', type: 'holiday' },
  '2026-02-19': { name: '春节', type: 'holiday' },
  '2026-02-20': { name: '春节', type: 'holiday' },
  '2026-02-21': { name: '春节', type: 'holiday' },
  '2026-02-22': { name: '春节', type: 'holiday' },
  '2026-02-23': { name: '春节', type: 'holiday' },
  '2026-04-04': { name: '清明节', type: 'holiday' },
  '2026-04-05': { name: '清明节', type: 'holiday' },
  '2026-04-06': { name: '清明节', type: 'holiday' },
  '2026-05-01': { name: '劳动节', type: 'holiday' },
  '2026-05-02': { name: '劳动节', type: 'holiday' },
  '2026-05-03': { name: '劳动节', type: 'holiday' },
  '2026-06-19': { name: '端午节', type: 'holiday' },
  '2026-06-20': { name: '端午节', type: 'holiday' },
  '2026-06-21': { name: '端午节', type: 'holiday' },
  '2026-10-01': { name: '国庆节', type: 'holiday' },
  '2026-10-02': { name: '国庆节', type: 'holiday' },
  '2026-10-03': { name: '国庆节', type: 'holiday' },
  '2026-10-04': { name: '国庆节', type: 'holiday' },
  '2026-10-05': { name: '国庆节', type: 'holiday' },
  '2026-10-06': { name: '国庆节', type: 'holiday' },
  '2026-10-07': { name: '国庆节', type: 'holiday' },
}

const HOLIDAYS_2027: HolidayEntryMap = {
  '2027-01-01': { name: '元旦', type: 'holiday' },
  '2027-01-02': { name: '元旦', type: 'holiday' },
  '2027-01-03': { name: '元旦', type: 'holiday' },
  '2027-02-05': { name: '春节', type: 'holiday' },
  '2027-02-06': { name: '春节', type: 'holiday' },
  '2027-02-07': { name: '春节', type: 'holiday' },
  '2027-02-08': { name: '春节', type: 'holiday' },
  '2027-02-09': { name: '春节', type: 'holiday' },
  '2027-02-10': { name: '春节', type: 'holiday' },
  '2027-02-11': { name: '春节', type: 'holiday' },
  '2027-04-04': { name: '清明节', type: 'holiday' },
  '2027-04-05': { name: '清明节', type: 'holiday' },
  '2027-04-06': { name: '清明节', type: 'holiday' },
  '2027-05-01': { name: '劳动节', type: 'holiday' },
  '2027-05-02': { name: '劳动节', type: 'holiday' },
  '2027-05-03': { name: '劳动节', type: 'holiday' },
  '2027-06-09': { name: '端午节', type: 'holiday' },
  '2027-06-10': { name: '端午节', type: 'holiday' },
  '2027-06-11': { name: '端午节', type: 'holiday' },
  '2027-10-01': { name: '国庆节', type: 'holiday' },
  '2027-10-02': { name: '国庆节', type: 'holiday' },
  '2027-10-03': { name: '国庆节', type: 'holiday' },
  '2027-10-04': { name: '国庆节', type: 'holiday' },
  '2027-10-05': { name: '国庆节', type: 'holiday' },
  '2027-10-06': { name: '国庆节', type: 'holiday' },
  '2027-10-07': { name: '国庆节', type: 'holiday' },
}

const WORKDAYS: HolidayEntryMap = {
  '2025-01-26': { name: '春节调休上班', type: 'workday' },
  '2025-02-08': { name: '春节调休上班', type: 'workday' },
  '2025-04-27': { name: '劳动节调休上班', type: 'workday' },
  '2025-09-28': { name: '国庆调休上班', type: 'workday' },
  '2025-10-11': { name: '国庆调休上班', type: 'workday' },
  '2026-02-14': { name: '春节调休上班', type: 'workday' },
  '2026-02-28': { name: '春节调休上班', type: 'workday' },
}

const HOLIDAY_TABLE: Record<number, HolidayEntryMap> = {
  2025: HOLIDAYS_2025,
  2026: HOLIDAYS_2026,
  2027: HOLIDAYS_2027,
}

export interface HolidayEntry {
  name: string
  type: 'holiday' | 'workday'
}

export type HolidayEntryMap = Record<string, HolidayEntry>

export interface PriceMultiplierOptions {
  weekendMultiplier?: number
  holidayMultiplier?: number
  regularMultiplier?: number
}

/**
 * 格式化日期为 YYYY-MM-DD
 */
export function toKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * 判定指定日期是否为法定节假日
 */
export function isHoliday(d: Date | string): boolean {
  const date = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(date.getTime())) {return false}
  const key = toKey(date)
  const year = date.getFullYear()
  return Boolean(HOLIDAY_TABLE[year]?.[key])
}

/**
 * 判定指定日期是否为调休工作日
 */
export function isWorkday(d: Date | string): boolean {
  const date = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(date.getTime())) {return false}
  const key = toKey(date)
  return Boolean(WORKDAYS[key])
}

/**
 * 判定是否为工作日（周一~周五 + 调休工作日）
 */
export function isBusinessDay(d: Date | string): boolean {
  const date = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(date.getTime())) {return false}
  const dow = date.getDay()
  if (dow === 0 || dow === 6) {
    return isWorkday(date)
  }
  if (isHoliday(date)) {
    return false
  }
  return true
}

/**
 * 获取指定日期的假期元数据
 */
export function getHolidayInfo(d: Date | string): HolidayEntry | null {
  const date = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(date.getTime())) {return null}
  const key = toKey(date)
  return HOLIDAY_TABLE[date.getFullYear()]?.[key] || WORKDAYS[key] || null
}

/**
 * 计算给定日期范围内的「工作日」数（不包含起始，含结束）
 * 用于价格计算（按工作日 vs 自然日）
 */
export function countBusinessDays(start: Date | string, end: Date | string): number {
  const s = new Date(start)
  const e = new Date(end)
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) {
    throw new Error('无效日期输入')
  }
  if (e < s) {return 0}
  let count = 0
  const cursor = new Date(s)
  while (cursor < e) {
    if (isBusinessDay(cursor)) {count++}
    cursor.setDate(cursor.getDate() + 1)
  }
  return count
}

/**
 * 计算调价倍率（节假日加价）
 */
export function getDayPriceMultiplier(d: Date | string, opts: PriceMultiplierOptions = {}): number {
  const {
    weekendMultiplier = 1.2,
    holidayMultiplier = 1.5,
    regularMultiplier = 1.0,
  } = opts
  const date = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(date.getTime())) {return regularMultiplier}
  if (isHoliday(date)) {return holidayMultiplier}
  const dow = date.getDay()
  if (dow === 0 || dow === 6) {return weekendMultiplier}
  return regularMultiplier
}

/**
 * 加载指定年份的节假日（用于运行时扩展）
 */
export function registerHolidays(year: number, holidays: HolidayEntryMap): void {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error('year 应为 2000-2100 之间的整数')
  }
  if (!holidays || typeof holidays !== 'object') {
    throw new Error('holidays 必须为对象')
  }
  HOLIDAY_TABLE[year] = { ...(HOLIDAY_TABLE[year] || {}), ...holidays }
}

// 重新导出内置数据表，便于测试与外部直接消费
export { HOLIDAYS_2025, HOLIDAYS_2026, HOLIDAYS_2027, WORKDAYS, HOLIDAY_TABLE }
