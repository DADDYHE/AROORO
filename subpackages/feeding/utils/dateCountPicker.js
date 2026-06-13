const { isHoliday } = require('../../../utils/holidays')

const DEFAULT_DAY_PRICE = 50
const DEFAULT_HOLIDAY_PRICE = 60

function calcUnitPrice(dateStr, discount) {
  const dateObj = new Date(dateStr)
  const holiday = isHoliday(dateObj)
  const dayPrice = holiday ? DEFAULT_HOLIDAY_PRICE : DEFAULT_DAY_PRICE
  return Math.round(dayPrice * discount * 100) / 100
}

function buildDateMap(petServices, selectedPetDetails) {
  const dateMap = {}
  if (selectedPetDetails && petServices) {
    selectedPetDetails.forEach(pet => {
      const svc = petServices[pet.id]
      if (svc && svc.serviceDates) {
        svc.serviceDates.forEach(d => {
          if (!dateMap[d.date]) {
            dateMap[d.date] = {
              date: d.date,
              shortDate: d.shortDate,
              timestamp: d.timestamp,
              count: 0,
            }
          }
        })
      }
    })
  }
  return Object.values(dateMap).sort((a, b) => a.timestamp - b.timestamp)
}

function mergePrevCounts(dates, prevDates) {
  if (!prevDates || !prevDates.length) {return dates}
  dates.forEach(item => {
    const prevItem = prevDates.find(p => p.date === item.date)
    if (prevItem) {
      item.count = prevItem.count
    }
  })
  return dates
}

function onSelectDate(ctx, fieldPrefix, index) {
  const dates = ctx.data[fieldPrefix + 'Dates']
  const count = dates[index]?.count ?? 0
  const unitPrice = calcUnitPrice(dates[index].date, fieldPrefix === 'familiarity' ? 0.7 : 0.8)
  ctx.setData({
    [fieldPrefix + 'SelectedIndex']: index,
    [fieldPrefix + 'Count']: count,
    [fieldPrefix + 'UnitPrice']: unitPrice,
  })
}

function onDecrease(ctx, fieldPrefix) {
  const dates = ctx.data[fieldPrefix + 'Dates']
  const idx = ctx.data[fieldPrefix + 'SelectedIndex']
  const count = ctx.data[fieldPrefix + 'Count']
  if (count <= 0) {return}
  const newCount = count - 1
  ctx.setData({
    [fieldPrefix + 'Count']: newCount,
    [`${fieldPrefix}Dates[${idx}].count`]: newCount,
  })
}

function onIncrease(ctx, fieldPrefix) {
  const dates = ctx.data[fieldPrefix + 'Dates']
  const idx = ctx.data[fieldPrefix + 'SelectedIndex']
  const count = ctx.data[fieldPrefix + 'Count']
  if (count >= 10) {return}
  const newCount = count + 1
  ctx.setData({
    [fieldPrefix + 'Count']: newCount,
    [`${fieldPrefix}Dates[${idx}].count`]: newCount,
  })
}

function onConfirm(ctx, fieldPrefix, opts = {}) {
  const dates = ctx.data[fieldPrefix + 'Dates']
  const activeCount = dates.filter(d => d.count > 0).length
  const updateData = {}
  if (activeCount === 0) {
    updateData[fieldPrefix + 'Text'] = ''
    updateData[fieldPrefix + 'Count'] = 0
    updateData['show' + capitalize(fieldPrefix) + 'Picker'] = false
    if (fieldPrefix === 'multiVisit') {
      updateData[fieldPrefix + 'Value'] = 1
    }
    ctx.setData(updateData)
    if (opts.onConfirm) {opts.onConfirm()}
    return
  }
  updateData[fieldPrefix + 'Text'] = `${activeCount}天×多次`
  updateData['show' + capitalize(fieldPrefix) + 'Picker'] = false
  if (fieldPrefix === 'multiVisit') {
    updateData[fieldPrefix + 'Value'] = dates.reduce((sum, d) => sum + d.count, 0)
  }
  ctx.setData(updateData)
  if (opts.onConfirm) {opts.onConfirm()}
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

module.exports = {
  calcUnitPrice,
  buildDateMap,
  mergePrevCounts,
  onSelectDate,
  onDecrease,
  onIncrease,
  onConfirm,
}
