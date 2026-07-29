/**
 * Sprint 47: orderService/index TypeScript 迁移测试
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const TS_DIR = path.join(ROOT, 'cloudfunctions', 'orderService')

function readFileSafe(p) { try { return fs.readFileSync(p, 'utf8') } catch (e) { return null } }
function fileExists(p) { try { return fs.existsSync(p) } catch (e) { return false } }

describe('Sprint 47: orderService/index TypeScript 迁移', () => {
  describe('1. 物理文件', () => {
    test('index.ts 存在', () => { expect(fileExists(path.join(TS_DIR, 'index.ts'))).toBe(true) })
    test('index.js 存在', () => { expect(fileExists(path.join(TS_DIR, 'index.js'))).toBe(true) })
  })

  describe('2. tsconfig include', () => {
    test('包含 cloudfunctions/orderService/index.ts', () => {
      const cfg = JSON.parse(readFileSafe(path.join(ROOT, 'tsconfig.orderService.json')))
      expect(cfg.include).toContain('cloudfunctions/orderService/index.ts')
    })
  })

  describe('3. 公共结构', () => {
    let code
    beforeAll(() => { code = readFileSafe(path.join(TS_DIR, 'index.ts')) })
    test('注释含 Sprint 47', () => { expect(code).toMatch(/Sprint\s*47/) })
    test('含 AuthLike / CloudEvent / CloudContext', () => {
      expect(code).toMatch(/export\s+interface\s+AuthLike\b/)
      expect(code).toMatch(/export\s+interface\s+CloudEvent\b/)
      expect(code).toMatch(/export\s+interface\s+CloudContext\b/)
    })
  })

  describe('4. 业务常量', () => {
    let code
    beforeAll(() => { code = readFileSafe(path.join(TS_DIR, 'index.ts')) })
    test('SUPPORTED_ACTIONS', () => {
      expect(code).toMatch(/export\s+const\s+SUPPORTED_ACTIONS/)
    })
    test('SUPPORTED_ACTIONS 包含 15 个 orders handler', () => {
      const ORDERS_ACTIONS = [
        'getOrders', 'createOrder', 'updateOrderStatus', 'cancelOrder', 'getOrderDetail',
        'getActivityOrders', 'getActivityOrderDetail', 'calculatePrice', 'checkDateAvailability',
        'getBoardingOrders', 'getBoardingOrderDetail', 'handleBoardingOrder', 'submitEvaluation',
        'getHostEvaluations', 'enrichOrders',
      ]
      ORDERS_ACTIONS.forEach(a => {
        expect(code).toMatch(new RegExp(`['"]${a}['"]`))
      })
    })
    test('SUPPORTED_ACTIONS 包含 2 个 stats handler', () => {
      const STATS_ACTIONS = ['getStats', 'getIncomeStats']
      STATS_ACTIONS.forEach(a => {
        expect(code).toMatch(new RegExp(`['"]${a}['"]`))
      })
    })
  })

  describe('5. handlers 聚合', () => {
    let code
    beforeAll(() => { code = readFileSafe(path.join(TS_DIR, 'index.ts')) })
    test('require orders 子服务', () => { expect(code).toMatch(/require\(['"]\.\/orders['"]\)/) })
    test('require stats 子服务', () => { expect(code).toMatch(/require\(['"]\.\/stats['"]\)/) })
    test('handlers 聚合 17 个 action', () => {
      // 检查 handlers 表内含 15+ orders 字段 + 2 stats 字段
      const handlerBlock = code.match(/export const handlers[\s\S]*?\n\}/)
      expect(handlerBlock).not.toBeNull()
      const block = handlerBlock[0]
      const ORDERS_ACTIONS = [
        'getOrders', 'createOrder', 'updateOrderStatus', 'cancelOrder', 'getOrderDetail',
        'getActivityOrders', 'getActivityOrderDetail', 'calculatePrice', 'checkDateAvailability',
        'getBoardingOrders', 'getBoardingOrderDetail', 'handleBoardingOrder', 'submitEvaluation',
        'getHostEvaluations', 'enrichOrders',
      ]
      ORDERS_ACTIONS.forEach(a => {
        expect(block).toMatch(new RegExp(`\\b${a}\\b`))
      })
      expect(block).toMatch(/getStats/)
      expect(block).toMatch(/getIncomeStats/)
    })
  })

  describe('6. 入口 main', () => {
    let code
    beforeAll(() => { code = readFileSafe(path.join(TS_DIR, 'index.ts')) })
    test('main 入口', () => { expect(code).toMatch(/export\s+async\s+function\s+main\b/) })
    test('main 按 action 分发到 handlers', () => { expect(code).toMatch(/const\s+handler\s*=\s*handlers\[action\]/) })
    test('main 注入 verifyAuth 鉴权（所有 action 都需要登录）', () => {
      expect(code).toMatch(/verifyAuth\(event,\s*\{/)
      expect(code).toMatch(/requireLogin\s*=\s*true/)
    })
    test('main 错误处理走 toResponse / handleError', () => {
      expect(code).toMatch(/toResponse\(/)
      expect(code).toMatch(/handleError\(/)
    })
  })

  describe('7. 业务流程', () => {
    let code
    beforeAll(() => { code = readFileSafe(path.join(TS_DIR, 'index.ts')) })
    test('Sprint 21 限流：initGlobalRateLimitFromDb', () => { expect(code).toMatch(/initGlobalRateLimitFromDb/) })
    test('使用 logger.warn 降级日志', () => {
      expect(code).toMatch(/logger\.warn\(['"]bootstrapRateLimit/)
    })
  })

  describe('8. Runtime shim', () => {
    let code
    beforeAll(() => { code = readFileSafe(path.join(TS_DIR, 'index.ts')) })
    test('_mod.exports', () => { expect(code).toMatch(/_mod\.exports\s*=\s*\{/) })
    test('export default', () => { expect(code).toMatch(/export\s+default\s+\{/) })
  })

  describe('9. package.json 注册', () => {
    let pkg
    beforeAll(() => { pkg = JSON.parse(readFileSafe(path.join(ROOT, 'package.json'))) })
    test('audit script', () => { expect(pkg.scripts['audit:s47-order-service-index-ts']).toBe('node scripts/audit-s47-order-service-index-ts.js') })
    test('audit strict', () => { expect(pkg.scripts['audit:s47-order-service-index-ts:strict']).toBe('node scripts/audit-s47-order-service-index-ts.js --strict') })
    test('ci:check 集成（统一 audit:all:strict 入口）', () => { expect(pkg.scripts['ci:check']).toMatch(/audit:all:strict/) })
  })

  describe('10. audit 脚本可运行', () => {
    test('audit:s47-order-service-index-ts 退出码 0', () => {
      execSync('node scripts/audit-s47-order-service-index-ts.js', { cwd: ROOT, stdio: 'pipe' })
    })
    test('audit:s47-order-service-index-ts:strict 退出码 0', () => {
      execSync('node scripts/audit-s47-order-service-index-ts.js --strict', { cwd: ROOT, stdio: 'pipe' })
    })
  })
})
