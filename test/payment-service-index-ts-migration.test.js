/**
 * Sprint 47: paymentService/index TypeScript 迁移测试
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const TS_DIR = path.join(ROOT, 'cloudfunctions', 'paymentService')

function readFileSafe(p) { try { return fs.readFileSync(p, 'utf8') } catch (e) { return null } }
function fileExists(p) { try { return fs.existsSync(p) } catch (e) { return false } }

describe('Sprint 47: paymentService/index TypeScript 迁移', () => {
  describe('1. 物理文件', () => {
    test('index.ts 存在', () => { expect(fileExists(path.join(TS_DIR, 'index.ts'))).toBe(true) })
    test('index.js 存在', () => { expect(fileExists(path.join(TS_DIR, 'index.js'))).toBe(true) })
  })

  describe('2. tsconfig include', () => {
    test('包含 cloudfunctions/paymentService/index.ts', () => {
      const cfg = JSON.parse(readFileSafe(path.join(ROOT, 'tsconfig.paymentService.json')))
      expect(cfg.include).toContain('cloudfunctions/paymentService/index.ts')
    })
  })

  describe('3. 公共结构', () => {
    let code
    beforeAll(() => { code = readFileSafe(path.join(TS_DIR, 'index.ts')) })
    test('注释含 Sprint 47', () => { expect(code).toMatch(/Sprint\s*47/) })
    test('含 AuthLike / CloudEvent / CloudContext', () => {
      expect(code).toMatch(/export\s+interface\s+AuthLike\b/)
      expect(code).toMatch(/(?:export\s+interface\s+CloudEvent\b|export\s+type\s+CloudEvent\b)/)
      expect(code).toMatch(/export\s+interface\s+CloudContext\b/)
    })
  })

  describe('4. 业务常量', () => {
    let code
    beforeAll(() => { code = readFileSafe(path.join(TS_DIR, 'index.ts')) })
    test('NO_AUTH_ACTIONS', () => {
      expect(code).toMatch(/export\s+const\s+NO_AUTH_ACTIONS/)
      expect(code).toMatch(/['"]paymentNotify['"]/)
    })
    test('SUPPORTED_ACTIONS 包含 6 个 action', () => {
      expect(code).toMatch(/export\s+const\s+SUPPORTED_ACTIONS/)
      const ACTIONS = ['createPayment', 'queryPayment', 'closePayment', 'confirmPayment', 'createRefund', 'queryRefund', 'paymentNotify']
      ACTIONS.forEach(a => {
        expect(code).toMatch(new RegExp(`['"]${a}['"]`))
      })
    })
  })

  describe('5. 工具函数', () => {
    let code
    beforeAll(() => { code = readFileSafe(path.join(TS_DIR, 'index.ts')) })
    test('isHttpRequest 判定头/body/action', () => {
      expect(code).toMatch(/export\s+function\s+isHttpRequest\b/)
      expect(code).toMatch(/event\.headers/)
      expect(code).toMatch(/event\.body/)
      expect(code).toMatch(/event\.action/)
    })
  })

  describe('6. handlers 聚合', () => {
    let code
    beforeAll(() => { code = readFileSafe(path.join(TS_DIR, 'index.ts')) })
    test('require pay 子服务', () => { expect(code).toMatch(/require\(['"]\.\/services\/pay['"]\)/) })
    test('require refund 子服务', () => { expect(code).toMatch(/require\(['"]\.\/services\/refund['"]\)/) })
    test('require notify 子服务', () => { expect(code).toMatch(/require\(['"]\.\/services\/notify['"]\)/) })
    test('handlers 聚合 spread 三个子服务', () => {
      // 第一个 spread 在 { 之后；后续 spread 在 , 之后（不需要前导 {）
      expect(code).toMatch(/\{\s*\.\.\.payHandlers/)
      expect(code).toMatch(/\.\.\.refundHandlers/)
      expect(code).toMatch(/\.\.\.notifyHandlers/)
    })
  })

  describe('7. 入口 main', () => {
    let code
    beforeAll(() => { code = readFileSafe(path.join(TS_DIR, 'index.ts')) })
    test('main 入口', () => { expect(code).toMatch(/export\s+async\s+function\s+main\b/) })
    test('main 调用 paymentNotify 处理 HTTP 触发', () => {
      expect(code).toMatch(/if\s*\(\s*isHttpRequest\(event\)\s*\)/)
      expect(code).toMatch(/handlers\.paymentNotify\(event,\s*context,\s*null\)/)
    })
    test('main 按 action 分发到 handlers', () => { expect(code).toMatch(/handlers\[action\]\(event,\s*context,\s*auth\)/) })
    test('main 注入 verifyAuth 鉴权', () => { expect(code).toMatch(/verifyAuth\(event,\s*\{/) })
    test('main 错误处理走 toResponse / handleError', () => {
      expect(code).toMatch(/toResponse\(/)
      expect(code).toMatch(/handleError\(/)
    })
  })

  describe('8. 业务流程', () => {
    let code
    beforeAll(() => { code = readFileSafe(path.join(TS_DIR, 'index.ts')) })
    test('Sprint 50 限流：bootstrapRateLimit strict 模式', () => {
      expect(code).toMatch(/bootstrapRateLimit/)
      expect(code).toMatch(/strict:\s*true/)
    })
    test('strict 失败时持久化告警 + 阻断服务', () => {
      expect(code).toMatch(/_bootstrapFailed/)
      expect(code).toMatch(/recordAlert/)
      expect(code).toMatch(/SERVICE_UNAVAILABLE/)
    })
  })

  describe('9. Runtime shim', () => {
    let code
    beforeAll(() => { code = readFileSafe(path.join(TS_DIR, 'index.ts')) })
    test('_mod.exports', () => { expect(code).toMatch(/_mod\.exports\s*=\s*\{/) })
    test('export default', () => { expect(code).toMatch(/export\s+default\s+\{/) })
  })

  describe('10. package.json 注册', () => {
    let pkg
    beforeAll(() => { pkg = JSON.parse(readFileSafe(path.join(ROOT, 'package.json'))) })
    test('audit script', () => { expect(pkg.scripts['audit:s47-payment-service-index-ts']).toBe('node scripts/audit-s47-payment-service-index-ts.js') })
    test('audit strict', () => { expect(pkg.scripts['audit:s47-payment-service-index-ts:strict']).toBe('node scripts/audit-s47-payment-service-index-ts.js --strict') })
    test('ci:check 集成（batch 入口）', () => { expect(pkg.scripts['ci:check']).toMatch(/audit:s47-batch-services-index-ts:strict/) })
  })

  describe('11. audit 脚本可运行', () => {
    test('audit:s47-payment-service-index-ts 退出码 0', () => {
      execSync('node scripts/audit-s47-payment-service-index-ts.js', { cwd: ROOT, stdio: 'pipe' })
    })
    test('audit:s47-payment-service-index-ts:strict 退出码 0', () => {
      execSync('node scripts/audit-s47-payment-service-index-ts.js --strict', { cwd: ROOT, stdio: 'pipe' })
    })
  })
})
