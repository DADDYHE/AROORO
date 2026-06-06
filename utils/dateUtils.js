function parseDate(dateValue) {
  if (!dateValue) return null

  if (typeof dateValue === 'number') {
    return new Date(dateValue)
  }

  if (typeof dateValue === 'string') {
    if (/^\d+$/.test(dateValue)) {
      return new Date(parseInt(dateValue, 10))
    }
    const normalized = dateValue.replace(/-/g, '/')
    const parsed = new Date(normalized)
    if (!isNaN(parsed.getTime())) {
      return parsed
    }
  }

  if (dateValue instanceof Date) {
    return isNaN(dateValue.getTime()) ? null : dateValue
  }

  return null
}

function formatDate(dateValue, format = 'short') {
  const date = parseDate(dateValue)
  if (!date) return ''

  const month = date.getMonth() + 1
  const day = date.getDate()

  switch (format) {
    case 'full':
      return `${date.getFullYear()}年${month}月${day}日`
    case 'cn':
      return `${month}月${day}日`
    case 'short':
      return `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`
    default:
      return `${month}月${day}日`
  }
}

function timeRangeText(startDate, endDate) {
  const start = parseDate(startDate)
  const end = parseDate(endDate)

  const startMonth = start ? start.getMonth() + 1 : null
  const startDay = start ? start.getDate() : null
  const endMonth = end ? end.getMonth() + 1 : null
  const endDay = end ? end.getDate() : null
  const startHour = start ? String(start.getHours()).padStart(2, '0') + ':' + String(start.getMinutes()).padStart(2, '0') : null
  const endHour = end ? String(end.getHours()).padStart(2, '0') + ':' + String(end.getMinutes()).padStart(2, '0') : null

  if (startMonth && startDay && endMonth && endDay) {
    return `${startMonth}月${startDay}日 ${startHour} - ${endMonth}月${endDay}日 ${endHour}`
  }
  if (startMonth && startDay) {
    return `${startMonth}月${startDay}日 ${startHour} 起`
  }
  return '待定'
}

module.exports = { parseDate, formatDate, timeRangeText }