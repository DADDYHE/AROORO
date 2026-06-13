import dayjs from 'dayjs'

export function formatDate(val) {
  if (!val) {return '-'}
  let d
  if (typeof val === 'object' && val !== null) {
    if (val.$date) {
      // 云数据库 serverDate 序列化格式: { $date: timestamp } 或 { $date: { $numberLong: "timestamp" } }
      const raw = typeof val.$date === 'object' && val.$date.$numberLong ? Number(val.$date.$numberLong) : val.$date
      d = new Date(raw)
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
