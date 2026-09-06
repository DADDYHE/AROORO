/**
 * utils/boarding-pricing.js
 *
 * 家庭寄养计费核心 · 前端镜像（展示用，非权威）
 *
 * ⚠️ 本文件与 cloudfunctions/orderService/common/boarding-pricing.ts 物理双份。
 *    服务端为唯一权威（下单金额以服务端为准），本文件仅用于下单页实时展示。
 *    两份实现由 test/boarding-pricing.test.js 的双端交叉一致性断言锁死，
 *    改动任一侧都必须同步另一侧并跑测试。
 *
 * 规格：deliverables/boarding-pricing-spec-2026-09-05.md
 */

const DEFAULT_CHECK_OUT_BEFORE = '12:00'
const DEFAULT_BILLING_MODE = 'hotel'

const MINUTES_PER_DAY = 1440
const MINUTES_PER_HOUR = 60
const MS_PER_DAY = 86400000

function parseTimeToMinutes(time) {
  if (typeof time !== 'string') {return null}
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim())
  if (!m) {return null}
  const hh = Number(m[1])
  const mm = Number(m[2])
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) {return null}
  return hh * MINUTES_PER_HOUR + mm
}

function parseDateToUTCms(date) {
  if (typeof date !== 'string') {return null}
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim())
  if (!m) {return null}
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (mo < 1 || mo > 12 || d < 1 || d > 31) {return null}
  return Date.UTC(y, mo - 1, d)
}

function roundToCent(amount) {
  return Math.round((amount + Number.EPSILON) * 100) / 100
}

function computeHotel(input) {
  const {
    pricePerDay, startDate, startAt, endDate, endAt, petCount = 1,
    checkOutBefore = DEFAULT_CHECK_OUT_BEFORE,
  } = input

  const startUtc = parseDateToUTCms(startDate)
  const endUtc = parseDateToUTCms(endDate)
  if (startUtc === null || endUtc === null) {
    throw new Error('INVALID_PARAMS: 日期格式必须为 YYYY-MM-DD')
  }

  const nights = Math.round((endUtc - startUtc) / MS_PER_DAY)
  if (nights < 0) {
    throw new Error('INVALID_PARAMS: 结束日期必须晚于开始日期')
  }

  if (nights === 0) {
    return computeHourly24(input)
  }

  const startAtMin = parseTimeToMinutes(startAt)
  const endAtMin = parseTimeToMinutes(endAt)
  const checkOutMin = parseTimeToMinutes(checkOutBefore) || parseTimeToMinutes(DEFAULT_CHECK_OUT_BEFORE)
  if (startAtMin === null || endAtMin === null) {
    throw new Error('INVALID_PARAMS: 时刻格式必须为 HH:mm')
  }

  const overtimeMinutes = Math.max(0, endAtMin - checkOutMin)
  let overtimeFee = 0
  if (overtimeMinutes > 6 * MINUTES_PER_HOUR) {
    overtimeFee = pricePerDay
  } else if (overtimeMinutes > 0) {
    overtimeFee = pricePerDay / 2
  }

  const baseFee = nights * pricePerDay
  const total = roundToCent((baseFee + overtimeFee) * petCount)

  return {
    total,
    breakdown: {
      mode: 'hotel',
      pricePerDay,
      nights,
      baseFee,
      checkOutBefore,
      overtimeMinutes,
      overtimeHours: roundToCent(overtimeMinutes / MINUTES_PER_HOUR),
      overtimeFee: roundToCent(overtimeFee),
      petCount,
      total,
    },
  }
}

function computeHourly24(input) {
  const {
    pricePerDay, startDate, startAt, endDate, endAt, petCount = 1,
  } = input

  const startUtc = parseDateToUTCms(startDate)
  const endUtc = parseDateToUTCms(endDate)
  if (startUtc === null || endUtc === null) {
    throw new Error('INVALID_PARAMS: 日期格式必须为 YYYY-MM-DD')
  }

  const startAtMin = parseTimeToMinutes(startAt)
  const endAtMin = parseTimeToMinutes(endAt)
  if (startAtMin === null || endAtMin === null) {
    throw new Error('INVALID_PARAMS: 时刻格式必须为 HH:mm')
  }

  const startAbs = startUtc / 60000 + startAtMin
  const endAbs = endUtc / 60000 + endAtMin
  const rawMinutes = endAbs - startAbs
  if (rawMinutes <= 0) {
    throw new Error('INVALID_PARAMS: 结束时间必须晚于开始时间')
  }

  const billableHours = Math.ceil(rawMinutes / MINUTES_PER_HOUR)
  const days = Math.floor(billableHours / 24)
  const remainHours = billableHours - days * 24

  const pricePerHour = pricePerDay / 24
  const baseFee = days * pricePerDay
  const hourlyFee = remainHours * pricePerHour
  const total = roundToCent((baseFee + hourlyFee) * petCount)

  return {
    total,
    breakdown: {
      mode: 'hourly24',
      pricePerDay,
      pricePerHour: roundToCent(pricePerHour * 10000) / 10000,
      billableHours,
      days,
      remainHours,
      baseFee,
      hourlyFee: roundToCent(hourlyFee),
      petCount,
      total,
    },
  }
}

function computeBoardingAmount(input) {
  const mode = input.mode === 'hourly24' ? 'hourly24' : DEFAULT_BILLING_MODE

  const pricePerDay = Number(input.pricePerDay)
  if (!Number.isFinite(pricePerDay) || pricePerDay <= 0) {
    throw new Error('INVALID_PARAMS: 日单价必须为正数')
  }

  const petCountRaw = Number(input.petCount)
  const petCount = Number.isFinite(petCountRaw) && petCountRaw > 0 ? Math.floor(petCountRaw) : 1

  const normalized = Object.assign({}, input, {
    mode,
    pricePerDay,
    petCount,
    checkOutBefore: input.checkOutBefore || DEFAULT_CHECK_OUT_BEFORE,
  })

  return mode === 'hourly24' ? computeHourly24(normalized) : computeHotel(normalized)
}

module.exports = {
  computeBoardingAmount,
  DEFAULT_BILLING_MODE,
  DEFAULT_CHECK_OUT_BEFORE,
}
