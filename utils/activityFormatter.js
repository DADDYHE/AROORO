const { parseDate, timeRangeText } = require('./dateUtils')

function isRegistrationEnded(startTime) {
  const start = parseDate(startTime)
  if (!start) return false
  return start <= new Date()
}

function isActivityEnded(endTime) {
  const end = parseDate(endTime)
  if (!end) return false
  return end <= new Date()
}

function formatActivityForDisplay(activity) {
  const startTime = parseDate(activity.startTime)
  const endTime = parseDate(activity.endTime)
  const registrationEnded = isRegistrationEnded(activity.startTime)
  const activityEnded = isActivityEnded(activity.endTime)

  return {
    _id: activity._id,
    title: activity.title || '',
    coverUrl: activity.coverUrl || '/images/default-activity.png',
    timeText: timeRangeText(activity.startTime, activity.endTime),
    location: activity.location || '',
    price: activity.price || 0,
    pricePerPerson: activity.pricePerPerson || 0,
    pricePerPet: activity.pricePerPet || 0,
    registrationEnded: registrationEnded,
    isRegistered: activity.joined || false,
    isEnded: activityEnded,
    currentParticipants: activity.currentParticipants || 0,
    maxParticipants: activity.maxParticipants || 0,
    category: activity.category || '',
    _sortTime: startTime ? startTime.getTime() : 0,
  }
}

function sortAndSliceActivities(activities, maxCount) {
  const formatted = activities.map(formatActivityForDisplay)
  const active = formatted.filter(a => !a.isEnded && !a.registrationEnded).sort((a, b) => a._sortTime - b._sortTime)
  const registrationStopped = formatted.filter(a => !a.isEnded && a.registrationEnded).sort((a, b) => b._sortTime - a._sortTime)
  const ended = formatted.filter(a => a.isEnded).sort((a, b) => b._sortTime - a._sortTime)

  let result = [...active, ...registrationStopped, ...ended]
  if (maxCount && maxCount > 0) {
    result = result.slice(0, maxCount)
  }

  result.forEach(a => delete a._sortTime)
  return result
}

module.exports = { isRegistrationEnded, isActivityEnded, formatActivityForDisplay, sortAndSliceActivities }