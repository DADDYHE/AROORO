function toDate(str) {
  if (!str) {return null}
  try {
    const normalized = String(str).replace(/-/g, '/')
    const d = new Date(normalized)
    return isNaN(d.getTime()) ? null : d
  } catch (e) {
    return null
  }
}

function formatDateTime(date) {
  if (!date) {return ''}
  const month = date.getMonth() + 1
  const day = date.getDate()
  const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const hour = date.getHours().toString().padStart(2, '0')
  const minute = date.getMinutes().toString().padStart(2, '0')
  return `${month}月${day}日 ${weekDays[date.getDay()]} ${hour}:${minute}`
}

function transformActivityItem(a) {
  const startDate = toDate(a.startTime)
  const endDate = toDate(a.endTime)
  const isUnlimited = endDate && endDate.getFullYear() > 2090

  let timeText = ''
  if (startDate && endDate && !isUnlimited) {
    const startStr = formatDateTime(startDate)
    const endStr = formatDateTime(endDate)
    const isSameDay = startDate.toDateString() === endDate.toDateString()
    if (isSameDay) {
      const month = startDate.getMonth() + 1
      const day = startDate.getDate()
      const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
      const startH = startDate.getHours().toString().padStart(2, '0')
      const startM = startDate.getMinutes().toString().padStart(2, '0')
      const endH = endDate.getHours().toString().padStart(2, '0')
      const endM = endDate.getMinutes().toString().padStart(2, '0')
      timeText = `${month}月${day}日 ${weekDays[startDate.getDay()]} ${startH}:${startM}-${endH}:${endM}`
    } else {
      timeText = `${startStr} - ${endStr}`
    }
  } else if (startDate) {
    timeText = formatDateTime(startDate)
  }

  let activityStatus = 'upcoming'
  if (a.status === 'registration_stopped') {
    activityStatus = 'registration_stopped'
  } else if (a.status === 'ended' || (endDate && new Date() > endDate)) {
    activityStatus = 'ended'
  } else if (startDate && new Date() > startDate) {
    activityStatus = 'registration_stopped'
  }

  const organizerAvatar = (a.organizer && a.organizer.avatar) || ''
  const hasValidAvatar = Boolean(organizerAvatar)
  let priceText = '免费'
  const ppp = a.pricePerPerson || 0
  const ppet = a.pricePerPet || 0
  if (ppp > 0 && ppet > 0) {
    priceText = `¥${ppp}/人 ¥${ppet}/宠`
  } else if (ppp > 0) {
    priceText = `¥${ppp}/人`
  } else if (ppet > 0) {
    priceText = `¥${ppet}/宠`
  }

  return {
    ...a,
    timeText,
    priceText,
    activityStatus,
    coverUrl: a.coverUrl || '/images/default-activity.svg',
    organizer: {
      name: (a.organizer && a.organizer.name) || '宠团团',
      avatar: organizerAvatar,
      hasValidAvatar,
    },
  }
}

function sortActivities(a, b) {
  const order = { upcoming: 0, registration_stopped: 1, ended: 2 }
  const aOrder = order[a.activityStatus] ?? 0
  const bOrder = order[b.activityStatus] ?? 0
  if (aOrder !== bOrder) {return aOrder - bOrder}
  return (b.startTime || '').localeCompare(a.startTime || '')
}

module.exports = { toDate, formatDateTime, transformActivityItem, sortActivities }
