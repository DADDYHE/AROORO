import dayjs from 'dayjs'

export function formatDate(val) {
  if (!val) {return '-'}
  if (typeof val === 'object' && val !== null && Object.keys(val).length === 0) {return '-'}
  let d
  if (typeof val === 'object' && val !== null) {
    if (val.$date) {
      const raw = typeof val.$date === 'object' && val.$date.$numberLong ? Number(val.$date.$numberLong) : val.$date
      d = new Date(raw)
    } else if (typeof val.seconds === 'number') {
      d = new Date(val.seconds * 1000 + (val.nanoseconds || 0) / 1e6)
    } else if (val.value && typeof val.value.seconds === 'number') {
      d = new Date(val.value.seconds * 1000 + (val.value.nanoseconds || 0) / 1e6)
    } else if (typeof val.getTime === 'function') {
      d = new Date(val.getTime())
    } else {
      d = new Date(val)
    }
  } else {
    d = new Date(val)
  }
  if (isNaN(d.getTime())) {return '-'}
  return dayjs(d).format('YYYY-MM-DD HH:mm')
}

export function formatMoney(val) {
  if (val === undefined || val === null) {return '¥0.00'}
  const num = Number(val)
  if (isNaN(num)) {return '¥0.00'}
  return `¥${num.toFixed(2)}`
}
