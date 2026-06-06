/**
 * Sprint 18: 业务代码 isBusinessError 类型守卫迁移验证
 *
 * 验证范围：
 *   1. orders.js / refund.js 业务代码使用 isBusinessError(e) && e.code === 'X' 模式
 *   2. DUPLICATE_KEY / RATE_LIMITED / RISK_REJECT 错误码透传
 *   3. 普通 Error 不应被误判为 BusinessError
 *   4. 业务代码导入 isBusinessError 正确
 *
 * 关键不变量：
 *   - `e.code === 'X'` 字符串判断 → `isBusinessError(e) && e.code === 'X'`
 *   - 透传 RATE_LIMITED / RISK_REJECT（限流 / 风控拒绝是保护性拦截）
 *   - DUPLICATE_KEY 在 db.add 唯一索引冲突时返回 duplicate=true
 */

const fs = require('fs')
const path = require('path')

const REFUND_TS = path.join(__dirname, '..', 'cloudfunctions', 'paymentService', 'services', 'refund.ts')
const REFUND_JS = path.join(__dirname, '..', 'cloudfunctions', 'paymentService', 'services', 'refund.js')
const ORDERS_JS = path.join(__dirname, '..', 'cloudfunctions', 'orderService', 'orders.js')
const ERRORS_JS = path.join(__dirname, '..', 'cloudfunctions', 'common', 'errors.js')

describe('Sprint 18: 业务代码 isBusinessError 迁移', () => {
  describe('静态检查 - 源码含 isBusinessError 调用', () => {
    test('refund.ts 应导入并使用 isBusinessError', () => {
      // Sprint 24: refund 已迁移到 TypeScript，源文件才是真值来源
      const src = fs.readFileSync(REFUND_TS, 'utf8')
      // 导入
      expect(src).toMatch(/import\s+\{[^}]*\bisBusinessError\b[^}]*\}/)
      expect(src).toMatch(/isBusinessError/)
      // 至少 2 处 isBusinessError(e) 守卫
      const matches = src.match(/isBusinessError\s*\(/g) || []
      expect(matches.length).toBeGreaterThanOrEqual(2)
    })

    test('refund.js 编译产物应保留 isBusinessError 引用', () => {
      // 编译产物是 tsc 输出，可能为 (0, errors_1.isBusinessError)(e) 形式
      // 验证"isBusinessError" 字符串至少出现 2 次（import + 调用）
      const src = fs.readFileSync(REFUND_JS, 'utf8')
      const occurrences = (src.match(/isBusinessError/g) || []).length
      expect(occurrences).toBeGreaterThanOrEqual(2)
    })

    test('orders.js 应导入并使用 isBusinessError', () => {
      const src = fs.readFileSync(ORDERS_JS, 'utf8')
      expect(src).toMatch(/isBusinessError/)
      const matches = src.match(/isBusinessError\s*\(/g) || []
      expect(matches.length).toBeGreaterThanOrEqual(2)
    })

    test('refund.js 不应残留裸 e.code === "X" 字符串判断', () => {
      const src = fs.readFileSync(REFUND_JS, 'utf8')
      // 匹配 "e.code === 'X'" 或 "e && e.code === 'X'" 模式
      // 排除 isBusinessError(e) && e.code === 'X' 形式
      const lines = src.split('\n')
      const violations = lines.filter(line => {
        const trimmed = line.trim()
        // 跳过注释行
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) return false
        // 跳过 isBusinessError 已经守卫的行
        if (line.includes('isBusinessError')) return false
        // 检查裸的 e && e.code === 'X' 模式
        return /e\s*&&\s*e\.code\s*===\s*['"]/.test(line)
      })
      expect(violations).toEqual([])
    })

    test('orders.js 不应残留裸 e.code === "X" 字符串判断', () => {
      const src = fs.readFileSync(ORDERS_JS, 'utf8')
      const lines = src.split('\n')
      const violations = lines.filter(line => {
        const trimmed = line.trim()
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) return false
        if (line.includes('isBusinessError')) return false
        return /e\s*&&\s*e\.code\s*===\s*['"]/.test(line)
      })
      expect(violations).toEqual([])
    })
  })

  describe('行为验证 - 业务代码使用 isBusinessError 后的语义', () => {
    const { BusinessError, isBusinessError, err } = require(ERRORS_JS)

    test('isBusinessError 正确识别 RATE_LIMITED', () => {
      const e = err('RATE_LIMITED', '请求过于频繁')
      expect(isBusinessError(e)).toBe(true)
      expect(isBusinessError(e) && e.code === 'RATE_LIMITED').toBe(true)
    })

    test('isBusinessError 正确识别 RISK_REJECT', () => {
      const e = err('RISK_REJECT', '请求被风控拒绝', { reasons: ['高频'] })
      expect(isBusinessError(e)).toBe(true)
      expect(isBusinessError(e) && e.code === 'RISK_REJECT').toBe(true)
    })

    test('isBusinessError 正确识别 DUPLICATE_KEY', () => {
      const e = err('DUPLICATE_KEY', '记录已存在', { _id: 'eval_123' })
      expect(isBusinessError(e)).toBe(true)
      expect(isBusinessError(e) && e.code === 'DUPLICATE_KEY').toBe(true)
    })

    test('普通 Error 不被误判为 BusinessError', () => {
      const e = new Error('plain')
      e.code = 'RATE_LIMITED'  // 模拟攻击者篡改 code
      // 即便 e.code 字符串相同，没有 isBusinessError 守卫会误判
      expect(isBusinessError(e)).toBe(false)
      // 关键：业务代码用 isBusinessError 后会正确拒绝
      expect(isBusinessError(e) && e.code === 'RATE_LIMITED').toBeFalsy()
    })

    test('mockdb add 抛 BusinessError DUPLICATE_KEY 时，isBusinessError 守卫命中', () => {
      // 模拟 mock db 的 unique index 冲突（改造后的 mock）
      const e = err('DUPLICATE_KEY', '记录已存在', { _id: 'eval_123' })
      // 业务代码 catch 块的判断逻辑
      const shouldReturnDuplicate = isBusinessError(e) && e.code === 'DUPLICATE_KEY'
      expect(shouldReturnDuplicate).toBe(true)
    })

    test('withRateLimit 抛 RATE_LIMITED 时，isBusinessError 守卫透传', () => {
      // 模拟限流模块抛错
      const e = err('RATE_LIMITED', 'RATE_LIMIT_TARGET:T1:5/60s', { remaining: 0 })
      // 业务代码应透传
      const shouldRethrow = isBusinessError(e) && e.code === 'RATE_LIMITED'
      expect(shouldRethrow).toBe(true)
    })
  })

  describe('回归验证 - RATE_LIMITED / RISK_REJECT 透传链', () => {
    const { BusinessError, isBusinessError, err, toResponse } = require(ERRORS_JS)

    test('RATE_LIMITED 透传到 toResponse 仍保持 code 标识', () => {
      const e = err('RATE_LIMITED', '限流', { remaining: 0 })
      // 业务代码：isBusinessError(e) && e.code === 'RATE_LIMITED' ? throw e : ...
      // withErrorHandling 捕获：instanceof BusinessError ? toResponse(e) : wrapUnknown
      // 注：errors.js 的 BusinessError 自身通过 toResponse
      const res = e.toResponse()
      expect(res.error.type).toBe('RATE_LIMITED')
      expect(res.data).toBeNull()
    })

    test('RISK_REJECT 透传到 toResponse 仍保持 code 标识', () => {
      const e = err('RISK_REJECT', '风控拒绝', { reasons: ['高频'] })
      const res = e.toResponse()
      expect(res.error.type).toBe('RISK_REJECT')
      expect(res.data).toBeNull()
    })

    test('isBusinessError 对 isBusinessError(e) 短路求值 - 普通 Error 不会触发 throw', () => {
      // 模拟风控模块自身抛普通 Error（如 db 故障）
      const e = new Error('db down')
      // 业务代码：isBusinessError(e) && e.code === 'RISK_REJECT' ? throw e : ...
      // 由于 isBusinessError(e) === false，整个表达式为 false，不会 throw
      const shouldRethrow = isBusinessError(e) && e.code === 'RISK_REJECT'
      expect(shouldRethrow).toBe(false)
      // 业务代码会进入降级路径（riskDecision = 'RISK_PASS'）
    })
  })
})
