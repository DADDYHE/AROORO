/**
 * 北京时间（东八区 UTC+8）统一时间工具。
 *
 * 项目铁律：无特殊说明的时间均为北京时间。
 * 云函数运行环境默认 UTC，凡遇到"无时区墙钟字符串"（如 "2026-08-08 11:00:00"）
 * 都必须按北京时间解释，绝不能让 V8 按运行环境本地时区（UTC）解析，否则整体偏差 8 小时。
 *
 * 原则：
 *   - 解析（墙钟字符串 -> 绝对时间）：用 Date.UTC(y, mo-1, d, h-8, ...) 显式构造，环境时区无关。
 *   - 格式化（绝对时间 -> 北京墙钟字符串）：把绝对时间 +8h 后用 getUTC* 取分量，环境时区无关。
 *   - 日界（统计用）：bjDayStart 返回"北京当天 00:00"对应的绝对时间。
 */

/** 北京墙钟字符串 -> 绝对时间（Date）。支持 "YYYY-MM-DD HH:mm[:ss]" 或 "YYYY/MM/DD ..."；非匹配格式回退原生解析。 */
function parseBJTime(str) {
  if (!str) { return null }
  if (str instanceof Date) { return str }
  const m = String(str).trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/)
  if (m) {
    const y = +m[1]
    const mo = +m[2]
    const d = +m[3]
    const h = +m[4]
    const mi = +m[5]
    const se = +(m[6] || 0)
    // 北京墙钟 -> UTC 时间戳（东八区）
    return new Date(Date.UTC(y, mo - 1, d, h - 8, mi, se))
  }
  const dt = new Date(String(str).replace(/-/g, '/'))
  return isNaN(dt.getTime()) ? null : dt
}

/** 绝对时间 -> 北京时间墙钟字符串（用于与 DB 中北京墙钟字符串做字符串比较，如 _.lte(nowStr)）。 */
function bjWallClock(date) {
  const d = (date instanceof Date) ? date : new Date(date)
  if (isNaN(d.getTime())) { return '' }
  const t = new Date(d.getTime() + 8 * 3600000) // 平移到"北京墙钟"对应的 UTC 时刻
  const p = (n) => String(n).padStart(2, '0')
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}:${p(t.getUTCSeconds())}`
}

/** 绝对时间 -> 北京时间墙钟字符串（默认到分钟，兼容既有 'YYYY-MM-DD HH:mm' 存储格式）。 */
function bjFormat(date) {
  const wall = bjWallClock(date)
  if (!wall) { return '' }
  return wall.slice(0, 16) // 'YYYY-MM-DD HH:mm'
}

/** 北京当天 00:00 对应的绝对时间（统计日界用，环境时区无关）。 */
function bjDayStart(date) {
  const d = (date instanceof Date) ? new Date(date.getTime()) : new Date()
  const t = new Date(d.getTime() + 8 * 3600000)
  const dayStartUTC = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), 0, 0, 0)
  return new Date(dayStartUTC - 8 * 3600000)
}

/** 北京当月 1 号 00:00 对应的绝对时间（统计月界用）。 */
function bjMonthStart(date) {
  const d = (date instanceof Date) ? new Date(date.getTime()) : new Date()
  const t = new Date(d.getTime() + 8 * 3600000)
  const monthStartUTC = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1, 0, 0, 0)
  return new Date(monthStartUTC - 8 * 3600000)
}

module.exports = { parseBJTime, bjWallClock, bjFormat, bjDayStart, bjMonthStart }
