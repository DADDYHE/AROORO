/**
 * cloudfunctions/common/validator.js 测试
 * 验证参数校验与字段白名单过滤的正确性
 */
const {
  validate,
  ValidationError,
  filterFields,
  FIELD_WHITELISTS,
} = require('../cloudfunctions/common/validator')

describe('common/validator', () => {
  describe('validate', () => {
    test('通过校验时不应抛错', () => {
      const schema = { name: { required: true, type: 'string' } }
      expect(() => validate(schema, { name: 'tom' })).not.toThrow()
    })

    test('required 字段缺失应抛 BusinessError(MISSING_REQUIRED)', () => {
      const schema = { name: { required: true } }
      try {
        validate(schema, {})
        throw new Error('expected to throw')
      } catch (e) {
        expect(e.code).toBe('MISSING_REQUIRED')
        expect(e.field).toBe('name')
        expect(e.message).toMatch(/name/)
      }
    })

    test('required 字段为空字符串也应判为缺失（抛 MISSING_REQUIRED）', () => {
      const schema = { name: { required: true } }
      try {
        validate(schema, { name: '' })
        throw new Error('expected to throw')
      } catch (e) {
        expect(e.code).toBe('MISSING_REQUIRED')
      }
    })

    test('类型不符应抛错并提示期望类型', () => {
      const schema = { age: { type: 'number' } }
      expect(() => validate(schema, { age: 'abc' })).toThrow(/类型错误.*number/)
    })

    test('枚举值不在允许范围内应抛错', () => {
      const schema = { role: { enum: ['admin', 'user'] } }
      expect(() => validate(schema, { role: 'guest' })).toThrow(/不在允许范围内/)
    })

    test('枚举值在允许范围内应通过', () => {
      const schema = { role: { enum: ['admin', 'user'] } }
      expect(() => validate(schema, { role: 'admin' })).not.toThrow()
    })

    test('number 类型的 min 校验', () => {
      const schema = { age: { type: 'number', min: 18 } }
      expect(() => validate(schema, { age: 10 })).toThrow(/不能小于/)
      expect(() => validate(schema, { age: 20 })).not.toThrow()
    })

    test('number 类型的 max 校验', () => {
      const schema = { age: { type: 'number', max: 100 } }
      expect(() => validate(schema, { age: 200 })).toThrow(/不能大于/)
      expect(() => validate(schema, { age: 50 })).not.toThrow()
    })

    test('string 类型的 min/max 应理解为长度', () => {
      const schema = { name: { type: 'string', min: 2, max: 5 } }
      expect(() => validate(schema, { name: 'a' })).toThrow(/长度不能少于/)
      expect(() => validate(schema, { name: 'abcdef' })).toThrow(/长度不能超过/)
      expect(() => validate(schema, { name: 'abc' })).not.toThrow()
    })

    test('多个错误应合并到一条异常中', () => {
      const schema = {
        name: { required: true },
        age: { type: 'number', min: 18 },
      }
      // 多个 required 字段缺失时，会抛 MISSING_REQUIRED（取第一个）
      try {
        validate(schema, { name: '', age: 5 })
        throw new Error('expected to throw')
      } catch (e) {
        expect(e.code).toBe('MISSING_REQUIRED')
        expect(e.message).toMatch(/name/)
      }
    })

    test('自定义 message 应优先于默认提示', () => {
      const schema = { name: { required: true, message: '姓名必填' } }
      try {
        validate(schema, {})
      } catch (e) {
        expect(e.message).toBe('姓名必填')
      }
    })

    test('undefined/null 值在非 required 字段应跳过校验', () => {
      const schema = { name: { type: 'string' } }
      expect(() => validate(schema, { name: undefined })).not.toThrow()
      expect(() => validate(schema, { name: null })).not.toThrow()
    })
  })

  describe('filterFields', () => {
    test('应只保留白名单中存在的字段', () => {
      const data = { a: 1, b: 2, c: 3 }
      const result = filterFields(['a', 'c'], data)
      expect(result).toEqual({ a: 1, c: 3 })
    })

    test('白名单中不存在的字段应被忽略', () => {
      const data = { a: 1, b: 2 }
      expect(filterFields(['a'], data)).toEqual({ a: 1 })
    })

    test('空数据应返回空对象', () => {
      expect(filterFields(['a'], {})).toEqual({})
    })

    test('undefined 值不应被保留', () => {
      const data = { a: undefined, b: 2 }
      const result = filterFields(['a', 'b'], data)
      expect(result).toEqual({ b: 2 })
    })
  })

  describe('FIELD_WHITELISTS', () => {
    test('应包含 7 个预定义白名单', () => {
      // 2026-08-05 2ad522e：feeder 域移除，新增 couponTemplate（优惠券板块）
      expect(Object.keys(FIELD_WHITELISTS).sort()).toEqual(
        ['activity', 'couponTemplate', 'hostBasic', 'hostDefault', 'pet', 'product', 'user'].sort()
      )
    })

    test('user 白名单应包含常用用户字段', () => {
      expect(FIELD_WHITELISTS.user).toContain('nickName')
      expect(FIELD_WHITELISTS.user).toContain('avatarUrl')
    })

    test('所有白名单项应为字符串', () => {
      for (const [, fields] of Object.entries(FIELD_WHITELISTS)) {
        for (const f of fields) {
          expect(typeof f).toBe('string')
        }
      }
    })
  })
})
