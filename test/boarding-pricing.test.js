/**
 * 家庭寄养双计费算法验证测试
 *
 * 覆盖：
 *   1. 规格 §3.2 酒店式 7 条边界用例（含 6h00m / 6h01m 临界点、nights=0 降级）
 *   2. 规格 §4.2 24 小时制 7 条边界用例（含不足 1 小时取整、47h 高位）
 *   3. 参数校验（日期/时刻格式、时间倒挂、日单价非法）
 *   4. 双端交叉一致性：云函数编译产物 vs 前端镜像，全部用例断言输出全等
 *
 * 规格：deliverables/boarding-pricing-spec-2026-09-05.md
 */

const cloud = require('../cloudfunctions/orderService/common/boarding-pricing')
const front = require('../utils/boarding-pricing')

const PRICE = 100
const CPH = 100 / 24 // 4.1667 元/小时

// 公共输入：9/5 入住 → 9/8 离开
const base = {
  pricePerDay: PRICE,
  startDate: '2026-09-05',
  endDate: '2026-09-08',
  checkOutBefore: '12:00',
}

/** 规格 §3.2 酒店式用例 */
const HOTEL_CASES = [
  {
    name: '3 晚，提前退房不超时',
    input: { ...base, mode: 'hotel', startAt: '14:00', endAt: '10:00' },
    expected: 300,
    nights: 3,
    overtimeFee: 0,
  },
  {
    name: '3 晚，卡点 12:00 退房不超时',
    input: { ...base, mode: 'hotel', startAt: '14:00', endAt: '12:00' },
    expected: 300,
    nights: 3,
    overtimeFee: 0,
  },
  {
    name: '3 晚，超时 2h 加收半天',
    input: { ...base, mode: 'hotel', startAt: '14:00', endAt: '14:00' },
    expected: 350,
    nights: 3,
    overtimeFee: 50,
  },
  {
    name: '3 晚，超时 6h00m 加收半天（临界内）',
    input: { ...base, mode: 'hotel', startAt: '14:00', endAt: '18:00' },
    expected: 350,
    nights: 3,
    overtimeFee: 50,
  },
  {
    name: '3 晚，超时 6h01m 加收全天（临界外）',
    input: { ...base, mode: 'hotel', startAt: '14:00', endAt: '18:01' },
    expected: 400,
    nights: 3,
    overtimeFee: 100,
  },
  {
    name: '1 晚，正常退房',
    input: {
      ...base, mode: 'hotel', endDate: '2026-09-06', startAt: '14:00', endAt: '12:00',
    },
    expected: 100,
    nights: 1,
    overtimeFee: 0,
  },
  {
    name: 'nights=0 当天送当天接，降级按小时（4h）',
    input: {
      ...base, mode: 'hotel', endDate: '2026-09-05', startAt: '14:00', endAt: '18:00',
    },
    expected: 16.67,
    nights: 0,
    degraded: true,
  },
]

/** 规格 §4.2 24 小时制用例（v1.1：总金额四舍五入取整数） */
const HOURLY_CASES = [
  {
    name: '精确 24h（1:08 入住 → 次日 1:08 离开）= 1 天整，不加尾数',
    input: {
      ...base, mode: 'hourly24', startDate: '2026-09-07', endDate: '2026-09-08',
      startAt: '01:08', endAt: '01:08',
    },
    expected: 100,
    days: 1,
    remainHours: 0,
  },
  {
    name: '76h = 3 天 + 4h',
    input: { ...base, mode: 'hourly24', startAt: '10:30', endAt: '14:00' },
    expected: 316.67,
    days: 3,
    remainHours: 4,
  },
  {
    name: '24h 整 = 1 天 + 0h',
    input: {
      ...base, mode: 'hourly24', endDate: '2026-09-06', startAt: '10:30', endAt: '10:00',
    },
    expected: 100,
    days: 1,
    remainHours: 0,
  },
  {
    name: '23h = 0 天 + 23h',
    input: {
      ...base, mode: 'hourly24', endDate: '2026-09-06', startAt: '10:30', endAt: '09:00',
    },
    expected: 95.83,
    days: 0,
    remainHours: 23,
  },
  {
    name: '47h = 1 天 + 23h',
    input: {
      ...base, mode: 'hourly24', endDate: '2026-09-07', startAt: '10:30', endAt: '09:00',
    },
    expected: 195.83,
    days: 1,
    remainHours: 23,
  },
  {
    name: '2h 短住',
    input: {
      ...base, mode: 'hourly24', endDate: '2026-09-05', startAt: '10:30', endAt: '12:00',
    },
    expected: 8.33,
    days: 0,
    remainHours: 2,
  },
  {
    name: '1h 短住',
    input: {
      ...base, mode: 'hourly24', endDate: '2026-09-05', startAt: '10:30', endAt: '11:00',
    },
    expected: 4.17,
    days: 0,
    remainHours: 1,
  },
  {
    name: '0.75h 不足 1 小时按 1 小时计',
    input: {
      ...base, mode: 'hourly24', endDate: '2026-09-05', startAt: '10:30', endAt: '10:45',
    },
    expected: 4.17,
    days: 0,
    remainHours: 1,
  },
]

const ALL_CASES = [...HOTEL_CASES, ...HOURLY_CASES]

describe('寄养计费 · 酒店式（hotel）', () => {
  HOTEL_CASES.forEach(c => {
    test(c.name, () => {
      const { total, breakdown } = cloud.computeBoardingAmount(c.input)
      expect(total).toBe(c.expected)
      if (c.degraded) {
        expect(breakdown.mode).toBe('hourly24')
      } else {
        expect(breakdown.mode).toBe('hotel')
        expect(breakdown.nights).toBe(c.nights)
        expect(breakdown.overtimeFee).toBe(c.overtimeFee)
      }
    })
  })
})

describe('寄养计费 · 24 小时制（hourly24）', () => {
  HOURLY_CASES.forEach(c => {
    test(c.name, () => {
      const { total, breakdown } = cloud.computeBoardingAmount(c.input)
      expect(total).toBe(c.expected)
      expect(breakdown.mode).toBe('hourly24')
      expect(breakdown.days).toBe(c.days)
      expect(breakdown.remainHours).toBe(c.remainHours)
    })
  })
})

describe('寄养计费 · 多宠物与默认值', () => {
  test('多宠物按 petCount 倍增', () => {
    const one = cloud.computeBoardingAmount({ ...base, mode: 'hotel', startAt: '14:00', endAt: '10:00', petCount: 1 })
    const three = cloud.computeBoardingAmount({ ...base, mode: 'hotel', startAt: '14:00', endAt: '10:00', petCount: 3 })
    expect(three.total).toBe(one.total * 3)
  })

  test('billingMode 缺失默认 hotel', () => {
    const r = cloud.computeBoardingAmount({ ...base, startAt: '14:00', endAt: '10:00' })
    expect(r.breakdown.mode).toBe('hotel')
    expect(r.total).toBe(300)
  })

  test('checkOutBefore 缺失默认 12:00', () => {
    const { ...noCheckOut } = base
    delete noCheckOut.checkOutBefore
    const r = cloud.computeBoardingAmount({ ...noCheckOut, mode: 'hotel', startAt: '14:00', endAt: '14:00' })
    expect(r.breakdown.checkOutBefore).toBe('12:00')
    expect(r.total).toBe(350)
  })

  test('checkOutBefore 可自定义为 14:00（超时基准随之变化）', () => {
    const r = cloud.computeBoardingAmount({
      ...base, mode: 'hotel', startAt: '10:00', endAt: '14:00', checkOutBefore: '14:00',
    })
    expect(r.breakdown.overtimeFee).toBe(0)
    expect(r.total).toBe(300)
  })
})

describe('寄养计费 · 参数校验', () => {
  test('日期格式非法应抛错', () => {
    expect(() => cloud.computeBoardingAmount({ ...base, startDate: '2026/09/05', mode: 'hotel', startAt: '14:00', endAt: '10:00' }))
      .toThrow(/YYYY-MM-DD/)
  })

  test('时刻格式非法应抛错', () => {
    expect(() => cloud.computeBoardingAmount({ ...base, mode: 'hotel', startAt: '14 点', endAt: '10:00' }))
      .toThrow(/HH:mm/)
  })

  test('结束日期早于开始日期应抛错', () => {
    expect(() => cloud.computeBoardingAmount({
      ...base, startDate: '2026-09-08', endDate: '2026-09-05', mode: 'hotel', startAt: '14:00', endAt: '10:00',
    })).toThrow(/结束日期必须晚于开始日期/)
  })

  test('24 小时制时间倒挂应抛错', () => {
    expect(() => cloud.computeBoardingAmount({
      ...base, endDate: '2026-09-05', mode: 'hourly24', startAt: '14:00', endAt: '10:00',
    })).toThrow(/结束时间必须晚于开始时间/)
  })

  test('日单价非法应抛错', () => {
    expect(() => cloud.computeBoardingAmount({ ...base, pricePerDay: 0, mode: 'hotel', startAt: '14:00', endAt: '10:00' }))
      .toThrow(/日单价必须为正数/)
  })
})

describe('寄养计费 · 双端一致性（云函数产物 vs 前端镜像）', () => {
  ALL_CASES.forEach(c => {
    test(c.name, () => {
      expect(front.computeBoardingAmount(c.input)).toEqual(cloud.computeBoardingAmount(c.input))
    })
  })

  test('默认兜底行为两端一致', () => {
    const input = { ...base, startAt: '14:00', endAt: '14:00' }
    expect(front.computeBoardingAmount(input)).toEqual(cloud.computeBoardingAmount(input))
  })
})
