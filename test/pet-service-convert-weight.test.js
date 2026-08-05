/**
 * L2: petService convertWeight 单元测试
 *
 * 覆盖：
 *   1. null/undefined/空字符串 → null
 *   2. 字符串数字 → number
 *   3. 负数 / 0 → null
 *   4. NaN / Infinity → null
 *   5. 上下限校验（< 0.1kg / > 500kg → null）
 *   6. 小数精度（保留两位）
 *   7. 合法值（猫/狗/异宠常见体重）
 */

// convertWeight 是纯函数，无 db 依赖，可直接 require
// 但 index.ts 编译产物依赖 wx-server-sdk，需要 mock
jest.mock('wx-server-sdk', () => ({
  init: jest.fn(),
  getWXContext: () => ({ OPENID: 'oTest' }),
  DYNAMIC_CURRENT_ENV: 'mock-env',
  database: () => ({
    command: {},
    serverDate: () => new Date(),
    collection: () => ({
      doc: () => ({ get: async () => ({ data: null }), update: async () => ({ stats: { updated: 0 } }) }),
      where: () => ({ get: async () => ({ data: [] }), update: async () => ({ stats: { updated: 0 } }), count: async () => ({ total: 0 }) }),
      add: async () => ({ _id: 'test' }),
    }),
  }),
}))

const { convertWeight } = require('../cloudfunctions/petService/index.js')

describe('L2: petService convertWeight', () => {
  describe('空值与非法输入', () => {
    test('undefined → null', () => {
      expect(convertWeight(undefined)).toBeNull()
    })
    test('null → null', () => {
      expect(convertWeight(null)).toBeNull()
    })
    test('空字符串 → null', () => {
      expect(convertWeight('')).toBeNull()
    })
    // P3-B 修复后：非法数值显式抛错（不再静默返回 null），测试断言同步当前实现
    test('NaN 字符串 → 抛错', () => {
      expect(() => convertWeight('abc')).toThrow()
    })
    test('NaN 数字 → 抛错', () => {
      expect(() => convertWeight(NaN)).toThrow()
    })
    test('Infinity → 抛错', () => {
      expect(() => convertWeight(Infinity)).toThrow()
    })
    test('-Infinity → 抛错', () => {
      expect(() => convertWeight(-Infinity)).toThrow()
    })
  })

  describe('边界值校验（M7）', () => {
    test('0 → 抛错（非正数）', () => {
      expect(() => convertWeight(0)).toThrow()
    })
    test('负数 → 抛错', () => {
      expect(() => convertWeight(-5)).toThrow()
    })
    test('0.05 → 抛错（低于下限 0.1kg）', () => {
      expect(() => convertWeight(0.05)).toThrow()
    })
    test('501 → 抛错（超过上限 500kg）', () => {
      expect(() => convertWeight(501)).toThrow()
    })
    test('0.1 → 0.1（下限边界）', () => {
      expect(convertWeight(0.1)).toBe(0.1)
    })
    test('500 → 500（上限边界）', () => {
      expect(convertWeight(500)).toBe(500)
    })
  })

  describe('字符串数字转换', () => {
    test('"5" → 5', () => {
      expect(convertWeight('5')).toBe(5)
    })
    test('"5.5" → 5.5', () => {
      expect(convertWeight('5.5')).toBe(5.5)
    })
    test('"  10  " → 10（字符串前后空格不影响 Number 转换）', () => {
      expect(convertWeight('  10  ')).toBe(10)
    })
  })

  describe('小数精度（保留两位）', () => {
    test('5.555 → 5.56', () => {
      expect(convertWeight(5.555)).toBe(5.56)
    })
    test('5.554 → 5.55', () => {
      expect(convertWeight(5.554)).toBe(5.55)
    })
    test('3.14159 → 3.14', () => {
      expect(convertWeight(3.14159)).toBe(3.14)
    })
  })

  describe('合法业务值', () => {
    test('猫体重 2-10kg', () => {
      expect(convertWeight(2)).toBe(2)
      expect(convertWeight(5)).toBe(5)
      expect(convertWeight(10)).toBe(10)
    })
    test('狗体重 1-80kg', () => {
      expect(convertWeight(1)).toBe(1)
      expect(convertWeight(25)).toBe(25)
      expect(convertWeight(80)).toBe(80)
    })
    test('异宠体重 0.1-50kg', () => {
      expect(convertWeight(0.1)).toBe(0.1)
      expect(convertWeight(0.5)).toBe(0.5)
      expect(convertWeight(50)).toBe(50)
    })
  })
})
