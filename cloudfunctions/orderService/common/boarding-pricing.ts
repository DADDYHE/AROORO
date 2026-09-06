/**
 * cloudfunctions/orderService/common/boarding-pricing.ts
 *
 * 家庭寄养计费核心（唯一权威）
 *
 * 两套算法：
 *   - hotel    酒店式：按过夜数计费 + 超时退房加收（≤6h 半天，>6h 全天）
 *   - hourly24 24 小时制：入住时刻向下取整到整点起算，每满 24h 为一天，尾数按实际小时计费
 *
 * 设计约束：
 *   - 纯函数：不碰 db / Date.now() / 任何 IO，可单测
 *   - 时刻用 'HH:mm' 字面量，日期用 'YYYY-MM-DD' 字面量，日期差走 Date.UTC 计算，
 *     彻底规避云函数 UTC 与本地时区差异（禁裸 new Date(str) 解析日期）
 *   - 金额全程「元」，仅最终金额四舍五入到分（项目铁律：勿 ÷100）
 *
 * 规格：deliverables/boarding-pricing-spec-2026-09-05.md
 */

export type BillingMode = 'hotel' | 'hourly24'

export interface BoardingPricingInput {
  mode?: string
  pricePerDay: number
  startDate: string
  startAt: string
  endDate: string
  endAt: string
  petCount?: number
  checkOutBefore?: string
}

export interface HotelBreakdown {
  mode: 'hotel'
  pricePerDay: number
  nights: number
  baseFee: number
  checkOutBefore: string
  overtimeMinutes: number
  overtimeHours: number
  overtimeFee: number
  petCount: number
  total: number
}

export interface Hourly24Breakdown {
  mode: 'hourly24'
  pricePerDay: number
  pricePerHour: number
  billableHours: number
  days: number
  remainHours: number
  baseFee: number
  hourlyFee: number
  petCount: number
  total: number
}

export type ChargeBreakdown = HotelBreakdown | Hourly24Breakdown

export interface BoardingPricingResult {
  total: number
  breakdown: ChargeBreakdown
}

export const DEFAULT_CHECK_OUT_BEFORE = '12:00'
export const DEFAULT_BILLING_MODE: BillingMode = 'hotel'

const MINUTES_PER_DAY = 1440
const MINUTES_PER_HOUR = 60
const MS_PER_DAY = 86400000

/** 'HH:mm' → 当日分钟数；非法输入返回 null */
function parseTimeToMinutes(time: unknown): number | null {
  if (typeof time !== 'string') {return null}
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim())
  if (!m) {return null}
  const hh = Number(m[1])
  const mm = Number(m[2])
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) {return null}
  return hh * MINUTES_PER_HOUR + mm
}

/** 'YYYY-MM-DD' → UTC 零点时间戳（ms）；非法输入返回 null */
function parseDateToUTCms(date: unknown): number | null {
  if (typeof date !== 'string') {return null}
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim())
  if (!m) {return null}
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (mo < 1 || mo > 12 || d < 1 || d > 31) {return null}
  return Date.UTC(y, mo - 1, d)
}

/** 四舍五入到分（2 位小数） */
function roundToCent(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100
}

/**
 * 酒店式计费
 * 过夜数 nights = 退房日 − 入住日（纯日期差，与时刻无关）
 * 超时：离开时刻 > checkOutBefore 时，≤6h 加收半天，>6h 加收一天
 * nights = 0（当天送当天接）→ 降级按 hourly24 规则按小时计
 */
function computeHotel(input: BoardingPricingInput): BoardingPricingResult {
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

  // nights = 0：当天送当天接，降级按小时计费（避免基础费为 0）
  if (nights === 0) {
    return computeHourly24(input)
  }

  const startAtMin = parseTimeToMinutes(startAt)
  const endAtMin = parseTimeToMinutes(endAt)
  const checkOutMin = parseTimeToMinutes(checkOutBefore) ?? parseTimeToMinutes(DEFAULT_CHECK_OUT_BEFORE)!
  if (startAtMin === null || endAtMin === null) {
    throw new Error('INVALID_PARAMS: 时刻格式必须为 HH:mm')
  }

  // 超时仅按「离开时刻」相对 checkOutBefore 的差值计算（离开日即退房日）
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

/**
 * 24 小时制计费（v1.1）
 * 总时长 = 入住精确时刻 → 离开精确时刻的真实分钟差（不再对起算时刻取整：
 *   原取整会把「1:08 入住 / 次日 1:08 离开」拉长为 24h08m，误算 1 天 + 1 小时）
 * 不足 1 小时按 1 小时计（向上取整），每满 24 小时为一天，尾数按小时价
 * 小时费与总金额均保留 2 位小数（四舍五入）
 */
function computeHourly24(input: BoardingPricingInput): BoardingPricingResult {
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

  // 不足 1 小时按 1 小时计
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

/**
 * 家庭寄养计费入口
 *
 * @throws Error INVALID_PARAMS 日期/时刻格式非法或时间倒挂
 */
export function computeBoardingAmount(input: BoardingPricingInput): BoardingPricingResult {
  const mode: BillingMode = input.mode === 'hourly24' ? 'hourly24' : DEFAULT_BILLING_MODE

  const pricePerDay = Number(input.pricePerDay)
  if (!Number.isFinite(pricePerDay) || pricePerDay <= 0) {
    throw new Error('INVALID_PARAMS: 日单价必须为正数')
  }

  const petCountRaw = Number(input.petCount)
  const petCount = Number.isFinite(petCountRaw) && petCountRaw > 0 ? Math.floor(petCountRaw) : 1

  const normalized: BoardingPricingInput = {
    ...input,
    mode,
    pricePerDay,
    petCount,
    checkOutBefore: input.checkOutBefore || DEFAULT_CHECK_OUT_BEFORE,
  }

  return mode === 'hourly24' ? computeHourly24(normalized) : computeHotel(normalized)
}

export default { computeBoardingAmount, DEFAULT_BILLING_MODE, DEFAULT_CHECK_OUT_BEFORE }
