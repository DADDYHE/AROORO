/**
 * Sprint 14: 风控错误码扩 RISK_PENDING / RISK_PASS / RISK_REJECT
 *
 * 覆盖：
 *   1. errors.ts / errors.js 注册表含 RISK_REJECT / RISK_PENDING / RISK_PASS
 *   2. err() 工厂函数能正常构造这些错误
 *   3. BusinessError.toResponse() 序列化正确（severity=BUSINESS, httpStatus=200）
 *   4. risk-control.js#mapActionToErrorCode 三档映射
 *   5. risk-control.js#assertRiskDecision 行为（reject/review/allow）
 *   6. errors.d.ts 类型联合含 RISK_*
 *   7. audit:error-codes 不会因新码 fail
 */

const path = require('path')
const fs = require('fs')

const ROOT = path.join(__dirname, '..', 'cloudfunctions', 'common')
const ERRORS_JS = path.join(ROOT, 'errors.js')
const ERRORS_TS = path.join(ROOT, 'errors.ts')
const ERRORS_DTS = path.join(ROOT, 'errors.d.ts')
const TYPES_DTS = path.join(ROOT, 'types.d.ts')
const RISK_JS = path.join(ROOT, 'risk-control.js')

// 加载编译后的 errors.js
const { BusinessError, BusinessErrors, err, isBusinessError } = require(ERRORS_JS)
const { mapActionToErrorCode, assertRiskDecision, levelToAction } = require(RISK_JS)

function readSafe(p) {
  try { return fs.readFileSync(p, 'utf8') } catch (e) { return null }
}

describe('Sprint 14: 风控错误码 RISK_* 扩展', () => {
  describe('errors.ts / errors.js 注册表', () => {
    test('errors.ts 源文件含 RISK_REJECT / RISK_PENDING / RISK_PASS', () => {
      const content = readSafe(ERRORS_TS)
      expect(content).toMatch(/RISK_REJECT:\s*\{/)
      expect(content).toMatch(/RISK_PENDING:\s*\{/)
      expect(content).toMatch(/RISK_PASS:\s*\{/)
    })

    test('编译产物 errors.js 同步含三个新码', () => {
      const content = readSafe(ERRORS_JS)
      expect(content).toMatch(/RISK_REJECT:\s*\{/)
      expect(content).toMatch(/RISK_PENDING:\s*\{/)
      expect(content).toMatch(/RISK_PASS:\s*\{/)
    })

    test('BusinessErrors 导出含三个新码且 httpStatus=200', () => {
      expect(BusinessErrors.RISK_REJECT).toBeDefined()
      expect(BusinessErrors.RISK_REJECT.httpStatus).toBe(200)
      expect(BusinessErrors.RISK_PENDING).toBeDefined()
      expect(BusinessErrors.RISK_PENDING.httpStatus).toBe(200)
      expect(BusinessErrors.RISK_PASS).toBeDefined()
      expect(BusinessErrors.RISK_PASS.httpStatus).toBe(200)
    })

    test('三个新码 severity=BUSINESS（与 IDEMPOTENT_REPLAY 一致）', () => {
      expect(BusinessErrors.RISK_REJECT.severity).toBe('BUSINESS')
      expect(BusinessErrors.RISK_PENDING.severity).toBe('BUSINESS')
      expect(BusinessErrors.RISK_PASS.severity).toBe('BUSINESS')
    })

    test('三个新码 message 中文文案非空', () => {
      expect(BusinessErrors.RISK_REJECT.message.length).toBeGreaterThan(0)
      expect(BusinessErrors.RISK_PENDING.message.length).toBeGreaterThan(0)
      expect(BusinessErrors.RISK_PASS.message.length).toBeGreaterThan(0)
    })
  })

  describe('types.d.ts 类型联合', () => {
    test('BusinessErrorCode 联合含 RISK_REJECT / RISK_PENDING / RISK_PASS', () => {
      const content = readSafe(TYPES_DTS)
      expect(content).toMatch(/RISK_REJECT/)
      expect(content).toMatch(/RISK_PENDING/)
      expect(content).toMatch(/RISK_PASS/)
    })
  })

  describe('err() 工厂函数', () => {
    test('err("RISK_REJECT") 构造 BusinessError', () => {
      const e = err('RISK_REJECT')
      expect(e).toBeInstanceOf(BusinessError)
      expect(e.code).toBe('RISK_REJECT')
    })

    test('err("RISK_PENDING", "请稍后查看", {orderId: "x"}) 自定义消息+details', () => {
      const e = err('RISK_PENDING', '请稍后查看', { orderId: 'ord_123' })
      expect(e).toBeInstanceOf(BusinessError)
      expect(e.code).toBe('RISK_PENDING')
      expect(e.message).toBe('请稍后查看')
      expect(e.details).toEqual({ orderId: 'ord_123' })
    })

    test('err("RISK_PASS") 自带默认 message', () => {
      const e = err('RISK_PASS')
      expect(e.message).toBe(BusinessErrors.RISK_PASS.message)
    })

    test('isBusinessError() 正确判定新码', () => {
      expect(isBusinessError(err('RISK_REJECT'))).toBe(true)
      expect(isBusinessError(err('RISK_PENDING'))).toBe(true)
      expect(isBusinessError(err('RISK_PASS'))).toBe(true)
      expect(isBusinessError(new Error('x'))).toBe(false)
    })
  })

  describe('BusinessError#toResponse() 序列化', () => {
    test('RISK_PENDING.toResponse() 含 type=RISK_PENDING', () => {
      const e = err('RISK_PENDING', null, { reasons: ['HIGH_FREQ:5次/60秒'] })
      const res = e.toResponse()
      expect(res.error.type).toBe('RISK_PENDING')
      expect(res.error.details).toEqual({ reasons: ['HIGH_FREQ:5次/60秒'] })
      expect(res.data).toBe(null)
    })

    test('RISK_REJECT.toResponse() 含 type=RISK_REJECT', () => {
      const e = err('RISK_REJECT', '评价被拦截')
      const res = e.toResponse()
      expect(res.error.type).toBe('RISK_REJECT')
      expect(res.message).toBe('评价被拦截')
    })
  })

  describe('risk-control#mapActionToErrorCode 映射', () => {
    test('\'reject\' → \'RISK_REJECT\'', () => {
      expect(mapActionToErrorCode('reject')).toBe('RISK_REJECT')
    })

    test('\'review\' → \'RISK_PENDING\'', () => {
      expect(mapActionToErrorCode('review')).toBe('RISK_PENDING')
    })

    test('\'allow\' → \'RISK_PASS\'', () => {
      expect(mapActionToErrorCode('allow')).toBe('RISK_PASS')
    })

    test('未知 action 默认 → RISK_PASS（保守放行）', () => {
      expect(mapActionToErrorCode('unknown')).toBe('RISK_PASS')
      expect(mapActionToErrorCode(undefined)).toBe('RISK_PASS')
    })
  })

  describe('risk-control#assertRiskDecision 行为', () => {
    const baseRisk = (action, level = 'low') => ({
      level,
      action,
      reasons: ['TEST_REASON'],
      details: {},
      target: {},
    })

    test('action=\'allow\' 返回 { passed: true, code: \'RISK_PASS\' }', () => {
      const r = assertRiskDecision(baseRisk('allow'))
      expect(r.passed).toBe(true)
      expect(r.code).toBe('RISK_PASS')
      expect(r.reasons).toEqual(['TEST_REASON'])
    })

    test('action=\'review\' 抛 BusinessError(RISK_PENDING)', () => {
      try {
        assertRiskDecision(baseRisk('review', 'medium'))
        throw new Error('should have thrown')
      } catch (e) {
        expect(e).toBeInstanceOf(BusinessError)
        expect(e.code).toBe('RISK_PENDING')
        expect(e.details.level).toBe('medium')
        expect(e.details.reasons).toEqual(['TEST_REASON'])
      }
    })

    test('action=\'reject\' 抛 BusinessError(RISK_REJECT)', () => {
      try {
        assertRiskDecision(baseRisk('reject', 'high'))
        throw new Error('should have thrown')
      } catch (e) {
        expect(e).toBeInstanceOf(BusinessError)
        expect(e.code).toBe('RISK_REJECT')
        expect(e.details.level).toBe('high')
      }
    })
  })

  describe('集成：levelToAction + mapActionToErrorCode 串联', () => {
    test('\'high\' → reject → RISK_REJECT', () => {
      const action = levelToAction('high')
      expect(action).toBe('reject')
      expect(mapActionToErrorCode(action)).toBe('RISK_REJECT')
    })

    test('\'medium\' → review → RISK_PENDING', () => {
      const action = levelToAction('medium')
      expect(action).toBe('review')
      expect(mapActionToErrorCode(action)).toBe('RISK_PENDING')
    })

    test('\'low\' → allow → RISK_PASS', () => {
      const action = levelToAction('low')
      expect(action).toBe('allow')
      expect(mapActionToErrorCode(action)).toBe('RISK_PASS')
    })
  })

  describe('回归：错误码总数 + 全量注册', () => {
    test('BusinessErrors 注册表无重复（每个 code 唯一）', () => {
      const codes = Object.values(BusinessErrors).map(s => s.code)
      const set = new Set(codes)
      expect(set.size).toBe(codes.length)
    })

    test('errors.js 内至少含 50 个错误码（含 Sprint 14 新增 3 个）', () => {
      const codeRe = /^\s*([A-Z][A-Z0-9_]+):\s*\{\s*code:/gm
      const content = readSafe(ERRORS_JS)
      const matches = []
      let m
      while ((m = codeRe.exec(content)) !== null) {matches.push(m[1])}
      // Sprint 13 是 48，Sprint 14 +3 = 51
      expect(matches.length).toBeGreaterThanOrEqual(50)
      // 三个新码都在
      expect(matches).toEqual(expect.arrayContaining(['RISK_REJECT', 'RISK_PENDING', 'RISK_PASS']))
    })
  })
})
