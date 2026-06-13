function parseDate(dateValue) {
  if (!dateValue) {return null}
  if (dateValue instanceof Date) {
    return isNaN(dateValue.getTime()) ? null : dateValue
  }
  if (typeof dateValue === 'number') {
    return new Date(dateValue)
  }
  if (typeof dateValue === 'string') {
    if (/^\d+$/.test(dateValue)) {
      return new Date(parseInt(dateValue, 10))
    }
    const normalized = dateValue.replace(/-/g, '/')
    const normParsed = new Date(normalized)
    if (!isNaN(normParsed.getTime())) {return normParsed}
    const direct = new Date(dateValue)
    if (!isNaN(direct.getTime())) {return direct}
  }
  if (typeof dateValue === 'object') {
    if (dateValue.$date != null) {return parseDate(dateValue.$date)}
    if (dateValue.timestamp != null) {return parseDate(dateValue.timestamp)}
    if (typeof dateValue.seconds === 'number') {
      return new Date(dateValue.seconds * 1000 + (dateValue.nanoseconds || 0) / 1e6)
    }
    if (dateValue.value && typeof dateValue.value.seconds === 'number') {
      return new Date(dateValue.value.seconds * 1000 + (dateValue.value.nanoseconds || 0) / 1e6)
    }
    if (typeof dateValue.getTime === 'function') {
      const t = dateValue.getTime()
      if (!isNaN(t)) {return new Date(t)}
    }
  }
  return null
}

function formatDate(dateValue, format) {
  const date = parseDate(dateValue)
  if (!date) {return ''}

  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')

  if (format === 'full') {return `${y}年${parseInt(m)}月${parseInt(d)}日`}
  if (format === 'cn') {return `${parseInt(m)}月${parseInt(d)}日`}
  if (format === 'short') {return `${m}/${d}`}
  return `${y}-${m}-${d}`
}

function formatDateTime(dateValue) {
  if (!dateValue) {return ''}
  const date = parseDate(dateValue)
  if (!date) {return String(dateValue)}
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const h = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${d} ${h}:${min}`
}

function formatTime(ts) {
  if (!ts) {return '-'}
  const date = parseDate(ts)
  if (!date) {return String(ts)}
  const pad = n => (n < 10 ? `0${n}` : `${n}`)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function timeRangeText(startDate, endDate) {
  const start = parseDate(startDate)
  const end = parseDate(endDate)

  const startMonth = start ? start.getMonth() + 1 : null
  const startDay = start ? start.getDate() : null
  const endMonth = end ? end.getMonth() + 1 : null
  const endDay = end ? end.getDate() : null
  const startHour = start ? `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}` : null
  const endHour = end ? `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}` : null

  if (startMonth && startDay && endMonth && endDay) {
    return `${startMonth}月${startDay}日 ${startHour} - ${endMonth}月${endDay}日 ${endHour}`
  }
  if (startMonth && startDay) {
    return `${startMonth}月${startDay}日 ${startHour} 起`
  }
  return '待定'
}

module.exports = { parseDate, formatDate, formatDateTime, formatTime, timeRangeText }
