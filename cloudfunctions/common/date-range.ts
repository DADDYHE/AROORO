/**
 * 日期范围工具（TypeScript 源文件 - Sprint 17 迁移）
 *
 * 替代散落在 orderService/orders.js#_getDateRange 与 orderService/stats.js#rangeMap 的两套实现
 *
 * 支持的 range：
 *   - 'today'     当天 00:00 ~ 次日 00:00
 *   - 'yesterday' 昨天 00:00 ~ 当天 00:00
 *   - 'week'      本周一 00:00 ~ 下周一 00:00
 *   - 'month'     本月 1 日 00:00 ~ 下月 1 日 00:00
 *   - 'last7'     过去 7 天（不包含今天）
 *   - 'last30'    过去 30 天（不包含今天）
 *   - 'quarter'   本季度
 *   - 'year'      本年
 *   - 'all'       不限（返回 null）
 *
 * 时区：使用 process.env.TZ 或系统默认（建议云函数环境变量设置为 Asia/Shanghai）
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.common.json
 */

export type DateRangeType =
  | 'today'
  | 'yesterday'
  | 'week'
  | 'month'
  | 'last7'
  | 'last30'
  | 'quarter'
  | 'year'
  | 'all'

export interface DateRange {
  start: Date
  end: Date
}

export interface RangeQueryDescriptor {
  _field: string
  _gte: Date
  _lt: Date
  range: DateRangeType
}

export const RANGE_TYPES: ReadonlyArray<DateRangeType> = [
  'today',
  'yesterday',
  'week',
  'month',
  'last7',
  'last30',
  'quarter',
  'year',
  'all',
]

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * 获取日期 00:00:00
 */
export function startOfDay(d: Date): Date {
  const out = new Date(d.getTime())
  out.setHours(0, 0, 0, 0)
  return out
}

/**
 * 获取日期 23:59:59.999
 */
export function endOfDay(d: Date): Date {
  const out = new Date(d.getTime())
  out.setHours(23, 59, 59, 999)
  return out
}

/**
 * 计算给定日期所在周的周一 00:00
 * 中国习惯：周一为一周第一天
 */
export function startOfWeek(d: Date): Date {
  const out = startOfDay(d)
  const day = out.getDay() // 0=Sun, 1=Mon, ... 6=Sat
  const diff = day === 0 ? -6 : 1 - day
  out.setDate(out.getDate() + diff)
  return out
}

/**
 * 计算月份第一天 00:00
 */
export function startOfMonth(d: Date): Date {
  const out = startOfDay(d)
  out.setDate(1)
  return out
}

/**
 * 计算季度第一天 00:00
 */
export function startOfQuarter(d: Date): Date {
  const out = startOfDay(d)
  const quarterMonth = Math.floor(out.getMonth() / 3) * 3
  out.setMonth(quarterMonth, 1)
  return out
}

/**
 * 计算年份第一天 00:00
 */
export function startOfYear(d: Date): Date {
  const out = startOfDay(d)
  out.setMonth(0, 1)
  return out
}

/**
 * 主入口：返回日期范围 [start, end)
 *
 * @param range - 日期范围类型（'all' 返回 null）
 * @param now - 基准时间（默认当前）
 * @returns 日期范围或 null（不限）
 */
export function getDateRange(
  range: DateRangeType | string,
  now: Date = new Date()
): DateRange | null {
  if (!range || range === 'all') {
    return null
  }

  // 类型守卫
  if (!RANGE_TYPES.includes(range as DateRangeType)) {
    throw new Error(
      `不支持的 range 类型：${range}（支持：${RANGE_TYPES.join(', ')}）`
    )
  }

  let start: Date
  let end: Date
  const today = startOfDay(now)

  switch (range as DateRangeType) {
  case 'today':
    start = today
    end = new Date(today.getTime() + MS_PER_DAY)
    break
  case 'yesterday':
    start = new Date(today.getTime() - MS_PER_DAY)
    end = today
    break
  case 'week':
    start = startOfWeek(now)
    end = new Date(start.getTime() + 7 * MS_PER_DAY)
    break
  case 'month':
    start = startOfMonth(now)
    end = new Date(start.getFullYear(), start.getMonth() + 1, 1)
    break
  case 'last7':
    end = today
    start = new Date(today.getTime() - 7 * MS_PER_DAY)
    break
  case 'last30':
    end = today
    start = new Date(today.getTime() - 30 * MS_PER_DAY)
    break
  case 'quarter':
    start = startOfQuarter(now)
    end = new Date(start.getFullYear(), start.getMonth() + 3, 1)
    break
  case 'year':
    start = startOfYear(now)
    end = new Date(start.getFullYear() + 1, 0, 1)
    break
  default:
    throw new Error(
      `不支持的 range 类型：${range}（支持：${RANGE_TYPES.join(', ')}）`
    )
  }

  return { start, end }
}

/**
 * 构造 CloudBase 数据库查询条件
 *
 * @param field - 字段名
 * @param range - 日期范围类型
 * @param now - 基准时间
 * @returns db 查询描述符或 null
 */
export function buildRangeQuery(
  field: string,
  range: DateRangeType | string,
  now: Date = new Date()
): RangeQueryDescriptor | null {
  const r = getDateRange(range, now)
  if (!r) {
    return null
  }
  // 使用 db.command 描述符，由调用方注入
  return {
    _field: field,
    _gte: r.start,
    _lt: r.end,
    range: range as DateRangeType,
  }
}

/**
 * 计算两个日期间相差天数（向 0 取整）
 */
export function diffDays(
  a: Date | string,
  b: Date | string
): number {
  const da = a instanceof Date ? a : new Date(a)
  const db = b instanceof Date ? b : new Date(b)
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) {
    throw new Error('无效的日期输入')
  }
  return Math.floor(
    (startOfDay(da).getTime() - startOfDay(db).getTime()) / MS_PER_DAY
  )
}

/**
 * 格式化日期为 YYYY-MM-DD
 */
export function formatDate(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/**
 * 生成过去 N 天的日期数组（用于柱状图）
 *
 * @param days - 天数（正整数）
 * @param end - 截止日期（默认当前）
 * @returns YYYY-MM-DD 列表（按时间正序）
 */
export function lastNDates(
  days: number,
  end: Date = new Date()
): string[] {
  if (!Number.isInteger(days) || days <= 0) {
    throw new Error('days 必须为正整数')
  }
  const out: string[] = []
  const endDay = startOfDay(end)
  for (let i = days - 1; i >= 0; i--) {
    out.push(formatDate(new Date(endDay.getTime() - i * MS_PER_DAY)))
  }
  return out
}

// 默认导出（保持 CommonJS 兼容）
export default {
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
}
