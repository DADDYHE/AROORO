/**
 * Sprint 46: couponExpiryCheck TypeScript 迁移测试
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const TS_DIR = path.join(ROOT, 'cloudfunctions', 'couponExpiryCheck')

function readFileSafe(p) { try { return fs.readFileSync(p, 'utf8') } catch (e) { return null } }
function fileExists(p) { try { return fs.existsSync(p) } catch (e) { return false } }

describe('Sprint 46: couponExpiryCheck TypeScript 迁移', () => {
  describe('1. 物理文件', () => {
    test('index.ts', () => { expect(fileExists(path.join(TS_DIR, 'index.ts'))).toBe(true) })
    test('index.js', () => { expect(fileExists(path.join(TS_DIR, 'index.js'))).toBe(true) })
  })

  describe('2. tsconfig', () => {
    test('include', () => {
      const cfg = JSON.parse(readFileSafe(path.join(ROOT, 'tsconfig.couponExpiryCheck.json')))
      expect(cfg.include).toContain('cloudfunctions/couponExpiryCheck/index.ts')
    })
  })

  describe('3. 业务类型', () => {
    let code
    beforeAll(() => { code = readFileSafe(path.join(TS_DIR, 'index.ts')) })
    test('CouponStatus 联合', () => {
      expect(code).toMatch(/export\s+type\s+CouponStatus\b/)
      expect(code).toMatch(/['"]unused['"]/)
      expect(code).toMatch(/['"]locked['"]/)
      expect(code).toMatch(/['"]used['"]/)
      expect(code).toMatch(/['"]expired['"]/)
    })
    test('UserCouponDoc', () => { expect(code).toMatch(/export\s+interface\s+UserCouponDoc\b/) })
    test('ExpiryCheckResult', () => { expect(code).toMatch(/export\s+interface\s+ExpiryCheckResult\b/) })
  })

  describe('4. 常量', () => {
    let code
    beforeAll(() => { code = readFileSafe(path.join(TS_DIR, 'index.ts')) })
    test('COLLECTION = user_coupons', () => { expect(code).toMatch(/export\s+const\s+COLLECTION\s*=\s*['"]user_coupons['"]/) })
    test('TARGET_STATUS = unused', () => { expect(code).toMatch(/export\s+const\s+TARGET_STATUS:.*=\s*['"]unused['"]/) })
    test('NEW_STATUS = expired', () => { expect(code).toMatch(/export\s+const\s+NEW_STATUS:.*=\s*['"]expired['"]/) })
  })

  describe('5. main 入口', () => {
    let code
    beforeAll(() => { code = readFileSafe(path.join(TS_DIR, 'index.ts')) })
    test('export async function main', () => { expect(code).toMatch(/export\s+async\s+function\s+main\b/) })
    test('where status=unused + endTime<now', () => {
      expect(code).toMatch(/status:\s*TARGET_STATUS/)
      expect(code).toMatch(/endTime:\s*_\.lt\(now\)/)
    })
    test('update to expired', () => {
      expect(code).toMatch(/status:\s*NEW_STATUS/)
      expect(code).toMatch(/updatedAt:\s*db\.serverDate\(\)/)
    })
    // H1: 循环分批更新，累计 totalUpdated 后返回
    test('返回 updatedCount（累计 totalUpdated）', () => { expect(code).toMatch(/updatedCount:\s*totalUpdated/) })
    test('H1: BATCH_LIMIT = 100', () => { expect(code).toMatch(/BATCH_LIMIT\s*=\s*100/) })
    test('H1: MAX_ROUNDS = 20', () => { expect(code).toMatch(/MAX_ROUNDS\s*=\s*20/) })
    test('H1: 循环分批 update', () => {
      expect(code).toMatch(/for\s*\(\s*let\s+round\s*=\s*0/)
      expect(code).toMatch(/updated\s*<\s*BATCH_LIMIT/)
    })
    // M1: locked 卡死券处理
    test('M1: STUCK_LOCKED_STATUS = locked', () => {
      expect(code).toMatch(/STUCK_LOCKED_STATUS.*=.*['"]locked['"]/)
    })
    test('M1: STUCK_LOCKED_DAYS = 7', () => {
      expect(code).toMatch(/STUCK_LOCKED_DAYS\s*=\s*7/)
    })
    test('M1: 阶段 2 处理逻辑', () => {
      expect(code).toMatch(/stuckThreshold/)
      expect(code).toMatch(/stuckLockedUpdated/)
    })
    test('M1: 清理关联字段', () => {
      expect(code).toMatch(/orderId:\s*['"]{2}/)
      expect(code).toMatch(/orderType:\s*['"]{2}/)
    })
    test('M1: 卡死券告警', () => {
      expect(code).toMatch(/coupon\.expiry\.stuck\.locked/)
    })
    // M3: 接入告警
    test('M3: recordAlert 接入', () => {
      expect(code).toMatch(/require\(['"]\.\/common\/alert['"]\)/)
      expect(code).toMatch(/recordAlert\(['"]critical['"]/)
    })
    // L2: 并发保护
    test('L2: 并发保护标志', () => {
      expect(code).toMatch(/_isRunning/)
      expect(code).toMatch(/if\s*\(\s*_isRunning\s*\)/)
    })
  })

  describe('6. Runtime shim', () => {
    let code
    beforeAll(() => { code = readFileSafe(path.join(TS_DIR, 'index.ts')) })
    test('_mod.exports', () => { expect(code).toMatch(/_mod\.exports\s*=\s*\{/) })
    test('export default', () => { expect(code).toMatch(/export\s+default\s+\{/) })
  })

  describe('7. package.json', () => {
    let pkg
    beforeAll(() => { pkg = JSON.parse(readFileSafe(path.join(ROOT, 'package.json'))) })
    test('audit', () => { expect(pkg.scripts['audit:s46-coupon-expiry-check-ts']).toBe('node scripts/audit-s46-coupon-expiry-check-ts.js') })
    test('ci:check', () => { expect(pkg.scripts['ci:check']).toMatch(/audit:all:strict/) })
  })

  describe('8. audit 脚本', () => {
    test('基础', () => { execSync('node scripts/audit-s46-coupon-expiry-check-ts.js', { cwd: ROOT, stdio: 'pipe' }) })
    test('strict', () => { execSync('node scripts/audit-s46-coupon-expiry-check-ts.js --strict', { cwd: ROOT, stdio: 'pipe' }) })
  })
})
