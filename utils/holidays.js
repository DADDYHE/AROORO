/**
 * utils/holidays.js
 *
 * 中国法定节假日数据（2025-2026）
 *
 * 用途：
 *   - 判断日期是否为法定节假日
 *   - 计算节假日相关的业务逻辑（如加价、预约等）
 *
 * 用法：
 *   const { isHoliday, isWeekend } = require('../../utils/holidays')
 *   if (isHoliday(date)) { ... }
 */

const HOLIDAYS_2025 = [
  '2025-01-01',
  '2025-01-28', '2025-01-29', '2025-01-30', '2025-01-31',
  '2025-02-01', '2025-02-02', '2025-02-03', '2025-02-04',
  '2025-04-04', '2025-04-05', '2025-04-06',
  '2025-05-01', '2025-05-02', '2025-05-03', '2025-05-04', '2025-05-05',
  '2025-05-31', '2025-06-01', '2025-06-02',
  '2025-10-01', '2025-10-02', '2025-10-03', '2025-10-04',
  '2025-10-05', '2025-10-06', '2025-10-07', '2025-10-08',
]

const HOLIDAYS_2026 = [
  '2026-01-01', '2026-01-02', '2026-01-03',
  '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20',
  '2026-02-21', '2026-02-22', '2026-02-23',
  '2026-04-04', '2026-04-05', '2026-04-06',
  '2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05',
  '2026-06-19', '2026-06-20', '2026-06-21',
  '2026-09-25', '2026-09-26', '2026-09-27',
  '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04',
  '2026-10-05', '2026-10-06', '2026-10-07',
]

const HOLIDAY_SET = new Set([...HOLIDAYS_2025, ...HOLIDAYS_2026])

/**
 * 判断日期是否为法定节假日
 * @param {Date|string} date 日期对象或日期字符串（如 '2025-01-01'）
 * @returns {boolean}
 */
function isHoliday(date) {
  const d = date instanceof Date ? date : new Date(date)
  const dateStr = d.toISOString().split('T')[0]
  return HOLIDAY_SET.has(dateStr)
}

/**
 * 判断日期是否为周末（周六或周日）
 * @param {Date|string} date 日期对象或日期字符串
 * @returns {boolean}
 */
function isWeekend(date) {
  const d = date instanceof Date ? date : new Date(date)
  const day = d.getDay()
  return day === 0 || day === 6
}

/**
 * 判断日期是否为工作日（非周末且非节假日）
 * @param {Date|string} date 日期对象或日期字符串
 * @returns {boolean}
 */
function isWorkday(date) {
  return !isHoliday(date) && !isWeekend(date)
}

module.exports = {
  HOLIDAYS_2025,
  HOLIDAYS_2026,
  isHoliday,
  isWeekend,
  isWorkday,
}
